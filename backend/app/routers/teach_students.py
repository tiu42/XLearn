"""Học viên (giảng viên): danh sách mọi học viên kèm số liệu học tập, chi tiết một học viên,
thêm học viên vào nhiều khóa cùng lúc.

Số liệu chỉ tính các khóa user đang xem phụ trách (admin: mọi khóa chưa xóa mềm). Danh sách gồm
mọi tài khoản có vai trò học viên để giảng viên chọn người ghi danh. Xóa khỏi khóa / đổi hạn
dùng API học viên trong khóa (/teach/courses/{id}/learners).
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import teach_stats
from ..db import get_db
from ..deps import ADMIN, INSTRUCTOR, require_roles, role_codes
from ..logging_utils import log_event
from ..models import Course, CourseInstructor, User
from ..schemas import (
    EnrollCoursesIn,
    EnrollResultOut,
    StudentCourseOut,
    StudentQuizOut,
    StudentSectionOut,
    TeachStudentDetailOut,
    TeachStudentListOut,
    TeachStudentOut,
    TeachStudentSummaryOut,
)
from .teach_courses import can_edit
from .teach_learners import commit_or_conflict

router = APIRouter(prefix="/teach/students", tags=["instructor: students"])

_NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học viên")


def _my_courses(db: Session, user: User) -> dict[int, tuple[Course, bool]]:
    """Khóa chưa xóa mềm user phụ trách (admin: mọi khóa) → (khóa, được sửa học viên)."""
    is_admin = ADMIN in role_codes(user)
    stmt = (select(Course, CourseInstructor.instructor_role)
            .outerjoin(CourseInstructor, (CourseInstructor.course_id == Course.id)
                       & (CourseInstructor.user_id == user.id))
            .where(Course.deleted_at.is_(None))
            .order_by(Course.title, Course.id))
    if not is_admin:
        stmt = stmt.where(CourseInstructor.instructor_role.is_not(None))
    return {c.id: (c, can_edit(role, is_admin)) for c, role in db.execute(stmt)}


def _load_student(db: Session, student_id: int) -> User:
    student = db.scalars(select(User).where(User.id == student_id, User.id.in_(teach_stats.student_ids_query()))
                         .options(selectinload(User.department))).first()
    if student is None:
        raise _NOT_FOUND
    return student


@router.get("", response_model=TeachStudentListOut)
def list_students(
    user: User = Depends(require_roles(INSTRUCTOR, ADMIN)),
    db: Session = Depends(get_db),
):
    """Mọi học viên (sắp theo tên) kèm số khóa đã ghi danh, đã hoàn thành, tiến độ trung bình và
    lần học gần nhất trong các khóa user phụ trách."""
    courses = _my_courses(db, user)
    students = db.scalars(select(User).where(User.id.in_(teach_stats.student_ids_query()))
                          .options(selectinload(User.department)).order_by(User.full_name, User.id)).all()
    enrollments = teach_stats.active_enrollments(db, course_ids=list(courses))
    progress = teach_stats.enrollment_progress(db, enrollments, teach_stats.course_outlines(db, list(courses)))
    by_user = defaultdict(list)
    for e in enrollments:
        by_user[e.user_id].append(progress[e.id])

    items = []
    for s in students:
        rows = by_user[s.id]
        items.append(TeachStudentOut(
            id=s.id, full_name=s.full_name, employee_code=s.employee_code, email=s.email,
            department=s.department, status=s.status,
            course_count=len(rows), completed_count=sum(p.status == "completed" for p in rows),
            avg_progress_percent=round(sum(p.percent for p in rows) / len(rows), 2) if rows else 0,
            last_activity_at=max((p.last_activity for p in rows if p.last_activity), default=None)))
    return TeachStudentListOut(items=items, total=len(items), summary=TeachStudentSummaryOut(
        student_count=len(items),
        enrollment_count=sum(x.course_count for x in items),
        completed_count=sum(x.completed_count for x in items),
        not_started_count=sum(x.course_count > 0 and x.last_activity_at is None for x in items)))


@router.get("/{student_id}", response_model=TeachStudentDetailOut,
            responses={404: {"description": "Không có học viên"}})
def get_student(
    student_id: int,
    user: User = Depends(require_roles(INSTRUCTOR, ADMIN)),
    db: Session = Depends(get_db),
):
    """Thông tin học viên và tiến độ ở từng khóa user phụ trách: theo chủ đề và các bài kiểm tra."""
    student = _load_student(db, student_id)
    courses = _my_courses(db, user)
    enrollments = teach_stats.active_enrollments(db, course_ids=list(courses), user_id=student.id)
    outlines = teach_stats.course_outlines(db, [e.course_id for e in enrollments])
    progress = teach_stats.enrollment_progress(db, enrollments, outlines)

    out = []
    for e in sorted(enrollments, key=lambda e: e.enrolled_at, reverse=True):
        course, editable = courses[e.course_id]
        p = progress[e.id]
        sections: dict[int, StudentSectionOut] = {}
        for x in p.outline.lessons:
            s = sections.setdefault(x.section.id, StudentSectionOut(
                id=x.section.id, title=x.section.title, total_lessons=0, completed_lessons=0))
            s.total_lessons += 1
            s.completed_lessons += x.lesson.id in p.completed
        quizzes = []
        for x in p.outline.quizzes:
            a = p.attempts.get(x.lesson.id) or teach_stats.AttemptStats()
            quizzes.append(StudentQuizOut(
                lesson_id=x.lesson.id, title=x.lesson.title, is_graded=x.quiz.is_graded,
                pass_score_percent=float(x.quiz.pass_score_percent), max_attempts=x.quiz.max_attempts,
                attempts_used=a.used, best_score_percent=a.best_percent, passed=a.passed,
                last_submitted_at=a.last_submitted_at))
        out.append(StudentCourseOut(
            course_id=course.id, code=course.code, title=course.title, is_mandatory=course.is_mandatory,
            course_status=course.status, can_edit=editable,
            sections=list(sections.values()), quizzes=quizzes, **p.out_fields()))

    return TeachStudentDetailOut(
        id=student.id, full_name=student.full_name, employee_code=student.employee_code, email=student.email,
        department=student.department, status=student.status, last_login_at=student.last_login_at, courses=out)


@router.post("/{student_id}/courses", response_model=EnrollResultOut,
             responses={403: {"description": "Không được quản lý học viên ở một trong các khóa"},
                        404: {"description": "Không có học viên hoặc khóa"},
                        409: {"description": "Trùng do thao tác đồng thời"},
                        422: {"description": "Tài khoản không phải học viên đang hoạt động"}})
def enroll_student(
    student_id: int,
    body: EnrollCoursesIn,
    user: User = Depends(require_roles(INSTRUCTOR, ADMIN)),
    db: Session = Depends(get_db),
):
    """Thêm một học viên vào nhiều khóa. Mọi khóa phải do user phụ trách với quyền sửa (không phải
    trợ giảng), nếu không thì không thêm vào khóa nào."""
    student = _load_student(db, student_id)
    teach_stats.check_learners(db, {student.id})
    courses = _my_courses(db, user)
    added = skipped = 0
    for cid in sorted(set(body.course_ids)):
        if cid not in courses:
            raise HTTPException(status.HTTP_404_NOT_FOUND,
                                detail="Không tìm thấy khóa học hoặc bạn không phụ trách khóa học này")
        course, editable = courses[cid]
        if not editable:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                detail=f"Trợ giảng không được quản lý học viên của khóa “{course.title}”")
        a, s = teach_stats.enroll(db, course, {student.id}, body.due_at, user)
        added, skipped = added + a, skipped + s
    commit_or_conflict(db)
    log_event("student_enrolled", user_id=student.id, by=user.id, added=added, skipped=skipped)
    return EnrollResultOut(added=added, skipped=skipped)
