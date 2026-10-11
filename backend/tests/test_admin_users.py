import pytest
from test_auth import bearer, login, tokens


@pytest.fixture
def api(client, seeded_db):
    return client


@pytest.fixture
def admin(api):
    return bearer(tokens(api, "admin@x.dev")["access_token"])


@pytest.mark.parametrize("email", ["gv@x.dev", "hv@x.dev"])
def test_khong_phai_admin_bi_cam(api, email):
    h = bearer(tokens(api, email)["access_token"])
    assert api.get("/admin/users", headers=h).status_code == 403
    assert api.post("/admin/users", headers=h, json={
        "email": "x@x.dev", "full_name": "X", "password": "Password@1", "roles": ["admin"]}).status_code == 403


def test_chua_dang_nhap_bi_401(api):
    assert api.get("/admin/users").status_code == 401


def test_danh_sach_loc_va_phan_trang(api, admin):
    r = api.get("/admin/users", headers=admin)
    assert r.status_code == 200 and r.json()["total"] == 4
    assert [u["email"] for u in api.get("/admin/users?role=student", headers=admin).json()["items"]] \
        == ["hv@x.dev", "locked@x.dev"]
    assert api.get("/admin/users?status=locked", headers=admin).json()["total"] == 1
    assert api.get("/admin/users?q=GV", headers=admin).json()["items"][0]["email"] == "gv@x.dev"
    page = api.get("/admin/users?limit=1&offset=1", headers=admin).json()
    assert page["total"] == 4 and len(page["items"]) == 1


def test_tao_tai_khoan_roi_dang_nhap(api, admin):
    r = api.post("/admin/users", headers=admin, json={
        "email": "Moi@X.dev", "full_name": "Học viên mới", "password": "Welcome@2026",
        "roles": ["student", "instructor"]})
    assert r.status_code == 201
    assert r.json()["email"] == "moi@x.dev" and r.json()["roles"] == ["instructor", "student"]
    assert login(api, "moi@x.dev", "Welcome@2026").status_code == 200


@pytest.mark.parametrize("payload,code", [
    ({"email": "hv@x.dev"}, 409),                 # trùng email
    ({"roles": ["superuser"]}, 422),              # vai trò không tồn tại
    ({"roles": []}, 422),                         # phải có ít nhất 1 vai trò
    ({"email": "khong-phai-email"}, 422),
    ({"password": "ngan"}, 422),
])
def test_tao_tai_khoan_khong_hop_le(api, admin, payload, code):
    body = {"email": "new@x.dev", "full_name": "N", "password": "Password@1", "roles": ["student"], **payload}
    assert api.post("/admin/users", headers=admin, json=body).status_code == code


def test_tao_tai_khoan_loi_vai_tro_khong_de_lai_user(api, admin):
    api.post("/admin/users", headers=admin, json={
        "email": "new@x.dev", "full_name": "N", "password": "Password@1", "roles": ["superuser"]})
    assert api.get("/admin/users?q=new@x.dev", headers=admin).json()["total"] == 0


def test_cap_vai_tro_va_doi_ten(api, admin, seeded_db):
    uid = seeded_db["hv@x.dev"]
    r = api.patch(f"/admin/users/{uid}", headers=admin, json={"roles": ["student", "instructor"], "full_name": "Mới"})
    assert r.status_code == 200 and r.json()["roles"] == ["instructor", "student"] and r.json()["full_name"] == "Mới"
    assert api.get(f"/admin/users/{uid}", headers=admin).json()["roles"] == ["instructor", "student"]


def test_admin_khong_the_tu_khoa_hoac_tu_go_quyen(api, admin, seeded_db):
    uid = seeded_db["admin@x.dev"]
    assert api.patch(f"/admin/users/{uid}", headers=admin, json={"status": "locked"}).status_code == 400
    assert api.patch(f"/admin/users/{uid}", headers=admin, json={"roles": ["student"]}).status_code == 400
    assert api.patch(f"/admin/users/{uid}", headers=admin, json={"full_name": "Admin 2"}).status_code == 200


def test_mo_khoa_tai_khoan(api, admin, seeded_db):
    uid = seeded_db["locked@x.dev"]
    assert api.patch(f"/admin/users/{uid}", headers=admin, json={"status": "active"}).status_code == 200
    assert login(api, "locked@x.dev").status_code == 200


def test_reset_mat_khau(api, admin, seeded_db):
    hv = tokens(api, "hv@x.dev")
    r = api.post(f"/admin/users/{seeded_db['hv@x.dev']}/reset-password", headers=admin,
                 json={"new_password": "Reset@2026"})
    assert r.status_code == 204
    assert api.post("/auth/refresh", json={"refresh_token": hv["refresh_token"]}).status_code == 401
    assert login(api, "hv@x.dev", "Reset@2026").status_code == 200


def test_user_khong_ton_tai(api, admin):
    assert api.get("/admin/users/9999", headers=admin).status_code == 404
    assert api.patch("/admin/users/9999", headers=admin, json={"full_name": "X"}).status_code == 404
