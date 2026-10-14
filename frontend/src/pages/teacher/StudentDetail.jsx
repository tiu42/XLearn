import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { initials } from '../../auth/roles'
import { ConfirmDialog, ProgressBar, Stat } from '../../components/ui'
import { useSelection, useToast } from '../../components/hooks'
import { COURSE_STATUS } from '../../data/mock'
import { DueDateModal, EnrolCoursesModal } from './LearnerDialogs'
import {
    PROGRESS_PILL, PROGRESS_TEXT, deptName, fmtActivity, fmtDay, isOverdue, pct,
    useRemoveLearners, useStudent, useUpdateLearner,
} from './learnersApi'
import './teacher.css'

const DAY = 86400000
const dueSoon = (c) => c.is_mandatory && c.due_at && c.progress_status !== 'completed'
    && new Date(c.due_at) - Date.now() >= 0 && new Date(c.due_at) - Date.now() <= 30 * DAY

export default function StudentDetail() {
    const { studentId } = useParams()
    const { data: student, error, isPending } = useStudent(studentId)
    const remove = useRemoveLearners()
    const update = useUpdateLearner()
    const [open, , toggleOpen] = useSelection()
    const [enrolling, setEnrolling] = useState(false)
    const [removingId, setRemovingId] = useState(null)
    const [editing, setEditing] = useState(null)
    const [toast, flash] = useToast()

    if (isPending || error) {
        const code = error?.response?.status
        return (
            <main className="container container--1280 container--teach">
                <Link to="/teach/students" className="back-link">‹ Học viên</Link>
                {error
                    ? <div role="alert" className="status-msg status-msg--error">{code === 404 || code === 422 ? 'Không tìm thấy học viên.' : errorMessage(error, 'Không tải được học viên.')}</div>
                    : <div className="center-state">Đang tải…</div>}
            </main>
        )
    }

    const courses = student.courses
    const n = (st) => courses.filter((c) => c.progress_status === st).length
    const rc = courses.find((c) => c.course_id === removingId)
    const lastActivity = courses.reduce((m, c) => (c.last_activity_at && (!m || c.last_activity_at > m) ? c.last_activity_at : m), null)

    function doRemove() {
        const c = rc
        setRemovingId(null)
        remove.mutate({ courseId: c.course_id, userIds: [student.id] }, {
            onSuccess: () => flash(`Đã xóa khỏi khóa “${c.title}”.`),
            onError: (err) => flash(errorMessage(err, 'Không xóa được khỏi khóa học.')),
        })
    }

    return (
        <main className="container container--1280 container--teach" style={{ paddingTop: 24 }}>
            <nav aria-label="Đường dẫn" className="breadcrumb">
                <Link to="/teach/students">Học viên</Link><span aria-hidden="true">›</span><span>{student.full_name}</span>
            </nav>

            <section aria-label="Thông tin học viên" className="card" style={{ padding: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                <span aria-hidden="true" className="avatar avatar--lg">{initials(student.full_name)}</span>
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="row" style={{ gap: 10 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{student.full_name}</h1>
                        {student.status !== 'active' && <span className="pill pill--red">Đã khóa</span>}
                    </div>
                    <span className="text-2" style={{ fontSize: 14 }}>
                        {[student.employee_code, student.department && `Phòng ${deptName(student)}`, student.email].filter(Boolean).join(' · ')}
                    </span>
                    <span className="text-2" style={{ fontSize: 14 }}>
                        Học gần nhất: {fmtActivity(lastActivity).toLowerCase()} · Đăng nhập gần nhất: {fmtActivity(student.last_login_at, 'chưa đăng nhập').toLowerCase()}
                    </span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn--primary" disabled={student.status !== 'active'} onClick={() => setEnrolling(true)}>+ Thêm vào khóa học</button>
                </div>
            </section>

            <div className="stats">
                <Stat label="Khóa đã ghi danh" value={courses.length} />
                <Stat label="Đã hoàn thành" value={n('completed')} color="#1C3F1A" />
                <Stat label="Đang học / chưa bắt đầu" value={`${n('in_progress')} / ${n('not_started')}`} />
                <Stat label="Tỉ lệ hoàn thành" value={`${courses.length ? Math.round((n('completed') / courses.length) * 100) : 0}%`} />
                <Stat label="Bắt buộc sắp đến hạn" value={courses.filter(dueSoon).length} sub={`trong 30 ngày tới · ${courses.filter(isOverdue).length} quá hạn`} color="var(--warn)" />
            </div>

            <section aria-labelledby="ch" className="card">
                <h2 id="ch" style={{ padding: '14px 16px', fontSize: 17, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>Hoàn thành theo khóa học</h2>
                {courses.map((c) => {
                    const o = open.has(c.course_id), late = isOverdue(c), st = COURSE_STATUS[c.course_status]
                    return (
                        <div key={c.course_id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                            <div className="row" style={{ gap: '12px 18px', padding: '14px 16px' }}>
                                <button type="button" onClick={() => toggleOpen(c.course_id)} aria-expanded={o} aria-label={`${o ? 'Thu gọn' : 'Xem chi tiết'} ${c.title}`}
                                    style={{ flex: 'none', width: 32, height: 32, border: 0, borderRadius: 6, background: '#F1F3F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ display: 'inline-block', transition: 'transform .15s', transform: `rotate(${o ? 0 : -90}deg)` }}>▾</span>
                                </button>
                                <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span className="row" style={{ gap: 8 }}>
                                        <Link to={`/teach/courses/${c.course_id}/stats`} style={{ fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>{c.title}</Link>
                                        {c.course_status !== 'published' && <span className={`pill pill--tag pill--${st.tone}`}>{st.label}</span>}
                                    </span>
                                    <span className="small text-2">
                                        {c.is_mandatory ? 'Bắt buộc' : 'Tự chọn'} · Ghi danh {fmtDay(c.enrolled_at)} · <span style={late ? { color: 'var(--danger-dark)', fontWeight: 600 } : undefined}>Hạn {fmtDay(c.due_at)}{late && ' (quá hạn)'}</span>
                                    </span>
                                </div>
                                <div className="progress-row" style={{ flex: '0 1 200px' }}>
                                    <ProgressBar value={c.progress_percent} done={c.progress_status === 'completed'} label={`Tiến độ ${c.title}`} />
                                    <span className="small" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.completed_lessons}/{c.total_lessons} · {pct(c.progress_percent)}</span>
                                </div>
                                <span style={{ flex: '0 0 110px', fontSize: 14 }}>KT cuối: <strong>{c.final_score_percent === null ? '—' : pct(c.final_score_percent)}</strong></span>
                                <span className={`pill ${PROGRESS_PILL[c.progress_status]}`}>
                                    {c.progress_status === 'completed' && c.completed_at ? `Hoàn thành ${fmtDay(c.completed_at)}` : PROGRESS_TEXT[c.progress_status]}
                                </span>
                                {c.can_edit && <>
                                    <button type="button" className="btn btn--sm" onClick={() => setEditing(c)} aria-label={`Đổi hạn khóa ${c.title}`}>Đổi hạn</button>
                                    <button type="button" className="btn btn--sm btn--danger-ghost" disabled={remove.isPending} onClick={() => setRemovingId(c.course_id)} aria-label={`Xóa khỏi khóa ${c.title}`}>Xóa khỏi khóa</button>
                                </>}
                            </div>
                            {o && (
                                <div className="row" style={{ gap: 20, padding: '0 16px 16px 66px', alignItems: 'flex-start' }}>
                                    <div style={{ flex: '2 1 320px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span className="small strong text-2">TIẾN ĐỘ THEO CHỦ ĐỀ</span>
                                        {c.sections.length === 0 && <span className="text-2" style={{ fontSize: 14 }}>Khóa chưa có bài học nào được xuất bản.</span>}
                                        {c.sections.map((s) => (
                                            <div key={s.id} className="by-lesson" style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px 44px', gap: 10 }}>
                                                <span title={s.title}>{s.title}</span>
                                                <ProgressBar value={(s.completed_lessons / s.total_lessons) * 100} done={s.completed_lessons >= s.total_lessons} size="sm" label={`Tiến độ ${s.title}`} />
                                                <span style={{ textAlign: 'right' }}>{s.completed_lessons}/{s.total_lessons}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span className="small strong text-2">BÀI KIỂM TRA</span>
                                        {c.quizzes.length === 0 && <span className="text-2" style={{ fontSize: 14 }}>Khóa không có bài kiểm tra.</span>}
                                        {c.quizzes.map((a) => (
                                            <div key={a.lesson_id} className="row-between" style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 6, fontSize: 14, flexWrap: 'nowrap' }}>
                                                <span className="stack" style={{ gap: 0 }}>
                                                    <span style={{ fontWeight: 600 }}>{a.title}</span>
                                                    <span style={{ fontSize: 12 }} className="muted">
                                                        {a.is_graded ? 'Bài kiểm tra tính điểm' : 'Quiz luyện tập'} · {a.attempts_used ? `${a.attempts_used}${a.max_attempts ? `/${a.max_attempts}` : ''} lượt` : 'chưa làm'}
                                                        {a.last_submitted_at && ` · ${fmtDay(a.last_submitted_at)}`}
                                                    </span>
                                                </span>
                                                {a.best_score_percent === null
                                                    ? <span className="pill pill--tag pill--gray">{a.attempts_used ? 'Đang làm' : 'Chưa làm'}</span>
                                                    : <span className={`pill pill--tag ${a.passed ? 'pill--green' : 'pill--red'}`}>{pct(a.best_score_percent)} · {a.passed ? 'Đạt' : 'Chưa đạt'}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
                {courses.length === 0 && <p className="empty-note">Học viên chưa ghi danh khóa học nào bạn phụ trách.</p>}
            </section>

            {enrolling && <EnrolCoursesModal student={student} onClose={() => setEnrolling(false)}
                onDone={(msg) => { setEnrolling(false); flash(msg) }} />}
            {editing && (
                <DueDateModal title={`Hạn hoàn thành khóa “${editing.title}”`} dueAt={editing.due_at} onClose={() => setEditing(null)}
                    onSave={(dueAt) => update.mutateAsync({ courseId: editing.course_id, userId: student.id, dueAt })
                        .then(() => { setEditing(null); flash('Đã cập nhật hạn hoàn thành.') })} />
            )}
            {rc && (
                <ConfirmDialog title="Xóa khỏi khóa học?" confirmLabel="Xóa khỏi khóa học"
                    text={`${student.full_name} sẽ không còn thấy khóa “${rc.title}”. Tiến độ và kết quả bài kiểm tra được giữ lại và khôi phục nếu thêm lại vào khóa.`}
                    onCancel={() => setRemovingId(null)} onConfirm={doRemove} />
            )}
            {toast}
        </main>
    )
}
