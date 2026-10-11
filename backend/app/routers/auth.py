"""Xác thực: đăng nhập, làm mới token, đăng xuất, thông tin & mật khẩu của chính mình.

Không có đăng ký: tài khoản do admin tạo (xem routers/admin_users.py).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth_store
from ..db import get_db
from ..deps import get_current_user, role_codes
from ..logging_utils import log_event
from ..models import User
from ..redis_client import get_redis
from ..schemas import ChangePasswordRequest, LoginRequest, LoginResponse, RefreshRequest, TokenResponse, UserOut
from ..security import (
    ACCESS,
    REFRESH,
    InvalidToken,
    create_token,
    decode_token,
    dummy_password_hash,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_REFRESH = HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ hoặc đã bị thu hồi")


def _issue_tokens(user: User, redis_client) -> dict:
    access_token, _, access_ttl = create_token(user.id, ACCESS, sorted(role_codes(user)))
    refresh_token, jti, refresh_ttl = create_token(user.id, REFRESH)
    auth_store.save_refresh(redis_client, user.id, jti, refresh_ttl)
    return {"access_token": access_token, "refresh_token": refresh_token,
            "token_type": "bearer", "expires_in": access_ttl}


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db), redis_client=Depends(get_redis)):
    retry_after = auth_store.lockout_remaining(redis_client, body.email)
    if retry_after:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Đăng nhập sai quá nhiều lần, vui lòng thử lại sau",
                            headers={"Retry-After": str(retry_after)})

    user = db.scalars(select(User).where(User.email == body.email)).one_or_none()
    password_ok = verify_password(body.password, user.password_hash if user else dummy_password_hash())
    if user is None or not password_ok:
        auth_store.record_login_failure(redis_client, body.email)
        log_event("login_failed", level="warning", email=body.email)
        # Cùng một thông báo cho cả 2 trường hợp → không dò được email nào tồn tại
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không đúng")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị khóa hoặc vô hiệu hóa")

    auth_store.clear_login_failures(redis_client, body.email)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    log_event("login_succeeded", user_id=user.id)
    return {**_issue_tokens(user, redis_client), "user": UserOut.from_user(user)}


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db), redis_client=Depends(get_redis)):
    """Đổi refresh token lấy cặp token mới. Refresh token cũ bị vô hiệu ngay (rotation)."""
    try:
        claims = decode_token(body.refresh_token, REFRESH)
    except InvalidToken:
        raise _INVALID_REFRESH from None
    user_id = int(claims["sub"])
    if not auth_store.consume_refresh(redis_client, user_id, claims["jti"]):
        raise _INVALID_REFRESH
    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise _INVALID_REFRESH
    return _issue_tokens(user, redis_client)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, redis_client=Depends(get_redis)):
    """Thu hồi refresh token của thiết bị hiện tại. Idempotent: token sai/hết hạn vẫn trả 204.

    Access token còn hiệu lực tới khi hết hạn (tối đa vài phút) → client tự xóa nó.
    """
    try:
        claims = decode_token(body.refresh_token, REFRESH)
    except InvalidToken:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    auth_store.consume_refresh(redis_client, int(claims["sub"]), claims["jti"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.from_user(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    redis_client=Depends(get_redis),
):
    """Đổi mật khẩu của chính mình → đăng xuất mọi thiết bị (cần đăng nhập lại)."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng")
    if body.new_password == body.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mật khẩu mới phải khác mật khẩu hiện tại")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    auth_store.revoke_all_refresh(redis_client, user.id)
    log_event("password_changed", user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
