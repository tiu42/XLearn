from datetime import datetime, timedelta, timezone

import pytest
from test_auth import bearer, tokens


@pytest.fixture
def quiz(seeded_db, dept_ids, sqlite_engine):
    """Khóa (không tuần tự) hv@x.dev đang học: 1 bài đọc + 1 quiz đủ 4 dạng câu (tổng 5 điểm, đạt 60%)."""
    from sqlalchemy.orm import Session

    from app.models import Course, CourseSection, Enrollment, Lesson, Quiz, QuizOption, QuizQuestion

    hv, gv = seeded_db["hv@x.dev"], seeded_db["gv@x.dev"]
    with Session(sqlite_engine) as s:
        c = Course(code="QZ-01", title="Khóa có quiz", status="published", created_by=gv)
        s.add(c)
        s.flush()
        sec = CourseSection(course_id=c.id, title="Chủ đề")
        s.add(sec)
        s.flush()
        page = Lesson(course_id=c.id, section_id=sec.id, title="Bài đọc", lesson_type="page", status="published")
        lq = Lesson(course_id=c.id, section_id=sec.id, title="Kiểm tra", lesson_type="quiz", status="published",
                    sort_order=1)
        s.add_all([page, lq])
        s.flush()
        s.add_all([Quiz(lesson_id=lq.id, pass_score_percent=60, time_limit_seconds=600, max_attempts=2,
                        is_graded=True),
                   Enrollment(course_id=c.id, user_id=hv)])
        s.flush()

        def question(kind, content, options, points=1, order=0):
            q = QuizQuestion(quiz_id=lq.id, question_type=kind, content=content, points=points, sort_order=order,
                             explanation=f"Giải thích {content}")
            s.add(q)
            s.flush()
            opts = [QuizOption(question_id=q.id, content=text, is_correct=ok, sort_order=i)
                    for i, (text, ok) in enumerate(options)]
            s.add_all(opts)
            s.flush()
            return q.id, [o.id for o in opts]

        single = question("single_choice", "Một", [("A", True), ("B", False)], order=0)
        multi = question("multiple_choice", "Nhiều", [("A", True), ("B", False), ("C", True)], points=2, order=1)
        tf = question("true_false", "Đúng sai", [("Đúng", False), ("Sai", True)], order=2)
        text = question("short_text", "Tự luận", [("Kho hóa chất", True), ("Khu hóa chất", True)], order=3)
        s.commit()
        return {"course": c.id, "page": page.id, "quiz": lq.id,
                "single": single, "multi": multi, "tf": tf, "text": text}


@pytest.fixture
def hv(client, quiz):
    return bearer(tokens(client, "hv@x.dev")["access_token"])


def _url(ids, suffix=""):
    return f"/me/courses/{ids['course']}/lessons/{ids['quiz']}/quiz{suffix}"


def _start(client, hv, ids):
    r = client.post(_url(ids, "/attempts"), headers=hv)
    assert r.status_code == 200, r.text
    return r.json()


def _all_right(ids):
    return {"answers": [
        {"question_id": ids["single"][0], "option_ids": [ids["single"][1][0]]},
        {"question_id": ids["multi"][0], "option_ids": [ids["multi"][1][2], ids["multi"][1][0]]},
        {"question_id": ids["tf"][0], "option_ids": [ids["tf"][1][1]]},
        {"question_id": ids["text"][0], "text": "  kho  HOA chat "},
    ]}


def _quiz_settings(engine, ids, **values):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Quiz

    with Session(engine) as s:
        s.execute(update(Quiz).where(Quiz.lesson_id == ids["quiz"]).values(**values))
        s.commit()


def _shift_start(engine, attempt_id, seconds):
    """Giả lập thời gian trôi: lùi giờ bắt đầu lượt làm."""
    from sqlalchemy.orm import Session

    from app.models import QuizAttempt

    with Session(engine) as s:
        a = s.get(QuizAttempt, attempt_id)
        a.started_at = datetime.now(timezone.utc) - timedelta(seconds=seconds)
        s.commit()


def test_normalize_text():
    from app.quiz import normalize_text

    assert normalize_text("  Kho  HÓA chất ") == "kho hoa chat"
    assert normalize_text("Đường dây") == "duong day"
    assert normalize_text(None) == ""


def test_trang_thai_ban_dau(client, hv, quiz):
    r = client.get(_url(quiz), headers=hv)
    assert r.status_code == 200, r.text
    x = r.json()
    assert x["attempts"] == [] and x["attempts_used"] == 0 and x["attempts_left"] == 2
    assert x["can_start"] is True and x["blocked_reason"] is None and x["in_progress"] is None
    assert x["passed"] is False and x["best_score_percent"] is None and x["review_available"] is True


def test_bat_dau_khong_lo_dap_an_va_lam_tiep(client, hv, quiz):
    a = _start(client, hv, quiz)
    assert a["attempt_no"] == 1 and a["status"] == "in_progress" and a["time_limit_seconds"] == 600
    assert a["expires_at"] and a["answers"] == []
    assert [q["question_type"] for q in a["questions"]] == ["single_choice", "multiple_choice", "true_false",
                                                           "short_text"]
    assert a["questions"][3]["options"] == []
    assert all("is_correct" not in o for q in a["questions"] for o in q["options"])
    assert "explanation" not in a["questions"][0]

    # Lưu tạm rồi "tải lại trang": cùng lượt, giữ bài làm
    body = {"answers": [{"question_id": quiz["single"][0], "option_ids": [quiz["single"][1][1]]},
                        {"question_id": quiz["text"][0], "text": "abc"}]}
    r = client.put(_url(quiz, f"/attempts/{a['id']}/answers"), headers=hv, json=body)
    assert r.status_code == 200, r.text
    again = _start(client, hv, quiz)
    assert again["id"] == a["id"]
    assert sorted((x["question_id"], tuple(x["option_ids"]), x["text"]) for x in again["answers"]) == sorted([
        (quiz["single"][0], (quiz["single"][1][1],), None), (quiz["text"][0], (), "abc")])

    st = client.get(_url(quiz), headers=hv).json()
    assert st["in_progress"]["id"] == a["id"] and st["can_start"] is False and st["attempts_left"] == 1
    # Mở bài kiểm tra = đã bắt đầu học
    detail = client.get(f"/me/courses/{quiz['course']}", headers=hv).json()
    assert detail["sections"][0]["lessons"][1]["status"] == "in_progress"


def test_nop_dat_hoan_thanh_bai_va_khoa(client, hv, quiz):
    client.post(f"/me/courses/{quiz['course']}/lessons/{quiz['page']}/progress", headers=hv)
    a = _start(client, hv, quiz)
    r = client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv, json=_all_right(quiz))
    assert r.status_code == 200, r.text
    x = r.json()
    res = x["attempt"]
    assert (res["status"], res["score"], res["max_score"], res["score_percent"], res["passed"]) == \
        ("submitted", 5, 5, 100, True)
    assert res["correct_count"] == 4 and res["answered_count"] == 4 and res["review_available"] is True
    text_q = next(q for q in res["questions"] if q["question_type"] == "short_text")
    assert text_q["correct"] and text_q["accepted_answers"] == ["Kho hóa chất", "Khu hóa chất"]
    assert text_q["explanation"] == "Giải thích Tự luận"
    assert x["progress"]["status"] == "completed"
    assert x["course"]["enrollment_status"] == "completed" and x["course"]["progress_percent"] == 100

    # Nộp lại cùng lượt bị chặn
    assert client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv).status_code == 409
    assert client.put(_url(quiz, f"/attempts/{a['id']}/answers"), headers=hv, json={}).status_code == 409


def test_cham_diem_tung_phan_va_truot(client, hv, quiz, sqlite_engine):
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from app.models import QuizAttemptTextAnswer

    a = _start(client, hv, quiz)
    body = {"answers": [
        {"question_id": quiz["single"][0], "option_ids": [quiz["single"][1][0]]},  # đúng: 1đ
        {"question_id": quiz["multi"][0], "option_ids": [quiz["multi"][1][0]]},  # thiếu 1 phương án: 0đ
        {"question_id": quiz["text"][0], "text": "nhà xe"},  # sai
    ]}
    res = client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv, json=body).json()["attempt"]
    assert (res["score"], res["score_percent"], res["passed"]) == (1, 20, False)
    assert (res["correct_count"], res["answered_count"]) == (1, 3)
    by_type = {q["question_type"]: q for q in res["questions"]}
    assert by_type["true_false"]["answered"] is False and by_type["multiple_choice"]["earned_points"] == 0
    with Session(sqlite_engine) as s:
        assert s.scalar(select(QuizAttemptTextAnswer.is_correct)) is False

    st = client.get(_url(quiz), headers=hv).json()
    assert st["passed"] is False and st["best_score_percent"] == 20 and st["can_start"] is True
    detail = client.get(f"/me/courses/{quiz['course']}", headers=hv).json()
    assert detail["sections"][0]["lessons"][1]["status"] == "in_progress"


def test_het_luot(client, hv, quiz):
    for _ in range(2):
        a = _start(client, hv, quiz)
        assert client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv).status_code == 200
    st = client.get(_url(quiz), headers=hv).json()
    assert st["attempts_left"] == 0 and st["can_start"] is False and st["blocked_reason"] == "no_attempts"
    assert [x["attempt_no"] for x in st["attempts"]] == [2, 1]
    r = client.post(_url(quiz, "/attempts"), headers=hv)
    assert r.status_code == 403 and "hết lượt" in r.json()["detail"]


def test_dat_roi_truot_van_giu_hoan_thanh(client, hv, quiz):
    a = _start(client, hv, quiz)
    client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv, json=_all_right(quiz))
    b = _start(client, hv, quiz)
    x = client.post(_url(quiz, f"/attempts/{b['id']}/submit"), headers=hv).json()
    assert x["attempt"]["passed"] is False and x["progress"]["status"] == "completed"
    assert client.get(_url(quiz), headers=hv).json()["best_score_percent"] == 100


def test_nop_tre_trong_thoi_gian_bu_la_expired(client, hv, quiz, sqlite_engine):
    a = _start(client, hv, quiz)
    _shift_start(sqlite_engine, a["id"], 600 + 5)
    res = client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv,
                      json=_all_right(quiz)).json()["attempt"]
    assert res["status"] == "expired" and res["passed"] is True
    assert res["time_spent_seconds"] == 600


def test_qua_han_chi_cham_phan_da_luu(client, hv, quiz, sqlite_engine):
    a = _start(client, hv, quiz)
    saved = {"answers": [{"question_id": quiz["single"][0], "option_ids": [quiz["single"][1][0]]}]}
    client.put(_url(quiz, f"/attempts/{a['id']}/answers"), headers=hv, json=saved)
    _shift_start(sqlite_engine, a["id"], 3600)

    r = client.put(_url(quiz, f"/attempts/{a['id']}/answers"), headers=hv, json=_all_right(quiz))
    assert r.status_code == 409
    res = client.get(_url(quiz, f"/attempts/{a['id']}"), headers=hv).json()
    assert res["status"] == "expired" and res["score"] == 1 and res["passed"] is False


def test_bo_trinh_duyet_thi_tu_nop_khi_xem_trang_thai(client, hv, quiz, sqlite_engine):
    a = _start(client, hv, quiz)
    _shift_start(sqlite_engine, a["id"], 3600)
    st = client.get(_url(quiz), headers=hv).json()
    assert st["in_progress"] is None and st["attempts"][0]["status"] == "expired" and st["can_start"] is True
    # Lượt mới đánh số tiếp
    assert _start(client, hv, quiz)["attempt_no"] == 2


def test_xem_ket_qua_luot_dang_lam_bi_409(client, hv, quiz):
    a = _start(client, hv, quiz)
    assert client.get(_url(quiz, f"/attempts/{a['id']}"), headers=hv).status_code == 409


@pytest.mark.parametrize("policy, closes_in, visible", [
    ("never", None, False),
    ("after_close", timedelta(days=1), False),
    ("after_close", -timedelta(seconds=1), True),
])
def test_quyen_xem_dap_an(client, hv, quiz, sqlite_engine, policy, closes_in, visible):
    a = _start(client, hv, quiz)
    client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv, json=_all_right(quiz))
    closes = datetime.now(timezone.utc) + closes_in if closes_in is not None else None
    _quiz_settings(sqlite_engine, quiz, review_policy=policy, closes_at=closes)
    res = client.get(_url(quiz, f"/attempts/{a['id']}"), headers=hv).json()
    assert res["review_available"] is visible and (res["questions"] is not None) is visible
    assert res["score_percent"] == 100 and res["correct_count"] == 4


@pytest.mark.parametrize("opens, closes, reason", [
    (timedelta(hours=1), None, "not_open"),
    (-timedelta(days=2), -timedelta(days=1), "closed"),
])
def test_cua_so_thoi_gian(client, hv, quiz, sqlite_engine, opens, closes, reason):
    now = datetime.now(timezone.utc)
    _quiz_settings(sqlite_engine, quiz, opens_at=now + opens, closes_at=now + closes if closes else None)
    st = client.get(_url(quiz), headers=hv).json()
    assert st["can_start"] is False and st["blocked_reason"] == reason
    assert client.post(_url(quiz, "/attempts"), headers=hv).status_code == 403


def test_han_nop_khong_vuot_gio_dong(client, hv, quiz, sqlite_engine):
    closes = datetime.now(timezone.utc) + timedelta(minutes=2)
    _quiz_settings(sqlite_engine, quiz, closes_at=closes)
    a = _start(client, hv, quiz)
    expires = datetime.fromisoformat(a["expires_at"])
    assert abs((expires - closes).total_seconds()) < 1


def test_tron_cau_hoi_co_dinh_theo_luot(client, hv, quiz, sqlite_engine):
    _quiz_settings(sqlite_engine, quiz, shuffle_questions=True)
    a = _start(client, hv, quiz)
    order = [q["id"] for q in a["questions"]]
    assert sorted(order) == sorted(quiz[k][0] for k in ("single", "multi", "tf", "text"))
    assert [q["id"] for q in _start(client, hv, quiz)["questions"]] == order
    res = client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv).json()["attempt"]
    assert [q["id"] for q in res["questions"]] == order


@pytest.mark.parametrize("make", [
    lambda ids: [{"question_id": 999999, "option_ids": []}],
    lambda ids: [{"question_id": ids["single"][0], "option_ids": [ids["multi"][1][0]]}],
    lambda ids: [{"question_id": ids["single"][0], "option_ids": ids["single"][1]}],
    lambda ids: [{"question_id": ids["text"][0], "option_ids": [ids["text"][1][0]]}],
    lambda ids: [{"question_id": ids["tf"][0], "text": "Đúng"}],
    lambda ids: [{"question_id": ids["tf"][0], "option_ids": []}, {"question_id": ids["tf"][0], "option_ids": []}],
])
def test_bai_lam_khong_hop_le(client, hv, quiz, make):
    a = _start(client, hv, quiz)
    r = client.put(_url(quiz, f"/attempts/{a['id']}/answers"), headers=hv, json={"answers": make(quiz)})
    assert r.status_code == 422, r.text


def test_luot_cua_nguoi_khac_va_bai_khong_phai_quiz(client, hv, quiz, seeded_db, sqlite_engine):
    from sqlalchemy.orm import Session

    from app.models import Enrollment

    a = _start(client, hv, quiz)
    with Session(sqlite_engine) as s:
        s.add(Enrollment(course_id=quiz["course"], user_id=seeded_db["gv@x.dev"]))
        s.commit()
    gv = bearer(tokens(client, "gv@x.dev")["access_token"])
    assert client.get(_url(quiz, f"/attempts/{a['id']}"), headers=gv).status_code == 404
    assert client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=gv).status_code == 404
    page_quiz = f"/me/courses/{quiz['course']}/lessons/{quiz['page']}/quiz"
    assert client.get(page_quiz, headers=hv).status_code == 404
    assert client.get(_url(quiz)).status_code == 401


# --------------------------------------------------------------------------- #
# Dòng thời gian
# --------------------------------------------------------------------------- #
def test_dong_thoi_gian(client, hv, quiz, sqlite_engine):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Enrollment

    now = datetime.now(timezone.utc)
    _quiz_settings(sqlite_engine, quiz, closes_at=now + timedelta(days=3))
    with Session(sqlite_engine) as s:
        s.execute(update(Enrollment).values(due_at=now + timedelta(days=10)))
        s.commit()

    items = client.get("/me/timeline?days=7", headers=hv).json()["items"]
    assert [(x["kind"], x["lesson_id"], x["is_graded"]) for x in items] == [("quiz", quiz["quiz"], True)]
    items = client.get("/me/timeline?days=30", headers=hv).json()["items"]
    assert [x["kind"] for x in items] == ["quiz", "due"]
    assert client.get("/me/timeline?overdue=true", headers=hv).json()["items"] == []

    # Làm đạt thì bài kiểm tra không còn trên dòng thời gian
    a = _start(client, hv, quiz)
    client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv, json=_all_right(quiz))
    assert [x["kind"] for x in client.get("/me/timeline", headers=hv).json()["items"]] == ["due"]


def test_dong_thoi_gian_qua_han(client, hv, quiz, sqlite_engine):
    _quiz_settings(sqlite_engine, quiz, closes_at=datetime.now(timezone.utc) - timedelta(days=1))
    items = client.get("/me/timeline?overdue=true", headers=hv).json()["items"]
    assert [(x["kind"], x["title"]) for x in items] == [("quiz", "Kiểm tra")]


def test_dong_thoi_gian_bai_bi_khoa(client, hv, quiz, seeded_db, sqlite_engine):
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from app.models import Course, CourseSection, Lesson, LessonProgress

    _quiz_settings(sqlite_engine, quiz, closes_at=datetime.now(timezone.utc) + timedelta(days=3))
    with Session(sqlite_engine) as s:
        s.execute(update(Course).where(Course.id == quiz["course"]).values(is_sequential=True))
        sec2 = CourseSection(course_id=quiz["course"], title="Chủ đề 2", sort_order=1)
        s.add(sec2)
        s.flush()
        s.execute(update(Lesson).where(Lesson.id == quiz["quiz"]).values(section_id=sec2.id))
        s.commit()

    [x] = client.get("/me/timeline", headers=hv).json()["items"]
    assert x["locked"] is True and x["out_of_attempts"] is False

    # Học xong chủ đề trước thì bài kiểm tra mở khóa
    with Session(sqlite_engine) as s:
        s.add(LessonProgress(user_id=seeded_db["hv@x.dev"], lesson_id=quiz["page"], status="completed"))
        s.commit()
    [x] = client.get("/me/timeline", headers=hv).json()["items"]
    assert x["locked"] is False


def test_dong_thoi_gian_het_luot(client, hv, quiz, sqlite_engine):
    _quiz_settings(sqlite_engine, quiz, closes_at=datetime.now(timezone.utc) + timedelta(days=3))
    a = _start(client, hv, quiz)
    client.post(_url(quiz, f"/attempts/{a['id']}/submit"), headers=hv)
    b = _start(client, hv, quiz)  # lượt cuối đang làm dở: chưa tính là hết lượt
    [x] = client.get("/me/timeline", headers=hv).json()["items"]
    assert x["out_of_attempts"] is False and x["locked"] is False

    client.post(_url(quiz, f"/attempts/{b['id']}/submit"), headers=hv)
    [x] = client.get("/me/timeline", headers=hv).json()["items"]
    assert x["out_of_attempts"] is True
