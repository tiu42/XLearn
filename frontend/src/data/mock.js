// Dữ liệu mẫu, khớp cấu trúc và nội dung với backend/db/02_seed.sql.
// Backend hiện có /auth, /admin/users, /me/courses (Khóa học của tôi, khối "gần đây" ở Dashboard),
// /me/courses/:id (Trang khóa học), /me/courses/:id/lessons/:lessonId (Giao diện học),
// …/lessons/:lessonId/quiz (Làm bài kiểm tra), /me/timeline (Dòng thời gian ở Dashboard),
// /teach/courses (danh sách + thêm/sửa/xóa khóa học của giảng viên, phần đầu trang quản lý khóa), /departments,
// /teach/courses/:id/content + /uploads (chủ đề, bài học, upload file);
// các màn còn lại (thông số & học viên, soạn câu hỏi quiz…) tạm dùng dữ liệu này.
// Khi có API, thay từng hàm get* bằng lời gọi api.get(...) tương ứng.
//
// Quy ước để lớp API chuyển đổi giữa DB và giao diện:
//   - Giá trị liệt kê dùng đúng tên trong DB: courses.status = draft | published | archived,
//     lessons.lesson_type = video | pdf | page | quiz, quiz_questions.question_type =
//     single_choice | multiple_choice | true_false | short_text, quizzes.review_policy =
//     after_submit | after_close | never.
//   - Thời gian quiz: giao diện dùng PHÚT, DB lưu GIÂY (time_limit_seconds). NULL = không giới hạn.
//   - Số lượt làm: giao diện dùng 0 = không giới hạn, DB dùng NULL (CHECK max_attempts > 0).
//   - Ngày: giao diện dùng 'YYYY-MM-DD' giờ Việt Nam, DB lưu TIMESTAMPTZ (UTC) cuối ngày 23:59:59+07.
//   - Ảnh trong bài đọc: Markdown tham chiếu ![mô tả](file:<storage_object_id>); API trả URL tạm thời của từng ảnh.

export const BRAND = { name: 'Học viện XLearn', logo: 'X' }

/* --------------------------------------------------------------------------
 * Phòng ban (bảng departments)
 * ------------------------------------------------------------------------ */
export const DEPARTMENTS = [
    { code: 'HSE', name: 'An toàn - Sức khỏe - Môi trường', short: 'HSE' },
    { code: 'VH', name: 'Vận hành', short: 'Vận hành' },
    { code: 'CNTT', name: 'Công nghệ thông tin', short: 'CNTT' },
    { code: 'KH', name: 'Kế hoạch', short: 'Kế hoạch' },
    { code: 'NS', name: 'Nhân sự', short: 'Nhân sự' },
]
export const deptShort = (code) => DEPARTMENTS.find((d) => d.code === code)?.short ?? code

export const COURSE_STATUS = {
    published: { label: 'Đang mở', tone: 'green' },
    draft: { label: 'Bản nháp', tone: 'gray' },
    archived: { label: 'Lưu trữ', tone: 'orange' },
}

/* --------------------------------------------------------------------------
 * Câu hỏi mẫu quiz khóa ATLD-01 cho màn soạn bài kiểm tra
 * ------------------------------------------------------------------------ */
// t: question_type; c: chỉ số đáp án đúng (multiple_choice: mảng); accept: đáp án chấp nhận của short_text; p: điểm
export const QUIZ_QUESTIONS = [
    { t: 'single_choice', p: 1, q: 'Khi vào khu dập, ép, bạn bắt buộc phải mang PPE nào?', o: ['Mũ bảo hộ, kính, nút tai, giày bảo hộ', 'Chỉ cần găng tay', 'Khẩu trang phòng độc', 'Áo chống cháy'], c: 0, e: 'Khu dập, ép có nguy cơ vật văng, tiếng ồn lớn và vật nặng rơi, nên cần đủ mũ, kính, nút tai và giày bảo hộ.' },
    { t: 'multiple_choice', p: 2, q: 'Những PPE nào bắt buộc ở khu hàn?', o: ['Mặt nạ hàn', 'Găng tay chịu nhiệt', 'Nút tai', 'Áo chống cháy'], c: [0, 1, 3], e: 'Khu hàn yêu cầu mặt nạ hàn, găng tay chịu nhiệt và áo chống cháy. Nút tai là yêu cầu của khu dập, ép.' },
    { t: 'single_choice', p: 1, q: 'Biển báo hình tròn, nền xanh dương, hình vẽ màu trắng có ý nghĩa gì?', o: ['Cấm', 'Cảnh báo nguy hiểm', 'Bắt buộc', 'Lối thoát hiểm'], c: 2, e: 'Biển tròn nền xanh dương là biển bắt buộc, ví dụ bắt buộc đội mũ hoặc đeo kính.' },
    { t: 'short_text', p: 1, q: 'Găng tay chống hóa chất bắt buộc ở khu vực nào trong xưởng?', accept: ['Kho hóa chất', 'Khu hóa chất', 'Kho chứa hóa chất'], e: 'Theo bảng tra PPE, kho hóa chất yêu cầu kính, găng tay chống hóa chất và khẩu trang phòng độc.' },
    { t: 'multiple_choice', p: 2, q: 'Trước ca làm, bạn phát hiện kính bảo hộ bị nứt. Bạn cần làm gì?', o: ['Ngừng sử dụng kính bị nứt', 'Báo qua phiếu yêu cầu', 'Dán băng keo rồi dùng tiếp', 'Nhận kính mới trước khi vào ca'], c: [0, 1, 3], e: 'Kính nứt không còn bảo vệ đúng tiêu chuẩn: ngừng dùng, báo qua phiếu yêu cầu và nhận kính mới trước khi vào ca.' },
    { t: 'single_choice', p: 1, q: 'Ai chịu trách nhiệm kiểm tra PPE của bản thân trước mỗi ca?', o: ['Trưởng ca', 'Phòng HSE', 'Chính người lao động', 'Bảo vệ'], c: 2, e: 'Mỗi người tự kiểm tra PPE của mình trước ca; trưởng ca và HSE giám sát, hỗ trợ.' },
    { t: 'short_text', p: 1, q: 'Thiết bị bảo hộ bị hỏng được báo cáo qua kênh nào?', accept: ['Phiếu yêu cầu', 'Phiếu yêu cầu thiết bị'], e: 'Mọi thiết bị hỏng được báo qua phiếu yêu cầu để HSE ghi nhận và cấp mới.' },
]

/* --------------------------------------------------------------------------
 * Giảng viên: thông số khóa học
 * ------------------------------------------------------------------------ */
const L = (id, name, code, dept, done, exam, enrolled = '01/10/2026') => ({ id, name, code, dept, done, exam, enrolled })

export const getCourseStats = () => ({
    items: [
        { t: 'page', n: 'Giới thiệu khóa học' }, { t: 'video', n: 'Giới thiệu & quy định chung' }, { t: 'video', n: 'Nhận diện mối nguy' },
        { t: 'pdf', n: 'Biển báo an toàn' }, { t: 'video', n: 'Sử dụng thiết bị bảo hộ cá nhân' }, { t: 'page', n: 'Bảng tra PPE theo khu vực' },
        { t: 'quiz', n: 'Kiểm tra nhanh: Thiết bị bảo hộ' }, { t: 'video', n: 'An toàn khi vận hành máy' }, { t: 'page', n: 'Xử lý tình huống khẩn cấp' },
        { t: 'video', n: 'Diễn tập sơ tán' }, { t: 'quiz', n: 'Bài kiểm tra cuối khóa' },
    ],
    people: [
        L(1, 'Nguyễn Minh Anh', 'NV0412', 'Vận hành', 5, null), L(2, 'Lê Minh Cường', 'NV0233', 'Vận hành', 2, null),
        L(3, 'Đỗ Thị Mai', 'NV0518', 'CNTT', 0, null, '05/10/2026'), L(4, 'Vũ Đức Tài', 'NV0377', 'Vận hành', 11, 83),
        L(5, 'Ngô Thanh Tâm', 'NV0291', 'Kế hoạch', 8, null), L(6, 'Phạm Thu Dung', 'NV0624', 'Vận hành', 3, null),
        L(7, 'Hoàng Lan Chi', 'NV0455', 'CNTT', 11, 100), L(8, 'Phan Thị Hằng', 'NV0188', 'HSE', 11, 100),
        L(9, 'Hoàng Gia Giang', 'NV0702', 'Vận hành', 0, null, '08/10/2026'), L(10, 'Vũ Thanh Hoa', 'NV0349', 'Kế hoạch', 6, null),
    ],
    pool: [
        { id: 21, name: 'Phạm Văn Đức', code: 'NV0815', dept: 'Vận hành' }, { id: 22, name: 'Lý Thu Trang', code: 'NV0820', dept: 'Vận hành' },
        { id: 23, name: 'Cao Minh Khôi', code: 'NV0533', dept: 'CNTT' }, { id: 24, name: 'Mai Anh Thư', code: 'NV0144', dept: 'Nhân sự' },
        { id: 25, name: 'Tạ Quang Vinh', code: 'NV0761', dept: 'Vận hành' }, { id: 26, name: 'Hồ Bảo Ngọc', code: 'NV0398', dept: 'Kế hoạch' },
        { id: 27, name: 'Đinh Công Sơn', code: 'NV0207', dept: 'HSE' },
    ],
})

export const DEPTS = DEPARTMENTS.map((d) => d.short)

/* --------------------------------------------------------------------------
 * Giảng viên: soạn bài kiểm tra (c luôn là mảng)
 * ------------------------------------------------------------------------ */
export const getQuizDraft = () => ({
    title: 'Kiểm tra nhanh: Thiết bị bảo hộ',
    is_graded: false,
    settings: { minutes: 15, attempts: 2, pass: 80, opens_at: '2026-10-12T08:00', closes_at: '2026-10-20T17:00', review_policy: 'after_submit', shuffle_questions: true },
    questions: QUIZ_QUESTIONS.map((q, i) => ({
        id: i + 1, t: q.t, pts: q.p, q: q.q, e: q.e,
        ...(q.t === 'short_text' ? { accept: [...q.accept] } : { o: [...q.o], c: Array.isArray(q.c) ? [...q.c] : [q.c] }),
    })),
})

/* --------------------------------------------------------------------------
 * Giảng viên: học viên
 * ------------------------------------------------------------------------ */
const S = (id, name, code, dept, courses, done, last) => ({ id, name, code, dept, courses, done, last })

export const CATALOG = [
    { id: 1, t: 'An toàn lao động tại khu vực sản xuất' }, { id: 2, t: 'Bảo mật thông tin 2026' },
    { id: 3, t: 'Quy trình 5S trong xưởng' }, { id: 4, t: 'Sơ cấp cứu tại nơi làm việc' },
]

export const getStudents = () => [
    S(1, 'Nguyễn Minh Anh', 'NV0412', 'Vận hành', [1, 2, 3], 0, 'Hôm nay, 14:05'),
    S(2, 'Lê Minh Cường', 'NV0233', 'Vận hành', [1, 2, 3], 0, '05/10/2026'),
    S(3, 'Đỗ Thị Mai', 'NV0518', 'CNTT', [1, 2], 0, 'Chưa truy cập'),
    S(4, 'Vũ Đức Tài', 'NV0377', 'Vận hành', [1, 2, 4], 2, '09/10/2026'),
    S(5, 'Ngô Thanh Tâm', 'NV0291', 'Kế hoạch', [1, 2], 0, 'Hôm qua'),
    S(6, 'Phạm Thu Dung', 'NV0624', 'Vận hành', [1, 3], 0, '08/10/2026'),
    S(7, 'Hoàng Lan Chi', 'NV0455', 'CNTT', [1, 2, 4], 3, '08/10/2026'),
    S(8, 'Phan Thị Hằng', 'NV0188', 'HSE', [1, 4], 2, '06/10/2026'),
    S(9, 'Hoàng Gia Giang', 'NV0702', 'Vận hành', [1], 0, '28/09/2026'),
    S(10, 'Vũ Thanh Hoa', 'NV0349', 'Kế hoạch', [1, 2, 3], 0, 'Hôm nay, 09:20'),
]

export const getStudentDetail = () => ({
    id: 1, name: 'Nguyễn Minh Anh', code: 'NV0412', dept: 'Vận hành', email: 'hv.minhanh@xlearn.dev', last: 'hôm nay, 14:05',
    courses: [
        {
            id: 1, title: 'An toàn lao động tại khu vực sản xuất', kind: 'Bắt buộc', enrolled: '01/10/2026', due: '31/10/2026', dueSoon: true, done: 5, total: 11, exam: null,
            topics: [['Giới thiệu khóa học', 1, 1], ['Quy định chung & nhận diện mối nguy', 3, 3], ['Thiết bị bảo hộ cá nhân', 1, 3], ['Vận hành máy & tình huống khẩn cấp', 0, 3], ['Đánh giá cuối khóa', 0, 1]],
            tests: [{ name: 'Kiểm tra nhanh: Thiết bị bảo hộ', meta: 'Quiz luyện tập · lượt 1/2 · 11/10/2026', score: 56, pass: 80 }],
        },
        {
            id: 2, title: 'Bảo mật thông tin 2026', kind: 'Bắt buộc', enrolled: '02/10/2026', due: '18/10/2026', dueSoon: true, done: 0, total: 5, exam: null,
            topics: [['Nhận diện lừa đảo qua email', 0, 2], ['Mật khẩu & xác thực', 0, 2], ['Kiểm tra cuối', 0, 1]], tests: [],
        },
        {
            id: 3, title: 'Quy trình 5S trong xưởng', kind: 'Tự chọn', enrolled: '15/09/2026', due: '15/12/2026', dueSoon: false, done: 2, total: 6, exam: null,
            topics: [['Sàng lọc & sắp xếp', 2, 2], ['Sạch sẽ & săn sóc', 0, 2], ['Sẵn sàng & đánh giá', 0, 2]], tests: [],
        },
    ],
})

/* Tiện ích định dạng */
export const fmtDate = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}
export const todayVN = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
