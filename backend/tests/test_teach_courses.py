import pytest
from test_auth import bearer, tokens


@pytest.fixture
def users(client, seeded_db, sqlite_engine):
    """Thêm gv2 (giảng viên khác) và tg (trợ giảng). Trả về email → headers."""
    from sqlalchemy.orm import Session

    from app.models import User, UserRole

    with Session(sqlite_engine) as s:
        pw = s.get(User, seeded_db["gv@x.dev"]).password_hash
        for email in ("gv2@x.dev", "tg@x.dev"):
            u = User(email=email, full_name=email.split("@")[0], password_hash=pw)
            s.add(u)
            s.flush()
            s.add(UserRole(user_id=u.id, role_id=2))
            seeded_db[email] = u.id
        s.commit()
    return {e: bearer(tokens(client, e)["access_token"])
            for e in ("admin@x.dev", "gv@x.dev", "gv2@x.dev", "tg@x.dev", "hv@x.dev")}


def _create(client, headers, **body):
    r = client.post("/teach/courses", json={"code": "atld-01", "title": "An toàn lao động", **body}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def course(client, users, seeded_db, sqlite_engine):
    """Khóa của gv: tg là trợ giảng; 1 chủ đề, 2 bài + 1 quiz (+ 1 bài đã xóa mềm); 3 ghi danh."""
    from datetime import datetime, timezone

    from sqlalchemy.orm import Session

    from app.models import CourseInstructor, CourseSection, Enrollment, Lesson

    c = _create(client, users["gv@x.dev"])
    with Session(sqlite_engine) as s:
        s.add(CourseInstructor(course_id=c["id"], user_id=seeded_db["tg@x.dev"], instructor_role="assistant"))
        sec = CourseSection(course_id=c["id"], title="Chủ đề 1")
        s.add(sec)
        s.flush()
        s.add_all([Lesson(course_id=c["id"], section_id=sec.id, title=t, lesson_type=k, deleted_at=d)
                   for t, k, d in [("Bài 1", "page", None), ("Bài 2", "page", None), ("Quiz", "quiz", None),
                                   ("Đã xóa", "page", datetime(2026, 1, 1, tzinfo=timezone.utc))]])
        s.add_all([Enrollment(course_id=c["id"], user_id=seeded_db["hv@x.dev"], status="completed"),
                   Enrollment(course_id=c["id"], user_id=seeded_db["admin@x.dev"]),
                   Enrollment(course_id=c["id"], user_id=seeded_db["locked@x.dev"], status="removed")])
        s.commit()
    return c


# --------------------------------------------------------------------------- #
# Tạo
# --------------------------------------------------------------------------- #
def test_tao_khoa_hoc(client, users, dept_ids):
    c = _create(client, users["gv@x.dev"], department_id=dept_ids["HSE"], is_mandatory=True,
                default_due_at="2026-10-31T16:59:59Z", status="published")
    assert c["code"] == "ATLD-01"  # chuẩn hóa chữ hoa
    assert c["department"]["code"] == "HSE" and c["is_mandatory"] is True
    assert c["my_role"] == "owner" and c["can_edit"] and c["can_delete"]
    assert c["published_at"] is not None
    assert (c["lesson_count"], c["quiz_count"], c["learner_count"]) == (0, 0, 0)
    # Người tạo thấy ngay khóa trong danh sách của mình
    assert [x["id"] for x in client.get("/teach/courses", headers=users["gv@x.dev"]).json()["items"]] == [c["id"]]


def test_tao_khoa_nhap_chua_co_ngay_mo(client, users):
    c = _create(client, users["gv@x.dev"])
    assert c["status"] == "draft" and c["published_at"] is None


def test_tao_trung_ma_bi_409(client, users):
    _create(client, users["gv@x.dev"])
    r = client.post("/teach/courses", json={"code": " ATLD-01 ", "title": "Khác"}, headers=users["gv2@x.dev"])
    assert r.status_code == 409 and r.json()["detail"] == "Mã khóa học đã được sử dụng"


@pytest.mark.parametrize("body", [{"code": "  ", "title": "A"}, {"code": "A", "title": ""},
                                  {"code": "A", "title": "B", "status": "deleted"}])
def test_tao_du_lieu_sai_bi_422(client, users, body):
    assert client.post("/teach/courses", json=body, headers=users["gv@x.dev"]).status_code == 422


def test_tao_phong_ban_khong_ton_tai_bi_422(client, users):
    r = client.post("/teach/courses", json={"code": "A", "title": "B", "department_id": 999},
                    headers=users["gv@x.dev"])
    assert r.status_code == 422 and r.json()["detail"] == "Phòng ban không tồn tại"


def test_hoc_vien_khong_duoc_tao_khoa(client, users):
    assert client.post("/teach/courses", json={"code": "A", "title": "B"}, headers=users["hv@x.dev"]).status_code == 403
    assert client.get("/teach/courses", headers=users["hv@x.dev"]).status_code == 403
    assert client.get("/teach/courses").status_code == 401


# --------------------------------------------------------------------------- #
# Danh sách & chi tiết
# --------------------------------------------------------------------------- #
def test_danh_sach_chi_gom_khoa_phu_trach_kem_so_lieu(client, users, course):
    other = _create(client, users["gv2@x.dev"], code="BMTT")

    mine = client.get("/teach/courses", headers=users["gv@x.dev"]).json()
    assert mine["total"] == 1
    c = mine["items"][0]
    # Bài đã xóa mềm không tính; học viên bị xóa khỏi khóa không tính
    assert (c["lesson_count"], c["quiz_count"], c["learner_count"], c["completed_count"]) == (2, 1, 2, 1)

    tg = client.get("/teach/courses", headers=users["tg@x.dev"]).json()["items"]
    assert [(x["id"], x["my_role"], x["can_edit"], x["can_delete"]) for x in tg] == \
        [(course["id"], "assistant", False, False)]

    # Admin thấy mọi khóa (khóa tạo sau đứng trước), không phụ trách → my_role None
    admin = client.get("/teach/courses", headers=users["admin@x.dev"]).json()["items"]
    assert [x["id"] for x in admin] == [other["id"], course["id"]]
    assert admin[0]["my_role"] is None and admin[0]["can_edit"] and admin[0]["can_delete"]


def test_danh_sach_loc_trang_thai_va_tim_kiem(client, users):
    _create(client, users["gv@x.dev"], code="ATLD-01", title="An toàn lao động", status="published")
    _create(client, users["gv@x.dev"], code="HC-02", title="Hóa chất")
    h = users["gv@x.dev"]

    def codes(query):
        return [x["code"] for x in client.get(f"/teach/courses{query}", headers=h).json()["items"]]

    assert codes("?status=draft") == ["HC-02"]
    assert codes("?q=atld") == ["ATLD-01"]
    assert codes("?q=hóa") == ["HC-02"]


def test_xem_chi_tiet(client, users, course):
    r = client.get(f"/teach/courses/{course['id']}", headers=users["tg@x.dev"])
    assert r.status_code == 200 and r.json()["learner_count"] == 2
    assert client.get(f"/teach/courses/{course['id']}", headers=users["gv2@x.dev"]).status_code == 403
    assert client.get("/teach/courses/999", headers=users["admin@x.dev"]).status_code == 404


# --------------------------------------------------------------------------- #
# Sửa
# --------------------------------------------------------------------------- #
def test_sua_thong_tin(client, users, course, dept_ids):
    url, h = f"/teach/courses/{course['id']}", users["gv@x.dev"]
    r = client.patch(url, json={"title": "Tên mới", "code": "atld-02", "department_id": dept_ids["VH"],
                                "is_sequential": True, "status": "published",
                                "default_due_at": "2026-12-31T16:59:59Z"}, headers=h)
    assert r.status_code == 200, r.text
    c = r.json()
    assert (c["title"], c["code"], c["department"]["code"], c["is_sequential"], c["status"]) == \
        ("Tên mới", "ATLD-02", "VH", True, "published")
    published_at = c["published_at"]
    assert published_at is not None

    # null = xóa giá trị (trường cho phép NULL); trường không gửi giữ nguyên
    c = client.patch(url, json={"department_id": None, "default_due_at": None, "status": "archived"},
                     headers=h).json()
    assert c["department"] is None and c["default_due_at"] is None and c["title"] == "Tên mới"
    # Mở lại không đổi thời điểm mở lần đầu
    assert client.patch(url, json={"status": "published"}, headers=h).json()["published_at"] == published_at


def test_sua_title_null_giu_nguyen(client, users, course):
    r = client.patch(f"/teach/courses/{course['id']}", json={"title": None}, headers=users["gv@x.dev"])
    assert r.status_code == 200 and r.json()["title"] == "An toàn lao động"


def test_sua_trung_ma_bi_409(client, users, course):
    _create(client, users["gv@x.dev"], code="HC-02")
    r = client.patch(f"/teach/courses/{course['id']}", json={"code": "hc-02"}, headers=users["gv@x.dev"])
    assert r.status_code == 409
    # Giữ nguyên mã của chính mình thì không coi là trùng
    assert client.patch(f"/teach/courses/{course['id']}", json={"code": "ATLD-01"},
                        headers=users["gv@x.dev"]).status_code == 200


def test_quyen_sua(client, users, course):
    url = f"/teach/courses/{course['id']}"
    assert client.patch(url, json={"title": "X"}, headers=users["tg@x.dev"]).status_code == 403
    assert client.patch(url, json={"title": "X"}, headers=users["gv2@x.dev"]).status_code == 403
    assert client.patch(url, json={"title": "Admin sửa"}, headers=users["admin@x.dev"]).status_code == 200


# --------------------------------------------------------------------------- #
# Xóa
# --------------------------------------------------------------------------- #
def test_xoa_mem(client, users, course, sqlite_engine):
    from sqlalchemy.orm import Session

    from app.models import Course

    url = f"/teach/courses/{course['id']}"
    assert client.delete(url, headers=users["tg@x.dev"]).status_code == 403
    assert client.delete(url, headers=users["gv@x.dev"]).status_code == 204

    assert client.get(url, headers=users["gv@x.dev"]).status_code == 404
    assert client.patch(url, json={"title": "X"}, headers=users["gv@x.dev"]).status_code == 404
    assert client.delete(url, headers=users["gv@x.dev"]).status_code == 404
    assert client.get("/teach/courses", headers=users["gv@x.dev"]).json()["total"] == 0
    with Session(sqlite_engine) as s:
        assert s.get(Course, course["id"]).deleted_at is not None  # dữ liệu vẫn còn


def test_khoa_da_xoa_an_voi_hoc_vien(client, users, course):
    client.patch(f"/teach/courses/{course['id']}", json={"status": "published"}, headers=users["gv@x.dev"])
    assert client.get(f"/me/courses/{course['id']}", headers=users["hv@x.dev"]).status_code == 200
    client.delete(f"/teach/courses/{course['id']}", headers=users["gv@x.dev"])
    assert client.get(f"/me/courses/{course['id']}", headers=users["hv@x.dev"]).status_code == 404


def test_admin_xoa_khoa_bat_ky(client, users, course):
    assert client.delete(f"/teach/courses/{course['id']}", headers=users["admin@x.dev"]).status_code == 204


# --------------------------------------------------------------------------- #
# Phòng ban
# --------------------------------------------------------------------------- #
def test_danh_sach_phong_ban(client, users):
    r = client.get("/departments", headers=users["hv@x.dev"])
    assert r.status_code == 200
    assert [d["code"] for d in r.json()] == ["HSE", "VH"]  # "An toàn" < "Vận hành"
    assert client.get("/departments").status_code == 401
