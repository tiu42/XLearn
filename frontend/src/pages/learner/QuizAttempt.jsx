import { useState } from 'react'
import { CloseIcon, TimerIcon } from '../../components/Icons'
import { isAnswered, isMulti, isText, LETTERS, mmss, TYPE_HINT, TYPE_LABEL } from './quiz'

/** Làm bài toàn màn hình: tất cả câu hỏi trên một trang, đồng hồ đếm ngược ở thanh trên. */
export default function QuizAttempt({ title, questions, answers, setAnswers, left, onExit, onSubmit }) {
    const [confirm, setConfirm] = useState(false)
    const answered = questions.filter((q, i) => isAnswered(q, answers[i])).length
    const total = questions.length

    const pick = (i, k, multi) => setAnswers((prev) => {
        const next = { ...prev }
        if (multi) {
            const arr = [...(next[i] ?? [])]
            const p = arr.indexOf(k)
            if (p >= 0) arr.splice(p, 1); else arr.push(k)
            next[i] = arr.sort()
        } else next[i] = k
        return next
    })

    const submitClick = () => (answered < total && !confirm ? setConfirm(true) : onSubmit(false))

    return (
        <div className="focus-page">
            <header className="focus-bar">
                <div className="focus-bar__row">
                    <button type="button" className="btn" onClick={onExit} style={{ minHeight: 44, padding: '0 12px', borderRadius: 8 }}>
                        <CloseIcon />Tạm thoát
                    </button>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span className="focus-bar__title">{title}</span>
                        <span className="small muted">Đã trả lời {answered}/{total} câu</span>
                    </div>
                    <span role="timer" aria-label="Thời gian còn lại" className={`timer${left <= 60 ? ' timer--low' : ''}`}>
                        <TimerIcon />{mmss(left)}
                    </span>
                </div>
                <div className="focus-progress"><div style={{ width: `${Math.round((answered / total) * 100)}%` }} /></div>
            </header>

            <div className="attempt-wrap">
                <main style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {questions.map((q, i) => {
                        const a = answers[i]
                        const has = isAnswered(q, a)
                        const multi = isMulti(q)
                        return (
                            <section key={q.q} id={`q${i + 1}`} aria-labelledby={`qh${i + 1}`} className="q-card">
                                <div className="row-between">
                                    <span className="row" style={{ gap: 10 }}>
                                        <span className="q-num">Câu {i + 1} / {total}</span>
                                        <span className={`q-type${multi ? ' q-type--multi' : ''}`}>
                                            {!isText(q) && <span aria-hidden="true" className={`q-mark q-mark--sm${multi ? ' q-mark--check' : ''}`} />}
                                            {TYPE_LABEL[q.t]}
                                        </span>
                                    </span>
                                    <span className={`pill pill--tag ${has ? 'pill--blue' : 'pill--gray'}`}>{has ? 'Đã trả lời' : 'Chưa trả lời'}</span>
                                </div>
                                {isText(q) ? (
                                    <div className="stack" style={{ gap: 10 }}>
                                        <label id={`qh${i + 1}`} htmlFor={`qi${i + 1}`} className="q-text">{q.q}</label>
                                        <span className="q-hint">{TYPE_HINT[q.t]}</span>
                                        <input id={`qi${i + 1}`} type="text" className="q-input" autoComplete="off" placeholder="Nhập câu trả lời của bạn…"
                                            value={a ?? ''} onChange={(e) => { const v = e.target.value; setAnswers((p) => ({ ...p, [i]: v })) }} />
                                    </div>
                                ) : (
                                    <fieldset>
                                        <legend id={`qh${i + 1}`}>{q.q}</legend>
                                        <span className="q-hint" style={{ marginBottom: 4 }}>
                                            {TYPE_HINT[q.t]}
                                            {multi && <span className="q-count" aria-live="polite"> · Đã chọn {a?.length ?? 0}</span>}
                                        </span>
                                        {q.o.map((text, k) => {
                                            const on = multi ? !!a?.includes(k) : a === k
                                            return (
                                                <label key={k} className={`q-opt${on ? ' is-on' : ''}`}>
                                                    <input type={multi ? 'checkbox' : 'radio'} name={`q${i}`} checked={on} onChange={() => pick(i, k, multi)} />
                                                    <span className={`q-letter${multi ? ' q-letter--sq' : ''}`}>{LETTERS[k]}</span>
                                                    <span style={{ flex: 1, fontSize: 16, lineHeight: 1.5 }}>{text}</span>
                                                    <span aria-hidden="true" className={`q-mark${multi ? ' q-mark--check' : ''}`} />
                                                </label>
                                            )
                                        })}
                                    </fieldset>
                                )}
                            </section>
                        )
                    })}
                </main>

                <aside aria-labelledby="qnavh" className="q-nav">
                    <div className="stack" style={{ gap: 4 }}>
                        <h2 id="qnavh" style={{ fontSize: 16, fontWeight: 700 }}>Danh sách câu hỏi</h2>
                        <span className="small text-2">Đã trả lời {answered}/{total} câu</span>
                    </div>
                    <nav aria-label="Chuyển nhanh tới câu hỏi" className="q-jump">
                        {questions.map((q, i) => {
                            const has = isAnswered(q, answers[i])
                            return (
                                <a key={q.q} href={`#q${i + 1}`} className={has ? 'is-answered' : ''}
                                    aria-label={`Tới câu ${i + 1}, ${has ? 'đã trả lời' : 'chưa trả lời'}`}>{i + 1}</a>
                            )
                        })}
                    </nav>
                    <div className="row" style={{ gap: '8px 16px', fontSize: 12, color: 'var(--text-2)' }}>
                        <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--primary)' }} />Đã trả lời</span>
                        <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ border: '1px solid var(--input-soft)' }} />Chưa trả lời</span>
                    </div>
                    {confirm && (
                        <div role="alertdialog" aria-label="Xác nhận nộp bài" className="confirm-box">
                            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                                Bạn còn {total - answered} câu chưa trả lời. Câu bỏ trống sẽ không được tính điểm.
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className="btn" style={{ flex: 1, minHeight: 40, borderRadius: 8 }} onClick={() => setConfirm(false)}>Làm tiếp</button>
                                <button type="button" className="btn btn--danger" style={{ flex: 1, minHeight: 40, borderRadius: 8, background: '#B54A00' }} onClick={() => onSubmit(false)}>Vẫn nộp</button>
                            </div>
                        </div>
                    )}
                    <button type="button" className="btn btn--primary btn--lg btn--block" onClick={submitClick}>Nộp bài</button>
                </aside>
            </div>
        </div>
    )
}
