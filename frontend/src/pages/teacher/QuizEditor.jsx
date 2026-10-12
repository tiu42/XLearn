import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ui'
import { useToast } from '../../components/hooks'
import { getCourse, getQuizDraft } from '../../data/mock'
import { LETTERS } from '../learner/quiz'
import './teacher.css'

const TL = { single: 'MỘT ĐÁP ÁN', multi: 'NHIỀU ĐÁP ÁN', text: 'TỰ LUẬN NGẮN' }
const TC = { single: 'tag-page', multi: 'tag-video', text: 'tag-text' }
const swap = (a, i, j) => { const b = [...a];[b[i], b[j]] = [b[j], b[i]]; return b }

export default function QuizEditor() {
    const { courseId } = useParams()
    const course = useMemo(() => getCourse(courseId), [courseId])
    const draft = useMemo(() => getQuizDraft(), [])
    const [title, setTitle] = useState(draft.title)
    const [kind, setKind] = useState(draft.kind)
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
    const total = qs.reduce((s, q) => s + (Number(q.pts) || 0), 0)
    const cnt = (t) => qs.filter((q) => q.t === t).length
    const exam = kind === 'exam'

    const add = (t) => {
        const id = ++nid.current
        setQs((list) => [...list, t === 'text'
            ? { id, t, pts: 1, q: '', accept: [''], e: '' }
            : { id, t, pts: 1, q: '', o: ['', '', '', ''], c: [], e: '' }])
        setOpenId(id)
    }

    const save = () => {
        const bad = qs.filter((q) => q.t !== 'text' && !q.c.length).length
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
                            <span className="small text-2">{cnt('single')} một đáp án · {cnt('multi')} nhiều đáp án · {cnt('text')} tự luận ngắn</span>
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
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('single')}>Một đáp án</button>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('multi')}>Nhiều đáp án</button>
                            <button type="button" className="btn btn--soft" style={{ minHeight: 38 }} onClick={() => add('text')}>Tự luận ngắn</button>
                        </div>
                    </main>

                    <aside aria-labelledby="sh" className="qe-side">
                        <h2 id="sh" style={{ fontSize: 17, fontWeight: 700 }}>Cài đặt</h2>
                        <div className="stack">
                            <span id="kl" style={{ fontSize: 14, fontWeight: 600 }}>Loại</span>
                            <div role="radiogroup" aria-labelledby="kl" className="seg" style={{ borderRadius: 6, background: '#F1F3F5' }}>
                                <button type="button" role="radio" aria-checked={!exam} onClick={() => setKind('quiz')}>Quiz luyện tập</button>
                                <button type="button" role="radio" aria-checked={exam}
                                    onClick={() => { setKind('exam'); setSet((s) => ({ ...s, tries: 1, reveal: 'Sau khi bài đóng' })) }}>Tính điểm</button>
                            </div>
                            <span className="small text-2" style={{ lineHeight: 1.5 }}>
                                {exam ? 'Tính vào kết quả khóa học và là điều kiện hoàn thành khóa.' : 'Giúp học viên tự ôn sau bài học, không tính vào kết quả khóa học.'}
                            </span>
                        </div>
                        <div className="field-row" style={{ gap: 12 }}>
                            <div className="field field--narrow"><label htmlFor="s-t">Thời gian (phút)</label><input id="s-t" type="number" min="1" className="input" value={set.time} onChange={setS('time', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="s-a">Số lượt làm</label><input id="s-a" type="number" min="0" className="input" value={set.tries} onChange={setS('tries', true)} /></div>
                        </div>
                        <span className="text-2" style={{ fontSize: 12, marginTop: -8 }}>Số lượt làm = 0 nghĩa là không giới hạn.</span>
                        <div className="field">
                            <label htmlFor="s-p">Điểm đạt: {set.pass}%</label>
                            <input id="s-p" type="range" min="10" max="100" step="5" value={set.pass} onChange={setS('pass', true)} style={{ accentColor: 'var(--primary)' }} />
                        </div>
                        <div className="field-row" style={{ gap: 12 }}>
                            <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="s-o">Mở lúc</label>
                                <input id="s-o" type="datetime-local" className="input" style={{ fontSize: 14, padding: '0 8px' }} value={set.open} onChange={setS('open')} /></div>
                            <div className="field" style={{ flex: '1 1 140px' }}><label htmlFor="s-c">Đóng lúc</label>
                                <input id="s-c" type="datetime-local" className="input" style={{ fontSize: 14, padding: '0 8px' }} value={set.close} onChange={setS('close')} /></div>
                        </div>
                        <div className="field"><label htmlFor="s-r">Cho học viên xem đáp án</label>
                            <select id="s-r" className="select" value={set.reveal} onChange={setS('reveal')}>
                                <option>Ngay sau khi nộp bài</option><option>Sau khi bài đóng</option><option>Không hiển thị</option>
                            </select></div>
                        <label className="check" style={{ gap: 10 }}>
                            <input type="checkbox" checked={set.shuffle} onChange={() => setSet((s) => ({ ...s, shuffle: !s.shuffle }))} />
                            Trộn thứ tự câu hỏi và đáp án
                        </label>
                        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-subtle)', fontSize: 14, lineHeight: 1.6 }} className="text-2">
                            {exam ? 'Bài kiểm tra tính điểm' : 'Quiz luyện tập'} · {qs.length} câu, {total} điểm · {set.time} phút · {Number(set.tries) === 0 ? 'không giới hạn lượt' : `${set.tries} lượt`} · đạt từ {set.pass}%.
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
    const multi = q.t === 'multi'
    const invalid = q.t !== 'text' && !q.c.length
    const field = (k, num) => (e) => { const v = num ? Number(e.target.value) : e.target.value; upd((y) => ({ ...y, [k]: v })) }

    const setType = (e) => {
        const nt = e.target.value
        upd((y) => (nt === 'text'
            ? { ...y, t: nt, accept: y.accept ?? [''] }
            : { ...y, t: nt, o: y.o ?? ['', '', '', ''], c: nt === 'single' ? (y.c ?? []).slice(0, 1) : (y.c ?? []) }))
    }
    const toggleCorrect = (k) => upd((y) => {
        if (y.t === 'single') return { ...y, c: [k] }
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
                                <option value="single">Trắc nghiệm một đáp án</option><option value="multi">Trắc nghiệm nhiều đáp án</option><option value="text">Tự luận ngắn</option>
                            </select>
                        </div>
                        <div className="field" style={{ flex: '0 1 120px' }}>
                            <label htmlFor={`qp${q.id}`}>Điểm</label>
                            <input id={`qp${q.id}`} type="number" min="0" step="0.5" className="input" value={q.pts} onChange={field('pts', true)} />
                        </div>
                    </div>
                    <div className="field">
                        <label htmlFor={`qx${q.id}`}>Nội dung câu hỏi</label>
                        <textarea id={`qx${q.id}`} rows={2} className="textarea" value={q.q} onChange={field('q')} />
                    </div>

                    {q.t !== 'text' ? (
                        <fieldset>
                            <legend>Đáp án <span style={{ fontWeight: 400 }} className="text-2">· {multi ? 'đánh dấu tất cả đáp án đúng' : 'chọn một đáp án đúng'}</span></legend>
                            {q.o.map((text, k) => {
                                const correct = q.c.includes(k)
                                return (
                                    <div key={k} className={`qe-opt${correct ? ' is-correct' : ''}`}>
                                        <label className="correct-label">
                                            <input type={multi ? 'checkbox' : 'radio'} name={`cor${q.id}`} checked={correct} onChange={() => toggleCorrect(k)} />Đúng
                                        </label>
                                        <span className="qe-letter">{LETTERS[k]}</span>
                                        <label htmlFor={`o${q.id}_${k}`} className="sr-only">Nội dung đáp án {LETTERS[k]}</label>
                                        <input id={`o${q.id}_${k}`} className="input" style={{ flex: 1, minWidth: 0, minHeight: 40 }} placeholder="Nội dung đáp án" value={text}
                                            onChange={(e) => { const v = e.target.value; upd((y) => ({ ...y, o: y.o.map((x, j) => (j === k ? v : x)) })) }} />
                                        <button type="button" className="x-btn" disabled={q.o.length <= 2} onClick={() => delOpt(k)} aria-label={`Xóa đáp án ${LETTERS[k]}`}>×</button>
                                    </div>
                                )
                            })}
                            {q.o.length < 6 && (
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
