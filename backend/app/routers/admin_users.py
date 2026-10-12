"""Quản trị tài khoản (chỉ admin): tạo tài khoản, cấp/thu hồi vai trò, khóa, đặt lại mật khẩu.

Không có xóa cứng: vô hiệu hóa bằng status 'inactive'/'locked' để giữ lịch sử học tập.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import auth_store
from ..db import get_db
from ..deps import ADMIN, require_roles
from ..logging_utils import log_event
from ..models import Department, Role, User, UserRole
from ..redis_client import get_redis
from ..schemas import AdminUserCreate, AdminUserUpdate, ResetPasswordRequest, UserListOut, UserOut, UserStatus
from ..security import hash_password

router = APIRouter(prefix="/admin/users", tags=["admin: users"])


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    return user


_DUPLICATE_EMAIL = HTTPException(status.HTTP_409_CONFLICT, detail="Email đã được sử dụng")
_DUPLICATE_CODE = HTTPException(status.HTTP_409_CONFLICT, detail="Mã nhân viên đã được sử dụng")


def _check_department(db: Session, department_id: int | None) -> None:
    if department_id is not None and db.get(Department, department_id) is None:
        raise HTTPException(422, detail="Phòng ban không tồn tại")


def _code_taken(db: Session, code: str | None, except_user_id: int | None = None) -> bool:
    if code is None:
        return False
    stmt = select(User.id).where(User.employee_code == code)
    if except_user_id is not None:
        stmt = stmt.where(User.id != except_user_id)
    return db.scalars(stmt).first() is not None


def _set_roles(db: Session, user: User, codes: list[str]) -> None:
    roles = db.scalars(select(Role).where(Role.code.in_(sorted(set(codes))))).all()
    unknown = set(codes) - {r.code for r in roles}
    if unknown:
        raise HTTPException(422,  # hằng số đổi tên giữa các bản Starlette
                            detail=f"Vai trò không tồn tại: {', '.join(sorted(unknown))}")
    db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    db.add_all(UserRole(user_id=user.id, role_id=r.id) for r in roles)
    db.flush()
    db.expire(user, ["roles"])


@router.get("", response_model=UserListOut)
def list_users(
    role: str | None = None,
    status_filter: UserStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100, description="Tìm theo email, họ tên hoặc mã nhân viên"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_roles(ADMIN)),
    db: Session = Depends(get_db),
):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.id.in_(
            select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.code == role)))
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern),
                              User.employee_code.ilike(pattern)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    users = db.scalars(stmt.options(selectinload(User.roles), selectinload(User.department))
                       .order_by(User.id).limit(limit).offset(offset)).all()
    return {"items": [UserOut.from_user(u) for u in users], "total": total}


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminUserCreate,
    admin: User = Depends(require_roles(ADMIN)),
    db: Session = Depends(get_db),
):
    if db.scalars(select(User.id).where(User.email == body.email)).first():
        raise _DUPLICATE_EMAIL
    if _code_taken(db, body.employee_code):
        raise _DUPLICATE_CODE
    _check_department(db, body.department_id)
    user = User(email=body.email, full_name=body.full_name, password_hash=hash_password(body.password),
                employee_code=body.employee_code, department_id=body.department_id)
    db.add(user)
    try:
        db.flush()  # lấy user.id; trùng email/mã NV do race condition → IntegrityError
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email hoặc mã nhân viên đã được sử dụng") from None
    _set_roles(db, user, body.roles)
    db.commit()
    db.refresh(user)
    log_event("user_created", user_id=user.id, by=admin.id, roles=body.roles)
    return UserOut.from_user(user)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, _admin: User = Depends(require_roles(ADMIN)), db: Session = Depends(get_db)):
    return UserOut.from_user(_get_user_or_404(db, user_id))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_roles(ADMIN)),
    db: Session = Depends(get_db),
    redis_client=Depends(get_redis),
):
    user = _get_user_or_404(db, user_id)
    # Chặn admin tự khóa mình / tự bỏ quyền admin → hệ thống không còn ai quản trị
    if user.id == admin.id and (
        (body.status is not None and body.status != "active")
        or (body.roles is not None and ADMIN not in body.roles)
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Không thể tự khóa hoặc tự gỡ quyền admin của chính mình")

    # employee_code / department_id: có gửi (kể cả null) mới đổi → cho phép xóa giá trị
    if "employee_code" in body.model_fields_set:
        if _code_taken(db, body.employee_code, except_user_id=user.id):
            raise _DUPLICATE_CODE
        user.employee_code = body.employee_code
    if "department_id" in body.model_fields_set:
        _check_department(db, body.department_id)
        user.department_id = body.department_id
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.status is not None:
        user.status = body.status
    if body.roles is not None:
        _set_roles(db, user, body.roles)
    try:
        db.commit()
    except IntegrityError:  # trùng mã NV do race condition
        db.rollback()
        raise _DUPLICATE_CODE from None
    db.refresh(user)

    if user.status != "active":
        auth_store.revoke_all_refresh(redis_client, user.id)
    log_event("user_updated", user_id=user.id, by=admin.id,
              fields=sorted(body.model_fields_set))
    return UserOut.from_user(user)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    admin: User = Depends(require_roles(ADMIN)),
    db: Session = Depends(get_db),
    redis_client=Depends(get_redis),
):
    """Admin cấp lại mật khẩu → user bị đăng xuất mọi thiết bị."""
    user = _get_user_or_404(db, user_id)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    auth_store.revoke_all_refresh(redis_client, user.id)
    log_event("password_reset", user_id=user.id, by=admin.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
