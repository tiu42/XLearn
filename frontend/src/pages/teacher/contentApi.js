import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import api from '../../api'
import { MY_COURSES_KEY } from '../learner/myCoursesApi'
import { TEACH_COURSES_KEY } from './teachApi'

/**
 * Nội dung khóa học (giảng viên): GET /teach/courses/:id/content (key ['teach-content', id]) và các thao tác
 * thêm/sửa/xóa/sắp xếp chủ đề, bài học. Sau mỗi thao tác làm mới nội dung, danh sách khóa (số bài)
 * và dữ liệu học viên (bài đã xuất bản).
 */
export const contentKey = (courseId) => ['teach-content', String(courseId)]

export const useCourseContent = (courseId) => useQuery({
    queryKey: contentKey(courseId),
    queryFn: ({ signal }) => api.get(`/teach/courses/${courseId}/content`, { signal }).then((r) => r.data),
})

/** mutate({ method, path, body }): path tính từ /teach/courses/:id, vd '/sections', '/lessons/12'. */
export function useContentAction(courseId) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ method, path, body }) => api.request({ method, url: `/teach/courses/${courseId}${path}`, data: body })
            .then((r) => r.data),
        // Kể cả khi lỗi (vd danh sách sắp xếp đã cũ) → tải lại để giao diện khớp server
        onSettled: () => Promise.all([
            qc.invalidateQueries({ queryKey: contentKey(courseId) }),
            qc.invalidateQueries({ queryKey: TEACH_COURSES_KEY }),
            qc.invalidateQueries({ queryKey: MY_COURSES_KEY }),
        ]),
    })
}

/* --------------------------------------------------------------------------
 * Upload file nhiều phần (multipart): backend chia phần + ký URL cho từng phần → trình duyệt PUT
 * song song thẳng lên bucket (phần lỗi chỉ gửi lại phần đó) → backend ghép các phần
 * ------------------------------------------------------------------------ */
export const MAX_UPLOAD_BYTES = 500 * 1024 ** 3 // khớp MAX_UPLOAD_MB của backend (Supabase gói Pro: 500 GB/file)
const CONCURRENCY = 4 // số phần tải cùng lúc
const URL_BATCH = 20 // xin URL theo lô, dần dần trong lúc tải → URL (hạn 1 giờ) không hết hạn với file lớn
const RETRIES = 3 // số lần thử mỗi phần
export const VIDEO_ACCEPT = 'video/mp4,video/webm'
export const ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,image/*'

// Video: đọc thời lượng ngay trong trình duyệt để hiện "12:30" mà backend không phải tải file về
function videoDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file)
        const v = document.createElement('video')
        const done = (value) => { URL.revokeObjectURL(url); resolve(value) }
        v.preload = 'metadata'
        v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration) : null)
        v.onerror = () => done(null)
        setTimeout(() => done(null), 5000)
        v.src = url
    })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Tải một file lên khóa học. onProgress(0..100). Trả về file (StorageFileOut: id, filename, url…). */
export async function uploadFile(courseId, file, onProgress) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`“${file.name}” vượt quá ${fmtSize(MAX_UPLOAD_BYTES)}.`)
    const base = `/teach/courses/${courseId}/uploads`
    const { data: t } = await api.post(base, { filename: file.name, content_type: file.type || 'application/octet-stream', size_bytes: file.size })
    const duration = file.type.startsWith('video/') ? videoDuration(file) : null // đọc song song với lúc tải

    // URL từng phần: phần đầu tiên chưa có URL kéo theo cả lô URL_BATCH phần sau nó
    const urls = new Map() // số phần → Promise<Map<số phần, url>>
    const urlFor = async (n) => {
        if (!urls.has(n)) {
            const numbers = []
            for (let k = n; k <= t.part_count && numbers.length < URL_BATCH; k++) if (!urls.has(k)) numbers.push(k)
            const batch = api.post(`${base}/${t.id}/parts`, { upload_id: t.upload_id, part_numbers: numbers })
                .then((r) => new Map(r.data.parts.map((p) => [p.part_number, p.url])))
            numbers.forEach((k) => urls.set(k, batch))
            batch.catch(() => numbers.forEach((k) => urls.delete(k)))
        }
        return (await urls.get(n)).get(n)
    }

    const loaded = new Array(t.part_count).fill(0)
    const report = () => onProgress?.(Math.min(100, Math.floor((loaded.reduce((a, b) => a + b, 0) * 100) / Math.max(file.size, 1))))
    let failed = false

    async function sendPart(n) {
        const start = (n - 1) * t.part_size
        const blob = file.slice(start, Math.min(start + t.part_size, file.size))
        for (let attempt = 1; ; attempt++) {
            try {
                // axios gốc, không phải instance api: URL đã có chữ ký, không được gửi kèm token đăng nhập
                const res = await axios.put(await urlFor(n), blob, {
                    onUploadProgress: (e) => { loaded[n - 1] = e.loaded; report() },
                })
                const etag = res.headers.etag
                if (!etag) {
                    const err = new Error('Nơi lưu trữ không trả ETag cho trình duyệt (cần CORS Expose-Headers: ETag).')
                    err.fatal = true
                    throw err
                }
                loaded[n - 1] = blob.size
                report()
                return etag
            } catch (err) {
                loaded[n - 1] = 0
                if (err.fatal || failed || attempt >= RETRIES) throw err
                urls.delete(n) // URL có thể đã hết hạn → lần sau xin URL mới
                await sleep(1000 * attempt)
            }
        }
    }

    const etags = []
    let next = 1
    try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, t.part_count) }, async () => {
            while (!failed && next <= t.part_count) {
                const n = next++
                etags[n - 1] = await sendPart(n)
            }
        }))
    } catch (err) {
        failed = true // các luồng khác dừng sau phần đang gửi
        api.delete(`${base}/${t.id}`, { params: { upload_id: t.upload_id } }).catch(() => {}) // bucket bỏ các phần đã nhận
        throw err
    }

    const { data } = await api.post(`${base}/${t.id}/complete`, {
        upload_id: t.upload_id,
        parts: etags.map((etag, i) => ({ part_number: i + 1, etag })),
        ...(duration ? { duration_seconds: await duration } : {}),
    })
    return data
}

/* Tiện ích hiển thị */
export const fmtSize = (bytes) => {
    if (bytes == null) return ''
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    const [n, unit] = bytes < 1024 ** 3 ? [bytes / 1024 ** 2, 'MB'] : [bytes / 1024 ** 3, 'GB']
    return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit}`
}
export const fmtDuration = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
