import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api'
import { useAuth } from '../auth/AuthContext'
import { isTeacher } from '../auth/roles'
import { EyeIcon } from '../components/Icons'
import { BRAND } from '../data/mock'
import './Login.css'

const YEAR = new Date().getFullYear()
const okEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export default function Login() {
    const { user, login } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [view, setView] = useState('login') // login | forgot
    const [email, setEmail] = useState('')
    const [pw, setPw] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [remember, setRemember] = useState(true)
    const [err, setErr] = useState({})
    const [formErr, setFormErr] = useState('')
    const [busy, setBusy] = useState(false)
    const [sent, setSent] = useState(false)

    if (user) return <Navigate to={isTeacher(user) ? '/teach' : '/'} replace />

    const changeEmail = (v) => { setEmail(v); setErr((e) => ({ ...e, email: '' })); setFormErr('') }
    const changePw = (v) => { setPw(v); setErr((e) => ({ ...e, pw: false })); setFormErr('') }
    const emailError = (v) => (!v.trim() ? 'Vui lòng nhập email.' : !okEmail(v) ? 'Email không hợp lệ.' : '')

    async function submit(e) {
        e.preventDefault()
        if (busy) return
        const next = { email: emailError(email), pw: !pw }
        if (next.email || next.pw) { setErr(next); return }
        setBusy(true)
        try {
            const me = await login(email.trim(), pw, remember)
            const from = location.state?.from
            navigate(from && from !== '/login' ? from : isTeacher(me) ? '/teach' : '/', { replace: true })
        } catch (error) {
            setFormErr(errorMessage(error))
            setBusy(false)
        }
    }

    function sendReset(e) {
        e.preventDefault()
        const m = emailError(email)
        if (m) { setErr({ email: m }); return }
        // TODO: backend chưa có endpoint đặt lại mật khẩu — hiện chỉ hiển thị luồng giao diện
        setSent(true)
    }

    const goto = (v) => (e) => {
        e.preventDefault()
        setView(v); setErr({}); setFormErr(''); setSent(false)
        if (v === 'login') setPw('')
    }

    const emailField = (id) => (
        <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor={id}>Email công ty</label>
            <input id={id} type="email" autoComplete="username" className={`input login-input${err.email ? ' is-invalid' : ''}`}
                value={email} onChange={(e) => changeEmail(e.target.value)} placeholder="ten.ho@xlearn.dev"
                aria-invalid={!!err.email} aria-describedby={err.email ? `${id}-err` : undefined} />
            {err.email && <span id={`${id}-err`} className="error">{err.email}</span>}
        </div>
    )

    return (
        <div className="login">
            <section aria-label="Giới thiệu" className="login__intro">
                <div className="row" style={{ gap: 12 }}>
                    <span className="login__logo">{BRAND.logo}</span>
                    <span style={{ fontWeight: 700, fontSize: 18 }}>{BRAND.name}</span>
                </div>
                <div style={{ maxWidth: 460 }}>
                    <h1>Học tập và đào tạo nội bộ</h1>
                    <p className="login__lead">Các khóa học bắt buộc, tài liệu và bài kiểm tra của bạn đều ở một nơi.</p>
                    <ul className="login__points">
                        <li><span aria-hidden="true">✓</span>Theo dõi tiến độ và hạn chót từng khóa</li>
                        <li><span aria-hidden="true">✓</span>Học video, tài liệu và làm bài kiểm tra trực tuyến</li>
                        <li><span aria-hidden="true">✓</span>Giảng viên quản lý khóa học và học viên</li>
                    </ul>
                </div>
                <p className="login__foot">© {YEAR} {BRAND.name} · Chỉ dành cho nhân viên</p>
            </section>

            <main className="login__main">
                <div className="login__card">
                    {view === 'login' && (
                        <form onSubmit={submit} noValidate>
                            <h2 className="login__title">Đăng nhập</h2>
                            <p className="login__sub">Dùng tài khoản email công ty của bạn.</p>

                            {formErr && <div role="alert" className="status-msg status-msg--error" style={{ marginBottom: 18 }}>{formErr}</div>}

                            {emailField('l-e')}

                            <div className="field" style={{ marginBottom: 14 }}>
                                <div className="row-between" style={{ alignItems: 'baseline' }}>
                                    <label htmlFor="l-p">Mật khẩu</label>
                                    <a href="#forgot" onClick={goto('forgot')} style={{ fontSize: 14 }}>Quên mật khẩu?</a>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input id="l-p" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                                        className={`input login-input${err.pw ? ' is-invalid' : ''}`} style={{ paddingRight: 44 }}
                                        value={pw} onChange={(e) => changePw(e.target.value)} aria-invalid={!!err.pw} />
                                    <button type="button" className="login__eye" onClick={() => setShowPw((s) => !s)}
                                        aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                                        <EyeIcon off={showPw} />
                                    </button>
                                </div>
                                {err.pw && <span className="error">Vui lòng nhập mật khẩu.</span>}
                            </div>

                            <label className="check" style={{ marginBottom: 18 }}>
                                <input type="checkbox" checked={remember} onChange={() => setRemember((r) => !r)} />
                                Ghi nhớ đăng nhập trên máy này
                            </label>

                            <button type="submit" className="btn btn--primary btn--block login__submit" disabled={busy}>
                                {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
                            </button>

                            {import.meta.env.DEV && (
                                <div className="login__hint">
                                    <strong>Tài khoản thử (dev):</strong> test.hocvien@xlearn.dev (học viên) · test.giangvien@xlearn.dev (giảng viên) · mật khẩu Password@123. Danh sách đầy đủ: backend/db/README.md
                                </div>
                            )}
                        </form>
                    )}

                    {view === 'forgot' && (
                        <div>
                            <a href="#login" onClick={goto('login')} className="back-link" style={{ minHeight: 32, marginBottom: 10 }}>‹ Quay lại đăng nhập</a>
                            <h2 className="login__title">Đặt lại mật khẩu</h2>
                            {!sent ? (
                                <form onSubmit={sendReset} noValidate>
                                    <p className="login__sub" style={{ lineHeight: 1.5, marginBottom: 22 }}>
                                        Nhập email công ty, chúng tôi sẽ gửi đường dẫn đặt lại mật khẩu.
                                    </p>
                                    {emailField('f-e')}
                                    <button type="submit" className="btn btn--primary btn--block login__submit">Gửi đường dẫn</button>
                                </form>
                            ) : (
                                <>
                                    <div role="status" className="status-msg status-msg--ok" style={{ marginTop: 14, fontSize: 15, lineHeight: 1.5, padding: 14 }}>
                                        Đã gửi đường dẫn đặt lại mật khẩu tới <strong>{email}</strong>. Liên kết có hiệu lực trong 30 phút.
                                    </div>
                                    <p className="login__sub" style={{ marginTop: 16, fontSize: 14 }}>
                                        Không nhận được email? Kiểm tra thư rác hoặc liên hệ quản trị viên hệ thống.
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
