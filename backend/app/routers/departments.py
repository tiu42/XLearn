"""Danh mục phòng ban: dựng ô chọn phòng ban (form khóa học, bộ lọc)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Department, User
from ..schemas import DepartmentOut

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
def list_departments(_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Department).order_by(Department.name)).all()
