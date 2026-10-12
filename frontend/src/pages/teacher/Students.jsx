import { useState } from 'react'
import { Link } from 'react-router-dom'
import { initials } from '../../auth/roles'
import { Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { useSelection, useToast } from '../../components/hooks'
import { CATALOG, DEPTS, getStudents } from '../../data/mock'
import './teacher.css'

const lastName = (n) => n.split(' ').pop()

export default function Students() {
    const [people, setPeople] = useState(getStudents)
    const [q, setQ] = useState('')
    const [dept, setDept] = useState('all')
    const [sort, setSort] = useState('name')
    const [enrolFor, setEnrolFor] = useState(null)
    const [toast, flash] = useToast()

    const rate = (p) => (p.courses.length ? Math.round((p.done / p.courses.length) * 100) : 0)
    const list = people
        .filter((p) => (dept === 'all' || p.dept === dept) && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (sort === 'name' ? lastName(a.name).localeCompare(lastName(b.name), 'vi') : sort === 'low' ? rate(a) - rate(b) : rate(b) - rate(a)))
    const enrol = people.reduce((s, p) => s + p.courses.length, 0)
    const done = people.reduce((s, p) => s + p.done, 0)
    const ep = people.find((p) => p.id === enrolFor)

    return (
        <main className="container container--1280 container--teach">
            <h1 className="page-title">Học viên</h1>
            <div className="stats">
                <Stat label="Tổng số học viên" value={people.length} />
                <Stat label="Lượt ghi danh" value={enrol} />
                <Stat label="Tỉ lệ hoàn thành chung" value={`${enrol ? Math.round((done / enrol) * 100) : 0}%`} />
                <Stat label="Chưa bắt đầu khóa nào" value={people.filter((p) => p.last === 'Chưa truy cập').length} color="var(--warn)" />
            </div>

            <section aria-labelledby="lh" className="card">
                <div className="card__toolbar">
                    <h2 id="lh">Danh sách học viên</h2>
                    <SearchInput id="sq" label="Tìm học viên" value={q} onChange={setQ} placeholder="Tìm tên hoặc mã NV" />
                    <SelectFilter id="sd" label="Phòng ban" value={dept} onChange={setDept} options={[['all', 'Mọi phòng ban'], ...DEPTS.map((d) => [d, d])]} />
                    <SelectFilter id="ss" label="Sắp xếp" value={sort} onChange={setSort}
                        options={[['name', 'Sắp xếp theo tên'], ['low', 'Tỉ lệ hoàn thành thấp trước'], ['high', 'Tỉ lệ hoàn thành cao trước']]} />
                </div>
                <div className="table-wrap">
                    <table className="table" style={{ minWidth: 980 }}>
                        <thead><tr>
                            <th scope="col">Học viên</th><th scope="col">Phòng ban</th><th scope="col">Khóa ghi danh</th><th scope="col">Đã hoàn thành</th>
                            <th scope="col">Tỉ lệ hoàn thành</th><th scope="col">Hoạt động gần nhất</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                        </tr></thead>
                        <tbody>
                            {list.map((p) => {
                                const r = rate(p)
                                return (
                                    <tr key={p.id}>
                                        <td><div className="person">
                                            <span aria-hidden="true" className="avatar avatar--sm">{initials(p.name)}</span>
                                            <span className="stack" style={{ gap: 0 }}><Link to={`/teach/students/${p.id}`}>{p.name}</Link><span style={{ fontSize: 12 }} className="muted">{p.code}</span></span>
                                        </div></td>
                                        <td>{p.dept}</td>
                                        <td>{p.courses.length}</td>
                                        <td>{p.done}/{p.courses.length}</td>
                                        <td><div className="progress-row">
                                            <div style={{ width: 100 }}><ProgressBar value={r} done={r >= 80} label={`Tỉ lệ hoàn thành của ${p.name}`} /></div>
                                            <span style={{ fontWeight: 600 }}>{p.courses.length ? `${r}%` : '—'}</span>
                                        </div></td>
                                        <td className="text-2">{p.last}</td>
                                        <td><div className="actions" style={{ flexWrap: 'nowrap' }}>
                                            <Link to={`/teach/students/${p.id}`} className="btn btn--sm">Chi tiết</Link>
                                            <button type="button" className="btn btn--sm btn--soft" onClick={() => setEnrolFor(p.id)} aria-label={`Thêm ${p.name} vào khóa học`}>+ Thêm vào khóa</button>
                                        </div></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {list.length === 0 && <p className="empty-note">Không có học viên nào phù hợp.</p>}
            </section>

            {ep && (
                <EnrolModal person={ep} onClose={() => setEnrolFor(null)}
                    onEnrol={(ids) => {
                        setPeople((ps) => ps.map((p) => (p.id === ep.id ? { ...p, courses: [...p.courses, ...ids] } : p)))
                        setEnrolFor(null)
                        flash(`Đã thêm ${ep.name} vào ${ids.length} khóa học.`)
                    }} />
            )}
            {toast}
        </main>
    )
}

function EnrolModal({ person, onClose, onEnrol }) {
    const [picks, , toggle] = useSelection()
    const [due, setDue] = useState('')
    return (
        <Modal title={`Thêm ${person.name} vào khóa học`} width={520} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={picks.size === 0} onClick={() => onEnrol([...picks])}>
                    {picks.size ? `Thêm vào ${picks.size} khóa học` : 'Thêm vào khóa học'}
                </button>
            </>}>
            <div className="dialog__body">
                <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <legend style={{ padding: 0, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Chọn khóa học</legend>
                    {CATALOG.map((c) => {
                        const already = person.courses.includes(c.id)
                        const on = already || picks.has(c.id)
                        return (
                            <label key={c.id} className={`option-row${already ? ' is-disabled' : picks.has(c.id) ? ' is-on' : ''}`} style={{ minHeight: 46, fontSize: 15, gap: 10 }}>
                                <input type="checkbox" checked={on} disabled={already} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: 'var(--primary)', flex: 'none' }} />
                                <span style={{ flex: 1 }}>{c.t}</span>
                                {already && <span style={{ fontSize: 12 }} className="text-2">Đã ghi danh</span>}
                            </label>
                        )
                    })}
                </fieldset>
                <div className="field">
                    <label htmlFor="ed">Hạn hoàn thành</label>
                    <input id="ed" type="date" className="input" style={{ maxWidth: 220 }} value={due} onChange={(e) => setDue(e.target.value)} />
                    <span className="text-2" style={{ fontSize: 12 }}>Để trống để dùng hạn mặc định của khóa.</span>
                </div>
            </div>
        </Modal>
    )
}
