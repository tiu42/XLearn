import { Link, NavLink } from 'react-router-dom'
import { errorMessage } from '../../api'
import { COURSE_STATUS, deptShort, fmtDate } from '../../data/mock'
import { fromDueAt } from './teachApi'

/** Phần đầu trang quản lý một khóa: đường dẫn, tên, trạng thái và tab con. */
export default function CourseHead({ course, action }) {
    const st = COURSE_STATUS[course.status]
    return (
        <div className="course-head">
            <div className="course-head__inner">
                <nav aria-label="Đường dẫn" className="breadcrumb">
                    <Link to="/teach">Khóa học</Link><span aria-hidden="true">›</span><span>{course.title}</span>
                </nav>
                <div className="row-between">
                    <div className="row">
                        <h1>{course.title}</h1>
                        <span className={`pill pill--${st.tone}`}>{st.label}</span>
                    </div>
                    {action ?? (
                        <span className="text-2" style={{ fontSize: 14 }}>
                            {course.code} · {course.department ? deptShort(course.department.code) : 'Chung'} · {course.is_mandatory ? 'Bắt buộc' : 'Tự chọn'} · Hạn mặc định {fmtDate(fromDueAt(course.default_due_at))}
                        </span>
                    )}
                </div>
                <nav aria-label="Quản lý khóa học" className="sub-nav">
                    <NavLink to={`/teach/courses/${course.id}/stats`}>Thông số &amp; học viên</NavLink>
                    <NavLink to={`/teach/courses/${course.id}/content`}>Nội dung</NavLink>
                </nav>
            </div>
        </div>
    )
}

/** Thay cho cả trang khi đang tải khóa (useTeachCourse) hoặc không mở được khóa. */
export function CourseLoadState({ error }) {
    if (!error) return <main className="container container--1280 container--teach"><div className="center-state">Đang tải…</div></main>
    const code = error.response?.status
    const text = code === 404 || code === 422 ? 'Không tìm thấy khóa học.'
        : code === 403 ? 'Bạn không phụ trách khóa học này.'
            : errorMessage(error, 'Không tải được khóa học.')
    return (
        <main className="container container--1280 container--teach">
            <Link to="/teach" className="back-link">‹ Khóa học</Link>
            <div role="alert" className="status-msg status-msg--error">{text}</div>
        </main>
    )
}
