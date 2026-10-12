import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../api'
import { CalendarIcon, QuizIcon } from '../../components/Icons'
import { CoursePattern, SearchInput, SelectFilter } from '../../components/ui'
import { courseCategory, courseColors, useMyCourses } from './myCoursesApi'
import { useTimeline } from './quizApi'
import './learner.css'

// Ngày giờ hiển thị theo giờ Việt Nam; API trả UTC
const TZ = 'Asia/Ho_Chi_Minh'
const WEEKDAY = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'long' })
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "Chủ nhật, 18 tháng 10 năm 2026" */
function dayLabel(date) {
    const [d, m, y] = DAY.format(date).split('/')
    const wd = WEEKDAY.format(date)
    return `${wd.charAt(0).toUpperCase()}${wd.slice(1).toLowerCase()}, ${d} tháng ${m} năm ${y}`
}

/** Mốc từ API → dòng hiển thị. Bài kiểm tra mở thẳng bài đó trong giao diện học. */
function toRow(x, overdue) {
    const at = new Date(x.at)
    const base = { key: `${x.kind}-${x.course_id}-${x.lesson_id ?? ''}`, date: dayLabel(at), time: TIME.format(at), kind: x.kind }
    if (x.kind === 'quiz') {
        return {
            ...base, title: `${x.title} ${overdue ? 'đã đóng' : 'đóng'}`,
            meta: `${x.is_graded ? 'Bài kiểm tra tính điểm' : 'Quiz luyện tập'} · ${x.course_title}`,
            url: `/courses/${x.course_id}/learn?lesson=${x.lesson_id}`, cta: overdue ? 'Xem bài kiểm tra' : 'Làm bài kiểm tra',
        }
    }
    return {
        ...base, title: overdue ? 'Quá hạn hoàn thành khóa học' : x.title,
        meta: `${x.is_mandatory ? 'Bắt buộc' : 'Tự chọn'} · ${x.course_title}`,
        url: `/courses/${x.course_id}`, cta: 'Vào khóa học',
    }
}

export default function Dashboard() {
    // Gần đây = lần cập nhật tiến độ mới nhất; chưa học bài nào thì theo ngày ghi danh
    const { data, error, isPending } = useMyCourses({ sort: 'recent', limit: 4 })
    const recent = data?.items ?? []
    const [range, setRange] = useState('30')
    const [sort, setSort] = useState('date')
    const [q, setQ] = useState('')
    const tl = useTimeline(range)
    const timeline = (tl.data?.items ?? []).map((x) => toRow(x, range === 'overdue'))

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
                {isPending && <p className="muted">Đang tải…</p>}
                {error && <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được danh sách khóa học.')}</div>}
                {data && recent.length === 0 && <p className="empty-note">Bạn chưa được ghi danh vào khóa học nào.</p>}
                <div className="course-grid">
                    {recent.map((c) => (
                        <article key={c.id} className="course-card">
                            <CoursePattern colors={courseColors(c)} thumbnailUrl={c.thumbnail_url} />
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
                    {tl.isPending && <p className="muted" style={{ padding: '12px 0' }}>Đang tải…</p>}
                    {tl.error && <div role="alert" className="status-msg status-msg--error">{errorMessage(tl.error, 'Không tải được dòng thời gian.')}</div>}
                    {tl.data && days.length === 0 && (
                        <p className="empty-note" style={{ padding: '12px 0' }}>{range === 'overdue' ? 'Không có hoạt động nào quá hạn.' : 'Không có hoạt động nào sắp đến hạn.'}</p>
                    )}
                    {days.map((d) => (
                        <div key={d.date}>
                            <h3 className="tl-day">{d.date}</h3>
                            {d.items.map((t) => (
                                <div key={t.key} className="tl-item">
                                    <span className="tl-time">{t.time}</span>
                                    <span className={`tl-icon${t.kind === 'due' ? ' tl-icon--due' : ''}`}>{t.kind === 'quiz' ? <QuizIcon /> : <CalendarIcon />}</span>
                                    <div className="tl-body">
                                        <Link to={t.url}>{t.title}</Link>
                                        <span className="small muted">{t.meta}</span>
                                    </div>
                                    <Link to={t.url} className="btn btn--outline" style={{ fontWeight: 400, minHeight: 40 }}>{t.cta}</Link>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </section>
        </main>
    )
}
