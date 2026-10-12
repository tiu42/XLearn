import axios from 'axios'

// Token lưu ở localStorage khi "Ghi nhớ đăng nhập", ngược lại ở sessionStorage (mất khi đóng tab).
const KEY = 'xlearn.auth'

export const tokenStore = {
    get() {
        try {
            const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)
            return raw ? JSON.parse(raw) : null
        } catch {
            return null
        }
    },
    set(tokens, remember) {
        try {
            // remember không truyền (lúc refresh) → giữ nguyên nơi đang lưu
            const persist = remember ?? localStorage.getItem(KEY) !== null
            const target = persist ? localStorage : sessionStorage
            this.clear()
            target.setItem(KEY, JSON.stringify(tokens))
        } catch {
            /* storage bị chặn → chỉ giữ phiên trong bộ nhớ */
        }
    },
    clear() {
        try {
            localStorage.removeItem(KEY)
            sessionStorage.removeItem(KEY)
        } catch {
            /* bỏ qua */
        }
    },
}

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
})

api.interceptors.request.use((config) => {
    const tokens = tokenStore.get()
    if (tokens?.access_token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${tokens.access_token}`
    }
    return config
})

// Access token hết hạn → đổi refresh token một lần rồi gọi lại request.
// Nhiều request 401 cùng lúc dùng chung một lần refresh (refresh token bị xoay vòng ở backend).
let refreshing = null
let onSessionExpired = () => {}

export function setSessionExpiredHandler(fn) {
    onSessionExpired = fn
}

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config
        const tokens = tokenStore.get()
        const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/refresh')
        if (error.response?.status !== 401 || original._retried || isAuthCall || !tokens?.refresh_token) {
            return Promise.reject(error)
        }
        original._retried = true
        try {
            refreshing ??= api
                .post('/auth/refresh', { refresh_token: tokens.refresh_token })
                .then(({ data }) => tokenStore.set(data))
                .finally(() => { refreshing = null })
            await refreshing
            original.headers.Authorization = `Bearer ${tokenStore.get().access_token}`
            return api(original)
        } catch (refreshError) {
            tokenStore.clear()
            onSessionExpired()
            return Promise.reject(refreshError)
        }
    },
)

/** Lấy thông báo lỗi tiếng Việt từ response FastAPI. */
export function errorMessage(error, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.') {
    const detail = error?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
    if (error?.code === 'ERR_NETWORK') return 'Không kết nối được máy chủ. Kiểm tra backend đang chạy.'
    return fallback
}

export default api;
