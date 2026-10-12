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


# --------------------------------------------------------------------------- #
# Trang khóa học (chi tiết)
# --------------------------------------------------------------------------- #
@pytest.fixture
def outline(seeded_db, dept_ids, sqlite_engine):
    """Khóa tuần tự 'SEQ-01' hv@x.dev đang học: 3 chủ đề hiển thị + 1 chủ đề rỗng + 1 chủ đề đã xóa."""
    from sqlalchemy.orm import Session

    from app.models import Course, CourseSection, Enrollment, Lesson, LessonProgress, Quiz

    hv, gv = seeded_db["hv@x.dev"], seeded_db["gv@x.dev"]
    with Session(sqlite_engine) as s:
        c = Course(code="SEQ-01", title="Khóa tuần tự", description="Mô tả dài", department_id=dept_ids["HSE"],
                   is_mandatory=True, is_sequential=True, status="published", created_by=gv)
        s.add(c)
        s.flush()

        def section(title, order, deleted=False):
            sec = CourseSection(course_id=c.id, title=title, description=f"Về {title}", sort_order=order,
                                deleted_at=_dt(1, 1) if deleted else None)
            s.add(sec)
            s.flush()
            return sec

        def lesson(sec, title, order, kind="page", status="published", minutes=5):
            x = Lesson(course_id=c.id, section_id=sec.id, title=title, lesson_type=kind, status=status,
                       sort_order=order, estimated_minutes=minutes)
            s.add(x)
            s.flush()
            return x

        # Thứ tự chèn khác sort_order để kiểm tra sắp xếp
        cuoi = section("Cuối khóa", 3)
        mo_dau = section("Mở đầu", 0)
        rong = section("Rỗng", 1)  # chỉ có bài nháp → không hiện
        chinh = section("Nội dung", 2)
        xoa = section("Đã xóa", 4, deleted=True)

        intro = lesson(mo_dau, "Giới thiệu", 0)
        lesson(rong, "Nháp", 0, status="draft")
        b2 = lesson(chinh, "Bài 2", 1)
        b1 = lesson(chinh, "Bài 1", 0)
        practice = lesson(chinh, "Luyện tập", 2, kind="quiz", minutes=15)
        final = lesson(cuoi, "Kiểm tra cuối", 0, kind="quiz", minutes=30)
        hidden = lesson(xoa, "Bài trong chủ đề đã xóa", 0)
        s.add_all([
            Quiz(lesson_id=practice.id, pass_score_percent=70, is_graded=False),
            Quiz(lesson_id=final.id, pass_score_percent=80, is_graded=True),
            LessonProgress(user_id=hv, lesson_id=intro.id, status="completed", updated_at=_dt(10, 1)),
            LessonProgress(user_id=hv, lesson_id=b1.id, status="completed", updated_at=_dt(10, 3)),
            LessonProgress(user_id=hv, lesson_id=b2.id, status="in_progress", updated_at=_dt(10, 4)),
            LessonProgress(user_id=hv, lesson_id=hidden.id, status="completed", updated_at=_dt(10, 9)),
            LessonProgress(user_id=gv, lesson_id=final.id, status="completed"),  # tiến độ người khác
            Enrollment(course_id=c.id, user_id=hv, due_at=_dt(10, 31), enrolled_at=_dt(9, 1)),
        ])
        s.commit()
        return c.id


def test_chi_tiet_khoa_hoc(client, outline):
    h = bearer(tokens(client, "hv@x.dev")["access_token"])
    r = client.get(f"/me/courses/{outline}", headers=h)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["code"] == "SEQ-01" and c["description"] == "Mô tả dài" and c["is_sequential"] is True
    assert c["department"]["code"] == "HSE" and c["due_at"].startswith("2026-10-31")
    assert c["enrollment_status"] == "active" and c["final_pass_percent"] == 80
    # Bài trong chủ đề đã xóa không tính, bài nháp không tính
    assert (c["total_lessons"], c["completed_lessons"], c["progress_percent"]) == (5, 2, 40)
    assert c["last_activity_at"].startswith("2026-10-04")

    secs = c["sections"]
    assert [s["title"] for s in secs] == ["Mở đầu", "Nội dung", "Cuối khóa"]
    assert [(s["status"], s["locked"], s["completed_lessons"], s["total_lessons"]) for s in secs] == [
        ("completed", False, 1, 1), ("in_progress", False, 1, 3), ("not_started", True, 0, 1)]
    assert secs[1]["description"] == "Về Nội dung"
    assert [(x["title"], x["lesson_type"], x["status"]) for x in secs[1]["lessons"]] == [
        ("Bài 1", "page", "completed"), ("Bài 2", "page", "in_progress"), ("Luyện tập", "quiz", "not_started")]
    assert secs[2]["lessons"][0]["estimated_minutes"] == 30


def test_chi_tiet_khop_so_lieu_voi_danh_sach(client, outline):
    h = bearer(tokens(client, "hv@x.dev")["access_token"])
    item = client.get("/me/courses?q=SEQ", headers=h).json()["items"][0]
    detail = client.get(f"/me/courses/{outline}", headers=h).json()
    for key in ("total_lessons", "completed_lessons", "progress_percent", "last_activity_at"):
        assert item[key] == detail[key], key


def test_khoa_khong_tuan_tu_khong_khoa_chu_de(client, outline, sqlite_engine):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Course

    with Session(sqlite_engine) as s:
        s.execute(update(Course).where(Course.id == outline).values(is_sequential=False))
        s.commit()
    h = bearer(tokens(client, "hv@x.dev")["access_token"])
    secs = client.get(f"/me/courses/{outline}", headers=h).json()["sections"]
    assert [s["locked"] for s in secs] == [False, False, False]


def test_chi_tiet_khoa_chua_co_bai(client, hv, courses):
    bmtt = client.get("/me/courses?q=BMTT", headers=hv).json()["items"][0]
    c = client.get(f"/me/courses/{bmtt['id']}", headers=hv).json()
    assert c["sections"] == [] and c["total_lessons"] == 0 and c["final_pass_percent"] is None


def test_chi_tiet_khoa_da_hoan_thanh(client, hv):
    done = client.get("/me/courses?status=completed", headers=hv).json()["items"][0]
    assert client.get(f"/me/courses/{done['id']}", headers=hv).json()["enrollment_status"] == "completed"


@pytest.mark.parametrize("code", ["SCC-01", "HC-02", "OLD-01"])  # bị xóa khỏi khóa, khóa nháp, khóa đã xóa
def test_chi_tiet_khoa_khong_duoc_xem_bi_404(client, hv, sqlite_engine, code):
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app.models import Course

    with Session(sqlite_engine) as s:
        course_id = s.scalar(select(Course.id).where(Course.code == code))
    r = client.get(f"/me/courses/{course_id}", headers=hv)
    assert r.status_code == 404 and "không được ghi danh" in r.json()["detail"]


def test_chi_tiet_khoa_cua_nguoi_khac_hoac_khong_ton_tai(client, outline):
    h = bearer(tokens(client, "admin@x.dev")["access_token"])
    assert client.get(f"/me/courses/{outline}", headers=h).status_code == 404
    assert client.get("/me/courses/999999", headers=h).status_code == 404
    assert client.get(f"/me/courses/{outline}").status_code == 401
