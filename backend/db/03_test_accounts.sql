-- =============================================================================
-- XLearn LMS - Tài khoản kiểm thử (chạy sau 02_seed.sql)
-- Mỗi tài khoản phục vụ một tình huống kiểm thử giao diện/API.
-- Idempotent: chạy lại nhiều lần không lỗi, không nhân đôi (NOT EXISTS thay cho
-- ON CONFLICT để giữ SQL chuẩn như các file khác).
-- Mật khẩu mọi tài khoản: Password@123 (cùng hash bcrypt với 02_seed.sql)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 03_test_accounts.sql
-- =============================================================================
START TRANSACTION;

INSERT INTO users (email, password_hash, full_name, employee_code, department_id, status)
SELECT v.email, '$2a$10$iiLxnxXvM1p06srHO1Ipf.iqA2WkAnhMKMPw1HGBXXzz7WHpWciQG', v.full_name, v.employee_code, d.id, v.status
FROM (
    -- Học viên chưa ghi danh khóa nào → trạng thái rỗng của các màn học viên
    SELECT 'test.hocvien@xlearn.dev' AS email, 'Kiểm Thử Học Viên' AS full_name, 'TEST001' AS employee_code, 'VH' AS dept, 'active' AS status
    -- Giảng viên chưa có khóa học nào → trạng thái rỗng của các màn giảng viên
    UNION ALL SELECT 'test.giangvien@xlearn.dev',    'Kiểm Thử Giảng Viên',                  'TEST002', 'HSE',  'active'
    -- Quản trị viên kiêm giảng viên → vào được cả /teach lẫn API /admin/users
    UNION ALL SELECT 'test.quantri@xlearn.dev',      'Kiểm Thử Quản Trị',                    'TEST003', 'CNTT', 'active'
    -- Tên rất dài → kiểm tra header, avatar chữ tắt, bảng không vỡ layout
    UNION ALL SELECT 'test.tendai@xlearn.dev',       'Tôn Nữ Hoàng Thị Phương Thảo Nguyên',  'TEST004', 'KH',   'active'
    -- Không có vai trò nào → frontend coi như học viên, API giảng viên/admin phải trả 403
    UNION ALL SELECT 'test.khongvaitro@xlearn.dev',  'Kiểm Thử Không Vai Trò',               'TEST005', 'NS',   'active'
    -- Đăng nhập đúng mật khẩu vẫn bị chặn: 403 "Tài khoản đã bị khóa hoặc vô hiệu hóa"
    UNION ALL SELECT 'test.bikhoa@xlearn.dev',       'Kiểm Thử Bị Khóa',                     'TEST006', 'VH',   'locked'
    UNION ALL SELECT 'test.ngunghoatdong@xlearn.dev','Kiểm Thử Ngừng Hoạt Động',             'TEST007', 'VH',   'inactive'
) v
-- LEFT JOIN: mã phòng ban không tồn tại thì vẫn tạo tài khoản, department_id = NULL
LEFT JOIN departments d ON d.code = v.dept
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = v.email);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON
       (u.email IN ('test.hocvien@xlearn.dev', 'test.tendai@xlearn.dev',
                    'test.bikhoa@xlearn.dev', 'test.ngunghoatdong@xlearn.dev') AND r.code = 'student')
    OR (u.email = 'test.giangvien@xlearn.dev' AND r.code = 'instructor')
    OR (u.email = 'test.quantri@xlearn.dev'   AND r.code IN ('admin', 'instructor'))
WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id);

COMMIT;
