import { QueryClient } from '@tanstack/react-query'

// Dùng chung toàn app: cache theo queryKey, request trùng nhau được gộp làm một.
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,  // trong 30 s coi dữ liệu là mới → vào lại trang không gọi API
            gcTime: 5 * 60_000,  // cache không còn ai dùng giữ thêm 5 phút
            retry: (count, error) => count < 2 && !(error?.response?.status < 500),  // lỗi 4xx không thử lại
            refetchOnWindowFocus: false,
        },
    },
})
