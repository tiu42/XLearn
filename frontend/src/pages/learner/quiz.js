// Chấm điểm phía client cho bản giao diện; khi có API, việc chấm sẽ do backend làm.

/** Bỏ dấu, chữ thường, gộp khoảng trắng — so khớp câu tự luận ngắn. */
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim()

export function isAnswered(q, a) {
    if (q.t === 'multi') return !!a?.length
    if (q.t === 'text') return norm(a) !== ''
    return a !== undefined
}

export function isRight(q, a) {
    if (q.t === 'multi') return !!a && a.length === q.c.length && q.c.every((k) => a.includes(k))
    if (q.t === 'text') return norm(a) !== '' && q.accept.some((x) => norm(x) === norm(a))
    return a === q.c
}

export const TYPE_LABEL = { single: 'Một đáp án', multi: 'Nhiều đáp án', text: 'Tự luận ngắn' }
export const TYPE_HINT = {
    single: 'Chọn một đáp án.',
    multi: 'Chọn tất cả đáp án đúng. Chỉ được điểm khi chọn đủ và đúng.',
    text: 'Nhập câu trả lời ngắn. Hệ thống tự chấm, không phân biệt chữ hoa và dấu.',
}

export const mmss = (s) => {
    s = Math.max(0, s)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const duration = (s) => `${Math.floor(s / 60) ? `${Math.floor(s / 60)} phút ` : ''}${s % 60} giây`
export const LETTERS = 'ABCDEF'
