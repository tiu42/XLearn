"""Object storage chuẩn S3 (bảng storage_objects chỉ lưu metadata, file nằm trong bucket).

Có S3_BUCKET: bucket để private, upload bằng multipart với presigned URL cho từng phần (trình duyệt
gửi thẳng lên bucket, file không đi qua API) và xem file bằng presigned GET. Chạy được với SeaweedFS (dev), Supabase Storage,
AWS S3, MinIO… — đổi nhà cung cấp chỉ cần sửa biến môi trường.
Không có S3_BUCKET: ghép URL công khai từ MEDIA_BASE_URL như trước (không upload được).
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .config import get_settings
from .models import StorageObject


def enabled() -> bool:
    return bool(get_settings().s3_bucket)


def _client(endpoint_url: str | None):
    s = get_settings()
    return boto3.client(
        "s3", endpoint_url=endpoint_url, region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key, aws_secret_access_key=s.s3_secret_key,
        # path-style: SeaweedFS / MinIO / Supabase không dùng tên bucket làm subdomain
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}))


@lru_cache(maxsize=1)
def api_client():
    """Backend gọi bucket (kiểm tra / xóa object)."""
    return _client(get_settings().s3_endpoint_url)


@lru_cache(maxsize=1)
def presign_client():
    """Chỉ để ký URL cho trình duyệt: chữ ký gắn với host, nên phải ký bằng địa chỉ trình duyệt dùng."""
    s = get_settings()
    return _client(s.s3_public_url or s.s3_endpoint_url)


# --------------------------------------------------------------------------- #
# Multipart upload: file chia thành nhiều phần, trình duyệt PUT từng phần bằng presigned URL
# (tải song song, phần lỗi chỉ cần gửi lại phần đó), backend ghép lại khi xong.
# S3: mỗi phần ≥ 5 MiB (trừ phần cuối), tối đa 10.000 phần.
# --------------------------------------------------------------------------- #
MIN_PART_SIZE = 5 * 1024 * 1024
MAX_PARTS = 10_000


def part_layout(size_bytes: int) -> tuple[int, int]:
    """(kích thước mỗi phần, số phần): phần mặc định S3_PART_SIZE_MB, tự tăng để không vượt 10.000 phần."""
    mib = 1024 * 1024
    part = max(get_settings().s3_part_size_mb * mib, MIN_PART_SIZE, -(-size_bytes // MAX_PARTS))
    part = -(-part // mib) * mib  # làm tròn lên MiB
    return part, max(1, -(-size_bytes // part))


def create_multipart(obj: StorageObject) -> str:
    """Bắt đầu multipart upload; trả về upload_id."""
    return api_client().create_multipart_upload(
        Bucket=obj.bucket, Key=obj.object_key, ContentType=obj.content_type)["UploadId"]


def part_url(obj: StorageObject, upload_id: str, part_number: int) -> str:
    """URL để trình duyệt PUT một phần; ETag trong response dùng để ghép file."""
    return presign_client().generate_presigned_url(
        "upload_part", Params={"Bucket": obj.bucket, "Key": obj.object_key, "UploadId": upload_id,
                               "PartNumber": part_number},
        ExpiresIn=get_settings().s3_presign_seconds)


def complete_multipart(obj: StorageObject, upload_id: str, parts: list[tuple[int, str]]) -> None:
    """Ghép các phần (part_number, etag) thành object. Thiếu/sai phần → ClientError."""
    api_client().complete_multipart_upload(
        Bucket=obj.bucket, Key=obj.object_key, UploadId=upload_id,
        MultipartUpload={"Parts": [{"PartNumber": n, "ETag": etag} for n, etag in parts]})


def abort_multipart(obj: StorageObject, upload_id: str) -> None:
    """Hủy upload dở: bucket xóa các phần đã nhận (không thì vẫn chiếm dung lượng)."""
    try:
        api_client().abort_multipart_upload(Bucket=obj.bucket, Key=obj.object_key, UploadId=upload_id)
    except ClientError:
        pass  # đã hủy / đã hoàn tất / upload_id sai: không còn gì để dọn


def head(obj: StorageObject) -> dict | None:
    """Metadata của object trong bucket; None nếu chưa có (chưa upload xong)."""
    try:
        return api_client().head_object(Bucket=obj.bucket, Key=obj.object_key)
    except ClientError:
        return None


def delete(obj: StorageObject) -> None:
    try:
        api_client().delete_object(Bucket=obj.bucket, Key=obj.object_key)
    except ClientError:
        pass  # dọn dẹp, không chặn luồng chính


def file_url(obj: StorageObject | None) -> str | None:
    """URL tải/xem file; None nếu file chưa sẵn sàng hoặc chưa cấu hình storage."""
    if obj is None or obj.upload_status != "ready":
        return None
    s = get_settings()
    if s.s3_bucket:
        return presign_client().generate_presigned_url(
            "get_object", Params={"Bucket": obj.bucket, "Key": obj.object_key}, ExpiresIn=s.s3_presign_seconds)
    if not s.media_base_url:
        return None
    return f"{s.media_base_url.rstrip('/')}/{quote(obj.bucket)}/{quote(obj.object_key)}"
