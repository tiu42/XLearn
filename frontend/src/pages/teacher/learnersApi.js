import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { deptShort } from '../../data/mock'
import { TEACH_COURSES_KEY } from './teachApi'

/**
 * Thông số khóa & học viên (giảng viên):
 *   GET /teach/courses/:id/stats (key ['teach-stats', id]), GET …/learners/candidates (key ['teach-candidates', id]),
 *   POST/PATCH/DELETE …/learners; GET /teach/students (key ['teach-students', 'list']),
 *   GET /teach/students/:id (key ['teach-students', 'detail', id]), POST /teach/students/:id/courses.
 * Mọi thao tác ghi danh làm mới cả ba nhóm key trên và danh sách khóa (số học viên).
 */
const STATS_KEY = ['teach-stats']
const CANDIDATES_KEY = ['teach-candidates']
const STUDENTS_KEY = ['teach-students']

export const useCourseStats = (courseId) => useQuery({
    queryKey: [...STATS_KEY, String(courseId)],
    queryFn: ({ signal }) => api.get(`/teach/courses/${courseId}/stats`, { signal }).then((r) => r.data),
})

// Lọc tên/phòng ban làm ở giao diện trên tối đa 500 người
export const useLearnerCandidates = (courseId) => useQuery({
    queryKey: [...CANDIDATES_KEY, String(courseId)],
    queryFn: ({ signal }) => api.get(`/teach/courses/${courseId}/learners/candidates`, { signal, params: { limit: 500 } })
        .then((r) => r.data),
})

export const useStudents = () => useQuery({
    queryKey: [...STUDENTS_KEY, 'list'],
    queryFn: ({ signal }) => api.get('/teach/students', { signal }).then((r) => r.data),
})

export const useStudent = (id) => useQuery({
    queryKey: [...STUDENTS_KEY, 'detail', String(id)],
    queryFn: ({ signal }) => api.get(`/teach/students/${id}`, { signal }).then((r) => r.data),
})

function useEnrollmentMutation(mutationFn) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn,
        onSettled: () => Promise.all([STATS_KEY, CANDIDATES_KEY, STUDENTS_KEY, TEACH_COURSES_KEY]
            .map((queryKey) => qc.invalidateQueries({ queryKey }))),
    })
}

/** mutate({ userIds, dueAt }) → { added, skipped } */
export const useAddLearners = (courseId) => useEnrollmentMutation(({ userIds, dueAt }) =>
    api.post(`/teach/courses/${courseId}/learners`, { user_ids: userIds, due_at: dueAt }).then((r) => r.data))

/** mutate({ courseId, userIds }) */
export const useRemoveLearners = () => useEnrollmentMutation(({ courseId, userIds }) =>
    api.delete(`/teach/courses/${courseId}/learners`, { params: { user_ids: userIds }, paramsSerializer: { indexes: null } }))

/** mutate({ courseId, userId, dueAt }) — dueAt null = không có hạn */
export const useUpdateLearner = () => useEnrollmentMutation(({ courseId, userId, dueAt }) =>
    api.patch(`/teach/courses/${courseId}/learners/${userId}`, { due_at: dueAt }).then((r) => r.data))

/** mutate({ courseIds, dueAt }) → { added, skipped } */
export const useEnrolStudent = (studentId) => useEnrollmentMutation(({ courseIds, dueAt }) =>
    api.post(`/teach/students/${studentId}/courses`, { course_ids: courseIds, due_at: dueAt }).then((r) => r.data))

/* --------------------------------------------------------------------------
 * Hiển thị
 * ------------------------------------------------------------------------ */
export const PROGRESS_TEXT = { completed: 'Đã hoàn thành', in_progress: 'Đang học', not_started: 'Chưa bắt đầu' }
export const PROGRESS_PILL = { completed: 'pill--green', in_progress: 'pill--blue', not_started: 'pill--gray' }

export const deptName = (u) => (u.department ? deptShort(u.department.code) : '—')

export const pct = (v) => `${Math.round(v)}%`

const TZ = 'Asia/Ho_Chi_Minh'
const DATE = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ })

/** Thời điểm UTC → 'DD/MM/YYYY' giờ Việt Nam ('—' nếu rỗng). */
export const fmtDay = (iso) => (iso ? DATE.format(new Date(iso)) : '—')

/** Lần học gần nhất: 'Hôm nay, 14:05' | 'Hôm qua, 09:20' | 'DD/MM/YYYY'. */
export function fmtActivity(iso, empty = 'Chưa học') {
    if (!iso) return empty
    const d = new Date(iso)
    const today = new Date()
    if (dayKey(d) === dayKey(today)) return `Hôm nay, ${TIME.format(d)}`
    if (dayKey(d) === dayKey(new Date(today.getTime() - 86400000))) return `Hôm qua, ${TIME.format(d)}`
    return DATE.format(d)
}

/** Hạn đã qua mà chưa hoàn thành. */
export const isOverdue = (row) => Boolean(row.due_at) && row.progress_status !== 'completed' && new Date(row.due_at) < new Date()
