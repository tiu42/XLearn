"""Tạo Redis client và kiểm tra kết nối."""

from __future__ import annotations

from functools import lru_cache

import redis

from .config import get_settings


def create_redis_client(url: str | None = None):
    """`fake://` → Redis giả trong RAM (chỉ dùng khi dev/test, KHÔNG dùng khi deploy)."""
    url = url or get_settings().redis_url
    if url.startswith("fake://"):
        import fakeredis  # chỉ có trong requirements-dev.txt

        return fakeredis.FakeRedis(decode_responses=True)
    return redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=2,  # /ready không được treo khi Redis chết
        socket_timeout=2,
        health_check_interval=30,
    )


@lru_cache(maxsize=1)
def get_redis():
    """Provider: tạo client lần đầu cần dùng. Test thay bằng dependency_overrides."""
    return create_redis_client()


def ping(client) -> bool:
    """True nếu Redis trả lời. Không bao giờ để exception thoát ra ngoài."""
    try:
        return bool(client.ping())
    except Exception:
        return False
