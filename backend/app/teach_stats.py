"""Số liệu học tập cho giảng viên: tiến độ từng ghi danh, điểm bài kiểm tra, ghi danh / xóa học viên.

Tiến độ tính giống trang "Khóa học của tôi" của học viên (chỉ đếm bài đã publish, chưa xóa mềm,
nằm trong chủ đề chưa xóa mềm) để hai bên luôn thấy cùng một con số.
Bài kiểm tra cuối khóa = bài tính điểm (is_graded) đứng sau cùng, như build_outline.
Ghi danh bị xóa (status 'removed') không được tính.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from .models import Course, CourseSection, Enrollment, Lesson, LessonProgress, Quiz, QuizAttempt, Role, User, UserRole
from .routers.my_courses import _visible_lessons


@dataclass
class CourseLesson:
    lesson: Lesson
    section: CourseSection
    quiz: Quiz | None


@dataclass
class CourseOutline:
    lessons: list[CourseLesson] = field(default_factory=list)

    @property
    def final_quiz(self) -> CourseLesson | None:
        graded = [x for x in self.lessons if x.quiz is not None and x.quiz.is_graded]
        return graded[-1] if graded else None

    @property
    def quizzes(self) -> list[CourseLesson]:
        return [x for x in self.lessons if x.quiz is not None]


def course_outlines(db: Session, course_ids: list[int]) -> dict[int, CourseOutline]:
    """Bài học viên nhìn thấy của từng khóa, theo thứ tự chủ đề → bài."""
    result = {cid: CourseOutline() for cid in course_ids}
    if not course_ids:
        return result
    rows = db.execute(
        _visible_lessons(Lesson, CourseSection, Quiz)
        .outerjoin(Quiz, Quiz.lesson_id == Lesson.id)
        .where(Lesson.course_id.in_(course_ids))
        .order_by(CourseSection.sort_order, CourseSection.id, Lesson.sort_order, Lesson.id)).all()
    for lesson, section, quiz in rows:
        result[lesson.course_id].lessons.append(CourseLesson(lesson, section, quiz))
    return result


@dataclass
class AttemptStats:
    used: int = 0  # mọi lượt đã bắt đầu (kể cả đang làm) → so với max_attempts
    best_percent: float | None = None  # điểm cao nhất trong các lượt đã nộp
    passed: bool = False
    last_submitted_at: datetime | None = None


def attempt_stats(db: Session, user_ids: set[int], quiz_ids: set[int]) -> dict[tuple[int, int], AttemptStats]:
    """(user_id, quiz_id) → thống kê các lượt làm bài."""
    if not user_ids or not quiz_ids:
        return {}
    finished = QuizAttempt.status != "in_progress"
    rows = db.execute(
        select(QuizAttempt.user_id, QuizAttempt.quiz_id, func.count(QuizAttempt.id),
               func.max(case((finished, QuizAttempt.score_percent))),
               func.max(case((QuizAttempt.passed.is_(True), 1), else_=0)),
               func.max(QuizAttempt.submitted_at))
        .where(QuizAttempt.user_id.in_(user_ids), QuizAttempt.quiz_id.in_(quiz_ids))
        .group_by(QuizAttempt.user_id, QuizAttempt.quiz_id))
    return {(uid, qid): AttemptStats(int(n), float(best) if best is not None else None, bool(ok), last)
            for uid, qid, n, best, ok, last in rows}


@dataclass
class EnrollmentProgress:
    enrollment: Enrollment
    outline: CourseOutline
    completed: set[int]  # id bài đã hoàn thành
    started: bool  # đã mở ít nhất một bài
    last_activity: datetime | None
    attempts: dict[int, AttemptStats]  # quiz_id → thống kê

    @property
    def total(self) -> int:
        return len(self.outline.lessons)

    @property
    def percent(self) -> float:
        return round(100 * len(self.completed) / self.total, 2) if self.total else 0

    @property
    def status(self) -> str:
        # Ghi danh đã ghi nhận hoàn thành thì giữ nguyên, kể cả khi khóa có thêm bài sau đó
        if self.enrollment.status == "completed" or (self.total and len(self.completed) == self.total):
            return "completed"
        return "in_progress" if self.started else "not_started"

    @property
    def final(self) -> AttemptStats | None:
        final = self.outline.final_quiz
        stats = self.attempts.get(final.lesson.id) if final else None
        return stats if stats and stats.best_percent is not None else None

    def out_fields(self) -> dict:
        """Các trường của schemas.LearnerProgressOut."""
        e, final = self.enrollment, self.final
        return dict(
            enrollment_status=e.status, enrolled_at=e.enrolled_at, due_at=e.due_at, completed_at=e.completed_at,
            total_lessons=self.total, completed_lessons=len(self.completed), progress_percent=self.percent,
            progress_status=self.status, last_activity_at=self.last_activity,
            final_score_percent=final.best_percent if final else None,
            final_passed=final.passed if final else None,
        )


def enrollment_progress(db: Session, enrollments: list[Enrollment],
                        outlines: dict[int, CourseOutline]) -> dict[int, EnrollmentProgress]:
    """enrollment.id → tiến độ. `outlines` phải có đủ các khóa của các ghi danh."""
    user_ids = {e.user_id for e in enrollments}
    lesson_ids = {x.lesson.id for cid in {e.course_id for e in enrollments} for x in outlines[cid].lessons}
    quiz_ids = {x.lesson.id for cid in {e.course_id for e in enrollments} for x in outlines[cid].quizzes}

    progress: dict[int, dict[int, LessonProgress]] = defaultdict(dict)
    if user_ids and lesson_ids:
        for p in db.scalars(select(LessonProgress).where(LessonProgress.user_id.in_(user_ids),
                                                         LessonProgress.lesson_id.in_(lesson_ids))):
            progress[p.user_id][p.lesson_id] = p
    attempts = attempt_stats(db, user_ids, quiz_ids)

    result = {}
    for e in enrollments:
        outline = outlines[e.course_id]
        mine = [progress[e.user_id][x.lesson.id] for x in outline.lessons if x.lesson.id in progress[e.user_id]]
        result[e.id] = EnrollmentProgress(
            enrollment=e, outline=outline,
            completed={p.lesson_id for p in mine if p.status == "completed"},
            started=bool(mine),
            last_activity=max((p.updated_at for p in mine), default=None),
            attempts={x.lesson.id: attempts[(e.user_id, x.lesson.id)] for x in outline.quizzes
                      if (e.user_id, x.lesson.id) in attempts},
        )
    return result


def active_enrollments(db: Session, *, course_ids: list[int], user_id: int | None = None) -> list[Enrollment]:
    """Ghi danh chưa bị xóa của các khóa (lọc thêm theo học viên), nạp sẵn user + phòng ban."""
    if not course_ids:
        return []
    stmt = (select(Enrollment).where(Enrollment.course_id.in_(course_ids), Enrollment.status != "removed")
            .options(selectinload(Enrollment.user).selectinload(User.department))
            .order_by(Enrollment.enrolled_at, Enrollment.id))
    if user_id is not None:
        stmt = stmt.where(Enrollment.user_id == user_id)
    return list(db.scalars(stmt))


def student_ids_query():
    """id các tài khoản có vai trò học viên."""
    return select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.code == "student")


# --------------------------------------------------------------------------- #
# Ghi danh / xóa học viên
# --------------------------------------------------------------------------- #
def check_learners(db: Session, user_ids: set[int]) -> None:
    """Chỉ ghi danh được tài khoản học viên đang hoạt động; sai → 422 kèm danh sách id."""
    ok = set(db.scalars(select(User.id).where(User.id.in_(user_ids), User.status == "active",
                                              User.id.in_(student_ids_query()))))
    if bad := sorted(user_ids - ok):
        raise HTTPException(422, detail="Không thể ghi danh tài khoản không tồn tại, đã bị khóa hoặc không phải "
                                        f"học viên (id: {', '.join(map(str, bad))})")


def enroll(db: Session, course: Course, user_ids: set[int], due_at: datetime | None, by: User) -> tuple[int, int]:
    """Ghi danh các học viên vào khóa (chưa commit). Trả về (số thêm, số đã có sẵn).

    Học viên từng bị xóa → dùng lại bản ghi cũ (tiến độ cũ vẫn còn); đã hoàn thành trước đó thì
    giữ trạng thái hoàn thành. Hạn bỏ trống = hạn mặc định của khóa.
    """
    now = datetime.now(timezone.utc)
    due = due_at if due_at is not None else course.default_due_at
    existing = {e.user_id: e for e in db.scalars(
        select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.user_id.in_(user_ids)))}
    added = 0
    for uid in sorted(user_ids):
        e = existing.get(uid)
        if e is None:
            db.add(Enrollment(course_id=course.id, user_id=uid, enrolled_by=by.id, enrolled_at=now, due_at=due))
        elif e.status == "removed":
            e.status = "completed" if e.completed_at else "active"
            e.enrolled_by, e.enrolled_at, e.due_at = by.id, now, due
            e.removed_at = e.removed_by = None
        else:
            continue
        added += 1
    return added, len(user_ids) - added


def remove(enrollments: list[Enrollment], by: User) -> None:
    """Xóa học viên khỏi khóa = status 'removed', giữ lịch sử tiến độ và điểm (chưa commit)."""
    now = datetime.now(timezone.utc)
    for e in enrollments:
        e.status, e.removed_at, e.removed_by = "removed", now, by.id
