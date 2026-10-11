"""Băm mật khẩu (bcrypt) và phát hành / kiểm tra JWT."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
import jwt

from .config import get_settings

ACCESS = "access"
REFRESH = "refresh"


class InvalidToken(Exception):
    """Token sai chữ ký, hết hạn, sai loại hoặc thiếu claim."""


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Không bao giờ để exception thoát ra ngoài (bcrypt ném ValueError khi mật khẩu > 72 byte)."""
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


@lru_cache(maxsize=1)
def dummy_password_hash() -> str:
    """Hash giả để vẫn chạy bcrypt khi email không tồn tại.

    Thời gian phản hồi như nhau → không dò được email nào có thật qua timing.
    """
    return hash_password(uuid.uuid4().hex)


def create_token(user_id: int, token_type: str, roles: list[str] | None = None) -> tuple[str, str, int]:
    """Trả về (token, jti, ttl_giây)."""
    settings = get_settings()
    if token_type == ACCESS:
        ttl = settings.access_token_expire_minutes * 60
    else:
        ttl = settings.refresh_token_expire_days * 24 * 3600
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    claims = {
        "sub": str(user_id),
        "type": token_type,
        "jti": jti,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + timedelta(seconds=ttl),
    }
    if roles is not None:
        # Chỉ để frontend hiển thị; backend luôn đọc vai trò từ DB khi phân quyền
        claims["roles"] = roles
    token = jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, ttl


def decode_token(token: str, expected_type: str) -> dict:
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],  # cố định thuật toán → chặn tấn công "alg: none"
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "type", "jti", "iss", "iat", "exp"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidToken(str(exc)) from exc
    if claims["type"] != expected_type:
        raise InvalidToken(f"expected {expected_type} token")
    return claims
