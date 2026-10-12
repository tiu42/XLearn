import { Link, useParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { ChevronLeft, LockIcon, PlayIcon } from '../../components/Icons'
import { Pill, ProgressBar } from '../../components/ui'
import { courseCategory, useMyCourse } from './myCoursesApi'
import { sectionLabel } from './progress'
import './learner.css'

// Theo trạng thái chủ đề backend trả về (completed | in_progress | not_started)
const STATUS = {
    completed: { text: 'Hoàn thành', tone: 'success', cta: 'Xem lại', step: ' topic-step--done' },
    in_progress: { text: 'Đang học', tone: 'blue', cta: 'Học tiếp', step: ' topic-step--prog' },
    not_started: { text: 'Chưa bắt đầu', tone: 'gray', cta: 'Bắt đầu', step: '' },
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
const fmtPct = (n) => `${Math.round(n * 100) / 100}%`

export default function CourseHome() {
    const { courseId } = useParams()
    const { data: course, error, isPending } = useMyCourse(courseId)

    if (isPending) return <main className="container container--1200"><div className="center-state">Đang tải…</div></main>
    if (error) {
        const notFound = error.response?.status === 404 || error.response?.status === 422
        return (
            <main className="container container--1200" style={{ paddingTop: 28 }}>
                <Link to="/courses" className="back-link"><ChevronLeft />Khóa học của tôi</Link>
                <div role="alert" className="status-msg status-msg--error">
                    {notFound ? 'Không tìm thấy khóa học hoặc bạn không được ghi danh vào khóa này.' : errorMessage(error, 'Không tải được khóa học.')}
                </div>
            </main>
        )
    }

    const { sections } = course
    const doneSections = sections.filter((s) => s.status === 'completed').length
    const progress = Math.round(course.progress_percent)
    const finished = course.enrollment_status === 'completed'
    // "Học tiếp" → chủ đề đầu tiên chưa xong mà không bị khóa
    const resume = sections.findIndex((s) => !s.locked && s.status !== 'completed')
    const learnUrl = (i) => `/courses/${courseId}/learn?topic=${i + 1}`

    return (
        <main className="container container--1200" style={{ paddingTop: 28 }}>
            <Link to="/courses" className="back-link"><ChevronLeft />Khóa học của tôi</Link>

            <div className="stack">
                <span className="small muted">{courseCategory(course)} · {course.code}</span>
                <h1 className="page-title">{course.title}</h1>
                {course.short_description && <p className="text-2" style={{ fontSize: 15, lineHeight: 1.5 }}>{course.short_description}</p>}
            </div>

            <section aria-labelledby="prog" className="progress-panel">
                <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h2 id="prog" style={{ fontSize: 16, fontWeight: 700 }}>Tiến độ của bạn</h2>
                    <div className="progress-row" style={{ gap: 12 }}>
                        <ProgressBar value={course.progress_percent} done={finished} size="lg" label="Tiến độ khóa học" />
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{progress}%</span>
                    </div>
                    <span className="text-2" style={{ fontSize: 14 }}>
                        Đã hoàn thành {course.completed_lessons}/{course.total_lessons} bài học · {doneSections}/{sections.length} chủ đề
                    </span>
                </div>
                <div className="row" style={{ gap: 24 }}>
                    {finished ? (
                        <div className="stack" style={{ gap: 2 }}>
                            <span className="small text-2">Trạng thái</span>
                            <span style={{ fontSize: 16, fontWeight: 700 }}>Đã hoàn thành{course.completed_at ? ` · ${fmtDate(course.completed_at)}` : ''}</span>
                        </div>
                    ) : (
                        <div className="stack" style={{ gap: 2 }}>
                            <span className="small text-2">Hạn hoàn thành</span>
                            <span style={{ fontSize: 16, fontWeight: 700 }}>{course.due_at ? fmtDate(course.due_at) : 'Không có hạn'}</span>
                        </div>
                    )}
                    {course.final_pass_percent != null && (
                        <div className="stack" style={{ gap: 2 }}>
                            <span className="small text-2">Điểm đạt bài kiểm tra cuối</span>
                            <span style={{ fontSize: 16, fontWeight: 700 }}>{fmtPct(course.final_pass_percent)}</span>
                        </div>
                    )}
                </div>
                {resume >= 0 && (
                    <Link to={learnUrl(resume)} className="btn btn--primary" style={{ minHeight: 44, fontSize: 15, padding: '0 18px' }}>
                        <PlayIcon />{sections[resume].status === 'not_started' && course.completed_lessons === 0 ? 'Bắt đầu học' : 'Học tiếp'}
                    </Link>
                )}
            </section>

            <section aria-labelledby="topics" className="stack" style={{ gap: 16 }}>
                <div className="row-between">
                    <h2 id="topics" style={{ fontSize: 19, fontWeight: 700 }}>Danh sách chủ đề</h2>
                    {course.is_sequential && <span className="small text-2">Học lần lượt: chủ đề sau mở khi hoàn thành chủ đề trước.</span>}
                </div>
                {sections.length === 0 && <p className="empty-note">Khóa học chưa có nội dung. Vui lòng quay lại sau.</p>}
                <ol className="topic-list">
                    {sections.map((t, i) => {
                        const s = STATUS[t.status]
                        const last = i === sections.length - 1
                        return (
                            <li key={t.id}>
                                <div aria-hidden="true" className="topic-rail">
                                    <span className={`topic-step${t.locked ? ' topic-step--locked' : s.step}`}>
                                        {t.status === 'completed' ? '✓' : i}
                                    </span>
                                    {!last && <span className={`topic-line${t.status === 'completed' ? ' topic-line--done' : ''}`} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                                    {t.locked ? (
                                        <div className="topic-card topic-card--locked">
                                            <div className="topic-card__main">
                                                <div className="row">
                                                    <span className="small strong muted">{sectionLabel(i)}</span>
                                                    <span className="pill pill--gray pill--tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}><LockIcon />Bị khóa</span>
                                                </div>
                                                <span className="topic-card__title">{t.title}</span>
                                                {t.description && <span style={{ fontSize: 14, lineHeight: 1.5 }}>{t.description}</span>}
                                            </div>
                                            <span className="small" style={{ flex: '0 1 200px' }}>{t.completed_lessons}/{t.total_lessons} bài học</span>
                                            <span className="small" style={{ fontWeight: 600 }}>Mở khi hoàn thành {sectionLabel(i - 1)}</span>
                                        </div>
                                    ) : (
                                        <Link to={learnUrl(i)} className="topic-card">
                                            <div className="topic-card__main">
                                                <div className="row">
                                                    <span className="small strong" style={{ color: 'var(--primary)' }}>{sectionLabel(i)}</span>
                                                    <Pill tone={s.tone} tag>{s.text}</Pill>
                                                </div>
                                                <span className="topic-card__title">{t.title}</span>
                                                {t.description && <span className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>{t.description}</span>}
                                            </div>
                                            <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <ProgressBar value={(t.completed_lessons / t.total_lessons) * 100} done={t.status === 'completed'} size="sm" label={`Tiến độ ${t.title}`} />
                                                <span className="small muted">{t.completed_lessons}/{t.total_lessons} bài học</span>
                                            </div>
                                            <span className="topic-card__cta">{s.cta} ›</span>
                                        </Link>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ol>
            </section>
        </main>
    )
}
