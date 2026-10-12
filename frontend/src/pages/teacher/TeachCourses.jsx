import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/hooks'
import { ConfirmDialog, Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { COURSE_STATUS, DEPARTMENTS, deptShort, fmtDate, getTeacherCourses } from '../../data/mock'
import './teacher.css'

const EMPTY = {
    code: '', title: '', short_description: '', description: '', department: 'HSE',
    is_mandatory: true, is_sequential: false, default_due_at: '', status: 'draft',
}

export default function TeachCourses() {
    const [courses, setCourses] = useState(getTeacherCourses)
    const [q, setQ] = useState('')
    const [f, setF] = useState('all')
    const [modal, setModal] = useState(null) // null | 'new' | id
    const [form, setForm] = useState(EMPTY)
    const [errs, setErrs] = useState({})
    const [delId, setDelId] = useState(null)
    const [toast, flash] = useToast()

    const list = courses.filter((c) => (f === 'all' || c.status === f)
        && (!q || `${c.title} ${c.code}`.toLowerCase().includes(q.toLowerCase())))
    const enrol = courses.reduce((s, c) => s + c.learners, 0)
    const done = courses.reduce((s, c) => s + c.done, 0)
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
        setForm(c ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? EMPTY[k]])) : EMPTY)
    }

    function save() {
        const code = form.code.trim().toUpperCase()
        const e = {}
        if (!code) e.code = 'Vui lòng nhập mã khóa học.'
        // courses.code là UNIQUE
        else if (courses.some((c) => c.code === code && c.id !== modal)) e.code = 'Mã khóa học đã tồn tại.'
        if (!form.title.trim()) e.title = 'Vui lòng nhập tên khóa học.'
        if (Object.keys(e).length) { setErrs(e); return }
        const data = { ...form, code }
        if (modal === 'new') {
            const id = Math.max(0, ...courses.map((c) => c.id)) + 1
            setCourses((cs) => [{ id, lessons: 0, tests: 0, learners: 0, done: 0, thumbnail_url: null, colors: ['#0F6CBF', '#2A82CF'], ...data }, ...cs])
            flash(`Đã tạo khóa học “${form.title}”. Vào “Nội dung” để thêm chủ đề và bài học.`)
        } else {
            setCourses((cs) => cs.map((c) => (c.id === modal ? { ...c, ...data } : c)))
            flash('Đã lưu thay đổi.')
        }
        setModal(null)
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
                                const r = c.learners ? Math.round((c.done / c.learners) * 100) : 0
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            <Link to={`/teach/courses/${c.id}/stats`} className="cell-title">{c.title}</Link>
                                            <div className="small text-2">{c.code} · {deptShort(c.department)} · {c.is_mandatory ? 'Bắt buộc' : 'Tự chọn'}{c.is_sequential ? ' · Học tuần tự' : ''}</div>
                                        </td>
                                        <td><span className={`pill pill--${st.tone}`}>{st.label}</span></td>
                                        <td><Link to={`/teach/courses/${c.id}/content`} style={{ color: 'inherit' }}>{c.lessons} bài học · {c.tests} bài kiểm tra</Link></td>
                                        <td>{c.learners}</td>
                                        <td>
                                            <div className="progress-row">
                                                <div style={{ width: 100 }}><ProgressBar value={r} done={r >= 80} label={`Tỉ lệ hoàn thành ${c.title}`} /></div>
                                                <span style={{ fontWeight: 600 }}>{c.learners ? `${r}%` : '—'}</span>
                                            </div>
                                        </td>
                                        <td>{fmtDate(c.default_due_at)}</td>
                                        <td><div className="actions">
                                            <button type="button" className="btn btn--sm" onClick={() => openForm(c)} aria-label={`Sửa khóa ${c.title}`}>Sửa</button>
                                            <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => setDelId(c.id)} aria-label={`Xóa khóa ${c.title}`}>Xóa</button>
                                        </div></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {list.length === 0 && <p className="empty-note">Không có khóa học nào phù hợp.</p>}
            </section>

            {modal !== null && (
                <Modal title={modal === 'new' ? 'Tạo khóa học' : 'Sửa khóa học'} width={620} onClose={() => setModal(null)}
                    footer={<>
                        <button type="button" className="btn" onClick={() => setModal(null)}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={save}>{modal === 'new' ? 'Tạo khóa học' : 'Lưu thay đổi'}</button>
                    </>}>
                    <div className="dialog__body">
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
                                <select id="f-p" className="select" value={form.department} onChange={set('department')}>
                                    {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
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
                <ConfirmDialog title="Xóa khóa học?" confirmLabel="Xóa khóa học"
                    text={`Khóa “${delCourse.title}” cùng toàn bộ bài học, bài kiểm tra${delCourse.learners ? ` và tiến độ của ${delCourse.learners} học viên` : ''} sẽ bị xóa. Không thể hoàn tác.`}
                    onCancel={() => setDelId(null)}
                    onConfirm={() => { setCourses((cs) => cs.filter((c) => c.id !== delCourse.id)); setDelId(null); flash(`Đã xóa khóa học “${delCourse.title}”.`) }} />
            )}
            {toast}
        </main>
    )
}
