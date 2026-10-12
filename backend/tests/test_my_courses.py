from datetime import datetime, timezone

import pytest
from test_auth import bearer, tokens


def _dt(month, day):
    return datetime(2026, month, day, tzinfo=timezone.utc)


@pytest.fixture
def courses(seeded_db, dept_ids, sqlite_engine):
    """hv@x.dev ghi danh 5 khóa (1 bị xóa khỏi khóa, 1 khóa nháp, 1 khóa đã xóa mềm) + 2 khóa hợp lệ khác."""
    from sqlalchemy.orm import Session

    from app.models import Course, CourseSection, Enrollment, Lesson, LessonProgress

    hv, gv = seeded_db["hv@x.dev"], seeded_db["gv@x.dev"]
    with Session(sqlite_engine) as s:
        def course(code, title, dept, mandatory=False, status="published", deleted=False):
            c = Course(code=code, title=title, department_id=dept_ids[dept], is_mandatory=mandatory,
                       status=status, created_by=gv, deleted_at=_dt(1, 1) if deleted else None)
            s.add(c)
            s.flush()
            return c

        atld = course("ATLD-01", "An toàn lao động", "HSE", mandatory=True)
        bmtt = course("BMTT-2026", "Bảo mật thông tin", "VH", mandatory=True)
        ss = course("5S-01", "Quy trình 5S", "VH")
        removed = course("SCC-01", "Sơ cấp cứu", "HSE")
        draft = course("HC-02", "Hóa chất", "HSE", status="draft")
        gone = course("OLD-01", "Khóa cũ", "HSE", deleted=True)

        sec = CourseSection(course_id=atld.id, title="Chủ đề 1")
        s.add(sec)
        s.flush()
        lessons = [Lesson(course_id=atld.id, section_id=sec.id, title=f"Bài {i}", lesson_type="page",
                          status="published", sort_order=i) for i in range(4)]
        lessons.append(Lesson(course_id=atld.id, section_id=sec.id, title="Nháp", lesson_type="page"))
        s.add_all(lessons)
        s.flush()
        s.add_all([
            LessonProgress(user_id=hv, lesson_id=lessons[0].id, status="completed", updated_at=_dt(10, 5)),
            LessonProgress(user_id=hv, lesson_id=lessons[1].id, status="in_progress", updated_at=_dt(10, 9)),
            LessonProgress(user_id=hv, lesson_id=lessons[4].id, status="completed"),  # bài nháp: không tính
        ])
        s.add_all([
            Enrollment(course_id=atld.id, user_id=hv, due_at=_dt(10, 31), enrolled_at=_dt(9, 1)),
            Enrollment(course_id=bmtt.id, user_id=hv, due_at=_dt(10, 18), enrolled_at=_dt(9, 2)),
            Enrollment(course_id=ss.id, user_id=hv, status="completed", enrolled_at=_dt(10, 10)),
            Enrollment(course_id=removed.id, user_id=hv, status="removed"),
            Enrollment(course_id=draft.id, user_id=hv),
            Enrollment(course_id=gone.id, user_id=hv),
            Enrollment(course_id=ss.id, user_id=gv),  # ghi danh của người khác
        ])
        s.commit()


@pytest.fixture
def hv(client, courses):
    return bearer(tokens(client, "hv@x.dev")["access_token"])


def _codes(client, hv, query=""):
    r = client.get(f"/me/courses{query}", headers=hv)
    assert r.status_code == 200, r.text
    return [c["code"] for c in r.json()["items"]]


def test_chua_dang_nhap_bi_401(client):
    assert client.get("/me/courses").status_code == 401


def test_chi_hien_khoa_dang_ghi_danh_hop_le(client, hv):
    r = client.get("/me/courses", headers=hv).json()
    assert r["total"] == 3
    assert [c["code"] for c in r["items"]] == ["ATLD-01", "BMTT-2026", "5S-01"]  # theo tên
    assert [d["code"] for d in r["departments"]] == ["VH", "HSE"] or \
        sorted(d["code"] for d in r["departments"]) == ["HSE", "VH"]


def test_tien_do_chi_tinh_bai_da_publish(client, hv):
    atld = client.get("/me/courses?q=ATLD", headers=hv).json()["items"][0]
    assert atld["total_lessons"] == 4 and atld["completed_lessons"] == 1
    assert atld["progress_percent"] == 25
    assert atld["last_activity_at"].startswith("2026-10-09")
    assert atld["department"]["code"] == "HSE" and atld["is_mandatory"] is True
    bmtt = client.get("/me/courses?q=BMTT", headers=hv).json()["items"][0]
    assert bmtt["total_lessons"] == 0 and bmtt["progress_percent"] == 0 and bmtt["last_activity_at"] is None


@pytest.mark.parametrize("query,expected", [
    ("?status=active", ["ATLD-01", "BMTT-2026"]),
    ("?status=completed", ["5S-01"]),
    ("?q=bảo mật", ["BMTT-2026"]),
    ("?q=5s", ["5S-01"]),
    ("?q=khong-co", []),
    ("?mandatory=false", ["5S-01"]),
    ("?mandatory=true&status=active", ["ATLD-01", "BMTT-2026"]),
    ("?sort=due", ["BMTT-2026", "ATLD-01", "5S-01"]),     # không có hạn xếp cuối
    ("?sort=recent", ["5S-01", "ATLD-01", "BMTT-2026"]),  # chưa học → theo ngày ghi danh
])
def test_loc_tim_kiem_sap_xep(client, hv, query, expected):
    assert _codes(client, hv, query) == expected


def test_loc_theo_phong_ban(client, hv, dept_ids):
    assert _codes(client, hv, f"?department_id={dept_ids['VH']}") == ["BMTT-2026", "5S-01"]


def test_phan_trang(client, hv):
    page = client.get("/me/courses?limit=2&offset=2", headers=hv).json()
    assert page["total"] == 3 and [c["code"] for c in page["items"]] == ["5S-01"]
    assert client.get("/me/courses?limit=0", headers=hv).status_code == 422
    assert client.get("/me/courses?status=removed", headers=hv).status_code == 422


def test_hoc_vien_chua_ghi_danh(client, courses):
    h = bearer(tokens(client, "admin@x.dev")["access_token"])
    assert client.get("/me/courses", headers=h).json() == {"items": [], "total": 0, "departments": []}
