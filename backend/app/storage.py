"""URL truy cập file trong object storage (bảng storage_objects).

Hiện ghép URL công khai từ MEDIA_BASE_URL. Khi có module lưu trữ thật (MinIO/S3) chỉ cần đổi
file_url() sang ký presigned URL, các router không phải sửa.
"""

from __future__ import annotations

from urllib.parse import quote

from .config import get_settings
from .models import StorageObject


def file_url(obj: StorageObject | None) -> str | None:
    """URL tải/xem file; None nếu file chưa sẵn sàng hoặc chưa cấu hình storage."""
    base = get_settings().media_base_url
    if obj is None or obj.upload_status != "ready" or not base:
        return None
    return f"{base.rstrip('/')}/{quote(obj.bucket)}/{quote(obj.object_key)}"
