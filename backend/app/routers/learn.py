"""Giao diện học: nội dung từng bài và ghi nhận tiến độ học của học viên.

Quyền xem bài giống trang khóa học: phải đang được ghi danh, bài đã publish, chủ đề chưa xóa mềm.
Khóa học tuần tự: bài trong chủ đề bị khóa trả 403 (kể cả khi gọi thẳng API, không qua giao diện).
Điều kiện hoàn thành bài nằm ở app/learning.py.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import get_current_user
from ..learning import MinPercent, ProgressUpdate, record_progress, rule_for
from ..models import Course, Enrollment, Lesson, LessonFile, LessonProgress, QuizQuestion, User
from ..schemas import (
    CompletionRuleOut,
    CourseProgressOut,
    LessonFileOut,
    LessonMediaOut,
    LessonProgressIn,
    LessonProgressOut,
    LessonProgressResultOut,
    LessonQuizInfoOut,
    MyLessonDetailOut,
)
from ..storage import file_url
from .my_courses import Outline, build_outline, get_enrollment_or_404

router = APIRouter(prefix="/me/courses/{course_id}/lessons", tags=["learner: learn"])

_NOT_FOUND = {404: {"description": "Không có bài học, bài chưa publish hoặc user không được ghi danh"}}
_LOCKED = {403: {"description": "Khóa học tuần tự, bài thuộc chủ đề chưa được mở"}}


def load_lesson(db: Session, user: User, course_id: int, lesson_id: int,
                 ) -> tuple[Enrollment, Course, Lesson, Outline]:
    enrollment, course = get_enrollment_or_404(db, user.id, course_id)
    outline = build_outline(db, course, user.id)
    section = outline.find_lesson(lesson_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    if section.locked:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="Chủ đề này đang bị khóa. Hãy hoàn thành các chủ đề trước để mở.")
    lesson = db.scalars(select(Lesson).where(Lesson.id == lesson_id).options(
        selectinload(Lesson.media), selectinload(Lesson.quiz),
        selectinload(Lesson.files).selectinload(LessonFile.storage_object))).one()
    return enrollment, course, lesson, outline


def progress_out(progress: LessonProgress | None) -> LessonProgressOut:
    if progress is None:
        return LessonProgressOut(status="not_started", progress_percent=0, last_position_seconds=None,
                                 last_page=None, time_spent_seconds=0, started_at=None, completed_at=None)
    return LessonProgressOut.model_validate(progress)


def _completion_out(lesson: Lesson) -> CompletionRuleOut:
    rule = rule_for(lesson)
    return CompletionRuleOut(code=rule.code, percent=rule.percent if isinstance(rule, MinPercent) else None)


@router.get("/{lesson_id}", response_model=MyLessonDetailOut, responses={**_NOT_FOUND, **_LOCKED})
def get_lesson(
    course_id: int,
    lesson_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Nội dung một bài: video/PDF (URL file), Markdown của bài đọc, tệp đính kèm, thông tin bài kiểm tra
    (không gồm câu hỏi) và tiến độ hiện tại. Chỉ đọc — mở bài được ghi nhận qua POST …/progress."""
    _, _, lesson, _ = load_lesson(db, user, course_id, lesson_id)

    media = lesson.media
    quiz = None
    if lesson.quiz is not None:
        q = lesson.quiz
        n_questions = db.scalar(select(func.count()).where(QuizQuestion.quiz_id == q.lesson_id))
        quiz = LessonQuizInfoOut(
            is_graded=q.is_graded, pass_score_percent=float(q.pass_score_percent),
            time_limit_seconds=q.time_limit_seconds, max_attempts=q.max_attempts, question_count=n_questions,
            review_policy=q.review_policy, opens_at=q.opens_at, closes_at=q.closes_at)
    progress = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id,
                                                      LessonProgress.lesson_id == lesson.id))
    return MyLessonDetailOut(
        id=lesson.id, course_id=lesson.course_id, section_id=lesson.section_id, title=lesson.title,
        description=lesson.description, lesson_type=lesson.lesson_type,
        estimated_minutes=lesson.estimated_minutes,
        content=lesson.content if lesson.lesson_type == "page" else None,
        media=LessonMediaOut(
            filename=media.original_filename, content_type=media.content_type, size_bytes=media.size_bytes,
            duration_seconds=media.duration_seconds, page_count=media.page_count, url=file_url(media),
        ) if media else None,
        files=[LessonFileOut(
            id=f.storage_object_id, filename=f.storage_object.original_filename,
            content_type=f.storage_object.content_type, size_bytes=f.storage_object.size_bytes,
            purpose=f.purpose, url=file_url(f.storage_object),
        ) for f in lesson.files if f.storage_object.upload_status == "ready"],
        quiz=quiz,
        completion=_completion_out(lesson),
        progress=progress_out(progress),
    )


@router.post("/{lesson_id}/progress", response_model=LessonProgressResultOut, responses={**_NOT_FOUND, **_LOCKED})
def report_progress(
    course_id: int,
    lesson_id: int,
    body: LessonProgressIn | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ghi nhận học viên đang học bài: lưu số liệu (vị trí video, trang PDF, % đã đọc, thời gian học)
    rồi áp quy tắc hoàn thành của loại bài. Gọi khi mở bài (body rỗng) và khi có số liệu mới.

    Bài đã hoàn thành thì giữ nguyên trạng thái. Hoàn thành mọi bài → ghi danh chuyển sang 'completed'.
    Trả kèm tiến độ khóa để giao diện cập nhật ngay.
    """
    enrollment, course, lesson, _ = load_lesson(db, user, course_id, lesson_id)
    progress = record_progress(db, user.id, lesson, ProgressUpdate(**(body or LessonProgressIn()).model_dump()))
    db.flush()
    course_progress = sync_course_progress(db, enrollment, course, user.id)
    db.commit()
    return LessonProgressResultOut(lesson_id=lesson.id, progress=progress_out(progress), course=course_progress)


def sync_course_progress(db: Session, enrollment: Enrollment, course: Course, user_id: int) -> CourseProgressOut:
    """Tiến độ khóa sau khi tiến độ bài thay đổi; hoàn thành mọi bài → ghi danh chuyển 'completed'.
    Chưa commit."""
    outline = build_outline(db, course, user_id)
    total, done = outline.total_lessons, outline.completed_lessons
    if enrollment.status == "active" and total and done == total:
        enrollment.status = "completed"
        enrollment.completed_at = datetime.now(timezone.utc)
    return CourseProgressOut(
        total_lessons=total, completed_lessons=done,
        progress_percent=round(100 * done / total, 2) if total else 0,
        enrollment_status=enrollment.status, completed_at=enrollment.completed_at)
