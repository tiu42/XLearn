"""Làm bài kiểm tra: hạn nộp của lượt làm, lưu bài làm, chấm điểm, quyền xem đáp án.

Một lượt làm (quiz_attempts) đi qua: in_progress → submitted (học viên nộp) hoặc expired (hết giờ,
hệ thống nộp thay bằng bài làm đã lưu). Cả hai đều được chấm điểm và tính lượt.

Hạn nộp = sớm hơn trong hai mốc: bắt đầu + time_limit_seconds, và closes_at của bài kiểm tra.
Máy khách tự nộp khi đồng hồ về 0; GRACE_SECONDS bù độ trễ mạng. Quá hạn + GRACE_SECONDS thì
bài làm gửi kèm bị bỏ qua, chỉ chấm phần đã lưu trước đó (finalize_overdue).
"""

from __future__ import annotations

import random
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .learning import record_quiz_attempt
from .models import Lesson, Quiz, QuizAttempt, QuizAttemptAnswer, QuizAttemptTextAnswer, QuizQuestion

GRACE_SECONDS = 30

# single_choice / true_false: chọn đúng 1 phương án; multiple_choice: chọn đủ và đúng mới được điểm
SINGLE_CHOICE_TYPES = ("single_choice", "true_false")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime | None) -> datetime | None:
    """SQLite trả datetime không múi giờ; mọi thời điểm trong DB là UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def normalize_text(value: str | None) -> str:
    """Chữ thường, bỏ dấu tiếng Việt, gộp khoảng trắng — so khớp câu tự luận ngắn."""
    s = unicodedata.normalize("NFD", (value or "").lower().replace("đ", "d"))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return " ".join(s.split())


# --------------------------------------------------------------------------- #
# Thời gian
# --------------------------------------------------------------------------- #
def deadline(quiz: Quiz, attempt: QuizAttempt) -> datetime | None:
    """Hạn nộp của lượt làm; None = không giới hạn."""
    marks = []
    if quiz.time_limit_seconds:
        marks.append(aware(attempt.started_at) + timedelta(seconds=quiz.time_limit_seconds))
    if quiz.closes_at:
        marks.append(aware(quiz.closes_at))
    return min(marks) if marks else None


def is_overdue(quiz: Quiz, attempt: QuizAttempt, now: datetime) -> bool:
    """Quá hạn nộp kể cả thời gian bù: không nhận bài làm mới nữa."""
    end = deadline(quiz, attempt)
    return end is not None and now > end + timedelta(seconds=GRACE_SECONDS)


def window_error(quiz: Quiz, now: datetime) -> str | None:
    """Lý do chưa/không còn được bắt đầu lượt mới theo opens_at/closes_at."""
    if quiz.opens_at and now < aware(quiz.opens_at):
        return "not_open"
    if quiz.closes_at and now >= aware(quiz.closes_at):
        return "closed"
    return None


def review_available(quiz: Quiz, now: datetime) -> bool:
    """Học viên được xem đáp án đúng + giải thích của lượt đã nộp hay chưa (quizzes.review_policy)."""
    if quiz.review_policy == "after_submit":
        return True
    if quiz.review_policy == "after_close":
        return quiz.closes_at is not None and now >= aware(quiz.closes_at)
    return False


# --------------------------------------------------------------------------- #
# Câu hỏi và bài làm
# --------------------------------------------------------------------------- #
def question_order(quiz: Quiz, attempt: QuizAttempt) -> list[QuizQuestion]:
    """Thứ tự câu hỏi của lượt làm. Trộn câu thì trộn cố định theo id lượt làm → tải lại trang,
    làm tiếp hay xem kết quả đều thấy cùng một thứ tự mà không phải lưu thứ tự vào DB."""
    questions = list(quiz.questions)
    if quiz.shuffle_questions:
        random.Random(attempt.id).shuffle(questions)
    return questions


@dataclass
class Answer:
    option_ids: set[int] = field(default_factory=set)
    text: str | None = None


def load_answers(db: Session, attempt_id: int) -> dict[int, Answer]:
    """question_id → bài làm đã lưu của lượt làm."""
    answers: dict[int, Answer] = {}
    for qid, oid in db.execute(select(QuizAttemptAnswer.question_id, QuizAttemptAnswer.option_id)
                               .where(QuizAttemptAnswer.attempt_id == attempt_id)):
        answers.setdefault(qid, Answer()).option_ids.add(oid)
    for qid, text in db.execute(select(QuizAttemptTextAnswer.question_id, QuizAttemptTextAnswer.answer_text)
                                .where(QuizAttemptTextAnswer.attempt_id == attempt_id)):
        answers.setdefault(qid, Answer()).text = text
    return answers


def validate_answers(quiz: Quiz, answers: dict[int, Answer]) -> str | None:
    """Thông báo lỗi nếu bài làm không khớp câu hỏi của bài kiểm tra."""
    questions = {q.id: q for q in quiz.questions}
    for qid, a in answers.items():
        q = questions.get(qid)
        if q is None:
            return f"Câu hỏi {qid} không thuộc bài kiểm tra này"
        if q.question_type == "short_text":
            if a.option_ids:
                return f"Câu {qid} là câu tự luận ngắn, không có phương án để chọn"
            continue
        if a.text:
            return f"Câu {qid} là câu trắc nghiệm, không nhận câu trả lời dạng chữ"
        if not a.option_ids <= {o.id for o in q.options}:
            return f"Phương án đã chọn không thuộc câu {qid}"
        if q.question_type in SINGLE_CHOICE_TYPES and len(a.option_ids) > 1:
            return f"Câu {qid} chỉ được chọn một phương án"
    return None


def save_answers(db: Session, attempt: QuizAttempt, answers: dict[int, Answer]) -> None:
    """Thay toàn bộ bài làm đã lưu của lượt bằng `answers` (đã validate). Câu bỏ trống không lưu."""
    db.execute(delete(QuizAttemptAnswer).where(QuizAttemptAnswer.attempt_id == attempt.id))
    db.execute(delete(QuizAttemptTextAnswer).where(QuizAttemptTextAnswer.attempt_id == attempt.id))
    now = utcnow()
    for qid, a in answers.items():
        db.add_all(QuizAttemptAnswer(attempt_id=attempt.id, question_id=qid, option_id=oid, answered_at=now)
                   for oid in sorted(a.option_ids))
        text = (a.text or "").strip()
        if text:
            db.add(QuizAttemptTextAnswer(attempt_id=attempt.id, question_id=qid, answer_text=text, answered_at=now))
    db.flush()


def is_correct(question: QuizQuestion, answer: Answer | None) -> bool:
    if answer is None:
        return False
    if question.question_type == "short_text":
        given = normalize_text(answer.text)
        # short_text: mọi quiz_options của câu là đáp án được chấp nhận
        return given != "" and any(normalize_text(o.content) == given for o in question.options)
    correct = {o.id for o in question.options if o.is_correct}
    return bool(answer.option_ids) and answer.option_ids == correct


def has_answer(answer: Answer | None) -> bool:
    return answer is not None and (bool(answer.option_ids) or bool((answer.text or "").strip()))


# --------------------------------------------------------------------------- #
# Kết thúc lượt làm
# --------------------------------------------------------------------------- #
def _round2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def finish_attempt(db: Session, lesson: Lesson, attempt: QuizAttempt, *, expired: bool,
                   now: datetime) -> None:
    """Chấm phần bài đã lưu, khóa lượt làm (submitted/expired) và cập nhật tiến độ bài. Chưa commit.

    Quá hạn thì thời điểm nộp tính bằng hạn nộp (hệ thống nộp thay đúng lúc hết giờ).
    """
    quiz = lesson.quiz
    answers = load_answers(db, attempt.id)
    end = deadline(quiz, attempt)
    submitted_at = min(now, end) if expired and end else now

    score = max_score = Decimal(0)
    for q in quiz.questions:
        ok = is_correct(q, answers.get(q.id))
        max_score += q.points
        if ok:
            score += q.points
        if q.question_type == "short_text" and q.id in answers and answers[q.id].text:
            db.get(QuizAttemptTextAnswer, (attempt.id, q.id)).is_correct = ok

    # Bài toàn câu 0 điểm: không có gì để mất → 100%
    percent = _round2(100 * score / max_score) if max_score else Decimal(100)
    attempt.status = "expired" if expired else "submitted"
    attempt.score, attempt.max_score, attempt.score_percent = score, max_score, percent
    attempt.passed = percent >= quiz.pass_score_percent
    attempt.submitted_at = submitted_at

    spent = int((submitted_at - aware(attempt.started_at)).total_seconds())
    record_quiz_attempt(db, attempt.user_id, lesson, attempt.passed, spent)
    db.flush()


def finalize_overdue(db: Session, lesson: Lesson, user_id: int, now: datetime) -> list[QuizAttempt]:
    """Nộp thay các lượt đang làm đã quá hạn (học viên đóng trình duyệt, mất mạng…). Chưa commit."""
    quiz = lesson.quiz
    pending = db.scalars(select(QuizAttempt).where(QuizAttempt.quiz_id == quiz.lesson_id,
                                                   QuizAttempt.user_id == user_id,
                                                   QuizAttempt.status == "in_progress")).all()
    done = [a for a in pending if is_overdue(quiz, a, now)]
    for attempt in done:
        finish_attempt(db, lesson, attempt, expired=True, now=now)
    return done
