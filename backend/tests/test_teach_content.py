from urllib.parse import unquote

import pytest
from test_teach_courses import _create, course, users  # noqa: F401 (fixture dùng lại)

BUCKET = "test-media"


@pytest.fixture
def s3(monkeypatch):
    """Bật object storage, bucket giả lập bằng moto (không gọi mạng)."""
    from moto import mock_aws

    from app import storage
    from app.config import get_settings

    settings = get_settings()
    for name, value in {"s3_bucket": BUCKET, "s3_provider": "s3", "s3_endpoint_url": None,
                        "s3_public_url": None, "s3_access_key": "test", "s3_secret_key": "test"}.items():
        monkeypatch.setattr(settings, name, value)
    with mock_aws():
        storage.api_client.cache_clear()
        storage.presign_client.cache_clear()
        storage.api_client().create_bucket(Bucket=BUCKET)
        yield storage.api_client()
    storage.api_client.cache_clear()
    storage.presign_client.cache_clear()


def start(client, headers, course_id, name="anh.png", content_type="image/png", size=10):
    r = client.post(f"/teach/courses/{course_id}/uploads", headers=headers,
                    json={"filename": name, "content_type": content_type, "size_bytes": size})
    assert r.status_code == 201, r.text
    return r.json()


def put_parts(client, headers, course_id, s3, ticket, data, numbers=None):
    """Xin presigned URL rồi gửi từng phần như trình duyệt; trả về [{part_number, etag}].

    moto không nhận HTTP thật → gửi phần bằng boto với đúng key/upload_id/số phần lấy từ URL đã ký.
    """
    size = ticket["part_size"]
    numbers = numbers or list(range(1, ticket["part_count"] + 1))
    r = client.post(f"/teach/courses/{course_id}/uploads/{ticket['id']}/parts", headers=headers,
                    json={"upload_id": ticket["upload_id"], "part_numbers": numbers})
    assert r.status_code == 200, r.text
    parts = []
    for p in r.json()["parts"]:
        url = p["url"]
        assert "X-Amz-Signature=" in url and f"partNumber={p['part_number']}" in url
        key = unquote(url.split(f"/{BUCKET}/", 1)[1].split("?", 1)[0])
        chunk = data[(p["part_number"] - 1) * size:p["part_number"] * size]
        etag = s3.upload_part(Bucket=BUCKET, Key=key, UploadId=ticket["upload_id"],
                              PartNumber=p["part_number"], Body=chunk)["ETag"]
        parts.append({"part_number": p["part_number"], "etag": etag})
    return parts


def finish(client, headers, course_id, ticket, parts, **extra):
    return client.post(f"/teach/courses/{course_id}/uploads/{ticket['id']}/complete", headers=headers,
                       json={"upload_id": ticket["upload_id"], "parts": parts, **extra})


def upload(client, headers, course_id, s3, name="anh.png", content_type="image/png", data=b"x" * 10, **extra):
    """Đi đủ luồng upload; trả về storage_objects.id."""
    ticket = start(client, headers, course_id, name, content_type, len(data))
    r = finish(client, headers, course_id, ticket, put_parts(client, headers, course_id, s3, ticket, data), **extra)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture
def gv(users):
    return users["gv@x.dev"]


@pytest.fixture
def cid(course):
    return course["id"]


def _content(client, headers, cid):
    r = client.get(f"/teach/courses/{cid}/content", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _section(client, headers, cid, title="Chủ đề mới"):
    r = client.post(f"/teach/courses/{cid}/sections", json={"title": title}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _lesson(client, headers, cid, sid, expect=201, **body):
    r = client.post(f"/teach/courses/{cid}/sections/{sid}/lessons", headers=headers,
                    json={"lesson_type": "page", "title": "Bài", **body})
    assert r.status_code == expect, r.text
    return r.json()


# --------------------------------------------------------------------------- #
# Upload
# --------------------------------------------------------------------------- #
def test_upload_chua_cau_hinh_storage_bi_503(client, gv, cid):
    r = client.post(f"/teach/courses/{cid}/uploads", headers=gv,
                    json={"filename": "a.png", "content_type": "image/png", "size_bytes": 10})
    assert r.status_code == 503


def test_upload_thanh_cong(client, gv, cid, s3, sqlite_engine):
    from sqlalchemy.orm import Session

    from app.models import StorageObject

    oid = upload(client, gv, cid, s3, name="Bài giảng 1.mp4", content_type="video/mp4", data=b"v" * 1234,
                 duration_seconds=95)
    with Session(sqlite_engine) as s:
        obj = s.get(StorageObject, oid)
        assert (obj.upload_status, obj.size_bytes, obj.duration_seconds, obj.provider) == ("ready", 1234, 95, "s3")
        assert obj.object_key.startswith(f"courses/{cid}/") and obj.object_key.endswith("/B_i_gi_ng_1.mp4")
        assert obj.original_filename == "Bài giảng 1.mp4"


def test_upload_nhieu_phan_ghep_dung_thu_tu(client, gv, cid, s3, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "s3_part_size_mb", 5)  # S3: mỗi phần (trừ phần cuối) ≥ 5 MiB
    data = bytes(range(256)) * (5 * 4096) + b"phan-cuoi"  # 5 MiB + 9 byte → 2 phần
    ticket = start(client, gv, cid, "video.mp4", "video/mp4", len(data))
    assert (ticket["part_size"], ticket["part_count"]) == (5 * 1024 * 1024, 2)
    # Gửi phần 2 trước phần 1 (tải song song), lúc ghép vẫn đúng thứ tự
    parts = put_parts(client, gv, cid, s3, ticket, data, [2]) + put_parts(client, gv, cid, s3, ticket, data, [1])
    r = finish(client, gv, cid, ticket, sorted(parts, key=lambda p: p["part_number"]), duration_seconds=30)
    assert r.status_code == 200, r.text
    assert r.json()["size_bytes"] == len(data) and r.json()["duration_seconds"] == 30
    key = s3.list_objects_v2(Bucket=BUCKET)["Contents"][0]["Key"]
    assert s3.get_object(Bucket=BUCKET, Key=key)["Body"].read() == data
    # Gọi lại complete: trả luôn file đã xong; xin URL phần nữa → 409
    assert finish(client, gv, cid, ticket, parts[:1]).status_code == 200
    r = client.post(f"/teach/courses/{cid}/uploads/{ticket['id']}/parts", headers=gv,
                    json={"upload_id": ticket["upload_id"], "part_numbers": [1]})
    assert r.status_code == 409


def test_chia_phan_file_rat_lon():
    from app.storage import MAX_PARTS, part_layout

    assert part_layout(10) == (16 * 1024 * 1024, 1)
    size = 500 * 1024 ** 3  # 500 GB
    part, n = part_layout(size)
    assert n <= MAX_PARTS and part % (1024 * 1024) == 0 and part * n >= size


@pytest.mark.parametrize("parts", [
    [{"part_number": 1, "etag": '"khong-co-that"'}],  # phần chưa gửi
    [{"part_number": 2, "etag": '"a"'}, {"part_number": 1, "etag": '"b"'}],  # sai thứ tự
])
def test_ghep_thieu_hoac_sai_phan_bi_422(client, gv, cid, s3, parts):
    ticket = start(client, gv, cid, "a.pdf", "application/pdf")
    assert finish(client, gv, cid, ticket, parts).status_code == 422


def test_huy_upload(client, gv, cid, s3, sqlite_engine):
    from sqlalchemy.orm import Session

    from app.models import StorageObject

    ticket = start(client, gv, cid, "a.pdf", "application/pdf")
    parts = put_parts(client, gv, cid, s3, ticket, b"x" * 10)
    url = f"/teach/courses/{cid}/uploads/{ticket['id']}"
    assert client.delete(url, params={"upload_id": ticket["upload_id"]}, headers=gv).status_code == 204
    assert s3.list_multipart_uploads(Bucket=BUCKET).get("Uploads", []) == []  # bucket đã bỏ các phần
    with Session(sqlite_engine) as s:
        assert s.get(StorageObject, ticket["id"]).upload_status == "failed"
    assert finish(client, gv, cid, ticket, parts).status_code == 404
    assert client.delete(url, params={"upload_id": ticket["upload_id"]}, headers=gv).status_code == 404


@pytest.mark.parametrize("body, code", [
    ({"filename": "a.exe", "content_type": "application/x-msdownload", "size_bytes": 10}, 415),
    ({"filename": "a.mp4", "content_type": "video/mp4", "size_bytes": 500 * 1024 ** 3 + 1}, 413),
])
def test_upload_bi_tu_choi(client, gv, cid, s3, body, code):
    r = client.post(f"/teach/courses/{cid}/uploads", headers=gv, json=body)
    assert r.status_code == code
    if code == 413:
        assert r.json()["detail"] == "File vượt quá 500 GB"


def test_xin_qua_100_phan_mot_lan_bi_422(client, gv, cid, s3):
    ticket = start(client, gv, cid)
    r = client.post(f"/teach/courses/{cid}/uploads/{ticket['id']}/parts", headers=gv,
                    json={"upload_id": ticket["upload_id"], "part_numbers": list(range(1, 102))})
    assert r.status_code == 422


def test_upload_kich_thuoc_that_vuot_gioi_han(client, gv, cid, s3, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_upload_mb", 1)
    ticket = start(client, gv, cid, "a.pdf", "application/pdf", size=10)  # khai báo 10 byte…
    parts = put_parts(client, gv, cid, s3, {**ticket, "part_size": 2 * 1024 * 1024}, b"x" * (1024 * 1024 + 1))
    r = finish(client, gv, cid, ticket, parts)  # …nhưng gửi > 1 MB
    assert r.status_code == 413 and r.json()["detail"] == "File vượt quá 1 MB"
    assert s3.list_objects_v2(Bucket=BUCKET).get("KeyCount") == 0  # đã xóa khỏi bucket


def test_upload_quyen(client, users, cid, s3):
    body = {"filename": "a.png", "content_type": "image/png", "size_bytes": 10}
    assert client.post(f"/teach/courses/{cid}/uploads", headers=users["tg@x.dev"], json=body).status_code == 403
    assert client.post(f"/teach/courses/{cid}/uploads", headers=users["gv2@x.dev"], json=body).status_code == 403


def test_xac_nhan_upload_cua_khoa_khac_bi_404(client, users, cid, s3):
    gv = users["gv@x.dev"]
    other = _create(client, gv, code="KHAC")
    ticket = start(client, gv, other["id"])
    parts = put_parts(client, gv, other["id"], s3, ticket, b"x" * 10)
    assert finish(client, gv, cid, ticket, parts).status_code == 404  # sai khóa
    r = client.post(f"/teach/courses/{cid}/uploads/{ticket['id']}/parts", headers=gv,
                    json={"upload_id": ticket["upload_id"], "part_numbers": [1]})
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Chủ đề
# --------------------------------------------------------------------------- #
def test_chu_de_them_doi_ten_sap_xep_xoa(client, gv, cid):
    first = _content(client, gv, cid)["sections"][0]  # "Chủ đề 1" của fixture course
    a, b = _section(client, gv, cid, "A"), _section(client, gv, cid, "  B  ")
    assert b["title"] == "B" and b["lessons"] == []
    assert [s["title"] for s in _content(client, gv, cid)["sections"]] == ["Chủ đề 1", "A", "B"]

    r = client.patch(f"/teach/courses/{cid}/sections/{a['id']}", json={"title": "A mới", "description": "Tóm tắt"},
                     headers=gv)
    assert r.status_code == 200 and (r.json()["title"], r.json()["description"]) == ("A mới", "Tóm tắt")

    order = [b["id"], first["id"], a["id"]]
    assert client.put(f"/teach/courses/{cid}/sections/order", json={"ids": order}, headers=gv).status_code == 204
    assert [s["id"] for s in _content(client, gv, cid)["sections"]] == order
    # Thiếu / thừa / trùng id → 422
    for ids in ([b["id"], a["id"]], order + [999], [b["id"], b["id"], a["id"]]):
        assert client.put(f"/teach/courses/{cid}/sections/order", json={"ids": ids}, headers=gv).status_code == 422

    assert client.delete(f"/teach/courses/{cid}/sections/{b['id']}", headers=gv).status_code == 204
    assert [s["id"] for s in _content(client, gv, cid)["sections"]] == [first["id"], a["id"]]
    assert client.patch(f"/teach/courses/{cid}/sections/{b['id']}", json={"title": "X"}, headers=gv).status_code == 404


def test_xoa_chu_de_xoa_ca_bai(client, users, gv, cid):
    sec = _content(client, gv, cid)["sections"][0]
    assert client.delete(f"/teach/courses/{cid}/sections/{sec['id']}", headers=gv).status_code == 204
    c = client.get(f"/teach/courses/{cid}", headers=gv).json()
    assert (c["lesson_count"], c["quiz_count"]) == (0, 0)


def test_quyen_noi_dung(client, users, cid):
    tg, gv2 = users["tg@x.dev"], users["gv2@x.dev"]
    content = _content(client, tg, cid)
    assert content["can_edit"] is False and len(content["sections"][0]["lessons"]) == 3
    assert _content(client, users["gv@x.dev"], cid)["can_edit"] is True
    assert client.post(f"/teach/courses/{cid}/sections", json={"title": "X"}, headers=tg).status_code == 403
    assert client.get(f"/teach/courses/{cid}/content", headers=gv2).status_code == 403
    sid = content["sections"][0]["id"]
    assert client.delete(f"/teach/courses/{cid}/sections/{sid}", headers=tg).status_code == 403


# --------------------------------------------------------------------------- #
# Bài học
# --------------------------------------------------------------------------- #
def test_bai_doc_co_anh_va_tai_lieu_dinh_kem(client, gv, cid, s3):
    sid = _section(client, gv, cid)["id"]
    img = upload(client, gv, cid, s3)
    doc = upload(client, gv, cid, s3, name="so-tay.pdf", content_type="application/pdf")
    x = _lesson(client, gv, cid, sid, title="Bảng tra PPE", content=f"# PPE\n\n![Sơ đồ](file:{img})",
                estimated_minutes=5, status="published", attachment_ids=[doc])
    assert [f["id"] for f in x["images"]] == [img] and [f["id"] for f in x["attachments"]] == [doc]
    assert x["attachments"][0]["filename"] == "so-tay.pdf" and "X-Amz-Signature=" in x["attachments"][0]["url"]

    # Bỏ ảnh khỏi Markdown → bỏ khỏi lesson_files; không gửi attachment_ids → giữ tài liệu đính kèm
    r = client.patch(f"/teach/courses/{cid}/lessons/{x['id']}", json={"content": "Không còn ảnh"}, headers=gv)
    assert r.status_code == 200 and r.json()["images"] == [] and len(r.json()["attachments"]) == 1
    r = client.patch(f"/teach/courses/{cid}/lessons/{x['id']}", json={"attachment_ids": []}, headers=gv)
    assert r.json()["attachments"] == []


def test_anh_cua_khoa_khac_bi_422(client, users, gv, cid, s3):
    other = _create(client, gv, code="KHAC")
    img = upload(client, gv, other["id"], s3)
    sid = _section(client, gv, cid)["id"]
    r = _lesson(client, gv, cid, sid, expect=422, content=f"![x](file:{img})")
    assert f"file:{img}" in r["detail"]


def test_bai_video_pdf_can_file_dung_loai(client, gv, cid, s3):
    sid = _section(client, gv, cid)["id"]
    video = upload(client, gv, cid, s3, name="v.mp4", content_type="video/mp4", duration_seconds=60)
    pdf = upload(client, gv, cid, s3, name="t.pdf", content_type="application/pdf")
    assert _lesson(client, gv, cid, sid, expect=422, lesson_type="video")["detail"] == "Bài video cần file video"
    _lesson(client, gv, cid, sid, expect=422, lesson_type="video", media_object_id=pdf)
    x = _lesson(client, gv, cid, sid, lesson_type="video", media_object_id=video, description="Mô tả")
    assert x["media"]["id"] == video and x["media"]["duration_seconds"] == 60

    # Đổi video → pdf phải đổi file; → bài đọc thì bỏ file
    url = f"/teach/courses/{cid}/lessons/{x['id']}"
    assert client.patch(url, json={"lesson_type": "pdf"}, headers=gv).status_code == 422
    r = client.patch(url, json={"lesson_type": "pdf", "media_object_id": pdf}, headers=gv)
    assert r.status_code == 200 and r.json()["media"]["content_type"] == "application/pdf"
    r = client.patch(url, json={"lesson_type": "page", "content": "Nội dung"}, headers=gv)
    assert r.status_code == 200 and r.json()["media"] is None


def test_bai_kiem_tra(client, gv, cid):
    sid = _section(client, gv, cid)["id"]
    x = _lesson(client, gv, cid, sid, lesson_type="quiz", title="Kiểm tra cuối",
                quiz={"is_graded": True, "pass_score_percent": 80, "time_limit_seconds": 1800, "max_attempts": 2})
    assert x["quiz"] == {"is_graded": True, "pass_score_percent": 80.0, "time_limit_seconds": 1800,
                         "max_attempts": 2, "question_count": 0}
    url = f"/teach/courses/{cid}/lessons/{x['id']}"
    r = client.patch(url, json={"quiz": {"is_graded": False, "max_attempts": None}}, headers=gv)
    assert r.json()["quiz"]["is_graded"] is False and r.json()["quiz"]["max_attempts"] is None
    assert client.patch(url, json={"lesson_type": "page"}, headers=gv).status_code == 422
    # Mặc định khi không gửi cài đặt
    y = _lesson(client, gv, cid, sid, lesson_type="quiz")
    assert y["quiz"]["pass_score_percent"] == 70 and y["quiz"]["time_limit_seconds"] is None


def test_sap_xep_va_chuyen_chu_de(client, gv, cid):
    a, b = _section(client, gv, cid, "A")["id"], _section(client, gv, cid, "B")["id"]
    x1, x2, x3 = (_lesson(client, gv, cid, a, title=t)["id"] for t in ("1", "2", "3"))
    assert client.put(f"/teach/courses/{cid}/sections/{a}/lessons/order", json={"ids": [x3, x1, x2]},
                      headers=gv).status_code == 204
    assert client.put(f"/teach/courses/{cid}/sections/{a}/lessons/order", json={"ids": [x3, x1]},
                      headers=gv).status_code == 422
    _lesson(client, gv, cid, b, title="4")
    r = client.patch(f"/teach/courses/{cid}/lessons/{x1}", json={"section_id": b}, headers=gv)
    assert r.status_code == 200 and r.json()["section_id"] == b
    sections = {s["id"]: [x["title"] for x in s["lessons"]] for s in _content(client, gv, cid)["sections"]}
    assert sections[a] == ["3", "2"] and sections[b] == ["4", "1"]


def test_xoa_bai_va_hoc_vien_thay_bai_moi(client, users, gv, cid):
    hv = users["hv@x.dev"]
    client.patch(f"/teach/courses/{cid}", json={"status": "published"}, headers=gv)
    sid = _section(client, gv, cid)["id"]
    draft = _lesson(client, gv, cid, sid, title="Nháp", content="a")
    pub = _lesson(client, gv, cid, sid, title="Đã xuất bản", content="a", status="published")

    def learner_titles():
        sections = client.get(f"/me/courses/{cid}", headers=hv).json()["sections"]
        return [x["title"] for s in sections for x in s["lessons"]]

    assert "Đã xuất bản" in learner_titles() and "Nháp" not in learner_titles()
    client.patch(f"/teach/courses/{cid}/lessons/{draft['id']}", json={"status": "published"}, headers=gv)
    assert "Nháp" in learner_titles()

    assert client.delete(f"/teach/courses/{cid}/lessons/{pub['id']}", headers=gv).status_code == 204
    assert "Đã xuất bản" not in learner_titles()
    assert client.delete(f"/teach/courses/{cid}/lessons/{pub['id']}", headers=gv).status_code == 404


def test_bai_cua_khoa_khac_bi_404(client, gv, cid):
    other = _create(client, gv, code="KHAC")
    sid = _section(client, gv, other["id"])["id"]
    x = _lesson(client, gv, other["id"], sid)
    assert client.patch(f"/teach/courses/{cid}/lessons/{x['id']}", json={"title": "X"}, headers=gv).status_code == 404
    _lesson(client, gv, cid, sid, expect=404)  # chủ đề của khóa khác
