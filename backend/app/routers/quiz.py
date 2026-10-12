"""Làm bài kiểm tra (học viên): bắt đầu / làm tiếp lượt làm, lưu bài làm, nộp bài, xem kết quả.

Quyền giống giao diện học (load_lesson): đang được ghi danh, bài đã publish, chủ đề chưa bị khóa.
Chấm điểm, hạn nộp và quyền xem đáp án nằm ở app/quiz.py. Đáp án đúng không bao giờ được trả
khi lượt còn đang làm.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import quiz as qz
from ..db import get_db
from ..deps import get_current_user
from ..learning import ProgressUpdate, record_progress
from ..models import Course, Enrollment, Lesson, LessonProgress, Quiz, QuizAttempt, QuizQuestion, User
from ..schemas import (
    QuizAnswerOut,
    QuizAnswersIn,
    QuizAnswersSavedOut,
    QuizAttemptOut,
    QuizAttemptResultOut,
    QuizAttemptSummaryOut,
    QuizOptionOut,
    QuizQuestionOut,
    QuizReviewOptionOut,
    QuizReviewQuestionOut,
    QuizStatusOut,
    QuizSubmitOut,
)
from .learn import load_lesson, progress_out, sync_course_progress

router = APIRouter(prefix="/me/courses/{course_id}/lessons/{lesson_id}/quiz", tags=["learner: quiz"])

_NOT_FOUND = {404: {"description": "Không có bài kiểm tra / lượt làm, hoặc user không được ghi danh"}}
_LOCKED = {403: {"description": "Chủ đề bị khóa, hoặc bài kiểm tra chưa mở / đã đóng / hết lượt"}}
_FINISHED = {409: {"description": "Lượt làm đã kết thúc (đã nộp hoặc hết giờ)"}}

BLOCK_MESSAGES = {
    "not_open": "Bài kiểm tra chưa mở.",
    "closed": "Bài kiểm tra đã đóng.",
    "no_attempts": "Bạn đã dùng hết lượt làm bài. Liên hệ giảng viên để được mở thêm lượt.",
    "no_questions": "Bài kiểm tra chưa có câu hỏi.",
}


def _load_quiz(db: Session, user: User, course_id: int, lesson_id: int) -> tuple[Enrollment, Course, Lesson]:
    enrollment, course, lesson, _ = load_lesson(db, user, course_id, lesson_id)
    if lesson.quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Bài học này không phải bài kiểm tra")
    # Nạp sẵn câu hỏi + phương án (chấm điểm, trả đề đều cần) thay vì lazy load từng câu
    db.scalars(select(Quiz).where(Quiz.lesson_id == lesson.id)
               .options(selectinload(Quiz.questions).selectinload(QuizQuestion.options))).one()
    return enrollment, course, lesson


def _attempts(db: Session, lesson: Lesson, user_id: int) -> list[QuizAttempt]:
    """Các lượt làm của user, mới nhất trước."""
    return list(db.scalars(select(QuizAttempt)
                           .where(QuizAttempt.quiz_id == lesson.id, QuizAttempt.user_id == user_id)
                           .order_by(QuizAttempt.attempt_no.desc())))


def _get_attempt(db: Session, lesson: Lesson, user_id: int, attempt_id: int) -> QuizAttempt:
    attempt = db.get(QuizAttempt, attempt_id)
    # Lượt của người khác hoặc bài khác: cùng 404 để không lộ id
    if attempt is None or attempt.user_id != user_id or attempt.quiz_id != lesson.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lượt làm bài")
    return attempt


def _expire_overdue(db: Session, enrollment: Enrollment, course: Course, lesson: Lesson, user_id: int,
                    now: datetime) -> None:
    """Nộp thay lượt quá hạn trước khi trả trạng thái; lượt đạt thì cập nhật luôn tiến độ khóa."""
    if qz.finalize_overdue(db, lesson, user_id, now):
        sync_course_progress(db, enrollment, course, user_id)
        db.commit()


def _summary(lesson: Lesson, attempt: QuizAttempt) -> dict:
    def num(v):
        return float(v) if v is not None else None
    return dict(
        id=attempt.id, attempt_no=attempt.attempt_no, status=attempt.status,
        score=num(attempt.score), max_score=num(attempt.max_score), score_percent=num(attempt.score_percent),
        passed=attempt.passed, started_at=qz.aware(attempt.started_at), submitted_at=qz.aware(attempt.submitted_at),
        expires_at=qz.deadline(lesson.quiz, attempt) if attempt.status == "in_progress" else None,
    )


def _block_reason(lesson: Lesson, attempts: list[QuizAttempt], now: datetime) -> str | None:
    quiz = lesson.quiz
    if not quiz.questions:
        return "no_questions"
    reason = qz.window_error(quiz, now)
    if reason:
        return reason
    if quiz.max_attempts is not None and len(attempts) >= quiz.max_attempts:
        return "no_attempts"
    return None


def _parse_answers(lesson: Lesson, body: QuizAnswersIn | None) -> dict[int, qz.Answer]:
    answers: dict[int, qz.Answer] = {}
    for a in (body.answers if body else []):
        if a.question_id in answers:
            raise HTTPException(422,
                                detail=f"Câu {a.question_id} xuất hiện nhiều lần trong bài làm")
        answers[a.question_id] = qz.Answer(option_ids=set(a.option_ids), text=a.text)
    error = qz.validate_answers(lesson.quiz, answers)
    if error:
        raise HTTPException(422, detail=error)
    return answers


def _attempt_out(db: Session, lesson: Lesson, attempt: QuizAttempt, now: datetime) -> QuizAttemptOut:
    answers = qz.load_answers(db, attempt.id)
    return QuizAttemptOut(
        **_summary(lesson, attempt),
        time_limit_seconds=lesson.quiz.time_limit_seconds,
        questions=[QuizQuestionOut(
            id=q.id, question_type=q.question_type, content=q.content, points=q.points,
            options=[] if q.question_type == "short_text"
            else [QuizOptionOut(id=o.id, content=o.content) for o in q.options],
        ) for q in qz.question_order(lesson.quiz, attempt)],
        answers=[QuizAnswerOut(question_id=qid, option_ids=sorted(a.option_ids), text=a.text)
                 for qid, a in answers.items()],
        server_time=now,
    )


def _result_out(db: Session, lesson: Lesson, attempt: QuizAttempt, now: datetime) -> QuizAttemptResultOut:
    quiz = lesson.quiz
    answers = qz.load_answers(db, attempt.id)
    questions = qz.question_order(quiz, attempt)
    review = qz.review_available(quiz, now)
    marks = {q.id: qz.is_correct(q, answers.get(q.id)) for q in questions}
    end = attempt.submitted_at or now
    return QuizAttemptResultOut(
        **_summary(lesson, attempt),
        question_count=len(questions),
        answered_count=sum(qz.has_answer(answers.get(q.id)) for q in questions),
        correct_count=sum(marks.values()),
        time_spent_seconds=max(0, int((qz.aware(end) - qz.aware(attempt.started_at)).total_seconds())),
        pass_score_percent=float(quiz.pass_score_percent),
        review_policy=quiz.review_policy,
        review_available=review,
        questions=[QuizReviewQuestionOut(
            id=q.id, question_type=q.question_type, content=q.content, points=q.points,
            explanation=q.explanation,
            options=[] if q.question_type == "short_text"
            else [QuizReviewOptionOut(id=o.id, content=o.content, is_correct=o.is_correct) for o in q.options],
            accepted_answers=[o.content for o in q.options] if q.question_type == "short_text" else [],
            selected_option_ids=sorted(answers[q.id].option_ids) if q.id in answers else [],
            text=answers[q.id].text if q.id in answers else None,
            answered=qz.has_answer(answers.get(q.id)),
            correct=marks[q.id],
            earned_points=q.points if marks[q.id] else 0,
        ) for q in questions] if review else None,
    )


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #
@router.get("", response_model=QuizStatusOut, responses={**_NOT_FOUND, **_LOCKED})
def get_quiz_status(
    course_id: int,
    lesson_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lịch sử các lượt làm, lượt đang làm dở, số lượt còn lại và có bắt đầu lượt mới được không."""
    enrollment, course, lesson = _load_quiz(db, user, course_id, lesson_id)
    now = qz.utcnow()
    _expire_overdue(db, enrollment, course, lesson, user.id, now)

    attempts = _attempts(db, lesson, user.id)
    quiz = lesson.quiz
    current = next((a for a in attempts if a.status == "in_progress"), None)
    finished = [a for a in attempts if a.status != "in_progress"]
    reason = _block_reason(lesson, attempts, now)
    return QuizStatusOut(
        attempts=[QuizAttemptSummaryOut(**_summary(lesson, a)) for a in attempts],
        attempts_used=len(attempts),
        attempts_left=None if quiz.max_attempts is None else max(0, quiz.max_attempts - len(attempts)),
        in_progress=QuizAttemptSummaryOut(**_summary(lesson, current)) if current else None,
        can_start=current is None and reason is None,
        blocked_reason=reason,
        best_score_percent=max((float(a.score_percent) for a in finished if a.score_percent is not None),
                               default=None),
        passed=any(a.passed for a in finished),
        review_available=qz.review_available(quiz, now),
        server_time=now,
    )


@router.post("/attempts", response_model=QuizAttemptOut, responses={**_NOT_FOUND, **_LOCKED})
def start_attempt(
    course_id: int,
    lesson_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bắt đầu lượt mới, hoặc trả lượt đang làm dở (làm tiếp sau khi tạm thoát / tải lại trang).

    Trả câu hỏi (không kèm đáp án), bài làm đã lưu và hạn nộp. Đồng hồ tính từ lúc tạo lượt.
    """
    enrollment, course, lesson = _load_quiz(db, user, course_id, lesson_id)
    now = qz.utcnow()
    _expire_overdue(db, enrollment, course, lesson, user.id, now)

    attempts = _attempts(db, lesson, user.id)
    current = next((a for a in attempts if a.status == "in_progress"), None)
    if current is None:
        reason = _block_reason(lesson, attempts, now)
        if reason:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=BLOCK_MESSAGES[reason])
        current = QuizAttempt(quiz_id=lesson.id, user_id=user.id, status="in_progress", started_at=now,
                              attempt_no=(attempts[0].attempt_no if attempts else 0) + 1)
        db.add(current)
        try:
            db.flush()
        except IntegrityError:
            # Bấm "bắt đầu" ở 2 tab cùng lúc: tab kia đã tạo lượt → dùng lại lượt đó
            db.rollback()
            current = db.scalars(select(QuizAttempt).where(
                QuizAttempt.quiz_id == lesson.id, QuizAttempt.user_id == user.id,
                QuizAttempt.status == "in_progress")).first()
            if current is None:
                raise HTTPException(status.HTTP_409_CONFLICT, detail="Không bắt đầu được lượt làm, hãy thử lại")
        record_progress(db, user.id, lesson, ProgressUpdate())  # làm bài = đã bắt đầu học bài này
        db.commit()
    return _attempt_out(db, lesson, current, now)


@router.put("/attempts/{attempt_id}/answers", response_model=QuizAnswersSavedOut,
            responses={**_NOT_FOUND, **_LOCKED, **_FINISHED})
def save_answers(
    course_id: int,
    lesson_id: int,
    attempt_id: int,
    body: QuizAnswersIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lưu tạm bài làm (thay toàn bộ bản đã lưu). Giao diện gọi định kỳ và khi tạm thoát, để làm tiếp
    ở thiết bị khác hoặc được chấm phần đã làm nếu hết giờ mà chưa kịp nộp."""
    enrollment, course, lesson = _load_quiz(db, user, course_id, lesson_id)
    attempt = _get_attempt(db, lesson, user.id, attempt_id)
    now = qz.utcnow()
    if attempt.status == "in_progress" and qz.is_overdue(lesson.quiz, attempt, now):
        _expire_overdue(db, enrollment, course, lesson, user.id, now)
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Đã hết giờ làm bài, bài làm đã được tự động nộp")
    if attempt.status != "in_progress":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Lượt làm bài đã kết thúc")
    qz.save_answers(db, attempt, _parse_answers(lesson, body))
    db.commit()
    return QuizAnswersSavedOut(saved_at=now, expires_at=qz.deadline(lesson.quiz, attempt))


@router.post("/attempts/{attempt_id}/submit", response_model=QuizSubmitOut,
             responses={**_NOT_FOUND, **_LOCKED, **_FINISHED})
def submit_attempt(
    course_id: int,
    lesson_id: int,
    attempt_id: int,
    body: QuizAnswersIn | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Nộp bài: lưu bài làm gửi kèm (nếu có) rồi chấm điểm. Đạt → bài kiểm tra hoàn thành.

    Nộp sau hạn nhưng trong thời gian bù → lượt 'expired' (hết giờ, tự nộp). Quá thời gian bù →
    bỏ qua bài làm gửi kèm, chỉ chấm phần đã lưu trước đó.
    """
    enrollment, course, lesson = _load_quiz(db, user, course_id, lesson_id)
    attempt = _get_attempt(db, lesson, user.id, attempt_id)
    if attempt.status != "in_progress":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Lượt làm bài đã được nộp")
    now = qz.utcnow()
    quiz = lesson.quiz
    answers = _parse_answers(lesson, body) if body is not None else None
    overdue = qz.is_overdue(quiz, attempt, now)
    if answers is not None and not overdue:
        qz.save_answers(db, attempt, answers)
    end = qz.deadline(quiz, attempt)
    qz.finish_attempt(db, lesson, attempt, expired=end is not None and now > end, now=now)

    course_progress = sync_course_progress(db, enrollment, course, user.id)
    db.commit()
    progress = db.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id,
                                                      LessonProgress.lesson_id == lesson.id))
    return QuizSubmitOut(attempt=_result_out(db, lesson, attempt, now), progress=progress_out(progress),
                         course=course_progress)


@router.get("/attempts/{attempt_id}", response_model=QuizAttemptResultOut,
            responses={**_NOT_FOUND, **_LOCKED, 409: {"description": "Lượt làm chưa nộp"}})
def get_attempt_result(
    course_id: int,
    lesson_id: int,
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kết quả một lượt đã nộp. Đáp án đúng + giải thích chỉ có khi review_policy cho phép."""
    enrollment, course, lesson = _load_quiz(db, user, course_id, lesson_id)
    attempt = _get_attempt(db, lesson, user.id, attempt_id)
    now = qz.utcnow()
    if attempt.status == "in_progress":
        _expire_overdue(db, enrollment, course, lesson, user.id, now)
        if attempt.status == "in_progress":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Lượt làm bài chưa được nộp")
    return _result_out(db, lesson, attempt, now)
