import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import { LearnerHeader, TeacherHeader } from './components/AppHeader'
import Login from './pages/Login'

// Tách code theo trang: màn đăng nhập không phải tải trình hiển thị Markdown, trang giảng viên…
const CourseHome = lazy(() => import('./pages/learner/CourseHome'))
const Dashboard = lazy(() => import('./pages/learner/Dashboard'))
const Learn = lazy(() => import('./pages/learner/Learn'))
const MyCourses = lazy(() => import('./pages/learner/MyCourses'))
const CourseContent = lazy(() => import('./pages/teacher/CourseContent'))
const CourseStats = lazy(() => import('./pages/teacher/CourseStats'))
const QuizEditor = lazy(() => import('./pages/teacher/QuizEditor'))
const StudentDetail = lazy(() => import('./pages/teacher/StudentDetail'))
const Students = lazy(() => import('./pages/teacher/Students'))
const TeachCourses = lazy(() => import('./pages/teacher/TeachCourses'))

const Loading = () => <div className="center-state">Đang tải…</div>

const LearnerLayout = () => (
    <div className="page"><LearnerHeader /><Suspense fallback={<Loading />}><Outlet /></Suspense></div>
)

const TeacherLayout = () => (
    <div className="page page--subtle"><TeacherHeader /><Suspense fallback={<Loading />}><Outlet /></Suspense></div>
)

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route element={<RequireAuth />}>
                        <Route element={<LearnerLayout />}>
                            <Route index element={<Dashboard />} />
                            <Route path="courses" element={<MyCourses />} />
                            <Route path="courses/:courseId" element={<CourseHome />} />
                        </Route>
                        {/* Giao diện học tự quản header vì chế độ làm bài toàn màn hình */}
                        <Route path="courses/:courseId/learn" element={<Suspense fallback={<Loading />}><Learn /></Suspense>} />
                    </Route>

                    <Route path="teach" element={<RequireAuth teacher />}>
                        <Route element={<TeacherLayout />}>
                            <Route index element={<TeachCourses />} />
                            <Route path="courses/:courseId" element={<Navigate to="stats" replace />} />
                            <Route path="courses/:courseId/stats" element={<CourseStats />} />
                            <Route path="courses/:courseId/content" element={<CourseContent />} />
                            <Route path="courses/:courseId/quizzes/:quizId" element={<QuizEditor />} />
                            <Route path="students" element={<Students />} />
                            <Route path="students/:studentId" element={<StudentDetail />} />
                        </Route>
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}
