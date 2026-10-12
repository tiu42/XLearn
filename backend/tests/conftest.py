import os

# Đặt env TRƯỚC khi import app
os.environ["REDIS_URL"] = "fake://"
os.environ["DATABASE_URL"] = "sqlite://"  # SQLite in-memory, không cần Postgres khi test
os.environ["AGENT_API_KEY"] = "test-key"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-at-least-32-characters"
os.environ["BCRYPT_ROUNDS"] = "4"  # cost thấp nhất để test chạy nhanh

import fakeredis
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def fake_redis():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture(autouse=True)
def reset_lifecycle():
    from app.lifecycle import lifecycle

    lifecycle.shutting_down = False
    yield
    lifecycle.shutting_down = False


@pytest.fixture
def sqlite_engine():
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    # StaticPool: mọi thread (TestClient chạy endpoint trong threadpool) dùng chung 1 DB in-memory
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    yield engine
    engine.dispose()


PASSWORD = "Password@123"


@pytest.fixture
def seeded_db(sqlite_engine):
    """Schema + vai trò + 2 phòng ban + 4 tài khoản mẫu. Trả về dict email → id."""
    from sqlalchemy.orm import Session

    from app.models import Base, Department, Role, User, UserRole
    from app.security import hash_password

    Base.metadata.create_all(sqlite_engine)
    pw = hash_password(PASSWORD)
    with Session(sqlite_engine) as s:
        s.add_all([Role(id=1, code="admin", name="Admin"), Role(id=2, code="instructor", name="GV"),
                   Role(id=3, code="student", name="HV")])
        vh = Department(code="VH", name="Vận hành")
        s.add_all([vh, Department(code="HSE", name="An toàn")])
        s.flush()
        users = {
            "admin@x.dev": ([1], "active", None, None),
            "gv@x.dev": ([2], "active", None, None),
            "hv@x.dev": ([3], "active", "NV0001", vh.id),
            "locked@x.dev": ([3], "locked", None, None),
        }
        ids = {}
        for email, (role_ids, st, code, dept_id) in users.items():
            u = User(email=email, full_name=email.split("@")[0], password_hash=pw, status=st,
                     employee_code=code, department_id=dept_id)
            s.add(u)
            s.flush()
            s.add_all(UserRole(user_id=u.id, role_id=r) for r in role_ids)
            ids[email] = u.id
        s.commit()
    return ids


@pytest.fixture
def dept_ids(seeded_db, sqlite_engine):
    """Mã phòng ban → id (phòng ban tạo trong seeded_db)."""
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app.models import Department

    with Session(sqlite_engine) as s:
        return {d.code: d.id for d in s.scalars(select(Department))}


@pytest.fixture
def client(fake_redis, sqlite_engine):
    from app.db import get_engine
    from app.main import app
    from app.redis_client import get_redis

    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_engine] = lambda: sqlite_engine
    # Không dùng `with TestClient(...)`: tránh lifespan cài signal handler khi test
    yield TestClient(app)
    app.dependency_overrides.clear()
