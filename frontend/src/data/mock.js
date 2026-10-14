// Dữ liệu mẫu, khớp cấu trúc và nội dung với backend/db/02_seed.sql.
// Backend hiện có /auth, /admin/users, /me/courses (Khóa học của tôi, khối "gần đây" ở Dashboard),
// /me/courses/:id (Trang khóa học), /me/courses/:id/lessons/:lessonId (Giao diện học),
// …/lessons/:lessonId/quiz (Làm bài kiểm tra), /me/timeline (Dòng thời gian ở Dashboard),
// /teach/courses (danh sách + thêm/sửa/xóa khóa học của giảng viên, phần đầu trang quản lý khóa), /departments,
// /teach/courses/:id/content + /uploads (chủ đề, bài học, upload file),
// /teach/courses/:id/stats + /learners (thông số khóa, thêm/xóa học viên), /teach/students (học viên);
// màn còn lại (soạn câu hỏi quiz) tạm dùng dữ liệu này.
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

/* Tiện ích định dạng */
export const fmtDate = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}
