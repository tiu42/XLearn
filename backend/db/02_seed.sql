-- =============================================================================
-- XLearn LMS - Dữ liệu mẫu (seed): đào tạo nội bộ nhà máy
-- Chạy sau 01_schema.sql trên DB rỗng.
-- Không hard-code id: mọi khóa ngoại tra bằng khóa tự nhiên (email, mã phòng ban,
-- mã khóa, object_key, (mã khóa, tên bài)) -> chạy được với bất kỳ cơ chế sinh id nào.
-- Mật khẩu mọi tài khoản: Password@123 (bcrypt cost 10)
-- Thời gian ghi theo UTC (giờ Việt Nam = UTC+7).
-- =============================================================================
START TRANSACTION;

-- -----------------------------------------------------------------------------
-- Vai trò & phòng ban
-- -----------------------------------------------------------------------------
INSERT INTO roles (id, code, name) VALUES
    (1, 'admin',      'Quản trị viên'),
    (2, 'instructor', 'Giảng viên'),
    (3, 'student',    'Học viên');

INSERT INTO departments (code, name) VALUES
    ('HSE',  'An toàn - Sức khỏe - Môi trường'),
    ('VH',   'Vận hành'),
    ('CNTT', 'Công nghệ thông tin'),
    ('KH',   'Kế hoạch'),
    ('NS',   'Nhân sự');

-- -----------------------------------------------------------------------------
-- Người dùng
-- -----------------------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, employee_code, department_id, status, last_login_at)
SELECT v.email, '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', v.full_name, v.employee_code, d.id, 'active', v.last_login_at
FROM (
    SELECT 'admin@xlearn.dev' AS email, 'Quản Trị Viên' AS full_name, 'NV0001' AS employee_code, 'CNTT' AS dept,
           CAST('2026-10-12 01:30:00+00' AS TIMESTAMP WITH TIME ZONE) AS last_login_at
    UNION ALL SELECT 'gv.an@xlearn.dev',      'Nguyễn Văn An',   'NV0101', 'HSE',  CAST('2026-10-12 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'gv.binh@xlearn.dev',    'Trần Thị Bình',   'NV0102', 'CNTT', CAST('2026-10-11 08:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'Nguyễn Minh Anh', 'NV0412', 'VH',   CAST('2026-10-12 07:05:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.cuong@xlearn.dev',   'Lê Minh Cường',   'NV0233', 'VH',   CAST('2026-10-05 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.mai@xlearn.dev',     'Đỗ Thị Mai',      'NV0518', 'CNTT', NULL
    UNION ALL SELECT 'hv.tai@xlearn.dev',     'Vũ Đức Tài',      'NV0377', 'VH',   CAST('2026-10-09 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tam@xlearn.dev',     'Ngô Thanh Tâm',   'NV0291', 'KH',   CAST('2026-10-11 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.dung@xlearn.dev',    'Phạm Thu Dung',   'NV0624', 'VH',   CAST('2026-10-08 04:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',     'Hoàng Lan Chi',   'NV0455', 'CNTT', CAST('2026-10-08 09:10:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev',    'Phan Thị Hằng',   'NV0188', 'HSE',  CAST('2026-10-06 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.giang@xlearn.dev',   'Hoàng Gia Giang', 'NV0702', 'VH',   CAST('2026-09-28 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hoa@xlearn.dev',     'Vũ Thanh Hoa',    'NV0349', 'KH',   CAST('2026-10-12 02:20:00+00' AS TIMESTAMP WITH TIME ZONE)
) v
JOIN departments d ON d.code = v.dept;

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
    SELECT 'courses/atld-01/thumbnail.jpg' AS object_key, 'an-toan-lao-dong.jpg' AS original_filename, 'image/jpeg' AS content_type,
           204800 AS size_bytes, CAST(NULL AS INTEGER) AS duration_seconds, CAST(NULL AS INTEGER) AS page_count, 'gv.an@xlearn.dev' AS uploader
    UNION ALL SELECT 'courses/atld-01/lessons/quy-dinh-chung.mp4',   'quy-dinh-chung.mp4',      'video/mp4',        62914560,  480, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/nhan-dien-moi-nguy.mp4','nhan-dien-moi-nguy.mp4', 'video/mp4',       115343360,  900, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/bien-bao-an-toan.pdf', 'bien-bao-an-toan.pdf',    'application/pdf',   3145728, NULL,   18, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/su-dung-ppe.mp4',      'su-dung-ppe.mp4',         'video/mp4',        94371840,  720, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/ppe-zones.png',        'so-do-ppe-khu-vuc.png',   'image/png',          358400, NULL, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/bang-tra-ppe.pdf',     'bang-tra-ppe.pdf',        'application/pdf',   1258291, NULL,    2, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/so-tay-an-toan.pdf',   'so-tay-an-toan.pdf',      'application/pdf',   4194304, NULL,   32, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/van-hanh-may.mp4',     'van-hanh-may.mp4',        'video/mp4',       157286400, 1200, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/atld-01/lessons/dien-tap-so-tan.mp4',  'dien-tap-so-tan.mp4',     'video/mp4',        78643200,  600, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/bmtt-2026/thumbnail.jpg',              'bao-mat-thong-tin.jpg',   'image/jpeg',         184320, NULL, NULL, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/bmtt-2026/lessons/email-lua-dao.mp4',  'email-lua-dao.mp4',       'video/mp4',        78643200,  600, NULL, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/bmtt-2026/lessons/mat-khau-2fa.mp4',   'mat-khau-2fa.mp4',        'video/mp4',        62914560,  480, NULL, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/bmtt-2026/lessons/chinh-sach-mat-khau.pdf','chinh-sach-mat-khau.pdf','application/pdf', 1048576, NULL,   6, 'gv.binh@xlearn.dev'
    UNION ALL SELECT 'courses/5s-01/thumbnail.jpg',                  'quy-trinh-5s.jpg',        'image/jpeg',         194560, NULL, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/5s-01/lessons/seiri.mp4',              'seiri.mp4',               'video/mp4',        41943040,  360, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/5s-01/lessons/seiton.mp4',             'seiton.mp4',              'video/mp4',        41943040,  360, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/5s-01/lessons/checklist-5s.pdf',       'checklist-5s-dau-ca.pdf', 'application/pdf',    524288, NULL,    2, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/5s-01/lessons/shitsuke.mp4',           'shitsuke.mp4',            'video/mp4',        36700160,  300, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/scc-01/thumbnail.jpg',                 'so-cap-cuu.jpg',          'image/jpeg',         174080, NULL, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/scc-01/lessons/danh-gia-hien-truong.mp4','danh-gia-hien-truong.mp4','video/mp4',      78643200,  600, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/scc-01/lessons/cpr.mp4',               'hoi-suc-tim-phoi.mp4',    'video/mp4',       115343360,  900, NULL, 'gv.an@xlearn.dev'
    UNION ALL SELECT 'courses/hc-02/lessons/luu-tru-hoa-chat.mp4',   'luu-tru-hoa-chat.mp4',    'video/mp4',        73400320,  540, NULL, 'gv.an@xlearn.dev'
) v
JOIN users u ON u.email = v.uploader;

-- -----------------------------------------------------------------------------
-- Khóa học
-- -----------------------------------------------------------------------------
INSERT INTO courses (code, title, short_description, description, thumbnail_object_id, department_id,
                     is_mandatory, is_sequential, default_due_at, status, published_at, created_by)
SELECT v.code, v.title, v.short_description, v.description, so.id, d.id,
       v.is_mandatory, v.is_sequential, v.default_due_at, v.status, v.published_at, u.id
FROM (
    SELECT 'ATLD-01' AS code, 'An toàn lao động tại khu vực sản xuất' AS title,
           'Nội quy an toàn, nhận diện mối nguy và sử dụng đúng thiết bị bảo hộ cá nhân.' AS short_description,
           'Khóa đào tạo bắt buộc hằng năm cho nhân viên làm việc tại khu vực sản xuất. Hoàn thành khi đạt bài kiểm tra cuối khóa.' AS description,
           'courses/atld-01/thumbnail.jpg' AS thumb_key, 'HSE' AS dept, TRUE AS is_mandatory, TRUE AS is_sequential,
           CAST('2026-10-31 16:59:59+00' AS TIMESTAMP WITH TIME ZONE) AS default_due_at, 'published' AS status,
           CAST('2026-09-28 01:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS published_at, 'gv.an@xlearn.dev' AS creator
    UNION ALL SELECT 'BMTT-2026', 'Bảo mật thông tin 2026',
           'Nhận diện email lừa đảo, đặt mật khẩu mạnh và xác thực hai lớp.',
           'Khóa bắt buộc cho toàn bộ nhân viên có tài khoản hệ thống nội bộ.',
           'courses/bmtt-2026/thumbnail.jpg', 'CNTT', TRUE, FALSE,
           CAST('2026-10-18 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'published',
           CAST('2026-10-01 01:00:00+00' AS TIMESTAMP WITH TIME ZONE), 'gv.binh@xlearn.dev'
    UNION ALL SELECT '5S-01', 'Quy trình 5S trong xưởng',
           'Sàng lọc, sắp xếp, sạch sẽ, săn sóc, sẵn sàng tại nơi làm việc.',
           'Khóa tự chọn giúp duy trì khu vực làm việc gọn gàng, an toàn và hiệu quả.',
           'courses/5s-01/thumbnail.jpg', 'VH', FALSE, FALSE,
           CAST('2026-12-15 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'published',
           CAST('2026-09-10 01:00:00+00' AS TIMESTAMP WITH TIME ZONE), 'gv.an@xlearn.dev'
    UNION ALL SELECT 'SCC-01', 'Sơ cấp cứu tại nơi làm việc',
           'Đánh giá hiện trường, hồi sức tim phổi và xử lý vết thương.',
           'Khóa tự chọn, khuyến khích cho tổ trưởng và thành viên đội ứng phó khẩn cấp.',
           'courses/scc-01/thumbnail.jpg', 'HSE', FALSE, FALSE,
           CAST('2026-11-30 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'published',
           CAST('2026-09-15 01:00:00+00' AS TIMESTAMP WITH TIME ZONE), 'gv.an@xlearn.dev'
    UNION ALL SELECT 'HC-02', 'An toàn hóa chất nâng cao',
           'Nhãn GHS, phiếu an toàn hóa chất và lưu trữ đúng cách.',
           'Khóa đang soạn thảo.',
           NULL, 'HSE', TRUE, FALSE,
           CAST('2027-01-15 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'draft', NULL, 'gv.an@xlearn.dev'
) v
JOIN users u        ON u.email = v.creator
JOIN departments d  ON d.code = v.dept
LEFT JOIN storage_objects so ON so.object_key = v.thumb_key;

INSERT INTO course_instructors (course_id, user_id, instructor_role)
SELECT c.id, u.id, v.instructor_role
FROM (
    SELECT 'ATLD-01' AS code, 'gv.an@xlearn.dev' AS email, 'owner' AS instructor_role
    UNION ALL SELECT 'BMTT-2026', 'gv.binh@xlearn.dev', 'owner'
    UNION ALL SELECT 'BMTT-2026', 'gv.an@xlearn.dev',   'co_instructor'
    UNION ALL SELECT '5S-01',     'gv.an@xlearn.dev',   'owner'
    UNION ALL SELECT 'SCC-01',    'gv.an@xlearn.dev',   'owner'
    UNION ALL SELECT 'SCC-01',    'gv.binh@xlearn.dev', 'assistant'
    UNION ALL SELECT 'HC-02',     'gv.an@xlearn.dev',   'owner'
) v
JOIN courses c ON c.code = v.code
JOIN users u   ON u.email = v.email;

-- -----------------------------------------------------------------------------
-- Chủ đề
-- -----------------------------------------------------------------------------
INSERT INTO course_sections (course_id, title, description, sort_order)
SELECT c.id, v.title, v.description, v.sort_order
FROM (
    SELECT 'ATLD-01' AS code, 1 AS sort_order, 'Giới thiệu khóa học' AS title,
           'Mục tiêu khóa học, thông báo từ Phòng HSE và cách hoàn thành khóa.' AS description
    UNION ALL SELECT 'ATLD-01', 2, 'Quy định chung & nhận diện mối nguy', 'Nội quy an toàn của xưởng, các nhóm mối nguy thường gặp và biển báo.'
    UNION ALL SELECT 'ATLD-01', 3, 'Thiết bị bảo hộ cá nhân',             'Chọn, kiểm tra và sử dụng đúng PPE cho từng khu vực trong xưởng.'
    UNION ALL SELECT 'ATLD-01', 4, 'Vận hành máy & tình huống khẩn cấp',  'Quy tắc an toàn khi vận hành máy và các bước xử lý khi có sự cố.'
    UNION ALL SELECT 'ATLD-01', 5, 'Đánh giá cuối khóa',                  'Bài kiểm tra tính điểm, điều kiện hoàn thành khóa học.'
    UNION ALL SELECT 'BMTT-2026', 1, 'Nhận diện lừa đảo qua email',       'Dấu hiệu nhận biết và quy trình báo cáo email đáng ngờ.'
    UNION ALL SELECT 'BMTT-2026', 2, 'Mật khẩu & xác thực',               'Đặt mật khẩu mạnh, bật xác thực hai lớp.'
    UNION ALL SELECT 'BMTT-2026', 3, 'Kiểm tra cuối',                     'Bài kiểm tra tính điểm.'
    UNION ALL SELECT '5S-01', 1, 'Sàng lọc & sắp xếp',                    'Seiri và Seiton: bỏ thứ không cần, đặt đồ đúng chỗ.'
    UNION ALL SELECT '5S-01', 2, 'Sạch sẽ & săn sóc',                     'Seiso và Seiketsu: vệ sinh và chuẩn hóa.'
    UNION ALL SELECT '5S-01', 3, 'Sẵn sàng & đánh giá',                   'Shitsuke: duy trì thói quen và tự đánh giá.'
    UNION ALL SELECT 'SCC-01', 1, 'Sơ cứu cơ bản',                        'Đánh giá hiện trường, gọi cấp cứu và hồi sức tim phổi.'
    UNION ALL SELECT 'SCC-01', 2, 'Xử lý vết thương',                     'Cầm máu, băng bó và kiểm tra cuối khóa.'
    UNION ALL SELECT 'HC-02', 1, 'Phân loại hóa chất',                    'Nhãn GHS, phiếu an toàn hóa chất (SDS).'
) v
JOIN courses c ON c.code = v.code;

-- -----------------------------------------------------------------------------
-- Bài học (sort_order tính trong chủ đề)
-- Bài đọc (page): Markdown; ảnh tham chiếu file:{{object_key}} rồi được đổi sang id thật ở cuối phần này
-- -----------------------------------------------------------------------------
INSERT INTO lessons (course_id, section_id, title, description, content, lesson_type, media_object_id,
                     sort_order, estimated_minutes, is_preview, status, created_by)
SELECT c.id, s.id, v.title, v.description, v.content, v.lesson_type, so.id,
       v.sort_order, v.estimated_minutes, v.is_preview, v.status, c.created_by
FROM (
    SELECT 'ATLD-01' AS code, 1 AS section_order, 1 AS sort_order, 'Giới thiệu khóa học' AS title,
           'Mục tiêu và cách hoàn thành khóa học.' AS description,
           CAST('# Chào mừng đến với khóa An toàn lao động

Khóa học giúp bạn làm việc an toàn tại khu vực sản xuất. Sau khóa học, bạn có thể:

- Nhận diện các nhóm mối nguy thường gặp trong xưởng.
- Chọn và sử dụng đúng thiết bị bảo hộ cá nhân (PPE) cho từng khu vực.
- Xử lý đúng các tình huống khẩn cấp.

## Cách hoàn thành khóa học

1. Học lần lượt các chủ đề. Chủ đề sau chỉ mở khi bạn hoàn thành chủ đề trước.
2. Làm bài kiểm tra nhanh cuối mỗi chủ đề để tự ôn.
3. Đạt **từ 80%** ở bài kiểm tra cuối khóa trước hạn **31/10/2026**.

Sổ tay an toàn của nhà máy ở mục tài liệu đính kèm.' AS TEXT) AS content,
           'page' AS lesson_type, CAST(NULL AS VARCHAR(1024)) AS media_key, 5 AS estimated_minutes, TRUE AS is_preview, 'published' AS status
    UNION ALL SELECT 'ATLD-01', 2, 1, 'Giới thiệu & quy định chung', 'Nội quy ra vào xưởng và trách nhiệm của người lao động.', NULL,
           'video', 'courses/atld-01/lessons/quy-dinh-chung.mp4', 8, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 2, 2, 'Nhận diện mối nguy', 'Các nhóm mối nguy cơ học, điện, hóa chất, tiếng ồn.', NULL,
           'video', 'courses/atld-01/lessons/nhan-dien-moi-nguy.mp4', 15, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 2, 3, 'Biển báo an toàn', 'Tài liệu PDF các nhóm biển báo cấm, cảnh báo, bắt buộc, chỉ dẫn.', NULL,
           'pdf', 'courses/atld-01/lessons/bien-bao-an-toan.pdf', 10, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 3, 1, 'Sử dụng thiết bị bảo hộ cá nhân',
           'Video hướng dẫn cách chọn, kiểm tra và đeo đúng thiết bị bảo hộ cá nhân trước khi vào ca làm việc.', NULL,
           'video', 'courses/atld-01/lessons/su-dung-ppe.mp4', 12, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 3, 2, 'Bảng tra PPE theo khu vực', 'Yêu cầu PPE của từng khu vực trong xưởng.',
           '# Bảng tra PPE theo khu vực

Mỗi khu vực trong xưởng có yêu cầu thiết bị bảo hộ cá nhân (PPE) riêng. Tra bảng dưới đây **trước khi** bước vào một khu vực mới.

![Sơ đồ khu vực và biển báo PPE tại cửa vào](file:{{courses/atld-01/lessons/ppe-zones.png}})

## Yêu cầu theo khu vực

| Khu vực | PPE bắt buộc | Ghi chú |
|---|---|---|
| Khu dập, ép | Mũ bảo hộ, kính, nút tai, giày bảo hộ | Tiếng ồn trên 85 dB |
| Khu hàn | Mặt nạ hàn, găng chịu nhiệt, áo chống cháy | Không đeo trang sức kim loại |
| Kho hóa chất | Kính, găng tay chống hóa chất, khẩu trang phòng độc | Đọc phiếu an toàn (SDS) trước khi thao tác |
| Khu đóng gói | Giày bảo hộ, găng tay | |

## Kiểm tra PPE trước ca

1. **Mũ:** không nứt, quai cài chắc.
2. **Kính:** không trầy xước che tầm nhìn.
3. **Găng tay:** không rách, đúng loại cho công việc.
4. **Giày:** mũi thép còn nguyên, đế không mòn.

> Thiết bị hỏng phải **ngừng sử dụng ngay** và báo qua phiếu yêu cầu để nhận thiết bị mới.

Bản in của bảng tra nằm ở mục tài liệu đính kèm bên dưới.',
           'page', NULL, 5, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 3, 3, 'Kiểm tra nhanh: Thiết bị bảo hộ', 'Quiz luyện tập sau chủ đề PPE.', NULL,
           'quiz', NULL, 15, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 4, 1, 'An toàn khi vận hành máy', 'Tấm che bảo vệ, nút dừng khẩn cấp, khóa và treo thẻ (LOTO).', NULL,
           'video', 'courses/atld-01/lessons/van-hanh-may.mp4', 20, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 4, 2, 'Xử lý tình huống khẩn cấp', 'Cháy, rò rỉ hóa chất, tai nạn lao động.',
           '# Xử lý tình huống khẩn cấp

## Khi phát hiện cháy

1. Hô hoán và nhấn **chuông báo cháy** gần nhất.
2. Ngắt điện khu vực nếu an toàn.
3. Dùng bình chữa cháy khi đám cháy nhỏ; nếu không, sơ tán ngay.

## Khi có lệnh sơ tán

- Đi theo biển chỉ dẫn lối thoát hiểm, **không** dùng thang máy.
- Khu A tập trung ở bãi đỗ xe phía đông; khu B tập trung ở **sân trước cổng chính**.
- Tổ trưởng điểm danh và báo cáo cho đội ứng phó khẩn cấp.',
           'page', NULL, 10, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 4, 3, 'Diễn tập sơ tán', 'Ghi hình buổi diễn tập sơ tán tại khu B.', NULL,
           'video', 'courses/atld-01/lessons/dien-tap-so-tan.mp4', 10, FALSE, 'published'
    UNION ALL SELECT 'ATLD-01', 5, 1, 'Bài kiểm tra cuối khóa', 'Bài kiểm tra tính điểm, cần đạt từ 80%.', NULL,
           'quiz', NULL, 30, FALSE, 'published'

    UNION ALL SELECT 'BMTT-2026', 1, 1, 'Dấu hiệu email lừa đảo', 'Người gửi giả mạo, đường link lạ, yêu cầu gấp.', NULL,
           'video', 'courses/bmtt-2026/lessons/email-lua-dao.mp4', 10, TRUE, 'published'
    UNION ALL SELECT 'BMTT-2026', 1, 2, 'Quy trình báo cáo email đáng ngờ', 'Báo cáo cho Phòng CNTT.',
           '# Quy trình báo cáo email đáng ngờ

1. **Không** bấm vào đường link hoặc mở tệp đính kèm.
2. Chuyển tiếp email dưới dạng tệp đính kèm tới hộp thư bảo mật của Phòng CNTT.
3. Xóa email khỏi hộp thư đến.

Nếu lỡ nhập mật khẩu vào trang lạ, đổi mật khẩu ngay và báo cho Phòng CNTT.',
           'page', NULL, 5, FALSE, 'published'
    UNION ALL SELECT 'BMTT-2026', 2, 1, 'Mật khẩu mạnh và xác thực hai lớp', 'Cách đặt và quản lý mật khẩu.', NULL,
           'video', 'courses/bmtt-2026/lessons/mat-khau-2fa.mp4', 8, FALSE, 'published'
    UNION ALL SELECT 'BMTT-2026', 2, 2, 'Chính sách mật khẩu công ty', 'Văn bản chính sách (PDF).', NULL,
           'pdf', 'courses/bmtt-2026/lessons/chinh-sach-mat-khau.pdf', 6, FALSE, 'published'
    UNION ALL SELECT 'BMTT-2026', 3, 1, 'Bài kiểm tra cuối: Bảo mật thông tin', 'Bài kiểm tra tính điểm, cần đạt từ 70%.', NULL,
           'quiz', NULL, 15, FALSE, 'published'

    UNION ALL SELECT '5S-01', 1, 1, 'Sàng lọc (Seiri)', 'Phân loại và loại bỏ vật dụng không cần thiết.', NULL,
           'video', 'courses/5s-01/lessons/seiri.mp4', 6, TRUE, 'published'
    UNION ALL SELECT '5S-01', 1, 2, 'Sắp xếp (Seiton)', 'Mỗi thứ có một chỗ, mỗi chỗ có một thứ.', NULL,
           'video', 'courses/5s-01/lessons/seiton.mp4', 6, FALSE, 'published'
    UNION ALL SELECT '5S-01', 2, 1, 'Sạch sẽ (Seiso) và Săn sóc (Seiketsu)', 'Vệ sinh gắn với kiểm tra thiết bị.',
           '# Sạch sẽ và Săn sóc

**Sạch sẽ (Seiso):** vệ sinh máy móc và khu vực làm việc mỗi ca, đồng thời phát hiện bất thường như rò dầu, ốc lỏng.

**Săn sóc (Seiketsu):** chuẩn hóa ba bước đầu thành quy định, có hình ảnh mẫu và lịch kiểm tra.

| Hạng mục | Tần suất | Người thực hiện |
|---|---|---|
| Lau bề mặt máy | Mỗi ca | Người vận hành |
| Kiểm tra rò rỉ | Mỗi ca | Người vận hành |
| Đánh giá 5S khu vực | Hằng tuần | Tổ trưởng |',
           'page', NULL, 8, FALSE, 'published'
    UNION ALL SELECT '5S-01', 2, 2, 'Checklist 5S đầu ca', 'Mẫu checklist in ra dùng tại xưởng.', NULL,
           'pdf', 'courses/5s-01/lessons/checklist-5s.pdf', 4, FALSE, 'published'
    UNION ALL SELECT '5S-01', 3, 1, 'Sẵn sàng (Shitsuke)', 'Biến 5S thành thói quen hằng ngày.', NULL,
           'video', 'courses/5s-01/lessons/shitsuke.mp4', 5, FALSE, 'published'
    UNION ALL SELECT '5S-01', 3, 2, 'Kiểm tra 5S', 'Quiz luyện tập.', NULL,
           'quiz', NULL, 5, FALSE, 'published'

    UNION ALL SELECT 'SCC-01', 1, 1, 'Đánh giá hiện trường và gọi cấp cứu', 'An toàn cho người sơ cứu trước tiên.', NULL,
           'video', 'courses/scc-01/lessons/danh-gia-hien-truong.mp4', 10, TRUE, 'published'
    UNION ALL SELECT 'SCC-01', 1, 2, 'Hồi sức tim phổi (CPR)', 'Ép tim và thổi ngạt cho người lớn.', NULL,
           'video', 'courses/scc-01/lessons/cpr.mp4', 15, FALSE, 'published'
    UNION ALL SELECT 'SCC-01', 2, 1, 'Cầm máu và băng bó', 'Xử lý vết thương chảy máu.',
           '# Cầm máu và băng bó

1. Đeo găng tay trước khi tiếp xúc với máu.
2. Ép trực tiếp lên vết thương bằng gạc sạch trong ít nhất 10 phút.
3. Băng chặt vừa phải, kiểm tra tuần hoàn phía dưới vết băng.

> Không rút dị vật đang cắm trong vết thương; cố định dị vật và chờ nhân viên y tế.',
           'page', NULL, 8, FALSE, 'published'
    UNION ALL SELECT 'SCC-01', 2, 2, 'Kiểm tra sơ cấp cứu', 'Bài kiểm tra tính điểm.', NULL,
           'quiz', NULL, 10, FALSE, 'published'

    UNION ALL SELECT 'HC-02', 1, 1, 'Nhãn GHS và phiếu an toàn hóa chất (SDS)', 'Đọc nhãn và phiếu SDS.',
           '# Nhãn GHS

[NỘI DUNG ĐANG SOẠN]',
           'page', NULL, 10, FALSE, 'draft'
    UNION ALL SELECT 'HC-02', 1, 2, 'Lưu trữ hóa chất đúng cách', 'Phân khu, thông gió, chống tràn.', NULL,
           'video', 'courses/hc-02/lessons/luu-tru-hoa-chat.mp4', 9, FALSE, 'draft'
) v
JOIN courses c         ON c.code = v.code
JOIN course_sections s ON s.course_id = c.id AND s.sort_order = v.section_order
LEFT JOIN storage_objects so ON so.object_key = v.media_key;

-- File gắn với bài: ảnh nhúng (inline) và tài liệu đính kèm (attachment)
INSERT INTO lesson_files (lesson_id, storage_object_id, purpose, sort_order)
SELECT l.id, so.id, v.purpose, v.sort_order
FROM (
    SELECT 'ATLD-01' AS code, 'Bảng tra PPE theo khu vực' AS lesson_title, 'courses/atld-01/lessons/ppe-zones.png' AS object_key, 'inline' AS purpose, 1 AS sort_order
    UNION ALL SELECT 'ATLD-01', 'Bảng tra PPE theo khu vực', 'courses/atld-01/lessons/bang-tra-ppe.pdf',   'attachment', 1
    UNION ALL SELECT 'ATLD-01', 'Giới thiệu khóa học',       'courses/atld-01/lessons/so-tay-an-toan.pdf', 'attachment', 1
    UNION ALL SELECT '5S-01',   'Sạch sẽ (Seiso) và Săn sóc (Seiketsu)', 'courses/5s-01/lessons/checklist-5s.pdf', 'attachment', 1
) v
JOIN courses c         ON c.code = v.code
JOIN lessons l         ON l.course_id = c.id AND l.title = v.lesson_title
JOIN storage_objects so ON so.object_key = v.object_key;

-- Đổi file:{{object_key}} trong Markdown thành file:<id thật> (REPLACE có trên mọi DBMS lớn)
UPDATE lessons
SET content = REPLACE(content, '{{courses/atld-01/lessons/ppe-zones.png}}',
                      CAST((SELECT so.id FROM storage_objects so
                            WHERE so.object_key = 'courses/atld-01/lessons/ppe-zones.png') AS VARCHAR(20)))
WHERE content LIKE '%{{courses/atld-01/lessons/ppe-zones.png}}%';

-- -----------------------------------------------------------------------------
-- Quiz (thời gian theo giây; NULL = không giới hạn)
-- -----------------------------------------------------------------------------
INSERT INTO quizzes (lesson_id, pass_score_percent, time_limit_seconds, max_attempts, shuffle_questions,
                     is_graded, opens_at, closes_at, review_policy)
SELECT l.id, v.pass_score_percent, v.time_limit_seconds, v.max_attempts, v.shuffle_questions,
       v.is_graded, v.opens_at, v.closes_at, v.review_policy
FROM (
    SELECT 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title, 80 AS pass_score_percent,
           900 AS time_limit_seconds, 2 AS max_attempts, TRUE AS shuffle_questions, FALSE AS is_graded,
           CAST('2026-10-12 01:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS opens_at,
           CAST('2026-10-20 10:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS closes_at, 'after_submit' AS review_policy
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 80, 1800, 1, TRUE, TRUE,
           CAST('2026-10-01 01:00:00+00' AS TIMESTAMP WITH TIME ZONE),
           CAST('2026-10-31 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'after_close'
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 70, 900, 2, FALSE, TRUE,
           NULL, CAST('2026-10-18 16:59:59+00' AS TIMESTAMP WITH TIME ZONE), 'after_submit'
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 60, NULL, NULL, FALSE, FALSE, NULL, NULL, 'after_submit'
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 80, 600, 3, FALSE, TRUE, NULL, NULL, 'after_submit'
) v
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.title = v.lesson_title;

INSERT INTO quiz_questions (quiz_id, question_type, content, explanation, points, sort_order)
SELECT l.id, v.question_type, v.content, v.explanation, v.points, v.q_order
FROM (
    SELECT 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title, 1 AS q_order, 'single_choice' AS question_type,
           'Khi vào khu dập, ép, bạn bắt buộc phải mang PPE nào?' AS content,
           'Khu dập, ép có nguy cơ vật văng, tiếng ồn lớn và vật nặng rơi, nên cần đủ mũ, kính, nút tai và giày bảo hộ.' AS explanation, 1 AS points
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 'multiple_choice', 'Những PPE nào bắt buộc ở khu hàn?',
           'Khu hàn yêu cầu mặt nạ hàn, găng tay chịu nhiệt và áo chống cháy. Nút tai là yêu cầu của khu dập, ép.', 2
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 3, 'single_choice', 'Biển báo hình tròn, nền xanh dương, hình vẽ màu trắng có ý nghĩa gì?',
           'Biển tròn nền xanh dương là biển bắt buộc, ví dụ bắt buộc đội mũ hoặc đeo kính.', 1
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 4, 'short_text', 'Găng tay chống hóa chất bắt buộc ở khu vực nào trong xưởng?',
           'Theo bảng tra PPE, kho hóa chất yêu cầu kính, găng tay chống hóa chất và khẩu trang phòng độc.', 1
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 5, 'multiple_choice', 'Trước ca làm, bạn phát hiện kính bảo hộ bị nứt. Bạn cần làm gì?',
           'Kính nứt không còn bảo vệ đúng tiêu chuẩn: ngừng dùng, báo qua phiếu yêu cầu và nhận kính mới trước khi vào ca.', 2
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 6, 'single_choice', 'Ai chịu trách nhiệm kiểm tra PPE của bản thân trước mỗi ca?',
           'Mỗi người tự kiểm tra PPE của mình trước ca; trưởng ca và HSE giám sát, hỗ trợ.', 1
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 7, 'short_text', 'Thiết bị bảo hộ bị hỏng được báo cáo qua kênh nào?',
           'Mọi thiết bị hỏng được báo qua phiếu yêu cầu để HSE ghi nhận và cấp mới.', 1

    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 'single_choice', 'Khi phát hiện cháy trong xưởng, việc đầu tiên cần làm là gì?',
           'Báo động sớm giúp mọi người sơ tán kịp thời và đội ứng phó có mặt nhanh nhất.', 1
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 2, 'true_false', 'Được phép tháo tấm che bảo vệ của máy để thao tác nhanh hơn nếu làm cẩn thận.',
           'Tấm che bảo vệ là bắt buộc; tháo ra chỉ khi bảo trì và máy đã được khóa, treo thẻ.', 1
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 3, 'multiple_choice', 'Trước khi bảo trì máy, cần thực hiện những bước nào?',
           'Quy trình LOTO: ngắt năng lượng, khóa và treo thẻ, xác nhận máy đã dừng hẳn.', 2
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 4, 'short_text', 'Khi có lệnh sơ tán, người lao động khu B tập trung ở đâu?',
           'Theo quy trình xử lý khẩn cấp, điểm tập kết của khu B là sân trước cổng chính.', 1
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 5, 'single_choice', 'Biển báo hình tam giác, viền đỏ, nền vàng có ý nghĩa gì?',
           'Biển tam giác viền đỏ nền vàng là biển cảnh báo nguy hiểm.', 1

    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 'single_choice',
           'Bạn nhận email yêu cầu đăng nhập gấp qua một đường link lạ. Bạn nên làm gì?',
           'Không bấm link; báo cáo cho Phòng CNTT theo quy trình.', 1
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 2, 'true_false',
           'Có thể dùng chung một mật khẩu cho nhiều hệ thống nếu mật khẩu đủ mạnh.',
           'Một hệ thống bị lộ sẽ kéo theo mọi hệ thống dùng chung mật khẩu.', 1
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 3, 'multiple_choice',
           'Những dấu hiệu nào cho thấy email có thể là lừa đảo?',
           'Email lừa đảo thường giả tên miền, tạo áp lực thời gian và kèm tệp yêu cầu bật macro.', 2

    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 1, 'single_choice', 'Seiri (Sàng lọc) nghĩa là gì?',
           'Sàng lọc là loại bỏ khỏi nơi làm việc những thứ không cần thiết.', 1
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 2, 'short_text', 'Bước thứ năm của 5S (Shitsuke) có tên tiếng Việt là gì?',
           'Shitsuke là Sẵn sàng: duy trì kỷ luật và thói quen 5S.', 1

    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 1, 'true_false',
           'Nên di chuyển ngay nạn nhân nghi bị chấn thương cột sống ra khỏi hiện trường.',
           'Chỉ di chuyển khi hiện trường đe dọa tính mạng; nếu không, giữ nguyên tư thế và chờ nhân viên y tế.', 1
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 'single_choice',
           'Trong hồi sức tim phổi (CPR) cho người lớn, tỉ lệ ép tim và thổi ngạt là bao nhiêu?',
           'Khuyến cáo hiện hành: 30 lần ép tim, 2 lần thổi ngạt.', 1
) v
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.title = v.lesson_title;

-- Phương án trả lời. Câu short_text: mỗi dòng là một đáp án được chấp nhận (is_correct = TRUE)
INSERT INTO quiz_options (question_id, content, is_correct, sort_order)
SELECT q.id, v.content, v.is_correct, v.o_order
FROM (
    SELECT 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title, 1 AS q_order, 1 AS o_order,
           'Mũ bảo hộ, kính, nút tai, giày bảo hộ' AS content, TRUE AS is_correct
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 2, 'Chỉ cần găng tay',              FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 3, 'Khẩu trang phòng độc',          FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 4, 'Áo chống cháy',                 FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 1, 'Mặt nạ hàn',                    TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 2, 'Găng tay chịu nhiệt',           TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 3, 'Nút tai',                       FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 4, 'Áo chống cháy',                 TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 3, 1, 'Cấm',                           FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 3, 2, 'Cảnh báo nguy hiểm',            FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 3, 3, 'Bắt buộc',                      TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 3, 4, 'Lối thoát hiểm',                FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 4, 1, 'Kho hóa chất',                  TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 4, 2, 'Khu hóa chất',                  TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 4, 3, 'Kho chứa hóa chất',             TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 5, 1, 'Ngừng sử dụng kính bị nứt',     TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 5, 2, 'Báo qua phiếu yêu cầu',         TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 5, 3, 'Dán băng keo rồi dùng tiếp',    FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 5, 4, 'Nhận kính mới trước khi vào ca', TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 6, 1, 'Trưởng ca',                     FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 6, 2, 'Phòng HSE',                     FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 6, 3, 'Chính người lao động',          TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 6, 4, 'Bảo vệ',                        FALSE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 7, 1, 'Phiếu yêu cầu',                 TRUE
    UNION ALL SELECT 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 7, 2, 'Phiếu yêu cầu thiết bị',        TRUE

    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 1, 'Hô hoán và nhấn chuông báo cháy gần nhất', TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 2, 'Thu dọn đồ cá nhân',            FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 3, 'Tiếp tục công việc đang dở',    FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 4, 'Tự đi tìm nguồn cháy',          FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 2, 1, 'Đúng',                          FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 2, 2, 'Sai',                           TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 3, 1, 'Ngắt nguồn năng lượng của máy', TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 3, 2, 'Khóa và treo thẻ (LOTO)',       TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 3, 3, 'Kiểm tra máy đã dừng hẳn',      TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 3, 4, 'Để máy chạy để dễ quan sát',    FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 4, 1, 'Sân trước cổng chính',          TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 4, 2, 'Sân cổng chính',                TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 5, 1, 'Cảnh báo nguy hiểm',            TRUE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 5, 2, 'Cấm',                           FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 5, 3, 'Bắt buộc',                      FALSE
    UNION ALL SELECT 'ATLD-01', 'Bài kiểm tra cuối khóa', 5, 4, 'Chỉ dẫn',                       FALSE

    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 1, 'Bấm vào link và đăng nhập ngay',          FALSE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 2, 'Chuyển tiếp cho đồng nghiệp kiểm tra giúp', FALSE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 3, 'Không bấm link và báo cáo cho Phòng CNTT', TRUE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 4, 'Trả lời email để hỏi lại người gửi',       FALSE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 2, 1, 'Đúng', FALSE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 2, 2, 'Sai',  TRUE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 3, 1, 'Địa chỉ người gửi gần giống tên miền công ty', TRUE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 3, 2, 'Yêu cầu hành động gấp trong vài giờ',          TRUE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 3, 3, 'Có lời chào bằng đúng tên của bạn',           FALSE
    UNION ALL SELECT 'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 3, 4, 'Đính kèm tệp lạ yêu cầu bật macro',           TRUE

    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 1, 1, 'Loại bỏ vật không cần thiết khỏi nơi làm việc', TRUE
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 1, 2, 'Sắp xếp dụng cụ theo thứ tự',                   FALSE
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 1, 3, 'Lau chùi máy móc',                              FALSE
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 1, 4, 'Kiểm tra định kỳ',                              FALSE
    UNION ALL SELECT '5S-01', 'Kiểm tra 5S', 2, 1, 'Sẵn sàng',                                      TRUE

    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 1, 1, 'Đúng', FALSE
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 1, 2, 'Sai',  TRUE
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 1, '30:2', TRUE
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 2, '15:1', FALSE
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 3, '5:1',  FALSE
    UNION ALL SELECT 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 4, '10:2', FALSE
) v
JOIN courses c        ON c.code = v.code
JOIN lessons l        ON l.course_id = c.id AND l.title = v.lesson_title
JOIN quiz_questions q ON q.quiz_id = l.id AND q.sort_order = v.q_order;

-- -----------------------------------------------------------------------------
-- Ghi danh (due_at NULL -> lấy hạn mặc định của khóa)
-- -----------------------------------------------------------------------------
INSERT INTO enrollments (course_id, user_id, status, enrolled_by, enrolled_at, due_at, completed_at, removed_at, removed_by)
SELECT c.id, s.id, v.status, i.id, v.enrolled_at, c.default_due_at, v.completed_at, v.removed_at,
       CASE WHEN v.status = 'removed' THEN i.id END
FROM (
    SELECT 'ATLD-01' AS code, 'hv.minhanh@xlearn.dev' AS student, 'gv.an@xlearn.dev' AS instructor, 'active' AS status,
           CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS enrolled_at,
           CAST(NULL AS TIMESTAMP WITH TIME ZONE) AS completed_at,
           CAST(NULL AS TIMESTAMP WITH TIME ZONE) AS removed_at
    UNION ALL SELECT 'ATLD-01', 'hv.cuong@xlearn.dev', 'gv.an@xlearn.dev', 'active',    CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'ATLD-01', 'hv.mai@xlearn.dev',   'gv.an@xlearn.dev', 'active',    CAST('2026-10-05 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'ATLD-01', 'hv.tai@xlearn.dev',   'gv.an@xlearn.dev', 'completed', CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-08 02:21:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'ATLD-01', 'hv.tam@xlearn.dev',   'gv.an@xlearn.dev', 'active',    CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'ATLD-01', 'hv.dung@xlearn.dev',  'gv.an@xlearn.dev', 'active',    CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'ATLD-01', 'hv.chi@xlearn.dev',   'gv.an@xlearn.dev', 'completed', CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-07 03:18:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'ATLD-01', 'hv.hang@xlearn.dev',  'gv.an@xlearn.dev', 'completed', CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-06 01:52:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'ATLD-01', 'hv.giang@xlearn.dev', 'gv.an@xlearn.dev', 'active',    CAST('2026-10-08 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'ATLD-01', 'hv.hoa@xlearn.dev',   'gv.an@xlearn.dev', 'active',    CAST('2026-10-01 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL

    UNION ALL SELECT 'BMTT-2026', 'hv.minhanh@xlearn.dev', 'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.cuong@xlearn.dev',   'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.mai@xlearn.dev',     'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.tai@xlearn.dev',     'gv.binh@xlearn.dev', 'completed', CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-07 09:06:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.tam@xlearn.dev',     'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.chi@xlearn.dev',     'gv.binh@xlearn.dev', 'completed', CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-08 09:09:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'BMTT-2026', 'hv.hoa@xlearn.dev',     'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'BMTT-2026', 'gv.an@xlearn.dev',      'gv.binh@xlearn.dev', 'active',    CAST('2026-10-02 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL

    UNION ALL SELECT '5S-01', 'hv.minhanh@xlearn.dev', 'gv.an@xlearn.dev', 'active',  CAST('2026-09-15 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT '5S-01', 'hv.cuong@xlearn.dev',   'gv.an@xlearn.dev', 'active',  CAST('2026-09-15 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT '5S-01', 'hv.dung@xlearn.dev',    'gv.an@xlearn.dev', 'active',  CAST('2026-09-15 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT '5S-01', 'hv.hoa@xlearn.dev',     'gv.an@xlearn.dev', 'active',  CAST('2026-09-15 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    -- Xóa khỏi khóa nhưng vẫn giữ lịch sử tiến độ
    UNION ALL SELECT '5S-01', 'hv.giang@xlearn.dev',   'gv.an@xlearn.dev', 'removed', CAST('2026-09-15 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, CAST('2026-09-30 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)

    UNION ALL SELECT 'SCC-01', 'hv.tai@xlearn.dev',  'gv.an@xlearn.dev', 'active',    CAST('2026-09-20 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL, NULL
    UNION ALL SELECT 'SCC-01', 'hv.chi@xlearn.dev',  'gv.an@xlearn.dev', 'completed', CAST('2026-09-20 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-25 02:05:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
    UNION ALL SELECT 'SCC-01', 'hv.hang@xlearn.dev', 'gv.an@xlearn.dev', 'completed', CAST('2026-09-20 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-26 03:05:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
) v
JOIN courses c ON c.code = v.code
JOIN users s   ON s.email = v.student
JOIN users i   ON i.email = v.instructor;

-- -----------------------------------------------------------------------------
-- Tiến độ bài học
-- (1) done_count = số bài đầu tiên (theo thứ tự chủ đề -> bài) đã hoàn thành.
--     ROW_NUMBER() là window function SQL:2003, có trên PG, MySQL 8, SQL Server, Oracle.
-- -----------------------------------------------------------------------------
INSERT INTO lesson_progress
    (user_id, lesson_id, status, progress_percent, last_position_seconds, last_page, time_spent_seconds, started_at, completed_at, updated_at)
SELECT u.id, rl.id, 'completed', 100,
       CASE WHEN rl.lesson_type = 'video' THEN so.duration_seconds END,
       CASE WHEN rl.lesson_type = 'pdf' THEN so.page_count END,
       COALESCE(rl.estimated_minutes, 5) * 60,
       v.activity_at, v.activity_at, v.activity_at
FROM (
    SELECT 'hv.minhanh@xlearn.dev' AS email, 'ATLD-01' AS code, 4 AS done_count,
           CAST('2026-10-10 07:30:00+00' AS TIMESTAMP WITH TIME ZONE) AS activity_at
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'ATLD-01', 2,  CAST('2026-10-05 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',   'ATLD-01', 11, CAST('2026-10-08 02:21:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tam@xlearn.dev',   'ATLD-01', 8,  CAST('2026-10-11 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.dung@xlearn.dev',  'ATLD-01', 3,  CAST('2026-10-08 04:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',   'ATLD-01', 11, CAST('2026-10-07 03:18:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev',  'ATLD-01', 11, CAST('2026-10-06 01:52:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hoa@xlearn.dev',   'ATLD-01', 6,  CAST('2026-10-12 02:20:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.cuong@xlearn.dev', 'BMTT-2026', 1, CAST('2026-10-04 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.mai@xlearn.dev',   'BMTT-2026', 2, CAST('2026-10-06 03:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',   'BMTT-2026', 5, CAST('2026-10-07 09:06:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',   'BMTT-2026', 5, CAST('2026-10-08 09:09:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hoa@xlearn.dev',   'BMTT-2026', 3, CAST('2026-10-09 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'gv.an@xlearn.dev',    'BMTT-2026', 1, CAST('2026-10-03 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.minhanh@xlearn.dev','5S-01', 2,    CAST('2026-09-20 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.dung@xlearn.dev',  '5S-01', 1,     CAST('2026-09-18 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hoa@xlearn.dev',   '5S-01', 4,     CAST('2026-09-25 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.giang@xlearn.dev', '5S-01', 1,     CAST('2026-09-17 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',   'SCC-01', 2,    CAST('2026-09-24 02:00:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',   'SCC-01', 4,    CAST('2026-09-25 02:05:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev',  'SCC-01', 4,    CAST('2026-09-26 03:05:00+00' AS TIMESTAMP WITH TIME ZONE)
) v
JOIN users u   ON u.email = v.email
JOIN courses c ON c.code = v.code
JOIN (
    SELECT l.id, l.course_id, l.lesson_type, l.estimated_minutes, l.media_object_id,
           ROW_NUMBER() OVER (PARTITION BY l.course_id ORDER BY s.sort_order, l.sort_order) AS rnk
    FROM lessons l
    JOIN course_sections s ON s.id = l.section_id
    WHERE l.status = 'published' AND l.deleted_at IS NULL
) rl ON rl.course_id = c.id AND rl.rnk <= v.done_count
LEFT JOIN storage_objects so ON so.id = rl.media_object_id;

-- (2) Các dòng tiến độ riêng lẻ: Minh Anh đã đọc bảng tra PPE, đang xem dở video PPE ở 04:12
INSERT INTO lesson_progress
    (user_id, lesson_id, status, progress_percent, last_position_seconds, last_page, time_spent_seconds, started_at, completed_at, updated_at)
SELECT u.id, l.id, v.status, v.progress_percent, v.last_position_seconds, NULL, v.time_spent_seconds,
       v.started_at, v.completed_at, COALESCE(v.completed_at, v.started_at)
FROM (
    SELECT 'hv.minhanh@xlearn.dev' AS email, 'ATLD-01' AS code, 'Bảng tra PPE theo khu vực' AS lesson_title,
           'completed' AS status, 100 AS progress_percent, CAST(NULL AS INTEGER) AS last_position_seconds, 360 AS time_spent_seconds,
           CAST('2026-10-11 06:35:00+00' AS TIMESTAMP WITH TIME ZONE) AS started_at,
           CAST('2026-10-11 06:41:00+00' AS TIMESTAMP WITH TIME ZONE) AS completed_at
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Sử dụng thiết bị bảo hộ cá nhân',
           'in_progress', 35, 252, 300, CAST('2026-10-12 07:00:00+00' AS TIMESTAMP WITH TIME ZONE), NULL
) v
JOIN users u   ON u.email = v.email
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.title = v.lesson_title;

-- -----------------------------------------------------------------------------
-- Lượt làm quiz (score_percent = score / max_score * 100)
-- -----------------------------------------------------------------------------
INSERT INTO quiz_attempts (quiz_id, user_id, attempt_no, status, score, max_score, score_percent, passed, started_at, submitted_at)
SELECT l.id, u.id, v.attempt_no, 'submitted', v.score, v.max_score, v.score_percent, v.passed, v.started_at, v.submitted_at
FROM (
    SELECT 'hv.minhanh@xlearn.dev' AS email, 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title, 1 AS attempt_no,
           5 AS score, 9 AS max_score, 55.56 AS score_percent, FALSE AS passed,
           CAST('2026-10-11 07:00:00+00' AS TIMESTAMP WITH TIME ZONE) AS started_at,
           CAST('2026-10-11 07:12:00+00' AS TIMESTAMP WITH TIME ZONE) AS submitted_at
    UNION ALL SELECT 'hv.tam@xlearn.dev',  'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 8, 9, 88.89, TRUE,
           CAST('2026-10-09 03:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-09 03:10:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',  'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 9, 9, 100, TRUE,
           CAST('2026-10-06 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-06 02:09:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',  'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 6, 9, 66.67, FALSE,
           CAST('2026-10-05 08:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-05 08:11:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',  'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 2, 9, 9, 100, TRUE,
           CAST('2026-10-06 08:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-06 08:08:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 9, 9, 100, TRUE,
           CAST('2026-10-04 01:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-04 01:07:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',  'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 5, 6, 83.33, TRUE,
           CAST('2026-10-08 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-08 02:21:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',  'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 6, 6, 100, TRUE,
           CAST('2026-10-07 03:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-07 03:18:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 6, 6, 100, TRUE,
           CAST('2026-10-06 01:30:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-06 01:52:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.tai@xlearn.dev',  'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 4, 4, 100, TRUE,
           CAST('2026-10-07 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-07 09:06:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',  'BMTT-2026', 'Bài kiểm tra cuối: Bảo mật thông tin', 1, 3, 4, 75, TRUE,
           CAST('2026-10-08 09:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-10-08 09:09:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.chi@xlearn.dev',  'SCC-01', 'Kiểm tra sơ cấp cứu', 1, 2, 2, 100, TRUE,
           CAST('2026-09-25 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-25 02:05:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev', 'SCC-01', 'Kiểm tra sơ cấp cứu', 1, 1, 2, 50, FALSE,
           CAST('2026-09-26 02:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-26 02:04:00+00' AS TIMESTAMP WITH TIME ZONE)
    UNION ALL SELECT 'hv.hang@xlearn.dev', 'SCC-01', 'Kiểm tra sơ cấp cứu', 2, 2, 2, 100, TRUE,
           CAST('2026-09-26 03:00:00+00' AS TIMESTAMP WITH TIME ZONE), CAST('2026-09-26 03:05:00+00' AS TIMESTAMP WITH TIME ZONE)
) v
JOIN users u   ON u.email = v.email
JOIN courses c ON c.code = v.code
JOIN lessons l ON l.course_id = c.id AND l.title = v.lesson_title;

-- Phương án đã chọn (câu trắc nghiệm): Minh Anh lượt 1 bài kiểm tra nhanh (5/9), Tài bài cuối khóa (5/6)
INSERT INTO quiz_attempt_answers (attempt_id, question_id, option_id, answered_at)
SELECT a.id, q.id, o.id, a.submitted_at
FROM (
    SELECT 'hv.minhanh@xlearn.dev' AS email, 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title,
           1 AS attempt_no, 1 AS q_order, 1 AS o_order
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 2, 1
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 2, 2   -- thiếu "Áo chống cháy" -> sai
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 3, 1   -- chọn "Cấm" -> sai
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 5, 1
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 5, 2
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 5, 4
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 6, 1   -- chọn "Trưởng ca" -> sai
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 1, 1
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 2, 2
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 3, 1
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 3, 2
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 3, 3
    UNION ALL SELECT 'hv.tai@xlearn.dev', 'ATLD-01', 'Bài kiểm tra cuối khóa', 1, 5, 1
) v
JOIN users u          ON u.email = v.email
JOIN courses c        ON c.code = v.code
JOIN lessons l        ON l.course_id = c.id AND l.title = v.lesson_title
JOIN quiz_attempts a  ON a.quiz_id = l.id AND a.user_id = u.id AND a.attempt_no = v.attempt_no
JOIN quiz_questions q ON q.quiz_id = l.id AND q.sort_order = v.q_order
JOIN quiz_options o   ON o.question_id = q.id AND o.sort_order = v.o_order;

-- Câu trả lời tự luận ngắn
INSERT INTO quiz_attempt_text_answers (attempt_id, question_id, answer_text, is_correct, answered_at)
SELECT a.id, q.id, v.answer_text, v.is_correct, a.submitted_at
FROM (
    SELECT 'hv.minhanh@xlearn.dev' AS email, 'ATLD-01' AS code, 'Kiểm tra nhanh: Thiết bị bảo hộ' AS lesson_title,
           1 AS attempt_no, 4 AS q_order, 'kho hoa chat' AS answer_text, TRUE AS is_correct   -- khớp "Kho hóa chất" (bỏ dấu)
    UNION ALL SELECT 'hv.minhanh@xlearn.dev', 'ATLD-01', 'Kiểm tra nhanh: Thiết bị bảo hộ', 1, 7, 'Phiếu yêu cầu', TRUE
    UNION ALL SELECT 'hv.tai@xlearn.dev',     'ATLD-01', 'Bài kiểm tra cuối khóa',          1, 4, 'Nhà xe',        FALSE
) v
JOIN users u          ON u.email = v.email
JOIN courses c        ON c.code = v.code
JOIN lessons l        ON l.course_id = c.id AND l.title = v.lesson_title
JOIN quiz_attempts a  ON a.quiz_id = l.id AND a.user_id = u.id AND a.attempt_no = v.attempt_no
JOIN quiz_questions q ON q.quiz_id = l.id AND q.sort_order = v.q_order;

COMMIT;
