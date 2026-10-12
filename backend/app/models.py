"""ORM model ánh xạ các bảng trong db/01_schema.sql.

Nguồn chuẩn của schema là file SQL. Sửa bảng thì phải sửa ở cả hai nơi.
Ràng buộc (CHECK/UNIQUE/FK) được khai báo lại ở đây để `Base.metadata.create_all()`
sinh đúng DDL trên DBMS khác (vd: SQLite khi test, MySQL...).
`updated_at` do ORM cập nhật (onupdate), DB không có trigger.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# BIGINT trên Postgres/MySQL; SQLite chỉ tự tăng với INTEGER PRIMARY KEY
BigId = BigInteger().with_variant(Integer, "sqlite")
TZDateTime = DateTime(timezone=True)


def _pk() -> Mapped[int]:
    return mapped_column(BigId, Identity(always=False), primary_key=True)


def _created_at() -> Mapped[datetime]:
    return mapped_column(TZDateTime, nullable=False, server_default=func.current_timestamp())


def _updated_at() -> Mapped[datetime]:
    return mapped_column(TZDateTime, nullable=False, server_default=func.current_timestamp(),
                         onupdate=func.current_timestamp())


class Base(DeclarativeBase):
    pass


# --------------------------------------------------------------------------- #
# 1. Người dùng & phân quyền
# --------------------------------------------------------------------------- #
class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("code", name="uq_departments_code"),)

    id: Mapped[int] = _pk()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = _created_at()


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("employee_code", name="uq_users_employee_code"),
        CheckConstraint("email = LOWER(email)", name="ck_users_email_lower"),
        CheckConstraint("status IN ('active', 'inactive', 'locked')", name="ck_users_status"),
        Index("ix_users_department", "department_id"),
    )

    id: Mapped[int] = _pk()
    email: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    employee_code: Mapped[str | None] = mapped_column(String(20))
    department_id: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("departments.id", name="fk_users_department", ondelete="SET NULL"))
    avatar_url: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()

    roles: Mapped[list[Role]] = relationship(secondary="user_roles", viewonly=True)
    department: Mapped[Department | None] = relationship()


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("code", name="uq_roles_code"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (Index("ix_user_roles_role", "role_id"),)

    user_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_user_roles_user", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("roles.id", name="fk_user_roles_role"), primary_key=True)
    granted_at: Mapped[datetime] = _created_at()


# --------------------------------------------------------------------------- #
# 2. Object storage (metadata của file nằm ngoài DB)
# --------------------------------------------------------------------------- #
class StorageObject(Base):
    __tablename__ = "storage_objects"
    __table_args__ = (
        UniqueConstraint("provider", "bucket", "object_key", name="uq_storage_objects_location"),
        CheckConstraint("provider IN ('s3', 'minio', 'gcs', 'azure')", name="ck_storage_objects_provider"),
        CheckConstraint("upload_status IN ('pending', 'ready', 'failed', 'deleted')",
                        name="ck_storage_objects_status"),
        CheckConstraint("size_bytes IS NULL OR size_bytes >= 0", name="ck_storage_objects_size"),
        Index("ix_storage_objects_uploader", "uploaded_by"),
    )

    id: Mapped[int] = _pk()
    provider: Mapped[str] = mapped_column(String(20))
    bucket: Mapped[str] = mapped_column(String(255))
    object_key: Mapped[str] = mapped_column(String(1024))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum_sha256: Mapped[str | None] = mapped_column(CHAR(64))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    page_count: Mapped[int | None] = mapped_column(Integer)
    upload_status: Mapped[str] = mapped_column(String(20), server_default="pending")
    uploaded_by: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_storage_objects_uploader", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()


# --------------------------------------------------------------------------- #
# 3. Khóa học & bài học
# --------------------------------------------------------------------------- #
class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("code", name="uq_courses_code"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_courses_status"),
        Index("ix_courses_status", "status"),
        Index("ix_courses_created_by", "created_by"),
        Index("ix_courses_department", "department_id"),
    )

    id: Mapped[int] = _pk()
    code: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(255))
    short_description: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    thumbnail_object_id: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("storage_objects.id", name="fk_courses_thumb", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("departments.id", name="fk_courses_department", ondelete="SET NULL"))
    is_mandatory: Mapped[bool] = mapped_column(Boolean, server_default=false())
    is_sequential: Mapped[bool] = mapped_column(Boolean, server_default=false())
    default_due_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    status: Mapped[str] = mapped_column(String(20), server_default="draft")
    published_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_by: Mapped[int] = mapped_column(BigId, ForeignKey("users.id", name="fk_courses_creator"))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    thumbnail: Mapped[StorageObject | None] = relationship()
    department: Mapped[Department | None] = relationship()
    sections: Mapped[list[CourseSection]] = relationship(
        back_populates="course", order_by="CourseSection.sort_order", passive_deletes=True)
    instructors: Mapped[list[CourseInstructor]] = relationship(
        back_populates="course", cascade="all, delete-orphan", passive_deletes=True)
    # Bài học sắp theo chủ đề rồi theo thứ tự trong chủ đề → dùng course.sections[i].lessons
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="course", passive_deletes=True, overlaps="lessons,section")


class CourseInstructor(Base):
    __tablename__ = "course_instructors"
    __table_args__ = (
        CheckConstraint("instructor_role IN ('owner', 'co_instructor', 'assistant')",
                        name="ck_course_instructors_role"),
        Index("ix_course_instructors_user", "user_id"),
    )

    course_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("courses.id", name="fk_course_instructors_course", ondelete="CASCADE"),
        primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_course_instructors_user", ondelete="CASCADE"),
        primary_key=True)
    instructor_role: Mapped[str] = mapped_column(String(20), server_default="owner")
    assigned_at: Mapped[datetime] = _created_at()

    course: Mapped[Course] = relationship(back_populates="instructors")
    user: Mapped[User] = relationship()


class CourseSection(Base):
    """Chủ đề (chương) của khóa học."""

    __tablename__ = "course_sections"
    __table_args__ = (
        # Cho phép FK ghép từ lessons: chủ đề phải thuộc cùng khóa với bài học
        UniqueConstraint("id", "course_id", name="uq_course_sections_id_course"),
        Index("ix_course_sections_course_order", "course_id", "sort_order"),
    )

    id: Mapped[int] = _pk()
    course_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("courses.id", name="fk_course_sections_course", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    course: Mapped[Course] = relationship(back_populates="sections")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="section", order_by="Lesson.sort_order", passive_deletes=True,
        overlaps="course,lessons")


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        CheckConstraint("lesson_type IN ('video', 'pdf', 'page', 'quiz')", name="ck_lessons_type"),
        CheckConstraint("status IN ('draft', 'published')", name="ck_lessons_status"),
        CheckConstraint(
            "(lesson_type IN ('video', 'pdf') AND media_object_id IS NOT NULL)"
            " OR (lesson_type IN ('page', 'quiz') AND media_object_id IS NULL)",
            name="ck_lessons_media"),
        # FK ghép: chủ đề bắt buộc thuộc cùng khóa với bài học
        ForeignKeyConstraint(["section_id", "course_id"], ["course_sections.id", "course_sections.course_id"],
                             name="fk_lessons_section", ondelete="CASCADE"),
        Index("ix_lessons_course", "course_id"),
        Index("ix_lessons_section_order", "section_id", "sort_order"),
        Index("ix_lessons_media", "media_object_id"),
    )

    id: Mapped[int] = _pk()
    course_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("courses.id", name="fk_lessons_course", ondelete="CASCADE"))
    section_id: Mapped[int] = mapped_column(BigId)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    # Bài đọc: Markdown; ảnh tham chiếu bằng ![…](file:<storage_object_id>) (xem db/01_schema.sql)
    content: Mapped[str | None] = mapped_column(Text)
    lesson_type: Mapped[str] = mapped_column(String(20))
    media_object_id: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("storage_objects.id", name="fk_lessons_media"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    is_preview: Mapped[bool] = mapped_column(Boolean, server_default=false())
    status: Mapped[str] = mapped_column(String(20), server_default="draft")
    created_by: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_lessons_creator", ondelete="SET NULL"))
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = _updated_at()
    deleted_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    course: Mapped[Course] = relationship(back_populates="lessons", overlaps="lessons,section")
    section: Mapped[CourseSection] = relationship(back_populates="lessons", overlaps="course,lessons")
    media: Mapped[StorageObject | None] = relationship()
    files: Mapped[list[LessonFile]] = relationship(
        order_by="LessonFile.sort_order", cascade="all, delete-orphan", passive_deletes=True)
    quiz: Mapped[Quiz | None] = relationship(back_populates="lesson", passive_deletes=True)


class LessonFile(Base):
    """File gắn với bài: tài liệu đính kèm (attachment) hoặc ảnh nhúng trong bài đọc (inline)."""

    __tablename__ = "lesson_files"
    __table_args__ = (
        CheckConstraint("purpose IN ('attachment', 'inline')", name="ck_lesson_files_purpose"),
        Index("ix_lesson_files_object", "storage_object_id"),
    )

    lesson_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("lessons.id", name="fk_lesson_files_lesson", ondelete="CASCADE"), primary_key=True)
    storage_object_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("storage_objects.id", name="fk_lesson_files_object"), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(20), server_default="attachment")
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    storage_object: Mapped[StorageObject] = relationship()


# --------------------------------------------------------------------------- #
# 4. Quiz
# --------------------------------------------------------------------------- #
class Quiz(Base):
    __tablename__ = "quizzes"
    __table_args__ = (
        CheckConstraint("pass_score_percent BETWEEN 0 AND 100", name="ck_quizzes_pass"),
        CheckConstraint("max_attempts IS NULL OR max_attempts > 0", name="ck_quizzes_attempts"),
        CheckConstraint("opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at", name="ck_quizzes_window"),
        CheckConstraint("review_policy IN ('after_submit', 'after_close', 'never')", name="ck_quizzes_review"),
    )

    lesson_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("lessons.id", name="fk_quizzes_lesson", ondelete="CASCADE"), primary_key=True)
    pass_score_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("70"))
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer)
    max_attempts: Mapped[int | None] = mapped_column(Integer)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, server_default=false())
    is_graded: Mapped[bool] = mapped_column(Boolean, server_default=false())  # FALSE = quiz luyện tập
    opens_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    closes_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    review_policy: Mapped[str] = mapped_column(String(20), server_default="after_submit")

    lesson: Mapped[Lesson] = relationship(back_populates="quiz")
    questions: Mapped[list[QuizQuestion]] = relationship(
        back_populates="quiz", order_by="QuizQuestion.sort_order",
        cascade="all, delete-orphan", passive_deletes=True)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (
        # short_text: quiz_options của câu là các đáp án được chấp nhận (đều is_correct = TRUE)
        CheckConstraint("question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_text')",
                        name="ck_quiz_questions_type"),
        CheckConstraint("points >= 0", name="ck_quiz_questions_points"),
        Index("ix_quiz_questions_quiz", "quiz_id", "sort_order"),
    )

    id: Mapped[int] = _pk()
    quiz_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quizzes.lesson_id", name="fk_quiz_questions_quiz", ondelete="CASCADE"))
    question_type: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    points: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    quiz: Mapped[Quiz] = relationship(back_populates="questions")
    options: Mapped[list[QuizOption]] = relationship(
        back_populates="question", order_by="QuizOption.sort_order",
        cascade="all, delete-orphan", passive_deletes=True)


class QuizOption(Base):
    __tablename__ = "quiz_options"
    __table_args__ = (
        UniqueConstraint("id", "question_id", name="uq_quiz_options_id_question"),
        Index("ix_quiz_options_question", "question_id", "sort_order"),
    )

    id: Mapped[int] = _pk()
    question_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quiz_questions.id", name="fk_quiz_options_question", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(String(1000))
    is_correct: Mapped[bool] = mapped_column(Boolean, server_default=false())
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    question: Mapped[QuizQuestion] = relationship(back_populates="options")


# --------------------------------------------------------------------------- #
# 5. Ghi danh
# --------------------------------------------------------------------------- #
class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_enrollments_course_user"),
        CheckConstraint("status IN ('active', 'completed', 'removed')", name="ck_enrollments_status"),
        Index("ix_enrollments_user_status", "user_id", "status"),
        Index("ix_enrollments_course_status", "course_id", "status"),
    )

    id: Mapped[int] = _pk()
    course_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("courses.id", name="fk_enrollments_course", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_enrollments_user", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), server_default="active")
    enrolled_by: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_enrollments_enrolled_by"))
    enrolled_at: Mapped[datetime] = _created_at()
    due_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    removed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    removed_by: Mapped[int | None] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_enrollments_removed_by"))

    course: Mapped[Course] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])


# --------------------------------------------------------------------------- #
# 6. Tiến độ học
# --------------------------------------------------------------------------- #
class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_lesson_progress_user_lesson"),
        CheckConstraint("status IN ('in_progress', 'completed')", name="ck_lesson_progress_status"),
        CheckConstraint("progress_percent BETWEEN 0 AND 100", name="ck_lesson_progress_percent"),
        Index("ix_lesson_progress_lesson", "lesson_id"),
    )

    id: Mapped[int] = _pk()
    user_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_lesson_progress_user", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("lessons.id", name="fk_lesson_progress_lesson", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), server_default="in_progress")
    progress_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("0"))
    last_position_seconds: Mapped[int | None] = mapped_column(Integer)
    last_page: Mapped[int | None] = mapped_column(Integer)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    started_at: Mapped[datetime] = _created_at()
    completed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    updated_at: Mapped[datetime] = _updated_at()

    lesson: Mapped[Lesson] = relationship()


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        UniqueConstraint("quiz_id", "user_id", "attempt_no", name="uq_quiz_attempts_no"),
        CheckConstraint("status IN ('in_progress', 'submitted', 'expired')", name="ck_quiz_attempts_status"),
        Index("ix_quiz_attempts_user", "user_id", "quiz_id"),
    )

    id: Mapped[int] = _pk()
    quiz_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quizzes.lesson_id", name="fk_quiz_attempts_quiz", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("users.id", name="fk_quiz_attempts_user", ondelete="CASCADE"))
    attempt_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), server_default="in_progress")
    score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    max_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    score_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    passed: Mapped[bool | None] = mapped_column(Boolean)
    started_at: Mapped[datetime] = _created_at()
    submitted_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    quiz: Mapped[Quiz] = relationship()
    answers: Mapped[list[QuizAttemptAnswer]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", passive_deletes=True)
    text_answers: Mapped[list[QuizAttemptTextAnswer]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", passive_deletes=True)


class QuizAttemptAnswer(Base):
    __tablename__ = "quiz_attempt_answers"
    __table_args__ = (
        # FK ghép: option_id bắt buộc thuộc question_id
        ForeignKeyConstraint(["option_id", "question_id"], ["quiz_options.id", "quiz_options.question_id"],
                             name="fk_qaa_option"),
        Index("ix_qaa_question", "question_id"),
        Index("ix_qaa_option", "option_id", "question_id"),
    )

    attempt_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quiz_attempts.id", name="fk_qaa_attempt", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quiz_questions.id", name="fk_qaa_question"), primary_key=True)
    option_id: Mapped[int] = mapped_column(BigId, primary_key=True)
    answered_at: Mapped[datetime] = _created_at()

    attempt: Mapped[QuizAttempt] = relationship(back_populates="answers")


class QuizAttemptTextAnswer(Base):
    """Câu trả lời tự luận ngắn (question_type = 'short_text')."""

    __tablename__ = "quiz_attempt_text_answers"
    __table_args__ = (Index("ix_qata_question", "question_id"),)

    attempt_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quiz_attempts.id", name="fk_qata_attempt", ondelete="CASCADE"), primary_key=True)
    question_id: Mapped[int] = mapped_column(
        BigId, ForeignKey("quiz_questions.id", name="fk_qata_question"), primary_key=True)
    answer_text: Mapped[str] = mapped_column(String(1000))
    is_correct: Mapped[bool | None] = mapped_column(Boolean)  # NULL = chưa chấm
    answered_at: Mapped[datetime] = _created_at()

    attempt: Mapped[QuizAttempt] = relationship(back_populates="text_answers")
