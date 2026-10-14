from datetime import datetime, timezone

import pytest
from test_auth import bearer, tokens
from test_teach_courses import _create, users  # noqa: F401  (fixture)


def _dt(day, hour=0):
    return datetime(2026, 10, day, hour, tzinfo=timezone.utc)


@pytest.fixture
def stats(client, users, seeded_db, sqlite_engine):  # noqa: F811
    """Khóa của gv (tg trợ giảng, hạn mặc định 31/10): 2 chủ đề, 2 bài đọc + quiz luyện tập + quiz cuối
    đã publish, 1 bài nháp. Học viên: hv (xong bài 1, quiz luyện tập đạt, quiz cuối 60% rồi 90%),
    hv2 (chưa học), hv3 (bị xóa, từng hoàn thành), hv4 (chưa ghi danh), locked (ghi danh, đã khóa)."""
    from sqlalchemy.orm import Session

    from app.models import (CourseInstructor, CourseSection, Enrollment, Lesson, LessonProgress, Quiz, QuizAttempt,
                            User, UserRole)

    c = _create(client, users["gv@x.dev"], default_due_at="2026-10-31T16:59:59Z")
    cid = c["id"]
    ids = {"course": cid}
    with Session(sqlite_engine) as s:
        s.add(CourseInstructor(course_id=cid, user_id=seeded_db["tg@x.dev"], instructor_role="assistant"))
        pw = s.get(User, seeded_db["hv@x.dev"]).password_hash
        for email, name in [("hv2@x.dev", "An"), ("hv3@x.dev", "Bình"), ("hv4@x.dev", "Cường")]:
            u = User(email=email, full_name=name, password_hash=pw, employee_code=email[:3].upper())
            s.add(u)
            s.flush()
            s.add(UserRole(user_id=u.id, role_id=3))
            seeded_db[email] = u.id
        s1, s2 = CourseSection(course_id=cid, title="Chủ đề 1", sort_order=1), \
            CourseSection(course_id=cid, title="Chủ đề 2", sort_order=2)
        s.add_all([s1, s2])
        s.flush()
        lessons = {}
        for key, sec, t, order, st in [("b1", s1, "page", 1, "published"), ("b2", s1, "page", 2, "published"),
                                       ("nhap", s1, "page", 3, "draft"), ("qz", s2, "quiz", 1, "published"),
                                       ("cuoi", s2, "quiz", 2, "published")]:
            lessons[key] = Lesson(course_id=cid, section_id=sec.id, title=key, lesson_type=t, sort_order=order,
                                  status=st)
        s.add_all(lessons.values())
        s.flush()
        s.add_all([Quiz(lesson_id=lessons["qz"].id, is_graded=False, pass_score_percent=50),
                   Quiz(lesson_id=lessons["cuoi"].id, is_graded=True, pass_score_percent=80, max_attempts=3)])
        hv, hv2, hv3 = seeded_db["hv@x.dev"], seeded_db["hv2@x.dev"], seeded_db["hv3@x.dev"]
        s.add_all([Enrollment(course_id=cid, user_id=hv, enrolled_at=_dt(1)),
                   Enrollment(course_id=cid, user_id=hv2, enrolled_at=_dt(2)),
                   Enrollment(course_id=cid, user_id=seeded_db["locked@x.dev"], enrolled_at=_dt(3)),
                   Enrollment(course_id=cid, user_id=hv3, status="removed", enrolled_at=_dt(1),
                              completed_at=_dt(5), removed_at=_dt(6))])
        s.add_all([LessonProgress(user_id=hv, lesson_id=lessons["b1"].id, status="completed", updated_at=_dt(4)),
                   LessonProgress(user_id=hv, lesson_id=lessons["nhap"].id, status="completed", updated_at=_dt(9)),
                   LessonProgress(user_id=hv, lesson_id=lessons["qz"].id, status="completed", updated_at=_dt(5)),
                   LessonProgress(user_id=hv, lesson_id=lessons["cuoi"].id, updated_at=_dt(6))])
        s.add_all([QuizAttempt(quiz_id=lessons["qz"].id, user_id=hv, attempt_no=1, status="submitted",
                               score_percent=100, passed=True, submitted_at=_dt(5)),
                   QuizAttempt(quiz_id=lessons["cuoi"].id, user_id=hv, attempt_no=1, status="submitted",
                               score_percent=60, passed=False, submitted_at=_dt(6)),
                   QuizAttempt(quiz_id=lessons["cuoi"].id, user_id=hv, attempt_no=2, status="expired",
                               score_percent=90, passed=True, submitted_at=_dt(7)),
                   QuizAttempt(quiz_id=lessons["cuoi"].id, user_id=hv, attempt_no=3, status="in_progress")])
        s.commit()
        ids.update({k: v.id for k, v in lessons.items()})
    return ids


def _url(ids, suffix=""):
    return f"/teach/courses/{ids['course']}{suffix}"


# --------------------------------------------------------------------------- #
# Thông số khóa học
# --------------------------------------------------------------------------- #
def test_thong_so_khoa_hoc(client, users, stats, seeded_db):
    r = client.get(_url(stats, "/stats"), headers=users["gv@x.dev"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["can_edit"] is True
    # Bài nháp không tính; thứ tự theo chủ đề → bài
    assert [(x["title"], x["completed_count"]) for x in d["lessons"]] == [("b1", 1), ("b2", 0), ("qz", 1),
                                                                          ("cuoi", 0)]
    assert d["final_quiz"] == {"lesson_id": stats["cuoi"], "title": "cuoi", "pass_score_percent": 80.0}
    # Ghi danh cũ nhất trước; người bị xóa không có mặt
    by_email = {x["user"]["email"]: x for x in d["learners"]}
    assert list(by_email) == ["hv@x.dev", "hv2@x.dev", "locked@x.dev"]
    hv = by_email["hv@x.dev"]
    assert (hv["completed_lessons"], hv["total_lessons"], hv["progress_percent"]) == (2, 4, 50.0)
    assert hv["progress_status"] == "in_progress"
    assert hv["last_activity_at"].startswith("2026-10-06")  # bài nháp (ngày 9) không tính
    assert (hv["final_score_percent"], hv["final_passed"]) == (90.0, True)  # điểm cao nhất, kể cả lượt hết giờ
    assert hv["due_at"] is None and hv["user"]["employee_code"] == "NV0001"
    hv2 = by_email["hv2@x.dev"]
    assert (hv2["progress_status"], hv2["final_score_percent"], hv2["final_passed"]) == ("not_started", None, None)
    assert by_email["locked@x.dev"]["user"]["status"] == "locked"
    assert d["summary"] == {"learner_count": 3, "completed_count": 0, "in_progress_count": 1, "not_started_count": 2,
                            "avg_progress_percent": 16.67, "final_taken_count": 1, "final_avg_score_percent": 90.0}


def test_thong_so_khoa_chua_co_gi(client, users):  # noqa: F811
    c = _create(client, users["gv@x.dev"])
    d = client.get(f"/teach/courses/{c['id']}/stats", headers=users["gv@x.dev"]).json()
    assert d["lessons"] == [] and d["learners"] == [] and d["final_quiz"] is None
    assert d["summary"]["avg_progress_percent"] == 0 and d["summary"]["final_avg_score_percent"] is None


def test_hoan_thanh_theo_ghi_danh(client, users, stats, sqlite_engine, seeded_db):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Enrollment

    with Session(sqlite_engine) as s:
        s.execute(update(Enrollment).where(Enrollment.user_id == seeded_db["hv2@x.dev"])
                  .values(status="completed", completed_at=_dt(8)))
        s.commit()
    d = client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()
    hv2 = next(x for x in d["learners"] if x["user"]["email"] == "hv2@x.dev")
    # Đã ghi nhận hoàn thành thì giữ, dù khóa có thêm bài sau đó
    assert (hv2["enrollment_status"], hv2["progress_status"]) == ("completed", "completed")
    assert d["summary"]["completed_count"] == 1


def test_quyen_xem_thong_so(client, users, stats):
    assert client.get(_url(stats, "/stats"), headers=users["tg@x.dev"]).json()["can_edit"] is False
    assert client.get(_url(stats, "/stats"), headers=users["admin@x.dev"]).json()["can_edit"] is True
    assert client.get(_url(stats, "/stats"), headers=users["gv2@x.dev"]).status_code == 403
    assert client.get(_url(stats, "/stats"), headers=users["hv@x.dev"]).status_code == 403
    assert client.get("/teach/courses/9999/stats", headers=users["admin@x.dev"]).status_code == 404


# --------------------------------------------------------------------------- #
# Thêm / đổi hạn / xóa học viên trong khóa
# --------------------------------------------------------------------------- #
def test_ung_vien_chua_trong_khoa(client, users, stats, dept_ids):
    r = client.get(_url(stats, "/learners/candidates"), headers=users["tg@x.dev"])
    assert r.status_code == 200
    d = r.json()
    # Học viên đang hoạt động chưa trong khóa (hv3 từng bị xóa vẫn có), không có giảng viên/tài khoản khóa
    assert [x["email"] for x in d["items"]] == ["hv3@x.dev", "hv4@x.dev"] and d["total"] == 2
    assert [x["email"] for x in client.get(_url(stats, "/learners/candidates?q=cườ"),
                                           headers=users["gv@x.dev"]).json()["items"]] == ["hv4@x.dev"]
    assert client.get(_url(stats, f"/learners/candidates?department_id={dept_ids['VH']}"),
                      headers=users["gv@x.dev"]).json()["total"] == 0
    d = client.get(_url(stats, "/learners/candidates?limit=1"), headers=users["gv@x.dev"]).json()
    assert (len(d["items"]), d["total"]) == (1, 2)


def test_them_hoc_vien(client, users, stats, seeded_db):
    hv3, hv4 = seeded_db["hv3@x.dev"], seeded_db["hv4@x.dev"]
    r = client.post(_url(stats, "/learners"), json={"user_ids": [hv3, hv4, seeded_db["hv@x.dev"]]},
                    headers=users["gv@x.dev"])
    assert r.status_code == 200, r.text
    assert r.json() == {"added": 2, "skipped": 1}
    by_email = {x["user"]["email"]: x for x in client.get(_url(stats, "/stats"),
                                                          headers=users["gv@x.dev"]).json()["learners"]}
    # Hạn mặc định của khóa; hv3 thêm lại giữ trạng thái đã hoàn thành
    assert by_email["hv4@x.dev"]["due_at"].startswith("2026-10-31T16:59:59")
    assert by_email["hv4@x.dev"]["enrollment_status"] == "active"
    assert by_email["hv3@x.dev"]["enrollment_status"] == "completed"
    # Học viên thấy khóa ngay khi khóa được mở
    client.patch(_url(stats), json={"status": "published"}, headers=users["gv@x.dev"])
    hv4_headers = bearer(tokens(client, "hv4@x.dev")["access_token"])
    assert [x["id"] for x in client.get("/me/courses", headers=hv4_headers).json()["items"]] == [stats["course"]]


def test_them_hoc_vien_co_han_rieng(client, users, stats, seeded_db):
    client.post(_url(stats, "/learners"), json={"user_ids": [seeded_db["hv4@x.dev"]],
                                                "due_at": "2026-11-15T16:59:59Z"}, headers=users["admin@x.dev"])
    learners = client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()["learners"]
    assert next(x for x in learners if x["user"]["email"] == "hv4@x.dev")["due_at"].startswith("2026-11-15")


@pytest.mark.parametrize("email", ["gv@x.dev", "locked@x.dev"])
def test_chi_them_duoc_hoc_vien_dang_hoat_dong(client, users, stats, seeded_db, email):
    r = client.post(_url(stats, "/learners"), json={"user_ids": [seeded_db["hv4@x.dev"], seeded_db[email]]},
                    headers=users["gv@x.dev"])
    assert r.status_code == 422 and str(seeded_db[email]) in r.json()["detail"]
    # Không thêm ai
    assert client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()["summary"]["learner_count"] == 3


def test_tro_giang_khong_duoc_sua_hoc_vien(client, users, stats, seeded_db):
    h = users["tg@x.dev"]
    hv = seeded_db["hv@x.dev"]
    assert client.post(_url(stats, "/learners"), json={"user_ids": [seeded_db["hv4@x.dev"]]},
                       headers=h).status_code == 403
    assert client.patch(_url(stats, f"/learners/{hv}"), json={"due_at": None}, headers=h).status_code == 403
    assert client.delete(_url(stats, f"/learners?user_ids={hv}"), headers=h).status_code == 403
    assert client.delete(_url(stats, f"/learners?user_ids={hv}"), headers=users["gv2@x.dev"]).status_code == 403


def test_doi_han_hoc_vien(client, users, stats, seeded_db):
    url = _url(stats, f"/learners/{seeded_db['hv@x.dev']}")
    r = client.patch(url, json={"due_at": "2026-12-01T16:59:59Z"}, headers=users["gv@x.dev"])
    assert r.status_code == 200, r.text
    assert r.json()["due_at"].startswith("2026-12-01") and r.json()["completed_lessons"] == 2
    assert client.patch(url, json={"due_at": None}, headers=users["gv@x.dev"]).json()["due_at"] is None
    assert client.patch(url, json={}, headers=users["gv@x.dev"]).status_code == 422  # bắt buộc gửi due_at
    # Người bị xóa / chưa ghi danh
    for email in ("hv3@x.dev", "hv4@x.dev"):
        r = client.patch(_url(stats, f"/learners/{seeded_db[email]}"), json={"due_at": None},
                         headers=users["gv@x.dev"])
        assert r.status_code == 404 and r.json()["detail"] == "Học viên không có trong khóa học"


def test_xoa_hoc_vien_va_them_lai(client, users, stats, seeded_db, sqlite_engine):
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app.models import Enrollment

    hv, hv2 = seeded_db["hv@x.dev"], seeded_db["hv2@x.dev"]
    r = client.delete(_url(stats, f"/learners?user_ids={hv}&user_ids={hv2}"), headers=users["gv@x.dev"])
    assert r.status_code == 204
    d = client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()
    assert [x["user"]["email"] for x in d["learners"]] == ["locked@x.dev"]
    with Session(sqlite_engine) as s:
        e = s.scalars(select(Enrollment).where(Enrollment.user_id == hv)).one()
        assert (e.status, e.removed_by) == ("removed", seeded_db["gv@x.dev"]) and e.removed_at is not None
    # Thêm lại: tiến độ cũ còn nguyên
    client.post(_url(stats, "/learners"), json={"user_ids": [hv]}, headers=users["gv@x.dev"])
    learner = client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()["learners"]
    assert next(x for x in learner if x["user"]["id"] == hv)["completed_lessons"] == 2


def test_xoa_hoc_vien_khong_trong_khoa(client, users, stats, seeded_db):
    r = client.delete(_url(stats, f"/learners?user_ids={seeded_db['hv@x.dev']}&user_ids={seeded_db['hv4@x.dev']}"),
                      headers=users["gv@x.dev"])
    assert r.status_code == 404
    # Không xóa ai
    assert client.get(_url(stats, "/stats"), headers=users["gv@x.dev"]).json()["summary"]["learner_count"] == 3
    assert client.delete(_url(stats, "/learners"), headers=users["gv@x.dev"]).status_code == 422


# --------------------------------------------------------------------------- #
# Học viên (toàn bộ)
# --------------------------------------------------------------------------- #
def test_danh_sach_hoc_vien(client, users, stats, seeded_db):
    r = client.get("/teach/students", headers=users["gv@x.dev"])
    assert r.status_code == 200, r.text
    d = r.json()
    # Mọi tài khoản có vai trò học viên, sắp theo tên
    assert [x["full_name"] for x in d["items"]] == ["An", "Bình", "Cường", "hv", "locked"]
    by_email = {x["email"]: x for x in d["items"]}
    hv = by_email["hv@x.dev"]
    assert (hv["course_count"], hv["completed_count"], hv["avg_progress_percent"]) == (1, 0, 50.0)
    assert hv["last_activity_at"].startswith("2026-10-06")
    assert by_email["hv3@x.dev"]["course_count"] == 0  # đã bị xóa khỏi khóa
    assert d["summary"] == {"student_count": 5, "enrollment_count": 3, "completed_count": 0,
                            "not_started_count": 2}
    # Giảng viên không phụ trách khóa nào: không thấy số liệu của khóa người khác
    other = client.get("/teach/students", headers=users["gv2@x.dev"]).json()
    assert other["summary"]["enrollment_count"] == 0 and other["total"] == 5
    assert client.get("/teach/students", headers=users["hv@x.dev"]).status_code == 403


def test_chi_tiet_hoc_vien(client, users, stats, seeded_db):
    r = client.get(f"/teach/students/{seeded_db['hv@x.dev']}", headers=users["tg@x.dev"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["employee_code"] == "NV0001" and d["department"]["code"] == "VH"
    [c] = d["courses"]
    assert c["course_id"] == stats["course"] and c["can_edit"] is False  # trợ giảng
    assert (c["completed_lessons"], c["total_lessons"], c["final_score_percent"]) == (2, 4, 90.0)
    assert [(s["title"], s["completed_lessons"], s["total_lessons"]) for s in c["sections"]] == [
        ("Chủ đề 1", 1, 2), ("Chủ đề 2", 1, 2)]
    qz, cuoi = c["quizzes"]
    assert (qz["is_graded"], qz["attempts_used"], qz["best_score_percent"], qz["passed"]) == (False, 1, 100.0, True)
    assert (cuoi["attempts_used"], cuoi["max_attempts"], cuoi["best_score_percent"]) == (3, 3, 90.0)
    assert cuoi["last_submitted_at"].startswith("2026-10-07")
    # Giảng viên không phụ trách → không thấy khóa; không phải học viên → 404
    assert client.get(f"/teach/students/{seeded_db['hv@x.dev']}", headers=users["gv2@x.dev"]).json()["courses"] == []
    assert client.get(f"/teach/students/{seeded_db['gv@x.dev']}", headers=users["gv@x.dev"]).status_code == 404
    assert client.get("/teach/students/9999", headers=users["gv@x.dev"]).status_code == 404


def test_them_hoc_vien_vao_nhieu_khoa(client, users, stats, seeded_db):
    c2 = _create(client, users["gv@x.dev"], code="5S-01", title="5S")
    hv = seeded_db["hv@x.dev"]
    r = client.post(f"/teach/students/{hv}/courses", json={"course_ids": [stats["course"], c2["id"]]},
                    headers=users["gv@x.dev"])
    assert r.status_code == 200, r.text
    assert r.json() == {"added": 1, "skipped": 1}
    titles = [c["title"] for c in client.get(f"/teach/students/{hv}", headers=users["gv@x.dev"]).json()["courses"]]
    assert sorted(titles) == ["5S", "An toàn lao động"]


def test_them_vao_nhieu_khoa_kiem_quyen_tung_khoa(client, users, stats, seeded_db):
    c2 = _create(client, users["gv2@x.dev"], code="5S-01", title="5S")
    hv4 = seeded_db["hv4@x.dev"]
    # Khóa không phụ trách → 404; khóa là trợ giảng → 403; cả hai đều không thêm vào khóa nào
    r = client.post(f"/teach/students/{hv4}/courses", json={"course_ids": [stats["course"], c2["id"]]},
                    headers=users["gv@x.dev"])
    assert r.status_code == 404
    r = client.post(f"/teach/students/{hv4}/courses", json={"course_ids": [stats["course"]]},
                    headers=users["tg@x.dev"])
    assert r.status_code == 403
    assert client.get(f"/teach/students/{hv4}", headers=users["admin@x.dev"]).json()["courses"] == []
    r = client.post(f"/teach/students/{seeded_db['locked@x.dev']}/courses", json={"course_ids": [c2["id"]]},
                    headers=users["gv2@x.dev"])
    assert r.status_code == 422
