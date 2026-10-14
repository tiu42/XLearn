import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../api'
import { initials } from '../../auth/roles'
import { ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { useToast } from '../../components/hooks'
import { EnrolCoursesModal } from './LearnerDialogs'
import { deptName, fmtActivity, pct, useStudents } from './learnersApi'
import { useDepartments } from './teachApi'
import './teacher.css'

const lastName = (n) => n.split(' ').pop()

export default function Students() {
    const { data, error, isPending } = useStudents()
    const { data: departments = [] } = useDepartments()
    const [q, setQ] = useState('')
    const [dept, setDept] = useState('all')
    const [sort, setSort] = useState('name')
    const [enrolFor, setEnrolFor] = useState(null)
    const [toast, flash] = useToast()

    const people = data?.items ?? []
    const s = data?.summary
    const rate = (p) => (p.course_count ? p.completed_count / p.course_count : 0)
    const list = people
        .filter((p) => (dept === 'all' || String(p.department?.id) === dept)
            && (!q || `${p.full_name} ${p.employee_code ?? ''} ${p.email}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (sort === 'name' ? lastName(a.full_name).localeCompare(lastName(b.full_name), 'vi')
            : sort === 'low' ? rate(a) - rate(b) : rate(b) - rate(a)))

    return (
        <main className="container container--1280 container--teach">
            <h1 className="page-title">Học viên</h1>
            <div className="stats">
                <Stat label="Tổng số học viên" value={s?.student_count ?? '—'} />
                <Stat label="Lượt ghi danh" value={s?.enrollment_count ?? '—'} sub="trong các khóa bạn phụ trách" />
                <Stat label="Tỉ lệ hoàn thành chung" value={s ? `${s.enrollment_count ? Math.round((s.completed_count / s.enrollment_count) * 100) : 0}%` : '—'}
                    sub={s && `${s.completed_count}/${s.enrollment_count} lượt ghi danh`} />
                <Stat label="Chưa bắt đầu khóa nào" value={s?.not_started_count ?? '—'} sub="đã ghi danh nhưng chưa học" color="var(--warn)" />
            </div>

            <section aria-labelledby="lh" className="card">
                <div className="card__toolbar">
                    <h2 id="lh">Danh sách học viên</h2>
                    <SearchInput id="sq" label="Tìm học viên" value={q} onChange={setQ} placeholder="Tìm tên hoặc mã NV" />
                    <SelectFilter id="sd" label="Phòng ban" value={dept} onChange={setDept}
                        options={[['all', 'Mọi phòng ban'], ...departments.map((d) => [String(d.id), d.name])]} />
                    <SelectFilter id="ss" label="Sắp xếp" value={sort} onChange={setSort}
                        options={[['name', 'Sắp xếp theo tên'], ['low', 'Tỉ lệ hoàn thành thấp trước'], ['high', 'Tỉ lệ hoàn thành cao trước']]} />
                </div>
                {error && <div role="alert" className="status-msg status-msg--error" style={{ margin: 16 }}>{errorMessage(error, 'Không tải được danh sách học viên.')}</div>}
                {isPending && <div className="center-state">Đang tải…</div>}
                {data && <>
                    <div className="table-wrap">
                        <table className="table" style={{ minWidth: 1040 }}>
                            <thead><tr>
                                <th scope="col">Học viên</th><th scope="col">Phòng ban</th><th scope="col">Khóa ghi danh</th><th scope="col">Đã hoàn thành</th>
                                <th scope="col">Tiến độ trung bình</th><th scope="col">Học gần nhất</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                            </tr></thead>
                            <tbody>
                                {list.map((p) => {
                                    const active = p.status === 'active'
                                    return (
                                        <tr key={p.id}>
                                            <td><div className="person">
                                                <span aria-hidden="true" className="avatar avatar--sm">{initials(p.full_name)}</span>
                                                <span className="stack" style={{ gap: 0 }}>
                                                    <Link to={`/teach/students/${p.id}`}>{p.full_name}</Link>
                                                    <span style={{ fontSize: 12 }} className="muted">{p.employee_code ?? p.email}{!active && ' · Đã khóa'}</span>
                                                </span>
                                            </div></td>
                                            <td>{deptName(p)}</td>
                                            <td>{p.course_count}</td>
                                            <td>{p.completed_count}/{p.course_count}</td>
                                            <td><div className="progress-row">
                                                <div style={{ width: 100 }}><ProgressBar value={p.avg_progress_percent} done={p.avg_progress_percent >= 80} label={`Tiến độ trung bình của ${p.full_name}`} /></div>
                                                <span style={{ fontWeight: 600 }}>{p.course_count ? pct(p.avg_progress_percent) : '—'}</span>
                                            </div></td>
                                            <td className="text-2">{p.course_count ? fmtActivity(p.last_activity_at) : '—'}</td>
                                            <td><div className="actions" style={{ flexWrap: 'nowrap' }}>
                                                <Link to={`/teach/students/${p.id}`} className="btn btn--sm">Chi tiết</Link>
                                                <button type="button" className="btn btn--sm btn--soft" disabled={!active} onClick={() => setEnrolFor(p)}
                                                    aria-label={`Thêm ${p.full_name} vào khóa học`} title={active ? undefined : 'Tài khoản đã bị khóa'}>+ Thêm vào khóa</button>
                                            </div></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {list.length === 0 && <p className="empty-note">Không có học viên nào phù hợp.</p>}
                </>}
            </section>

            {enrolFor && <EnrolCoursesModal student={enrolFor} onClose={() => setEnrolFor(null)}
                onDone={(msg) => { setEnrolFor(null); flash(msg) }} />}
            {toast}
        </main>
    )
}
