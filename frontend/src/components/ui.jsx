import { useEffect } from 'react'

export function ProgressBar({ value, done, size, label }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)))
    return (
        <div className={`progress${size ? ` progress--${size}` : ''}`} role="progressbar"
            aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <div className={`progress__bar${done ? ' progress__bar--done' : ''}`} style={{ width: `${pct}%` }} />
        </div>
    )
}

export const Pill = ({ tone = 'gray', tag, children }) => (
    <span className={`pill pill--${tone}${tag ? ' pill--tag' : ''}`}>{children}</span>
)

export const Stat = ({ label, value, sub, color }) => (
    <div className="stat">
        <span className="stat__label">{label}</span>
        <span className="stat__value" style={color ? { color } : undefined}>{value}</span>
        {sub && <span className="stat__sub">{sub}</span>}
    </div>
)

/** Ảnh bìa khóa học (courses.thumbnail_object_id); chưa có ảnh thì vẽ nền sọc chéo theo màu của khóa. */
export const CoursePattern = ({ colors, thumbnailUrl, height = 100, style }) => (thumbnailUrl
    ? <img src={thumbnailUrl} alt="" loading="lazy" style={{ display: 'block', width: '100%', height, objectFit: 'cover', ...style }} />
    : <div aria-hidden="true" className="pattern"
        style={{ height, backgroundColor: colors[0], '--stripe': colors[1], ...style }} />)

export function Modal({ title, onClose, footer, children, width = 580 }) {
    useEscape(onClose)
    return (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-label={title} className="dialog" style={{ maxWidth: width }}>
                <div className="dialog__head">
                    <h2>{title}</h2>
                    <button type="button" className="dialog__close" onClick={onClose} aria-label="Đóng">×</button>
                </div>
                {children}
                {footer && <div className="dialog__foot">{footer}</div>}
            </div>
        </div>
    )
}

export function ConfirmDialog({ title, text, confirmLabel = 'Xóa', onCancel, onConfirm }) {
    useEscape(onCancel)
    return (
        <div className="overlay" style={{ zIndex: 11 }}>
            <div role="alertdialog" aria-modal="true" aria-label={title} className="dialog dialog--alert">
                <h2 style={{ fontSize: 19, fontWeight: 700 }}>{title}</h2>
                <p>{text}</p>
                <div className="dialog__actions">
                    <button type="button" className="btn" onClick={onCancel}>Hủy</button>
                    <button type="button" className="btn btn--danger" onClick={onConfirm} autoFocus>{confirmLabel}</button>
                </div>
            </div>
        </div>
    )
}

function useEscape(fn) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && fn()
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [fn])
}


export function SearchInput({ id, label, value, onChange, placeholder, className = '' }) {
    return (
        <>
            <label htmlFor={id} className="sr-only">{label}</label>
            <input id={id} type="search" className={`input input--search ${className}`} value={value}
                onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        </>
    )
}

export function SelectFilter({ id, label, value, onChange, options, className = '' }) {
    return (
        <>
            <label htmlFor={id} className="sr-only">{label}</label>
            <select id={id} className={`select select--auto ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
        </>
    )
}

/** Dãy số trang: luôn có trang đầu, trang cuối và ±1 quanh trang hiện tại; chỗ bị lược bỏ hiện "…". */
function pageItems(page, pages) {
    const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
    const out = []
    let prev = 0
    for (const p of [...keep].sort((a, b) => a - b)) {
        if (p - prev === 2) out.push(prev + 1)  // chỉ thiếu đúng 1 trang thì hiện luôn số trang đó
        else if (p - prev > 2) out.push(`gap-${p}`)
        out.push(p)
        prev = p
    }
    return out
}

export function Pagination({ page, pages, onChange, label = 'Phân trang' }) {
    if (pages <= 1) return null
    return (
        <nav aria-label={label} className="pager">
            <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Trước</button>
            {pageItems(page, pages).map((p) => (typeof p === 'number'
                ? <button key={p} type="button" className="btn btn--sm btn--square" aria-current={p === page ? 'page' : undefined}
                    aria-label={`Trang ${p}`} onClick={() => onChange(p)}>{p}</button>
                : <span key={p} className="pager__gap" aria-hidden="true">…</span>))}
            <button type="button" className="btn btn--sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau ›</button>
        </nav>
    )
}
