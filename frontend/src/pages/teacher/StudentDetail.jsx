import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { initials } from '../../auth/roles'
import { ConfirmDialog, Modal, ProgressBar, Stat } from '../../components/ui'
import { useSelection, useToast } from '../../components/hooks'
import { CATALOG, getStudentDetail, todayVN } from '../../data/mock'
import './teacher.css'

const ST_TEXT = { done: 'Hoàn thành', prog: 'Đang học', not: 'Chưa bắt đầu' }
const ST_PILL = { done: 'pill--green', prog: 'pill--blue', not: 'pill--gray' }

export default function StudentDetail() {
    // TODO: lấy theo :studentId khi có API; hiện luôn hiển thị học viên mẫu
    const student = useMemo(() => getStudentDetail(), [])
    const [courses, setCourses] = useState(student.courses)
    const [open, , toggleOpen] = useSelection([1])
    const [enrolling, setEnrolling] = useState(false)
    const [removingId, setRemovingId] = useState(null)
    const [toast, flash] = useToast()

    const stat = (c) => (c.done >= c.total ? 'done' : c.done > 0 ? 'prog' : 'not')
    const n = (s) => courses.filter((c) => stat(c) === s).length
    const opts = CATALOG.filter((c) => !courses.some((x) => x.id === c.id))
    const rc = courses.find((c) => c.id === removingId)

    return (
        <main className="container container--1280 container--teach" style={{ paddingTop: 24 }}>
            <nav aria-label="Đường dẫn" className="breadcrumb">
                <Link to="/teach/students">Học viên</Link><span aria-hidden="true">›</span><span>{student.name}</span>
            </nav>

            <section aria-label="Thông tin học viên" className="card" style={{ padding: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                <span aria-hidden="true" className="avatar avatar--lg">{initials(student.name)}</span>
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700 }}>{student.name}</h1>
                    <span className="text-2" style={{ fontSize: 14 }}>{student.code} · Phòng {student.dept} · {student.email}</span>
                    <span className="text-2" style={{ fontSize: 14 }}>Hoạt động gần nhất: {student.last}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn" onClick={() => flash('Đã gửi nhắc nhở về các khóa chưa hoàn thành.')}>Gửi nhắc nhở</button>
                    <button type="button" className="btn btn--primary" onClick={() => setEnrolling(true)}>+ Thêm vào khóa học</button>
                </div>
            </section>

            <div className="stats">
                <Stat label="Khóa đã ghi danh" value={courses.length} />
                <Stat label="Đã hoàn thành" value={n('done')} color="#1C3F1A" />
                <Stat label="Đang học / chưa bắt đầu" value={`${n('prog')} / ${n('not')}`} />
                <Stat label="Tỉ lệ hoàn thành" value={`${courses.length ? Math.round((n('done') / courses.length) * 100) : 0}%`} />
                <Stat label="Bắt buộc sắp đến hạn" value={courses.filter((c) => c.dueSoon && stat(c) !== 'done').length} sub="trong 30 ngày tới" color="var(--warn)" />
            </div>

            <section aria-labelledby="ch" className="card">
                <h2 id="ch" style={{ padding: '14px 16px', fontSize: 17, fontWeight: 700, borderBottom: '1px solid var(--border)' }}>Hoàn thành theo khóa học</h2>
                {courses.map((c) => {
                    const s = stat(c), v = Math.round((c.done / c.total) * 100), o = open.has(c.id)
                    return (
                        <div key={c.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                            <div className="row" style={{ gap: '12px 18px', padding: '14px 16px' }}>
                                <button type="button" onClick={() => toggleOpen(c.id)} aria-expanded={o} aria-label={`${o ? 'Thu gọn' : 'Xem chi tiết'} ${c.title}`}
                                    style={{ flex: 'none', width: 32, height: 32, border: 0, borderRadius: 6, background: '#F1F3F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ display: 'inline-block', transition: 'transform .15s', transform: `rotate(${o ? 0 : -90}deg)` }}>▾</span>
                                </button>
                                <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Link to={`/teach/courses/${c.id}/stats`} style={{ fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>{c.title}</Link>
                                    <span className="small text-2">{c.kind} · Ghi danh {c.enrolled} · Hạn {c.due}</span>
                                </div>
                                <div className="progress-row" style={{ flex: '0 1 200px' }}>
                                    <ProgressBar value={v} done={s === 'done'} label={`Tiến độ ${c.title}`} />
                                    <span className="small" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.done}/{c.total} · {v}%</span>
                                </div>
                                <span style={{ flex: '0 0 110px', fontSize: 14 }}>KT cuối: <strong>{c.exam === null ? '—' : `${c.exam}%`}</strong></span>
                                <span className={`pill ${ST_PILL[s]}`}>{s === 'done' && c.completedOn ? `Hoàn thành ${c.completedOn}` : ST_TEXT[s]}</span>
                                <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => setRemovingId(c.id)} aria-label={`Xóa khỏi khóa ${c.title}`}>Xóa khỏi khóa</button>
                            </div>
                            {o && (
                                <div className="row" style={{ gap: 20, padding: '0 16px 16px 66px', alignItems: 'flex-start' }}>
                                    <div style={{ flex: '2 1 320px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span className="small strong text-2">TIẾN ĐỘ THEO CHỦ ĐỀ</span>
                                        {c.topics.map(([name, d, t]) => (
                                            <div key={name} className="by-lesson" style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px 44px', gap: 10 }}>
                                                <span title={name}>{name}</span>
                                                <ProgressBar value={(d / t) * 100} done={d >= t} size="sm" label={`Tiến độ ${name}`} />
                                                <span style={{ textAlign: 'right' }}>{d}/{t}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span className="small strong text-2">BÀI KIỂM TRA</span>
                                        {c.tests.length === 0 && <span className="text-2" style={{ fontSize: 14 }}>Chưa làm bài kiểm tra nào.</span>}
                                        {c.tests.map((a) => {
                                            const ok = a.score >= a.pass
                                            return (
                                                <div key={a.name} className="row-between" style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 6, fontSize: 14, flexWrap: 'nowrap' }}>
                                                    <span className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{a.name}</span><span style={{ fontSize: 12 }} className="muted">{a.meta}</span></span>
                                                    <span className={`pill pill--tag ${ok ? 'pill--green' : 'pill--red'}`}>{a.score}% · {ok ? 'Đạt' : 'Chưa đạt'}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
                {courses.length === 0 && <p className="empty-note">Học viên chưa ghi danh khóa học nào.</p>}
            </section>

            {enrolling && (
                <EnrolModal opts={opts} onClose={() => setEnrolling(false)}
                    onEnrol={(ids) => {
                        const add = CATALOG.filter((c) => ids.includes(c.id)).map((c) => ({
                            id: c.id, title: c.t, kind: 'Tự chọn', enrolled: todayVN(), due: '—', dueSoon: false,
                            done: 0, total: 5, exam: null, topics: [['Chủ đề 1', 0, 5]], tests: [],
                        }))
                        setCourses((cs) => [...cs, ...add])
                        setEnrolling(false)
                        flash(`Đã thêm vào ${add.length} khóa học.`)
                    }} />
            )}
            {rc && (
                <ConfirmDialog title="Xóa khỏi khóa học?" confirmLabel="Xóa khỏi khóa học"
                    text={`${student.name} sẽ bị xóa khỏi khóa “${rc.title}”. Tiến độ và kết quả bài kiểm tra trong khóa này sẽ bị xóa.`}
                    onCancel={() => setRemovingId(null)}
                    onConfirm={() => { setCourses((cs) => cs.filter((c) => c.id !== rc.id)); setRemovingId(null); flash(`Đã xóa khỏi khóa “${rc.title}”.`) }} />
            )}
            {toast}
        </main>
    )
}

function EnrolModal({ opts, onClose, onEnrol }) {
    const [picks, , toggle] = useSelection()
    return (
        <Modal title="Thêm vào khóa học" width={520} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={picks.size === 0} onClick={() => onEnrol([...picks])}>
                    {picks.size ? `Thêm vào ${picks.size} khóa` : 'Thêm vào khóa học'}
                </button>
            </>}>
            <fieldset className="dialog__body" style={{ margin: 0, border: 0, gap: 6 }}>
                <legend style={{ float: 'left', width: '100%', padding: 0, marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Chọn khóa học</legend>
                {opts.map((c) => (
                    <label key={c.id} className={`option-row${picks.has(c.id) ? ' is-on' : ''}`} style={{ minHeight: 46, fontSize: 15, gap: 10 }}>
                        <input type="checkbox" checked={picks.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: 'var(--primary)', flex: 'none' }} />
                        <span style={{ flex: 1 }}>{c.t}</span>
                    </label>
                ))}
                {opts.length === 0 && <span className="text-2" style={{ fontSize: 14 }}>Học viên đã ghi danh tất cả khóa học đang mở.</span>}
            </fieldset>
        </Modal>
    )
}
