-- =============================================================================
-- XLearn LMS - Dữ liệu mẫu (seed)
-- Chạy sau 01_schema.sql trên DB rỗng.
-- Không hard-code id: mọi khóa ngoại tra bằng khóa tự nhiên (email, course code,
-- object_key, sort_order) -> chạy được với bất kỳ cơ chế sinh id nào.
-- Mật khẩu mọi tài khoản: Password@123 (bcrypt cost 10)
-- =============================================================================
START TRANSACTION;

-- -----------------------------------------------------------------------------
-- Vai trò
-- -----------------------------------------------------------------------------
INSERT INTO roles (id, code, name) VALUES
    (1, 'admin',      'Quản trị viên'),
    (2, 'instructor', 'Giảng viên'),
    (3, 'student',    'Học viên');

-- -----------------------------------------------------------------------------
-- Người dùng
-- -----------------------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, status) VALUES
    ('admin@xlearn.dev',   '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Quản Trị Viên',  'active'),
    ('gv.an@xlearn.dev',   '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Nguyễn Văn An',  'active'),
    ('gv.binh@xlearn.dev', '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Trần Thị Bình',  'active'),
    ('hv.cuong@xlearn.dev','$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Lê Minh Cường',  'active'),
    ('hv.dung@xlearn.dev', '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Phạm Thu Dung',  'active'),
    ('hv.giang@xlearn.dev','$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Hoàng Gia Giang','active'),
    ('hv.hoa@xlearn.dev',  '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', 'Vũ Thanh Hoa',   'active');

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON
       (u.email = 'admin@xlearn.dev' AND r.code = 'admin')
    OR (u.email IN ('gv.an@xlearn.dev', 'gv.binh@xlearn.dev') AND r.code = 'instructor')
    OR (u.email LIKE 'hv.%' AND r.code = 'student')
    -- Giảng viên An đồng thời là học viên (minh họa đa vai trò)
    OR (u.email = 'gv.an@xlearn.dev' AND r.code = 'student');

-- -----------------------------------------------------------------------------
-- Object storage: chỉ metadata, file thật nằm ở bucket "xlearn-media" (MinIO/S3)
-- -----------------------------------------------------------------------------
INSERT INTO storage_objects
    (provider, bucket, object_key, original_filename, content_type, size_bytes, duration_seconds, page_count, upload_status, uploaded_by)
SELECT 'minio', 'xlearn-media', v.object_key, v.original_filename, v.content_type, v.size_bytes,
       v.duration_seconds, v.page_count, 'ready', u.id
FROM (
    SELECT 'courses/py-101/thumbnail.jpg'          AS object_key, 'python-thumb.jpg'      AS original_filename, 'image/jpeg'      AS content_type,    184320 AS size_bytes, CAST(NULL AS INTEGER) AS duration_seconds, CAST(NULL AS INTEGER) AS page_count, 'gv.an@xlearn.dev'   AS uploader
    UNION ALL SELECT 'courses/py-101/lessons/01-intro.mp4',     'gioi-thieu.mp4',       'video/mp4',        52428800,  420, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/py-101/lessons/02-variables.mp4', 'bien-kieu-du-lieu.mp4','video/mp4',       104857600,  900, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/py-101/lessons/03-syntax.pdf',    'cu-phap-python.pdf',   'application/pdf',   2097152, NULL,   24, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/py-101/lessons/05-loops.mp4',     'vong-lap.mp4',         'video/mp4',        83886080,  780, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/sql-101/thumbnail.jpg',           'sql-thumb.jpg',        'image/jpeg',         204800, NULL, NULL, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/sql-101/lessons/01-rdbms.mp4',    'tong-quan-rdbms.mp4',  'video/mp4',        73400320,  660, NULL, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/sql-101/lessons/02-select.pdf',   'cau-lenh-select.pdf',  'application/pdf',   3145728, NULL,   36, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/web-201/lessons/01-hooks.mp4',    'react-hooks.mp4',      'video/mp4',        94371840,  840, NULL, 'gv.an@xlearn.dev'
) v
JOIN users u ON u.email = v.uploader;

-- -----------------------------------------------------------------------------
-- Khóa học
-- -----------------------------------------------------------------------------
INSERT INTO courses (code, title, short_description, description, thumbnail_object_id, status, published_at, created_by)
SELECT v.code, v.title, v.short_description, v.description, so.id, v.status, v.published_at, u.id
FROM (
    SELECT 'PY-101' AS code, 'Lập trình Python cơ bản' AS title,
           'Làm quen với Python từ con số 0.' AS short_description,
           'Khóa học giới thiệu cú pháp, kiểu dữ liệu, cấu trúc điều khiển và vòng lặp trong Python.' AS description,
           'courses/py-101/thumbnail.jpg' AS thumb_key, 'published' AS status,
           CAST('2026-09-01 08:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS published_at, 'gv.an@xlearn.dev' AS creator
    UNION ALL SELECT 'SQL-101', 'Cơ sở dữ liệu và SQL',
           'Nắm vững SQL để truy vấn dữ liệu quan hệ.',
           'Tổng quan hệ quản trị CSDL quan hệ, câu lệnh SELECT, lọc, sắp xếp và kết nối bảng.',
           'courses/sql-101/thumbnail.jpg', 'published',
           CAST('2026-09-05 08:00:00+00' AS TIMESTAMP WITH TIME ZONE), 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'WEB-201', 'React nâng cao',
           'Hooks, quản lý state và tối ưu hiệu năng.',
           'Khóa học đang soạn thảo.',
           NULL, 'draft', NULL, 'gv.an@xlearn.dev'
) v
JOIN users u ON u.email = v.creator
LEFT JOIN storage_objects so ON so.object_key = v.thumb_key;

INSERT INTO course_instructors (course_id, user_id, instructor_role)
SELECT c.id, u.id, v.instructor_role
FROM (
    SELECT 'PY-101' AS code, 'gv.an@xlearn.dev' AS email, 'owner' AS instructor_role
    UNION ALL SELECT 'SQL-101', 'gv.binh@xlearn.dev', 'owner'
    UNION ALL SELECT 'SQL-101', 'gv.an@xlearn.dev',   'co_instructor'
    UNION ALL SELECT 'WEB-201', 'gv.an@xlearn.dev',   'owner'
) v
JOIN courses c ON c.code = v.code
JOIN users u   ON u.email = v.email;

-- -----------------------------------------------------------------------------
-- Bài học
-- -----------------------------------------------------------------------------
INSERT INTO lessons (course_id, title, description, lesson_type, media_object_id, sort_order, estimated_minutes, is_preview, status, created_by)
SELECT c.id, v.title, v.description, v.lesson_type, so.id, v.sort_order, v.estimated_minutes, v.is_preview, v.status, c.created_by
FROM (
    SELECT 'PY-101' AS code, 1 AS sort_order, 'Giới thiệu Python' AS title, 'Python là gì, cài đặt môi trường.' AS description,
           'video' AS lesson_type, 'courses/py-101/lessons/01-intro.mp4' AS media_key, 7 AS estimated_minutes, TRUE AS is_preview, 'published' AS status
    UNION ALL SELECT 'PY-101', 2, 'Biến và kiểu dữ liệu',   'int, float, str, bool, list, dict.',   'video', 'courses/py-101/lessons/02-variables.mp4', 15, FALSE, 'published'
    UNION ALL SELECT 'PY-101', 3, 'Tài liệu cú pháp Python','Tài liệu PDF tham khảo nhanh.',        'pdf',   'courses/py-101/lessons/03-syntax.pdf',    20, FALSE, 'published'
    UNION ALL SELECT 'PY-101', 4, 'Kiểm tra chương 1',      'Quiz kiến thức nền tảng.',             'quiz',  NULL,                                      10, FALSE, 'published'
    UNION ALL SELECT 'PY-101', 5, 'Vòng lặp for và while',  'Lặp qua danh sách, range, break/continue.', 'video', 'courses/py-101/lessons/05-loops.mp4', 13, FALSE, 'published'
    UNION ALL SELECT 'SQL-101', 1, 'Tổng quan RDBMS',       'Bảng, khóa chính, khóa ngoại.',        'video', 'courses/sql-101/lessons/01-rdbms.mp4',    11, TRUE,  'published'
    UNION ALL SELECT 'SQL-101', 2, 'Câu lệnh SELECT',       'SELECT, WHERE, ORDER BY.',             'pdf',   'courses/sql-101/lessons/02-select.pdf',   30, FALSE, 'published'
    UNION ALL SELECT 'SQL-101', 3, 'Quiz SQL cơ bản',       'Kiểm tra kiến thức SELECT.',           'quiz',  NULL,                                      5,  FALSE, 'published'
    UNION ALL SELECT 'WEB-201', 1, 'React Hooks chuyên sâu','useEffect, useMemo, useCallback.',     'video', 'courses/web-201/lessons/01-hooks.mp4',    14, FALSE, 'draft'
) v
JOIN courses c ON c.code = v.code
LEFT JOIN storage_objects so ON so.object_key = v.media_key;

-- -----------------------------------------------------------------------------
-- Quiz
-- -----------------------------------------------------------------------------
INSERT INTO quizzes (lesson_id, pass_score_percent, time_limit_seconds, max_attempts, shuffle_questions)
SELECT l.id, v.pass_score_percent, v.time_limit_seconds, v.max_attempts, v.shuffle_questions
FROM (
    SELECT 'PY-101' AS code, 4 AS sort_order, 70 AS pass_score_percent, 600 AS time_limit_seconds, 3 AS max_attempts, TRUE AS shuffle_questions
    UNION ALL SELECT 'SQL-101', 3, 60, CAST(NULL AS INTEGER), CAST(NULL AS INTEGER), FALSE
) v
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.sort_order = v.sort_order;

INSERT INTO quiz_questions (quiz_id, question_type, content, explanation, points, sort_order)
SELECT l.id, v.question_type, v.content, v.explanation, v.points, v.q_order
FROM (
    SELECT 'PY-101' AS code, 4 AS lesson_order, 1 AS q_order, 'single_choice' AS question_type,
           'Hàm nào dùng để in ra màn hình trong Python?' AS content, 'print() ghi dữ liệu ra stdout.' AS explanation, 1 AS points
    UNION ALL SELECT 'PY-101', 4, 2, 'multiple_choice', 'Những kiểu nào sau đây là kiểu dữ liệu có sẵn trong Python?', 'list, dict, tuple đều là built-in; array cần import module.', 2
    UNION ALL SELECT 'PY-101', 4, 3, 'true_false',      'Python phân biệt chữ hoa và chữ thường trong tên biến.',       'Name và name là hai biến khác nhau.', 1
    UNION ALL SELECT 'SQL-101', 3, 1, 'single_choice',  'Mệnh đề nào dùng để lọc dòng trong câu SELECT?',               'WHERE lọc dòng trước khi gom nhóm.', 1
    UNION ALL SELECT 'SQL-101', 3, 2, 'true_false',     'Khóa chính (PRIMARY KEY) có thể chứa giá trị NULL.',           'Khóa chính luôn NOT NULL và UNIQUE.', 1
) v
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.sort_order = v.lesson_order;

INSERT INTO quiz_options (question_id, content, is_correct, sort_order)
SELECT q.id, v.content, v.is_correct, v.o_order
FROM (
    SELECT 'PY-101' AS code, 4 AS lesson_order, 1 AS q_order, 1 AS o_order, 'print()' AS content, TRUE AS is_correct
    UNION ALL SELECT 'PY-101', 4, 1, 2, 'echo()',    FALSE
    UNION ALL SELECT 'PY-101', 4, 1, 3, 'console.log()', FALSE
    UNION ALL SELECT 'PY-101', 4, 1, 4, 'printf()',  FALSE
    UNION ALL SELECT 'PY-101', 4, 2, 1, 'list',      TRUE
    UNION ALL SELECT 'PY-101', 4, 2, 2, 'dict',      TRUE
    UNION ALL SELECT 'PY-101', 4, 2, 3, 'tuple',     TRUE
    UNION ALL SELECT 'PY-101', 4, 2, 4, 'array',     FALSE
    UNION ALL SELECT 'PY-101', 4, 3, 1, 'Đúng',      TRUE
    UNION ALL SELECT 'PY-101', 4, 3, 2, 'Sai',       FALSE
    UNION ALL SELECT 'SQL-101', 3, 1, 1, 'WHERE',    TRUE
    UNION ALL SELECT 'SQL-101', 3, 1, 2, 'ORDER BY', FALSE
    UNION ALL SELECT 'SQL-101', 3, 1, 3, 'GROUP BY', FALSE
    UNION ALL SELECT 'SQL-101', 3, 2, 1, 'Đúng',     FALSE
    UNION ALL SELECT 'SQL-101', 3, 2, 2, 'Sai',      TRUE
) v
JOIN courses c        ON c.code = v.code
JOIN lessons l        ON l.course_id = c.id AND l.sort_order = v.lesson_order
JOIN quiz_questions q ON q.quiz_id = l.id AND q.sort_order = v.q_order;

-- -----------------------------------------------------------------------------
-- Ghi danh
-- -----------------------------------------------------------------------------
INSERT INTO enrollments (course_id, user_id, status, enrolled_by, enrolled_at, due_at, completed_at, removed_at, removed_by)
SELECT c.id, s.id, v.status, i.id, v.enrolled_at, v.due_at, v.completed_at, v.removed_at,
       CASE WHEN v.status = 'removed' THEN i.id END
FROM (
    SELECT 'PY-101' AS code, 'hv.cuong@xlearn.dev' AS student, 'gv.an@xlearn.dev' AS instructor, 'active' AS status,
           CAST('2026-09-02 09:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS enrolled_at,
           CAST('2026-11-30 23:59:59+00' AS TIMESTAMP WITH TIME ZONE) AS due_at,
           CAST(NULL AS TIMESTAMP WITH TIME ZONE) AS completed_at,
           CAST(NULL AS TIMESTAMP WITH TIME ZONE) AS removed_at
    UNION ALL SELECT 'PY-101',  'hv.dung@xlearn.dev',  'gv.an@xlearn.dev',   'active',
           CAST('2026-09-03 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-11-30 23:59:59+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'PY-101',  'hv.hoa@xlearn.dev',   'gv.an@xlearn.dev',   'removed',
           CAST('2026-09-03 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL, CAST('2026-09-20 10:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'SQL-101', 'hv.cuong@xlearn.dev', 'gv.binh@xlearn.dev', 'active',
           CAST('2026-09-06 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-12-15 23:59:59+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'SQL-101', 'hv.giang@xlearn.dev', 'gv.binh@xlearn.dev', 'completed',
           CAST('2026-09-06 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, CAST('2026-09-25 15:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'PY-101',  'hv.giang@xlearn.dev', 'gv.an@xlearn.dev',   'active',
           CAST('2026-10-01 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL, NULL
) v
JOIN courses c ON c.code = v.code
JOIN users s   ON s.email = v.student
JOIN users i   ON i.email = v.instructor;

-- -----------------------------------------------------------------------------
-- Tiến độ bài học
-- -----------------------------------------------------------------------------
INSERT INTO lesson_progress
    (user_id, lesson_id, status, progress_percent, last_position_seconds, last_page, time_spent_seconds, started_at, completed_at, updated_at)
SELECT u.id, l.id, v.status, v.progress_percent, v.last_position_seconds, v.last_page, v.time_spent_seconds,
       v.started_at, v.completed_at, COALESCE(v.completed_at, v.started_at)
FROM (
    -- Cường - PY-101: xong bài 1-4, đang xem dở bài 5
    SELECT 'hv.cuong@xlearn.dev' AS email, 'PY-101' AS code, 1 AS lesson_order, 'completed' AS status, 100 AS progress_percent,
           420 AS last_position_seconds, CAST(NULL AS INTEGER) AS last_page, 450 AS time_spent_seconds,
           CAST('2026-09-02 10:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS started_at,
           CAST('2026-09-02 10:08:00+00' AS TIMESTAMP WITH TIME ZONE) AS completed_at
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 2, 'completed',   100, 900,  NULL, 980,
           CAST('2026-09-04 19:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-04 19:17:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 3, 'completed',   100, NULL, 24,   1500,
           CAST('2026-09-06 20:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-06 20:25:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 'completed',   100, NULL, NULL, 840,
           CAST('2026-09-08 20:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-08 20:30:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 5, 'in_progress', 40,  312,  NULL, 330,
           CAST('2026-09-10 20:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    -- Dung - PY-101: mới xem dở bài 1
    UNION ALL SELECT 'hv.dung@xlearn.dev',  'PY-101', 1, 'in_progress', 55,  231,  NULL, 240,
           CAST('2026-09-05 21:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    -- Hoa - PY-101 (đã bị xóa khỏi khóa, tiến độ vẫn được giữ lại)
    UNION ALL SELECT 'hv.hoa@xlearn.dev',   'PY-101', 1, 'completed',   100, 420,  NULL, 430,
           CAST('2026-09-04 08:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-04 08:08:00+00' AS TIMESTAMP WITH TIME ZONE)
    -- Cường - SQL-101: xong bài 1
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'SQL-101', 1, 'completed',  100, 660,  NULL, 700,
           CAST('2026-09-07 19:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-07 19:12:00+00' AS TIMESTAMP WITH TIME ZONE)
    -- Giang - SQL-101: hoàn thành toàn khóa
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 1, 'completed',  100, 660,  NULL, 690,
           CAST('2026-09-10 19:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-10 19:12:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 2, 'completed',  100, NULL, 36,   1900,
           CAST('2026-09-15 19:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-15 19:35:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 3, 'completed',  100, NULL, NULL, 240,
           CAST('2026-09-25 14:50:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-25 14:55:00+00' AS TIMESTAMP WITH TIME ZONE)
) v
JOIN users u   ON u.email = v.email
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.sort_order = v.lesson_order;

-- -----------------------------------------------------------------------------
-- Lượt làm quiz
--   Cường - PY-101: lần 1 trượt (1/4 = 25%), lần 2 đạt (4/4 = 100%)
--   Giang - SQL-101: lần 1 đạt (2/2 = 100%)
-- -----------------------------------------------------------------------------
INSERT INTO quiz_attempts (quiz_id, user_id, attempt_no, status, score, max_score, score_percent, passed, started_at, submitted_at)
SELECT l.id, u.id, v.attempt_no, 'submitted', v.score, v.max_score, v.score_percent, v.passed, v.started_at, v.submitted_at
FROM (
    SELECT 'hv.cuong@xlearn.dev' AS email, 'PY-101' AS code, 4 AS lesson_order, 1 AS attempt_no,
           1 AS score, 4 AS max_score, 25 AS score_percent, FALSE AS passed,
           CAST('2026-09-08 20:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS started_at,
           CAST('2026-09-08 20:07:00+00' AS TIMESTAMP WITH TIME ZONE) AS submitted_at
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 4, 4, 100, TRUE,
           CAST('2026-09-08 20:20:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-08 20:30:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 3, 1, 2, 2, 100, TRUE,
           CAST('2026-09-25 14:50:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-25 14:55:00+00' AS TIMESTAMP WITH TIME ZONE)
) v
JOIN users u   ON u.email = v.email
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.sort_order = v.lesson_order;

INSERT INTO quiz_attempt_answers (attempt_id, question_id, option_id, answered_at)
SELECT a.id, q.id, o.id, a.submitted_at
FROM (
    -- Cường lần 1: câu 1 đúng, câu 2 thiếu tuple (sai), câu 3 sai
    SELECT 'hv.cuong@xlearn.dev' AS email, 'PY-101' AS code, 4 AS lesson_order, 1 AS attempt_no, 1 AS q_order, 1 AS o_order
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 1, 2, 1
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 1, 2, 2
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 1, 3, 2
    -- Cường lần 2: đúng hết
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 1, 1
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 2, 1
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 2, 2
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 2, 3
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'PY-101', 4, 2, 3, 1
    -- Giang: đúng hết
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 3, 1, 1, 1
    UNION ALL SELECT 'hv.giang@xlearn.dev', 'SQL-101', 3, 1, 2, 2
) v
JOIN users u          ON u.email = v.email
JOIN courses c        ON c.code = v.code
JOIN lessons l        ON l.course_id = c.id AND l.sort_order = v.lesson_order
JOIN quiz_attempts a  ON a.quiz_id = l.id AND a.user_id = u.id AND a.attempt_no = v.attempt_no
JOIN quiz_questions q ON q.quiz_id = l.id AND q.sort_order = v.q_order
JOIN quiz_options o   ON o.question_id = q.id AND o.sort_order = v.o_order;

COMMIT;
