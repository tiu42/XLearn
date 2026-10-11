"""Dependency xác thực & phân quyền dùng chung cho các router."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import CourseInstructor, User
from .security import ACCESS, InvalidToken, decode_token

ADMIN = "admin"
INSTRUCTOR = "instructor"
STUDENT = "student"

# auto_error=False: tự trả 401 (mặc định FastAPI trả 403 khi thiếu header)
_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={"WWW-Authenticate": "Bearer"})


def role_codes(user: User) -> set[str]:
    return {r.code for r in user.roles}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Xác thực access token và nạp user từ DB.

    Đọc lại user mỗi request → khóa tài khoản / đổi vai trò có hiệu lực ngay,
    không phải đợi access token hết hạn.
    """
    if credentials is None:
        raise _unauthorized("Chưa đăng nhập")
    try:
        claims = decode_token(credentials.credentials, ACCESS)
    except InvalidToken:
        raise _unauthorized("Token không hợp lệ hoặc đã hết hạn") from None
    user = db.get(User, int(claims["sub"]))
    if user is None or user.status != "active":
        raise _unauthorized("Tài khoản không tồn tại hoặc đã bị khóa")
    return user


def require_roles(*codes: str):
    """Cho qua nếu user có ít nhất một trong các vai trò. Dùng: Depends(require_roles(ADMIN))."""
    allowed = set(codes)

    def checker(user: User = Depends(get_current_user)) -> User:
        if not role_codes(user) & allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền truy cập")
        return user

    return checker


def require_course_instructor(
    course_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Giảng viên phụ trách khóa (bảng course_instructors) hoặc admin.

    Dùng cho route có path param `course_id`, vd: PUT /courses/{course_id}.
    """
    if ADMIN in role_codes(user) or db.get(CourseInstructor, (course_id, user.id)):
        return user
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Bạn không phụ trách khóa học này")
