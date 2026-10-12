import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { MY_COURSES_KEY } from '../learner/myCoursesApi'

/**
 * Quản lý khóa học (giảng viên): GET /teach/courses (key ['teach-courses', 'list']),
 * GET /teach/courses/:id (key ['teach-courses', 'detail', id]), POST/PATCH/DELETE /teach/courses.
 * Sau khi tạo/sửa/xóa: làm mới mọi key 'teach-courses' và 'my-courses' (học viên thấy tên/trạng thái mới).
 */
export const TEACH_COURSES_KEY = ['teach-courses']

export const useTeachCourses = () => useQuery({
    queryKey: [...TEACH_COURSES_KEY, 'list'],
    queryFn: ({ signal }) => api.get('/teach/courses', { signal }).then((r) => r.data),
})

export const useTeachCourse = (id) => useQuery({
    queryKey: [...TEACH_COURSES_KEY, 'detail', String(id)],
    queryFn: ({ signal }) => api.get(`/teach/courses/${id}`, { signal }).then((r) => r.data),
})

// Danh mục phòng ban ít thay đổi → giữ trong cache suốt phiên
export const useDepartments = () => useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => api.get('/departments', { signal }).then((r) => r.data),
    staleTime: Infinity,
})

function useInvalidateCourses() {
    const qc = useQueryClient()
    return () => Promise.all([
        qc.invalidateQueries({ queryKey: TEACH_COURSES_KEY }),
        qc.invalidateQueries({ queryKey: MY_COURSES_KEY }),
    ])
}

/** Tạo (id rỗng) hoặc sửa khóa học. Trả về khóa học sau khi lưu. */
export function useSaveCourse() {
    const invalidate = useInvalidateCourses()
    return useMutation({
        mutationFn: ({ id, body }) => (id
            ? api.patch(`/teach/courses/${id}`, body)
            : api.post('/teach/courses', body)).then((r) => r.data),
        onSuccess: invalidate,
    })
}

export function useDeleteCourse() {
    const invalidate = useInvalidateCourses()
    return useMutation({
        mutationFn: (id) => api.delete(`/teach/courses/${id}`),
        onSuccess: invalidate,
    })
}

/* Hạn hoàn thành: giao diện dùng 'YYYY-MM-DD' giờ Việt Nam, DB lưu thời điểm UTC cuối ngày 23:59:59+07 */
export const toDueAt = (date) => (date ? `${date}T23:59:59+07:00` : null)
export const fromDueAt = (iso) => (iso
    ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })  // en-CA → YYYY-MM-DD
    : '')
