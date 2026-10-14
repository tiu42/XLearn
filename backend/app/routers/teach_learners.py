"""Thông số khóa học & học viên trong khóa (giảng viên): số liệu tổng hợp, tiến độ từng học viên,
thêm / đổi hạn / xóa học viên.

Quyền như quản lý khóa: giảng viên chính, đồng giảng dạy và admin được thêm/xóa học viên;
trợ giảng chỉ xem. Xóa học viên = enrollments.status 'removed' (giữ tiến độ, điểm); thêm lại
dùng chính bản ghi đó.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import teach_stats
from ..db import get_db
from ..deps import require_course_instructor
from ..logging_utils import log_event
from ..models import Enrollment, User
from ..schemas import (
    CourseFinalQuizOut,
    CourseLearnerOut,
    CourseStatsLessonOut,
    CourseStatsOut,
    CourseStatsSummaryOut,
    EnrollLearnersIn,
    EnrollResultOut,
    LearnerCandidateListOut,
    LearnerUpdateIn,
    LearnerUserOut,
)
from .teach_courses import can_edit, load_course, load_editable_course

router = APIRouter(prefix="/teach/courses/{course_id}", tags=["instructor: learners"])

_ASSISTANT = "Trợ giảng không được quản lý học viên"
_NOT_ENROLLED = HTTPException(status.HTTP_404_NOT_FOUND, detail="Học viên không có trong khóa học")
_CONFLICT = HTTPException(status.HTTP_409_CONFLICT, detail="Danh sách học viên vừa thay đổi, vui lòng thử lại")


def commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:  # hai người cùng thêm một học viên (uq_enrollments_course_user)
        db.rollback()
        raise _CONFLICT from None


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


@router.get("/stats", response_model=CourseStatsOut,
            responses={403: {"description": "Không phụ trách khóa"}, 404: {"description": "Không có khóa"}})
def course_stats(
    course_id: int,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Thông số khóa: tổng hợp, tỉ lệ hoàn thành từng bài và tiến độ từng học viên (ghi danh cũ nhất trước)."""
    course, my_role, is_admin = load_course(db, user, course_id)
    outline = teach_stats.course_outlines(db, [course.id])[course.id]
    enrollments = teach_stats.active_enrollments(db, course_ids=[course.id])
    progress = teach_stats.enrollment_progress(db, enrollments, {course.id: outline})
    rows = [progress[e.id] for e in enrollments]

    by_status = {s: sum(p.status == s for p in rows) for s in ("completed", "in_progress", "not_started")}
    finals = [p.final.best_percent for p in rows if p.final]
    final = outline.final_quiz
    return CourseStatsOut(
        can_edit=can_edit(my_role, is_admin),
        summary=CourseStatsSummaryOut(
            learner_count=len(rows), completed_count=by_status["completed"],
            in_progress_count=by_status["in_progress"], not_started_count=by_status["not_started"],
            avg_progress_percent=_avg([p.percent for p in rows]) or 0,
            final_taken_count=len(finals), final_avg_score_percent=_avg(finals)),
        lessons=[CourseStatsLessonOut(
            id=x.lesson.id, title=x.lesson.title, lesson_type=x.lesson.lesson_type, section_title=x.section.title,
            completed_count=sum(x.lesson.id in p.completed for p in rows)) for x in outline.lessons],
        final_quiz=CourseFinalQuizOut(lesson_id=final.lesson.id, title=final.lesson.title,
                                      pass_score_percent=float(final.quiz.pass_score_percent)) if final else None,
        learners=[CourseLearnerOut(user=LearnerUserOut.model_validate(p.enrollment.user), **p.out_fields())
                  for p in rows],
    )


@router.get("/learners/candidates", response_model=LearnerCandidateListOut,
            responses={403: {"description": "Không phụ trách khóa"}, 404: {"description": "Không có khóa"}})
def learner_candidates(
    course_id: int,
    q: str | None = Query(default=None, max_length=100, description="Tìm theo tên, mã NV hoặc email"),
    department_id: int | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Học viên đang hoạt động chưa có trong khóa (kể cả người từng bị xóa), sắp theo tên."""
    load_course(db, user, course_id)
    enrolled = select(Enrollment.user_id).where(Enrollment.course_id == course_id, Enrollment.status != "removed")
    stmt = select(User).where(User.status == "active", User.id.in_(teach_stats.student_ids_query()),
                              User.id.not_in(enrolled))
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(pattern), User.employee_code.ilike(pattern),
                              User.email.ilike(pattern)))
    if department_id is not None:
        stmt = stmt.where(User.department_id == department_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.options(selectinload(User.department))
                       .order_by(User.full_name, User.id).limit(limit)).all()
    return {"items": items, "total": total}


@router.post("/learners", response_model=EnrollResultOut,
             responses={403: {"description": "Trợ giảng / không phụ trách"}, 404: {"description": "Không có khóa"},
                        409: {"description": "Trùng do thao tác đồng thời"},
                        422: {"description": "Tài khoản không phải học viên đang hoạt động"}})
def add_learners(
    course_id: int,
    body: EnrollLearnersIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Thêm học viên vào khóa. Người đã có trong khóa được bỏ qua (đếm ở `skipped`)."""
    course = load_editable_course(db, user, course_id, _ASSISTANT)
    user_ids = set(body.user_ids)
    teach_stats.check_learners(db, user_ids)
    added, skipped = teach_stats.enroll(db, course, user_ids, body.due_at, user)
    commit_or_conflict(db)
    log_event("learners_added", course_id=course.id, by=user.id, added=added, skipped=skipped)
    return EnrollResultOut(added=added, skipped=skipped)


def _enrollments_or_404(db: Session, course_id: int, user_ids: set[int]) -> list[Enrollment]:
    rows = list(db.scalars(select(Enrollment).where(Enrollment.course_id == course_id,
                                                    Enrollment.user_id.in_(user_ids),
                                                    Enrollment.status != "removed")))
    if len(rows) != len(user_ids):
        raise _NOT_ENROLLED
    return rows


@router.patch("/learners/{user_id}", response_model=CourseLearnerOut,
              responses={403: {"description": "Trợ giảng / không phụ trách"},
                         404: {"description": "Không có khóa hoặc học viên không trong khóa"}})
def update_learner(
    course_id: int,
    user_id: int,
    body: LearnerUpdateIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Đổi hạn hoàn thành của một học viên (null = không có hạn)."""
    course = load_editable_course(db, user, course_id, _ASSISTANT)
    [enrollment] = _enrollments_or_404(db, course.id, {user_id})
    enrollment.due_at = body.due_at
    db.commit()
    log_event("learner_updated", course_id=course.id, user_id=user_id, by=user.id)
    db.refresh(enrollment)
    p = teach_stats.enrollment_progress(db, [enrollment], teach_stats.course_outlines(db, [course.id]))[enrollment.id]
    return CourseLearnerOut(user=LearnerUserOut.model_validate(enrollment.user), **p.out_fields())


@router.delete("/learners", status_code=status.HTTP_204_NO_CONTENT,
               responses={403: {"description": "Trợ giảng / không phụ trách"},
                          404: {"description": "Không có khóa hoặc có học viên không trong khóa"}})
def remove_learners(
    course_id: int,
    user_ids: list[int] = Query(min_length=1, max_length=500, description="Lặp lại: ?user_ids=1&user_ids=2"),
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Xóa một hoặc nhiều học viên khỏi khóa. Có id không nằm trong khóa → 404, không xóa ai."""
    course = load_editable_course(db, user, course_id, _ASSISTANT)
    rows = _enrollments_or_404(db, course.id, set(user_ids))
    teach_stats.remove(rows, user)
    db.commit()
    log_event("learners_removed", course_id=course.id, by=user.id, count=len(rows))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
