// Dữ liệu mẫu, khớp cấu trúc và nội dung với backend/db/02_seed.sql.
// Backend hiện có /auth, /admin/users, /me/courses (Khóa học của tôi, khối "gần đây" ở Dashboard)
// và /me/courses/:id (Trang khóa học); các màn còn lại (giao diện học, giảng viên…) tạm dùng dữ liệu này.
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
//   - Ảnh trong bài đọc: Markdown tham chiếu ![mô tả](file:<storage_object_id>); resolveFileUrl() đổi sang URL.

export const BRAND = { name: 'Học viện XLearn', logo: 'X' }

const clone = (x) => structuredClone(x)

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
 * File trong object storage (storage_objects) — chỉ dùng cho bản mock
 * ------------------------------------------------------------------------ */
const PPE_ZONES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 360" font-family="Segoe UI, sans-serif">
<rect width="800" height="360" fill="#F4F6F8"/>
<text x="24" y="40" font-size="22" font-weight="700" fill="#1D2125">Sơ đồ khu vực xưởng và PPE tại cửa vào</text>
<g font-size="16" fill="#1D2125">
<rect x="24" y="64" width="176" height="160" rx="10" fill="#DCE9F6"/><text x="40" y="96" font-weight="700">Khu dập, ép</text><text x="40" y="124">Mũ · Kính</text><text x="40" y="148">Nút tai · Giày</text>
<rect x="216" y="64" width="176" height="160" rx="10" fill="#FFF1E0"/><text x="232" y="96" font-weight="700">Khu hàn</text><text x="232" y="124">Mặt nạ hàn</text><text x="232" y="148">Găng chịu nhiệt</text>
<rect x="408" y="64" width="176" height="160" rx="10" fill="#FBE3E1"/><text x="424" y="96" font-weight="700">Kho hóa chất</text><text x="424" y="124">Kính · Găng</text><text x="424" y="148">Khẩu trang độc</text>
<rect x="600" y="64" width="176" height="160" rx="10" fill="#DFF0E3"/><text x="616" y="96" font-weight="700">Khu đóng gói</text><text x="616" y="124">Giày · Găng tay</text>
</g>
<g fill="#0F6CBF"><circle cx="112" cy="280" r="26"/><circle cx="304" cy="280" r="26"/><circle cx="496" cy="280" r="26"/><circle cx="688" cy="280" r="26"/></g>
<text x="24" y="340" font-size="14" fill="#3E4A55">Biển tròn nền xanh dương tại cửa: PPE bắt buộc của khu vực.</text>
</svg>`

// id = storage_objects.id trong seed
const FILES = new Map([
    [6, { name: 'so-do-ppe-khu-vuc.png', size: '350 KB', url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PPE_ZONES_SVG)}` }],
    [7, { name: 'bang-tra-ppe.pdf', size: '1,2 MB', url: '#' }],
    [8, { name: 'so-tay-an-toan.pdf', size: '4 MB', url: '#' }],
])
let localFileId = 1_000_000

/** Đổi file:<id> trong Markdown thành URL hiển thị được. API thật sẽ trả URL tạm thời (presigned). */
export function resolveFileUrl(src) {
    const m = /^file:(\d+)$/.exec(src ?? '')
    if (!m) return src
    return FILES.get(Number(m[1]))?.url ?? ''
}

/** Bản mock của upload: giữ file trong trình duyệt (object URL), trả về id giả để chèn vào Markdown. */
export function registerLocalFile(file) {
    const id = ++localFileId
    FILES.set(id, { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, url: URL.createObjectURL(file) })
    return id
}

export const fileInfo = (id) => FILES.get(id)

/* --------------------------------------------------------------------------
 * Khóa học (giảng viên)
 * ------------------------------------------------------------------------ */
const COURSES = [
    { id: 1, code: 'ATLD-01', title: 'An toàn lao động tại khu vực sản xuất', short_description: 'Nội quy an toàn, nhận diện mối nguy và sử dụng đúng thiết bị bảo hộ cá nhân.', description: '', department: 'HSE', is_mandatory: true, is_sequential: true, default_due_at: '2026-10-31', status: 'published', lessons: 9, tests: 2, learners: 10, done: 3, thumbnail_url: null, colors: ['#0F6CBF', '#2A82CF'] },
    { id: 2, code: 'BMTT-2026', title: 'Bảo mật thông tin 2026', short_description: 'Nhận diện email lừa đảo, đặt mật khẩu mạnh và xác thực hai lớp.', description: '', department: 'CNTT', is_mandatory: true, is_sequential: false, default_due_at: '2026-10-18', status: 'published', lessons: 4, tests: 1, learners: 8, done: 2, thumbnail_url: null, colors: ['#5B3FD9', '#7259E0'] },
    { id: 3, code: '5S-01', title: 'Quy trình 5S trong xưởng', short_description: 'Sàng lọc, sắp xếp, sạch sẽ, săn sóc, sẵn sàng tại nơi làm việc.', description: '', department: 'VH', is_mandatory: false, is_sequential: false, default_due_at: '2026-12-15', status: 'published', lessons: 5, tests: 1, learners: 4, done: 0, thumbnail_url: null, colors: ['#00798A', '#19909F'] },
    { id: 4, code: 'SCC-01', title: 'Sơ cấp cứu tại nơi làm việc', short_description: 'Đánh giá hiện trường, hồi sức tim phổi và xử lý vết thương.', description: '', department: 'HSE', is_mandatory: false, is_sequential: false, default_due_at: '2026-11-30', status: 'published', lessons: 3, tests: 1, learners: 3, done: 2, thumbnail_url: null, colors: ['#3F6E2A', '#558541'] },
    { id: 5, code: 'HC-02', title: 'An toàn hóa chất nâng cao', short_description: 'Nhãn GHS, phiếu an toàn hóa chất và lưu trữ đúng cách.', description: '', department: 'HSE', is_mandatory: true, is_sequential: false, default_due_at: '2027-01-15', status: 'draft', lessons: 2, tests: 0, learners: 0, done: 0, thumbnail_url: null, colors: ['#B54A00', '#C9631C'] },
]

export const getTeacherCourses = () => clone(COURSES)
export const getCourse = (id) => clone(COURSES.find((c) => c.id === Number(id)) ?? COURSES[0])

// Dòng thời gian: chỉ lấy từ DB có sẵn — giờ đóng quiz (quizzes.closes_at) và hạn khóa (enrollments.due_at)
export const getTimeline = () => [
    { date: 'Chủ nhật, 18 tháng 10 năm 2026', time: '23:59', kind: 'quiz', title: 'Bài kiểm tra cuối: Bảo mật thông tin đóng', meta: 'Bài kiểm tra tính điểm · Bảo mật thông tin 2026', cta: 'Làm bài kiểm tra', courseId: 2 },
    { date: 'Chủ nhật, 18 tháng 10 năm 2026', time: '23:59', kind: 'due', title: 'Hạn hoàn thành khóa học', meta: 'Bắt buộc · Bảo mật thông tin 2026', cta: 'Vào khóa học', courseId: 2 },
    { date: 'Thứ ba, 20 tháng 10 năm 2026', time: '17:00', kind: 'quiz', title: 'Kiểm tra nhanh: Thiết bị bảo hộ đóng', meta: 'Quiz luyện tập · An toàn lao động tại khu vực sản xuất', cta: 'Làm bài kiểm tra', courseId: 1 },
    { date: 'Thứ bảy, 31 tháng 10 năm 2026', time: '23:59', kind: 'quiz', title: 'Bài kiểm tra cuối khóa đóng', meta: 'Bài kiểm tra tính điểm · An toàn lao động tại khu vực sản xuất', cta: 'Làm bài kiểm tra', courseId: 1 },
]

/* --------------------------------------------------------------------------
 * Nội dung khóa ATLD-01 từ góc nhìn học viên (Nguyễn Minh Anh)
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

const FINAL_QUESTIONS = [
    { t: 'single_choice', p: 1, q: 'Khi phát hiện cháy trong xưởng, việc đầu tiên cần làm là gì?', o: ['Hô hoán và nhấn chuông báo cháy gần nhất', 'Thu dọn đồ cá nhân', 'Tiếp tục công việc đang dở', 'Tự đi tìm nguồn cháy'], c: 0, e: 'Báo động sớm giúp mọi người sơ tán kịp thời và đội ứng phó có mặt nhanh nhất.' },
    { t: 'true_false', p: 1, q: 'Được phép tháo tấm che bảo vệ của máy để thao tác nhanh hơn nếu làm cẩn thận.', o: ['Đúng', 'Sai'], c: 1, e: 'Tấm che bảo vệ là bắt buộc; tháo ra chỉ khi bảo trì và máy đã được khóa, treo thẻ.' },
    { t: 'multiple_choice', p: 2, q: 'Trước khi bảo trì máy, cần thực hiện những bước nào?', o: ['Ngắt nguồn năng lượng của máy', 'Khóa và treo thẻ (LOTO)', 'Kiểm tra máy đã dừng hẳn', 'Để máy chạy để dễ quan sát'], c: [0, 1, 2], e: 'Quy trình LOTO: ngắt năng lượng, khóa và treo thẻ, xác nhận máy đã dừng hẳn.' },
    { t: 'short_text', p: 1, q: 'Khi có lệnh sơ tán, người lao động khu B tập trung ở đâu?', accept: ['Sân trước cổng chính', 'Sân cổng chính'], e: 'Theo quy trình xử lý khẩn cấp, điểm tập kết của khu B là sân trước cổng chính.' },
    { t: 'single_choice', p: 1, q: 'Biển báo hình tam giác, viền đỏ, nền vàng có ý nghĩa gì?', o: ['Cảnh báo nguy hiểm', 'Cấm', 'Bắt buộc', 'Chỉ dẫn'], c: 0, e: 'Biển tam giác viền đỏ nền vàng là biển cảnh báo nguy hiểm.' },
]

const PPE_PAGE = `# Bảng tra PPE theo khu vực

Mỗi khu vực trong xưởng có yêu cầu thiết bị bảo hộ cá nhân (PPE) riêng. Tra bảng dưới đây **trước khi** bước vào một khu vực mới.

![Sơ đồ khu vực và biển báo PPE tại cửa vào](file:6)

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

## Lưu ý theo từng khu vực

### Khu dập, ép

Luôn đeo nút tai trong suốt ca làm việc, kể cả khi máy tạm dừng: tiếng ồn từ các máy bên cạnh vẫn vượt ngưỡng cho phép. Không đứng trong vùng sơn vạch vàng quanh máy khi máy đang chạy.

### Khu hàn

Mặt nạ hàn phải có kính lọc đúng cấp độ cho dòng hàn đang dùng. Người đứng gần khu hàn nhưng không hàn cũng cần kính bảo hộ để tránh tia lửa và bức xạ.

### Kho hóa chất

Đọc phiếu an toàn hóa chất (SDS) dán tại cửa kho trước khi thao tác với hóa chất mới. Găng tay chống hóa chất phải đúng loại vật liệu ghi trong SDS; găng tay vải không thay thế được.

### Khu đóng gói

Giày bảo hộ bắt buộc vì xe nâng hoạt động thường xuyên. Đi đúng lối đi dành cho người, không đi tắt qua làn xe nâng.

Bản in của bảng tra nằm ở mục tài liệu đính kèm bên dưới.`

const EMERGENCY_PAGE = `# Xử lý tình huống khẩn cấp

## Khi phát hiện cháy

1. Hô hoán và nhấn **chuông báo cháy** gần nhất.
2. Ngắt điện khu vực nếu an toàn.
3. Dùng bình chữa cháy khi đám cháy nhỏ; nếu không, sơ tán ngay.

## Khi có lệnh sơ tán

- Đi theo biển chỉ dẫn lối thoát hiểm, **không** dùng thang máy.
- Khu A tập trung ở bãi đỗ xe phía đông; khu B tập trung ở **sân trước cổng chính**.
- Tổ trưởng điểm danh và báo cáo cho đội ứng phó khẩn cấp.`

const INTRO_PAGE = `# Chào mừng đến với khóa An toàn lao động

Khóa học giúp bạn làm việc an toàn tại khu vực sản xuất. Sau khóa học, bạn có thể:

- Nhận diện các nhóm mối nguy thường gặp trong xưởng.
- Chọn và sử dụng đúng thiết bị bảo hộ cá nhân (PPE) cho từng khu vực.
- Xử lý đúng các tình huống khẩn cấp.

## Cách hoàn thành khóa học

1. Học lần lượt các chủ đề. Chủ đề sau chỉ mở khi bạn hoàn thành chủ đề trước.
2. Làm bài kiểm tra nhanh cuối mỗi chủ đề để tự ôn.
3. Đạt **từ 80%** ở bài kiểm tra cuối khóa trước hạn **31/10/2026**.

Sổ tay an toàn của nhà máy ở mục tài liệu đính kèm.`

const ATLD = {
    id: 1,
    title: 'An toàn lao động tại khu vực sản xuất',
    department: 'HSE',
    is_mandatory: true,
    is_sequential: true,
    due: '31/10/2026',
    finalPass: 80,
    sections: [
        {
            title: 'Giới thiệu khóa học', description: 'Mục tiêu khóa học, thông báo từ Phòng HSE và cách hoàn thành khóa.',
            items: [{ t: 'page', name: 'Giới thiệu khóa học', minutes: 5, done: true, content: INTRO_PAGE, files: [8] }],
        },
        {
            title: 'Quy định chung & nhận diện mối nguy', description: 'Nội quy an toàn của xưởng, các nhóm mối nguy thường gặp và biển báo.',
            items: [
                { t: 'video', name: 'Giới thiệu & quy định chung', minutes: 8, done: true, description: 'Nội quy ra vào xưởng và trách nhiệm của người lao động.', files: [] },
                { t: 'video', name: 'Nhận diện mối nguy', minutes: 15, done: true, description: 'Các nhóm mối nguy cơ học, điện, hóa chất, tiếng ồn.', files: [] },
                { t: 'pdf', name: 'Biển báo an toàn', minutes: 10, done: true, pages: 5, url: '/samples/bien-bao-an-toan.pdf', description: 'Tài liệu PDF các nhóm biển báo cấm, cảnh báo, bắt buộc, chỉ dẫn.', files: [] },
            ],
        },
        {
            title: 'Thiết bị bảo hộ cá nhân', description: 'Chọn, kiểm tra và sử dụng đúng PPE cho từng khu vực trong xưởng.',
            items: [
                { t: 'video', name: 'Sử dụng thiết bị bảo hộ cá nhân', minutes: 12, done: false, position: 252, description: 'Video hướng dẫn cách chọn, kiểm tra và đeo đúng thiết bị bảo hộ cá nhân trước khi vào ca làm việc.', files: [] },
                { t: 'page', name: 'Bảng tra PPE theo khu vực', minutes: 5, done: true, content: PPE_PAGE, files: [7] },
                { t: 'quiz', name: 'Kiểm tra nhanh: Thiết bị bảo hộ', minutes: 15, done: false, quiz: { minutes: 15, attempts: 2, pass: 80, is_graded: false, review_policy: 'after_submit', questions: QUIZ_QUESTIONS } },
            ],
        },
        {
            title: 'Vận hành máy & tình huống khẩn cấp', description: 'Quy tắc an toàn khi vận hành máy và các bước xử lý khi có sự cố.',
            items: [
                { t: 'video', name: 'An toàn khi vận hành máy', minutes: 20, done: false, description: 'Tấm che bảo vệ, nút dừng khẩn cấp, khóa và treo thẻ (LOTO).', files: [] },
                { t: 'page', name: 'Xử lý tình huống khẩn cấp', minutes: 10, done: false, content: EMERGENCY_PAGE, files: [] },
                { t: 'video', name: 'Diễn tập sơ tán', minutes: 10, done: false, description: 'Ghi hình buổi diễn tập sơ tán tại khu B.', files: [] },
            ],
        },
        {
            title: 'Đánh giá cuối khóa', description: 'Bài kiểm tra tính điểm, điều kiện hoàn thành khóa học.',
            items: [{ t: 'quiz', name: 'Bài kiểm tra cuối khóa', minutes: 30, done: false, quiz: { minutes: 30, attempts: 1, pass: 80, is_graded: true, review_policy: 'after_close', questions: FINAL_QUESTIONS } }],
        },
    ],
}

export const getLearnCourse = () => clone(ATLD)

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
 * Giảng viên: nội dung khóa học (course_sections → lessons)
 * ------------------------------------------------------------------------ */
const V = (id, title, minutes, description = '') => ({ id, type: 'video', title, minutes, description, content: '', status: 'published', file: `${title}.mp4`, files: [] })
const P = (id, title, minutes, file) => ({ id, type: 'pdf', title, minutes, description: '', content: '', status: 'published', file, files: [] })
const R = (id, title, minutes, content, files = []) => ({ id, type: 'page', title, minutes, description: '', content, status: 'published', file: null, files })
// minutes = time_limit_seconds / 60; attempts: 0 = không giới hạn (DB: NULL)
const T = (id, title, is_graded, q, minutes, attempts, pass) => ({ id, type: 'quiz', title, is_graded, q, minutes, attempts, pass, status: 'published' })

export const getCourseContent = () => [
    { id: 1, title: 'Giới thiệu khóa học', items: [R(11, 'Giới thiệu khóa học', 5, INTRO_PAGE, ['so-tay-an-toan.pdf'])] },
    { id: 2, title: 'Quy định chung & nhận diện mối nguy', items: [V(21, 'Giới thiệu & quy định chung', 8), V(22, 'Nhận diện mối nguy', 15), P(23, 'Biển báo an toàn', 10, 'bien-bao-an-toan.pdf')] },
    { id: 3, title: 'Thiết bị bảo hộ cá nhân', items: [V(31, 'Sử dụng thiết bị bảo hộ cá nhân', 12), R(32, 'Bảng tra PPE theo khu vực', 5, PPE_PAGE, ['bang-tra-ppe.pdf']), T(33, 'Kiểm tra nhanh: Thiết bị bảo hộ', false, 7, 15, 2, 80)] },
    { id: 4, title: 'Vận hành máy & tình huống khẩn cấp', items: [V(41, 'An toàn khi vận hành máy', 20), R(42, 'Xử lý tình huống khẩn cấp', 10, EMERGENCY_PAGE), V(43, 'Diễn tập sơ tán', 10)] },
    { id: 5, title: 'Đánh giá cuối khóa', items: [T(51, 'Bài kiểm tra cuối khóa', true, 5, 30, 1, 80)] },
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
