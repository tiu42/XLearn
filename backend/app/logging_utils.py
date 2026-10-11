"""Structured logging: một event = một dòng JSON trên stdout."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from .config import get_settings

_LEVELS = {"debug": 10, "info": 20, "warning": 30, "error": 40, "critical": 50}


def utc_now_iso() -> str:
    """Thời điểm hiện tại theo ISO-8601, múi giờ UTC."""
    return datetime.now(timezone.utc).isoformat()


def log_event(event: str, level: str = "info", **fields) -> str | None:
    """Ghi một dòng log JSON ra stdout. Trả về None nếu dưới ngưỡng LOG_LEVEL."""
    level = level.lower()
    threshold = _LEVELS.get(get_settings().log_level.lower(), 20)
    if _LEVELS.get(level, 20) < threshold:
        return None

    line = json.dumps(
        {
            "event": event,
            "level": level,
            "timestamp": utc_now_iso(),
            **fields,
        },
        ensure_ascii=False,  # giữ nguyên tiếng Việt
        default=str,         # không crash khi field là datetime/UUID...
    )
    print(line, flush=True)
    return line
