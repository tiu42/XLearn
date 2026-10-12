import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api'
import { MY_COURSES_KEY } from './myCoursesApi'

/**
 * Làm bài kiểm tra (backend/app/routers/quiz.py), gốc /me/courses/:courseId/lessons/:lessonId/quiz:
 *   GET    ''                         trạng thái: lịch sử lượt, lượt đang làm dở, còn bao nhiêu lượt (key ['quiz', c, l])
 *   POST   /attempts                  bắt đầu lượt mới hoặc làm tiếp lượt dở → câu hỏi (không kèm đáp án) + bài đã lưu
 *   PUT    /attempts/:id/answers      lưu tạm toàn bộ bài làm
 *   POST   /attempts/:id/submit       nộp bài → kết quả + tiến độ bài + tiến độ khóa
 *   GET    /attempts/:id              kết quả lượt đã nộp (key ['quiz', c, l, 'attempt', id])
 *
 * Chấm điểm, hạn nộp và việc có được xem đáp án hay không đều do backend quyết định.
 * Bài làm phía giao diện: { [questionId]: number[] (id phương án) | string (tự luận ngắn) }.
 */
const base = (courseId, lessonId) => `/me/courses/${courseId}/lessons/${lessonId}/quiz`
export const quizKey = (courseId, lessonId) => ['quiz', String(courseId), String(lessonId)]
const resultKey = (courseId, lessonId, attemptId) => [...quizKey(courseId, lessonId), 'attempt', String(attemptId)]
const lessonKey = (courseId, lessonId) => ['lesson', String(courseId), String(lessonId)]

export const useQuizStatus = (courseId, lessonId) => useQuery({
    queryKey: quizKey(courseId, lessonId),
    queryFn: ({ signal }) => api.get(base(courseId, lessonId), { signal }).then((r) => r.data),
    staleTime: 0, // lượt làm dở / hết giờ thay đổi theo thời gian → mở bài là lấy lại
})

export const useQuizResult = (courseId, lessonId, attemptId) => useQuery({
    queryKey: resultKey(courseId, lessonId, attemptId),
    queryFn: ({ signal }) => api.get(`${base(courseId, lessonId)}/attempts/${attemptId}`, { signal }).then((r) => r.data),
    enabled: attemptId != null,
    placeholderData: keepPreviousData,
})

/** Bài làm phía giao diện → body API. Câu bỏ trống không gửi. */
export function toApiAnswers(answers) {
    return {
        answers: Object.entries(answers).flatMap(([qid, a]) => {
            if (Array.isArray(a)) return a.length ? [{ question_id: Number(qid), option_ids: a }] : []
            return String(a ?? '').trim() ? [{ question_id: Number(qid), text: a }] : []
        }),
    }
}

/** Bài làm đã lưu (API) → bài làm phía giao diện. */
export const fromApiAnswers = (list) =>
    Object.fromEntries(list.map((a) => [a.question_id, a.text != null ? a.text : a.option_ids]))

export function useStartAttempt(courseId, lessonId) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post(`${base(courseId, lessonId)}/attempts`).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: quizKey(courseId, lessonId), exact: true })
            // Lượt đầu tiên: bài chuyển sang "đang học"
            qc.invalidateQueries({ queryKey: lessonKey(courseId, lessonId) })
            qc.invalidateQueries({ queryKey: MY_COURSES_KEY })
        },
    })
}

export function useSaveAnswers(courseId, lessonId) {
    return useMutation({
        mutationFn: ({ attemptId, answers }) =>
            api.put(`${base(courseId, lessonId)}/attempts/${attemptId}/answers`, toApiAnswers(answers)).then((r) => r.data),
    })
}

export function useSubmitAttempt(courseId, lessonId) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ attemptId, answers }) =>
            api.post(`${base(courseId, lessonId)}/attempts/${attemptId}/submit`, toApiAnswers(answers)).then((r) => r.data),
        onSuccess: (data) => {
            qc.setQueryData(resultKey(courseId, lessonId, data.attempt.id), data.attempt)
            qc.setQueryData(lessonKey(courseId, lessonId), (old) => old && { ...old, progress: data.progress })
            qc.invalidateQueries({ queryKey: quizKey(courseId, lessonId), exact: true })
            qc.invalidateQueries({ queryKey: MY_COURSES_KEY })
            qc.invalidateQueries({ queryKey: TIMELINE_KEY })
        },
    })
}

/** Dòng thời gian: giờ đóng bài kiểm tra + hạn hoàn thành khóa. range: '7' | '30' | '90' | 'overdue' */
export const TIMELINE_KEY = ['timeline']
export const useTimeline = (range) => useQuery({
    queryKey: [...TIMELINE_KEY, range],
    queryFn: ({ signal }) => api.get('/me/timeline', {
        params: range === 'overdue' ? { overdue: true } : { days: Number(range) }, signal,
    }).then((r) => r.data),
    placeholderData: keepPreviousData,
})
