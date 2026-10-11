"""Cấu hình 12-Factor: mọi giá trị đến từ biến môi trường."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # bỏ qua biến lạ trong .env
    )

    app_name: str = "xlearn-backend"
    app_version: str = "0.1.0"
    environment: str = "development"
    port: int = 8000
    log_level: str = "INFO"
    redis_url: str = "redis://localhost:6379/0"
    # URL chuẩn SQLAlchemy. postgresql:// tự được gắn driver psycopg (xem app/db.py)
    database_url: str = "postgresql://xlearn:xlearn@localhost:5432/xlearn"
    db_pool_size: int = 5
    db_echo: bool = False  # True → in mọi câu SQL ra log (chỉ bật khi debug)
    # Danh sách origin cách nhau bởi dấu phẩy, ví dụ: http://localhost:5173,https://xlearn.app
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # TTL (giây) cho key state trong Redis
    state_ttl_seconds: int = 7 * 24 * 3600
    # rate_limit_per_minute: int = 10
    # monthly_budget_usd: float = 10.0

    # Secret: KHÔNG có mặc định → thiếu là ValidationError ngay khi khởi động.
    agent_api_key: str
    jwt_secret_key: str = Field(min_length=32)  # ký JWT (HS256) — lộ khóa này = ai cũng giả được token

    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "xlearn"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    bcrypt_rounds: int = 12
    # Sai mật khẩu quá N lần trong cửa sổ thời gian → tạm khóa đăng nhập email đó
    login_max_failures: int = 5
    login_lockout_seconds: int = 15 * 60

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Đọc cấu hình một lần rồi cache lại (đọc env mỗi request là lãng phí)."""
    return Settings()
