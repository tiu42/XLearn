"""Khóa học của tôi: danh sách khóa user đang ghi danh và trang chi tiết từng khóa, kèm tiến độ.

Ẩn ghi danh đã bị xóa (status 'removed'), khóa đã xóa mềm và khóa còn là bản nháp.
Tiến độ tính giống view v_enrollment_progress (chỉ đếm bài đã publish, chưa xóa mềm),
viết lại bằng ORM để chạy được cả trên SQLite khi test. Khác view ở một điểm: bài nằm trong
chủ đề đã xóa mềm cũng không được tính, để số liệu khớp với danh sách chủ đề học viên nhìn thấy.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, CourseSection, Department, Enrollment, Lesson, LessonProgress, Quiz, User
from ..schemas import (
    DepartmentOut,
    MyCourseDetailOut,
    MyCourseListOut,
    MyCourseOut,
    MyCourseSort,
    MyCourseStatus,
    MyLessonOut,
    MySectionOut,
)

router = APIRouter(prefix="/me/courses", tags=["learner: courses"])

VISIBLE_COURSE_STATUSES = ("published", "archived")


def _base_query(user_id: int):
    """Ghi danh còn hiệu lực của user, join sẵn khóa học."""
    return (select(Enrollment, Course)
            .join(Course, Course.id == Enrollment.course_id)
            .where(Enrollment.user_id == user_id,
                   Enrollment.status != "removed",
                   Course.deleted_at.is_(None),
                   Course.status.in_(VISIBLE_COURSE_STATUSES)))


def _visible_lessons(*columns):
    """Bài học viên nhìn thấy: đã publish, chưa xóa mềm, chủ đề chứa nó cũng chưa xóa mềm."""
    return (select(*columns)
            .join(CourseSection, CourseSection.id == Lesson.section_id)
            .where(Lesson.status == "published", Lesson.deleted_at.is_(None),
                   CourseSection.deleted_at.is_(None)))


def _lesson_counts():
    """Số bài học viên nhìn thấy của từng khóa."""
    return (_visible_lessons(Lesson.course_id, func.count(Lesson.id).label("total"))
            .group_by(Lesson.course_id)
            .subquery())


def _user_progress(user_id: int):
    """Số bài đã hoàn thành + lần học gần nhất của user trong từng khóa."""
    return (_visible_lessons(Lesson.course_id,
                             func.sum(case((LessonProgress.status == "completed", 1), else_=0)).label("done"),
                             func.max(LessonProgress.updated_at).label("last_activity"))
            .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
            .where(LessonProgress.user_id == user_id)
            .group_by(Lesson.course_id)
            .subquery())


def _course_fields(enrollment: Enrollment, course: Course, n_total: int, n_done: int, last_activity) -> dict:
    """Các trường chung của MyCourseOut và MyCourseDetailOut."""
    return dict(
        id=course.id, code=course.code, title=course.title,
        short_description=course.short_description,
        department=course.department, is_mandatory=course.is_mandatory,
        thumbnail_url=None,  # TODO: ký URL từ storage_objects khi có module lưu trữ file
        course_status=course.status,
        enrollment_status=enrollment.status, enrolled_at=enrollment.enrolled_at,
        due_at=enrollment.due_at, completed_at=enrollment.completed_at,
        total_lessons=n_total, completed_lessons=n_done,
        progress_percent=round(100 * n_done / n_total, 2) if n_total else 0,
        last_activity_at=last_activity,
    )


@router.get("", response_model=MyCourseListOut)
def list_my_courses(
    status_filter: MyCourseStatus | None = Query(default=None, alias="status",
                                                 description="Bỏ trống = tất cả"),
    q: str | None = Query(default=None, max_length=100, description="Tìm theo tên hoặc mã khóa"),
    department_id: int | None = None,
    mandatory: bool | None = Query(default=None, description="true = bắt buộc, false = tự chọn"),
    sort: MyCourseSort = Query(default="title",
                               description="title: theo tên; recent: học gần nhất; due: hạn sớm nhất"),
    limit: int = Query(default=12, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = _base_query(user.id)
    departments = db.scalars(
        select(Department).where(Department.id.in_(base.with_only_columns(Course.department_id)))
        .order_by(Department.name)).all()

    stmt = base
    if status_filter:
        stmt = stmt.where(Enrollment.status == status_filter)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Course.title.ilike(pattern), Course.code.ilike(pattern)))
    if department_id is not None:
        stmt = stmt.where(Course.department_id == department_id)
    if mandatory is not None:
        stmt = stmt.where(Course.is_mandatory == mandatory)

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Enrollment.id).subquery()))

    counts, progress = _lesson_counts(), _user_progress(user.id)
    total_lessons = func.coalesce(counts.c.total, 0)
    done_lessons = func.coalesce(progress.c.done, 0)
    stmt = (stmt.add_columns(total_lessons, done_lessons, progress.c.last_activity)
            .outerjoin(counts, counts.c.course_id == Course.id)
            .outerjoin(progress, progress.c.course_id == Course.id))

    if sort == "recent":
        # Chưa học bài nào → dùng thời điểm ghi danh
        order = [func.coalesce(progress.c.last_activity, Enrollment.enrolled_at).desc()]
    elif sort == "due":
        order = [Enrollment.due_at.is_(None), Enrollment.due_at]  # không có hạn xếp cuối
    else:
        order = [Course.title]
    rows = db.execute(stmt.options(selectinload(Course.department))
                      .order_by(*order, Enrollment.id).limit(limit).offset(offset)).all()

    items = [MyCourseOut(**_course_fields(*row)) for row in rows]
    return {"items": items, "total": total,
            "departments": [DepartmentOut.model_validate(d) for d in departments]}


def _progress_status(n_done: int, n_started: int, n_total: int) -> str:
    if n_total and n_done == n_total:
        return "completed"
    return "in_progress" if n_started else "not_started"


@router.get("/{course_id}", response_model=MyCourseDetailOut,
            responses={404: {"description": "Không có khóa học hoặc user không (còn) được ghi danh"}})
def get_my_course(
    course_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trang khóa học: thông tin khóa, tiến độ và danh sách chủ đề → bài học của user.

    Chỉ trả chủ đề có ít nhất một bài học viên nhìn thấy. Nội dung bài (video, Markdown, câu hỏi)
    không có ở đây; giao diện học lấy riêng theo từng bài.
    """
    row = db.execute(_base_query(user.id).where(Course.id == course_id)
                     .options(selectinload(Course.department))).first()
    if row is None:
        # Cùng một thông báo cho "không tồn tại" và "không được ghi danh" → không lộ khóa học khác
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="Không tìm thấy khóa học hoặc bạn không được ghi danh vào khóa này")
    enrollment, course = row

    rows = db.execute(
        _visible_lessons(Lesson, CourseSection, LessonProgress.status, LessonProgress.updated_at,
                         Quiz.is_graded, Quiz.pass_score_percent)
        .outerjoin(LessonProgress, (LessonProgress.lesson_id == Lesson.id) & (LessonProgress.user_id == user.id))
        .outerjoin(Quiz, Quiz.lesson_id == Lesson.id)
        .where(Lesson.course_id == course.id)
        .order_by(CourseSection.sort_order, CourseSection.id, Lesson.sort_order, Lesson.id)).all()

    sections: dict[int, MySectionOut] = {}
    final_pass = last_activity = None
    for lesson, section, progress_status, updated_at, is_graded, pass_percent in rows:
        if section.id not in sections:
            sections[section.id] = MySectionOut(
                id=section.id, title=section.title, description=section.description,
                total_lessons=0, completed_lessons=0, status="not_started", locked=False, lessons=[])
        sections[section.id].lessons.append(MyLessonOut(
            id=lesson.id, title=lesson.title, lesson_type=lesson.lesson_type,
            estimated_minutes=lesson.estimated_minutes, status=progress_status or "not_started"))
        if is_graded:
            final_pass = float(pass_percent)  # bài tính điểm đứng sau cùng = bài kiểm tra cuối khóa
        if updated_at and (last_activity is None or updated_at > last_activity):
            last_activity = updated_at

    # Khóa tuần tự: từ chủ đề chưa hoàn thành đầu tiên, các chủ đề sau đều bị khóa
    blocked = False
    for s in sections.values():
        s.total_lessons = len(s.lessons)
        s.completed_lessons = sum(x.status == "completed" for x in s.lessons)
        started = sum(x.status != "not_started" for x in s.lessons)
        s.status = _progress_status(s.completed_lessons, started, s.total_lessons)
        s.locked = blocked
        if course.is_sequential and s.status != "completed":
            blocked = True

    n_total = sum(s.total_lessons for s in sections.values())
    n_done = sum(s.completed_lessons for s in sections.values())
    return MyCourseDetailOut(
        **_course_fields(enrollment, course, n_total, n_done, last_activity),
        description=course.description, is_sequential=course.is_sequential,
        final_pass_percent=final_pass, sections=list(sections.values()),
    )
