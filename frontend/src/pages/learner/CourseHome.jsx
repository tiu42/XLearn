import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, LockIcon, PlayIcon } from '../../components/Icons'
import { Pill, ProgressBar } from '../../components/ui'
import { getCourseOutline } from '../../data/mock'
import './learner.css'

const STATUS = {
    done: { text: 'Hoàn thành', tone: 'success', cta: 'Xem lại' },
    prog: { text: 'Đang học', tone: 'blue', cta: 'Học tiếp' },
    not: { text: 'Chưa bắt đầu', tone: 'gray', cta: 'Bắt đầu' },
}

export default function CourseHome() {
    const { courseId } = useParams()
    const course = useMemo(() => getCourseOutline(), [])
    const learnUrl = `/courses/${courseId}/learn`

    return (
        <main className="container container--1200" style={{ paddingTop: 28 }}>
            <Link to="/courses" className="back-link"><ChevronLeft />Khóa học của tôi</Link>

            <div className="stack">
                <span className="small muted">{course.cat}</span>
                <h1 className="page-title">{course.title}</h1>
            </div>

            <section aria-labelledby="prog" className="progress-panel">
                <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h2 id="prog" style={{ fontSize: 16, fontWeight: 700 }}>Tiến độ của bạn</h2>
                    <div className="progress-row" style={{ gap: 12 }}>
                        <ProgressBar value={course.progress} size="lg" label="Tiến độ khóa học" />
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{course.progress}%</span>
                    </div>
                    <span className="text-2" style={{ fontSize: 14 }}>
                        Đã hoàn thành {course.doneActivities}/{course.totalActivities} hoạt động · {course.doneTopics}/{course.totalTopics} chủ đề
                    </span>
                </div>
                <div className="row" style={{ gap: 24 }}>
                    <div className="stack" style={{ gap: 2 }}><span className="small text-2">Hạn hoàn thành</span><span style={{ fontSize: 16, fontWeight: 700 }}>{course.due}</span></div>
                    <div className="stack" style={{ gap: 2 }}><span className="small text-2">Chứng chỉ</span><span style={{ fontSize: 16, fontWeight: 700 }}>{course.certificate}</span></div>
                </div>
                <Link to={learnUrl} className="btn btn--primary" style={{ minHeight: 44, fontSize: 15, padding: '0 18px' }}><PlayIcon />Học tiếp</Link>
            </section>

            <section aria-labelledby="topics" className="stack" style={{ gap: 16 }}>
                <h2 id="topics" style={{ fontSize: 19, fontWeight: 700 }}>Danh sách chủ đề</h2>
                <ol className="topic-list">
                    {course.topics.map((t, i) => {
                        const st = t.done === t.total ? 'done' : t.done > 0 ? 'prog' : 'not'
                        const s = STATUS[st]
                        const num = i === 0 ? 'Phần mở đầu' : `Chủ đề ${i}`
                        const last = i === course.topics.length - 1
                        return (
                            <li key={t.title}>
                                <div aria-hidden="true" className="topic-rail">
                                    <span className={`topic-step${st === 'done' ? ' topic-step--done' : st === 'prog' ? ' topic-step--prog' : t.locked ? ' topic-step--locked' : ''}`}>
                                        {st === 'done' ? '✓' : i}
                                    </span>
                                    {!last && <span className={`topic-line${st === 'done' ? ' topic-line--done' : ''}`} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                                    {t.locked ? (
                                        <div className="topic-card topic-card--locked">
                                            <div className="topic-card__main">
                                                <div className="row">
                                                    <span className="small strong muted">{num}</span>
                                                    <span className="pill pill--gray pill--tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}><LockIcon />Bị khóa</span>
                                                </div>
                                                <span className="topic-card__title">{t.title}</span>
                                                <span style={{ fontSize: 14, lineHeight: 1.5 }}>{t.summary}</span>
                                            </div>
                                            <span className="small" style={{ flex: '0 1 200px' }}>{t.done}/{t.total} hoạt động</span>
                                            <span className="small" style={{ fontWeight: 600 }}>{t.unlockHint}</span>
                                        </div>
                                    ) : (
                                        <Link to={learnUrl} className="topic-card">
                                            <div className="topic-card__main">
                                                <div className="row">
                                                    <span className="small strong" style={{ color: 'var(--primary)' }}>{num}</span>
                                                    <Pill tone={s.tone} tag>{s.text}</Pill>
                                                </div>
                                                <span className="topic-card__title">{t.title}</span>
                                                <span className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>{t.summary}</span>
                                            </div>
                                            <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <ProgressBar value={(t.done / t.total) * 100} done={st === 'done'} size="sm" label={`Tiến độ ${t.title}`} />
                                                <span className="small muted">{t.done}/{t.total} hoạt động</span>
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
