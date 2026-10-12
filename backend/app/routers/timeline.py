"""Dòng thời gian của học viên: giờ đóng bài kiểm tra và hạn hoàn thành khóa học.

Chỉ tính khóa đang học (ghi danh 'active'). Bài kiểm tra đã làm đạt (bài đã hoàn thành) không hiện nữa.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, Enrollment, Lesson, LessonProgress, Quiz, User
from ..quiz import aware, utcnow
from ..schemas import TimelineItemOut, TimelineOut
from .my_courses import _base_query, _visible_lessons

router = APIRouter(prefix="/me", tags=["learner: timeline"])


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

    items = [TimelineItemOut(kind="quiz", at=aware(quiz.closes_at), course_id=course.id, course_title=course.title,
                             is_mandatory=course.is_mandatory, lesson_id=lesson.id, title=lesson.title,
                             is_graded=quiz.is_graded)
             for lesson, quiz, course in quiz_rows]
    items += [TimelineItemOut(kind="due", at=aware(e.due_at), course_id=c.id, course_title=c.title,
                              is_mandatory=c.is_mandatory, lesson_id=None, title="Hạn hoàn thành khóa học",
                              is_graded=None)
              for e, c in due_rows]
    items.sort(key=lambda x: (x.at, x.kind != "quiz", x.course_title))
    return TimelineOut(items=items)
