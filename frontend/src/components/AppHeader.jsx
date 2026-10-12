import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { initials, isTeacher } from '../auth/roles'
import { BRAND } from '../data/mock'
import { BellIcon, ChatIcon, ChevronDown } from './Icons'

function useLogout() {
    const { logout } = useAuth()
    const navigate = useNavigate()
    return async () => {
        await logout()
        navigate('/login', { replace: true })
    }
}

const Brand = ({ to, teacher }) => (
    <Link to={to} className="brand">
        <span className="brand__logo">{BRAND.logo}</span>
        <span className="brand__name">{BRAND.name}</span>
        {teacher && <span className="role-chip">Giảng viên</span>}
    </Link>
)

export function LearnerHeader() {
    const { user } = useAuth()
    const onLogout = useLogout()
    return (
        <header className="app-header">
            <Brand to="/" />
            <nav aria-label="Điều hướng chính" className="main-nav">
                <NavLink to="/" end>Bảng điều khiển</NavLink>
                <NavLink to="/courses">Khóa học của tôi</NavLink>
            </nav>
            <div className="header-actions">
                {isTeacher(user) && <Link to="/teach" style={{ fontSize: 14, marginRight: 8 }}>Giao diện giảng viên</Link>}
                <button type="button" className="icon-btn" aria-label="Thông báo, 2 mục mới">
                    <BellIcon /><span className="badge-count">2</span>
                </button>
                <button type="button" className="icon-btn" aria-label="Tin nhắn"><ChatIcon /></button>
                <button type="button" aria-label={`Menu người dùng: ${user?.full_name ?? ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 6px', border: 0, background: 'transparent', color: 'var(--text)' }}>
                    <span className="avatar">{initials(user?.full_name)}</span><ChevronDown />
                </button>
                <button type="button" className="link-btn" onClick={onLogout}>Đăng xuất</button>
            </div>
        </header>
    )
}

export function TeacherHeader() {
    const { user } = useAuth()
    const onLogout = useLogout()
    return (
        <header className="app-header">
            <Brand to="/teach" teacher />
            <nav aria-label="Điều hướng giảng viên" className="main-nav">
                <NavLink to="/teach" end>Khóa học</NavLink>
                <NavLink to="/teach/students">Học viên</NavLink>
            </nav>
            <div className="header-actions" style={{ gap: 12 }}>
                <Link to="/" style={{ fontSize: 14 }}>Giao diện học viên</Link>
                <span role="img" aria-label={`${user?.full_name ?? ''}, Giảng viên`} className="avatar avatar--teacher">
                    {initials(user?.full_name)}
                </span>
                <button type="button" className="link-btn" onClick={onLogout}>Đăng xuất</button>
            </div>
        </header>
    )
}
