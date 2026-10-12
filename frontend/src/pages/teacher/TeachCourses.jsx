import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../api'
import { useToast } from '../../components/hooks'
import { ConfirmDialog, Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { COURSE_STATUS, deptShort, fmtDate } from '../../data/mock'
import { fromDueAt, toDueAt, useDeleteCourse, useDepartments, useSaveCourse, useTeachCourses } from './teachApi'
import './teacher.css'

const EMPTY = {
    code: '', title: '', short_description: '', description: '', department_id: '',
    is_mandatory: true, is_sequential: false, default_due_at: '', status: 'draft',
}

// Khóa học (API) → giá trị form: null → '', hạn hoàn thành → 'YYYY-MM-DD' giờ Việt Nam
const toForm = (c) => ({
    ...EMPTY,
    ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? EMPTY[k]])),
    department_id: c.department ? String(c.department.id) : '',
    default_due_at: fromDueAt(c.default_due_at),
})

// Giá trị form → body API: chuỗi rỗng → null
const toBody = (f) => ({
    ...f,
    code: f.code.trim().toUpperCase(),
    title: f.title.trim(),
    short_description: f.short_description.trim() || null,
    description: f.description.trim() || null,
    department_id: f.department_id ? Number(f.department_id) : null,
    default_due_at: toDueAt(f.default_due_at),
})

export default function TeachCourses() {
    const { data, error, isPending } = useTeachCourses()
    const { data: departments = [] } = useDepartments()
    const saveMut = useSaveCourse()
    const delMut = useDeleteCourse()
    const [q, setQ] = useState('')
    const [f, setF] = useState('all')
    const [modal, setModal] = useState(null) // null | 'new' | id
    const [form, setForm] = useState(EMPTY)
    const [errs, setErrs] = useState({})
    const [delId, setDelId] = useState(null)
    const [toast, flash] = useToast()

    const courses = data?.items ?? []
    const list = courses.filter((c) => (f === 'all' || c.status === f)
        && (!q || `${c.title} ${c.code}`.toLowerCase().includes(q.toLowerCase())))
    const enrol = courses.reduce((s, c) => s + c.learner_count, 0)
    const done = courses.reduce((s, c) => s + c.completed_count, 0)
    const count = (st) => courses.filter((c) => c.status === st).length
    const delCourse = courses.find((c) => c.id === delId)
    const set = (k) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        setForm((x) => ({ ...x, [k]: v }))
        setErrs((x) => ({ ...x, [k]: '' }))
    }

    const openForm = (c) => {
        setErrs({})
        setModal(c ? c.id : 'new')
        setForm(c ? toForm(c) : EMPTY)
    }

    function save() {
        const body = toBody(form)
        const e = {}
        if (!body.code) e.code = 'Vui lòng nhập mã khóa học.'
        if (!body.title) e.title = 'Vui lòng nhập tên khóa học.'
        if (Object.keys(e).length) { setErrs(e); return }
        const isNew = modal === 'new'
        saveMut.mutate({ id: isNew ? null : modal, body }, {
            onSuccess: (c) => {
                setModal(null)
                flash(isNew ? `Đã tạo khóa học “${c.title}”. Vào “Nội dung” để thêm chủ đề và bài học.` : 'Đã lưu thay đổi.')
            },
            // courses.code là UNIQUE → 409 hiện ngay dưới ô mã khóa
            onError: (err) => setErrs(err.response?.status === 409
                ? { code: errorMessage(err) }
                : { form: errorMessage(err, 'Không lưu được khóa học.') }),
        })
    }

    function doDelete() {
        const c = delCourse
        delMut.mutate(c.id, {
            onSuccess: () => { setDelId(null); flash(`Đã xóa khóa học “${c.title}”.`) },
            onError: (err) => { setDelId(null); flash(errorMessage(err, 'Không xóa được khóa học.')) },
        })
    }

    return (
        <main className="container container--1280 container--teach">
            <div className="row-between">
                <h1 className="page-title">Khóa học</h1>
                <button type="button" className="btn btn--primary" style={{ minHeight: 44, fontSize: 15 }} onClick={() => openForm(null)}>+ Tạo khóa học</button>
            </div>

            <div className="stats">
                <Stat label="Khóa học" value={courses.length}
                    sub={`${count('published')} đang mở · ${count('draft')} bản nháp · ${count('archived')} lưu trữ`} />
                <Stat label="Lượt ghi danh" value={enrol} sub="trên tất cả khóa học" />
                <Stat label="Tỉ lệ hoàn thành chung" value={`${enrol ? Math.round((done / enrol) * 100) : 0}%`} sub={`${done} lượt đã hoàn thành`} />
            </div>

            <section aria-labelledby="lh" className="card">
                <div className="card__toolbar">
                    <h2 id="lh">Danh sách khóa học</h2>
                    <SearchInput id="cq" label="Tìm khóa học" value={q} onChange={setQ} placeholder="Tìm tên hoặc mã khóa" />
                    <SelectFilter id="cf" label="Lọc trạng thái" value={f} onChange={setF}
                        options={[['all', 'Mọi trạng thái'], ...Object.entries(COURSE_STATUS).map(([k, v]) => [k, v.label])]} />
                </div>
                <div className="table-wrap">
                    <table className="table" style={{ minWidth: 1000 }}>
                        <thead><tr>
                            <th scope="col">Khóa học</th><th scope="col">Trạng thái</th><th scope="col">Nội dung</th><th scope="col">Học viên</th>
                            <th scope="col">Tỉ lệ hoàn thành</th><th scope="col">Hạn mặc định</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                        </tr></thead>
                        <tbody>
                            {list.map((c) => {
                                const st = COURSE_STATUS[c.status]
                                const r = c.learner_count ? Math.round((c.completed_count / c.learner_count) * 100) : 0
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            <Link to={`/teach/courses/${c.id}/stats`} className="cell-title">{c.title}</Link>
                                            <div className="small text-2">
                                                {c.code} · {c.department ? deptShort(c.department.code) : 'Chung'} · {c.is_mandatory ? 'Bắt buộc' : 'Tự chọn'}
                                                {c.is_sequential ? ' · Học tuần tự' : ''}{c.my_role === 'assistant' ? ' · Trợ giảng' : ''}
                                            </div>
                                        </td>
                                        <td><span className={`pill pill--${st.tone}`}>{st.label}</span></td>
                                        <td><Link to={`/teach/courses/${c.id}/content`} style={{ color: 'inherit' }}>{c.lesson_count} bài học · {c.quiz_count} bài kiểm tra</Link></td>
                                        <td>{c.learner_count}</td>
                                        <td>
                                            <div className="progress-row">
                                                <div style={{ width: 100 }}><ProgressBar value={r} done={r >= 80} label={`Tỉ lệ hoàn thành ${c.title}`} /></div>
                                                <span style={{ fontWeight: 600 }}>{c.learner_count ? `${r}%` : '—'}</span>
                                            </div>
                                        </td>
                                        <td>{fmtDate(fromDueAt(c.default_due_at))}</td>
                                        <td><div className="actions">
                                            {c.can_edit && <button type="button" className="btn btn--sm" onClick={() => openForm(c)} aria-label={`Sửa khóa ${c.title}`}>Sửa</button>}
                                            {c.can_delete && <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => setDelId(c.id)} aria-label={`Xóa khóa ${c.title}`}>Xóa</button>}
                                        </div></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {isPending && <p className="empty-note">Đang tải…</p>}
                {error && <div role="alert" className="status-msg status-msg--error" style={{ margin: 16 }}>{errorMessage(error, 'Không tải được danh sách khóa học.')}</div>}
                {data && list.length === 0 && (
                    <p className="empty-note">{courses.length ? 'Không có khóa học nào phù hợp.' : 'Bạn chưa phụ trách khóa học nào. Bấm “Tạo khóa học” để bắt đầu.'}</p>
                )}
            </section>

            {modal !== null && (
                <Modal title={modal === 'new' ? 'Tạo khóa học' : 'Sửa khóa học'} width={620} onClose={() => setModal(null)}
                    footer={<>
                        <button type="button" className="btn" onClick={() => setModal(null)}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={save} disabled={saveMut.isPending}>
                            {saveMut.isPending ? 'Đang lưu…' : modal === 'new' ? 'Tạo khóa học' : 'Lưu thay đổi'}
                        </button>
                    </>}>
                    <div className="dialog__body">
                        {errs.form && <div role="alert" className="status-msg status-msg--error">{errs.form}</div>}
                        <div className="field-row">
                            <div className="field field--narrow">
                                <label htmlFor="f-c">Mã khóa <span className="req">*</span></label>
                                <input id="f-c" className={`input${errs.code ? ' is-invalid' : ''}`} value={form.code} onChange={set('code')}
                                    placeholder="VD: ATLD-01" maxLength={50} autoFocus style={{ textTransform: 'uppercase' }} />
                                {errs.code && <span className="error">{errs.code}</span>}
                            </div>
                            <div className="field" style={{ flex: '3 1 300px' }}>
                                <label htmlFor="f-t">Tên khóa học <span className="req">*</span></label>
                                <input id="f-t" className={`input${errs.title ? ' is-invalid' : ''}`} value={form.title} onChange={set('title')} maxLength={255} />
                                {errs.title && <span className="error">{errs.title}</span>}
                            </div>
                        </div>
                        <div className="field">
                            <label htmlFor="f-sd">Mô tả ngắn</label>
                            <input id="f-sd" className="input" value={form.short_description} onChange={set('short_description')} maxLength={500}
                                placeholder="Một câu hiện dưới tên khóa trong danh sách" />
                        </div>
                        <div className="field">
                            <label htmlFor="f-d">Mô tả chi tiết</label>
                            <textarea id="f-d" rows={3} className="textarea" value={form.description} onChange={set('description')} />
                        </div>
                        <div className="field-row">
                            <div className="field"><label htmlFor="f-p">Phòng ban phụ trách</label>
                                <select id="f-p" className="select" value={form.department_id} onChange={set('department_id')}>
                                    <option value="">Chung (không thuộc phòng ban)</option>
                                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select></div>
                            <div className="field"><label htmlFor="f-k">Loại</label>
                                <select id="f-k" className="select" value={form.is_mandatory ? 'mandatory' : 'optional'}
                                    onChange={(e) => setForm((x) => ({ ...x, is_mandatory: e.target.value === 'mandatory' }))}>
                                    <option value="mandatory">Bắt buộc</option><option value="optional">Tự chọn</option>
                                </select></div>
                        </div>
                        <div className="field-row">
                            <div className="field"><label htmlFor="f-h">Hạn hoàn thành mặc định</label>
                                <input id="f-h" type="date" className="input" value={form.default_due_at} onChange={set('default_due_at')} />
                                <span className="hint">Áp dụng khi ghi danh học viên mà không đặt hạn riêng.</span></div>
                            <div className="field"><label htmlFor="f-s">Trạng thái</label>
                                <select id="f-s" className="select" value={form.status} onChange={set('status')}>
                                    <option value="draft">Bản nháp (học viên chưa thấy)</option>
                                    <option value="published">Đang mở</option>
                                    <option value="archived">Lưu trữ (ngừng ghi danh mới)</option>
                                </select></div>
                        </div>
                        <label className="check">
                            <input type="checkbox" checked={form.is_sequential} onChange={set('is_sequential')} />
                            Học tuần tự theo chủ đề (phải hoàn thành chủ đề trước mới mở chủ đề sau)
                        </label>
                    </div>
                </Modal>
            )}

            {delCourse && (
                <ConfirmDialog title="Xóa khóa học?" confirmLabel={delMut.isPending ? 'Đang xóa…' : 'Xóa khóa học'}
                    text={`Khóa “${delCourse.title}” sẽ bị gỡ khỏi danh sách của giảng viên${delCourse.learner_count ? ` và ${delCourse.learner_count} học viên đang ghi danh` : ''}. Không thể hoàn tác.`}
                    onCancel={() => setDelId(null)}
                    onConfirm={() => !delMut.isPending && doDelete()} />
            )}
            {toast}
        </main>
    )
}
