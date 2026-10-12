import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api'
import { LearnerHeader } from '../../components/AppHeader'
import { ChevronLeft, FileIcon, LockIcon, SidebarIcon } from '../../components/Icons'
import Markdown from '../../components/Markdown'
import { Pill, ProgressBar } from '../../components/ui'
import { useLesson, useReportProgress } from './learnApi'
import { useMyCourse } from './myCoursesApi'
import { sectionLabel } from './progress'
import { fmtDateTime, fmtScore } from './quiz'
import QuizAttempt from './QuizAttempt'
import { useQuizStatus } from './quizApi'
import QuizResult from './QuizResult'
import './learner.css'

const TYPE = { video: 'VIDEO', pdf: 'TÀI LIỆU PDF', page: 'BÀI ĐỌC', quiz: 'BÀI KIỂM TRA' }
const KIND = { video: 'Video', pdf: 'Tài liệu PDF', page: 'Bài đọc', quiz: 'Bài kiểm tra' }
// Quy tắc "percent" (backend/app/learning.py): đạt đủ bao nhiêu % thì hoàn thành
const PERCENT_RULE = { video: 'xem được', pdf: 'đọc tới', page: 'đọc được' }

const fmtPct = (n) => `${Math.round(n * 100) / 100}%`
const fmtSize = (bytes) => {
    if (bytes == null) return ''
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
}

const itemMeta = (x) => `${KIND[x.lesson_type]}${x.estimated_minutes ? ` · ${x.estimated_minutes} phút` : ''}`

/** Hướng dẫn hoàn thành, theo quy tắc backend trả về (lesson.completion). */
function ruleText({ lesson_type: type, completion, quiz }) {
    if (completion.code === 'open') return 'Bài học được tính hoàn thành ngay khi bạn mở.'
    if (completion.code === 'percent') return `Tự động hoàn thành khi bạn ${PERCENT_RULE[type]} ${fmtPct(completion.percent)} nội dung.`
    return quiz ? `Tự động hoàn thành khi bạn đạt từ ${fmtPct(quiz.pass_score_percent)} điểm trở lên.` : 'Tự động hoàn thành khi bạn làm đạt bài kiểm tra.'
}

/** Một dòng chữ: quá dài thì cắt "…"; khi hover nút cha (.next-topic) thì chạy chữ để đọc hết. */
function Marquee({ text }) {
    const box = useRef(null)
    const [shift, setShift] = useState(0)
    useEffect(() => {
        const el = box.current
        const measure = () => setShift(Math.max(0, el.firstChild.scrollWidth - el.clientWidth))
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [text])
    return (
        <span ref={box} title={shift > 0 ? text : undefined} className={`marquee${shift > 0 ? ' marquee--overflow' : ''}`}
            style={{ '--marquee-shift': `${shift}px`, '--marquee-time': `${Math.max(3, shift / 30 + 2)}s` }}>
            <span className="marquee__inner">{text}</span>
        </span>
    )
}

function Shell({ courseId, children }) {
    return (
        <div className="page">
            <LearnerHeader />
            <main className="container container--1200" style={{ paddingTop: 28 }}>
                <Link to={`/courses/${courseId}`} className="back-link"><ChevronLeft />Về khóa học</Link>
                {children}
            </main>
        </div>
    )
}

/** Bao bọc: tải danh sách chủ đề → bài (GET /me/courses/:id), đọc ?topic=N hoặc ?lesson=<id> (mở thẳng một bài). */
export default function Learn() {
    const { courseId } = useParams()
    const [params] = useSearchParams()
    const { data: course, error, isPending } = useMyCourse(courseId)

    if (isPending) return <div className="page"><LearnerHeader /><div className="center-state">Đang tải…</div></div>
    if (error) {
        const notFound = error.response?.status === 404 || error.response?.status === 422
        return (
            <Shell courseId={courseId}>
                <div role="alert" className="status-msg status-msg--error">
                    {notFound ? 'Không tìm thấy khóa học hoặc bạn không được ghi danh vào khóa này.' : errorMessage(error, 'Không tải được khóa học.')}
                </div>
            </Shell>
        )
    }

    const { sections } = course
    if (!sections.length) return <Shell courseId={courseId}><p className="empty-note">Khóa học chưa có nội dung. Vui lòng quay lại sau.</p></Shell>

    const lessonId = Number(params.get('lesson'))
    const byLesson = lessonId ? sections.findIndex((s) => s.lessons.some((x) => x.id === lessonId)) : -1
    const asked = Number(params.get('topic')) - 1
    if (byLesson < 0 && !(asked >= 0 && asked < sections.length)) {
        // Ghim chủ đề vào URL: học xong chủ đề hiện tại (vd vừa làm đạt bài kiểm tra) không bị nhảy sang chủ đề khác
        const fallback = Math.max(0, sections.findIndex((s) => !s.locked && s.status !== 'completed'))
        return <Navigate replace to={`?topic=${fallback + 1}`} />
    }
    const si = byLesson >= 0 ? byLesson : asked
    return <TopicView key={si} course={course} si={si} courseId={courseId} initialLessonId={byLesson >= 0 ? lessonId : null} />
}

function TopicView({ course, si, courseId, initialLessonId }) {
    const section = course.sections[si]
    const { lessons, locked } = section
    const nextIdx = si + 1 < course.sections.length ? si + 1 : -1

    const [cur, setCur] = useState(() => {
        const asked = lessons.findIndex((x) => x.id === initialLessonId)
        return asked >= 0 ? asked : Math.max(0, lessons.findIndex((x) => x.status !== 'completed'))
    })
    const [side, setSide] = useState(true)
    // Làm bài kiểm tra toàn màn hình: { lessonId, title, closesAt, mode: 'attempt' | 'result', attemptId }
    const [quiz, setQuiz] = useState(null)
    // Danh sách bài lấy lại sau mỗi lần hoàn thành bài → giữ chỉ số trong phạm vi nếu số bài thay đổi
    const idx = Math.min(cur, lessons.length - 1)
    const item = lessons[idx]
    const nDone = section.completed_lessons
    const allDone = section.status === 'completed'

    const go = (i) => {
        if (i < 0 || i >= lessons.length || i === idx) return
        setCur(i)
        window.scrollTo?.(0, 0)
    }
    const topicUrl = (i) => `/courses/${courseId}/learn?topic=${i + 1}`

    const openQuiz = (view) => {
        setQuiz(view)
        window.scrollTo?.(0, 0)
    }
    if (quiz?.mode === 'attempt') {
        return <QuizAttempt courseId={courseId} lessonId={quiz.lessonId} title={quiz.title}
            onExit={() => setQuiz(null)}
            onSubmitted={(attemptId) => openQuiz({ ...quiz, mode: 'result', attemptId })} />
    }
    if (quiz?.mode === 'result') {
        const pos = lessons.findIndex((x) => x.id === quiz.lessonId)
        return <QuizResult courseId={courseId} lessonId={quiz.lessonId} attemptId={quiz.attemptId} title={quiz.title}
            closesAt={quiz.closesAt}
            onRetry={() => openQuiz({ ...quiz, mode: 'attempt', attemptId: null })}
            onNext={pos >= 0 && pos + 1 < lessons.length ? () => { setQuiz(null); go(pos + 1) } : null}
            onExit={() => setQuiz(null)} />
    }

    return (
        <div className="page">
            <LearnerHeader />
            <div className="learn">
                {side ? (
                    <aside aria-labelledby="topic" className="learn-side">
                        <div className="learn-side__head">
                            <div className="row-between" style={{ gap: 8 }}>
                                <Link to={`/courses/${courseId}`} className="back-link"><ChevronLeft />Về khóa học</Link>
                                <button type="button" className="side-toggle" onClick={() => setSide(false)} aria-expanded="true" aria-label="Ẩn thanh bên" title="Ẩn thanh bên">
                                    <SidebarIcon open />
                                </button>
                            </div>
                            <div className="stack" style={{ gap: 4 }}>
                                <span className="small strong" style={{ color: 'var(--primary)' }}>{sectionLabel(si)}</span>
                                <h2 id="topic" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35 }}>{section.title}</h2>
                                <span className="small muted">{course.title}</span>
                            </div>
                            <div className="stack">
                                <ProgressBar value={(nDone / lessons.length) * 100} done={allDone} size="sm" label="Tiến độ chủ đề" />
                                <span className="small text-2">{nDone}/{lessons.length} bài học đã hoàn thành</span>
                            </div>
                        </div>
                        <nav aria-label="Bài học trong chủ đề" className="learn-side__nav">
                            {!locked && lessons.map((x, i) => {
                                const done = x.status === 'completed'
                                return (
                                    <button key={x.id} type="button" className="lesson-item" aria-current={i === idx ? 'page' : undefined} onClick={() => go(i)}>
                                        <span className={`lesson-dot${done ? ' lesson-dot--done' : ''}`}>{done ? '✓' : i + 1}</span>
                                        <span className="stack" style={{ gap: 2 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600 }}>{x.title}</span>
                                            <span style={{ fontSize: 12 }} className="muted">{itemMeta(x)}</span>
                                        </span>
                                    </button>
                                )
                            })}
                        </nav>
                        <div className="learn-side__foot">
                            {nextIdx < 0 ? (
                                <Link to={`/courses/${courseId}`} className="next-topic">
                                    <span className="next-topic__text"><small>Chủ đề cuối</small><Marquee text="Về trang khóa học" /></span><span aria-hidden="true" className="next-topic__arrow">›</span>
                                </Link>
                            ) : !course.sections[nextIdx].locked ? (
                                <Link to={topicUrl(nextIdx)} className="next-topic">
                                    <span className="next-topic__text"><small>Chủ đề tiếp theo</small><Marquee text={`${sectionLabel(nextIdx)}: ${course.sections[nextIdx].title}`} /></span>
                                    <span aria-hidden="true" className="next-topic__arrow">›</span>
                                </Link>
                            ) : (
                                <>
                                    <button type="button" className="next-topic" disabled>
                                        <span className="next-topic__text"><small>Chủ đề tiếp theo</small><Marquee text={`${sectionLabel(nextIdx)}: ${course.sections[nextIdx].title}`} /></span><LockIcon />
                                    </button>
                                    <span style={{ fontSize: 12 }} className="text-2">Hoàn thành tất cả bài học trong chủ đề này để mở.</span>
                                </>
                            )}
                        </div>
                    </aside>
                ) : (
                    <aside aria-label="Thanh bên đã thu gọn" className="learn-side learn-side--closed">
                        <button type="button" className="side-toggle" onClick={() => setSide(true)} aria-expanded="false" aria-label="Hiện thanh bên" title="Hiện thanh bên">
                            <SidebarIcon />
                        </button>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{nDone}/{lessons.length}</span>
                    </aside>
                )}

                <main className="learn-main">
                    {locked ? (
                        <div className="locked-topic">
                            <span className="locked-topic__icon" aria-hidden="true"><LockIcon size={22} /></span>
                            <h1 style={{ fontSize: 22, fontWeight: 700 }}>{sectionLabel(si)} đang bị khóa</h1>
                            <p className="text-2" style={{ fontSize: 15 }}>
                                Khóa học này học lần lượt. Hoàn thành {sectionLabel(si - 1).toLowerCase()} để mở chủ đề này.
                            </p>
                            <Link to={topicUrl(si - 1)} className="btn btn--primary">Về {sectionLabel(si - 1).toLowerCase()}</Link>
                        </div>
                    ) : (
                        <>
                            <LessonPane key={item.id} courseId={courseId} item={item} onQuiz={openQuiz}
                                crumb={`${sectionLabel(si)} · ${section.title} · Bài ${idx + 1}/${lessons.length}`} />
                            <div className="lesson-nav">
                                <button type="button" className="btn" disabled={idx === 0} onClick={() => go(idx - 1)}>‹ Bài trước</button>
                                <button type="button" className="btn" disabled={idx === lessons.length - 1} onClick={() => go(idx + 1)}>Bài tiếp theo ›</button>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}

/** Một bài: tải nội dung, báo backend "đã mở bài" một lần, rồi hiện theo loại bài. */
function LessonPane({ courseId, item, crumb, onQuiz }) {
    const { data: lesson, error, isPending } = useLesson(courseId, item.id)
    const report = useReportProgress(courseId)
    const save = (body) => report(item.id, body)

    const loaded = lesson != null
    const opened = useRef(false)
    useEffect(() => {
        if (!loaded || opened.current) return
        opened.current = true
        report(item.id)
    }, [loaded, item.id, report])

    const done = (lesson?.progress.status ?? item.status) === 'completed'
    const header = (
        <div className="stack">
            <span className="small muted">{crumb}</span>
            <div className="row">
                <span className="type-label">{TYPE[item.lesson_type]}</span>
                <Pill tone={done ? 'success' : 'gray'} tag>{done ? '✓ Đã hoàn thành' : 'Chưa hoàn thành'}</Pill>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700 }}>{item.title}</h1>
            {lesson && <span className="small text-2">{ruleText(lesson)}</span>}
        </div>
    )

    if (isPending) return <>{header}<div className="center-state">Đang tải bài học…</div></>
    if (error) {
        return (
            <>
                {header}
                <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được bài học.')}</div>
            </>
        )
    }

    return (
        <>
            {header}
            {lesson.lesson_type === 'video' && <VideoLesson lesson={lesson} onSave={save} />}
            {lesson.lesson_type === 'pdf' && <PdfLesson lesson={lesson} />}
            {lesson.lesson_type === 'page' && <PageLesson lesson={lesson} onSave={save} />}
            {lesson.lesson_type === 'quiz' && <QuizPanel courseId={courseId} lesson={lesson} onQuiz={onQuiz} />}
            {lesson.lesson_type !== 'quiz' && <Attachments files={lesson.files} />}
        </>
    )
}

/** Video: xem tiếp từ vị trí đã lưu; dừng/chuyển bài thì lưu vị trí (last_position_seconds). */
function VideoLesson({ lesson, onSave }) {
    const { media, progress } = lesson
    const ref = useRef(null)
    const onSaveRef = useRef(onSave)
    useEffect(() => { onSaveRef.current = onSave })
    // Vị trí bắt đầu chốt lúc mở bài; xem gần hết rồi thì xem lại từ đầu
    const [start] = useState(() => {
        const pos = progress.last_position_seconds ?? 0
        return media?.duration_seconds && pos >= media.duration_seconds - 5 ? 0 : pos
    })
    const playing = useRef(false)
    const position = (v) => ({ position_seconds: Math.floor(v.currentTime) })

    useEffect(() => {
        const v = ref.current
        return () => { if (v && playing.current) onSaveRef.current(position(v)) } // chuyển bài khi đang phát
    }, [])

    return (
        <div className="stack" style={{ gap: 16 }}>
            {media?.url ? (
                <video ref={ref} className="video-player" src={media.url} controls preload="metadata"
                    onLoadedMetadata={(e) => { if (start) e.currentTarget.currentTime = start }}
                    onPlay={() => { playing.current = true }}
                    onPause={(e) => { playing.current = false; onSave(position(e.currentTarget)) }} />
            ) : (
                <div className="video-box"><span style={{ fontSize: 14, color: '#ADB5BD' }}>Video chưa được tải lên.</span></div>
            )}
            {lesson.description && <p className="prose">{lesson.description}</p>}
        </div>
    )
}

/** Nhúng trình xem PDF có sẵn của trình duyệt; trình duyệt không hỗ trợ (đa số di động) thì hiện nút mở/tải. */
function PdfLesson({ lesson }) {
    const { media } = lesson
    const url = media?.url
    const file = media?.filename ?? `${lesson.title}.pdf`
    return (
        <div className="stack" style={{ gap: 12 }}>
            <div className="pdf-viewer">
                <div className="pdf-viewer__bar">
                    <span className="row" style={{ gap: 8, minWidth: 0 }}>
                        <FileIcon />{file}
                        {media?.page_count && <span className="small muted" style={{ fontWeight: 400 }}>· {media.page_count} trang</span>}
                    </span>
                    {url && (
                        <span className="row" style={{ gap: 8 }}>
                            <a href={url} target="_blank" rel="noreferrer" className="btn btn--sm">Mở tab mới</a>
                            <a href={url} download={file} className="btn btn--sm" style={{ color: 'var(--primary)' }}>Tải về</a>
                        </span>
                    )}
                </div>
                {url ? (
                    <object data={`${url}#view=FitH`} type="application/pdf" className="pdf-viewer__frame" aria-label={`Tài liệu ${lesson.title}`}>
                        <div className="pdf-viewer__fallback">
                            <span>Trình duyệt này không hiển thị được PDF trực tiếp.</span>
                            <a href={url} target="_blank" rel="noreferrer" className="btn btn--primary">Mở tài liệu</a>
                        </div>
                    </object>
                ) : (
                    <div className="pdf-viewer__fallback">Tài liệu chưa được tải lên.</div>
                )}
            </div>
            {lesson.description && <p className="prose">{lesson.description}</p>}
        </div>
    )
}

/** Bài đọc dài: thanh tiến độ đọc theo vị trí cuộn; đọc tới cuối hoặc rời bài thì lưu % đã đọc. */
function PageLesson({ lesson, onSave }) {
    const ref = useRef(null)
    const endRef = useRef(null)
    const [pct, setPct] = useState(0)
    const pctRef = useRef(0)
    const onSaveRef = useRef(onSave)
    useEffect(() => { onSaveRef.current = onSave })
    // Bài đã hoàn thành (kể cả vừa hoàn thành nhờ lần báo mở bài) thì không cần gửi thêm số liệu đọc
    const doneRef = useRef(false)
    useEffect(() => { doneRef.current = lesson.progress.status === 'completed' })
    const saved = useRef(Number(lesson.progress.progress_percent))
    const flush = () => {
        if (doneRef.current || pctRef.current <= saved.current) return
        saved.current = pctRef.current
        onSaveRef.current({ progress_percent: pctRef.current })
    }
    const flushRef = useRef(flush)
    useEffect(() => { flushRef.current = flush })

    const files = new Map(lesson.files.map((f) => [f.id, f.url]))
    const resolveFile = (src) => {
        const m = /^file:(\d+)$/.exec(src ?? '')
        return m ? files.get(Number(m[1])) ?? '' : src
    }

    useEffect(() => {
        const onScroll = () => {
            const el = ref.current
            if (!el) return
            const r = el.getBoundingClientRect()
            const read = Math.min(Math.max(window.innerHeight - r.top, 0), r.height)
            pctRef.current = Math.max(pctRef.current, Math.round((read / Math.max(r.height, 1)) * 100))
            setPct(pctRef.current)
        }
        // Đo lần đầu sau khi trình duyệt vẽ xong (không setState đồng bộ trong effect)
        const raf = requestAnimationFrame(onScroll)
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
            flushRef.current() // rời bài giữa chừng → lưu phần đã đọc
        }
    }, [])

    useEffect(() => {
        const el = endRef.current
        if (!el || typeof IntersectionObserver === 'undefined') return
        const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return
            pctRef.current = 100
            flushRef.current()
        }, { threshold: 1 })
        io.observe(el)
        return () => io.disconnect()
    }, [])

    return (
        <>
            <div className="reading-bar" role="progressbar" aria-label="Tiến độ đọc" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${pct}%` }} />
            </div>
            <article ref={ref} aria-label={`Nội dung ${lesson.title}`}>
                <Markdown resolveFile={resolveFile}>{lesson.content}</Markdown>
                <div ref={endRef} className="reading-end small text-2">Hết bài đọc · đã đọc {pct}%</div>
            </article>
        </>
    )
}

function Attachments({ files }) {
    const list = files.filter((f) => f.purpose === 'attachment')
    if (!list.length) return null
    return (
        <section aria-labelledby="att" className="attachments">
            <h2 id="att" style={{ fontSize: 15, fontWeight: 700 }}>Tài liệu đính kèm</h2>
            <ul>
                {list.map((f) => (
                    <li key={f.id}>
                        <FileIcon />
                        {f.url ? <a href={f.url} download={f.filename ?? undefined}>{f.filename ?? 'Tệp đính kèm'}</a> : <span>{f.filename ?? 'Tệp đính kèm'}</span>}
                        <span className="small muted">{fmtSize(f.size_bytes)}</span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

const BLOCKED = {
    not_open: (q) => `Bài kiểm tra mở lúc ${fmtDateTime(q.opens_at)}.`,
    closed: () => 'Bài kiểm tra đã đóng, không làm thêm lượt mới được.',
    no_attempts: () => 'Bạn đã dùng hết lượt làm bài. Liên hệ giảng viên để được mở thêm lượt.',
    no_questions: () => 'Bài kiểm tra chưa có câu hỏi.',
}

/** Bài kiểm tra: thông tin, lượt đang làm dở, lịch sử các lượt; bắt đầu / làm tiếp / xem kết quả mở màn toàn màn hình. */
function QuizPanel({ courseId, lesson, onQuiz }) {
    const { quiz } = lesson
    const { data: st, error, isPending } = useQuizStatus(courseId, lesson.id)
    if (!quiz) return <p className="empty-note">Bài kiểm tra chưa được thiết lập.</p>

    const minutes = quiz.time_limit_seconds ? Math.round(quiz.time_limit_seconds / 60) : null
    const view = { lessonId: lesson.id, title: lesson.title, closesAt: quiz.closes_at }
    const start = () => onQuiz({ ...view, mode: 'attempt' })
    const finished = st?.attempts.filter((a) => a.status !== 'in_progress') ?? []

    return (
        <div className="quiz-intro">
            <div className="quiz-facts">
                <div><span>Số câu hỏi</span><span>{quiz.question_count} câu</span></div>
                <div><span>Thời gian</span><span>{minutes ? `${minutes} phút` : 'Không giới hạn'}</span></div>
                <div><span>Điểm đạt</span><span>{fmtPct(quiz.pass_score_percent)}</span></div>
                <div><span>Lượt làm</span><span>{quiz.max_attempts ? `${st ? `${st.attempts_used}/` : ''}${quiz.max_attempts} lượt` : 'Không giới hạn'}</span></div>
            </div>
            {(quiz.opens_at || quiz.closes_at) && (
                <span className="small text-2">
                    {quiz.opens_at && <>Mở lúc <strong>{fmtDateTime(quiz.opens_at)}</strong>. </>}
                    {quiz.closes_at && <>Đóng lúc <strong>{fmtDateTime(quiz.closes_at)}</strong>, bài đang làm sẽ tự nộp khi đóng.</>}
                </span>
            )}
            <p className="text-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {quiz.is_graded ? 'Bài kiểm tra tính điểm, là điều kiện hoàn thành khóa học. ' : 'Quiz luyện tập, không tính vào kết quả khóa học. '}
                Tất cả câu hỏi hiển thị trên một trang, bài làm được lưu tự động.
                {minutes ? ' Đồng hồ bắt đầu đếm khi bạn bấm bắt đầu, vẫn chạy khi bạn tạm thoát, và bài tự nộp khi hết giờ.' : ''}
            </p>

            {isPending && <span className="small muted">Đang tải lượt làm bài…</span>}
            {error && <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được lượt làm bài.')}</div>}
            {st && (
                <>
                    {st.passed && (
                        <div role="status" className="status-msg status-msg--ok">
                            Bạn đã đạt bài kiểm tra này · điểm cao nhất {fmtScore(st.best_score_percent)}%.
                        </div>
                    )}
                    {st.in_progress ? (
                        <div className="row" style={{ gap: 12 }}>
                            <button type="button" className="btn btn--primary btn--lg" onClick={start}>Tiếp tục làm bài</button>
                            <span className="small text-2">
                                Bạn đang làm dở lần {st.in_progress.attempt_no}
                                {st.in_progress.expires_at && <> · hạn nộp {fmtDateTime(st.in_progress.expires_at)}</>}.
                            </span>
                        </div>
                    ) : st.can_start ? (
                        <div className="row" style={{ gap: 12 }}>
                            <button type="button" className={`btn btn--lg${st.passed ? '' : ' btn--primary'}`} onClick={start}>
                                {st.attempts_used ? 'Làm lại' : 'Bắt đầu làm bài'}
                            </button>
                            {st.attempts_left != null && <span className="small text-2">Còn {st.attempts_left} lượt làm bài.</span>}
                        </div>
                    ) : (
                        !st.passed && <p className="small" style={{ fontWeight: 600, color: 'var(--danger-dark)' }}>{BLOCKED[st.blocked_reason]?.(quiz)}</p>
                    )}

                    {finished.length > 0 && (
                        <section aria-labelledby="tries" className="stack" style={{ gap: 8 }}>
                            <h2 id="tries" style={{ fontSize: 15, fontWeight: 700 }}>Các lượt đã làm</h2>
                            {finished.map((a) => (
                                <div key={a.id} className="try-row">
                                    <span>
                                        <strong>Lần {a.attempt_no}</strong>
                                        <span className="muted"> · {fmtDateTime(a.submitted_at)}{a.status === 'expired' ? ' · hết giờ, tự nộp' : ''}</span>
                                    </span>
                                    <span className="row" style={{ gap: 12 }}>
                                        <strong>{fmtScore(a.score_percent)}%</strong>
                                        <Pill tone={a.passed ? 'success' : 'red'} tag>{a.passed ? 'Đạt' : 'Chưa đạt'}</Pill>
                                        <button type="button" className="btn btn--sm" onClick={() => onQuiz({ ...view, mode: 'result', attemptId: a.id })}>Xem kết quả</button>
                                    </span>
                                </div>
                            ))}
                        </section>
                    )}
                </>
            )}
        </div>
    )
}
