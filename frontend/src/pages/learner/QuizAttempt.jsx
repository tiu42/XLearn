import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../api'
import { CloseIcon, TimerIcon } from '../../components/Icons'
import { isAnswered, isMulti, isText, LETTERS, mmss, TYPE_HINT, TYPE_LABEL } from './quiz'
import { fromApiAnswers, useSaveAnswers, useStartAttempt, useSubmitAttempt } from './quizApi'

// Lưu tạm bài làm sau khi ngừng thao tác chừng này mili giây
const AUTOSAVE_DELAY = 1500

/**
 * Làm bài toàn màn hình: bắt đầu lượt mới hoặc làm tiếp lượt dở (backend tự chọn), tất cả câu hỏi
 * trên một trang, đồng hồ đếm ngược theo hạn nộp của backend. Bài làm được lưu tạm liên tục nên
 * "Tạm thoát" / tải lại trang / mất mạng đều làm tiếp được; hết giờ thì tự nộp.
 */
export default function QuizAttempt({ courseId, lessonId, title, onExit, onSubmitted }) {
    const { mutate, data: attempt, error } = useStartAttempt(courseId, lessonId)
    const started = useRef(false)
    useEffect(() => {
        if (started.current) return
        started.current = true
        mutate()
    }, [mutate])

    if (error) {
        return (
            <div className="focus-page">
                <div className="center-state stack" style={{ gap: 16, alignItems: 'center' }}>
                    <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không bắt đầu được bài kiểm tra.')}</div>
                    <button type="button" className="btn" onClick={onExit}>Quay lại bài học</button>
                </div>
            </div>
        )
    }
    if (!attempt) return <div className="focus-page"><div className="center-state">Đang chuẩn bị bài kiểm tra…</div></div>
    return <AttemptForm key={attempt.id} attempt={attempt} courseId={courseId} lessonId={lessonId} title={title}
        onExit={onExit} onSubmitted={onSubmitted} />
}

function AttemptForm({ attempt, courseId, lessonId, title, onExit, onSubmitted }) {
    const { questions } = attempt
    const total = questions.length
    const [answers, setAnswers] = useState(() => fromApiAnswers(attempt.answers))
    const [confirm, setConfirm] = useState(false)
    const [saveState, setSaveState] = useState('saved') // saved | dirty | saving | error
    // mutate của TanStack Query giữ nguyên qua các lần render → callback bên dưới không đổi theo đồng hồ
    const { mutate: saveAnswers } = useSaveAnswers(courseId, lessonId)
    const submit = useSubmitAttempt(courseId, lessonId)
    const { mutate: submitAnswers } = submit
    const onSubmittedRef = useRef(onSubmitted)
    useEffect(() => { onSubmittedRef.current = onSubmitted })

    // Đồng hồ theo giờ backend: bù độ lệch giữa đồng hồ máy và server
    const [offset] = useState(() => Date.parse(attempt.server_time) - Date.now())
    const deadline = attempt.expires_at ? Date.parse(attempt.expires_at) : null
    const secondsLeft = useCallback(() => (deadline == null ? null : Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000))), [deadline, offset])
    const [left, setLeft] = useState(secondsLeft)

    const answersRef = useRef(answers)
    useEffect(() => { answersRef.current = answers })
    const finished = useRef(false)

    const doSubmit = useCallback(() => {
        if (finished.current) return
        finished.current = true
        submitAnswers({ attemptId: attempt.id, answers: answersRef.current }, {
            onSuccess: (data) => onSubmittedRef.current(data.attempt.id),
            onError: (err) => {
                // 409: lượt đã được nộp (ở tab khác / hết giờ) → xem kết quả của lượt đó
                if (err.response?.status === 409) onSubmittedRef.current(attempt.id)
                else finished.current = false
            },
        })
    }, [attempt.id, submitAnswers])

    const flush = useCallback(() => {
        if (finished.current) return
        setSaveState('saving')
        saveAnswers({ attemptId: attempt.id, answers: answersRef.current }, {
            onSuccess: () => setSaveState((s) => (s === 'saving' ? 'saved' : s)),
            onError: (err) => {
                if (finished.current) return // đang nộp bài: kết quả nộp quyết định màn tiếp theo
                // 409: hết giờ, backend đã tự nộp phần đã lưu
                if (err.response?.status === 409) { finished.current = true; onSubmittedRef.current(attempt.id) }
                else setSaveState('error')
            },
        })
    }, [attempt.id, saveAnswers])

    // Tự lưu khi ngừng thao tác
    useEffect(() => {
        if (saveState !== 'dirty') return
        const id = setTimeout(flush, AUTOSAVE_DELAY)
        return () => clearTimeout(id)
    }, [answers, saveState, flush])

    // Đếm ngược; về 0 thì tự nộp
    const submitRef = useRef(doSubmit)
    useEffect(() => { submitRef.current = doSubmit })
    useEffect(() => {
        if (deadline == null) return
        const id = setInterval(() => {
            const s = secondsLeft()
            setLeft(s)
            if (s <= 0) submitRef.current()
        }, 1000)
        return () => clearInterval(id)
    }, [deadline, secondsLeft])

    // Đóng tab khi còn thay đổi chưa lưu → trình duyệt hỏi lại
    useEffect(() => {
        if (saveState === 'saved') return
        const warn = (e) => { e.preventDefault(); e.returnValue = '' }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [saveState])

    const update = (qid, value) => {
        setAnswers((prev) => ({ ...prev, [qid]: value }))
        setSaveState('dirty')
    }
    const pick = (q, optionId) => {
        const cur = answers[q.id] ?? []
        if (!isMulti(q)) return update(q.id, [optionId])
        update(q.id, cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId])
    }

    const exit = () => {
        if (saveState !== 'saved') flush()
        onExit()
    }

    const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length
    const submitting = submit.isPending
    const submitClick = () => (answered < total && !confirm ? setConfirm(true) : doSubmit())
    const timeUp = left === 0

    return (
        <div className="focus-page">
            <header className="focus-bar">
                <div className="focus-bar__row">
                    <button type="button" className="btn" onClick={exit} disabled={submitting} style={{ minHeight: 44, padding: '0 12px', borderRadius: 8 }}>
                        <CloseIcon />Tạm thoát
                    </button>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span className="focus-bar__title">{title}</span>
                        <span className="small muted" aria-live="polite">
                            Lần {attempt.attempt_no} · Đã trả lời {answered}/{total} câu · <SaveNote state={saveState} />
                        </span>
                    </div>
                    {left == null ? (
                        <span className="timer"><TimerIcon />Không giới hạn</span>
                    ) : (
                        <span role="timer" aria-label="Thời gian còn lại" className={`timer${left <= 60 ? ' timer--low' : ''}`}>
                            <TimerIcon />{mmss(left)}
                        </span>
                    )}
                </div>
                <div className="focus-progress"><div style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }} /></div>
            </header>

            <div className="attempt-wrap">
                <main style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {questions.map((q, i) => {
                        const a = answers[q.id]
                        const has = isAnswered(q, a)
                        const multi = isMulti(q)
                        return (
                            <section key={q.id} id={`q${i + 1}`} aria-labelledby={`qh${i + 1}`} className="q-card">
                                <div className="row-between">
                                    <span className="row" style={{ gap: 10 }}>
                                        <span className="q-num">Câu {i + 1} / {total}</span>
                                        <span className={`q-type${multi ? ' q-type--multi' : ''}`}>
                                            {!isText(q) && <span aria-hidden="true" className={`q-mark q-mark--sm${multi ? ' q-mark--check' : ''}`} />}
                                            {TYPE_LABEL[q.question_type]}
                                        </span>
                                        <span className="small muted">{q.points} điểm</span>
                                    </span>
                                    <span className={`pill pill--tag ${has ? 'pill--blue' : 'pill--gray'}`}>{has ? 'Đã trả lời' : 'Chưa trả lời'}</span>
                                </div>
                                {isText(q) ? (
                                    <div className="stack" style={{ gap: 10 }}>
                                        <label id={`qh${i + 1}`} htmlFor={`qi${i + 1}`} className="q-text">{q.content}</label>
                                        <span className="q-hint">{TYPE_HINT[q.question_type]}</span>
                                        <input id={`qi${i + 1}`} type="text" className="q-input" autoComplete="off" maxLength={1000}
                                            placeholder="Nhập câu trả lời của bạn…" disabled={timeUp || submitting}
                                            value={a ?? ''} onChange={(e) => update(q.id, e.target.value)} />
                                    </div>
                                ) : (
                                    <fieldset disabled={timeUp || submitting}>
                                        <legend id={`qh${i + 1}`}>{q.content}</legend>
                                        <span className="q-hint" style={{ marginBottom: 4 }}>
                                            {TYPE_HINT[q.question_type]}
                                            {multi && <span className="q-count" aria-live="polite"> · Đã chọn {a?.length ?? 0}</span>}
                                        </span>
                                        {q.options.map((o, k) => {
                                            const on = !!a?.includes(o.id)
                                            return (
                                                <label key={o.id} className={`q-opt${on ? ' is-on' : ''}`}>
                                                    <input type={multi ? 'checkbox' : 'radio'} name={`q${q.id}`} checked={on} onChange={() => pick(q, o.id)} />
                                                    <span className={`q-letter${multi ? ' q-letter--sq' : ''}`}>{LETTERS[k]}</span>
                                                    <span style={{ flex: 1, fontSize: 16, lineHeight: 1.5 }}>{o.content}</span>
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
                            const has = isAnswered(q, answers[q.id])
                            return (
                                <a key={q.id} href={`#q${i + 1}`} className={has ? 'is-answered' : ''}
                                    aria-label={`Tới câu ${i + 1}, ${has ? 'đã trả lời' : 'chưa trả lời'}`}>{i + 1}</a>
                            )
                        })}
                    </nav>
                    <div className="row" style={{ gap: '8px 16px', fontSize: 12, color: 'var(--text-2)' }}>
                        <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--primary)' }} />Đã trả lời</span>
                        <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ border: '1px solid var(--input-soft)' }} />Chưa trả lời</span>
                    </div>
                    {timeUp && <div role="status" className="confirm-box">Hết giờ làm bài. Đang tự động nộp…</div>}
                    {submit.isError && submit.error.response?.status !== 409 && (
                        <div role="alert" className="status-msg status-msg--error">{errorMessage(submit.error, 'Nộp bài không thành công. Vui lòng thử lại.')}</div>
                    )}
                    {confirm && !timeUp && (
                        <div role="alertdialog" aria-label="Xác nhận nộp bài" className="confirm-box">
                            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                                Bạn còn {total - answered} câu chưa trả lời. Câu bỏ trống sẽ không được tính điểm.
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" className="btn" style={{ flex: 1, minHeight: 40, borderRadius: 8 }} onClick={() => setConfirm(false)}>Làm tiếp</button>
                                <button type="button" className="btn btn--danger" style={{ flex: 1, minHeight: 40, borderRadius: 8, background: '#B54A00' }} disabled={submitting} onClick={doSubmit}>Vẫn nộp</button>
                            </div>
                        </div>
                    )}
                    <button type="button" className="btn btn--primary btn--lg btn--block" disabled={submitting || timeUp} onClick={submitClick}>
                        {submitting ? 'Đang nộp bài…' : 'Nộp bài'}
                    </button>
                </aside>
            </div>
        </div>
    )
}

function SaveNote({ state }) {
    if (state === 'saving') return 'Đang lưu…'
    if (state === 'dirty') return 'Chưa lưu'
    if (state === 'error') return <span style={{ color: 'var(--danger-dark)' }}>Chưa lưu được, sẽ thử lại khi bạn trả lời tiếp</span>
    return 'Đã lưu bài làm'
}
