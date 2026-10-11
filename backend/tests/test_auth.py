from datetime import datetime, timedelta, timezone

import jwt
import pytest
from conftest import PASSWORD


@pytest.fixture
def api(client, seeded_db):
    return client


def login(api, email, password=PASSWORD):
    return api.post("/auth/login", json={"email": email, "password": password})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def tokens(api, email):
    r = login(api, email)
    assert r.status_code == 200, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# Đăng nhập
# --------------------------------------------------------------------------- #
def test_login_thanh_cong(api):
    r = login(api, "Admin@X.dev ")  # email được chuẩn hóa (trim + chữ thường)
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["expires_in"] == 15 * 60
    assert body["user"]["email"] == "admin@x.dev" and body["user"]["roles"] == ["admin"]
    assert body["user"]["last_login_at"] is not None
    claims = jwt.decode(body["access_token"], options={"verify_signature": False})
    assert claims["type"] == "access" and claims["roles"] == ["admin"]


def test_login_sai_mat_khau_va_email_khong_ton_tai_cung_thong_bao(api):
    sai_mk = login(api, "hv@x.dev", "wrong-password")
    khong_co = login(api, "nobody@x.dev")
    assert sai_mk.status_code == khong_co.status_code == 401
    assert sai_mk.json() == khong_co.json()


def test_login_tai_khoan_bi_khoa(api):
    assert login(api, "locked@x.dev").status_code == 403


def test_login_sai_nhieu_lan_bi_tam_khoa(api):
    for _ in range(5):
        assert login(api, "hv@x.dev", "wrong-password").status_code == 401
    r = login(api, "hv@x.dev")  # đúng mật khẩu nhưng vẫn bị chặn
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0


def test_login_thanh_cong_xoa_bo_dem_sai(api):
    for _ in range(4):
        login(api, "hv@x.dev", "wrong-password")
    assert login(api, "hv@x.dev").status_code == 200
    for _ in range(4):
        login(api, "hv@x.dev", "wrong-password")
    assert login(api, "hv@x.dev").status_code == 200


def test_login_mat_khau_qua_dai_khong_crash(api):
    assert login(api, "hv@x.dev", "a" * 100).status_code == 401


# --------------------------------------------------------------------------- #
# Access token
# --------------------------------------------------------------------------- #
def test_me(api):
    t = tokens(api, "gv@x.dev")
    r = api.get("/auth/me", headers=bearer(t["access_token"]))
    assert r.status_code == 200 and r.json()["roles"] == ["instructor"]


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer abc.def.ghi"}, {"Authorization": "Basic xyz"}])
def test_me_khong_co_token_hop_le(api, headers):
    r = api.get("/auth/me", headers=headers)
    assert r.status_code == 401 and r.headers["WWW-Authenticate"] == "Bearer"


def test_refresh_token_khong_dung_lam_access_token(api):
    t = tokens(api, "hv@x.dev")
    assert api.get("/auth/me", headers=bearer(t["refresh_token"])).status_code == 401


def _forge(claims, key="test-jwt-secret-key-at-least-32-characters", alg="HS256"):
    now = datetime.now(timezone.utc)
    base = {"sub": "1", "type": "access", "jti": "x", "iss": "xlearn", "iat": now, "exp": now + timedelta(minutes=5)}
    return jwt.encode({**base, **claims}, key, algorithm=alg)


@pytest.mark.parametrize("token", [
    _forge({"exp": datetime.now(timezone.utc) - timedelta(seconds=1)}),  # hết hạn
    _forge({}, key="another-secret-key-that-is-32-chars-long"),          # sai chữ ký
    _forge({"iss": "attacker"}),                                         # sai issuer
    _forge({}, key=None, alg="none"),                                    # alg: none
])
def test_token_gia_mao_hoac_het_han_bi_tu_choi(api, token):
    assert api.get("/auth/me", headers=bearer(token)).status_code == 401


def test_khoa_tai_khoan_co_hieu_luc_ngay_voi_access_token_dang_dung(api, seeded_db):
    admin = tokens(api, "admin@x.dev")["access_token"]
    hv = tokens(api, "hv@x.dev")
    assert api.patch(f"/admin/users/{seeded_db['hv@x.dev']}", json={"status": "locked"},
                     headers=bearer(admin)).status_code == 200
    assert api.get("/auth/me", headers=bearer(hv["access_token"])).status_code == 401
    assert api.post("/auth/refresh", json={"refresh_token": hv["refresh_token"]}).status_code == 401


# --------------------------------------------------------------------------- #
# Refresh / logout
# --------------------------------------------------------------------------- #
def test_refresh_xoay_vong_token_cu_mat_hieu_luc(api):
    t = tokens(api, "hv@x.dev")
    r = api.post("/auth/refresh", json={"refresh_token": t["refresh_token"]})
    assert r.status_code == 200
    new = r.json()
    assert new["refresh_token"] != t["refresh_token"]
    assert api.get("/auth/me", headers=bearer(new["access_token"])).status_code == 200
    # Dùng lại refresh token cũ → bị từ chối
    assert api.post("/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401


def test_refresh_khong_nhan_access_token(api):
    t = tokens(api, "hv@x.dev")
    assert api.post("/auth/refresh", json={"refresh_token": t["access_token"]}).status_code == 401


def test_logout_thu_hoi_refresh_token_chi_cua_thiet_bi_do(api):
    may1, may2 = tokens(api, "hv@x.dev"), tokens(api, "hv@x.dev")
    assert api.post("/auth/logout", json={"refresh_token": may1["refresh_token"]}).status_code == 204
    assert api.post("/auth/refresh", json={"refresh_token": may1["refresh_token"]}).status_code == 401
    assert api.post("/auth/refresh", json={"refresh_token": may2["refresh_token"]}).status_code == 200


def test_logout_idempotent(api):
    assert api.post("/auth/logout", json={"refresh_token": "rac"}).status_code == 204


# --------------------------------------------------------------------------- #
# Đổi mật khẩu
# --------------------------------------------------------------------------- #
def test_doi_mat_khau(api):
    t = tokens(api, "hv@x.dev")
    h = bearer(t["access_token"])
    assert api.post("/auth/change-password", headers=h,
                    json={"current_password": "sai-mat-khau", "new_password": "NewPass@456"}).status_code == 400
    assert api.post("/auth/change-password", headers=h,
                    json={"current_password": PASSWORD, "new_password": PASSWORD}).status_code == 400
    assert api.post("/auth/change-password", headers=h,
                    json={"current_password": PASSWORD, "new_password": "ngan"}).status_code == 422
    assert api.post("/auth/change-password", headers=h,
                    json={"current_password": PASSWORD, "new_password": "NewPass@456"}).status_code == 204
    # Mọi thiết bị bị đăng xuất; mật khẩu cũ hết hiệu lực
    assert api.post("/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert login(api, "hv@x.dev").status_code == 401
    assert login(api, "hv@x.dev", "NewPass@456").status_code == 200


# --------------------------------------------------------------------------- #
# Phân quyền theo khóa học
# --------------------------------------------------------------------------- #
def test_require_course_instructor(api, seeded_db, sqlite_engine):
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from app.deps import require_course_instructor
    from app.main import app
    from app.models import Course, CourseInstructor

    with Session(sqlite_engine) as s:
        course = Course(code="T-1", title="T", created_by=seeded_db["gv@x.dev"])
        s.add(course)
        s.flush()
        s.add(CourseInstructor(course_id=course.id, user_id=seeded_db["gv@x.dev"]))
        s.commit()
        course_id = course.id

    @app.get("/_test/courses/{course_id}")
    def _probe(course_id: int, user=Depends(require_course_instructor)):
        return {"ok": True}

    try:
        url = f"/_test/courses/{course_id}"
        assert api.get(url, headers=bearer(tokens(api, "gv@x.dev")["access_token"])).status_code == 200
        assert api.get(url, headers=bearer(tokens(api, "admin@x.dev")["access_token"])).status_code == 200
        assert api.get(url, headers=bearer(tokens(api, "hv@x.dev")["access_token"])).status_code == 403
        assert api.get(url).status_code == 401
    finally:
        app.router.routes.pop()
