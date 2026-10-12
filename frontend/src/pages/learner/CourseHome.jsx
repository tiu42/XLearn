import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, LockIcon, PlayIcon } from '../../components/Icons'
import { Pill, ProgressBar } from '../../components/ui'
import { courseCategory, getLearnCourse } from '../../data/mock'
import { lockedSections, sectionLabel, sectionStatus } from './progress'
import './learner.css'

const STATUS = {
    done: { text: 'Hoàn thành', tone: 'success', cta: 'Xem lại' },
    prog: { text: 'Đang học', tone: 'blue', cta: 'Học tiếp' },
    not: { text: 'Chưa bắt đầu', tone: 'gray', cta: 'Bắt đầu' },
}

export default function CourseHome() {
    const { courseId } = useParams()
    // TODO: lấy theo :courseId khi có API; hiện luôn hiển thị khóa ATLD-01
    const course = useMemo(() => getLearnCourse(), [])
    const locked = lockedSections(course)
    const items = course.sections.flatMap((s) => s.items)
    const doneItems = items.filter((i) => i.done).length
    const doneSections = course.sections.filter((s) => sectionStatus(s) === 'done').length
    const progress = Math.round((doneItems / items.length) * 100)
    // "Học tiếp" → chủ đề đầu tiên chưa xong mà không bị khóa
    const resume = course.sections.findIndex((s, i) => !locked[i] && sectionStatus(s) !== 'done')
    const learnUrl = (i) => `/courses/${courseId}/learn?topic=${i + 1}`

    return (
        <main className="container container--1200" style={{ paddingTop: 28 }}>
            <Link to="/courses" className="back-link"><ChevronLeft />Khóa học của tôi</Link>

            <div className="stack">
                <span className="small muted">{courseCategory(course)}</span>
                <h1 className="page-title">{course.title}</h1>
            </div>

            <section aria-labelledby="prog" className="progress-panel">
                <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h2 id="prog" style={{ fontSize: 16, fontWeight: 700 }}>Tiến độ của bạn</h2>
                    <div className="progress-row" style={{ gap: 12 }}>
                        <ProgressBar value={progress} size="lg" label="Tiến độ khóa học" />
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{progress}%</span>
                    </div>
                    <span className="text-2" style={{ fontSize: 14 }}>
                        Đã hoàn thành {doneItems}/{items.length} bài học · {doneSections}/{course.sections.length} chủ đề
                    </span>
                </div>
                <div className="row" style={{ gap: 24 }}>
                    <div className="stack" style={{ gap: 2 }}><span className="small text-2">Hạn hoàn thành</span><span style={{ fontSize: 16, fontWeight: 700 }}>{course.due}</span></div>
                    <div className="stack" style={{ gap: 2 }}><span className="small text-2">Điểm đạt bài kiểm tra cuối</span><span style={{ fontSize: 16, fontWeight: 700 }}>{course.finalPass}%</span></div>
                </div>
                {resume >= 0 && (
                    <Link to={learnUrl(resume)} className="btn btn--primary" style={{ minHeight: 44, fontSize: 15, padding: '0 18px' }}><PlayIcon />Học tiếp</Link>
                )}
            </section>

            <section aria-labelledby="topics" className="stack" style={{ gap: 16 }}>
                <div className="row-between">
                    <h2 id="topics" style={{ fontSize: 19, fontWeight: 700 }}>Danh sách chủ đề</h2>
                    {course.is_sequential && <span className="small text-2">Học lần lượt: chủ đề sau mở khi hoàn thành chủ đề trước.</span>}
                </div>
                <ol className="topic-list">
                    {course.sections.map((t, i) => {
                        const st = sectionStatus(t)
                        const s = STATUS[st]
                        const done = t.items.filter((x) => x.done).length
                        const last = i === course.sections.length - 1
                        const isLocked = locked[i]
                        return (
                            <li key={t.title}>
                                <div aria-hidden="true" className="topic-rail">
                                    <span className={`topic-step${st === 'done' ? ' topic-step--done' : isLocked ? ' topic-step--locked' : st === 'prog' ? ' topic-step--prog' : ''}`}>
                                        {st === 'done' ? '✓' : i}
                                    </span>
                                    {!last && <span className={`topic-line${st === 'done' ? ' topic-line--done' : ''}`} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                                    {isLocked ? (
                                        <div className="topic-card topic-card--locked">
                                            <div className="topic-card__main">
                                                <div className="row">
                                                    <span className="small strong muted">{sectionLabel(i)}</span>
                                                    <span className="pill pill--gray pill--tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}><LockIcon />Bị khóa</span>
                                                </div>
                                                <span className="topic-card__title">{t.title}</span>
                                                <span style={{ fontSize: 14, lineHeight: 1.5 }}>{t.description}</span>
                                            </div>
                                            <span className="small" style={{ flex: '0 1 200px' }}>{done}/{t.items.length} bài học</span>
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
                                                <span className="text-2" style={{ fontSize: 14, lineHeight: 1.5 }}>{t.description}</span>
                                            </div>
                                            <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <ProgressBar value={(done / t.items.length) * 100} done={st === 'done'} size="sm" label={`Tiến độ ${t.title}`} />
                                                <span className="small muted">{done}/{t.items.length} bài học</span>
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
