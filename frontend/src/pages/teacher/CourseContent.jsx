import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/hooks'
import MarkdownEditor from '../../components/MarkdownEditor'
import { ConfirmDialog, Modal } from '../../components/ui'
import { getCourseContent } from '../../data/mock'
import CourseHead, { CourseLoadState } from './CourseHead'
import { useTeachCourse } from './teachApi'
import './teacher.css'

const TAGS = { video: ['VIDEO', 'tag-video'], pdf: ['PDF', 'tag-pdf'], page: ['BÀI ĐỌC', 'tag-page'], quiz: ['QUIZ', 'tag-quiz'], exam: ['KIỂM TRA', 'tag-exam'] }
const tagKey = (it) => (it.type === 'quiz' ? (it.is_graded ? 'exam' : 'quiz') : it.type)
const swap = (a, i, j) => { const b = [...a];[b[i], b[j]] = [b[j], b[i]]; return b }
const LESSON_TYPES = [['video', 'Video'], ['pdf', 'PDF'], ['page', 'Bài đọc']]

function meta(it) {
    const base = it.type === 'video' ? `Video · ${it.minutes || '?'} phút`
        : it.type === 'pdf' ? `PDF · ${it.file ?? 'chưa có file'}`
        : it.type === 'page' ? `Bài đọc · ${it.minutes || '?'} phút đọc`
        : `${it.is_graded ? 'Tính điểm' : 'Luyện tập'} · ${it.q} câu · ${it.minutes} phút · ${Number(it.attempts) === 0 ? 'không giới hạn lượt' : `${it.attempts} lượt`} · đạt ${it.pass}%`
    const files = it.files?.length ? ` · ${it.files.length} tệp đính kèm` : ''
    return base + files + (it.status === 'draft' ? ' · Bản nháp' : '')
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
    const { data: course, error, isPending } = useTeachCourse(courseId)
    const [topics, setTopics] = useState(getCourseContent)
    const [modal, setModal] = useState(null) // { kind: lesson|test|topic, tid, isNew }
    const [ed, setEd] = useState(null)
    const [errs, setErrs] = useState({})
    const [topicName, setTopicName] = useState('')
    const [confirm, setConfirm] = useState(null)
    const [toast, flash] = useToast()
    const nid = useRef(100)

    const quizUrl = (id) => `/teach/courses/${courseId}/quizzes/${id}`
    const items = topics.flatMap((t) => t.items)
    const nT = items.filter((it) => it.type === 'quiz').length
    const nDraft = items.filter((it) => it.status === 'draft').length
    const mapT = (tid, fn) => setTopics((ts) => ts.map((t) => (t.id === tid ? fn({ ...t }) : t)))
    const setE = (k, num) => (e) => {
        const v = num ? Number(e.target.value) : e.target.value
        setEd((x) => ({ ...x, [k]: v }))
        setErrs((x) => ({ ...x, [k]: '' }))
    }
    const close = () => { setModal(null); setEd(null) }

    function validate() {
        const e = {}
        if (!String(ed.title || '').trim()) e.title = ed.type === 'quiz' ? 'Vui lòng nhập tên bài kiểm tra.' : 'Vui lòng nhập tiêu đề.'
        // ck_lessons_media: video/pdf bắt buộc có file
        if ((ed.type === 'video' || ed.type === 'pdf') && !ed.file) e.file = ed.type === 'video' ? 'Vui lòng chọn file video.' : 'Vui lòng chọn file PDF.'
        if (ed.type === 'page' && !String(ed.content || '').trim()) e.content = 'Vui lòng nhập nội dung bài đọc.'
        setErrs(e)
        return !Object.keys(e).length
    }

    function saveItem(thenEditQuestions) {
        if (!validate()) return
        const md = modal
        mapT(md.tid, (t) => ({ ...t, items: md.isNew ? [...t.items, ed] : t.items.map((it) => (it.id === ed.id ? ed : it)) }))
        flash(`${md.isNew ? 'Đã thêm' : 'Đã lưu'} “${ed.title}”${ed.status === 'draft' ? ' (bản nháp, học viên chưa thấy)' : ''}.`)
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

    const newLesson = (tid) => {
        setErrs({})
        setEd({ id: ++nid.current, type: 'video', title: '', minutes: 5, description: '', content: '', status: 'draft', file: null, files: [] })
        setModal({ kind: 'lesson', tid, isNew: true })
    }
    const newTest = (tid) => {
        setErrs({})
        setEd({ id: ++nid.current, type: 'quiz', title: '', is_graded: false, q: 0, minutes: 15, attempts: 2, pass: 80, status: 'draft' })
        setModal({ kind: 'test', tid, isNew: true })
    }

    if (isPending || error) return <CourseLoadState error={error} />

    return (
        <>
            <CourseHead course={course}
                action={<Link to={`/courses/${course.id}`} className="btn" style={{ minHeight: 40 }}>Xem như học viên</Link>} />
            <main className="container container--1000 container--teach" style={{ paddingTop: 24, gap: 16 }}>
                <div className="row-between">
                    <p className="text-2" style={{ fontSize: 15 }}>
                        {topics.length} chủ đề · {items.length - nT} bài học · {nT} bài kiểm tra{nDraft ? ` · ${nDraft} bản nháp` : ''}
                        {course.is_sequential && ' · Học tuần tự'}
                    </p>
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
                                    <li key={it.id} className={it.status === 'draft' ? 'is-draft' : undefined}>
                                        <span className={`item-tag ${cls}`}>{label}</span>
                                        <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span style={{ fontSize: 15, fontWeight: 600 }}>{it.title}</span>
                                            <span className="small text-2">{meta(it)}</span>
                                        </div>
                                        <div className="row" style={{ gap: 6 }}>
                                            <MoveBtns i={j} n={t.items.length} what="bài" onMove={(a, b) => mapT(t.id, (x) => ({ ...x, items: swap(x.items, a, b) }))} />
                                            {it.type === 'quiz' && <Link to={quizUrl(it.id)} className="btn btn--sm btn--soft">Soạn câu hỏi</Link>}
                                            <button type="button" className="btn btn--sm" aria-label={`Sửa ${it.title}`}
                                                onClick={() => { setErrs({}); setEd(structuredClone(it)); setModal({ kind: it.type === 'quiz' ? 'test' : 'lesson', tid: t.id }) }}>Sửa</button>
                                            <button type="button" className="btn btn--sm btn--danger-ghost" aria-label={`Xóa ${it.title}`}
                                                onClick={() => setConfirm({ kind: 'item', tid: t.id, id: it.id, name: it.title, isTest: it.type === 'quiz' })}>Xóa</button>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                        {t.items.length === 0 && <p className="text-2" style={{ padding: '14px 16px', fontSize: 14 }}>Chủ đề chưa có bài học.</p>}
                        <div className="row" style={{ gap: 8, padding: '12px 16px' }}>
                            <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }} onClick={() => newLesson(t.id)}>+ Bài học</button>
                            <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }} onClick={() => newTest(t.id)}>+ Bài kiểm tra</button>
                        </div>
                    </section>
                ))}
            </main>

            {modal?.kind === 'lesson' && (
                <Modal title={modal.isNew ? 'Thêm bài học' : 'Sửa bài học'} width={760} onClose={close}
                    footer={<>
                        <label className="check" style={{ marginRight: 'auto' }}>
                            <input type="checkbox" checked={ed.status === 'published'}
                                onChange={(e) => setEd((x) => ({ ...x, status: e.target.checked ? 'published' : 'draft' }))} />
                            Xuất bản (học viên nhìn thấy)
                        </label>
                        <button type="button" className="btn" onClick={close}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={() => saveItem(false)}>Lưu bài học</button>
                    </>}>
                    <div className="dialog__body">
                        <div className="field">
                            <label htmlFor="l-t">Tiêu đề bài học <span className="req">*</span></label>
                            <input id="l-t" className={`input${errs.title ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus maxLength={255} />
                            {errs.title && <span className="error">{errs.title}</span>}
                        </div>
                        <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <legend style={{ padding: 0, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Loại bài học</legend>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {LESSON_TYPES.map(([v, t]) => (
                                    <label key={v} className={`radio-card${ed.type === v ? ' is-on' : ''}`}>
                                        <input type="radio" name="lt" checked={ed.type === v}
                                            onChange={() => { setEd((x) => ({ ...x, type: v, file: v === x.type ? x.file : null })); setErrs({}) }} />{t}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {(ed.type === 'video' || ed.type === 'pdf') && (
                            <div className="field">
                                <label htmlFor="l-f">{ed.type === 'video' ? 'File video' : 'File PDF'} <span className="req">*</span></label>
                                {ed.file && <span className="small text-2">Hiện tại: <strong>{ed.file}</strong> · chọn file khác để thay</span>}
                                <input id="l-f" type="file" accept={ed.type === 'video' ? 'video/*' : 'application/pdf'} className={`file-input${errs.file ? ' is-invalid' : ''}`}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setEd((x) => ({ ...x, file: f.name })); setErrs((x) => ({ ...x, file: '' })) } }} />
                                {errs.file && <span className="error">{errs.file}</span>}
                            </div>
                        )}

                        {ed.type === 'page' ? (
                            <div className="field">
                                <label htmlFor="l-b">Nội dung bài đọc <span className="req">*</span></label>
                                <MarkdownEditor id="l-b" value={ed.content} onChange={(v) => { setEd((x) => ({ ...x, content: v })); setErrs((x) => ({ ...x, content: '' })) }} />
                                {errs.content && <span className="error">{errs.content}</span>}
                            </div>
                        ) : (
                            <div className="field">
                                <label htmlFor="l-b">{ed.type === 'video' ? 'Mô tả bên dưới video' : 'Mô tả tài liệu'}</label>
                                <textarea id="l-b" rows={3} className="textarea" value={ed.description} onChange={setE('description')} />
                            </div>
                        )}

                        <div className="field-row">
                            <div className="field field--narrow" style={{ flex: '0 1 200px' }}>
                                <label htmlFor="l-d">{ed.type === 'page' ? 'Thời gian đọc (phút)' : 'Thời lượng ước tính (phút)'}</label>
                                <input id="l-d" type="number" min="1" className="input" value={ed.minutes} onChange={setE('minutes', true)} />
                            </div>
                        </div>

                        <div className="field">
                            <label htmlFor="l-a">Tài liệu đính kèm</label>
                            {ed.files.length > 0 && (
                                <ul className="att-edit">
                                    {ed.files.map((name) => (
                                        <li key={name}>
                                            <span>{name}</span>
                                            <button type="button" className="x-btn" style={{ width: 30, height: 30, fontSize: 15 }} aria-label={`Bỏ ${name}`}
                                                onClick={() => setEd((x) => ({ ...x, files: x.files.filter((n) => n !== name) }))}>×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <input id="l-a" type="file" multiple className="file-input" style={{ borderWidth: 1, borderStyle: 'solid', padding: 10 }}
                                onChange={(e) => {
                                    const names = [...(e.target.files ?? [])].map((f) => f.name)
                                    e.target.value = ''
                                    setEd((x) => ({ ...x, files: [...new Set([...x.files, ...names])] }))
                                }} />
                            <span className="hint">Học viên tải về ở cuối bài học.</span>
                        </div>
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
                            <input id="t-t" className={`input${errs.title ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus />
                            {errs.title && <span className="error">{errs.title}</span>}
                        </div>
                        <div className="field"><label htmlFor="t-k">Loại</label>
                            <select id="t-k" className="select" value={ed.is_graded ? 'graded' : 'practice'}
                                onChange={(e) => setEd((x) => ({ ...x, is_graded: e.target.value === 'graded' }))}>
                                <option value="practice">Quiz luyện tập (không tính điểm)</option><option value="graded">Bài kiểm tra tính điểm</option>
                            </select></div>
                        <div className="field-row">
                            <div className="field field--narrow"><label htmlFor="t-m">Thời gian (phút)</label><input id="t-m" type="number" min="1" className="input" value={ed.minutes} onChange={setE('minutes', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="t-a">Số lượt làm</label><input id="t-a" type="number" min="0" className="input" value={ed.attempts} onChange={setE('attempts', true)} /></div>
                            <div className="field field--narrow"><label htmlFor="t-p">Điểm đạt (%)</label><input id="t-p" type="number" min="0" max="100" className="input" value={ed.pass} onChange={setE('pass', true)} /></div>
                        </div>
                        <span className="small text-2">Số lượt làm = 0 nghĩa là không giới hạn. Câu hỏi, giờ mở/đóng và chính sách xem đáp án được cài ở bước soạn câu hỏi.</span>
                        <label className="check">
                            <input type="checkbox" checked={ed.status === 'published'}
                                onChange={(e) => setEd((x) => ({ ...x, status: e.target.checked ? 'published' : 'draft' }))} />
                            Xuất bản (học viên nhìn thấy)
                        </label>
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
