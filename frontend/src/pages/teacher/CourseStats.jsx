import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { initials } from '../../auth/roles'
import { ConfirmDialog, Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { useSelection, useToast } from '../../components/hooks'
import CourseHead, { CourseLoadState } from './CourseHead'
import { DueDateModal, DueField } from './LearnerDialogs'
import {
    PROGRESS_PILL, PROGRESS_TEXT, deptName, fmtDay, isOverdue, pct,
    useAddLearners, useCourseStats, useLearnerCandidates, useRemoveLearners, useUpdateLearner,
} from './learnersApi'
import { toDueAt, useDepartments, useTeachCourse } from './teachApi'
import './teacher.css'

const TAG = { video: ['Video', 'tag-video'], pdf: ['PDF', 'tag-pdf'], page: ['Bài đọc', 'tag-page'], quiz: ['Kiểm tra', 'tag-quiz'] }
const CHECKBOX = { width: 18, height: 18, accentColor: 'var(--primary)' }

const matches = (u, q) => !q || `${u.full_name} ${u.employee_code ?? ''} ${u.email}`.toLowerCase().includes(q.toLowerCase())

export default function CourseStats() {
    const { courseId } = useParams()
    const { data: course, error, isPending } = useTeachCourse(courseId)
    const { data: stats, error: statsError } = useCourseStats(courseId)
    const remove = useRemoveLearners()
    const update = useUpdateLearner()
    const [q, setQ] = useState('')
    const [f, setF] = useState('all')
    const [sel, setSel, toggleSel] = useSelection()
    const [adding, setAdding] = useState(false)
    const [removing, setRemoving] = useState(null) // mảng user id
    const [editing, setEditing] = useState(null) // học viên đang đổi hạn
    const [toast, flash] = useToast()

    if (isPending || error) return <CourseLoadState error={error} />

    const learners = stats?.learners ?? []
    const s = stats?.summary
    const nAll = s?.learner_count ?? 0
    const share = (n) => (nAll ? Math.round((n / nAll) * 100) : 0)
    const canEdit = stats?.can_edit ?? false
    const list = learners.filter((p) => (f === 'all' || p.progress_status === f) && matches(p.user, q))
    const allChecked = list.length > 0 && list.every((p) => sel.has(p.user.id))
    const rm = removing ? learners.filter((p) => removing.includes(p.user.id)) : []

    const toggleAll = () => setSel((cur) => {
        const n = new Set(cur)
        list.forEach((p) => (allChecked ? n.delete(p.user.id) : n.add(p.user.id)))
        return n
    })

    function doRemove() {
        const ids = removing
        setRemoving(null)
        remove.mutate({ courseId, userIds: ids }, {
            onSuccess: () => {
                setSel((cur) => { const n = new Set(cur); ids.forEach((i) => n.delete(i)); return n })
                flash(`Đã xóa ${ids.length} học viên khỏi khóa học.`)
            },
            onError: (err) => flash(errorMessage(err, 'Không xóa được học viên.')),
        })
    }

    const dist = [
        ['Đã hoàn thành', s?.completed_count ?? 0, 'var(--success-2)'],
        ['Đang học', s?.in_progress_count ?? 0, 'var(--primary)'],
        ['Chưa bắt đầu', s?.not_started_count ?? 0, '#ADB5BD'],
    ]

    return (
        <>
            <CourseHead course={course} />
            <main className="container container--1280 container--teach" style={{ paddingTop: 24 }}>
                {statsError && <div role="alert" className="status-msg status-msg--error">{errorMessage(statsError, 'Không tải được thông số khóa học.')}</div>}
                {!stats && !statsError && <div className="center-state">Đang tải…</div>}
                {stats && <>
                    <div className="stats">
                        <Stat label="Học viên ghi danh" value={nAll} />
                        <Stat label="Tỉ lệ hoàn thành" value={`${share(s.completed_count)}%`} sub={`${s.completed_count}/${nAll} học viên`} color="#1C3F1A" />
                        <Stat label="Tiến độ trung bình" value={pct(s.avg_progress_percent)} sub={`${stats.lessons.length} bài đã xuất bản`} />
                        <Stat label="Điểm kiểm tra cuối TB" value={s.final_avg_score_percent === null ? '—' : pct(s.final_avg_score_percent)}
                            sub={stats.final_quiz ? `${s.final_taken_count} học viên đã làm · đạt từ ${pct(stats.final_quiz.pass_score_percent)}` : 'Khóa chưa có bài kiểm tra tính điểm'} />
                    </div>

                    <div className="row" style={{ gap: 20, alignItems: 'stretch' }}>
                        <section aria-labelledby="dist" className="card card--pad" style={{ flex: '1 1 380px', gap: 14, padding: '18px 20px' }}>
                            <h2 id="dist" style={{ fontSize: 17, fontWeight: 700 }}>Trạng thái học viên</h2>
                            <div role="img" aria-label={dist.map(([t, n]) => `${t} ${n}`).join(', ')} className="dist-bar">
                                {dist.map(([t, n, c]) => <div key={t} style={{ width: `${share(n)}%`, background: c }} />)}
                            </div>
                            <div className="stack" style={{ gap: 8, fontSize: 14 }}>
                                {dist.map(([t, n, c]) => (
                                    <div key={t} className="legend-row">
                                        <span className="sw" style={{ background: c }} /><span style={{ flex: 1 }}>{t}</span><strong>{n}</strong>
                                        <span className="text-2" style={{ width: 44, textAlign: 'right' }}>{share(n)}%</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section aria-labelledby="byl" className="card card--pad" style={{ flex: '2 1 480px', gap: 10, padding: '18px 20px' }}>
                            <h2 id="byl" style={{ fontSize: 17, fontWeight: 700 }}>Tỉ lệ hoàn thành theo bài</h2>
                            {stats.lessons.map((it) => {
                                const v = share(it.completed_count)
                                return (
                                    <div key={it.id} className="by-lesson">
                                        <span title={`${it.section_title} › ${it.title}`}><span className={`type-tag ${TAG[it.lesson_type][1]}`}>{TAG[it.lesson_type][0]}</span> {it.title}</span>
                                        <ProgressBar value={v} done={v >= 80} label={`Hoàn thành ${it.title}`} />
                                        <span style={{ textAlign: 'right', fontWeight: 600 }}>{v}%</span>
                                    </div>
                                )
                            })}
                            {stats.lessons.length === 0 && <p className="text-2" style={{ fontSize: 14 }}>Khóa chưa có bài học nào được xuất bản.</p>}
                        </section>
                    </div>

                    <section aria-labelledby="lh" className="card">
                        <div className="card__toolbar">
                            <h2 id="lh">Học viên trong khóa ({nAll})</h2>
                            <SearchInput id="sq" label="Tìm học viên" value={q} onChange={setQ} placeholder="Tìm tên hoặc mã NV" />
                            <SelectFilter id="sf" label="Lọc trạng thái" value={f} onChange={setF}
                                options={[['all', 'Mọi trạng thái'], ...Object.entries(PROGRESS_TEXT)]} />
                            {canEdit && <button type="button" className="btn btn--primary" style={{ minHeight: 40 }} onClick={() => setAdding(true)}>+ Thêm học viên</button>}
                        </div>
                        {canEdit && sel.size > 0 && (
                            <div className="sel-bar">
                                <span style={{ fontSize: 14, fontWeight: 600, marginRight: 'auto' }}>Đã chọn {sel.size} học viên</span>
                                <button type="button" className="btn btn--sm btn--danger-ghost" style={{ fontWeight: 600 }} disabled={remove.isPending} onClick={() => setRemoving([...sel])}>Xóa khỏi khóa học</button>
                                <button type="button" className="link-btn" style={{ minHeight: 36, fontSize: 13, textDecoration: 'none' }} onClick={() => setSel(new Set())}>Bỏ chọn</button>
                            </div>
                        )}
                        <div className="table-wrap">
                            <table className="table" style={{ minWidth: 1040 }}>
                                <thead><tr>
                                    {canEdit && <th scope="col" style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" style={CHECKBOX} /></th>}
                                    <th scope="col">Học viên</th><th scope="col">Phòng ban</th><th scope="col">Tiến độ</th><th scope="col">Điểm KT cuối</th>
                                    <th scope="col">Trạng thái</th><th scope="col">Ghi danh</th><th scope="col">Hạn</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                                </tr></thead>
                                <tbody>
                                    {list.map((p) => {
                                        const u = p.user, on = sel.has(u.id), late = isOverdue(p)
                                        return (
                                            <tr key={u.id} className={on ? 'is-selected' : undefined}>
                                                {canEdit && <td><input type="checkbox" checked={on} onChange={() => toggleSel(u.id)} aria-label={`Chọn ${u.full_name}`} style={CHECKBOX} /></td>}
                                                <td><div className="person">
                                                    <span aria-hidden="true" className="avatar avatar--sm">{initials(u.full_name)}</span>
                                                    <span className="stack" style={{ gap: 0 }}>
                                                        <Link to={`/teach/students/${u.id}`}>{u.full_name}</Link>
                                                        <span style={{ fontSize: 12 }} className="muted">{u.employee_code ?? u.email}{u.status !== 'active' && ' · Đã khóa'}</span>
                                                    </span>
                                                </div></td>
                                                <td>{deptName(u)}</td>
                                                <td><div className="progress-row" style={{ minWidth: 170 }}>
                                                    <ProgressBar value={p.progress_percent} done={p.progress_status === 'completed'} label={`Tiến độ ${u.full_name}`} />
                                                    <span className="small" style={{ whiteSpace: 'nowrap' }}>{p.completed_lessons}/{p.total_lessons} · {pct(p.progress_percent)}</span>
                                                </div></td>
                                                <td style={{ fontWeight: 600 }}>
                                                    {p.final_score_percent === null ? '—'
                                                        : <span style={{ color: p.final_passed ? 'var(--success-pill)' : 'var(--danger-dark)' }}>{pct(p.final_score_percent)}</span>}
                                                </td>
                                                <td><span className={`pill ${PROGRESS_PILL[p.progress_status]}`}>{PROGRESS_TEXT[p.progress_status]}</span></td>
                                                <td className="text-2">{fmtDay(p.enrolled_at)}</td>
                                                <td className={late ? undefined : 'text-2'} style={late ? { color: 'var(--danger-dark)', fontWeight: 600 } : undefined}>
                                                    {fmtDay(p.due_at)}{late && ' · Quá hạn'}
                                                </td>
                                                <td><div className="actions" style={{ flexWrap: 'nowrap' }}>
                                                    <Link to={`/teach/students/${u.id}`} className="btn btn--sm">Chi tiết</Link>
                                                    {canEdit && <>
                                                        <button type="button" className="btn btn--sm" onClick={() => setEditing(p)} aria-label={`Đổi hạn của ${u.full_name}`}>Đổi hạn</button>
                                                        <button type="button" className="btn btn--sm btn--danger-ghost" disabled={remove.isPending} onClick={() => setRemoving([u.id])} aria-label={`Xóa ${u.full_name} khỏi khóa học`}>Xóa khỏi khóa</button>
                                                    </>}
                                                </div></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {list.length === 0 && <p className="empty-note">{nAll ? 'Không có học viên nào phù hợp.' : 'Khóa học chưa có học viên.'}</p>}
                    </section>
                </>}
            </main>

            {adding && <AddLearners courseId={courseId} onClose={() => setAdding(false)}
                onDone={(msg) => { setAdding(false); flash(msg) }} />}
            {editing && (
                <DueDateModal title={`Hạn hoàn thành của ${editing.user.full_name}`} dueAt={editing.due_at} onClose={() => setEditing(null)}
                    onSave={(dueAt) => update.mutateAsync({ courseId, userId: editing.user.id, dueAt })
                        .then(() => { setEditing(null); flash('Đã cập nhật hạn hoàn thành.') })} />
            )}
            {rm.length > 0 && (
                <ConfirmDialog title="Xóa khỏi khóa học?" confirmLabel="Xóa khỏi khóa học"
                    text={`${rm.length === 1 ? rm[0].user.full_name : `${rm.length} học viên đã chọn`} sẽ không còn thấy khóa học này. `
                        + 'Tiến độ và kết quả bài kiểm tra được giữ lại và khôi phục nếu thêm lại vào khóa.'}
                    onCancel={() => setRemoving(null)} onConfirm={doRemove} />
            )}
            {toast}
        </>
    )
}

function AddLearners({ courseId, onClose, onDone }) {
    const { data, isPending, error } = useLearnerCandidates(courseId)
    const { data: departments = [] } = useDepartments()
    const add = useAddLearners(courseId)
    const [aq, setAq] = useState('')
    const [dept, setDept] = useState('all')
    const [due, setDue] = useState('')
    const [picks, setPicks, toggle] = useSelection()
    const pool = data?.items ?? []
    const cands = pool.filter((c) => (dept === 'all' || String(c.department?.id) === dept) && matches(c, aq))

    function submit() {
        add.mutate({ userIds: [...picks], dueAt: toDueAt(due) }, {
            onSuccess: ({ added }) => onDone(`Đã thêm ${added} học viên vào khóa học.`),
        })
    }

    return (
        <Modal title="Thêm học viên vào khóa học" width={560} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={picks.size === 0 || add.isPending} onClick={submit}>
                    {add.isPending ? 'Đang thêm…' : picks.size ? `Thêm ${picks.size} học viên` : 'Thêm học viên'}
                </button>
            </>}>
            <div className="row" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-soft)' }}>
                <SearchInput id="aq" label="Tìm nhân viên" value={aq} onChange={setAq} placeholder="Tìm nhân viên theo tên, mã NV" className="grow" />
                <SelectFilter id="ad" label="Lọc phòng ban" value={dept} onChange={setDept}
                    options={[['all', 'Mọi phòng ban'], ...departments.map((d) => [String(d.id), d.name])]} />
                <button type="button" className="btn" style={{ minHeight: 40 }} disabled={cands.length === 0}
                    onClick={() => setPicks((cur) => new Set([...cur, ...cands.map((c) => c.id)]))}>Chọn tất cả ({cands.length})</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
                {isPending && <p className="text-2" style={{ padding: '12px 0', fontSize: 14 }}>Đang tải…</p>}
                {error && <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được danh sách nhân viên.')}</div>}
                {cands.map((c) => (
                    <label key={c.id} className={`option-row${picks.has(c.id) ? ' is-on' : ''}`}>
                        <input type="checkbox" checked={picks.has(c.id)} onChange={() => toggle(c.id)} style={{ ...CHECKBOX, flex: 'none' }} />
                        <span className="stack" style={{ flex: 1, gap: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{c.full_name}</span>
                            <span style={{ fontSize: 12 }} className="muted">{c.employee_code ?? c.email} · {deptName(c)}</span>
                        </span>
                    </label>
                ))}
                {data && cands.length === 0 && <p className="text-2" style={{ padding: '12px 0', fontSize: 14 }}>Không còn nhân viên nào chưa ghi danh phù hợp.</p>}
                {data && data.total > pool.length && <p className="text-2" style={{ fontSize: 12 }}>Chỉ hiện {pool.length}/{data.total} nhân viên đầu tiên theo tên.</p>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DueField id="add-due" value={due} onChange={setDue} hint="Để trống để dùng hạn mặc định của khóa." />
                {add.error && <div role="alert" className="status-msg status-msg--error">{errorMessage(add.error, 'Không thêm được học viên.')}</div>}
            </div>
        </Modal>
    )
}
