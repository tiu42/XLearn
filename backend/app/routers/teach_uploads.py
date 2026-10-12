"""Upload file cho khóa học (giảng viên): video, PDF, ảnh trong bài đọc, tài liệu đính kèm.

Multipart upload (file không đi qua API, file lớn tải song song và gửi lại được từng phần):
1. POST /teach/courses/{id}/uploads → tạo storage_objects 'pending', bắt đầu multipart, trả upload_id
   + cách chia phần (part_size, part_count)
2. POST …/uploads/{object_id}/parts → presigned URL cho một lô phần (xin dần trong lúc tải → URL không
   hết hạn giữa chừng với file lớn); trình duyệt PUT từng phần thẳng lên bucket, giữ lại ETag
3. POST …/uploads/{object_id}/complete → backend ghép các phần, kiểm tra kích thước thật → 'ready'
   DELETE …/uploads/{object_id}?upload_id=… → hủy upload dở (bucket xóa các phần đã nhận)
Object key bắt đầu bằng courses/{course_id}/ → biết file thuộc khóa nào khi gắn vào bài học.
upload_id do máy khách giữ; bucket chỉ chấp nhận upload_id khớp với object key nên không dùng chéo được.
File chưa gắn vào bài nào và upload bỏ dở không hủy vẫn nằm trong bucket (chưa có job dọn rác).
"""

from __future__ import annotations

import re
import uuid

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from .. import storage
from ..config import get_settings
from ..db import get_db
from ..deps import require_course_instructor
from ..logging_utils import log_event
from ..models import StorageObject, User
from ..schemas import (
    StorageFileOut,
    UploadCompleteIn,
    UploadCreate,
    UploadPartsIn,
    UploadPartsOut,
    UploadPartUrlOut,
    UploadTicketOut,
)
from .teach_courses import load_editable_course

router = APIRouter(prefix="/teach/courses/{course_id}/uploads", tags=["instructor: uploads"])

VIDEO_TYPES = {"video/mp4", "video/webm"}
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
PDF = "application/pdf"
DOCUMENT_TYPES = {
    PDF, "text/plain", "text/csv", "application/zip", "application/x-zip-compressed",
    "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
ALLOWED_TYPES = VIDEO_TYPES | IMAGE_TYPES | DOCUMENT_TYPES

_FORBIDDEN = "Trợ giảng không được tải file lên khóa học"


def course_prefix(course_id: int) -> str:
    return f"courses/{course_id}/"


def _safe_name(filename: str) -> str:
    """Tên file an toàn cho object key: chỉ chữ/số ASCII, '.', '-', '_' (tên gốc vẫn lưu ở original_filename)."""
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]).strip("._")
    return name[-100:] or "file"


def file_out(obj: StorageObject) -> StorageFileOut:
    return StorageFileOut(id=obj.id, filename=obj.original_filename, content_type=obj.content_type,
                          size_bytes=obj.size_bytes, duration_seconds=obj.duration_seconds,
                          page_count=obj.page_count, url=storage.file_url(obj))


def _check(db: Session, user: User, course_id: int) -> None:
    if not storage.enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Máy chủ chưa cấu hình nơi lưu trữ file (S3_BUCKET)")
    load_editable_course(db, user, course_id, _FORBIDDEN)


def _max_bytes() -> int:
    return get_settings().max_upload_mb * 1024 * 1024


def _too_large() -> HTTPException:
    mb = get_settings().max_upload_mb
    limit = f"{mb // 1024} GB" if mb >= 1024 and mb % 1024 == 0 else f"{mb} MB"
    return HTTPException(413, detail=f"File vượt quá {limit}")  # hằng số 413 đổi tên giữa các bản Starlette


def _upload_object(db: Session, course_id: int, object_id: int) -> StorageObject:
    """Lượt upload (đang tải hoặc đã xong) thuộc khóa; không có / đã hủy → 404."""
    obj = db.get(StorageObject, object_id)
    if obj is None or not obj.object_key.startswith(course_prefix(course_id)) \
            or obj.upload_status not in ("pending", "ready"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")
    return obj


_ALREADY_DONE = HTTPException(status.HTTP_409_CONFLICT, detail="File đã được tải lên xong")


@router.post("", response_model=UploadTicketOut, status_code=status.HTTP_201_CREATED,
             responses={403: {"description": "Không có quyền sửa khóa"}, 413: {"description": "File quá lớn"},
                        415: {"description": "Định dạng không hỗ trợ"}, 503: {"description": "Chưa cấu hình storage"}})
def create_upload(
    course_id: int,
    body: UploadCreate,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    _check(db, user, course_id)
    content_type = body.content_type.split(";")[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail="Định dạng file không được hỗ trợ (video MP4/WebM, PDF, ảnh, tài liệu Office, ZIP, TXT/CSV)")
    if body.size_bytes > _max_bytes():
        raise _too_large()

    settings = get_settings()
    obj = StorageObject(
        provider=settings.s3_provider, bucket=settings.s3_bucket,
        object_key=f"{course_prefix(course_id)}{uuid.uuid4().hex}/{_safe_name(body.filename)}",
        original_filename=body.filename, content_type=content_type, size_bytes=body.size_bytes,
        upload_status="pending", uploaded_by=user.id)
    upload_id = storage.create_multipart(obj)
    db.add(obj)
    db.commit()
    part_size, part_count = storage.part_layout(body.size_bytes)
    return UploadTicketOut(id=obj.id, upload_id=upload_id, part_size=part_size, part_count=part_count)


@router.post("/{object_id}/parts", response_model=UploadPartsOut,
             responses={404: {"description": "Không có lượt upload"}, 409: {"description": "File đã tải xong"}})
def upload_part_urls(
    course_id: int,
    object_id: int,
    body: UploadPartsIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Presigned URL cho tối đa 100 phần một lần."""
    _check(db, user, course_id)
    obj = _upload_object(db, course_id, object_id)
    if obj.upload_status == "ready":
        raise _ALREADY_DONE
    return UploadPartsOut(
        parts=[UploadPartUrlOut(part_number=n, url=storage.part_url(obj, body.upload_id, n))
               for n in dict.fromkeys(body.part_numbers)],
        expires_in=get_settings().s3_presign_seconds)


@router.post("/{object_id}/complete", response_model=StorageFileOut,
             responses={404: {"description": "Không có lượt upload"}, 409: {"description": "Upload đã bị hủy"},
                        413: {"description": "File quá lớn"}, 422: {"description": "Thiếu hoặc sai phần"}})
def complete_upload(
    course_id: int,
    object_id: int,
    body: UploadCompleteIn,
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Ghép các phần đã PUT thành file. Gọi lại nhiều lần không sao (file đã 'ready' thì trả luôn)."""
    _check(db, user, course_id)
    obj = _upload_object(db, course_id, object_id)
    if obj.upload_status == "pending":
        numbers = [p.part_number for p in body.parts]
        if numbers != sorted(set(numbers)):
            raise HTTPException(422, detail="Danh sách phần phải tăng dần và không trùng")
        try:
            storage.complete_multipart(obj, body.upload_id, [(p.part_number, p.etag) for p in body.parts])
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "NoSuchUpload":
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    detail="Lượt tải lên đã bị hủy hoặc hết hạn. Hãy chọn lại file.") from None
            raise HTTPException(422, detail="Thiếu hoặc sai phần của file nên chưa ghép được. Hãy tải lại file.") from None
        meta = storage.head(obj)
        if meta is None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="File chưa được tải lên xong")
        # Kích thước lúc tạo chỉ là khai báo → kiểm lại kích thước thật
        if meta["ContentLength"] > _max_bytes():
            storage.delete(obj)
            obj.upload_status = "failed"
            db.commit()
            raise _too_large()
        obj.size_bytes = meta["ContentLength"]
        obj.upload_status = "ready"
    if obj.content_type in VIDEO_TYPES and body.duration_seconds is not None:
        obj.duration_seconds = body.duration_seconds
    if obj.content_type == PDF and body.page_count is not None:
        obj.page_count = body.page_count
    db.commit()
    log_event("file_uploaded", object_id=obj.id, course_id=course_id, by=user.id, size=obj.size_bytes)
    return file_out(obj)


@router.delete("/{object_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={404: {"description": "Không có lượt upload"}, 409: {"description": "File đã tải xong"}})
def abort_upload(
    course_id: int,
    object_id: int,
    upload_id: str = Query(min_length=1, max_length=1024),
    user: User = Depends(require_course_instructor),
    db: Session = Depends(get_db),
):
    """Hủy upload dở (người dùng bấm hủy / tải lỗi): bucket xóa các phần đã nhận."""
    _check(db, user, course_id)
    obj = _upload_object(db, course_id, object_id)
    if obj.upload_status == "ready":
        raise _ALREADY_DONE
    storage.abort_multipart(obj, upload_id)
    obj.upload_status = "failed"
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
