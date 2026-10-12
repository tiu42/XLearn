import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog, Modal } from '../../components/ui'
import { useToast } from '../../components/hooks'
import { getCourse, getCourseContent } from '../../data/mock'
import CourseHead from './CourseHead'
import './teacher.css'

const TAGS = { video: ['VIDEO', 'tag-video'], page: ['BÀI ĐỌC', 'tag-page'], quiz: ['QUIZ', 'tag-quiz'], exam: ['KIỂM TRA', 'tag-exam'] }
const tagKey = (it) => (it.type === 'test' ? it.kind : it.type)
const swap = (a, i, j) => { const b = [...a];[b[i], b[j]] = [b[j], b[i]]; return b }

function meta(it) {
    if (it.type === 'video') return `Video · ${it.dur || '?'} phút`
    if (it.type === 'page') return 'Bài đọc'
    return `${it.kind === 'exam' ? 'Tính điểm' : 'Luyện tập'} · ${it.q} câu · ${it.time} phút · ${Number(it.tries) === 0 ? 'không giới hạn lượt' : `${it.tries} lượt`} · đạt ${it.pass}%`
}

const MoveBtns = ({ i, n, onMove, what }) => (
    <>
        <button type="button" className="btn btn--sm btn--square" disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label={`Chuyển ${what} lên`}>↑</button>
        <button type="button" className="btn btn--sm btn--square" disabled={i === n - 1} onClick={() => onMove(i, i + 1)} aria-label={`Chuyển ${what} xuống`}>↓</button>
    </>
)

export default function CourseContent() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const course = useMemo(() => getCourse(courseId), [courseId])
    const [topics, setTopics] = useState(getCourseContent)
    const [modal, setModal] = useState(null) // { kind: lesson|test|topic, tid, isNew }
    const [ed, setEd] = useState(null)
    const [err, setErr] = useState(false)
    const [topicName, setTopicName] = useState('')
    const [confirm, setConfirm] = useState(null)
    const [toast, flash] = useToast()
    const nid = useRef(100)

    const quizUrl = (id) => `/teach/courses/${courseId}/quizzes/${id}`
    const items = topics.flatMap((t) => t.items)
    const nT = items.filter((it) => it.type === 'test').length
    const mapT = (tid, fn) => setTopics((ts) => ts.map((t) => (t.id === tid ? fn({ ...t }) : t)))
    const setE = (k, num) => (e) => { const v = num ? Number(e.target.value) : e.target.value; setEd((x) => ({ ...x, [k]: v })); if (k === 'title') setErr(false) }
    const close = () => { setModal(null); setEd(null) }

    function saveItem(thenEditQuestions) {
        if (!String(ed.title || '').trim()) { setErr(true); return }
        const md = modal
        mapT(md.tid, (t) => ({ ...t, items: md.isNew ? [...t.items, ed] : t.items.map((it) => (it.id === ed.id ? ed : it)) }))
        flash(`${md.isNew ? 'Đã thêm' : 'Đã lưu'} “${ed.title}”.`)
        close()
        if (thenEditQuestions) navigate(quizUrl(ed.id))
    }

    function saveTopic() {
        const n = topicName.trim() || 'Chủ đề mới'
        if (modal.isNew) setTopics((ts) => [...ts, { id: ++nid.current, title: n, items: [] }])
        else mapT(modal.tid, (t) => ({ ...t, title: n }))
        flash(`Đã lưu chủ đề “${n}”.`)
        close()
    }

    function doConfirm() {
        const c = confirm
        if (c.kind === 'topic') setTopics((ts) => ts.filter((t) => t.id !== c.tid))
        else mapT(c.tid, (t) => ({ ...t, items: t.items.filter((it) => it.id !== c.id) }))
        setConfirm(null)
        flash(`Đã xóa “${c.name}”.`)
    }

    return (
        <>
            <CourseHead course={course}
                action={<Link to={`/courses/${course.id}`} className="btn" style={{ minHeight: 40 }}>Xem như học viên</Link>} />
            <main className="container container--1000 container--teach" style={{ paddingTop: 24, gap: 16 }}>
                <div className="row-between">
                    <p className="text-2" style={{ fontSize: 15 }}>{topics.length} chủ đề · {items.length - nT} bài học · {nT} bài kiểm tra</p>
                    <button type="button" className="btn btn--outline" style={{ minHeight: 40 }}
                        onClick={() => { setModal({ kind: 'topic', isNew: true }); setTopicName('') }}>+ Thêm chủ đề</button>
                </div>

                {topics.map((t, i) => (
                    <section key={t.id} className="card topic-box" aria-labelledby={`tp-${t.id}`}>
                        <div className="topic-box__head">
                            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>CHỦ ĐỀ {i + 1}</span>
                                <h2 id={`tp-${t.id}`} style={{ fontSize: 17, fontWeight: 700 }}>{t.title}</h2>
                            </div>
                            <div className="row" style={{ gap: 6 }}>
                                <MoveBtns i={i} n={topics.length} what="chủ đề" onMove={(a, b) => setTopics((ts) => swap(ts, a, b))} />
                                <button type="button" className="btn btn--sm" onClick={() => { setModal({ kind: 'topic', tid: t.id }); setTopicName(t.title) }}>Đổi tên</button>
                                <button type="button" className="btn btn--sm btn--danger-ghost"
                                    onClick={() => setConfirm({ kind: 'topic', tid: t.id, name: t.title, n: t.items.length })}>Xóa</button>
                            </div>
                        </div>
                        <ul>
                            {t.items.map((it, j) => {
                                const [label, cls] = TAGS[tagKey(it)]
                                return (
                                    <li key={it.id}>
                                        <span className={`item-tag ${cls}`}>{label}</span>
                                        <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span style={{ fontSize: 15, fontWeight: 600 }}>{it.title}</span>
                                            <span className="small text-2">{meta(it)}</span>
                                        </div>
                                        <div className="row" style={{ gap: 6 }}>
                                            <MoveBtns i={j} n={t.items.length} what="bài" onMove={(a, b) => mapT(t.id, (x) => ({ ...x, items: swap(x.items, a, b) }))} />
                                            {it.type === 'test' && <Link to={quizUrl(it.id)} className="btn btn--sm btn--soft">Soạn câu hỏi</Link>}
                                            <button type="button" className="btn btn--sm" aria-label={`Sửa ${it.title}`}
                                                onClick={() => { setErr(false); setEd({ ...it }); setModal({ kind: it.type === 'test' ? 'test' : 'lesson', tid: t.id }) }}>Sửa</button>
                                            <button type="button" className="btn btn--sm btn--danger-ghost" aria-label={`Xóa ${it.title}`}
                                                onClick={() => setConfirm({ kind: 'item', tid: t.id, id: it.id, name: it.title, isTest: it.type === 'test' })}>Xóa</button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                        {t.items.length === 0 && <p className="text-2" style={{ padding: '14px 16px', fontSize: 14 }}>Chủ đề chưa có bài học.</p>}
                        <div className="row" style={{ gap: 8, padding: '12px 16px' }}>
                            <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }}
                                onClick={() => { setErr(false); setEd({ id: ++nid.current, type: 'video', title: '', dur: 5, url: '', body: '' }); setModal({ kind: 'lesson', tid: t.id, isNew: true }) }}>+ Bài học</button>
                            <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }}
                                onClick={() => { setErr(false); setEd({ id: ++nid.current, type: 'test', title: '', kind: 'quiz', q: 0, time: 15, tries: 2, pass: 80 }); setModal({ kind: 'test', tid: t.id, isNew: true }) }}>+ Bài kiểm tra</button>
                        </div>
                    </section>
                ))}
            </main>

            {modal?.kind === 'lesson' && (
                <Modal title={modal.isNew ? 'Thêm bài học' : 'Sửa bài học'} width={620} onClose={close}
                    footer={<>
                        <button type="button" className="btn" onClick={close}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={() => saveItem(false)}>Lưu bài học</button>
                    </>}>
                    <div className="dialog__body">
                        <div className="field">
                            <label htmlFor="l-t">Tiêu đề bài học <span className="req">*</span></label>
                            <input id="l-t" className={`input${err ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus />
                            {err && <span className="error">Vui lòng nhập tiêu đề.</span>}
                        </div>
                        <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <legend style={{ padding: 0, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Loại bài học</legend>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[['video', 'Video'], ['page', 'Bài đọc']].map(([v, t]) => (
                                    <label key={v} className={`radio-card${ed.type === v ? ' is-on' : ''}`}>
                                        <input type="radio" name="lt" checked={ed.type === v} onChange={() => setEd((x) => ({ ...x, type: v }))} />{t}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        {ed.type === 'video' && (
                            <>
                                <div className="field"><label htmlFor="l-f">Tải video lên</label><input id="l-f" type="file" accept="video/*" className="file-input" /></div>
                                <div className="field-row">
                                    <div className="field" style={{ flex: '2 1 260px' }}><label htmlFor="l-u">Hoặc đường dẫn video</label>
                                        <input id="l-u" type="url" className="input" value={ed.url} onChange={setE('url')} placeholder="https://" /></div>
                                    <div className="field field--narrow"><label htmlFor="l-d">Thời lượng (phút)</label>
                                        <input id="l-d" type="number" min="1" className="input" value={ed.dur} onChange={setE('dur', true)} /></div>
                                </div>
                            </>
                        )}
                        <div className="field">
                            <label htmlFor="l-b">{ed.type === 'page' ? 'Nội dung bài đọc' : 'Mô tả bên dưới video'}</label>
                            <textarea id="l-b" rows={ed.type === 'page' ? 9 : 3} className="textarea" value={ed.body} onChange={setE('body')} />
                        </div>
                        <div className="field"><label htmlFor="l-a">Tài liệu đính kèm</label>
                            <input id="l-a" type="file" multiple className="file-input" style={{ borderWidth: 1, borderStyle: 'solid', padding: 10 }} /></div>
                    </div>
                </Modal>
            )}

            {modal?.kind === 'test' && (
                <Modal title={modal.isNew ? 'Thêm bài kiểm tra' : 'Sửa bài kiểm tra'} width={560} onClose={close}
                    footer={<>
                        <button type="button" className="btn" onClick={close}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={() => saveItem(false)}>Lưu</button>
                        <button type="button" className="btn btn--primary" style={{ background: 'var(--primary-dark)' }} onClick={() => saveItem(true)}>Lưu &amp; soạn câu hỏi</button>
                    </>}>
                    <div className="dialog__body">
                        <div className="field">
                            <label htmlFor="t-t">Tên bài kiểm tra <span className="req">*</span></label>
                            <input id="t-t" className={`input${err ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus />
                            {err && <span className="error">Vui lòng nhập tên bài kiểm tra.</span>}
                        </div>
                        <div className="field"><label htmlFor="t-k">Loại</label>
                            <select id="t-k" className="select" value={ed.kind} onChange={setE('kind')}>
                                <option value="quiz">Quiz luyện tập (không tính điểm)</option><option value="exam">Bài kiểm tra tính điểm</option>
                            </select></div>
                        <div className="field-row">
                            <div className="field field--narrow"><label htmlFor="t-m">Thời gian (phút)</label><input id="t-m" type="number" min="1" className="input" value={ed.time} onChange={setE('time', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="t-a">Số lượt làm</label><input id="t-a" type="number" min="0" className="input" value={ed.tries} onChange={setE('tries', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="t-p">Điểm đạt (%)</label><input id="t-p" type="number" min="0" max="100" className="input" value={ed.pass} onChange={setE('pass', true)} /></div>
                        </div>
                        <span className="small text-2">Số lượt làm = 0 nghĩa là không giới hạn. Câu hỏi được soạn ở bước tiếp theo.</span>
                    </div>
                </Modal>
            )}

            {modal?.kind === 'topic' && (
                <Modal title={modal.isNew ? 'Thêm chủ đề' : 'Đổi tên chủ đề'} width={480} onClose={close}
                    footer={<>
                        <button type="button" className="btn" onClick={close}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={saveTopic}>Lưu</button>
                    </>}>
                    <div className="dialog__body">
                        <div className="field">
                            <label htmlFor="tp-n">Tên chủ đề</label>
                            <input id="tp-n" className="input" value={topicName} onChange={(e) => setTopicName(e.target.value)} autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && saveTopic()} />
                        </div>
                    </div>
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === 'topic' ? 'Xóa chủ đề?' : confirm.isTest ? 'Xóa bài kiểm tra?' : 'Xóa bài học?'}
                    text={confirm.kind === 'topic'
                        ? `Chủ đề “${confirm.name}”${confirm.n ? ` cùng ${confirm.n} bài bên trong` : ''} sẽ bị xóa. Tiến độ học viên liên quan cũng bị xóa.`
                        : `“${confirm.name}” sẽ bị xóa khỏi khóa học${confirm.isTest ? ', cùng câu hỏi và kết quả làm bài của học viên.' : '. Tiến độ học viên ở bài này cũng bị xóa.'}`}
                    onCancel={() => setConfirm(null)} onConfirm={doConfirm} />
            )}
            {toast}
        </>
    )
}
