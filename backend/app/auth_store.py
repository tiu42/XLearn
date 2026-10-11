"""State xác thực lưu trên Redis: danh sách trắng refresh token và đếm đăng nhập sai."""

from __future__ import annotations

from .config import get_settings


def _refresh_key(jti: str) -> str:
    return f"auth:refresh:{jti}"


def _user_refresh_key(user_id: int) -> str:
    return f"auth:user_refresh:{user_id}"


def _login_fail_key(email: str) -> str:
    return f"auth:login_fail:{email}"


# --------------------------------------------------------------------------- #
# Refresh token: chỉ token có trong Redis mới dùng được → thu hồi được bất kỳ lúc nào
# --------------------------------------------------------------------------- #
def save_refresh(client, user_id: int, jti: str, ttl: int) -> None:
    pipe = client.pipeline()
    pipe.set(_refresh_key(jti), user_id, ex=ttl)
    pipe.sadd(_user_refresh_key(user_id), jti)
    pipe.expire(_user_refresh_key(user_id), ttl)
    pipe.execute()


def consume_refresh(client, user_id: int, jti: str) -> bool:
    """Dùng một lần: xóa token và trả True nếu nó còn hiệu lực.

    DEL là atomic → 2 request refresh đồng thời với cùng token thì chỉ 1 request thành công.
    """
    ok = client.delete(_refresh_key(jti)) == 1
    client.srem(_user_refresh_key(user_id), jti)
    return ok


def revoke_all_refresh(client, user_id: int) -> None:
    """Đăng xuất mọi thiết bị (đổi mật khẩu, bị khóa tài khoản...)."""
    jtis = client.smembers(_user_refresh_key(user_id))
    pipe = client.pipeline()
    for jti in jtis:
        pipe.delete(_refresh_key(jti))
    pipe.delete(_user_refresh_key(user_id))
    pipe.execute()


# --------------------------------------------------------------------------- #
# Chống dò mật khẩu
# --------------------------------------------------------------------------- #
def lockout_remaining(client, email: str) -> int:
    """Số giây còn bị khóa đăng nhập (0 = không bị khóa)."""
    count = client.get(_login_fail_key(email))
    if count is None or int(count) < get_settings().login_max_failures:
        return 0
    return max(client.ttl(_login_fail_key(email)), 1)


def record_login_failure(client, email: str) -> None:
    key = _login_fail_key(email)
    if client.incr(key) == 1:
        client.expire(key, get_settings().login_lockout_seconds)


def clear_login_failures(client, email: str) -> None:
    client.delete(_login_fail_key(email))
