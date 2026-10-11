import inspect
import json
import signal

import pydantic
import pytest


def test_health_200(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_health_khong_co_dependency():
    from app.main import health
    assert not inspect.signature(health).parameters


def test_ready_200_khi_redis_song(client):
    r = client.get("/ready")
    assert r.status_code == 200 and r.json() == {"status": "ready", "redis": True, "database": True}


def test_ready_503_khi_redis_chet(client):
    from app.main import app
    from app.redis_client import get_redis

    class DeadRedis:
        def ping(self):
            raise ConnectionError("down")

    app.dependency_overrides[get_redis] = lambda: DeadRedis()
    assert client.get("/ready").status_code == 503
    assert client.get("/health").status_code == 200  # liveness không bị kéo theo


def test_ready_503_khi_db_chet(client):
    from app.db import get_engine
    from app.main import app

    class DeadEngine:
        def connect(self):
            raise ConnectionError("down")

    app.dependency_overrides[get_engine] = lambda: DeadEngine()
    r = client.get("/ready")
    assert r.status_code == 503 and r.json()["database"] is False and r.json()["redis"] is True
    assert client.get("/health").status_code == 200


def test_503_khi_dang_tat(client):
    from app.lifecycle import lifecycle

    lifecycle.shutting_down = True
    assert client.get("/health").status_code == 503
    assert client.get("/ready").status_code == 503


def test_lifecycle_goi_lai_handler_cu():
    from app.lifecycle import Lifecycle

    goc_term, goc_int = signal.getsignal(signal.SIGTERM), signal.getsignal(signal.SIGINT)
    called = []
    try:
        signal.signal(signal.SIGTERM, lambda s, f: called.append(s))
        life = Lifecycle()
        life.install()
        life.request_shutdown(signal.SIGTERM, None)
        assert life.shutting_down is True
        assert called == [signal.SIGTERM]
    finally:
        signal.signal(signal.SIGTERM, goc_term)
        signal.signal(signal.SIGINT, goc_int)


def test_log_mot_dong_json(capsys):
    from app.logging_utils import log_event

    log_event("x", level="INFO", user="u1")
    out = capsys.readouterr().out.strip()
    assert len(out.splitlines()) == 1
    data = json.loads(out)
    assert data["event"] == "x" and data["level"] == "info" and "timestamp" in data


def test_thieu_secret_thi_fail_fast(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("AGENT_API_KEY", raising=False)
    with pytest.raises(pydantic.ValidationError):
        Settings(_env_file=None)


def test_cors_origins_doc_tu_env(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("CORS_ORIGINS", "http://a.com, http://b.com")
    assert Settings(_env_file=None).cors_origins == ["http://a.com", "http://b.com"]
