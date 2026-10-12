"""Quản lý khóa học (giảng viên): danh sách khóa phụ trách, tạo, xem, sửa thông tin và xóa mềm.

Quyền trên một khóa lấy từ course_instructors (đồng giảng dạy), admin được mọi quyền:
- owner, co_instructor: xem + sửa thông tin khóa
- assistant: chỉ xem
- xóa khóa: chỉ owner (và admin)
Người tạo khóa tự động là owner. Khóa đã xóa mềm (deleted_at) coi như không tồn tại;
mã khóa của khóa đã xóa vẫn bị giữ (ràng buộc UNIQUE trên courses.code).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import ADMIN, INSTRUCTOR, require_course_instructor, require_roles, role_codes
from ..logging_utils import log_event
from ..models import Course, CourseInstructor, CourseSection, Department, Enrollment, Lesson, User
from ..schemas import CourseStatus, TeachCourseCreate, TeachCourseListOut, TeachCourseOut, TeachCourseUpdate
from ..storage import file_url

router = APIRouter(prefix="/teach/courses", tags=["instructor: courses"])

EDITOR_ROLES = ("owner", "co_instructor")
_DUPLICATE_CODE = HTTPException(status.HTTP_409_CONFLICT, detail="Mã khóa học đã được sử dụng")
_NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")


@dataclass
class Stats:
    lessons: int = 0
    quizzes: int = 0
    learners: int = 0
    completed: int = 0


def _stats(db: Session, course_ids: list[int]) -> dict[int, Stats]:
    """Số bài học / bài kiểm tra (chưa xóa mềm, kể cả bản nháp) và số học viên của từng khóa."""
    result = {cid: Stats() for cid in course_ids}
    if not course_ids:
        return result
    is_quiz = Lesson.lesson_type == "quiz"
    for cid, n_lessons, n_quizzes in db.execute(
        select(Lesson.course_id, func.sum(case((is_quiz, 0), else_=1)), func.sum(case((is_quiz, 1), else_=0)))
        .join(CourseSection, CourseSection.id == Lesson.section_id)
        .where(Lesson.course_id.in_(course_ids), Lesson.deleted_at.is_(None), CourseSection.deleted_at.is_(None))
        .group_by(Lesson.course_id)
    ):
        result[cid].lessons, result[cid].quizzes = int(n_lessons), int(n_quizzes)
    for cid, n_learners, n_completed in db.execute(
        select(Enrollment.course_id, func.count(Enrollment.id),
               func.sum(case((Enrollment.status == "completed", 1), else_=0)))
        .where(Enrollment.course_id.in_(course_ids), Enrollment.status != "removed")
        .group_by(Enrollment.course_id)
    ):
        result[cid].learners, result[cid].completed = int(n_learners), int(n_completed)
    return result


def _out(course: Course, my_role: str | None, is_admin: bool, stats: Stats) -> TeachCourseOut:
    return TeachCourseOut(
        id=course.id, code=course.code, title=course.title,
        short_description=course.short_description, description=course.description,
        department=course.department, is_mandatory=course.is_mandatory, is_sequential=course.is_sequential,
        default_due_at=course.default_due_at, status=course.status, published_at=course.published_at,
        created_at=course.created_at, updated_at=course.updated_at,
        thumbnail_url=file_url(course.thumbnail),
        my_role=my_role,
        can_edit=can_edit(my_role, is_admin),
        can_delete=is_admin or my_role == "owner",
        lesson_count=stats.lessons, quiz_count=stats.quizzes,
        learner_count=stats.learners, completed_count=stats.completed,
    )


def _check_department(db: Session, department_id: int | None) -> None:
    if department_id is not None and db.get(Department, department_id) is None:
        raise HTTPException(422, detail="Phòng ban không tồn tại")


def _code_taken(db: Session, code: str, except_course_id: int | None = None) -> bool:
    stmt = select(Course.id).where(Course.code == code)
    if except_course_id is not None:
        stmt = stmt.where(Course.id != except_course_id)
    return db.scalars(stmt).first() is not None


def _set_status(course: Course, new_status: CourseStatus) -> None:
    course.status = new_status
    if new_status == "published" and course.published_at is None:
        course.published_at = datetime.now(timezone.utc)  # lần mở đầu tiên


def _commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:  # trùng mã khóa do race condition
        db.rollback()
        raise _DUPLICATE_CODE from None


def load_course(db: Session, user: User, course_id: int) -> tuple[Course, str | None, bool]:
    """Khóa chưa xóa mềm + vai trò của user trong khóa + user có phải admin.

    Quyền phụ trách đã được kiểm ở dependency require_course_instructor.
    """
    course = db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise _NOT_FOUND
    link = db.get(CourseInstructor, (course_id, user.id))
    return course, link.instructor_role if link else None, ADMIN in role_codes(user)


def can_edit(my_role: str | None, is_admin: bool) -> bool:
    return is_admin or my_role in EDITOR_ROLES


def load_editable_course(db: Session, user: User, course_id: int, detail: str) -> Course:
    """Như load_course nhưng chỉ cho giảng viên chính / đồng giảng dạy / admin (trợ giảng → 403)."""
    course, my_role, is_admin = load_course(db, user, course_id)
    if not can_edit(my_role, is_admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=detail)
    return course


def _detail(db: Session, course: Course, my_role: str | None, is_admin: bool) -> TeachCourseOut:
    return _out(course, my_role, is_admin, _stats(db, [course.id])[course.id])


@router.get("", response_model=TeachCourseListOut)
def list_courses(
    status_filter: CourseStatus | None = Query(default=None, alias="status", description="Bỏ trống = tất cả"),
    q: str | None = Query(default=None, max_length=100, description="Tìm theo tên hoặc mã khóa"),
    user: User = Depends(require_roles(INSTRUCTOR, ADMIN)),
    db: Session = Depends(get_db),
):
    """Khóa user phụ trách (admin: mọi khóa), khóa tạo gần nhất trước."""
    is_admin = ADMIN in role_codes(user)
    role_col = CourseInstructor.instructor_role
    stmt = (select(Course, role_col)
            .outerjoin(CourseInstructor, (CourseInstructor.course_id == Course.id)
                       & (CourseInstructor.user_id == user.id))
            .where(Course.deleted_at.is_(None)))
    if not is_admin:
        stmt = stmt.where(role_col.is_not(None))
    if status_filter:
        stmt = stmt.where(Course.status == status_filter)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Course.title.ilike(pattern), Course.code.ilike(pattern)))

    rows = db.execute(stmt.options(selectinload(Course.department), selectinload(Course.thumbnail))
                      .order_by(Course.created_at.desc(), Course.id.desc())).all()
    stats = _stats(db, [c.id for c, _ in rows])
    return {"items": [_out(c, role, is_admin, stats[c.id]) for c, role in rows], "total": len(rows)}


@router.post("", response_model=TeachCourseOut, status_code=status.HTTP_201_CREATED,
             responses={409: {"description": "Mã khóa học đã được sử dụng"}})
def create_course(
    body: TeachCourseCreate,
    user: User = Depends(require_roles(INSTRUCTOR, ADMIN)),
    db: Session = Depends(get_db),
):
    """Tạo khóa học; người tạo trở thành giảng viên phụ trách (owner)."""
    if _code_taken(db, body.code):
        raise _DUPLICATE_CODE
    _check_department(db, body.department_id)
    course = Course(**body.model_dump(exclude={"status"}), created_by=user.id)
    _set_status(course, body.status)
    db.add(course)
    try:
        db.flush()  # lấy course.id
    except IntegrityError:
        db.rollback()
        raise _DUPLICATE_CODE from None
    db.add(CourseInstructor(course_id=course.id, user_id=user.id, instructor_role="owner"))
    _commit_or_conflict(db)
    db.refresh(course)
    log_event("course_created", course_id=course.id, by=user.id)
    return _detail(db, course, "owner", ADMIN in role_codes(user))


@router.get("/{course_id}", response_model=TeachCourseOut,
            responses={403: {"description": "Không phụ trách khóa"}, 404: {"description": "Không có khóa"}})
def get_course(
    course_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    return _detail(db, *load_course(db, user, course_id))


@router.patch("/{course_id}", response_model=TeachCourseOut,
              responses={403: {"description": "Không có quyền sửa"}, 404: {"description": "Không có khóa"},
                         409: {"description": "Mã khóa học đã được sử dụng"}})
def update_course(
    course_id: int,
    body: TeachCourseUpdate,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    course, my_role, is_admin = load_course(db, user, course_id)
    if not can_edit(my_role, is_admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Trợ giảng không được sửa thông tin khóa học")

    fields = body.model_fields_set
    # Trường cho phép NULL: có gửi (kể cả null) mới đổi → xóa được giá trị
    for name in ("short_description", "description", "default_due_at"):
        if name in fields:
            setattr(course, name, getattr(body, name))
    if "department_id" in fields:
        _check_department(db, body.department_id)
        course.department_id = body.department_id
    # Trường NOT NULL: null = giữ nguyên
    if body.code is not None and body.code != course.code:
        if _code_taken(db, body.code, except_course_id=course.id):
            raise _DUPLICATE_CODE
        course.code = body.code
    for name in ("title", "is_mandatory", "is_sequential"):
        if getattr(body, name) is not None:
            setattr(course, name, getattr(body, name))
    if body.status is not None:
        _set_status(course, body.status)

    _commit_or_conflict(db)
    db.refresh(course)
    log_event("course_updated", course_id=course.id, by=user.id, fields=sorted(fields))
    return _detail(db, course, my_role, is_admin)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={403: {"description": "Chỉ giảng viên chính hoặc admin"},
                          404: {"description": "Không có khóa"}})
def delete_course(
    course_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Xóa mềm: khóa biến mất với cả giảng viên lẫn học viên, giữ lại bài học, ghi danh và tiến độ."""
    course, my_role, is_admin = load_course(db, user, course_id)
    if not (is_admin or my_role == "owner"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chỉ giảng viên chính được xóa khóa học")
    course.deleted_at = datetime.now(timezone.utc)
    db.commit()
    log_event("course_deleted", course_id=course.id, by=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
