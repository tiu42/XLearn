import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import { LearnerHeader, TeacherHeader } from './components/AppHeader'
import Login from './pages/Login'
import CourseHome from './pages/learner/CourseHome'
import Dashboard from './pages/learner/Dashboard'
import Learn from './pages/learner/Learn'
import MyCourses from './pages/learner/MyCourses'
import CourseContent from './pages/teacher/CourseContent'
import CourseStats from './pages/teacher/CourseStats'
import QuizEditor from './pages/teacher/QuizEditor'
import StudentDetail from './pages/teacher/StudentDetail'
import Students from './pages/teacher/Students'
import TeachCourses from './pages/teacher/TeachCourses'

const LearnerLayout = () => (
    <div className="page"><LearnerHeader /><Outlet /></div>
)

const TeacherLayout = () => (
    <div className="page page--subtle"><TeacherHeader /><Outlet /></div>
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
                        <Route path="courses/:courseId/learn" element={<Learn />} />
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
