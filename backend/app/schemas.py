"""Pydantic schema cho request/response của API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints


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
# Mã nhân viên: bỏ khoảng trắng, viết hoa (nv0412 → NV0412) để UNIQUE không bị lách bằng chữ thường
EmployeeCode = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=20)]


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


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    employee_code: str | None
    department: DepartmentOut | None
    avatar_url: str | None
    status: str
    roles: list[str]
    last_login_at: datetime | None
    created_at: datetime

    @classmethod
    def from_user(cls, user) -> UserOut:
        return cls.model_validate({
            **{f: getattr(user, f) for f in cls.model_fields if f not in ("roles", "department")},
            "department": user.department,
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
    employee_code: EmployeeCode | None = None
    department_id: int | None = None


class AdminUserUpdate(BaseModel):
    """Trường bỏ trống = giữ nguyên. Riêng employee_code / department_id: gửi null = xóa giá trị."""

    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    status: UserStatus | None = None
    roles: RoleCodes | None = None
    employee_code: EmployeeCode | None = None
    department_id: int | None = None


class ResetPasswordRequest(BaseModel):
    new_password: NewPassword


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int


# --------------------------------------------------------------------------- #
# Khóa học của tôi (học viên)
# --------------------------------------------------------------------------- #
MyCourseStatus = Literal["active", "completed"]
MyCourseSort = Literal["title", "recent", "due"]


class MyCourseOut(BaseModel):
    id: int  # courses.id
    code: str
    title: str
    short_description: str | None
    department: DepartmentOut | None
    is_mandatory: bool
    thumbnail_url: str | None
    course_status: str
    enrollment_status: MyCourseStatus
    enrolled_at: datetime
    due_at: datetime | None
    completed_at: datetime | None
    total_lessons: int
    completed_lessons: int
    progress_percent: float
    last_activity_at: datetime | None


class MyCourseListOut(BaseModel):
    items: list[MyCourseOut]
    total: int
    # Phòng ban của mọi khóa đang ghi danh (không phụ thuộc bộ lọc) → dựng ô lọc phòng ban
    departments: list[DepartmentOut]


LessonProgressStatus = Literal["not_started", "in_progress", "completed"]


class MyLessonOut(BaseModel):
    id: int
    title: str
    lesson_type: str
    estimated_minutes: int | None
    status: LessonProgressStatus


class MySectionOut(BaseModel):
    id: int
    title: str
    description: str | None
    total_lessons: int
    completed_lessons: int
    status: LessonProgressStatus
    # Khóa học tuần tự: chủ đề bị khóa khi còn chủ đề đứng trước chưa hoàn thành
    locked: bool
    lessons: list[MyLessonOut]


class MyCourseDetailOut(MyCourseOut):
    description: str | None
    is_sequential: bool
    # Điểm đạt của bài kiểm tra tính điểm cuối cùng trong khóa; None = khóa không có bài tính điểm
    final_pass_percent: float | None
    sections: list[MySectionOut]
