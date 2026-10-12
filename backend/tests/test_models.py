"""Ràng buộc mới của schema (chủ đề, bài đọc, file bài học, quiz) chạy trên SQLite.

CHECK luôn được SQLite kiểm tra; khóa ngoại cần bật PRAGMA foreign_keys.
"""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Course, CourseSection, Lesson, LessonFile, Quiz, StorageObject, User


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _rec: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        u = User(email="gv@x.dev", full_name="GV", password_hash="x")
        s.add(u)
        s.flush()
        for code in ("A", "B"):
            c = Course(code=code, title=code, created_by=u.id)
            s.add(c)
            s.flush()
            s.add(CourseSection(course_id=c.id, title=f"Chủ đề {code}", sort_order=1))
        s.commit()
        yield s
    engine.dispose()


def _course(db, code):
    return db.query(Course).filter_by(code=code).one()


def _add(db, **kw):
    c = _course(db, "A")
    db.add(Lesson(course_id=c.id, section_id=c.sections[0].id, title="Bài", **kw))
    db.flush()


def test_bai_doc_khong_can_file(db):
    _add(db, lesson_type="page", content="# Tiêu đề\n\n| a | b |\n|---|---|\n| 1 | 2 |")


@pytest.mark.parametrize("lesson_type", ["video", "pdf"])
def test_video_pdf_bat_buoc_co_file(db, lesson_type):
    with pytest.raises(IntegrityError, match="ck_lessons_media"):
        _add(db, lesson_type=lesson_type)


def test_bai_doc_khong_duoc_gan_file_media(db):
    so = StorageObject(provider="minio", bucket="b", object_key="k.png", content_type="image/png")
    db.add(so)
    db.flush()
    with pytest.raises(IntegrityError, match="ck_lessons_media"):
        _add(db, lesson_type="page", media_object_id=so.id)


def test_bai_hoc_khong_gan_duoc_vao_chu_de_cua_khoa_khac(db):
    a, b = _course(db, "A"), _course(db, "B")
    db.add(Lesson(course_id=a.id, section_id=b.sections[0].id, title="Lạc khóa", lesson_type="page"))
    with pytest.raises(IntegrityError, match="FOREIGN KEY"):
        db.flush()


def test_lesson_files_chi_nhan_attachment_hoac_inline(db):
    _add(db, lesson_type="page")
    lesson = db.query(Lesson).one()
    anh = StorageObject(provider="minio", bucket="b", object_key="anh.png", content_type="image/png")
    tep = StorageObject(provider="minio", bucket="b", object_key="tep.pdf", content_type="application/pdf")
    db.add_all([anh, tep])
    db.flush()
    db.add(LessonFile(lesson_id=lesson.id, storage_object_id=anh.id, purpose="inline"))
    db.flush()
    assert lesson.files[0].purpose == "inline"
    db.add(LessonFile(lesson_id=lesson.id, storage_object_id=tep.id, purpose="cover"))
    with pytest.raises(IntegrityError, match="ck_lesson_files_purpose"):
        db.flush()


@pytest.mark.parametrize("fields,constraint", [
    ({"review_policy": "sometimes"}, "ck_quizzes_review"),
    ({"pass_score_percent": 120}, "ck_quizzes_pass"),
])
def test_rang_buoc_quiz(db, fields, constraint):
    _add(db, lesson_type="quiz")
    db.add(Quiz(lesson_id=db.query(Lesson).one().id, **fields))
    with pytest.raises(IntegrityError, match=constraint):
        db.flush()


def test_quiz_dong_phai_sau_mo(db):
    from datetime import datetime, timezone

    _add(db, lesson_type="quiz")
    t = datetime(2026, 10, 20, tzinfo=timezone.utc)
    db.add(Quiz(lesson_id=db.query(Lesson).one().id, opens_at=t, closes_at=t))
    with pytest.raises(IntegrityError, match="ck_quizzes_window"):
        db.flush()
