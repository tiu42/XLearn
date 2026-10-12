import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CoursePattern, ProgressBar, SearchInput, SelectFilter } from '../../components/ui'
import { getMyCourses } from '../../data/mock'
import './learner.css'

const FILTERS = [['all', 'Tất cả (trừ đã ẩn)'], ['progress', 'Đang học'], ['future', 'Sắp diễn ra'], ['past', 'Đã kết thúc'], ['starred', 'Đánh dấu sao']]

export default function MyCourses() {
    const data = useMemo(() => getMyCourses(), [])
    const [f, setF] = useState('all')
    const [q, setQ] = useState('')
    const [sort, setSort] = useState('name')
    const [view, setView] = useState('cards')

    let shown = data.filter((d) => (f === 'all' || (f === 'starred' ? d.star : d.st === f))
        && (!q || d.name.toLowerCase().includes(q.toLowerCase())))
    if (sort === 'name') shown = [...shown].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    const pctLabel = (c) => (c.st === 'future' ? `Bắt đầu ${c.start}` : `${c.pct}% hoàn thành`)

    return (
        <main className="container container--1280" style={{ gap: 20 }}>
            <h1 className="page-title">Khóa học của tôi</h1>

            <section aria-labelledby="ov" className="card card--pad" style={{ gap: 18 }}>
                <h2 id="ov" className="card__title">Tổng quan khóa học</h2>
                <div className="row">
                    <SelectFilter id="flt" label="Lọc khóa học" value={f} onChange={setF} options={FILTERS} className="select--soft" />
                    <SearchInput id="cs" label="Tìm khóa học" value={q} onChange={setQ} placeholder="Tìm kiếm" className="input--soft" />
                    <div className="row" style={{ marginLeft: 'auto' }}>
                        <SelectFilter id="srt" label="Sắp xếp" value={sort} onChange={setSort} className="select--soft"
                            options={[['name', 'Sắp xếp theo tên khóa học'], ['recent', 'Sắp xếp theo lần truy cập gần nhất']]} />
                        <div role="group" aria-label="Kiểu hiển thị" className="toggle-group">
                            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Thẻ</button>
                            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button>
                        </div>
                    </div>
                </div>

                {shown.length > 0 && view === 'cards' && (
                    <div className="course-grid course-grid--lg">
                        {shown.map((c) => (
                            <article key={c.id} className="course-card">
                                <CoursePattern colors={c.colors} height={110} />
                                <div className="course-card__body" style={{ gap: 8 }}>
                                    <div className="row-between" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'nowrap' }}>
                                        <span className="course-card__cat">{c.cat}</span>
                                        <button type="button" className="course-card__more" aria-label={`Tùy chọn khóa ${c.name}`}>⋯</button>
                                    </div>
                                    <Link to={`/courses/${c.id}`} className="course-card__name">{c.name}</Link>
                                    {c.star && <span className="star-note">★ Đã đánh dấu sao</span>}
                                    <div className="course-card__foot">
                                        <ProgressBar value={c.pct} size="sm" label={`Tiến độ ${c.name}`} />
                                        <span className="small muted">{pctLabel(c)}</span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {shown.length > 0 && view === 'list' && (
                    <div>
                        {shown.map((c) => (
                            <div key={c.id} className="course-list-row">
                                <CoursePattern colors={c.colors} height={56} style={{ flex: '0 0 72px', borderRadius: 6 }} />
                                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span className="course-card__cat">{c.cat}</span>
                                    <Link to={`/courses/${c.id}`} className="course-card__name">{c.name}</Link>
                                </div>
                                <div className="progress-row" style={{ flex: '0 1 220px', gap: 10 }}>
                                    <ProgressBar value={c.pct} size="sm" label={`Tiến độ ${c.name}`} />
                                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{pctLabel(c)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {shown.length === 0 && <div style={{ padding: 32, textAlign: 'center' }} className="muted">Không có khóa học nào trong mục này.</div>}
                <div className="muted" style={{ fontSize: 14 }}>Hiển thị {shown.length} khóa học</div>
            </section>
        </main>
    )
}
