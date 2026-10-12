import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { isTeacher } from './roles'

/** Chặn route khi chưa đăng nhập; `teacher` = chỉ giảng viên/admin. */
export default function RequireAuth({ teacher = false }) {
    const { user, loading } = useAuth()
    const location = useLocation()

    if (loading) return <div className="center-state">Đang tải…</div>
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
    if (teacher && !isTeacher(user)) return <Navigate to="/" replace />
    return <Outlet />
}
