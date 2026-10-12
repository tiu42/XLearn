"""Khóa học của tôi: danh sách khóa user đang ghi danh, kèm tiến độ.

Ẩn ghi danh đã bị xóa (status 'removed'), khóa đã xóa mềm và khóa còn là bản nháp.
Tiến độ tính giống view v_enrollment_progress (chỉ đếm bài đã publish, chưa xóa mềm),
viết lại bằng ORM để chạy được cả trên SQLite khi test.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, Department, Enrollment, Lesson, LessonProgress, User
from ..schemas import DepartmentOut, MyCourseListOut, MyCourseOut, MyCourseSort, MyCourseStatus

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


def _lesson_counts():
    """Số bài đã publish của từng khóa."""
    return (select(Lesson.course_id, func.count(Lesson.id).label("total"))
            .where(Lesson.status == "published", Lesson.deleted_at.is_(None))
            .group_by(Lesson.course_id)
            .subquery())


def _user_progress(user_id: int):
    """Số bài đã hoàn thành + lần học gần nhất của user trong từng khóa."""
    return (select(Lesson.course_id,
                   func.sum(case((LessonProgress.status == "completed", 1), else_=0)).label("done"),
                   func.max(LessonProgress.updated_at).label("last_activity"))
            .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
            .where(LessonProgress.user_id == user_id,
                   Lesson.status == "published", Lesson.deleted_at.is_(None))
            .group_by(Lesson.course_id)
            .subquery())


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

    items = [
        MyCourseOut(
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
        for enrollment, course, n_total, n_done, last_activity in rows
    ]
    return {"items": items, "total": total,
            "departments": [DepartmentOut.model_validate(d) for d in departments]}
