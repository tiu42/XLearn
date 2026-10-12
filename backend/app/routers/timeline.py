"""Dòng thời gian của học viên: giờ đóng bài kiểm tra và hạn hoàn thành khóa học.

Chỉ tính khóa đang học (ghi danh 'active'). Bài kiểm tra đã làm đạt (bài đã hoàn thành) không hiện nữa.
Bài kiểm tra vẫn hiện nhưng được đánh dấu khi nằm trong chủ đề chưa mở khóa (khóa tuần tự)
hoặc khi học viên đã dùng hết lượt làm mà chưa đạt.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, Enrollment, Lesson, LessonProgress, Quiz, QuizAttempt, User
from ..quiz import aware, utcnow
from ..schemas import TimelineItemOut, TimelineOut
from .my_courses import _base_query, _visible_lessons, build_outline

router = APIRouter(prefix="/me", tags=["learner: timeline"])


def _locked_lessons(db: Session, courses: list[Course], user_id: int) -> set[int]:
    """Id các bài nằm trong chủ đề còn bị khóa, chỉ xét khóa học tuần tự."""
    locked: set[int] = set()
    for course in courses:
        if course.is_sequential:
            for s in build_outline(db, course, user_id).sections:
                if s.locked:
                    locked.update(x.id for x in s.lessons)
    return locked


def _finished_attempts(db: Session, quiz_ids: list[int], user_id: int) -> dict[int, int]:
    """Số lượt đã nộp/hết giờ của từng bài kiểm tra."""
    if not quiz_ids:
        return {}
    return dict(db.execute(
        select(QuizAttempt.quiz_id, func.count(QuizAttempt.id))
        .where(QuizAttempt.user_id == user_id, QuizAttempt.quiz_id.in_(quiz_ids),
               QuizAttempt.status != "in_progress")
        .group_by(QuizAttempt.quiz_id)).all())


@router.get("/timeline", response_model=TimelineOut)
def get_timeline(
    days: int = Query(default=30, ge=1, le=366, description="Lấy các mốc trong N ngày tới"),
    overdue: bool = Query(default=False, description="true = các mốc đã qua mà chưa hoàn thành"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = utcnow()
    if overdue:
        def in_range(col):
            return col < now
    else:
        until = now + timedelta(days=days)

        def in_range(col):
            return and_(col >= now, col <= until)

    active = _base_query(user.id).where(Enrollment.status == "active")

    quiz_rows = db.execute(
        _visible_lessons(Lesson, Quiz, Course)
        .join(Quiz, Quiz.lesson_id == Lesson.id)
        .join(Course, Course.id == Lesson.course_id)
        .where(Course.id.in_(active.with_only_columns(Course.id)), in_range(Quiz.closes_at))
        .outerjoin(LessonProgress, (LessonProgress.lesson_id == Lesson.id) & (LessonProgress.user_id == user.id))
        .where(or_(LessonProgress.status.is_(None), LessonProgress.status != "completed"))).all()
    due_rows = db.execute(active.where(in_range(Enrollment.due_at))).all()

    locked = _locked_lessons(db, list({c.id: c for _, _, c in quiz_rows}.values()), user.id)
    finished = _finished_attempts(db, [lesson.id for lesson, _, _ in quiz_rows], user.id)

    # Đã nộp đủ max_attempts lượt thì không thể có lượt đang làm nữa → hết lượt
    items = [TimelineItemOut(kind="quiz", at=aware(quiz.closes_at), course_id=course.id, course_title=course.title,
                             is_mandatory=course.is_mandatory, lesson_id=lesson.id, title=lesson.title,
                             is_graded=quiz.is_graded, locked=lesson.id in locked,
                             out_of_attempts=quiz.max_attempts is not None
                             and finished.get(lesson.id, 0) >= quiz.max_attempts)
             for lesson, quiz, course in quiz_rows]
    items += [TimelineItemOut(kind="due", at=aware(e.due_at), course_id=c.id, course_title=c.title,
                              is_mandatory=c.is_mandatory, lesson_id=None, title="Hạn hoàn thành khóa học",
                              is_graded=None)
              for e, c in due_rows]
    items.sort(key=lambda x: (x.at, x.kind != "quiz", x.course_title))
    return TimelineOut(items=items)
