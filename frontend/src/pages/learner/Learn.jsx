import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LearnerHeader } from '../../components/AppHeader'
import { ChevronLeft, LockIcon, PlayIcon, SidebarIcon } from '../../components/Icons'
import { Pill, ProgressBar } from '../../components/ui'
import { getLearnTopic, QUIZ_QUESTIONS } from '../../data/mock'
import { duration, isRight, mmss } from './quiz'
import QuizAttempt from './QuizAttempt'
import QuizResult from './QuizResult'
import './learner.css'

const TYPE = { video: 'VIDEO', page: 'BÀI ĐỌC', quiz: 'BÀI KIỂM TRA', forum: 'DIỄN ĐÀN' }

export default function Learn() {
    const { courseId } = useParams()
    const topic = useMemo(() => getLearnTopic(), [])
    const questions = QUIZ_QUESTIONS
    const { minutes, attempts: allowed, pass } = topic.quiz
    const items = topic.items

    const [cur, setCur] = useState(0)
    const [done, setDone] = useState({ 1: true })
    const [side, setSide] = useState(true)
    const [mode, setMode] = useState('intro') // intro | attempt | result
    const [focus, setFocus] = useState(false)
    const [answers, setAnswers] = useState({})
    const [left, setLeft] = useState(0)
    const leftRef = useRef(0) // nguồn thật của đồng hồ; state chỉ để hiển thị
    const [tries, setTries] = useState([])

    const triesLeft = allowed === 0 ? Infinity : allowed - tries.length
    const last = tries[tries.length - 1]
    const nDone = items.filter((_, i) => done[i]).length
    const allDone = nDone === items.length
    const a = items[cur]
    const rules = {
        video: 'Tự động hoàn thành khi bạn xem hết video.',
        page: 'Tự động hoàn thành khi bạn mở bài đọc.',
        quiz: `Tự động hoàn thành khi bạn đạt từ ${pass}% điểm trở lên.`,
        forum: 'Tự động hoàn thành khi bạn truy cập diễn đàn.',
    }
    const meta = (x) => (x.t === 'quiz' ? `Bài kiểm tra · ${minutes} phút · ${allowed === 0 ? 'không giới hạn lượt' : `${allowed} lượt`}` : x.meta)

    const go = (i) => {
        if (i < 0 || i >= items.length || i === cur) return
        setDone((d) => {
            const n = { ...d }
            if (a.t === 'video') n[cur] = true // bản giao diện: coi như đã xem hết khi chuyển bài
            if (items[i].t === 'page' || items[i].t === 'forum') n[i] = true
            return n
        })
        setCur(i)
    }

    const finish = useCallback((timeout) => {
        const score = questions.filter((q, i) => isRight(q, answers[i])).length
        const ok = (score / questions.length) * 100 >= pass
        setTries((t) => [...t, { score, ok, used: minutes * 60 - Math.max(0, leftRef.current), timeout, ans: { ...answers } }])
        if (ok) setDone((d) => ({ ...d, [items.findIndex((x) => x.t === 'quiz')]: true }))
        setMode('result')
        setFocus(true)
    }, [answers, items, minutes, pass, questions])

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
        leftRef.current = minutes * 60
        setLeft(minutes * 60)
        setMode('attempt')
        setFocus(true)
    }

    if (focus && mode === 'attempt') {
        return <QuizAttempt title={a.name} questions={questions} answers={answers} setAnswers={setAnswers} left={left}
            onExit={() => setFocus(false)} onSubmit={finish} />
    }
    if (focus && mode === 'result' && last) {
        return <QuizResult title={items.find((x) => x.t === 'quiz').name} questions={questions} attempt={last} attemptNo={tries.length}
            allowed={allowed} pass={pass} triesLeft={triesLeft} onRetry={startQuiz}
            onNext={() => { setFocus(false); setMode('intro'); setDone((d) => ({ ...d, 3: true })); setCur(3) }}
            onExit={() => { setFocus(false); setMode('intro') }} />
    }

    const isDone = !!done[cur]
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
                                <span className="small strong" style={{ color: 'var(--primary)' }}>{topic.label}</span>
                                <h2 id="topic" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35 }}>{topic.title}</h2>
                                <span className="small muted">{topic.courseTitle}</span>
                            </div>
                            <div className="stack">
                                <ProgressBar value={(nDone / items.length) * 100} done={allDone} size="sm" label="Tiến độ chủ đề" />
                                <span className="small text-2">{nDone}/{items.length} bài học đã hoàn thành</span>
                            </div>
                        </div>
                        <nav aria-label="Bài học trong chủ đề" className="learn-side__nav">
                            {items.map((x, i) => (
                                <button key={x.name} type="button" className="lesson-item" aria-current={i === cur ? 'page' : undefined} onClick={() => go(i)}>
                                    <span className={`lesson-dot${done[i] ? ' lesson-dot--done' : ''}`}>{done[i] ? '✓' : i + 1}</span>
                                    <span className="stack" style={{ gap: 2 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600 }}>{x.name}</span>
                                        <span style={{ fontSize: 12 }} className="muted">{meta(x)}</span>
                                    </span>
                                </button>
                            ))}
                        </nav>
                        <div className="learn-side__foot">
                            {allDone ? (
                                <Link to={`/courses/${courseId}`} className="next-topic">
                                    <span><small style={{ color: 'var(--primary-soft-2)' }}>Chủ đề tiếp theo</small>{topic.next}</span><span aria-hidden="true">›</span>
                                </Link>
                            ) : (
                                <>
                                    <button type="button" className="next-topic" disabled>
                                        <span><small>Chủ đề tiếp theo</small>{topic.next}</span><LockIcon />
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
                    <div className="stack">
                        <span className="small muted">{topic.label} · {topic.title} · Bài {cur + 1}/{items.length}</span>
                        <div className="row">
                            <span className="type-label">{TYPE[a.t]}</span>
                            <Pill tone={isDone ? 'success' : 'gray'} tag>{isDone ? '✓ Đã hoàn thành' : 'Chưa hoàn thành'}</Pill>
                        </div>
                        <h1 style={{ fontSize: 26, fontWeight: 700 }}>{a.name}</h1>
                        <span className="small text-2">{rules[a.t]}</span>
                    </div>

                    {a.t === 'video' && (
                        <div className="stack" style={{ gap: 16 }}>
                            <div className="video-box">
                                <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 13, color: '#ADB5BD' }}>[VIDEO BÀI GIẢNG]</span>
                                <button type="button" className="video-box__play" aria-label="Phát video"><PlayIcon size={28} /></button>
                                <div className="video-box__bar" aria-hidden="true">
                                    <span>04:12</span>
                                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#495057' }}><div style={{ width: '35%', height: 4, borderRadius: 2, background: '#fff' }} /></div>
                                    <span>12:00</span>
                                </div>
                            </div>
                            <div className="prose">
                                <p>Video hướng dẫn cách chọn, kiểm tra và đeo đúng thiết bị bảo hộ cá nhân trước khi vào ca làm việc.</p>
                                <p style={{ fontWeight: 600 }}>Nội dung chính</p>
                                <ul>
                                    <li>Đọc biển báo PPE ở cửa vào từng khu vực</li>
                                    <li>Kiểm tra mũ, kính, găng tay trước khi sử dụng</li>
                                    <li>Báo cáo thiết bị hỏng qua phiếu yêu cầu</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {a.t === 'page' && (
                        <article className="prose" style={{ gap: 14 }}>
                            <p>Mỗi khu vực trong xưởng có yêu cầu PPE riêng. Tra bảng dưới đây trước khi vào khu vực mới.</p>
                            <div className="table-wrap">
                                <table className="table" style={{ minWidth: 480 }}>
                                    <thead><tr><th scope="col">Khu vực</th><th scope="col">PPE bắt buộc</th></tr></thead>
                                    <tbody>
                                        {topic.ppeTable.map(([zone, ppe]) => (
                                            <tr key={zone}><td style={{ fontWeight: 600 }}>{zone}</td><td>{ppe}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <a href="#pdf" className="btn" style={{ alignSelf: 'flex-start', minHeight: 40, color: 'var(--primary)' }}>Tải bản PDF (1,2 MB)</a>
                        </article>
                    )}

                    {a.t === 'quiz' && (
                        <div className="quiz-intro">
                            <div className="quiz-facts">
                                <div><span>Số câu hỏi</span><span>{questions.length} câu</span></div>
                                <div><span>Thời gian</span><span>{minutes} phút</span></div>
                                <div><span>Điểm đạt</span><span>{pass}%</span></div>
                                <div><span>Lượt làm</span><span>{allowed === 0 ? 'Không giới hạn' : `Còn ${Math.max(0, triesLeft)}/${allowed}`}</span></div>
                            </div>
                            <p className="text-2" style={{ fontSize: 15, lineHeight: 1.6 }}>
                                Gồm câu trắc nghiệm một đáp án, trắc nghiệm nhiều đáp án và tự luận ngắn. Bài làm hiển thị toàn màn hình với tất cả câu hỏi trên một trang.
                                Đồng hồ bắt đầu đếm khi bạn bấm bắt đầu và bài tự nộp khi hết giờ.
                            </p>
                            <div className="row" style={{ gap: 12 }}>
                                {mode === 'attempt' && (
                                    <button type="button" className="btn btn--primary btn--lg" onClick={() => setFocus(true)}>Tiếp tục làm bài · còn {mmss(left)}</button>
                                )}
                                {mode !== 'attempt' && triesLeft > 0 && (
                                    <button type="button" className="btn btn--primary btn--lg" onClick={startQuiz}>{tries.length ? 'Làm lại bài kiểm tra' : 'Bắt đầu làm bài'}</button>
                                )}
                                {mode !== 'attempt' && triesLeft <= 0 && (
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger-dark)' }}>Bạn đã dùng hết số lượt làm bài.</span>
                                )}
                            </div>
                            {tries.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700 }}>Các lần làm trước</span>
                                    {tries.map((t, i) => (
                                        <div key={i} className="try-row">
                                            <span>Lần {i + 1} · {duration(t.used)}</span>
                                            <span className="row" style={{ gap: 12 }}>
                                                <span style={{ fontWeight: 700 }}>{Math.round((t.score / questions.length) * 100)}%</span>
                                                <Pill tone={t.ok ? 'success' : 'red'} tag>{t.ok ? 'Đạt' : 'Chưa đạt'}</Pill>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {a.t === 'forum' && (
                        <div className="stack" style={{ gap: 12 }}>
                            <button type="button" className="btn btn--primary" style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 15 }}>Thêm chủ đề thảo luận</button>
                            <div className="forum-list">
                                {topic.forum.map((f) => (
                                    <a key={f.title} href="#thread">
                                        <span className="stack" style={{ gap: 2 }}>
                                            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{f.title}</span>
                                            <span className="small muted">{f.by}</span>
                                        </span>
                                        <span className="small text-2" style={{ whiteSpace: 'nowrap' }}>{f.replies} trả lời</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="lesson-nav">
                        <button type="button" className="btn" disabled={cur === 0} onClick={() => go(cur - 1)}>‹ Bài trước</button>
                        <button type="button" className="btn" disabled={cur === items.length - 1} onClick={() => go(cur + 1)}>Bài tiếp theo ›</button>
                    </div>
                </main>
            </div>
        </div>
    )
}
