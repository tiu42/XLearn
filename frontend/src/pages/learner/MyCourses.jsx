import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { CoursePattern, Pagination, ProgressBar, SearchInput, SelectFilter } from '../../components/ui'
import { courseCategory as category, courseColors as colorsOf, myCoursesQuery, useMyCourses } from './myCoursesApi'
import './learner.css'

const PAGE_SIZE = 12

// Lọc theo enrollments.status (backend đã loại 'removed')
const STATUS = [['', 'Tất cả'], ['active', 'Đang học'], ['completed', 'Đã hoàn thành']]
const MANDATORY = [['', 'Bắt buộc & tự chọn'], ['true', 'Bắt buộc'], ['false', 'Tự chọn']]
const SORTS = [['title', 'Sắp xếp theo tên khóa học'], ['recent', 'Sắp xếp theo lần truy cập gần nhất'], ['due', 'Sắp xếp theo hạn hoàn thành']]

const fmtDate = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
const pctLabel = (c) => {
    if (c.enrollment_status === 'completed') return 'Đã hoàn thành'
    const pct = `${Math.round(c.progress_percent)}%`
    return c.due_at ? `${pct} · hạn ${fmtDate(c.due_at)}` : pct
}

/** Tham số URL → tham số API của trang `page` (bỏ trống thì không gửi). */
const apiParams = (p, page) => ({
    status: p.get('status') || undefined, q: p.get('q') || undefined,
    department_id: p.get('dept') || undefined, mandatory: p.get('mandatory') || undefined,
    sort: p.get('sort') || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
})

export default function MyCourses() {
    // Bộ lọc nằm trên URL → F5 / quay lại / gửi link vẫn giữ đúng trang & bộ lọc
    const [params, setParams] = useSearchParams()
    const status = params.get('status') ?? ''
    const dept = params.get('dept') ?? ''
    const mandatory = params.get('mandatory') ?? ''
    const sort = params.get('sort') ?? 'title'
    const page = Math.max(1, Number(params.get('page')) || 1)
    const filtered = Boolean(status || dept || mandatory || params.get('q'))

    const [q, setQ] = useState(params.get('q') ?? '')
    const [view, setView] = useState('cards')

    // Cache theo bộ tham số: quay lại trang / bộ lọc đã xem thì hiện ngay, không gọi API trong 30 s.
    // Đổi trang/bộ lọc: giữ danh sách cũ (mờ đi) tới khi có kết quả mới.
    const { data, error, isPending, isFetching, isPlaceholderData } = useMyCourses(apiParams(params, page))
    const loading = isFetching && isPlaceholderData

    /** Đổi một tham số; đổi bộ lọc thì quay về trang 1. */
    const update = useCallback((key, value) => setParams((p) => {
        const n = new URLSearchParams(p)
        if (value) n.set(key, value); else n.delete(key)
        if (key !== 'page') n.delete('page')
        return n
    }, { replace: key !== 'page' }), [setParams])

    // Gõ tìm kiếm: chỉ đẩy lên URL (→ gọi API) khi ngừng gõ 300 ms
    const timer = useRef(null)
    useEffect(() => () => clearTimeout(timer.current), [])
    const onSearch = (v) => {
        setQ(v)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => update('q', v.trim()), 300)
    }

    const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

    // Tải trước trang kế tiếp → bấm "Sau" hiện ngay
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPlaceholderData && page < pages) queryClient.prefetchQuery(myCoursesQuery(apiParams(params, page + 1)))
    }, [queryClient, params, page, pages, isPlaceholderData])

    // Trang trên URL vượt quá số trang (vd: link cũ, vừa hoàn thành khóa cuối) → về trang cuối
    useEffect(() => {
        if (data && !isPlaceholderData && page > pages) update('page', String(pages))
    }, [data, isPlaceholderData, page, pages, update])

    const items = data?.items ?? []
    const deptOptions = [['', 'Mọi phòng ban'], ...(data?.departments ?? []).map((d) => [String(d.id), d.name])]
    const from = (page - 1) * PAGE_SIZE

    return (
        <main className="container container--1280" style={{ gap: 20 }}>
            <h1 className="page-title">Khóa học của tôi</h1>

            <section aria-labelledby="ov" className="card card--pad" style={{ gap: 18 }}>
                <h2 id="ov" className="card__title">Tổng quan khóa học</h2>
                <div className="row">
                    <SelectFilter id="flt" label="Lọc theo trạng thái" value={status} onChange={(v) => update('status', v)} options={STATUS} className="select--soft" />
                    <SelectFilter id="mdt" label="Lọc bắt buộc / tự chọn" value={mandatory} onChange={(v) => update('mandatory', v)} options={MANDATORY} className="select--soft" />
                    {deptOptions.length > 2 && (
                        <SelectFilter id="dpt" label="Lọc theo phòng ban" value={dept} onChange={(v) => update('dept', v)} options={deptOptions} className="select--soft" />
                    )}
                    <SearchInput id="cs" label="Tìm khóa học" value={q} onChange={onSearch} placeholder="Tìm theo tên hoặc mã khóa" className="input--soft" />
                    <div className="row" style={{ marginLeft: 'auto' }}>
                        <SelectFilter id="srt" label="Sắp xếp" value={sort} onChange={(v) => update('sort', v === 'title' ? '' : v)} className="select--soft" options={SORTS} />
                        <div role="group" aria-label="Kiểu hiển thị" className="toggle-group">
                            <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Thẻ</button>
                            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button>
                        </div>
                    </div>
                </div>

                {error && <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được danh sách khóa học.')}</div>}
                {isPending && !error && <div className="center-state">Đang tải…</div>}

                <div aria-busy={loading} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
                    {items.length > 0 && view === 'cards' && (
                        <div className="course-grid course-grid--lg">
                            {items.map((c) => (
                                <article key={c.id} className="course-card">
                                    <CoursePattern colors={colorsOf(c)} thumbnailUrl={c.thumbnail_url} height={110} />
                                    <div className="course-card__body" style={{ gap: 8 }}>
                                        <span className="course-card__cat">{category(c)}</span>
                                        <Link to={`/courses/${c.id}`} className="course-card__name">{c.title}</Link>
                                        <div className="course-card__foot">
                                            <ProgressBar value={c.progress_percent} done={c.enrollment_status === 'completed'} size="sm" label={`Tiến độ ${c.title}`} />
                                            <span className="small muted">{pctLabel(c)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}

                    {items.length > 0 && view === 'list' && (
                        <div>
                            {items.map((c) => (
                                <div key={c.id} className="course-list-row">
                                    <CoursePattern colors={colorsOf(c)} thumbnailUrl={c.thumbnail_url} height={56} style={{ flex: '0 0 72px', width: 72, borderRadius: 6 }} />
                                    <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span className="course-card__cat">{category(c)}</span>
                                        <Link to={`/courses/${c.id}`} className="course-card__name">{c.title}</Link>
                                    </div>
                                    <div className="progress-row" style={{ flex: '0 1 260px', gap: 10 }}>
                                        <ProgressBar value={c.progress_percent} done={c.enrollment_status === 'completed'} size="sm" label={`Tiến độ ${c.title}`} />
                                        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{pctLabel(c)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {data && items.length === 0 && (
                        <div style={{ padding: 32, textAlign: 'center' }} className="muted">
                            {data.total === 0 && !filtered
                                ? 'Bạn chưa được ghi danh vào khóa học nào.'
                                : 'Không có khóa học nào khớp với bộ lọc.'}
                        </div>
                    )}
                </div>

                {data && (
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                        <div className="muted" style={{ fontSize: 14 }} aria-live="polite">
                            {data.total > 0 ? `Hiển thị ${from + 1}–${from + items.length} / ${data.total} khóa học` : 'Hiển thị 0 khóa học'}
                        </div>
                        <Pagination page={page} pages={pages} onChange={(p) => update('page', p > 1 ? String(p) : '')} label="Phân trang khóa học" />
                    </div>
                )}
            </section>
        </main>
    )
}
