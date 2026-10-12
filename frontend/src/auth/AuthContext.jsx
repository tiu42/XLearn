import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { setSessionExpiredHandler, tokenStore } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    // Có token sẵn → phải hỏi /auth/me trước khi biết đã đăng nhập hay chưa
    const [loading, setLoading] = useState(() => !!tokenStore.get())

    useEffect(() => {
        setSessionExpiredHandler(() => setUser(null))
        if (!tokenStore.get()) return
        api.get('/auth/me')
            .then(({ data }) => setUser(data))
            .catch(() => tokenStore.clear())
            .finally(() => setLoading(false))
    }, [])

    const login = useCallback(async (email, password, remember) => {
        const { data } = await api.post('/auth/login', { email, password })
        const { user: me, ...tokens } = data
        tokenStore.set(tokens, remember)
        setUser(me)
        return me
    }, [])

    const logout = useCallback(async () => {
        const tokens = tokenStore.get()
        tokenStore.clear()
        setUser(null)
        if (tokens?.refresh_token) {
            // Idempotent ở backend; lỗi mạng cũng không chặn việc đăng xuất phía client
            await api.post('/auth/logout', { refresh_token: tokens.refresh_token }).catch(() => {})
        }
    }, [])

    const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
    return useContext(AuthContext)
}
