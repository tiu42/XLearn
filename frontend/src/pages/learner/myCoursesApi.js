import { keepPreviousData, useQuery } from '@tanstack/react-query'
import api from '../../api'
import { deptShort } from '../../data/mock'

/**
 * Khóa học của tôi: GET /me/courses. Mọi trang dùng chung cache với key ['my-courses', params].
 * Khi tiến độ học thay đổi (hoàn thành bài, nộp quiz…) gọi
 * queryClient.invalidateQueries({ queryKey: MY_COURSES_KEY }) để lần sau lấy số liệu mới.
 */
export const MY_COURSES_KEY = ['my-courses']

export const fetchMyCourses = (params, signal) => api.get('/me/courses', { params, signal }).then((r) => r.data)

export const myCoursesQuery = (params) => ({
    queryKey: [...MY_COURSES_KEY, params],
    queryFn: ({ signal }) => fetchMyCourses(params, signal),
})

export const useMyCourses = (params) => useQuery({ ...myCoursesQuery(params), placeholderData: keepPreviousData })

// Nền sọc cho khóa chưa có ảnh bìa, chọn theo id để mỗi khóa giữ một màu cố định
const PALETTE = [['#0F6CBF', '#2A82CF'], ['#5B3FD9', '#7259E0'], ['#00798A', '#19909F'], ['#3F6E2A', '#558541'], ['#B54A00', '#C9631C']]
export const courseColors = (c) => PALETTE[c.id % PALETTE.length]

/** Nhãn danh mục khóa: "HSE · Bắt buộc" */
export const courseCategory = (c) => `${c.department ? deptShort(c.department.code) : 'Chung'} · ${c.is_mandatory ? 'Bắt buộc' : 'Tự chọn'}`
