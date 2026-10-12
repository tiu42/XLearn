"""Nội dung khóa học (giảng viên): chủ đề (course_sections) và bài học (lessons).

- Xem: mọi giảng viên phụ trách (kể cả trợ giảng). Sửa: giảng viên chính, đồng giảng dạy, admin.
- Xóa chủ đề / bài học là xóa mềm (deleted_at): tiến độ, lượt làm bài của học viên vẫn được giữ.
- Bài video/pdf trỏ tới file đã upload xong (storage_objects 'ready'); bài đọc lưu Markdown, ảnh nhúng
  tham chiếu bằng ![…](file:<id>) và được đồng bộ vào lesson_files (purpose 'inline') mỗi lần lưu;
  tài liệu đính kèm là lesson_files (purpose 'attachment') theo thứ tự attachment_ids.
- Bài kiểm tra: tạo kèm dòng quizzes (cài đặt cơ bản); câu hỏi soạn ở màn soạn bài kiểm tra.
- File gắn vào bài phải thuộc khóa: upload vào khóa này (key courses/{id}/…) hoặc đang được bài khác
  của khóa dùng (file từ dữ liệu mẫu).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import require_course_instructor
from ..logging_utils import log_event
from ..models import Course, CourseSection, Lesson, LessonFile, Quiz, QuizQuestion, StorageObject, User
from ..schemas import (
    OrderIn,
    TeachContentOut,
    TeachLessonIn,
    TeachLessonOut,
    TeachLessonUpdate,
    TeachQuizIn,
    TeachQuizOut,
    TeachSectionIn,
    TeachSectionOut,
    TeachSectionUpdate,
)
from .teach_courses import can_edit, load_course, load_editable_course
from .teach_uploads import IMAGE_TYPES, PDF, VIDEO_TYPES, course_prefix, file_out

router = APIRouter(prefix="/teach/courses/{course_id}", tags=["instructor: content"])

_FORBIDDEN = "Trợ giảng không được sửa nội dung khóa học"
_IMAGE_REF = re.compile(r"\(file:(\d+)\)")
MEDIA_TYPES = ("video", "pdf")


def _editable(db: Session, user: User, course_id: int) -> Course:
    return load_editable_course(db, user, course_id, _FORBIDDEN)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# Đọc
# --------------------------------------------------------------------------- #
def _sections(db: Session, course_id: int) -> list[CourseSection]:
    return list(db.scalars(select(CourseSection)
                           .where(CourseSection.course_id == course_id, CourseSection.deleted_at.is_(None))
                           .order_by(CourseSection.sort_order, CourseSection.id)))


def _lessons(db: Session, course_id: int, section_id: int | None = None) -> list[Lesson]:
    stmt = (select(Lesson).where(Lesson.course_id == course_id, Lesson.deleted_at.is_(None))
            .options(selectinload(Lesson.media), selectinload(Lesson.quiz),
                     selectinload(Lesson.files).selectinload(LessonFile.storage_object))
            .order_by(Lesson.sort_order, Lesson.id))
    if section_id is not None:
        stmt = stmt.where(Lesson.section_id == section_id)
    return list(db.scalars(stmt))


def _question_counts(db: Session, lesson_ids: list[int]) -> dict[int, int]:
    if not lesson_ids:
        return {}
    return dict(db.execute(select(QuizQuestion.quiz_id, func.count(QuizQuestion.id))
                           .where(QuizQuestion.quiz_id.in_(lesson_ids)).group_by(QuizQuestion.quiz_id)).all())


def _lesson_out(lesson: Lesson, n_questions: int) -> TeachLessonOut:
    quiz = lesson.quiz
    return TeachLessonOut(
        id=lesson.id, section_id=lesson.section_id, lesson_type=lesson.lesson_type, title=lesson.title,
        description=lesson.description, content=lesson.content, estimated_minutes=lesson.estimated_minutes,
        status=lesson.status, media=file_out(lesson.media) if lesson.media else None,
        attachments=[file_out(f.storage_object) for f in lesson.files if f.purpose == "attachment"],
        images=[file_out(f.storage_object) for f in lesson.files if f.purpose == "inline"],
        quiz=TeachQuizOut(is_graded=quiz.is_graded, pass_score_percent=float(quiz.pass_score_percent),
                          time_limit_seconds=quiz.time_limit_seconds, max_attempts=quiz.max_attempts,
                          question_count=n_questions) if quiz else None,
        updated_at=lesson.updated_at,
    )


def _lesson_detail(db: Session, lesson: Lesson) -> TeachLessonOut:
    # Nạp lại sau commit, kèm file và cài đặt bài kiểm tra
    lesson = db.scalars(select(Lesson).where(Lesson.id == lesson.id).options(
        selectinload(Lesson.media), selectinload(Lesson.quiz),
        selectinload(Lesson.files).selectinload(LessonFile.storage_object))
        .execution_options(populate_existing=True)).one()
    return _lesson_out(lesson, _question_counts(db, [lesson.id]).get(lesson.id, 0))


@router.get("/content", response_model=TeachContentOut)
def get_content(
    course_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Chủ đề → bài học (kể cả bản nháp, chủ đề trống), kèm file và cài đặt bài kiểm tra."""
    course, my_role, is_admin = load_course(db, user, course_id)
    lessons = _lessons(db, course.id)
    counts = _question_counts(db, [x.id for x in lessons if x.lesson_type == "quiz"])
    by_section: dict[int, list[TeachLessonOut]] = {}
    for x in lessons:
        by_section.setdefault(x.section_id, []).append(_lesson_out(x, counts.get(x.id, 0)))
    return TeachContentOut(
        can_edit=can_edit(my_role, is_admin),
        sections=[TeachSectionOut(id=s.id, title=s.title, description=s.description,
                                  lessons=by_section.get(s.id, [])) for s in _sections(db, course.id)])


# --------------------------------------------------------------------------- #
# Chủ đề
# --------------------------------------------------------------------------- #
def _section_or_404(db: Session, course_id: int, section_id: int) -> CourseSection:
    section = db.get(CourseSection, section_id)
    if section is None or section.course_id != course_id or section.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chủ đề")
    return section


def _section_out(db: Session, section: CourseSection) -> TeachSectionOut:
    lessons = _lessons(db, section.course_id, section.id)
    counts = _question_counts(db, [x.id for x in lessons if x.lesson_type == "quiz"])
    return TeachSectionOut(id=section.id, title=section.title, description=section.description,
                           lessons=[_lesson_out(x, counts.get(x.id, 0)) for x in lessons])


def _next_order(db: Session, column, *where) -> int:
    return (db.scalar(select(func.max(column)).where(*where)) or 0) + 1


@router.post("/sections", response_model=TeachSectionOut, status_code=status.HTTP_201_CREATED)
def create_section(
    course_id: int,
    body: TeachSectionIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Thêm chủ đề vào cuối khóa."""
    _editable(db, user, course_id)
    section = CourseSection(course_id=course_id, title=body.title, description=body.description,
                            sort_order=_next_order(db, CourseSection.sort_order, CourseSection.course_id == course_id))
    db.add(section)
    db.commit()
    db.refresh(section)
    log_event("section_created", course_id=course_id, section_id=section.id, by=user.id)
    return _section_out(db, section)


@router.put("/sections/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder_sections(
    course_id: int,
    body: OrderIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    _editable(db, user, course_id)
    sections = {s.id: s for s in _sections(db, course_id)}
    _check_order(body.ids, sections)
    for i, sid in enumerate(body.ids):
        sections[sid].sort_order = i + 1
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/sections/{section_id}", response_model=TeachSectionOut)
def update_section(
    course_id: int,
    section_id: int,
    body: TeachSectionUpdate,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    _editable(db, user, course_id)
    section = _section_or_404(db, course_id, section_id)
    if body.title is not None:
        section.title = body.title
    if "description" in body.model_fields_set:
        section.description = body.description
    db.commit()
    return _section_out(db, section)


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    course_id: int,
    section_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Xóa mềm chủ đề cùng mọi bài trong đó."""
    _editable(db, user, course_id)
    section = _section_or_404(db, course_id, section_id)
    now = _now()
    section.deleted_at = now
    for lesson in _lessons(db, course_id, section.id):
        lesson.deleted_at = now
    db.commit()
    log_event("section_deleted", course_id=course_id, section_id=section_id, by=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/sections/{section_id}/lessons/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder_lessons(
    course_id: int,
    section_id: int,
    body: OrderIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    _editable(db, user, course_id)
    _section_or_404(db, course_id, section_id)
    lessons = {x.id: x for x in _lessons(db, course_id, section_id)}
    _check_order(body.ids, lessons)
    for i, lid in enumerate(body.ids):
        lessons[lid].sort_order = i + 1
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _check_order(ids: list[int], current: dict) -> None:
    if len(ids) != len(set(ids)) or set(ids) != set(current):
        raise HTTPException(422, detail="Danh sách sắp xếp không khớp với nội dung hiện tại. Hãy tải lại trang.")


# --------------------------------------------------------------------------- #
# Bài học
# --------------------------------------------------------------------------- #
def _lesson_or_404(db: Session, course_id: int, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None or lesson.course_id != course_id or lesson.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    return lesson


def _course_file(db: Session, course_id: int, object_id: int, allowed: set[str], what: str,
                 ) -> StorageObject:
    """File đã upload xong, thuộc khóa và đúng loại; sai → 422."""
    obj = db.get(StorageObject, object_id)
    in_course = obj is not None and (
        obj.object_key.startswith(course_prefix(course_id))
        or db.scalar(select(Lesson.id).outerjoin(LessonFile, LessonFile.lesson_id == Lesson.id)
                     .where(Lesson.course_id == course_id,
                            or_(Lesson.media_object_id == object_id, LessonFile.storage_object_id == object_id))
                     .limit(1)) is not None)
    if not in_course or obj.upload_status != "ready":
        raise HTTPException(422, detail=f"{what} không tồn tại hoặc chưa tải lên xong (file:{object_id})")
    if allowed and obj.content_type not in allowed:
        raise HTTPException(422, detail=f"{what} không đúng định dạng: {obj.original_filename or obj.id}")
    return obj


def _sync_files(db: Session, lesson: Lesson, attachment_ids: list[int] | None) -> None:
    """Đồng bộ lesson_files: ảnh nhúng lấy từ Markdown, tài liệu đính kèm theo attachment_ids.

    attachment_ids = None → giữ nguyên tài liệu đính kèm hiện có.
    """
    if attachment_ids is None:
        attachment_ids = [f.storage_object_id for f in lesson.files if f.purpose == "attachment"]
    if len(attachment_ids) != len(set(attachment_ids)):
        raise HTTPException(422, detail="Tài liệu đính kèm bị trùng")
    for oid in attachment_ids:
        _course_file(db, lesson.course_id, oid, set(), "Tài liệu đính kèm")

    inline: list[int] = []
    if lesson.lesson_type == "page":
        for m in _IMAGE_REF.finditer(lesson.content or ""):
            oid = int(m.group(1))
            if oid not in inline and oid not in attachment_ids:
                _course_file(db, lesson.course_id, oid, IMAGE_TYPES, "Ảnh trong bài đọc")
                inline.append(oid)

    db.execute(delete(LessonFile).where(LessonFile.lesson_id == lesson.id))
    db.add_all([LessonFile(lesson_id=lesson.id, storage_object_id=oid, purpose="attachment", sort_order=i)
                for i, oid in enumerate(attachment_ids)]
               + [LessonFile(lesson_id=lesson.id, storage_object_id=oid, purpose="inline", sort_order=i)
                  for i, oid in enumerate(inline)])
    db.flush()
    db.expire(lesson, ["files"])


def _apply_quiz(lesson: Lesson, settings: TeachQuizIn | None) -> None:
    if settings is None:
        return
    quiz = lesson.quiz
    quiz.is_graded = settings.is_graded
    quiz.pass_score_percent = settings.pass_score_percent
    quiz.time_limit_seconds = settings.time_limit_seconds
    quiz.max_attempts = settings.max_attempts


def _check_media(db: Session, lesson: Lesson) -> None:
    """ck_lessons_media: video/pdf bắt buộc có file đúng loại; bài đọc/bài kiểm tra không có file."""
    if lesson.lesson_type not in MEDIA_TYPES:
        lesson.media_object_id = None
        return
    if lesson.media_object_id is None:
        raise HTTPException(422, detail="Bài video cần file video" if lesson.lesson_type == "video"
                            else "Bài PDF cần file PDF")
    allowed = VIDEO_TYPES if lesson.lesson_type == "video" else {PDF}
    _course_file(db, lesson.course_id, lesson.media_object_id, allowed,
                 "File video" if lesson.lesson_type == "video" else "File PDF")


@router.post("/sections/{section_id}/lessons", response_model=TeachLessonOut, status_code=status.HTTP_201_CREATED,
             responses={422: {"description": "Thiếu file / file không hợp lệ"}})
def create_lesson(
    course_id: int,
    section_id: int,
    body: TeachLessonIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Thêm bài vào cuối chủ đề."""
    _editable(db, user, course_id)
    _section_or_404(db, course_id, section_id)
    lesson = Lesson(
        course_id=course_id, section_id=section_id, lesson_type=body.lesson_type, title=body.title,
        description=body.description, content=body.content if body.lesson_type == "page" else None,
        media_object_id=body.media_object_id, estimated_minutes=body.estimated_minutes, status=body.status,
        created_by=user.id,
        sort_order=_next_order(db, Lesson.sort_order, Lesson.section_id == section_id))
    _check_media(db, lesson)
    db.add(lesson)
    db.flush()
    if body.lesson_type == "quiz":
        db.add(Quiz(lesson_id=lesson.id))
        db.flush()
        db.refresh(lesson, ["quiz"])
        _apply_quiz(lesson, body.quiz or TeachQuizIn())
    _sync_files(db, lesson, body.attachment_ids)
    db.commit()
    log_event("lesson_created", course_id=course_id, lesson_id=lesson.id, by=user.id)
    return _lesson_detail(db, lesson)


@router.patch("/lessons/{lesson_id}", response_model=TeachLessonOut,
              responses={422: {"description": "Thiếu file / file không hợp lệ / đổi loại không được"}})
def update_lesson(
    course_id: int,
    lesson_id: int,
    body: TeachLessonUpdate,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    _editable(db, user, course_id)
    lesson = _lesson_or_404(db, course_id, lesson_id)
    fields = body.model_fields_set

    if body.lesson_type is not None and body.lesson_type != lesson.lesson_type:
        if "quiz" in (body.lesson_type, lesson.lesson_type):
            raise HTTPException(422, detail="Không đổi được loại giữa bài kiểm tra và bài học")
        lesson.lesson_type = body.lesson_type
    if body.section_id is not None and body.section_id != lesson.section_id:
        _section_or_404(db, course_id, body.section_id)
        lesson.section_id = body.section_id
        lesson.sort_order = _next_order(db, Lesson.sort_order, Lesson.section_id == body.section_id)
    for name in ("title", "status"):
        if getattr(body, name) is not None:
            setattr(lesson, name, getattr(body, name))
    for name in ("description", "content", "media_object_id", "estimated_minutes"):
        if name in fields:
            setattr(lesson, name, getattr(body, name))
    if lesson.lesson_type != "page":
        lesson.content = None
    _check_media(db, lesson)
    if lesson.lesson_type == "quiz":
        _apply_quiz(lesson, body.quiz)
    _sync_files(db, lesson, body.attachment_ids)
    db.commit()
    log_event("lesson_updated", course_id=course_id, lesson_id=lesson.id, by=user.id, fields=sorted(fields))
    return _lesson_detail(db, lesson)


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    course_id: int,
    lesson_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Xóa mềm: học viên không còn thấy bài; tiến độ, lượt làm bài vẫn giữ."""
    _editable(db, user, course_id)
    lesson = _lesson_or_404(db, course_id, lesson_id)
    lesson.deleted_at = _now()
    db.commit()
    log_event("lesson_deleted", course_id=course_id, lesson_id=lesson_id, by=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
