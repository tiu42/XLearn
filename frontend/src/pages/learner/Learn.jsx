import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { LearnerHeader } from '../../components/AppHeader'
import { ChevronLeft, FileIcon, LockIcon, PlayIcon, SidebarIcon } from '../../components/Icons'
import Markdown from '../../components/Markdown'
import { Pill, ProgressBar } from '../../components/ui'
import { fileInfo, getLearnCourse } from '../../data/mock'
import { lockedSections, sectionLabel, sectionStatus } from './progress'
import { duration, grade, mmss } from './quiz'
import QuizAttempt from './QuizAttempt'
import QuizResult from './QuizResult'
import './learner.css'

const TYPE = { video: 'VIDEO', pdf: 'TÀI LIỆU PDF', page: 'BÀI ĐỌC', quiz: 'BÀI KIỂM TRA' }
const RULE = {
    video: 'Tự động hoàn thành khi bạn xem hết video.',
    pdf: 'Tự động hoàn thành khi bạn mở tài liệu.',
    page: 'Tự động hoàn thành khi bạn đọc tới cuối bài.',
}

function itemMeta(x) {
    if (x.t === 'video') return `Video · ${x.minutes} phút`
    if (x.t === 'pdf') return `PDF · ${x.pages} trang`
    if (x.t === 'page') return `Bài đọc · ${x.minutes} phút`
    const { minutes, attempts, is_graded: graded } = x.quiz
    return `${graded ? 'Tính điểm' : 'Luyện tập'} · ${minutes} phút · ${attempts === 0 ? 'không giới hạn lượt' : `${attempts} lượt`}`
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

/** Bao bọc: đọc ?topic=N, giữ trạng thái hoàn thành của cả khóa trong phiên. */
export default function Learn() {
    const { courseId } = useParams()
    const [params] = useSearchParams()
    // TODO: lấy theo :courseId khi có API; hiện luôn là khóa ATLD-01 của học viên mẫu
    const [course, setCourse] = useState(() => getLearnCourse())
    const locked = lockedSections(course)
    const fallback = Math.max(0, course.sections.findIndex((s, i) => !locked[i] && sectionStatus(s) !== 'done'))
    const asked = Number(params.get('topic')) - 1
    const si = asked >= 0 && asked < course.sections.length ? asked : fallback

    const markDone = useCallback((sIdx, iIdx) => setCourse((c) => {
        if (c.sections[sIdx].items[iIdx].done) return c
        const next = structuredClone(c)
        next.sections[sIdx].items[iIdx].done = true
        return next
    }), [])

    return <TopicView key={si} course={course} si={si} locked={locked[si]} courseId={courseId} markDone={markDone} />
}

function TopicView({ course, si, locked, courseId, markDone }) {
    const section = course.sections[si]
    const items = section.items
    const nextIdx = si + 1 < course.sections.length ? si + 1 : -1

    const [cur, setCur] = useState(() => Math.max(0, items.findIndex((x) => !x.done)))
    const [side, setSide] = useState(true)
    const [mode, setMode] = useState('intro') // intro | attempt | result
    const [focus, setFocus] = useState(false)
    const [answers, setAnswers] = useState({})
    const [left, setLeft] = useState(0)
    const leftRef = useRef(0) // nguồn thật của đồng hồ; state chỉ để hiển thị
    const [tries, setTries] = useState([])

    const a = items[cur]
    const quiz = a.quiz
    const nDone = items.filter((x) => x.done).length
    const allDone = sectionStatus(section) === 'done'
    const triesLeft = !quiz ? 0 : quiz.attempts === 0 ? Infinity : quiz.attempts - tries.length
    const last = tries[tries.length - 1]

    const go = (i) => {
        if (i < 0 || i >= items.length || i === cur) return
        if (a.t === 'video') markDone(si, cur) // bản giao diện: coi như đã xem hết khi chuyển bài
        if (items[i].t === 'pdf') markDone(si, i)
        setCur(i)
        setMode('intro')
        setTries([])
        window.scrollTo?.(0, 0)
    }

    const finish = useCallback((timeout) => {
        const g = grade(quiz.questions, answers)
        const ok = g.pct >= quiz.pass
        setTries((t) => [...t, { ...g, ok, used: quiz.minutes * 60 - Math.max(0, leftRef.current), timeout, ans: { ...answers } }])
        if (ok) markDone(si, cur)
        setMode('result')
        setFocus(true)
    }, [answers, cur, markDone, quiz, si])

    // Đồng hồ chạy suốt lượt làm, kể cả khi "Tạm thoát"; hết giờ → tự nộp
    const finishRef = useRef(finish)
    useEffect(() => { finishRef.current = finish })
    useEffect(() => {
        if (mode !== 'attempt') return
        const id = setInterval(() => {
            leftRef.current -= 1
            if (leftRef.current <= 0) finishRef.current(true)
            else setLeft(leftRef.current)
        }, 1000)
        return () => clearInterval(id)
    }, [mode])

    const startQuiz = () => {
        setAnswers({})
        leftRef.current = quiz.minutes * 60
        setLeft(quiz.minutes * 60)
        setMode('attempt')
        setFocus(true)
    }

    if (quiz && focus && mode === 'attempt') {
        return <QuizAttempt title={a.name} questions={quiz.questions} answers={answers} setAnswers={setAnswers} left={left}
            onExit={() => setFocus(false)} onSubmit={finish} />
    }
    if (quiz && focus && mode === 'result' && last) {
        return <QuizResult title={a.name} questions={quiz.questions} attempt={last} attemptNo={tries.length}
            allowed={quiz.attempts} pass={quiz.pass} triesLeft={triesLeft} reviewPolicy={quiz.review_policy}
            onRetry={startQuiz}
            onNext={() => { setFocus(false); setMode('intro'); if (cur + 1 < items.length) go(cur + 1) }}
            onExit={() => { setFocus(false); setMode('intro') }} />
    }

    const topicUrl = (i) => `/courses/${courseId}/learn?topic=${i + 1}`

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
                                <ProgressBar value={(nDone / items.length) * 100} done={allDone} size="sm" label="Tiến độ chủ đề" />
                                <span className="small text-2">{nDone}/{items.length} bài học đã hoàn thành</span>
                            </div>
                        </div>
                        <nav aria-label="Bài học trong chủ đề" className="learn-side__nav">
                            {!locked && items.map((x, i) => (
                                <button key={x.name} type="button" className="lesson-item" aria-current={i === cur ? 'page' : undefined} onClick={() => go(i)}>
                                    <span className={`lesson-dot${x.done ? ' lesson-dot--done' : ''}`}>{x.done ? '✓' : i + 1}</span>
                                    <span className="stack" style={{ gap: 2 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600 }}>{x.name}</span>
                                        <span style={{ fontSize: 12 }} className="muted">{itemMeta(x)}</span>
                                    </span>
                                </button>
                            ))}
                        </nav>
                        <div className="learn-side__foot">
                            {nextIdx < 0 ? (
                                <Link to={`/courses/${courseId}`} className="next-topic">
                                    <span className="next-topic__text"><small>Chủ đề cuối</small><Marquee text="Về trang khóa học" /></span><span aria-hidden="true" className="next-topic__arrow">›</span>
                                </Link>
                            ) : allDone || !course.is_sequential ? (
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{nDone}/{items.length}</span>
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
                            <div className="stack">
                                <span className="small muted">{sectionLabel(si)} · {section.title} · Bài {cur + 1}/{items.length}</span>
                                <div className="row">
                                    <span className="type-label">{TYPE[a.t]}</span>
                                    <Pill tone={a.done ? 'success' : 'gray'} tag>{a.done ? '✓ Đã hoàn thành' : 'Chưa hoàn thành'}</Pill>
                                </div>
                                <h1 style={{ fontSize: 26, fontWeight: 700 }}>{a.name}</h1>
                                <span className="small text-2">{quiz ? `Tự động hoàn thành khi bạn đạt từ ${quiz.pass}% điểm trở lên.` : RULE[a.t]}</span>
                            </div>

                            {a.t === 'video' && <VideoLesson item={a} />}
                            {a.t === 'pdf' && <PdfLesson item={a} />}
                            {a.t === 'page' && <PageLesson key={a.name} item={a} onEnd={() => markDone(si, cur)} />}
                            {quiz && (
                                <QuizIntro quiz={quiz} mode={mode} left={left} tries={tries} triesLeft={triesLeft}
                                    onStart={startQuiz} onResume={() => setFocus(true)} />
                            )}
                            {!quiz && <Attachments ids={a.files} />}

                            <div className="lesson-nav">
                                <button type="button" className="btn" disabled={cur === 0} onClick={() => go(cur - 1)}>‹ Bài trước</button>
                                <button type="button" className="btn" disabled={cur === items.length - 1} onClick={() => go(cur + 1)}>Bài tiếp theo ›</button>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}

function VideoLesson({ item }) {
    const total = item.minutes * 60
    const pos = item.position ?? 0 // lesson_progress.last_position_seconds
    return (
        <div className="stack" style={{ gap: 16 }}>
            <div className="video-box">
                <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 13, color: '#ADB5BD' }}>[VIDEO BÀI GIẢNG]</span>
                <button type="button" className="video-box__play" aria-label={pos ? `Xem tiếp từ ${mmss(pos)}` : 'Phát video'}><PlayIcon size={28} /></button>
                <div className="video-box__bar" aria-hidden="true">
                    <span>{mmss(pos)}</span>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#495057' }}>
                        <div style={{ width: `${(pos / total) * 100}%`, height: 4, borderRadius: 2, background: '#fff' }} />
                    </div>
                    <span>{mmss(total)}</span>
                </div>
            </div>
            {item.description && <p className="prose">{item.description}</p>}
        </div>
    )
}

/** Nhúng trình xem PDF có sẵn của trình duyệt; trình duyệt không hỗ trợ (đa số di động) thì hiện nút mở/tải. */
function PdfLesson({ item }) {
    const file = `${item.name}.pdf`
    return (
        <div className="stack" style={{ gap: 12 }}>
            <div className="pdf-viewer">
                <div className="pdf-viewer__bar">
                    <span className="row" style={{ gap: 8, minWidth: 0 }}><FileIcon />{file}<span className="small muted" style={{ fontWeight: 400 }}>· {item.pages} trang</span></span>
                    {item.url && (
                        <span className="row" style={{ gap: 8 }}>
                            <a href={item.url} target="_blank" rel="noreferrer" className="btn btn--sm">Mở tab mới</a>
                            <a href={item.url} download={file} className="btn btn--sm" style={{ color: 'var(--primary)' }}>Tải về</a>
                        </span>
                    )}
                </div>
                {item.url ? (
                    <object data={`${item.url}#view=FitH`} type="application/pdf" className="pdf-viewer__frame" aria-label={`Tài liệu ${item.name}`}>
                        <div className="pdf-viewer__fallback">
                            <span>Trình duyệt này không hiển thị được PDF trực tiếp.</span>
                            <a href={item.url} target="_blank" rel="noreferrer" className="btn btn--primary">Mở tài liệu</a>
                        </div>
                    </object>
                ) : (
                    <div className="pdf-viewer__fallback">Tài liệu chưa được tải lên.</div>
                )}
            </div>
            {item.description && <p className="prose">{item.description}</p>}
        </div>
    )
}

/** Bài đọc dài: thanh tiến độ đọc theo vị trí cuộn; đọc tới cuối thì đánh dấu hoàn thành. */
function PageLesson({ item, onEnd }) {
    const ref = useRef(null)
    const endRef = useRef(null)
    const [pct, setPct] = useState(0) // sẽ ghi vào lesson_progress.progress_percent khi có API
    const onEndRef = useRef(onEnd)
    useEffect(() => { onEndRef.current = onEnd })

    useEffect(() => {
        const onScroll = () => {
            const el = ref.current
            if (!el) return
            const r = el.getBoundingClientRect()
            const read = Math.min(Math.max(window.innerHeight - r.top, 0), r.height)
            setPct((p) => Math.max(p, Math.round((read / Math.max(r.height, 1)) * 100)))
        }
        // Đo lần đầu sau khi trình duyệt vẽ xong (không setState đồng bộ trong effect)
        const raf = requestAnimationFrame(onScroll)
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
        }
    }, [])

    useEffect(() => {
        const el = endRef.current
        if (!el || typeof IntersectionObserver === 'undefined') return
        const io = new IntersectionObserver(([e]) => e.isIntersecting && onEndRef.current(), { threshold: 1 })
        io.observe(el)
        return () => io.disconnect()
    }, [])

    return (
        <>
            <div className="reading-bar" role="progressbar" aria-label="Tiến độ đọc" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${pct}%` }} />
            </div>
            <article ref={ref} aria-label={`Nội dung ${item.name}`}>
                <Markdown>{item.content}</Markdown>
                <div ref={endRef} className="reading-end small text-2">Hết bài đọc · đã đọc {pct}%</div>
            </article>
        </>
    )
}

function Attachments({ ids }) {
    const files = (ids ?? []).map((id) => ({ id, ...fileInfo(id) })).filter((f) => f.name)
    if (!files.length) return null
    return (
        <section aria-labelledby="att" className="attachments">
            <h2 id="att" style={{ fontSize: 15, fontWeight: 700 }}>Tài liệu đính kèm</h2>
            <ul>
                {files.map((f) => (
                    <li key={f.id}>
                        <FileIcon />
                        <a href={f.url} download={f.name}>{f.name}</a>
                        <span className="small muted">{f.size}</span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

function QuizIntro({ quiz, mode, left, tries, triesLeft, onStart, onResume }) {
    const { questions, minutes, pass, attempts } = quiz
    return (
        <div className="quiz-intro">
            <div className="quiz-facts">
                <div><span>Số câu hỏi</span><span>{questions.length} câu</span></div>
                <div><span>Thời gian</span><span>{minutes} phút</span></div>
                <div><span>Điểm đạt</span><span>{pass}%</span></div>
                <div><span>Lượt làm</span><span>{attempts === 0 ? 'Không giới hạn' : `Còn ${Math.max(0, triesLeft)}/${attempts}`}</span></div>
            </div>
            <p className="text-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
                {quiz.is_graded ? 'Bài kiểm tra tính điểm, là điều kiện hoàn thành khóa học. ' : 'Quiz luyện tập, không tính vào kết quả khóa học. '}
                Tất cả câu hỏi hiển thị trên một trang. Đồng hồ bắt đầu đếm khi bạn bấm bắt đầu và bài tự nộp khi hết giờ.
            </p>
            <div className="row" style={{ gap: 12 }}>
                {mode === 'attempt' && <button type="button" className="btn btn--primary btn--lg" onClick={onResume}>Tiếp tục làm bài · còn {mmss(left)}</button>}
                {mode !== 'attempt' && triesLeft > 0 && (
                    <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>{tries.length ? 'Làm lại bài kiểm tra' : 'Bắt đầu làm bài'}</button>
                )}
                {mode !== 'attempt' && triesLeft <= 0 && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger-dark)' }}>Bạn đã dùng hết số lượt làm bài.</span>}
            </div>
            {tries.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Các lần làm trước</span>
                    {tries.map((t, i) => (
                        <div key={i} className="try-row">
                            <span>Lần {i + 1} · {duration(t.used)}</span>
                            <span className="row" style={{ gap: 12 }}>
                                <span style={{ fontWeight: 700 }}>{t.pct}%</span>
                                <Pill tone={t.ok ? 'success' : 'red'} tag>{t.ok ? 'Đạt' : 'Chưa đạt'}</Pill>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
