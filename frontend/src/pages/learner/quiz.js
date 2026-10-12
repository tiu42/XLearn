// Chấm điểm phía client cho bản giao diện; khi có API, việc chấm sẽ do backend làm.
// Kiểu câu dùng đúng tên quiz_questions.question_type trong DB.

/** Bỏ dấu, chữ thường, gộp khoảng trắng — so khớp câu tự luận ngắn. */
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim()

export const isMulti = (q) => q.t === 'multiple_choice'
export const isText = (q) => q.t === 'short_text'

export function isAnswered(q, a) {
    if (isMulti(q)) return !!a?.length
    if (isText(q)) return norm(a) !== ''
    return a !== undefined
}

export function isRight(q, a) {
    if (isMulti(q)) return !!a && a.length === q.c.length && q.c.every((k) => a.includes(k))
    if (isText(q)) return norm(a) !== '' && q.accept.some((x) => norm(x) === norm(a))
    return a === q.c // single_choice, true_false
}

/** Điểm theo quiz_questions.points; câu nhiều đáp án chỉ được điểm khi chọn đủ và đúng. */
export function grade(questions, answers) {
    const max = questions.reduce((s, q) => s + (q.p ?? 1), 0)
    const score = questions.reduce((s, q, i) => s + (isRight(q, answers[i]) ? (q.p ?? 1) : 0), 0)
    const correct = questions.filter((q, i) => isRight(q, answers[i])).length
    return { score, max, correct, pct: max ? Math.round((score / max) * 100) : 0 }
}

export const TYPE_LABEL = { single_choice: 'Một đáp án', multiple_choice: 'Nhiều đáp án', true_false: 'Đúng / Sai', short_text: 'Tự luận ngắn' }
export const TYPE_HINT = {
    single_choice: 'Chọn một đáp án.',
    multiple_choice: 'Chọn tất cả đáp án đúng. Chỉ được điểm khi chọn đủ và đúng.',
    true_false: 'Chọn Đúng hoặc Sai.',
    short_text: 'Nhập câu trả lời ngắn. Hệ thống tự chấm, không phân biệt chữ hoa và dấu.',
}

export const mmss = (s) => {
    s = Math.max(0, s)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const duration = (s) => `${Math.floor(s / 60) ? `${Math.floor(s / 60)} phút ` : ''}${s % 60} giây`
export const LETTERS = 'ABCDEF'
