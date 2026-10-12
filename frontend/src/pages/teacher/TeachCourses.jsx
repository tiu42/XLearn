import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog, Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { useToast } from '../../components/hooks'
import { fmtDate, getTeacherCourses } from '../../data/mock'
import './teacher.css'

const EMPTY = { title: '', desc: '', dept: 'HSE', kind: 'Bắt buộc', due: '', status: 'draft' }

export default function TeachCourses() {
    const [courses, setCourses] = useState(getTeacherCourses)
    const [q, setQ] = useState('')
    const [f, setF] = useState('all')
    const [modal, setModal] = useState(null) // null | 'new' | id
    const [form, setForm] = useState(EMPTY)
    const [err, setErr] = useState(false)
    const [delId, setDelId] = useState(null)
    const [toast, flash] = useToast()

    const list = courses.filter((c) => (f === 'all' || c.status === f) && (!q || c.title.toLowerCase().includes(q.toLowerCase())))
    const enrol = courses.reduce((s, c) => s + c.learners, 0)
    const done = courses.reduce((s, c) => s + c.done, 0)
    const delCourse = courses.find((c) => c.id === delId)
    const set = (k) => (e) => { setForm((x) => ({ ...x, [k]: e.target.value })); if (k === 'title') setErr(false) }

    const openForm = (c) => {
        setErr(false)
        setModal(c ? c.id : 'new')
        setForm(c ? { title: c.title, desc: c.desc, dept: c.dept, kind: c.kind, due: c.due, status: c.status } : EMPTY)
    }

    function save() {
        if (!form.title.trim()) { setErr(true); return }
        if (modal === 'new') {
            const id = Math.max(0, ...courses.map((c) => c.id)) + 1
            setCourses((cs) => [{ id, lessons: 0, tests: 0, learners: 0, done: 0, ...form }, ...cs])
            flash(`Đã tạo khóa học “${form.title}”. Vào “Nội dung” để thêm bài học.`)
        } else {
            setCourses((cs) => cs.map((c) => (c.id === modal ? { ...c, ...form } : c)))
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
                    sub={`${courses.filter((c) => c.status === 'open').length} đang mở · ${courses.filter((c) => c.status === 'draft').length} bản nháp`} />
                <Stat label="Lượt ghi danh" value={enrol} sub="trên tất cả khóa học" />
                <Stat label="Tỉ lệ hoàn thành chung" value={`${enrol ? Math.round((done / enrol) * 100) : 0}%`} sub={`${done} lượt đã hoàn thành`} />
            </div>

            <section aria-labelledby="lh" className="card">
                <div className="card__toolbar">
                    <h2 id="lh">Danh sách khóa học</h2>
                    <SearchInput id="cq" label="Tìm khóa học" value={q} onChange={setQ} placeholder="Tìm khóa học" />
                    <SelectFilter id="cf" label="Lọc trạng thái" value={f} onChange={setF}
                        options={[['all', 'Mọi trạng thái'], ['open', 'Đang mở'], ['draft', 'Bản nháp']]} />
                </div>
                <div className="table-wrap">
                    <table className="table" style={{ minWidth: 1000 }}>
                        <thead><tr>
                            <th scope="col">Khóa học</th><th scope="col">Trạng thái</th><th scope="col">Nội dung</th><th scope="col">Học viên</th>
                            <th scope="col">Tỉ lệ hoàn thành</th><th scope="col">Hạn hoàn thành</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                        </tr></thead>
                        <tbody>
                            {list.map((c) => {
                                const open = c.status === 'open'
                                const r = c.learners ? Math.round((c.done / c.learners) * 100) : 0
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            <Link to={`/teach/courses/${c.id}/stats`} className="cell-title">{c.title}</Link>
                                            <div className="small text-2">{c.dept} · {c.kind}</div>
                                        </td>
                                        <td><span className={`pill ${open ? 'pill--green' : 'pill--gray'}`}>{open ? 'Đang mở' : 'Bản nháp'}</span></td>
                                        <td><Link to={`/teach/courses/${c.id}/content`} style={{ color: 'inherit' }}>{c.lessons} bài học · {c.tests} bài kiểm tra</Link></td>
                                        <td>{c.learners}</td>
                                        <td>
                                            <div className="progress-row">
                                                <div style={{ width: 100 }}><ProgressBar value={r} done={r >= 80} label={`Tỉ lệ hoàn thành ${c.title}`} /></div>
                                                <span style={{ fontWeight: 600 }}>{c.learners ? `${r}%` : '—'}</span>
                                            </div>
                                        </td>
                                        <td>{fmtDate(c.due)}</td>
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
                <Modal title={modal === 'new' ? 'Tạo khóa học' : 'Sửa khóa học'} onClose={() => setModal(null)}
                    footer={<>
                        <button type="button" className="btn" onClick={() => setModal(null)}>Hủy</button>
                        <button type="button" className="btn btn--primary" onClick={save}>{modal === 'new' ? 'Tạo khóa học' : 'Lưu thay đổi'}</button>
                    </>}>
                    <div className="dialog__body">
                        <div className="field">
                            <label htmlFor="f-t">Tên khóa học <span className="req">*</span></label>
                            <input id="f-t" className={`input${err ? ' is-invalid' : ''}`} value={form.title} onChange={set('title')} autoFocus />
                            {err && <span className="error">Vui lòng nhập tên khóa học.</span>}
                        </div>
                        <div className="field">
                            <label htmlFor="f-d">Mô tả</label>
                            <textarea id="f-d" rows={3} className="textarea" value={form.desc} onChange={set('desc')} />
                        </div>
                        <div className="field-row">
                            <div className="field"><label htmlFor="f-p">Phòng ban phụ trách</label>
                                <select id="f-p" className="select" value={form.dept} onChange={set('dept')}><option>HSE</option><option>Vận hành</option><option>CNTT</option><option>Nhân sự</option></select></div>
                            <div className="field"><label htmlFor="f-k">Loại</label>
                                <select id="f-k" className="select" value={form.kind} onChange={set('kind')}><option>Bắt buộc</option><option>Tự chọn</option></select></div>
                        </div>
                        <div className="field-row">
                            <div className="field"><label htmlFor="f-h">Hạn hoàn thành</label>
                                <input id="f-h" type="date" className="input" value={form.due} onChange={set('due')} /></div>
                            <div className="field"><label htmlFor="f-s">Trạng thái</label>
                                <select id="f-s" className="select" value={form.status} onChange={set('status')}>
                                    <option value="draft">Bản nháp (học viên chưa thấy)</option><option value="open">Đang mở</option>
                                </select></div>
                        </div>
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
