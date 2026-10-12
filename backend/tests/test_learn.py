from datetime import datetime, timezone

import pytest
from test_auth import bearer, tokens


@pytest.fixture
def course(seeded_db, dept_ids, sqlite_engine):
    """Khóa tuần tự hv@x.dev đang học.

    Chủ đề 1: bài đọc (ảnh nhúng + đính kèm), video, pdf. Chủ đề 2 (bị khóa): quiz luyện tập.
    Kèm 1 bài nháp và 1 khóa khác hv không được ghi danh.
    """
    from sqlalchemy.orm import Session

    from app.models import (
        Course,
        CourseSection,
        Enrollment,
        Lesson,
        LessonFile,
        Quiz,
        QuizQuestion,
        StorageObject,
    )

    hv, gv = seeded_db["hv@x.dev"], seeded_db["gv@x.dev"]
    with Session(sqlite_engine) as s:
        def obj(key, ctype, **kw):
            o = StorageObject(provider="minio", bucket="xlearn-media", object_key=key, original_filename=key,
                              content_type=ctype, upload_status=kw.pop("upload_status", "ready"), **kw)
            s.add(o)
            s.flush()
            return o

        c = Course(code="LRN-01", title="Học thử", department_id=dept_ids["HSE"], is_sequential=True,
                   status="published", created_by=gv)
        other = Course(code="OTHER", title="Khóa khác", status="published", created_by=gv)
        s.add_all([c, other])
        s.flush()
        sec1 = CourseSection(course_id=c.id, title="Chủ đề 1", sort_order=0)
        sec2 = CourseSection(course_id=c.id, title="Chủ đề 2", sort_order=1)
        sec_other = CourseSection(course_id=other.id, title="X")
        s.add_all([sec1, sec2, sec_other])
        s.flush()

        video = obj("v.mp4", "video/mp4", duration_seconds=600, size_bytes=1000)
        pdf = obj("tai lieu.pdf", "application/pdf", page_count=10)
        img = obj("anh.png", "image/png")
        att = obj("dinh-kem.pdf", "application/pdf")
        pending = obj("dang-tai.pdf", "application/pdf", upload_status="pending")

        def lesson(sec, title, kind, order, course_id=c.id, **kw):
            x = Lesson(course_id=course_id, section_id=sec.id, title=title, lesson_type=kind,
                       status=kw.pop("status", "published"), sort_order=order, **kw)
            s.add(x)
            s.flush()
            return x

        page = lesson(sec1, "Bài đọc", "page", 0, content=f"# Tiêu đề\n\n![sơ đồ](file:{img.id})", estimated_minutes=5)
        vid = lesson(sec1, "Video", "video", 1, media_object_id=video.id, description="Mô tả video")
        doc = lesson(sec1, "PDF", "pdf", 2, media_object_id=pdf.id)
        draft = lesson(sec1, "Nháp", "page", 3, status="draft")
        quiz = lesson(sec2, "Quiz", "quiz", 0)
        foreign = lesson(sec_other, "Bài khóa khác", "page", 0, course_id=other.id)
        s.add_all([
            LessonFile(lesson_id=page.id, storage_object_id=img.id, purpose="inline"),
            LessonFile(lesson_id=page.id, storage_object_id=att.id, purpose="attachment", sort_order=1),
            LessonFile(lesson_id=page.id, storage_object_id=pending.id, purpose="attachment", sort_order=2),
            Quiz(lesson_id=quiz.id, pass_score_percent=80, time_limit_seconds=900, max_attempts=2),
            Enrollment(course_id=c.id, user_id=hv),
        ])
        s.flush()
        s.add_all([QuizQuestion(quiz_id=quiz.id, question_type="true_false", content=f"Câu {i}") for i in range(3)])
        s.commit()
        return {"course": c.id, "other": other.id, "page": page.id, "video": vid.id, "pdf": doc.id,
                "draft": draft.id, "quiz": quiz.id, "foreign": foreign.id, "img": img.id, "att": att.id}


@pytest.fixture
def hv(client, course):
    return bearer(tokens(client, "hv@x.dev")["access_token"])


@pytest.fixture
def media_base(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_base_url", "http://cdn.test/")


def _url(ids, lesson, suffix=""):
    return f"/me/courses/{ids['course']}/lessons/{ids[lesson]}{suffix}"


def _open(client, hv, ids, lesson, **body):
    r = client.post(_url(ids, lesson, "/progress"), headers=hv, json=body or None)
    assert r.status_code == 200, r.text
    return r.json()


def test_bai_doc(client, hv, course, media_base):
    r = client.get(_url(course, "page"), headers=hv)
    assert r.status_code == 200, r.text
    x = r.json()
    assert x["lesson_type"] == "page" and x["content"].startswith("# Tiêu đề") and x["media"] is None
    assert x["progress"]["status"] == "not_started" and x["progress"]["started_at"] is None
    assert x["completion"] == {"code": "open", "percent": None}
    # File đang tải lên không trả về
    assert [(f["id"], f["purpose"]) for f in x["files"]] == [(course["img"], "inline"), (course["att"], "attachment")]
    assert x["files"][0]["url"] == "http://cdn.test/xlearn-media/anh.png"


def test_video_va_pdf(client, hv, course, media_base):
    v = client.get(_url(course, "video"), headers=hv).json()
    assert v["media"]["duration_seconds"] == 600 and v["media"]["url"] == "http://cdn.test/xlearn-media/v.mp4"
    assert v["description"] == "Mô tả video" and v["content"] is None and v["quiz"] is None
    p = client.get(_url(course, "pdf"), headers=hv).json()
    assert p["media"]["page_count"] == 10 and p["media"]["url"].endswith("/tai%20lieu.pdf")


def test_chua_cau_hinh_storage_thi_url_rong(client, hv, course):
    assert client.get(_url(course, "video"), headers=hv).json()["media"]["url"] is None


def test_mo_bai_la_hoan_thanh(client, hv, course):
    r = _open(client, hv, course, "page")
    assert r["progress"]["status"] == "completed" and r["progress"]["progress_percent"] == 100
    assert r["course"] == {"total_lessons": 4, "completed_lessons": 1, "progress_percent": 25,
                           "enrollment_status": "active", "completed_at": None}
    first_done = r["progress"]["completed_at"]

    # Mở lại: giữ nguyên, không đếm trùng
    again = _open(client, hv, course, "page")
    # [:26]: SQLite bỏ múi giờ khi đọc lại
    assert again["progress"]["completed_at"][:26] == first_done[:26] and again["course"]["completed_lessons"] == 1

    # Trang khóa học và GET bài thấy cùng số liệu
    detail = client.get(f"/me/courses/{course['course']}", headers=hv).json()
    assert detail["completed_lessons"] == 1 and detail["sections"][0]["lessons"][0]["status"] == "completed"
    assert client.get(_url(course, "page"), headers=hv).json()["progress"]["status"] == "completed"


def test_chu_de_tuan_tu_bi_khoa_roi_mo(client, hv, course):
    assert client.get(_url(course, "quiz"), headers=hv).status_code == 403
    assert client.post(_url(course, "quiz", "/progress"), headers=hv).status_code == 403
    for lesson in ("page", "video", "pdf"):
        _open(client, hv, course, lesson)
    q = client.get(_url(course, "quiz"), headers=hv)
    assert q.status_code == 200, q.text
    assert q.json()["quiz"] == {"is_graded": False, "pass_score_percent": 80, "time_limit_seconds": 900,
                                "max_attempts": 2, "question_count": 3, "review_policy": "after_submit",
                                "opens_at": None, "closes_at": None}
    assert q.json()["completion"]["code"] == "quiz_pass"


def test_quiz_mo_bai_khong_hoan_thanh(client, hv, course, sqlite_engine):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Course

    with Session(sqlite_engine) as s:
        s.execute(update(Course).where(Course.id == course["course"]).values(is_sequential=False))
        s.commit()
    r = _open(client, hv, course, "quiz")
    assert r["progress"]["status"] == "in_progress" and r["course"]["completed_lessons"] == 0
    detail = client.get(f"/me/courses/{course['course']}", headers=hv).json()
    assert detail["sections"][1]["status"] == "in_progress"


def test_hoan_thanh_moi_bai_thi_hoan_thanh_khoa(client, hv, course, sqlite_engine):
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app.learning import mark_completed
    from app.models import LessonProgress

    for lesson in ("page", "video", "pdf"):
        assert _open(client, hv, course, lesson)["course"]["enrollment_status"] == "active"
    _open(client, hv, course, "quiz")
    # Giả lập module quiz: làm đạt → đánh dấu hoàn thành
    with Session(sqlite_engine) as s:
        mark_completed(s.scalar(select(LessonProgress).where(LessonProgress.lesson_id == course["quiz"])))
        s.commit()
    r = _open(client, hv, course, "page")
    assert r["course"]["completed_lessons"] == 4 and r["course"]["progress_percent"] == 100
    assert r["course"]["enrollment_status"] == "completed" and r["course"]["completed_at"]
    assert client.get("/me/courses?status=completed", headers=hv).json()["total"] == 1


def test_quy_tac_theo_phan_tram(client, hv, course, monkeypatch):
    """Đổi quy tắc video sang 'xem ≥ 90%' chỉ bằng RULES; endpoint giữ nguyên."""
    from app import learning

    monkeypatch.setitem(learning.RULES, "video", learning.MinPercent(90))
    assert client.get(_url(course, "video"), headers=hv).json()["completion"] == {"code": "percent", "percent": 90}

    r = _open(client, hv, course, "video")
    assert r["progress"]["status"] == "in_progress" and r["progress"]["progress_percent"] == 0

    r = _open(client, hv, course, "video", position_seconds=300, time_spent_seconds=120)
    assert r["progress"]["progress_percent"] == 50 and r["progress"]["last_position_seconds"] == 300
    # Tua lại: vị trí đổi, % không giảm
    r = _open(client, hv, course, "video", position_seconds=60, time_spent_seconds=99999 // 100)
    assert r["progress"]["progress_percent"] == 50 and r["progress"]["last_position_seconds"] == 60
    assert r["progress"]["time_spent_seconds"] == 120 + 999

    r = _open(client, hv, course, "video", position_seconds=560)
    assert r["progress"]["status"] == "completed" and r["progress"]["progress_percent"] == 100


def test_pdf_theo_trang(client, hv, course, monkeypatch):
    from app import learning

    monkeypatch.setitem(learning.RULES, "pdf", learning.MinPercent(100))
    r = _open(client, hv, course, "pdf", page=4)
    assert (r["progress"]["status"], r["progress"]["progress_percent"], r["progress"]["last_page"]) == \
        ("in_progress", 40, 4)
    assert _open(client, hv, course, "pdf", page=10)["progress"]["status"] == "completed"


def test_thoi_gian_hoc_bi_gioi_han_moi_lan(client, hv, course, monkeypatch):
    from app import learning

    monkeypatch.setitem(learning.RULES, "page", learning.MinPercent(100))
    r = _open(client, hv, course, "page", time_spent_seconds=86400)
    assert r["progress"]["time_spent_seconds"] == learning.MAX_TIME_DELTA_SECONDS


@pytest.mark.parametrize("body", [{"progress_percent": 101}, {"position_seconds": -1}, {"page": 0},
                                  {"time_spent_seconds": -5}])
def test_so_lieu_khong_hop_le(client, hv, course, body):
    assert client.post(_url(course, "video", "/progress"), headers=hv, json=body).status_code == 422


@pytest.mark.parametrize("lesson", ["draft", "foreign"])
def test_bai_khong_xem_duoc_bi_404(client, hv, course, lesson):
    assert client.get(_url(course, lesson), headers=hv).status_code == 404
    assert client.post(_url(course, lesson, "/progress"), headers=hv).status_code == 404


def test_khong_duoc_ghi_danh(client, hv, course):
    assert client.get(f"/me/courses/{course['other']}/lessons/{course['foreign']}", headers=hv).status_code == 404
    admin = bearer(tokens(client, "admin@x.dev")["access_token"])
    assert client.get(_url(course, "page"), headers=admin).status_code == 404
    assert client.get(_url(course, "page")).status_code == 401


def test_bi_xoa_khoi_khoa_thi_khong_hoc_duoc(client, hv, course, sqlite_engine):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Enrollment

    with Session(sqlite_engine) as s:
        s.execute(update(Enrollment).values(status="removed", removed_at=datetime.now(timezone.utc)))
        s.commit()
    assert client.post(_url(course, "page", "/progress"), headers=hv).status_code == 404
