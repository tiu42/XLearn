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
