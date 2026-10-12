// Dữ liệu mẫu lấy từ thiết kế "LMS nội bộ".
// Backend hiện mới có /auth và /admin/users → các màn khóa học/học viên tạm dùng dữ liệu này.
// Khi có API, thay từng hàm get* bằng lời gọi api.get(...) tương ứng.

export const BRAND = { name: 'Học viện XLearn', logo: 'X' }

const clone = (x) => structuredClone(x)

/* --------------------------------------------------------------------------
 * Khóa học (dùng chung cho học viên và giảng viên)
 * ------------------------------------------------------------------------ */
const COURSES = [
    { id: 1, title: 'An toàn lao động tại khu vực sản xuất', dept: 'HSE', kind: 'Bắt buộc', status: 'open', due: '2026-10-31', lessons: 9, tests: 2, learners: 10, done: 3, desc: '', colors: ['#0F6CBF', '#2A82CF'] },
    { id: 2, title: 'Bảo mật thông tin 2026', dept: 'CNTT', kind: 'Bắt buộc', status: 'open', due: '2026-10-18', lessons: 4, tests: 1, learners: 8, done: 2, desc: '', colors: ['#5B3FD9', '#7259E0'] },
    { id: 3, title: 'Quy trình 5S trong xưởng', dept: 'Vận hành', kind: 'Tự chọn', status: 'open', due: '2026-12-15', lessons: 5, tests: 1, learners: 6, done: 1, desc: '', colors: ['#00798A', '#19909F'] },
    { id: 4, title: 'Sơ cấp cứu tại nơi làm việc', dept: 'HSE', kind: 'Tự chọn', status: 'open', due: '2026-11-30', lessons: 6, tests: 1, learners: 5, done: 4, desc: '', colors: ['#3F6E2A', '#558541'] },
    { id: 5, title: 'An toàn hóa chất nâng cao', dept: 'HSE', kind: 'Bắt buộc', status: 'draft', due: '2027-01-15', lessons: 2, tests: 0, learners: 0, done: 0, desc: '', colors: ['#B54A00', '#C9631C'] },
]

export const getTeacherCourses = () => clone(COURSES)
export const getCourse = (id) => clone(COURSES.find((c) => c.id === Number(id)) ?? COURSES[0])

/* Khóa học của học viên đang đăng nhập */
const MY_COURSES = [
    { id: 1, name: 'An toàn lao động tại khu vực sản xuất', cat: 'HSE · Bắt buộc', pct: 57, st: 'progress', star: true, colors: ['#0F6CBF', '#2A82CF'] },
    { id: 2, name: 'Bảo mật thông tin 2026', cat: 'CNTT · Bắt buộc', pct: 0, st: 'progress', star: false, colors: ['#5B3FD9', '#7259E0'] },
    { id: 3, name: 'Quy trình 5S trong xưởng', cat: 'Vận hành', pct: 30, st: 'progress', star: true, colors: ['#00798A', '#19909F'] },
    { id: 8, name: 'Excel cho phân tích dữ liệu vận hành', cat: 'Kế hoạch', pct: 12, st: 'progress', star: false, colors: ['#B54A00', '#C9631C'] },
    { id: 7, name: 'Kỹ năng phản hồi 1-1 hiệu quả', cat: 'Nhân sự · Lớp trực tiếp', pct: 0, st: 'future', start: '05/11/2026', star: false, colors: ['#C2185B', '#D33A73'] },
    { id: 6, name: 'Hội nhập nhân viên mới', cat: 'Nhân sự · Bắt buộc', pct: 100, st: 'past', star: false, colors: ['#3F6E2A', '#558541'] },
]

export const getMyCourses = () => clone(MY_COURSES)

export const getTimeline = () => [
    { date: 'Chủ nhật, 18 tháng 10 năm 2026', time: '23:59', icon: 'quiz', title: 'Bài kiểm tra cuối khóa đến hạn', meta: 'Bài kiểm tra · Bảo mật thông tin 2026', cta: 'Làm bài kiểm tra', courseId: 2 },
    { date: 'Thứ ba, 20 tháng 10 năm 2026', time: '17:00', icon: 'upload', title: 'Nộp checklist kiểm tra đầu ca đến hạn', meta: 'Bài tập · Quy trình 5S trong xưởng', cta: 'Nộp bài', courseId: 3 },
    { date: 'Thứ bảy, 31 tháng 10 năm 2026', time: '23:59', icon: 'quiz', title: 'Đánh giá cuối khóa đến hạn', meta: 'Bài kiểm tra · An toàn lao động tại khu vực sản xuất', cta: 'Làm bài kiểm tra', courseId: 1 },
]

/* --------------------------------------------------------------------------
 * Trang khóa học (học viên)
 * ------------------------------------------------------------------------ */
export const getCourseOutline = () => ({
    id: 1,
    cat: 'HSE · Đào tạo bắt buộc',
    title: 'An toàn lao động tại khu vực sản xuất',
    progress: 42, doneActivities: 5, totalActivities: 12, doneTopics: 2, totalTopics: 5,
    due: '31/10/2026', certificate: 'Cần đạt 8/10',
    topics: [
        { title: 'Giới thiệu khóa học', summary: 'Mục tiêu khóa học, thông báo từ Phòng HSE và cách nhận chứng chỉ.', done: 1, total: 1 },
        { title: 'Quy định chung & nhận diện mối nguy', summary: 'Nội quy an toàn của xưởng, các nhóm mối nguy thường gặp và biển báo.', done: 3, total: 3 },
        { title: 'Thiết bị bảo hộ cá nhân', summary: 'Chọn, kiểm tra và sử dụng đúng PPE cho từng khu vực trong xưởng.', done: 1, total: 4 },
        { title: 'Vận hành máy & tình huống khẩn cấp', summary: 'Quy tắc an toàn khi vận hành máy và các bước xử lý khi có sự cố.', done: 0, total: 2, locked: true, unlockHint: 'Mở khi hoàn thành Chủ đề 2' },
        { title: 'Đánh giá cuối khóa', summary: 'Bài kiểm tra 10 câu và buổi diễn tập sơ tán tại khu B.', done: 0, total: 2 },
    ],
})

/* --------------------------------------------------------------------------
 * Giao diện học: một chủ đề với video / bài đọc / bài kiểm tra / diễn đàn
 * ------------------------------------------------------------------------ */
export const getLearnTopic = () => ({
    courseId: 1,
    courseTitle: 'An toàn lao động tại khu vực sản xuất',
    label: 'Chủ đề 2',
    title: 'Thiết bị bảo hộ cá nhân',
    next: 'Chủ đề 3: Vận hành máy',
    quiz: { minutes: 15, attempts: 2, pass: 80 },
    items: [
        { t: 'video', name: 'Sử dụng thiết bị bảo hộ cá nhân', meta: 'Video · 12 phút' },
        { t: 'page', name: 'Bảng tra PPE theo khu vực', meta: 'Bài đọc · 5 phút' },
        { t: 'quiz', name: 'Kiểm tra nhanh: Thiết bị bảo hộ' },
        { t: 'forum', name: 'Hỏi đáp về PPE', meta: 'Diễn đàn · 3 chủ đề' },
    ],
    ppeTable: [
        ['Khu dập, ép', 'Mũ bảo hộ, kính, nút tai, giày bảo hộ'],
        ['Khu hàn', 'Mặt nạ hàn, găng chịu nhiệt, áo chống cháy'],
        ['Kho hóa chất', 'Kính, găng tay chống hóa chất, khẩu trang phòng độc'],
        ['Khu đóng gói', 'Giày bảo hộ, găng tay'],
    ],
    forum: [
        { title: 'Khu đóng gói có bắt buộc đeo nút tai không?', by: 'Lê Hoàng · 2 ngày trước', replies: 3 },
        { title: 'Đổi găng tay bị rách ở đâu?', by: 'Vũ Tài · 4 ngày trước', replies: 1 },
        { title: 'Kính bảo hộ cho người đeo kính cận', by: 'Ngô Tâm · 1 tuần trước', replies: 5 },
    ],
})

// t: single | multi | text. c: chỉ số đáp án đúng (multi: mảng). accept: đáp án tự luận chấp nhận.
export const QUIZ_QUESTIONS = [
    { t: 'single', q: 'Khi vào khu dập, ép, bạn bắt buộc phải mang PPE nào?', o: ['Mũ bảo hộ, kính, nút tai, giày bảo hộ', 'Chỉ cần găng tay', 'Khẩu trang phòng độc', 'Áo chống cháy'], c: 0, e: 'Khu dập, ép có nguy cơ vật văng, tiếng ồn lớn và vật nặng rơi, nên cần đủ mũ, kính, nút tai và giày bảo hộ.' },
    { t: 'multi', q: 'Những PPE nào bắt buộc ở khu hàn?', o: ['Mặt nạ hàn', 'Găng tay chịu nhiệt', 'Nút tai', 'Áo chống cháy'], c: [0, 1, 3], e: 'Khu hàn yêu cầu mặt nạ hàn, găng tay chịu nhiệt và áo chống cháy. Nút tai là yêu cầu của khu dập, ép.' },
    { t: 'single', q: 'Biển báo hình tròn, nền xanh dương, hình vẽ màu trắng có ý nghĩa gì?', o: ['Cấm', 'Cảnh báo nguy hiểm', 'Bắt buộc', 'Lối thoát hiểm'], c: 2, e: 'Biển tròn nền xanh dương là biển bắt buộc, ví dụ bắt buộc đội mũ hoặc đeo kính.' },
    { t: 'text', q: 'Găng tay chống hóa chất bắt buộc ở khu vực nào trong xưởng?', accept: ['Kho hóa chất', 'Khu hóa chất', 'Kho chứa hóa chất'], e: 'Theo bảng tra PPE, kho hóa chất yêu cầu kính, găng tay chống hóa chất và khẩu trang phòng độc.' },
    { t: 'multi', q: 'Trước ca làm, bạn phát hiện kính bảo hộ bị nứt. Bạn cần làm gì?', o: ['Ngừng sử dụng kính bị nứt', 'Báo qua phiếu yêu cầu', 'Dán băng keo rồi dùng tiếp', 'Nhận kính mới trước khi vào ca'], c: [0, 1, 3], e: 'Kính nứt không còn bảo vệ đúng tiêu chuẩn: ngừng dùng, báo qua phiếu yêu cầu và nhận kính mới trước khi vào ca.' },
    { t: 'single', q: 'Ai chịu trách nhiệm kiểm tra PPE của bản thân trước mỗi ca?', o: ['Trưởng ca', 'Phòng HSE', 'Chính người lao động', 'Bảo vệ'], c: 2, e: 'Mỗi người tự kiểm tra PPE của mình trước ca; trưởng ca và HSE giám sát, hỗ trợ.' },
    { t: 'text', q: 'Thiết bị bảo hộ bị hỏng được báo cáo qua kênh nào?', accept: ['Phiếu yêu cầu', 'Phiếu yêu cầu thiết bị'], e: 'Mọi thiết bị hỏng được báo qua phiếu yêu cầu để HSE ghi nhận và cấp mới.' },
]

/* --------------------------------------------------------------------------
 * Giảng viên: thông số khóa học
 * ------------------------------------------------------------------------ */
const L = (id, name, code, dept, done, exam, enrolled = '01/10/2026') => ({ id, name, code, dept, done, exam, enrolled })

export const getCourseStats = () => ({
    items: [
        { t: 'Bài đọc', n: 'Giới thiệu khóa học' }, { t: 'Video', n: 'Giới thiệu & quy định chung' }, { t: 'Video', n: 'Nhận diện mối nguy' },
        { t: 'Bài đọc', n: 'Biển báo an toàn' }, { t: 'Video', n: 'Sử dụng thiết bị bảo hộ cá nhân' }, { t: 'Bài đọc', n: 'Bảng tra PPE theo khu vực' },
        { t: 'Kiểm tra', n: 'Kiểm tra nhanh: Thiết bị bảo hộ' }, { t: 'Video', n: 'An toàn khi vận hành máy' }, { t: 'Bài đọc', n: 'Xử lý tình huống khẩn cấp' },
        { t: 'Video', n: 'Diễn tập sơ tán' }, { t: 'Kiểm tra', n: 'Bài kiểm tra cuối khóa' },
    ],
    people: [
        L(1, 'Nguyễn Minh Anh', 'NV0412', 'Vận hành', 5, null), L(2, 'Lê Văn Hoàng', 'NV0233', 'Vận hành', 2, null),
        L(3, 'Đỗ Thị Mai', 'NV0518', 'CNTT', 0, null, '05/10/2026'), L(4, 'Vũ Đức Tài', 'NV0377', 'Vận hành', 11, 85),
        L(5, 'Ngô Thanh Tâm', 'NV0291', 'Kế hoạch', 8, null), L(6, 'Bùi Quang Huy', 'NV0624', 'Vận hành', 3, null),
        L(7, 'Hoàng Lan Chi', 'NV0455', 'CNTT', 11, 90), L(8, 'Phan Thị Hằng', 'NV0188', 'HSE', 11, 95),
        L(9, 'Trịnh Văn Nam', 'NV0702', 'Vận hành', 0, null, '08/10/2026'), L(10, 'Đặng Ngọc Lan', 'NV0349', 'Kế hoạch', 6, null),
    ],
    pool: [
        { id: 21, name: 'Phạm Văn Đức', code: 'NV0815', dept: 'Vận hành' }, { id: 22, name: 'Lý Thu Trang', code: 'NV0820', dept: 'Vận hành' },
        { id: 23, name: 'Cao Minh Khôi', code: 'NV0533', dept: 'CNTT' }, { id: 24, name: 'Mai Anh Thư', code: 'NV0144', dept: 'Nhân sự' },
        { id: 25, name: 'Tạ Quang Vinh', code: 'NV0761', dept: 'Vận hành' }, { id: 26, name: 'Hồ Bảo Ngọc', code: 'NV0398', dept: 'Kế hoạch' },
        { id: 27, name: 'Đinh Công Sơn', code: 'NV0207', dept: 'HSE' },
    ],
})

export const DEPTS = ['Vận hành', 'CNTT', 'Kế hoạch', 'HSE', 'Nhân sự']

/* --------------------------------------------------------------------------
 * Giảng viên: nội dung khóa học
 * ------------------------------------------------------------------------ */
const V = (id, title, dur) => ({ id, type: 'video', title, dur, url: '', body: '' })
const R = (id, title) => ({ id, type: 'page', title, dur: 0, url: '', body: '' })
const T = (id, title, kind, q, time, tries, pass) => ({ id, type: 'test', title, kind, q, time, tries, pass })

export const getCourseContent = () => [
    { id: 1, title: 'Giới thiệu khóa học', items: [R(11, 'Giới thiệu khóa học')] },
    { id: 2, title: 'Quy định chung & nhận diện mối nguy', items: [V(21, 'Giới thiệu & quy định chung', 8), V(22, 'Nhận diện mối nguy', 15), R(23, 'Biển báo an toàn')] },
    { id: 3, title: 'Thiết bị bảo hộ cá nhân', items: [V(31, 'Sử dụng thiết bị bảo hộ cá nhân', 12), R(32, 'Bảng tra PPE theo khu vực'), T(33, 'Kiểm tra nhanh: Thiết bị bảo hộ', 'quiz', 7, 15, 2, 80)] },
    { id: 4, title: 'Vận hành máy & tình huống khẩn cấp', items: [V(41, 'An toàn khi vận hành máy', 20), R(42, 'Xử lý tình huống khẩn cấp'), V(43, 'Diễn tập sơ tán', 10)] },
    { id: 5, title: 'Đánh giá cuối khóa', items: [T(51, 'Bài kiểm tra cuối khóa', 'exam', 20, 30, 1, 80)] },
]

/* --------------------------------------------------------------------------
 * Giảng viên: soạn bài kiểm tra (c luôn là mảng)
 * ------------------------------------------------------------------------ */
export const getQuizDraft = () => ({
    title: 'Kiểm tra nhanh: Thiết bị bảo hộ',
    kind: 'quiz',
    settings: { time: 15, tries: 2, pass: 80, open: '2026-10-12T08:00', close: '2026-10-20T17:00', reveal: 'Ngay sau khi nộp bài', shuffle: true },
    questions: QUIZ_QUESTIONS.map((q, i) => ({
        id: i + 1, t: q.t, pts: 1, q: q.q, e: q.e,
        ...(q.t === 'text' ? { accept: [...q.accept] } : { o: [...q.o], c: Array.isArray(q.c) ? [...q.c] : [q.c] }),
    })),
})

/* --------------------------------------------------------------------------
 * Giảng viên: học viên
 * ------------------------------------------------------------------------ */
const S = (id, name, code, dept, courses, done, last) => ({ id, name, code, dept, courses, done, last })

export const CATALOG = [
    { id: 1, t: 'An toàn lao động tại khu vực sản xuất' }, { id: 2, t: 'Bảo mật thông tin 2026' },
    { id: 3, t: 'Quy trình 5S trong xưởng' }, { id: 4, t: 'Sơ cấp cứu tại nơi làm việc' }, { id: 6, t: 'Hội nhập nhân viên mới' },
    { id: 7, t: 'Kỹ năng phản hồi 1-1 hiệu quả' }, { id: 8, t: 'Excel cho phân tích dữ liệu vận hành' },
]

export const getStudents = () => [
    S(1, 'Nguyễn Minh Anh', 'NV0412', 'Vận hành', [1, 2, 3, 6], 1, 'Hôm nay, 14:05'),
    S(2, 'Lê Văn Hoàng', 'NV0233', 'Vận hành', [1, 3], 0, '05/10/2026'),
    S(3, 'Đỗ Thị Mai', 'NV0518', 'CNTT', [1, 2], 0, 'Chưa truy cập'),
    S(4, 'Vũ Đức Tài', 'NV0377', 'Vận hành', [1, 2, 4], 2, '09/10/2026'),
    S(5, 'Ngô Thanh Tâm', 'NV0291', 'Kế hoạch', [1, 2], 0, 'Hôm qua'),
    S(6, 'Bùi Quang Huy', 'NV0624', 'Vận hành', [1, 3], 0, '08/10/2026'),
    S(7, 'Hoàng Lan Chi', 'NV0455', 'CNTT', [1, 2, 4], 3, '07/10/2026'),
    S(8, 'Phan Thị Hằng', 'NV0188', 'HSE', [1, 4], 2, '03/10/2026'),
    S(9, 'Trịnh Văn Nam', 'NV0702', 'Vận hành', [1], 0, 'Chưa truy cập'),
    S(10, 'Đặng Ngọc Lan', 'NV0349', 'Kế hoạch', [1, 2, 3], 1, 'Hôm nay, 09:20'),
    S(21, 'Phạm Văn Đức', 'NV0815', 'Vận hành', [3, 4], 1, '02/10/2026'),
    S(24, 'Mai Anh Thư', 'NV0144', 'Nhân sự', [], 0, 'Chưa truy cập'),
]

export const getStudentDetail = () => ({
    id: 1, name: 'Nguyễn Minh Anh', code: 'NV0412', dept: 'Vận hành', email: 'nv0412@xlearn.dev', last: 'hôm nay, 14:05',
    courses: [
        {
            id: 1, title: 'An toàn lao động tại khu vực sản xuất', kind: 'Bắt buộc', enrolled: '01/10/2026', due: '31/10/2026', dueSoon: true, done: 5, total: 11, exam: null,
            topics: [['Giới thiệu khóa học', 1, 1], ['Quy định chung & nhận diện mối nguy', 3, 3], ['Thiết bị bảo hộ cá nhân', 1, 3], ['Vận hành máy & tình huống khẩn cấp', 0, 3], ['Đánh giá cuối khóa', 0, 1]],
            tests: [{ name: 'Kiểm tra nhanh: Thiết bị bảo hộ', meta: 'Quiz luyện tập · lượt 1/2 · 11/10/2026', score: 60, pass: 80 }],
        },
        {
            id: 2, title: 'Bảo mật thông tin 2026', kind: 'Bắt buộc', enrolled: '02/10/2026', due: '18/10/2026', dueSoon: true, done: 0, total: 5, exam: null,
            topics: [['Nhận diện lừa đảo qua email', 0, 2], ['Mật khẩu & xác thực', 0, 2], ['Kiểm tra cuối', 0, 1]], tests: [],
        },
        {
            id: 3, title: 'Quy trình 5S trong xưởng', kind: 'Tự chọn', enrolled: '15/09/2026', due: '15/12/2026', dueSoon: false, done: 2, total: 6, exam: null,
            topics: [['Sàng lọc & sắp xếp', 2, 2], ['Sạch sẽ & săn sóc', 0, 2], ['Sẵn sàng & đánh giá', 0, 2]], tests: [],
        },
        {
            id: 6, title: 'Hội nhập nhân viên mới', kind: 'Bắt buộc', enrolled: '01/03/2026', due: '31/03/2026', dueSoon: false, done: 8, total: 8, exam: 90, completedOn: '12/03/2026',
            topics: [['Giới thiệu công ty', 3, 3], ['Quy định nội bộ', 3, 3], ['Kiểm tra cuối', 2, 2]],
            tests: [{ name: 'Kiểm tra hội nhập', meta: 'Tính điểm · lượt 1/1 · 12/03/2026', score: 90, pass: 70 }],
        },
    ],
})

/* Tiện ích định dạng */
export const fmtDate = (iso) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}
export const todayVN = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
