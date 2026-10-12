import { useState } from 'react'
import { ChevronLeft } from '../../components/Icons'
import { duration, isAnswered, isRight, LETTERS, TYPE_LABEL } from './quiz'

/** Kết quả lần làm gần nhất + xem lại đáp án (lọc câu sai). */
export default function QuizResult({ title, questions, attempt, attemptNo, allowed, pass, triesLeft, onRetry, onNext, onExit }) {
    const [filter, setFilter] = useState('all')
    const total = questions.length
    const pct = Math.round((attempt.score / total) * 100)
    const passed = attempt.ok
    const wrongIdx = questions.map((q, i) => (isRight(q, attempt.ans[i]) ? -1 : i)).filter((i) => i >= 0)
    const shown = filter === 'wrong' ? wrongIdx : questions.map((_, i) => i)
    const triesShort = allowed === 0 ? 'không giới hạn lượt' : `còn ${triesLeft} lượt`

    return (
        <div className="focus-page">
            <header className="focus-bar">
                <div className="focus-bar__row">
                    <button type="button" className="btn" onClick={onExit} style={{ minHeight: 44, padding: '0 12px', borderRadius: 8 }}>
                        <ChevronLeft />Quay lại bài học
                    </button>
                    <span className="focus-bar__title">Kết quả · {title}</span>
                </div>
            </header>

            <main style={{ flex: 1, width: '100%', maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                <section aria-labelledby="res" className={`result-box${passed ? ' result-box--pass' : ''}`}>
                    <div className="row" style={{ gap: 20 }}>
                        <span aria-hidden="true" className="result-icon">{passed ? '✓' : '!'}</span>
                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <h1 id="res" style={{ fontSize: 24, fontWeight: 800 }}>{passed ? 'Chúc mừng, bạn đã đạt!' : 'Bạn chưa đạt lần này'}</h1>
                            <span className="text-2" style={{ fontSize: 15, lineHeight: 1.5 }}>
                                {attempt.timeout && 'Hết giờ, bài làm đã được tự động nộp. '}
                                {passed ? 'Bài kiểm tra đã được tự động đánh dấu hoàn thành.' : 'Xem lại các câu sai bên dưới và ôn lại bài học trước khi làm lại.'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                            <span className="small muted">Điểm đạt: {pass}%</span>
                        </div>
                    </div>
                    <div className="result-facts">
                        <div><span className="small muted">Câu đúng</span><span style={{ fontSize: 18, fontWeight: 700 }}>{attempt.score}/{total}</span></div>
                        <div><span className="small muted">Thời gian làm</span><span style={{ fontSize: 18, fontWeight: 700 }}>{duration(attempt.used)}</span></div>
                        <div><span className="small muted">Lượt làm</span><span style={{ fontSize: 18, fontWeight: 700 }}>Lần {attemptNo}{allowed === 0 ? '' : `/${allowed}`}</span></div>
                    </div>
                    <div className="row" style={{ gap: 12 }}>
                        {passed && <button type="button" className="btn btn--primary btn--lg" style={{ fontSize: 15 }} onClick={onNext}>Bài tiếp theo</button>}
                        {triesLeft > 0 && (
                            <button type="button" className={`btn btn--lg${passed ? '' : ' btn--primary'}`} style={{ fontSize: 15, padding: '0 22px' }} onClick={onRetry}>
                                Làm lại · {triesShort}
                            </button>
                        )}
                        {!passed && triesLeft <= 0 && (
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger-dark)', alignSelf: 'center' }}>
                                Đã hết lượt làm bài. Liên hệ giảng viên để được mở thêm lượt.
                            </span>
                        )}
                        <button type="button" className="btn" style={{ minHeight: 48, padding: '0 20px', fontSize: 15, borderRadius: 8 }} onClick={onExit}>Xem lại bài học</button>
                    </div>
                </section>

                <section aria-labelledby="rv" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="row-between">
                        <h2 id="rv" style={{ fontSize: 19, fontWeight: 700 }}>Xem lại đáp án</h2>
                        <div role="group" aria-label="Lọc câu hỏi" className="seg">
                            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({total})</button>
                            <button type="button" aria-pressed={filter === 'wrong'} onClick={() => setFilter('wrong')}>Câu sai ({wrongIdx.length})</button>
                        </div>
                    </div>
                    {filter === 'wrong' && wrongIdx.length === 0 && (
                        <div style={{ padding: 20, borderRadius: 12, background: '#fff', textAlign: 'center' }} className="text-2">Không có câu sai nào.</div>
                    )}
                    {shown.map((i) => <ReviewCard key={i} q={questions[i]} num={i + 1} mine={attempt.ans[i]} />)}
                </section>
            </main>
        </div>
    )
}

function ReviewCard({ q, num, mine }) {
    const ok = isRight(q, mine)
    const has = isAnswered(q, mine)
    const multi = q.t === 'multi'
    return (
        <article className="review-card">
            <div className="row-between">
                <span className="small strong muted">Câu {num} · {TYPE_LABEL[q.t]}</span>
                <span className={`pill ${ok ? 'pill--success' : 'pill--red'}`} style={{ padding: '4px 10px' }}>{ok ? 'Đúng' : !has ? 'Bỏ trống' : 'Sai'}</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5 }}>{q.q}</h3>
            {q.t === 'text' ? (
                <div className="stack" style={{ gap: 8 }}>
                    <div className="answer-box" style={ok
                        ? { border: '2px solid var(--success)', background: 'var(--success-bg)', color: 'var(--success-pill)' }
                        : { border: '2px solid var(--danger)', background: 'var(--danger-bg)', color: 'var(--danger-dark)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Câu trả lời của bạn</span>
                        <span style={{ fontSize: 15, color: 'var(--text)' }}>{has ? mine : '(Bỏ trống)'}</span>
                    </div>
                    <div className="answer-box" style={{ border: '1px solid var(--success-border)', background: 'var(--success-bg)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success-pill)' }}>Đáp án chấp nhận</span>
                        <span style={{ fontSize: 15 }}>{q.accept.join(' / ')}</span>
                    </div>
                </div>
            ) : (
                <div className="stack" style={{ gap: 8 }}>
                    {q.o.map((text, k) => {
                        const right = multi ? q.c.includes(k) : k === q.c
                        const chosen = multi ? !!mine?.includes(k) : k === mine
                        const chosenWrong = chosen && !right
                        const missed = multi && right && !chosen
                        const tag = chosenWrong ? 'Bạn chọn · Sai' : chosen ? 'Bạn chọn · Đúng' : missed ? 'Đáp án đúng · bạn bỏ sót' : 'Đáp án đúng'
                        return (
                            <div key={k} className={`review-opt${right ? ' review-opt--right' : chosenWrong ? ' review-opt--wrong' : ''}`}>
                                <span className={`q-letter${multi ? ' q-letter--sq' : ''}`}>{LETTERS[k]}</span>
                                <span style={{ flex: 1, fontSize: 15, lineHeight: 1.5 }}>{text}</span>
                                {(right || chosenWrong) && (
                                    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: right ? 'var(--success-pill)' : 'var(--danger-dark)' }}>{tag}</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
            <div className="explain"><span style={{ fontWeight: 700, flex: 'none' }}>Giải thích:</span><span>{q.e}</span></div>
        </article>
    )
}
