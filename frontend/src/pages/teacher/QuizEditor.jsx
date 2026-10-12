import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ui'
import { useToast } from '../../components/hooks'
import { getCourse, getQuizDraft } from '../../data/mock'
import { LETTERS } from '../learner/quiz'
import './teacher.css'

const TL = { single_choice: 'MỘT ĐÁP ÁN', multiple_choice: 'NHIỀU ĐÁP ÁN', true_false: 'ĐÚNG / SAI', short_text: 'TỰ LUẬN NGẮN' }
const TC = { single_choice: 'tag-page', multiple_choice: 'tag-video', true_false: 'tag-exam', short_text: 'tag-text' }
const REVIEW = [['after_submit', 'Ngay sau khi nộp bài'], ['after_close', 'Sau khi bài đóng'], ['never', 'Không hiển thị']]
const swap = (a, i, j) => { const b = [...a];[b[i], b[j]] = [b[j], b[i]]; return b }

export default function QuizEditor() {
    const { courseId } = useParams()
    const course = useMemo(() => getCourse(courseId), [courseId])
    const draft = useMemo(() => getQuizDraft(), [])
    const [title, setTitle] = useState(draft.title)
    const [graded, setGraded] = useState(draft.is_graded)
    const [set, setSet] = useState(draft.settings)
    const [qs, setQs] = useState(draft.questions)
    const [openId, setOpenId] = useState(2)
    const [confirm, setConfirm] = useState(null)
    const [deleted, setDeleted] = useState(false)
    const [toast, flash] = useToast()
    const nid = useRef(100)

    const contentUrl = `/teach/courses/${courseId}/content`
    const upd = (id, fn) => setQs((list) => list.map((q) => (q.id === id ? fn({ ...q }) : q)))
    const setS = (k, num) => (e) => { const v = num ? Number(e.target.value) : e.target.value; setSet((s) => ({ ...s, [k]: v })) }
    const total = qs.reduce((sum, q) => sum + (Number(q.pts) || 0), 0)
    const cnt = (t) => qs.filter((q) => q.t === t).length

    const add = (t) => {
        const id = ++nid.current
        setQs((list) => [...list, t === 'short_text'
            ? { id, t, pts: 1, q: '', accept: [''], e: '' }
            : t === 'true_false'
                ? { id, t, pts: 1, q: '', o: ['Đúng', 'Sai'], c: [], e: '' }
                : { id, t, pts: 1, q: '', o: ['', '', '', ''], c: [], e: '' }])
        setOpenId(id)
    }

    const save = () => {
        // ck_quizzes_window: giờ đóng phải sau giờ mở
        if (set.opens_at && set.closes_at && set.closes_at <= set.opens_at) {
            flash('Chưa lưu: giờ đóng phải sau giờ mở.')
            return
        }
        const bad = qs.filter((q) => q.t !== 'short_text' && !q.c.length).length
        flash(bad ? `Đã lưu. Còn ${bad} câu chưa chọn đáp án đúng.` : 'Đã lưu bài kiểm tra.')
    }

    const confirmQIndex = confirm?.kind === 'q' ? qs.findIndex((q) => q.id === confirm.id) + 1 : 0

    return (
        <>
            <div className="course-head">
                <div className="course-head__inner course-head__inner--pad">
                    <nav aria-label="Đường dẫn" className="breadcrumb">
                        <Link to="/teach">Khóa học</Link><span aria-hidden="true">›</span>
                        <Link to={contentUrl}>{course.title}</Link><span aria-hidden="true">›</span><span>Bài kiểm tra</span>
                    </nav>
                    <div className="row-between" style={{ alignItems: 'flex-end' }}>
                        <div className="field" style={{ flex: '1 1 420px' }}>
                            <label htmlFor="qt" style={{ fontSize: 13, color: 'var(--text-2)' }}>Tên bài kiểm tra</label>
                            <input id="qt" className="input" style={{ minHeight: 46, maxWidth: 620, fontSize: 20, fontWeight: 700 }}
                                value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                            <Link to={contentUrl} className="btn">‹ Về nội dung khóa</Link>
                            <button type="button" className="btn btn--danger-ghost" onClick={() => setConfirm({ kind: 'test' })} disabled={deleted}>Xóa bài kiểm tra</button>
                            <button type="button" className="btn btn--primary" onClick={save} disabled={deleted}>Lưu</button>
                        </div>
                    </div>
                </div>
            </div>

            {deleted ? (
                <main className="center-state">
                    <div className="stack" style={{ maxWidth: 440, textAlign: 'center', alignItems: 'center', gap: 12, color: 'var(--text)' }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Đã xóa bài kiểm tra</h2>
                        <p className="text-2" style={{ fontSize: 15 }}>Bài kiểm tra và kết quả làm bài liên quan đã được xóa khỏi khóa học.</p>
                        <Link to={contentUrl} className="btn btn--primary">Về nội dung khóa học</Link>
                    </div>
                </main>
            ) : (
                <div className="qe-layout">
                    <main style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="row-between" style={{ gap: 10 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Câu hỏi · {qs.length} câu · {total} điểm</h2>
                            <span className="small text-2">{cnt('single_choice')} một đáp án · {cnt('multiple_choice')} nhiều đáp án · {cnt('true_false')} đúng/sai · {cnt('short_text')} tự luận ngắn</span>
                        </div>

                        {qs.map((q, i) => (
                            <QuestionCard key={q.id} q={q} i={i} n={qs.length} open={openId === q.id}
                                onToggle={() => setOpenId(openId === q.id ? null : q.id)}
                                onMove={(a, b) => setQs((l) => swap(l, a, b))}
                                onDelete={() => setConfirm({ kind: 'q', id: q.id })}
                                upd={(fn) => upd(q.id, fn)} />
                        ))}

                        <div className="add-q">
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-dark)', marginRight: 6 }}>+ Thêm câu hỏi:</span>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('single_choice')}>Một đáp án</button>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('multiple_choice')}>Nhiều đáp án</button>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('true_false')}>Đúng / Sai</button>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('short_text')}>Tự luận ngắn</button>
                        </div>
                    </main>

                    <aside aria-labelledby="sh" className="qe-side">
                        <h2 id="sh" style={{ fontSize: 17, fontWeight: 700 }}>Cài đặt</h2>
                        <div className="stack">
                            <span id="kl" style={{ fontSize: 14, fontWeight: 600 }}>Loại</span>
                            <div role="radiogroup" aria-labelledby="kl" className="seg" style={{ borderRadius: 6, background: '#F1F3F5' }}>
                                <button type="button" role="radio" aria-checked={!graded} onClick={() => setGraded(false)}>Quiz luyện tập</button>
                                <button type="button" role="radio" aria-checked={graded}
                                    onClick={() => { setGraded(true); setSet((x) => ({ ...x, attempts: 1, review_policy: 'after_close' })) }}>Tính điểm</button>
                            </div>
                            <span className="small text-2" style={{ lineHeight: 1.5 }}>
                                {graded ? 'Tính vào kết quả khóa học và là điều kiện hoàn thành khóa.' : 'Giúp học viên tự ôn sau bài học, không tính vào kết quả khóa học.'}
                            </span>
                        </div>
                        <div className="field-row" style={{ gap: 12 }}>
                            <div className="field field--narrow"><label htmlFor="s-t">Thời gian (phút)</label><input id="s-t" type="number" min="1" className="input" value={set.minutes} onChange={setS('minutes', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="s-a">Số lượt làm</label><input id="s-a" type="number" min="0" className="input" value={set.attempts} onChange={setS('attempts', true)} /></div>
                        </div>
                        <span className="text-2" style={{ fontSize: 12, marginTop: -8 }}>Số lượt làm = 0 nghĩa là không giới hạn.</span>
                        <div className="field">
                            <label htmlFor="s-p">Điểm đạt: {set.pass}%</label>
                            <input id="s-p" type="range" min="10" max="100" step="5" value={set.pass} onChange={setS('pass', true)} style={{ accentColor: 'var(--primary)' }} />
                        </div>
                        <div className="field-row" style={{ gap: 12 }}>
                            <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="s-o">Mở lúc</label>
                                <input id="s-o" type="datetime-local" className="input" style={{ fontSize: 14, padding: '0 8px' }} value={set.opens_at} onChange={setS('opens_at')} /></div>
                            <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="s-c">Đóng lúc</label>
                                <input id="s-c" type="datetime-local" className="input" style={{ fontSize: 14, padding: '0 8px' }} value={set.closes_at} onChange={setS('closes_at')} /></div>
                        </div>
                        <div className="field"><label htmlFor="s-r">Cho học viên xem đáp án</label>
                            <select id="s-r" className="select" value={set.review_policy} onChange={setS('review_policy')}>
                                {REVIEW.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                            </select></div>
                        <label className="check" style={{ gap: 10 }}>
                            <input type="checkbox" checked={set.shuffle_questions} onChange={() => setSet((x) => ({ ...x, shuffle_questions: !x.shuffle_questions }))} />
                            Trộn thứ tự câu hỏi
                        </label>
                        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-subtle)', fontSize: 14, lineHeight: 1.6 }} className="text-2">
                            {graded ? 'Bài kiểm tra tính điểm' : 'Quiz luyện tập'} · {qs.length} câu, {total} điểm · {set.minutes} phút · {Number(set.attempts) === 0 ? 'không giới hạn lượt' : `${set.attempts} lượt`} · đạt từ {set.pass}%.
                        </div>
                    </aside>
                </div>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === 'test' ? 'Xóa bài kiểm tra?' : `Xóa câu hỏi ${confirmQIndex}?`}
                    text={confirm.kind === 'test' ? `“${title}” cùng toàn bộ câu hỏi và kết quả làm bài của học viên sẽ bị xóa. Không thể hoàn tác.` : 'Câu hỏi sẽ bị xóa khỏi bài kiểm tra.'}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => {
                        if (confirm.kind === 'test') setDeleted(true)
                        else { setQs((l) => l.filter((q) => q.id !== confirm.id)); flash('Đã xóa câu hỏi.') }
                        setConfirm(null)
                    }} />
            )}
            {toast}
        </>
    )
}

function QuestionCard({ q, i, n, open, onToggle, onMove, onDelete, upd }) {
    const multi = q.t === 'multiple_choice'
    const tf = q.t === 'true_false'
    const invalid = q.t !== 'short_text' && !q.c.length
    const field = (k, num) => (e) => { const v = num ? Number(e.target.value) : e.target.value; upd((y) => ({ ...y, [k]: v })) }

    const setType = (e) => {
        const nt = e.target.value
        upd((y) => {
            if (nt === 'short_text') return { ...y, t: nt, accept: y.accept ?? [''] }
            // Đúng/Sai: 2 lựa chọn cố định, giữ đáp án đúng nếu còn hợp lệ
            if (nt === 'true_false') return { ...y, t: nt, o: ['Đúng', 'Sai'], c: (y.c ?? []).filter((k) => k < 2).slice(0, 1) }
            const o = y.t === 'true_false' || !y.o ? ['', '', '', ''] : y.o
            const c = y.t === 'true_false' ? [] : y.c ?? []
            return { ...y, t: nt, o, c: nt === 'single_choice' ? c.slice(0, 1) : c }
        })
    }
    const toggleCorrect = (k) => upd((y) => {
        if (y.t !== 'multiple_choice') return { ...y, c: [k] }
        const c = y.c.includes(k) ? y.c.filter((x) => x !== k) : [...y.c, k].sort()
        return { ...y, c }
    })
    const delOpt = (k) => upd((y) => ({
        ...y, o: y.o.filter((_, j) => j !== k),
        c: y.c.filter((j) => j !== k).map((j) => (j > k ? j - 1 : j)),
    }))

    return (
        <section className={`qe-card${open ? ' is-open' : invalid ? ' is-invalid' : ''}`}>
            <div className="row" style={{ padding: '8px 12px', flexWrap: 'nowrap' }}>
                <button type="button" className="qe-toggle" onClick={onToggle} aria-expanded={open}>
                    <span className="qe-num">{i + 1}</span>
                    <span className={`qe-chip ${TC[q.t]}`}>{TL[q.t]}</span>
                    <span className="qe-preview">{q.q || '(Chưa có nội dung)'}</span>
                    {invalid && <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Thiếu đáp án đúng</span>}
                </button>
                <div className="row" style={{ gap: 4, flex: 'none', flexWrap: 'nowrap' }}>
                    <button type="button" className="btn btn--sm btn--square" style={{ width: 32, minHeight: 32 }} disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label="Chuyển câu lên">↑</button>
                    <button type="button" className="btn btn--sm btn--square" style={{ width: 32, minHeight: 32 }} disabled={i === n - 1} onClick={() => onMove(i, i + 1)} aria-label="Chuyển câu xuống">↓</button>
                    <button type="button" className="btn btn--sm btn--danger-ghost" style={{ minHeight: 32 }} onClick={onDelete} aria-label={`Xóa câu hỏi ${i + 1}`}>Xóa</button>
                </div>
            </div>

            {open && (
                <div className="qe-body">
                    <div className="field-row" style={{ gap: 16 }}>
                        <div className="field" style={{ flex: '1 1 220px' }}>
                            <label htmlFor={`qt${q.id}`}>Dạng câu hỏi</label>
                            <select id={`qt${q.id}`} className="select" value={q.t} onChange={setType}>
                                <option value="single_choice">Trắc nghiệm một đáp án</option><option value="multiple_choice">Trắc nghiệm nhiều đáp án</option>
                                <option value="true_false">Đúng / Sai</option><option value="short_text">Tự luận ngắn</option>
                            </select>
                        </div>
                        <div className="field" style={{ flex: '0 1 120px' }}>
                            <label htmlFor={`qp${q.id}`}>Điểm</label>
                            <input id={`qp${q.id}`} type="number" min="0" step="1" className="input" value={q.pts}
                                onChange={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); upd((y) => ({ ...y, pts: v })) }} />
                        </div>
                    </div>
                    <div className="field">
                        <label htmlFor={`qx${q.id}`}>Nội dung câu hỏi</label>
                        <textarea id={`qx${q.id}`} rows={2} className="textarea" value={q.q} onChange={field('q')} />
                    </div>

                    {q.t !== 'short_text' ? (
                        <fieldset>
                            <legend>Đáp án <span style={{ fontWeight: 400 }} className="text-2">· {multi ? 'đánh dấu tất cả đáp án đúng' : tf ? 'chọn Đúng hoặc Sai là đáp án đúng' : 'chọn một đáp án đúng'}</span></legend>
                            {q.o.map((text, k) => {
                                const correct = q.c.includes(k)
                                return (
                                    <div key={k} className={`qe-opt${correct ? ' is-correct' : ''}`}>
                                        <label className="correct-label">
                                            <input type={multi ? 'checkbox' : 'radio'} name={`cor${q.id}`} checked={correct} onChange={() => toggleCorrect(k)} />Đúng
                                        </label>
                                        <span className="qe-letter">{LETTERS[k]}</span>
                                        <label htmlFor={`o${q.id}_${k}`} className="sr-only">Nội dung đáp án {LETTERS[k]}</label>
                                        <input id={`o${q.id}_${k}`} className="input" style={{ flex: 1, minWidth: 0, minHeight: 40 }} placeholder="Nội dung đáp án" value={text} readOnly={tf}
                                            onChange={(e) => { const v = e.target.value; upd((y) => ({ ...y, o: y.o.map((x, j) => (j === k ? v : x)) })) }} />
                                        {!tf && <button type="button" className="x-btn" disabled={q.o.length <= 2} onClick={() => delOpt(k)} aria-label={`Xóa đáp án ${LETTERS[k]}`}>×</button>}
                                    </div>
                                )
                            })}
                            {!tf && q.o.length < 6 && (
                                <button type="button" className="btn btn--dashed" style={{ alignSelf: 'flex-start', minHeight: 38 }}
                                    onClick={() => upd((y) => ({ ...y, o: [...y.o, ''] }))}>+ Thêm đáp án</button>
                            )}
                        </fieldset>
                    ) : (
                        <fieldset>
                            <legend>Đáp án chấp nhận <span style={{ fontWeight: 400 }} className="text-2">· khớp một trong các đáp án là đúng; không phân biệt hoa thường và dấu</span></legend>
                            {q.accept.map((text, k) => (
                                <div key={k} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                    <label htmlFor={`a${q.id}_${k}`} className="sr-only">Đáp án chấp nhận {k + 1}</label>
                                    <input id={`a${q.id}_${k}`} className="input" style={{ flex: 1, minWidth: 0, minHeight: 40, borderColor: 'var(--success-border)', background: '#F4FAF5' }}
                                        value={text} onChange={(e) => { const v = e.target.value; upd((y) => ({ ...y, accept: y.accept.map((x, j) => (j === k ? v : x)) })) }} />
                                    <button type="button" className="x-btn" disabled={q.accept.length <= 1} aria-label={`Xóa đáp án chấp nhận ${k + 1}`}
                                        onClick={() => upd((y) => ({ ...y, accept: y.accept.filter((_, j) => j !== k) }))}>×</button>
                                </div>
                            ))}
                            <button type="button" className="btn btn--dashed" style={{ alignSelf: 'flex-start', minHeight: 38 }}
                                onClick={() => upd((y) => ({ ...y, accept: [...y.accept, ''] }))}>+ Thêm đáp án chấp nhận</button>
                        </fieldset>
                    )}

                    <div className="field">
                        <label htmlFor={`qe${q.id}`}>Giải thích <span style={{ fontWeight: 400 }} className="text-2">· hiện cho học viên khi xem lại</span></label>
                        <textarea id={`qe${q.id}`} rows={2} className="textarea" value={q.e} onChange={field('e')} />
                    </div>
                </div>
            )}
        </section>
    )
}
