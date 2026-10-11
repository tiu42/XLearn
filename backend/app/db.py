"""SQLAlchemy engine, session và kiểm tra kết nối database."""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import Session

from .config import get_settings


def normalize_url(url: str) -> URL:
    """postgresql:// hoặc postgres:// (Railway/Heroku) → postgresql+psycopg:// (psycopg 3).

    Cấu hình chỉ cần URL chuẩn; đổi DBMS = đổi DATABASE_URL, không sửa code.
    """
    parsed = make_url(url)
    if parsed.drivername in ("postgresql", "postgres"):
        parsed = parsed.set(drivername="postgresql+psycopg")
    return parsed


def create_db_engine(url: str | None = None) -> Engine:
    settings = get_settings()
    parsed = normalize_url(url or settings.database_url)
    kwargs: dict = {"pool_pre_ping": True, "echo": settings.db_echo}
    if parsed.get_backend_name() == "postgresql":
        kwargs["pool_size"] = settings.db_pool_size
        kwargs["connect_args"] = {
            "connect_timeout": 2,  # /ready không được treo khi DB chết
            "options": "-c timezone=UTC",  # schema quy ước lưu thời gian theo UTC
        }
    return create_engine(parsed, **kwargs)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Provider: tạo engine (kèm connection pool) lần đầu cần dùng. Test thay bằng dependency_overrides."""
    return create_db_engine()


def get_db(engine: Engine = Depends(get_engine)) -> Iterator[Session]:
    """Một session cho mỗi request. Endpoint tự gọi session.commit() khi ghi dữ liệu."""
    with Session(engine, expire_on_commit=False) as session:
        yield session


def ping(engine: Engine) -> bool:
    """True nếu DB trả lời. Không bao giờ để exception thoát ra ngoài."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
