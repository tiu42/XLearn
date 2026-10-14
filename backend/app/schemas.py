"""Pydantic schema cho request/response của API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, StringConstraints


def _lower_email(value: str) -> str:
    return value.strip().lower()


def _bcrypt_limit(value: str) -> str:
    # bcrypt chỉ dùng 72 byte đầu (bcrypt>=5 ném lỗi nếu dài hơn) → chặn ngay ở tầng validate
    if len(value.encode()) > 72:
        raise ValueError("Mật khẩu tối đa 72 byte")
    return value


LoginEmail = Annotated[str, Field(min_length=3, max_length=255), AfterValidator(_lower_email)]
NewEmail = Annotated[EmailStr, AfterValidator(_lower_email)]
NewPassword = Annotated[str, Field(min_length=8), AfterValidator(_bcrypt_limit)]
UserStatus = Literal["active", "inactive", "locked"]
RoleCodes = Annotated[list[str], Field(min_length=1)]
# Mã nhân viên: bỏ khoảng trắng, viết hoa (nv0412 → NV0412) để UNIQUE không bị lách bằng chữ thường
EmployeeCode = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=20)]


# --------------------------------------------------------------------------- #
# Xác thực
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    email: LoginEmail
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: NewPassword


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Số giây access token còn hiệu lực")


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    employee_code: str | None
    department: DepartmentOut | None
    avatar_url: str | None
    status: str
    roles: list[str]
    last_login_at: datetime | None
    created_at: datetime

    @classmethod
    def from_user(cls, user) -> UserOut:
        return cls.model_validate({
            **{f: getattr(user, f) for f in cls.model_fields if f not in ("roles", "department")},
            "department": user.department,
            "roles": sorted(r.code for r in user.roles),
        })


class LoginResponse(TokenResponse):
    user: UserOut


# --------------------------------------------------------------------------- #
# Quản trị tài khoản
# --------------------------------------------------------------------------- #
class AdminUserCreate(BaseModel):
    email: NewEmail
    full_name: str = Field(min_length=1, max_length=150)
    password: NewPassword
    roles: RoleCodes
    employee_code: EmployeeCode | None = None
    department_id: int | None = None


class AdminUserUpdate(BaseModel):
    """Trường bỏ trống = giữ nguyên. Riêng employee_code / department_id: gửi null = xóa giá trị."""

    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    status: UserStatus | None = None
    roles: RoleCodes | None = None
    employee_code: EmployeeCode | None = None
    department_id: int | None = None


class ResetPasswordRequest(BaseModel):
    new_password: NewPassword


class UserListOut(BaseModel):
    items: list[UserOut]
    total: int


# --------------------------------------------------------------------------- #
# Khóa học của tôi (học viên)
# --------------------------------------------------------------------------- #
MyCourseStatus = Literal["active", "completed"]
MyCourseSort = Literal["title", "recent", "due"]


class MyCourseOut(BaseModel):
    id: int  # courses.id
    code: str
    title: str
    short_description: str | None
    department: DepartmentOut | None
    is_mandatory: bool
    thumbnail_url: str | None
    course_status: str
    enrollment_status: MyCourseStatus
    enrolled_at: datetime
    due_at: datetime | None
    completed_at: datetime | None
    total_lessons: int
    completed_lessons: int
    progress_percent: float
    last_activity_at: datetime | None


class MyCourseListOut(BaseModel):
    items: list[MyCourseOut]
    total: int
    # Phòng ban của mọi khóa đang ghi danh (không phụ thuộc bộ lọc) → dựng ô lọc phòng ban
    departments: list[DepartmentOut]


LessonProgressStatus = Literal["not_started", "in_progress", "completed"]


class MyLessonOut(BaseModel):
    id: int
    title: str
    lesson_type: str
    estimated_minutes: int | None
    status: LessonProgressStatus


class MySectionOut(BaseModel):
    id: int
    title: str
    description: str | None
    total_lessons: int
    completed_lessons: int
    status: LessonProgressStatus
    # Khóa học tuần tự: chủ đề bị khóa khi còn chủ đề đứng trước chưa hoàn thành
    locked: bool
    lessons: list[MyLessonOut]


class MyCourseDetailOut(MyCourseOut):
    description: str | None
    is_sequential: bool
    # Điểm đạt của bài kiểm tra tính điểm cuối cùng trong khóa; None = khóa không có bài tính điểm
    final_pass_percent: float | None
    sections: list[MySectionOut]


# --------------------------------------------------------------------------- #
# Giao diện học (học viên)
# --------------------------------------------------------------------------- #
# Mã quy tắc hoàn thành (app/learning.py): open = mở bài là xong, percent = đạt đủ % (completion_percent),
# quiz_pass = làm đạt bài kiểm tra
CompletionRuleCode = Literal["open", "percent", "quiz_pass"]


class LessonFileOut(BaseModel):
    id: int  # storage_objects.id — bài đọc tham chiếu ảnh bằng ![…](file:<id>)
    filename: str | None
    content_type: str
    size_bytes: int | None
    purpose: Literal["attachment", "inline"]
    url: str | None  # None = file chưa sẵn sàng


class LessonMediaOut(BaseModel):
    filename: str | None
    content_type: str
    size_bytes: int | None
    duration_seconds: int | None
    page_count: int | None
    url: str | None


class LessonQuizInfoOut(BaseModel):
    is_graded: bool
    pass_score_percent: float
    time_limit_seconds: int | None  # None = không giới hạn
    max_attempts: int | None  # None = không giới hạn
    question_count: int
    review_policy: str
    opens_at: datetime | None
    closes_at: datetime | None


class LessonProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: LessonProgressStatus
    progress_percent: float
    last_position_seconds: int | None
    last_page: int | None
    time_spent_seconds: int
    started_at: datetime | None
    completed_at: datetime | None


class CompletionRuleOut(BaseModel):
    code: CompletionRuleCode
    percent: float | None = None  # chỉ có với code = percent


class MyLessonDetailOut(BaseModel):
    id: int
    course_id: int
    section_id: int
    title: str
    description: str | None
    lesson_type: str
    estimated_minutes: int | None
    content: str | None  # bài đọc: Markdown
    media: LessonMediaOut | None  # video / pdf
    files: list[LessonFileOut]
    quiz: LessonQuizInfoOut | None
    completion: CompletionRuleOut
    progress: LessonProgressOut


class LessonProgressIn(BaseModel):
    """Số liệu học; bỏ trống trường nào = không có thông tin mới. Body rỗng = chỉ báo đã mở bài."""

    progress_percent: float | None = Field(default=None, ge=0, le=100)
    position_seconds: int | None = Field(default=None, ge=0, description="Video: vị trí đang xem")
    page: int | None = Field(default=None, ge=1, description="PDF: trang đang đọc")
    time_spent_seconds: int = Field(default=0, ge=0, le=86400, description="Thời gian học thêm từ lần gửi trước")


class CourseProgressOut(BaseModel):
    total_lessons: int
    completed_lessons: int
    progress_percent: float
    enrollment_status: MyCourseStatus
    completed_at: datetime | None


class LessonProgressResultOut(BaseModel):
    lesson_id: int
    progress: LessonProgressOut
    course: CourseProgressOut


# --------------------------------------------------------------------------- #
# Làm bài kiểm tra (học viên)
# --------------------------------------------------------------------------- #
QuestionType = Literal["single_choice", "multiple_choice", "true_false", "short_text"]
AttemptStatus = Literal["in_progress", "submitted", "expired"]
# Lý do không bắt đầu được lượt mới: chưa mở / đã đóng / hết lượt / chưa có câu hỏi
QuizBlockReason = Literal["not_open", "closed", "no_attempts", "no_questions"]


class QuizAnswerIn(BaseModel):
    question_id: int
    option_ids: list[int] = Field(default_factory=list, max_length=20,
                                  description="Câu trắc nghiệm: id phương án đã chọn")
    text: str | None = Field(default=None, max_length=1000, description="Câu tự luận ngắn")


class QuizAnswersIn(BaseModel):
    """Toàn bộ bài làm hiện tại (thay cho bản đã lưu). Câu không có trong danh sách = bỏ trống."""

    answers: list[QuizAnswerIn] = Field(default_factory=list, max_length=500)


class QuizAnswerOut(BaseModel):
    question_id: int
    option_ids: list[int]
    text: str | None


class QuizAttemptSummaryOut(BaseModel):
    id: int
    attempt_no: int
    status: AttemptStatus
    score: float | None
    max_score: float | None
    score_percent: float | None
    passed: bool | None
    started_at: datetime
    submitted_at: datetime | None
    expires_at: datetime | None  # hạn nộp; None = không giới hạn


class QuizStatusOut(BaseModel):
    attempts: list[QuizAttemptSummaryOut]  # lượt mới nhất trước
    attempts_used: int
    attempts_left: int | None  # None = không giới hạn
    in_progress: QuizAttemptSummaryOut | None  # lượt đang làm dở (làm tiếp được)
    can_start: bool  # bắt đầu được lượt mới (khi không có lượt đang làm dở)
    blocked_reason: QuizBlockReason | None
    best_score_percent: float | None
    passed: bool  # đã có lượt đạt
    review_available: bool  # các lượt đã nộp xem được đáp án chưa
    server_time: datetime


class QuizOptionOut(BaseModel):
    id: int
    content: str


class QuizQuestionOut(BaseModel):
    """Câu hỏi khi đang làm bài: không có đáp án đúng."""

    id: int
    question_type: QuestionType
    content: str
    points: int
    options: list[QuizOptionOut]  # short_text: rỗng


class QuizAttemptOut(QuizAttemptSummaryOut):
    """Lượt đang làm: câu hỏi (theo thứ tự của lượt) + bài làm đã lưu."""

    time_limit_seconds: int | None
    questions: list[QuizQuestionOut]
    answers: list[QuizAnswerOut]
    server_time: datetime  # máy khách tính độ lệch đồng hồ để đếm ngược đúng


class QuizAnswersSavedOut(BaseModel):
    saved_at: datetime
    expires_at: datetime | None


class QuizReviewOptionOut(QuizOptionOut):
    is_correct: bool


class QuizReviewQuestionOut(BaseModel):
    id: int
    question_type: QuestionType
    content: str
    points: int
    explanation: str | None
    options: list[QuizReviewOptionOut]  # short_text: rỗng (đáp án ở accepted_answers)
    accepted_answers: list[str]  # short_text: các đáp án được chấp nhận
    selected_option_ids: list[int]
    text: str | None
    answered: bool
    correct: bool
    earned_points: int


class QuizAttemptResultOut(QuizAttemptSummaryOut):
    question_count: int
    answered_count: int
    correct_count: int
    time_spent_seconds: int
    pass_score_percent: float
    review_policy: str
    review_available: bool
    questions: list[QuizReviewQuestionOut] | None  # None = chưa/không được xem đáp án


class QuizSubmitOut(BaseModel):
    attempt: QuizAttemptResultOut
    progress: LessonProgressOut
    course: CourseProgressOut


# --------------------------------------------------------------------------- #
# Quản lý khóa học (giảng viên)
# --------------------------------------------------------------------------- #
CourseStatus = Literal["draft", "published", "archived"]
InstructorRole = Literal["owner", "co_instructor", "assistant"]
# Mã khóa: bỏ khoảng trắng, viết hoa (atld-01 → ATLD-01) để UNIQUE không bị lách bằng chữ thường
CourseCode = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=50)]
CourseTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class TeachCourseCreate(BaseModel):
    code: CourseCode
    title: CourseTitle
    short_description: str | None = Field(default=None, max_length=500)
    description: str | None = None
    department_id: int | None = None
    is_mandatory: bool = False
    is_sequential: bool = False
    default_due_at: datetime | None = None
    status: CourseStatus = "draft"


class TeachCourseUpdate(BaseModel):
    """Trường bỏ trống = giữ nguyên. Các trường cho phép NULL: gửi null = xóa giá trị."""

    code: CourseCode | None = None
    title: CourseTitle | None = None
    short_description: str | None = Field(default=None, max_length=500)
    description: str | None = None
    department_id: int | None = None
    is_mandatory: bool | None = None
    is_sequential: bool | None = None
    default_due_at: datetime | None = None
    status: CourseStatus | None = None


class TeachCourseOut(BaseModel):
    id: int
    code: str
    title: str
    short_description: str | None
    description: str | None
    department: DepartmentOut | None
    is_mandatory: bool
    is_sequential: bool
    default_due_at: datetime | None
    status: CourseStatus
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    thumbnail_url: str | None
    # Vai trò của user trong khóa; None = admin không phụ trách khóa
    my_role: InstructorRole | None
    can_edit: bool  # sửa thông tin khóa (owner, co_instructor, admin)
    can_delete: bool  # xóa khóa (owner, admin)
    # Số liệu: bài học / bài kiểm tra chưa xóa (kể cả bản nháp), học viên chưa bị xóa khỏi khóa
    lesson_count: int
    quiz_count: int
    learner_count: int
    completed_count: int


class TeachCourseListOut(BaseModel):
    items: list[TeachCourseOut]
    total: int


# --------------------------------------------------------------------------- #
# Upload file (giảng viên)
# --------------------------------------------------------------------------- #
class UploadCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)
    size_bytes: int = Field(ge=1)


class UploadTicketOut(BaseModel):
    """Multipart upload: chia file thành part_count phần, mỗi phần part_size byte (phần cuối ngắn hơn).
    Xin URL từng phần qua …/uploads/{id}/parts, PUT từng phần, xong gọi …/uploads/{id}/complete."""

    id: int  # storage_objects.id
    upload_id: str
    part_size: int
    part_count: int


UploadId = Annotated[str, Field(min_length=1, max_length=1024)]
PartNumber = Annotated[int, Field(ge=1, le=10_000)]


class UploadPartsIn(BaseModel):
    upload_id: UploadId
    part_numbers: list[PartNumber] = Field(min_length=1, max_length=100)


class UploadPartUrlOut(BaseModel):
    part_number: int
    url: str  # PUT nội dung phần; đọc header ETag của response


class UploadPartsOut(BaseModel):
    parts: list[UploadPartUrlOut]
    expires_in: int


class UploadedPartIn(BaseModel):
    part_number: PartNumber
    etag: str = Field(min_length=1, max_length=200)


class UploadCompleteIn(BaseModel):
    upload_id: UploadId
    parts: list[UploadedPartIn] = Field(min_length=1, max_length=10_000)
    # Trình duyệt đọc được khi xem trước file → gửi kèm để hiện thời lượng / số trang
    duration_seconds: int | None = Field(default=None, ge=0)
    page_count: int | None = Field(default=None, ge=1)


class StorageFileOut(BaseModel):
    id: int  # storage_objects.id — bài đọc tham chiếu ảnh bằng ![…](file:<id>)
    filename: str | None
    content_type: str
    size_bytes: int | None
    duration_seconds: int | None
    page_count: int | None
    url: str | None  # None = file chưa sẵn sàng / chưa cấu hình storage


# --------------------------------------------------------------------------- #
# Nội dung khóa học: chủ đề & bài học (giảng viên)
# --------------------------------------------------------------------------- #
LessonType = Literal["video", "pdf", "page", "quiz"]
LessonStatus = Literal["draft", "published"]
SectionTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class TeachSectionIn(BaseModel):
    title: SectionTitle
    description: str | None = None


class TeachSectionUpdate(BaseModel):
    """Trường bỏ trống = giữ nguyên; description: gửi null = xóa."""

    title: SectionTitle | None = None
    description: str | None = None


class OrderIn(BaseModel):
    """Toàn bộ id theo thứ tự mới (phải đủ và đúng các phần tử hiện có)."""

    ids: list[int] = Field(max_length=500)


class TeachQuizIn(BaseModel):
    """Cài đặt cơ bản của bài kiểm tra; câu hỏi, giờ mở/đóng… soạn ở trang soạn bài kiểm tra."""

    is_graded: bool = False
    pass_score_percent: float = Field(default=70, ge=0, le=100)
    time_limit_seconds: int | None = Field(default=None, ge=1)  # None = không giới hạn
    max_attempts: int | None = Field(default=None, ge=1)  # None = không giới hạn


class TeachQuizOut(TeachQuizIn):
    question_count: int


class TeachLessonIn(BaseModel):
    lesson_type: LessonType
    title: SectionTitle
    description: str | None = None
    content: str | None = Field(default=None, max_length=200_000)  # bài đọc: Markdown
    media_object_id: int | None = None  # video / pdf: file đã upload xong
    estimated_minutes: int | None = Field(default=None, ge=1, le=10_000)
    status: LessonStatus = "draft"
    attachment_ids: list[int] = Field(default_factory=list, max_length=20)  # theo thứ tự hiển thị
    quiz: TeachQuizIn | None = None  # chỉ với lesson_type = quiz


class TeachLessonUpdate(BaseModel):
    """Trường bỏ trống = giữ nguyên. Đổi được loại giữa video / pdf / page, không đổi được từ/sang quiz.
    section_id: chuyển bài sang chủ đề khác (xếp cuối chủ đề đó)."""

    lesson_type: LessonType | None = None
    section_id: int | None = None
    title: SectionTitle | None = None
    description: str | None = None
    content: str | None = Field(default=None, max_length=200_000)
    media_object_id: int | None = None
    estimated_minutes: int | None = Field(default=None, ge=1, le=10_000)
    status: LessonStatus | None = None
    attachment_ids: list[int] | None = Field(default=None, max_length=20)
    quiz: TeachQuizIn | None = None


class TeachLessonOut(BaseModel):
    id: int
    section_id: int
    lesson_type: LessonType
    title: str
    description: str | None
    content: str | None
    estimated_minutes: int | None
    status: LessonStatus
    media: StorageFileOut | None
    attachments: list[StorageFileOut]
    images: list[StorageFileOut]  # ảnh nhúng trong bài đọc (file:<id>)
    quiz: TeachQuizOut | None
    updated_at: datetime


class TeachSectionOut(BaseModel):
    id: int
    title: str
    description: str | None
    lessons: list[TeachLessonOut]


class TeachContentOut(BaseModel):
    can_edit: bool
    sections: list[TeachSectionOut]


# --------------------------------------------------------------------------- #
# Thông số khóa học & học viên (giảng viên)
# --------------------------------------------------------------------------- #
LearnerProgressStatus = Literal["not_started", "in_progress", "completed"]


class LearnerUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    employee_code: str | None
    email: str
    department: DepartmentOut | None
    status: UserStatus


class LearnerProgressOut(BaseModel):
    """Tiến độ một ghi danh; chỉ đếm bài học viên nhìn thấy (đã publish, chưa xóa mềm)."""

    enrollment_status: Literal["active", "completed"]
    enrolled_at: datetime
    due_at: datetime | None
    completed_at: datetime | None
    total_lessons: int
    completed_lessons: int
    progress_percent: float
    progress_status: LearnerProgressStatus
    last_activity_at: datetime | None
    # Bài kiểm tra cuối khóa = bài tính điểm đứng sau cùng; None = khóa không có hoặc chưa làm
    final_score_percent: float | None
    final_passed: bool | None


class CourseLearnerOut(LearnerProgressOut):
    user: LearnerUserOut


class CourseStatsLessonOut(BaseModel):
    id: int
    title: str
    lesson_type: LessonType
    section_title: str
    completed_count: int  # số học viên (chưa bị xóa khỏi khóa) đã hoàn thành bài


class CourseFinalQuizOut(BaseModel):
    lesson_id: int
    title: str
    pass_score_percent: float


class CourseStatsSummaryOut(BaseModel):
    learner_count: int
    completed_count: int
    in_progress_count: int
    not_started_count: int
    avg_progress_percent: float
    final_taken_count: int  # số học viên đã nộp bài kiểm tra cuối khóa
    final_avg_score_percent: float | None


class CourseStatsOut(BaseModel):
    can_edit: bool  # thêm/xóa học viên, đổi hạn (trợ giảng: chỉ xem)
    summary: CourseStatsSummaryOut
    lessons: list[CourseStatsLessonOut]
    final_quiz: CourseFinalQuizOut | None
    learners: list[CourseLearnerOut]


class LearnerCandidateListOut(BaseModel):
    items: list[LearnerUserOut]
    total: int  # tổng số phù hợp (items có thể bị cắt theo limit)


class EnrollLearnersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=500)
    due_at: datetime | None = Field(default=None, description="Bỏ trống = hạn mặc định của khóa")


class EnrollCoursesIn(BaseModel):
    course_ids: list[int] = Field(min_length=1, max_length=100)
    due_at: datetime | None = Field(default=None, description="Bỏ trống = hạn mặc định của từng khóa")


class EnrollResultOut(BaseModel):
    added: int  # ghi danh mới hoặc thêm lại sau khi bị xóa
    skipped: int  # đã có trong khóa


class LearnerUpdateIn(BaseModel):
    due_at: datetime | None  # bắt buộc gửi; null = không có hạn


class TeachStudentOut(LearnerUserOut):
    # Chỉ tính các khóa user đang xem phụ trách (admin: mọi khóa)
    course_count: int
    completed_count: int
    avg_progress_percent: float
    last_activity_at: datetime | None


class TeachStudentSummaryOut(BaseModel):
    student_count: int
    enrollment_count: int
    completed_count: int
    not_started_count: int  # có ghi danh nhưng chưa học bài nào


class TeachStudentListOut(BaseModel):
    items: list[TeachStudentOut]
    total: int
    summary: TeachStudentSummaryOut


class StudentSectionOut(BaseModel):
    id: int
    title: str
    total_lessons: int
    completed_lessons: int


class StudentQuizOut(BaseModel):
    lesson_id: int
    title: str
    is_graded: bool
    pass_score_percent: float
    max_attempts: int | None
    attempts_used: int
    best_score_percent: float | None  # điểm cao nhất trong các lượt đã nộp
    passed: bool
    last_submitted_at: datetime | None


class StudentCourseOut(LearnerProgressOut):
    course_id: int
    code: str
    title: str
    is_mandatory: bool
    course_status: CourseStatus
    can_edit: bool  # user đang xem được xóa học viên khỏi khóa / đổi hạn
    sections: list[StudentSectionOut]
    quizzes: list[StudentQuizOut]


class TeachStudentDetailOut(LearnerUserOut):
    last_login_at: datetime | None
    courses: list[StudentCourseOut]


# --------------------------------------------------------------------------- #
# Dòng thời gian (học viên)
# --------------------------------------------------------------------------- #
class TimelineItemOut(BaseModel):
    kind: Literal["quiz", "due"]  # quiz: giờ đóng bài kiểm tra; due: hạn hoàn thành khóa
    at: datetime
    course_id: int
    course_title: str
    is_mandatory: bool
    lesson_id: int | None  # quiz
    title: str  # quiz: tên bài kiểm tra
    is_graded: bool | None  # quiz
    locked: bool = False  # quiz: nằm trong chủ đề chưa mở khóa (khóa học tuần tự)
    out_of_attempts: bool = False  # quiz: đã dùng hết lượt làm mà chưa đạt


class TimelineOut(BaseModel):
    items: list[TimelineItemOut]
