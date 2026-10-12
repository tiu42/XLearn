import { Link, NavLink } from 'react-router-dom'
import { fmtDate } from '../../data/mock'

/** Phần đầu trang quản lý một khóa: đường dẫn, tên, trạng thái và tab con. */
export default function CourseHead({ course, action }) {
    const open = course.status === 'open'
    return (
        <div className="course-head">
            <div className="course-head__inner">
                <nav aria-label="Đường dẫn" className="breadcrumb">
                    <Link to="/teach">Khóa học</Link><span aria-hidden="true">›</span><span>{course.title}</span>
                </nav>
                <div className="row-between">
                    <div className="row">
                        <h1>{course.title}</h1>
                        <span className={`pill ${open ? 'pill--green' : 'pill--gray'}`}>{open ? 'Đang mở' : 'Bản nháp'}</span>
                    </div>
                    {action ?? <span className="text-2" style={{ fontSize: 14 }}>{course.dept} · {course.kind} · Hạn hoàn thành {fmtDate(course.due)}</span>}
                </div>
                <nav aria-label="Quản lý khóa học" className="sub-nav">
                    <NavLink to={`/teach/courses/${course.id}/stats`}>Thông số &amp; học viên</NavLink>
                    <NavLink to={`/teach/courses/${course.id}/content`}>Nội dung</NavLink>
                </nav>
            </div>
        </div>
    )
}
