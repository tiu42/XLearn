// Tiện ích hiển thị bài kiểm tra. Chấm điểm do backend làm (backend/app/quiz.py).
// Kiểu câu dùng đúng tên quiz_questions.question_type trong DB.

export const isMulti = (q) => q.question_type === 'multiple_choice'
export const isText = (q) => q.question_type === 'short_text'

/** a: mảng id phương án (trắc nghiệm) hoặc chuỗi (tự luận ngắn). */
export function isAnswered(q, a) {
    if (isText(q)) return String(a ?? '').trim() !== ''
    return Array.isArray(a) && a.length > 0
}

export const TYPE_LABEL = { single_choice: 'Một đáp án', multiple_choice: 'Nhiều đáp án', true_false: 'Đúng / Sai', short_text: 'Tự luận ngắn' }
export const TYPE_HINT = {
    single_choice: 'Chọn một đáp án.',
    multiple_choice: 'Chọn tất cả đáp án đúng. Chỉ được điểm khi chọn đủ và đúng.',
    true_false: 'Chọn Đúng hoặc Sai.',
    short_text: 'Nhập câu trả lời ngắn. Hệ thống tự chấm, không phân biệt chữ hoa và dấu.',
}

export const mmss = (s) => {
    s = Math.max(0, Math.floor(s))
    const h = Math.floor(s / 3600)
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
    const sec = String(s % 60).padStart(2, '0')
    return h ? `${h}:${m}:${sec}` : `${m}:${sec}`
}
export const duration = (s) => `${Math.floor(s / 60) ? `${Math.floor(s / 60)} phút ` : ''}${s % 60} giây`
export const LETTERS = 'ABCDEFGHIJ'
export const fmtScore = (n) => `${Math.round(n * 100) / 100}`

const DATE_TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
/** Thời điểm UTC từ API → "17:00 20/10/2026" (giờ Việt Nam). */
export const fmtDateTime = (iso) => (iso ? DATE_TIME.format(new Date(iso)) : '')
