import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import api from '../../api'
import { MY_COURSES_KEY } from './myCoursesApi'

/**
 * Giao diện học:
 *   GET  /me/courses/:courseId/lessons/:lessonId           nội dung bài + tiến độ (key ['lesson', courseId, lessonId])
 *   POST /me/courses/:courseId/lessons/:lessonId/progress  ghi nhận học (mở bài, vị trí video, trang PDF, % đã đọc…)
 *
 * Điều kiện hoàn thành do backend quyết định (backend/app/learning.py); giao diện chỉ gửi số liệu nó có
 * và hiện hướng dẫn theo lesson.completion.code.
 */
const lessonKey = (courseId, lessonId) => ['lesson', String(courseId), String(lessonId)]

export const useLesson = (courseId, lessonId) => useQuery({
    queryKey: lessonKey(courseId, lessonId),
    queryFn: ({ signal }) => api.get(`/me/courses/${courseId}/lessons/${lessonId}`, { signal }).then((r) => r.data),
    enabled: lessonId != null,
})

/** report(lessonId, body?) — body rỗng = vừa mở bài. Xong thì cập nhật bài và làm mới tiến độ khóa. */
export function useReportProgress(courseId) {
    const qc = useQueryClient()
    const { mutate } = useMutation({
        mutationFn: ({ lessonId, body }) =>
            api.post(`/me/courses/${courseId}/lessons/${lessonId}/progress`, body ?? {}).then((r) => r.data),
        onSuccess: (data, { lessonId }) => {
            const key = lessonKey(courseId, lessonId)
            const before = qc.getQueryData(key)?.progress.status
            qc.setQueryData(key, (old) => old && { ...old, progress: data.progress })
            // Trạng thái bài đổi (bắt đầu / hoàn thành) → trạng thái chủ đề, khóa tuần tự, % khóa học đổi theo
            if (before !== data.progress.status) qc.invalidateQueries({ queryKey: MY_COURSES_KEY })
        },
    })
    return useCallback((lessonId, body) => mutate({ lessonId, body }), [mutate])
}
