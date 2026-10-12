"""Ghi nhận tiến độ bài học và quy tắc hoàn thành theo loại bài.

Luồng: giao diện học gửi số liệu (mở bài, vị trí video, trang PDF, % đã đọc…) → record_progress()
lưu số liệu vào lesson_progress → hỏi quy tắc của loại bài xem bài đã hoàn thành chưa.

Đổi điều kiện hoàn thành = đổi RULES (vd video: OnOpen() → MinPercent(90)). Endpoint và giao diện
không phải sửa: giao diện luôn gửi đủ số liệu nó có, và hiện hướng dẫn theo `code` của quy tắc.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import Lesson, LessonProgress

# Giới hạn thời gian học cộng thêm mỗi lần gửi: chặn số liệu ảo do client lỗi/gian lận
MAX_TIME_DELTA_SECONDS = 3600


@dataclass(frozen=True)
class ProgressUpdate:
    """Số liệu giao diện gửi lên; None = không có thông tin mới."""

    progress_percent: float | None = None
    position_seconds: int | None = None  # video: vị trí đang xem
    page: int | None = None  # pdf: trang đang đọc
    time_spent_seconds: int = 0  # thời gian học thêm kể từ lần gửi trước


# --------------------------------------------------------------------------- #
# Quy tắc hoàn thành
# --------------------------------------------------------------------------- #
class CompletionRule:
    code: str  # trả cho giao diện để hiện hướng dẫn ("Tự động hoàn thành khi…")

    def is_complete(self, lesson: Lesson, progress: LessonProgress) -> bool:
        raise NotImplementedError


class OnOpen(CompletionRule):
    """Mở bài là hoàn thành."""

    code = "open"

    def is_complete(self, lesson, progress):
        return True


@dataclass(frozen=True)
class MinPercent(CompletionRule):
    """Đạt tối thiểu `percent`% (video: thời lượng đã xem, pdf: số trang, bài đọc: phần đã cuộn qua)."""

    percent: float = 90
    code = "percent"

    def is_complete(self, lesson, progress):
        return progress.progress_percent >= Decimal(str(self.percent))


class QuizPass(CompletionRule):
    """Chỉ hoàn thành khi làm đạt bài kiểm tra; module quiz gọi mark_completed(), ở đây không bao giờ True."""

    code = "quiz_pass"

    def is_complete(self, lesson, progress):
        return False


RULES: dict[str, CompletionRule] = {
    "video": OnOpen(),
    "pdf": OnOpen(),
    "page": OnOpen(),
    "quiz": QuizPass(),
}


def rule_for(lesson: Lesson) -> CompletionRule:
    return RULES[lesson.lesson_type]


# --------------------------------------------------------------------------- #
# Ghi tiến độ
# --------------------------------------------------------------------------- #
def _derived_percent(lesson: Lesson, update: ProgressUpdate) -> float | None:
    """% suy ra từ vị trí video / trang PDF khi biết tổng thời lượng / số trang."""
    media = lesson.media
    if update.position_seconds is not None and media and media.duration_seconds:
        return 100 * update.position_seconds / media.duration_seconds
    if update.page is not None and media and media.page_count:
        return 100 * update.page / media.page_count
    return None


def _get_or_create(db: Session, user_id: int, lesson_id: int) -> LessonProgress:
    stmt = select(LessonProgress).where(LessonProgress.user_id == user_id, LessonProgress.lesson_id == lesson_id)
    progress = db.scalar(stmt)
    if progress is not None:
        return progress
    progress = LessonProgress(user_id=user_id, lesson_id=lesson_id, status="in_progress",
                              progress_percent=Decimal(0), time_spent_seconds=0)
    db.add(progress)
    try:
        db.flush()
    except IntegrityError:
        # Hai request mở bài cùng lúc (vd mở 2 tab): request kia đã tạo dòng trước → dùng lại dòng đó
        db.rollback()
        progress = db.scalars(stmt).one()
    return progress


def mark_completed(progress: LessonProgress) -> None:
    """Đánh dấu hoàn thành (một lần, không bao giờ quay lại in_progress)."""
    if progress.status == "completed":
        return
    progress.status = "completed"
    progress.progress_percent = Decimal(100)
    progress.completed_at = datetime.now(timezone.utc)


def record_progress(db: Session, user_id: int, lesson: Lesson, update: ProgressUpdate) -> LessonProgress:
    """Lưu số liệu mới rồi áp quy tắc hoàn thành. Chưa commit."""
    progress = _get_or_create(db, user_id, lesson.id)

    if update.position_seconds is not None:
        progress.last_position_seconds = update.position_seconds
    if update.page is not None:
        progress.last_page = update.page
    if update.time_spent_seconds:
        progress.time_spent_seconds += min(update.time_spent_seconds, MAX_TIME_DELTA_SECONDS)

    # % chỉ tăng: tua lại video / cuộn lên đầu không làm mất phần đã học
    candidates = [p for p in (update.progress_percent, _derived_percent(lesson, update)) if p is not None]
    if candidates:
        new = Decimal(str(round(min(100.0, max(candidates)), 2)))
        if new > progress.progress_percent:
            progress.progress_percent = new

    if rule_for(lesson).is_complete(lesson, progress):
        mark_completed(progress)
    return progress
