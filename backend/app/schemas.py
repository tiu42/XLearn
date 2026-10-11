"""Pydantic schema cho request/response của API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field


def _lower_email(value: str) -> str:
    return value.strip().lower()


def _bcrypt_limit(value: str) -> str:
    # bcrypt chỉ dùng 72 byte đầu (bcrypt>=5 ném lỗi nếu dài hơn) → chặn ngay ở tầng validate
    if len(value.encode()) > 72:
        raise ValueError("Mật khẩu tối đa 72 byte")
    return value


LoginEmail = Annotated[str, Field(min_length=3, max_length=255), AfterValidator(_lower_email)]
NewEmail = Annotated[EmailStr, AfterValidator(_lower_email)]
NewPassword = Annotated[str, Field(min_length=8), AfterValidator(_bcrypt_limit)]
UserStatus = Literal["active", "inactive", "locked"]
RoleCodes = Annotated[list[str], Field(min_length=1)]


# --------------------------------------------------------------------------- #
# Xác thực
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: LoginEmail
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: NewPassword


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Số giây access token còn hiệu lực")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    avatar_url: str | None
    status: str
    roles: list[str]
    last_login_at: datetime | None
    created_at: datetime

    @classmethod
    def from_user(cls, user) -> UserOut:
        return cls.model_validate({
            **{f: getattr(user, f) for f in cls.model_fields if f != "roles"},
            "roles": sorted(r.code for r in user.roles),
        })


class LoginResponse(TokenResponse):
    user: UserOut


# --------------------------------------------------------------------------- #
# Quản trị tài khoản
# --------------------------------------------------------------------------- #
class AdminUserCreate(BaseModel):
    email: NewEmail
    full_name: str = Field(min_length=1, max_length=150)
    password: NewPassword
    roles: RoleCodes


class AdminUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    status: UserStatus | None = None
    roles: RoleCodes | None = None


class ResetPasswordRequest(BaseModel):
    new_password: NewPassword


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int
