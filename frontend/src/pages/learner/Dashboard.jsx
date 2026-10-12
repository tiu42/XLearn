import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarIcon, QuizIcon } from '../../components/Icons'
import { CoursePattern, SearchInput, SelectFilter } from '../../components/ui'
import { courseCategory, getMyCourses, getTimeline } from '../../data/mock'
import './learner.css'

export default function Dashboard() {
    // Gần đây = lần cập nhật tiến độ mới nhất (v_enrollment_progress.last_activity_at)
    const recent = useMemo(() => getMyCourses().sort((a, b) => b.last_access.localeCompare(a.last_access)).slice(0, 4), [])
    const timeline = useMemo(() => getTimeline(), [])
    const [range, setRange] = useState('30')
    const [sort, setSort] = useState('date')
    const [q, setQ] = useState('')

    const shown = timeline.filter((t) => !q || `${t.title} ${t.meta}`.toLowerCase().includes(q.toLowerCase()))
    const sorted = sort === 'course' ? [...shown].sort((a, b) => a.meta.localeCompare(b.meta, 'vi')) : shown
    // Gom theo ngày, giữ thứ tự xuất hiện
    const days = sorted.reduce((acc, t) => {
        const g = acc.find((d) => d.date === t.date)
        if (g) g.items.push(t); else acc.push({ date: t.date, items: [t] })
        return acc
    }, [])

    return (
        <main className="container container--1200">
            <h1 className="page-title">Bảng điều khiển</h1>

            <section aria-labelledby="recent" className="card card--pad">
                <h2 id="recent" className="card__title">Khóa học truy cập gần đây</h2>
                <div className="course-grid">
                    {recent.map((c) => (
                        <article key={c.id} className="course-card">
                            <CoursePattern colors={c.colors} thumbnailUrl={c.thumbnail_url} />
                            <div className="course-card__body">
                                <span className="course-card__cat">{courseCategory(c)}</span>
                                <Link to={`/courses/${c.id}`} className="course-card__name">{c.title}</Link>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section aria-labelledby="tl" className="card card--pad">
                <h2 id="tl" className="card__title">Dòng thời gian</h2>
                <div className="row">
                    <SelectFilter id="range" label="Khoảng thời gian" value={range} onChange={setRange} className="select--soft"
                        options={[['7', '7 ngày tới'], ['30', '30 ngày tới'], ['90', '3 tháng tới'], ['overdue', 'Quá hạn']]} />
                    <SelectFilter id="sort" label="Sắp xếp" value={sort} onChange={setSort} className="select--soft"
                        options={[['date', 'Sắp xếp theo ngày'], ['course', 'Sắp xếp theo khóa học']]} />
                    <SearchInput id="tq" label="Tìm theo loại hoặc tên hoạt động" value={q} onChange={setQ}
                        placeholder="Tìm theo loại hoặc tên hoạt động" className="input--soft" />
                </div>

                <div>
                    {days.length === 0 && <p className="empty-note" style={{ padding: '12px 0' }}>Không có hoạt động nào sắp đến hạn.</p>}
                    {days.map((d) => (
                        <div key={d.date}>
                            <h3 className="tl-day">{d.date}</h3>
                            {d.items.map((t) => (
                                <div key={`${t.courseId}-${t.title}`} className="tl-item">
                                    <span className="tl-time">{t.time}</span>
                                    <span className={`tl-icon${t.kind === 'due' ? ' tl-icon--due' : ''}`}>{t.kind === 'quiz' ? <QuizIcon /> : <CalendarIcon />}</span>
                                    <div className="tl-body">
                                        <Link to={`/courses/${t.courseId}`}>{t.title}</Link>
                                        <span className="small muted">{t.meta}</span>
                                    </div>
                                    <Link to={`/courses/${t.courseId}`} className="btn btn--outline" style={{ fontWeight: 400, minHeight: 40 }}>{t.cta}</Link>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </section>
        </main>
    )
}
