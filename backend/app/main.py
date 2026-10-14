from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .config import get_settings
from .lifecycle import lifecycle
from .logging_utils import log_event
from .redis_client import get_redis, ping
from .routers import (
    admin_users,
    auth,
    departments,
    learn,
    my_courses,
    quiz,
    teach_content,
    teach_courses,
    teach_learners,
    teach_students,
    teach_uploads,
    timeline,
)

FRUITS_KEY = "fruits:all"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()  # thiếu secret → crash ngay tại đây (fail fast)
    lifecycle.install()  # sau khi uvicorn đã đăng ký handler của nó
    log_event("service_started", service=settings.app_name,
              version=settings.app_version, environment=settings.environment)
    yield
    if get_redis.cache_info().currsize:
        get_redis().close()
    if db.get_engine.cache_info().currsize:
        db.get_engine().dispose()  # đóng connection pool
    log_event("service_stopped", service=settings.app_name)


app = FastAPI(title=get_settings().app_name, version=get_settings().app_version,
              lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(my_courses.router)
app.include_router(learn.router)
app.include_router(quiz.router)
app.include_router(timeline.router)
app.include_router(departments.router)
app.include_router(teach_courses.router)
app.include_router(teach_content.router)
app.include_router(teach_uploads.router)
app.include_router(teach_learners.router)
app.include_router(teach_students.router)


@app.get("/health")
def health():
    """Liveness: KHÔNG nhận tham số, KHÔNG gọi Redis."""
    if lifecycle.shutting_down:
        return JSONResponse(status_code=503, content={"status": "shutting_down"})
    settings = get_settings()
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@app.get("/ready")
def ready(redis_client=Depends(get_redis), engine=Depends(db.get_engine)):
    """Readiness: kiểm tra dependency."""
    if lifecycle.shutting_down:
        return JSONResponse(status_code=503, content={"status": "shutting_down"})
    checks = {"redis": ping(redis_client), "database": db.ping(engine)}
    if not all(checks.values()):
        return JSONResponse(status_code=503, content={"status": "not ready", **checks})
    return {"status": "ready", **checks}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=get_settings().port)
