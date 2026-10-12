import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { useToast } from '../../components/hooks'
import MarkdownEditor from '../../components/MarkdownEditor'
import { ConfirmDialog, Modal, ProgressBar } from '../../components/ui'
import {
    ATTACHMENT_ACCEPT, contentKey, fmtDuration, fmtSize, MAX_UPLOAD_BYTES, uploadFile, useContentAction,
    useCourseContent, VIDEO_ACCEPT,
} from './contentApi'
import CourseHead, { CourseLoadState } from './CourseHead'
import { useTeachCourse } from './teachApi'
import './teacher.css'

const TAGS = { video: ['VIDEO', 'tag-video'], pdf: ['PDF', 'tag-pdf'], page: ['BÀI ĐỌC', 'tag-page'], quiz: ['QUIZ', 'tag-quiz'], exam: ['KIỂM TRA', 'tag-exam'] }
const tagKey = (it) => (it.lesson_type === 'quiz' ? (it.quiz?.is_graded ? 'exam' : 'quiz') : it.lesson_type)
const swap = (a, i, j) => { const b = [...a];[b[i], b[j]] = [b[j], b[i]]; return b }
const LESSON_TYPES = [['video', 'Video'], ['pdf', 'PDF'], ['page', 'Bài đọc']]
const MEDIA_ACCEPT = { video: VIDEO_ACCEPT, pdf: 'application/pdf' }

function meta(it) {
    const q = it.quiz
    const base = it.lesson_type === 'video' ? `Video · ${it.media?.duration_seconds != null ? fmtDuration(it.media.duration_seconds) : `${it.estimated_minutes || '?'} phút`}`
        : it.lesson_type === 'pdf' ? `PDF · ${it.media?.filename ?? 'chưa có file'}${it.media?.page_count ? ` · ${it.media.page_count} trang` : ''}`
        : it.lesson_type === 'page' ? `Bài đọc · ${it.estimated_minutes || '?'} phút đọc`
        : `${q.is_graded ? 'Tính điểm' : 'Luyện tập'} · ${q.question_count} câu · ${q.time_limit_seconds ? `${Math.round(q.time_limit_seconds / 60)} phút` : 'không giới hạn thời gian'} · ${q.max_attempts ? `${q.max_attempts} lượt` : 'không giới hạn lượt'} · đạt ${q.pass_score_percent}%`
    const files = it.attachments?.length ? ` · ${it.attachments.length} tệp đính kèm` : ''
    return base + files + (it.status === 'draft' ? ' · Bản nháp' : '')
}

/* Bài học (API) ↔ form. Quiz: thời gian PHÚT ở form, GIÂY ở API; số lượt 0 = không giới hạn (API: null) */
const NEW_LESSON = { lesson_type: 'video', title: '', description: '', content: '', minutes: 5, status: 'draft', media: null, attachments: [], images: [] }
const NEW_TEST = { lesson_type: 'quiz', title: '', is_graded: false, minutes: 15, attempts: 2, pass: 80, status: 'draft', attachments: [], images: [] }

const toForm = (it) => ({
    id: it.id, lesson_type: it.lesson_type, title: it.title, description: it.description ?? '', content: it.content ?? '',
    minutes: it.lesson_type === 'quiz' ? (it.quiz.time_limit_seconds ? Math.round(it.quiz.time_limit_seconds / 60) : '') : (it.estimated_minutes ?? ''),
    status: it.status, media: it.media, attachments: it.attachments, images: it.images,
    ...(it.quiz ? { is_graded: it.quiz.is_graded, attempts: it.quiz.max_attempts ?? 0, pass: it.quiz.pass_score_percent } : {}),
})

const toBody = (ed) => (ed.lesson_type === 'quiz'
    ? {
        lesson_type: 'quiz', title: ed.title.trim(), status: ed.status,
        quiz: {
            is_graded: ed.is_graded, pass_score_percent: Number(ed.pass) || 0,
            time_limit_seconds: Number(ed.minutes) > 0 ? Number(ed.minutes) * 60 : null,
            max_attempts: Number(ed.attempts) > 0 ? Number(ed.attempts) : null,
        },
    }
    : {
        lesson_type: ed.lesson_type, title: ed.title.trim(), status: ed.status,
        description: ed.description.trim() || null,
        content: ed.lesson_type === 'page' ? ed.content : null,
        media_object_id: ed.lesson_type === 'page' ? null : ed.media?.id ?? null,
        estimated_minutes: Number(ed.minutes) > 0 ? Number(ed.minutes) : null,
        attachment_ids: ed.attachments.map((f) => f.id),
    })

const MoveBtns = ({ i, n, onMove, what, disabled }) => (
    <>
        <button type="button" className="btn btn--sm btn--square" disabled={disabled || i === 0} onClick={() => onMove(i, i - 1)} aria-label={`Chuyển ${what} lên`}>↑</button>
        <button type="button" className="btn btn--sm btn--square" disabled={disabled || i === n - 1} onClick={() => onMove(i, i + 1)} aria-label={`Chuyển ${what} xuống`}>↓</button>
    </>
)

export default function CourseContent() {
    const { courseId } = useParams()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { data: course, error, isPending } = useTeachCourse(courseId)
    const content = useCourseContent(courseId)
    const action = useContentAction(courseId)
    const [modal, setModal] = useState(null) // { kind: lesson|test|topic, sid, isNew }
    const [ed, setEd] = useState(null)
    const [errs, setErrs] = useState({})
    const [topic, setTopic] = useState({ title: '', description: '' })
    const [confirm, setConfirm] = useState(null)
    const [uploads, setUploads] = useState({}) // khóa ('media' | 'att:<tên>') → % đã tải
    const [toast, flash] = useToast()

    const sections = content.data?.sections ?? []
    const editable = content.data?.can_edit ?? false
    const busy = action.isPending
    const uploading = Object.keys(uploads).length > 0
    const quizUrl = (id) => `/teach/courses/${courseId}/quizzes/${id}`
    const items = sections.flatMap((s) => s.lessons)
    const nT = items.filter((it) => it.lesson_type === 'quiz').length
    const nDraft = items.filter((it) => it.status === 'draft').length

    const setE = (k) => (e) => {
        setEd((x) => ({ ...x, [k]: e.target.value }))
        setErrs((x) => ({ ...x, [k]: '' }))
    }
    const close = () => { if (!busy) { setModal(null); setEd(null); setUploads({}) } }
    const run = (req, { ok, onDone } = {}) => action.mutate(req, {
        onSuccess: (data) => { if (ok) flash(ok); onDone?.(data) },
        onError: (err) => (modal ? setErrs({ form: errorMessage(err) }) : flash(errorMessage(err))),
    })

    /* ---------- upload ---------- */
    async function upload(key, file) {
        setUploads((u) => ({ ...u, [key]: 0 }))
        try {
            return await uploadFile(courseId, file, (p) => setUploads((u) => ({ ...u, [key]: p })))
        } catch (err) {
            setErrs((x) => ({ ...x, [key === 'media' ? 'media' : 'attachments']: err.response ? errorMessage(err, `Không tải được “${file.name}”.`) : err.message || `Không tải được “${file.name}”.` }))
            return null
        } finally {
            setUploads((u) => { const rest = { ...u }; delete rest[key]; return rest })
        }
    }

    async function pickMedia(file) {
        setErrs((x) => ({ ...x, media: '' }))
        const f = await upload('media', file)
        if (f) setEd((x) => ({ ...x, media: f }))
    }

    async function pickAttachments(files) {
        setErrs((x) => ({ ...x, attachments: '' }))
        for (const file of files) {
            const f = await upload(`att:${file.name}`, file)
            if (f) setEd((x) => ({ ...x, attachments: [...x.attachments, f] }))
        }
    }

    async function uploadImage(file) {
        const f = await uploadFile(courseId, file)
        setEd((x) => ({ ...x, images: [...x.images, f] }))
        return f
    }

    // Xem trước bài đọc: file:<id> → URL tạm thời của ảnh đã tải lên
    const resolveImage = (src) => {
        const m = /^file:(\d+)$/.exec(src ?? '')
        if (!m) return src
        return ed?.images.find((f) => f.id === Number(m[1]))?.url ?? ''
    }

    /* ---------- bài học ---------- */
    function validate() {
        const e = {}
        if (!ed.title.trim()) e.title = ed.lesson_type === 'quiz' ? 'Vui lòng nhập tên bài kiểm tra.' : 'Vui lòng nhập tiêu đề.'
        // ck_lessons_media: video/pdf bắt buộc có file
        if ((ed.lesson_type === 'video' || ed.lesson_type === 'pdf') && !ed.media) e.media = ed.lesson_type === 'video' ? 'Vui lòng chọn file video.' : 'Vui lòng chọn file PDF.'
        if (ed.lesson_type === 'page' && !ed.content.trim()) e.content = 'Vui lòng nhập nội dung bài đọc.'
        if (ed.lesson_type === 'quiz' && (Number(ed.pass) < 0 || Number(ed.pass) > 100)) e.pass = 'Điểm đạt từ 0 đến 100.'
        setErrs(e)
        return !Object.keys(e).length
    }

    function saveItem(thenEditQuestions) {
        if (!validate()) return
        const { isNew, sid } = modal
        run(isNew
            ? { method: 'post', path: `/sections/${sid}/lessons`, body: toBody(ed) }
            : { method: 'patch', path: `/lessons/${ed.id}`, body: toBody(ed) }, {
            ok: `${isNew ? 'Đã thêm' : 'Đã lưu'} “${ed.title.trim()}”${ed.status === 'draft' ? ' (bản nháp, học viên chưa thấy)' : ''}.`,
            onDone: (saved) => {
                setModal(null)
                setEd(null)
                if (thenEditQuestions) navigate(quizUrl(saved.id))
            },
        })
    }

    const openLesson = (sid, it) => {
        setErrs({})
        setUploads({})
        setEd(it ? toForm(it) : { ...(sid.test ? NEW_TEST : NEW_LESSON) })
        setModal({ kind: (it ? it.lesson_type === 'quiz' : sid.test) ? 'test' : 'lesson', sid: sid.id, isNew: !it })
    }

    /* ---------- chủ đề ---------- */
    function saveTopic() {
        const title = topic.title.trim()
        if (!title) { setErrs({ topic: 'Vui lòng nhập tên chủ đề.' }); return }
        const body = { title, description: topic.description.trim() || null }
        run(modal.isNew
            ? { method: 'post', path: '/sections', body }
            : { method: 'patch', path: `/sections/${modal.sid}`, body }, {
            ok: `Đã lưu chủ đề “${title}”.`,
            onDone: () => setModal(null),
        })
    }

    // Đổi chỗ ngay trên giao diện rồi gửi thứ tự mới; lỗi → onSettled tải lại thứ tự thật
    function move(path, ids, patch) {
        qc.setQueryData(contentKey(courseId), (old) => old && { ...old, sections: patch(old.sections) })
        run({ method: 'put', path, body: { ids } })
    }
    const moveSection = (a, b) => {
        const next = swap(sections, a, b)
        move('/sections/order', next.map((s) => s.id), () => next)
    }
    const moveLesson = (s, a, b) => {
        const next = swap(s.lessons, a, b)
        move(`/sections/${s.id}/lessons/order`, next.map((x) => x.id),
            (all) => all.map((x) => (x.id === s.id ? { ...x, lessons: next } : x)))
    }

    function doConfirm() {
        const c = confirm
        setConfirm(null)
        run({ method: 'delete', path: c.kind === 'topic' ? `/sections/${c.id}` : `/lessons/${c.id}` }, { ok: `Đã xóa “${c.name}”.` })
    }

    if (isPending || error) return <CourseLoadState error={error} />

    return (
        <>
            <CourseHead course={course}
                action={<Link to={`/courses/${course.id}`} className="btn" style={{ minHeight: 40 }}>Xem như học viên</Link>} />
            <main className="container container--1000 container--teach" style={{ paddingTop: 24, gap: 16 }}>
                {content.isPending && <div className="center-state">Đang tải nội dung…</div>}
                {content.error && <div role="alert" className="status-msg status-msg--error">{errorMessage(content.error, 'Không tải được nội dung khóa học.')}</div>}
                {content.data && (
                    <>
                        <div className="row-between">
                            <p className="text-2" style={{ fontSize: 15 }}>
                                {sections.length} chủ đề · {items.length - nT} bài học · {nT} bài kiểm tra{nDraft ? ` · ${nDraft} bản nháp` : ''}
                                {course.is_sequential && ' · Học tuần tự'}
                            </p>
                            {editable && (
                                <button type="button" className="btn btn--outline" style={{ minHeight: 40 }}
                                    onClick={() => { setErrs({}); setModal({ kind: 'topic', isNew: true }); setTopic({ title: '', description: '' }) }}>+ Thêm chủ đề</button>
                            )}
                        </div>
                        {!editable && <div className="status-msg">Bạn là trợ giảng của khóa này: chỉ xem được nội dung, không chỉnh sửa.</div>}
                        {sections.length === 0 && <p className="empty-note card">Khóa học chưa có chủ đề nào. Bấm “Thêm chủ đề” để bắt đầu soạn nội dung.</p>}
                    </>
                )}

                {sections.map((s, i) => (
                    <section key={s.id} className="card topic-box" aria-labelledby={`tp-${s.id}`}>
                        <div className="topic-box__head">
                            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>CHỦ ĐỀ {i + 1}</span>
                                <h2 id={`tp-${s.id}`} style={{ fontSize: 17, fontWeight: 700 }}>{s.title}</h2>
                                {s.description && <span className="small text-2">{s.description}</span>}
                            </div>
                            {editable && (
                                <div className="row" style={{ gap: 6 }}>
                                    <MoveBtns i={i} n={sections.length} what="chủ đề" disabled={busy} onMove={moveSection} />
                                    <button type="button" className="btn btn--sm"
                                        onClick={() => { setErrs({}); setModal({ kind: 'topic', sid: s.id }); setTopic({ title: s.title, description: s.description ?? '' }) }}>Sửa</button>
                                    <button type="button" className="btn btn--sm btn--danger-ghost"
                                        onClick={() => setConfirm({ kind: 'topic', id: s.id, name: s.title, n: s.lessons.length })}>Xóa</button>
                                </div>
                            )}
                        </div>
                        <ul>
                            {s.lessons.map((it, j) => {
                                const [label, cls] = TAGS[tagKey(it)]
                                return (
                                    <li key={it.id} className={it.status === 'draft' ? 'is-draft' : undefined}>
                                        <span className={`item-tag ${cls}`}>{label}</span>
                                        <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span style={{ fontSize: 15, fontWeight: 600 }}>{it.title}</span>
                                            <span className="small text-2">{meta(it)}</span>
                                        </div>
                                        {editable && (
                                            <div className="row" style={{ gap: 6 }}>
                                                <MoveBtns i={j} n={s.lessons.length} what="bài" disabled={busy} onMove={(a, b) => moveLesson(s, a, b)} />
                                                {it.lesson_type === 'quiz' && <Link to={quizUrl(it.id)} className="btn btn--sm btn--soft">Soạn câu hỏi</Link>}
                                                <button type="button" className="btn btn--sm" aria-label={`Sửa ${it.title}`} onClick={() => openLesson({ id: s.id }, it)}>Sửa</button>
                                                <button type="button" className="btn btn--sm btn--danger-ghost" aria-label={`Xóa ${it.title}`}
                                                    onClick={() => setConfirm({ kind: 'item', id: it.id, name: it.title, isTest: it.lesson_type === 'quiz' })}>Xóa</button>
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                        {s.lessons.length === 0 && <p className="text-2" style={{ padding: '14px 16px', fontSize: 14 }}>Chủ đề chưa có bài học.</p>}
                        {editable && (
                            <div className="row" style={{ gap: 8, padding: '12px 16px' }}>
                                <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }} onClick={() => openLesson({ id: s.id })}>+ Bài học</button>
                                <button type="button" className="btn btn--sm btn--dashed" style={{ minHeight: 36 }} onClick={() => openLesson({ id: s.id, test: true })}>+ Bài kiểm tra</button>
                            </div>
                        )}
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
                        <button type="button" className="btn" onClick={close} disabled={busy}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={() => saveItem(false)} disabled={busy || uploading}>
                            {busy ? 'Đang lưu…' : uploading ? 'Đang tải file…' : 'Lưu bài học'}
                        </button>
                    </>}>
                    <div className="dialog__body">
                        {errs.form && <div role="alert" className="status-msg status-msg--error">{errs.form}</div>}
                        <div className="field">
                            <label htmlFor="l-t">Tiêu đề bài học <span className="req">*</span></label>
                            <input id="l-t" className={`input${errs.title ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus maxLength={255} />
                            {errs.title && <span className="error">{errs.title}</span>}
                        </div>
                        <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <legend style={{ padding: 0, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Loại bài học</legend>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {LESSON_TYPES.map(([v, t]) => (
                                    <label key={v} className={`radio-card${ed.lesson_type === v ? ' is-on' : ''}`}>
                                        <input type="radio" name="lt" checked={ed.lesson_type === v} disabled={'media' in uploads}
                                            onChange={() => { setEd((x) => ({ ...x, lesson_type: v, media: v === x.lesson_type ? x.media : null })); setErrs({}) }} />{t}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {(ed.lesson_type === 'video' || ed.lesson_type === 'pdf') && (
                            <div className="field">
                                <label htmlFor="l-f">{ed.lesson_type === 'video' ? 'File video (MP4, WebM)' : 'File PDF'} <span className="req">*</span></label>
                                {ed.media && (
                                    <span className="small text-2">
                                        Hiện tại: <strong>{ed.media.filename}</strong> · {fmtSize(ed.media.size_bytes)}
                                        {ed.media.duration_seconds != null && ` · ${fmtDuration(ed.media.duration_seconds)}`} · chọn file khác để thay
                                    </span>
                                )}
                                {'media' in uploads
                                    ? <ProgressBar value={uploads.media} label="Tiến độ tải file" />
                                    : <input id="l-f" type="file" accept={MEDIA_ACCEPT[ed.lesson_type]} className={`file-input${errs.media ? ' is-invalid' : ''}`}
                                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickMedia(f) }} />}
                                {errs.media && <span className="error">{errs.media}</span>}
                                <span className="hint">Tối đa {fmtSize(MAX_UPLOAD_BYTES)} mỗi file; file lớn được chia nhỏ và tải song song.</span>
                            </div>
                        )}

                        {ed.lesson_type === 'page' ? (
                            <div className="field">
                                <label htmlFor="l-b">Nội dung bài đọc <span className="req">*</span></label>
                                <MarkdownEditor id="l-b" value={ed.content} onUploadImage={uploadImage} resolveFile={resolveImage}
                                    onChange={(v) => { setEd((x) => ({ ...x, content: v })); setErrs((x) => ({ ...x, content: '' })) }} />
                                {errs.content && <span className="error">{errs.content}</span>}
                            </div>
                        ) : (
                            <div className="field">
                                <label htmlFor="l-b">{ed.lesson_type === 'video' ? 'Mô tả bên dưới video' : 'Mô tả tài liệu'}</label>
                                <textarea id="l-b" rows={3} className="textarea" value={ed.description} onChange={setE('description')} />
                            </div>
                        )}

                        <div className="field-row">
                            <div className="field field--narrow" style={{ flex: '0 1 200px' }}>
                                <label htmlFor="l-d">{ed.lesson_type === 'page' ? 'Thời gian đọc (phút)' : 'Thời lượng ước tính (phút)'}</label>
                                <input id="l-d" type="number" min="1" className="input" value={ed.minutes} onChange={setE('minutes')} />
                            </div>
                        </div>

                        <div className="field">
                            <label htmlFor="l-a">Tài liệu đính kèm</label>
                            {(ed.attachments.length > 0 || uploading) && (
                                <ul className="att-edit">
                                    {ed.attachments.map((f) => (
                                        <li key={f.id}>
                                            <span>{f.filename} <span className="small text-2">· {fmtSize(f.size_bytes)}</span></span>
                                            <button type="button" className="x-btn" style={{ width: 30, height: 30, fontSize: 15 }} aria-label={`Bỏ ${f.filename}`}
                                                onClick={() => setEd((x) => ({ ...x, attachments: x.attachments.filter((a) => a.id !== f.id) }))}>×</button>
                                        </li>
                                    ))}
                                    {Object.entries(uploads).filter(([k]) => k.startsWith('att:')).map(([k, p]) => (
                                        <li key={k}><span>{k.slice(4)} <span className="small text-2">· đang tải {p}%</span></span></li>
                                    ))}
                                </ul>
                            )}
                            <input id="l-a" type="file" multiple accept={ATTACHMENT_ACCEPT} className="file-input" style={{ borderWidth: 1, borderStyle: 'solid', padding: 10 }}
                                onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; pickAttachments(files) }} />
                            {errs.attachments && <span className="error">{errs.attachments}</span>}
                            <span className="hint">Học viên tải về ở cuối bài học. PDF, Word, Excel, PowerPoint, ZIP, ảnh; tối đa {fmtSize(MAX_UPLOAD_BYTES)} mỗi file.</span>
                        </div>
                    </div>
                </Modal>
            )}

            {modal?.kind === 'test' && (
                <Modal title={modal.isNew ? 'Thêm bài kiểm tra' : 'Sửa bài kiểm tra'} width={560} onClose={close}
                    footer={<>
                        <button type="button" className="btn" onClick={close} disabled={busy}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={() => saveItem(false)} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
                        <button type="button" className="btn btn--primary" style={{ background: 'var(--primary-dark)' }} onClick={() => saveItem(true)} disabled={busy}>Lưu &amp; soạn câu hỏi</button>
                    </>}>
                    <div className="dialog__body">
                        {errs.form && <div role="alert" className="status-msg status-msg--error">{errs.form}</div>}
                        <div className="field">
                            <label htmlFor="t-t">Tên bài kiểm tra <span className="req">*</span></label>
                            <input id="t-t" className={`input${errs.title ? ' is-invalid' : ''}`} value={ed.title} onChange={setE('title')} autoFocus maxLength={255} />
                            {errs.title && <span className="error">{errs.title}</span>}
                        </div>
                        <div className="field"><label htmlFor="t-k">Loại</label>
                            <select id="t-k" className="select" value={ed.is_graded ? 'graded' : 'practice'}
                                onChange={(e) => setEd((x) => ({ ...x, is_graded: e.target.value === 'graded' }))}>
                                <option value="practice">Quiz luyện tập (không tính điểm)</option><option value="graded">Bài kiểm tra tính điểm</option>
                            </select></div>
                        <div className="field-row">
                            <div className="field field--narrow"><label htmlFor="t-m">Thời gian (phút)</label><input id="t-m" type="number" min="1" className="input" value={ed.minutes} onChange={setE('minutes')} /></div>
                            <div className="field field--narrow"><label htmlFor="t-a">Số lượt làm</label><input id="t-a" type="number" min="0" className="input" value={ed.attempts} onChange={setE('attempts')} /></div>
                            <div className="field field--narrow"><label htmlFor="t-p">Điểm đạt (%)</label>
                                <input id="t-p" type="number" min="0" max="100" className={`input${errs.pass ? ' is-invalid' : ''}`} value={ed.pass} onChange={setE('pass')} />
                                {errs.pass && <span className="error">{errs.pass}</span>}</div>
                        </div>
                        <span className="small text-2">Bỏ trống thời gian = không giới hạn; số lượt làm = 0 nghĩa là không giới hạn. Câu hỏi, giờ mở/đóng và chính sách xem đáp án được cài ở bước soạn câu hỏi.</span>
                        <label className="check">
                            <input type="checkbox" checked={ed.status === 'published'}
                                onChange={(e) => setEd((x) => ({ ...x, status: e.target.checked ? 'published' : 'draft' }))} />
                            Xuất bản (học viên nhìn thấy)
                        </label>
                    </div>
                </Modal>
            )}

            {modal?.kind === 'topic' && (
                <Modal title={modal.isNew ? 'Thêm chủ đề' : 'Sửa chủ đề'} width={520} onClose={close}
                    footer={<>
                        <button type="button" className="btn" onClick={close} disabled={busy}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={saveTopic} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
                    </>}>
                    <div className="dialog__body">
                        {errs.form && <div role="alert" className="status-msg status-msg--error">{errs.form}</div>}
                        <div className="field">
                            <label htmlFor="tp-n">Tên chủ đề <span className="req">*</span></label>
                            <input id="tp-n" className={`input${errs.topic ? ' is-invalid' : ''}`} value={topic.title} maxLength={255} autoFocus
                                onChange={(e) => { setTopic((x) => ({ ...x, title: e.target.value })); setErrs({}) }}
                                onKeyDown={(e) => e.key === 'Enter' && saveTopic()} />
                            {errs.topic && <span className="error">{errs.topic}</span>}
                        </div>
                        <div className="field">
                            <label htmlFor="tp-d">Tóm tắt</label>
                            <textarea id="tp-d" rows={2} className="textarea" value={topic.description}
                                onChange={(e) => setTopic((x) => ({ ...x, description: e.target.value }))} />
                            <span className="hint">Hiện dưới tên chủ đề trên trang khóa học của học viên.</span>
                        </div>
                    </div>
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === 'topic' ? 'Xóa chủ đề?' : confirm.isTest ? 'Xóa bài kiểm tra?' : 'Xóa bài học?'}
                    text={confirm.kind === 'topic'
                        ? `Chủ đề “${confirm.name}”${confirm.n ? ` cùng ${confirm.n} bài bên trong` : ''} sẽ bị gỡ khỏi khóa học. Kết quả học tập học viên đã có vẫn được lưu lại.`
                        : `“${confirm.name}” sẽ bị gỡ khỏi khóa học, học viên không còn thấy${confirm.isTest ? ' bài kiểm tra này. Kết quả làm bài đã có vẫn được lưu lại.' : ' bài này. Tiến độ đã có vẫn được lưu lại.'}`}
                    onCancel={() => setConfirm(null)} onConfirm={doConfirm} />
            )}
            {toast}
        </>
    )
}
