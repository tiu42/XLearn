export const isTeacher = (user) => !!user?.roles?.some((r) => r === 'instructor' || r === 'admin')

/** "Nguyễn Minh Anh" → "MA" (hai chữ cuối, theo cách gọi tên tiếng Việt). */
export function initials(name = '') {
    const w = name.trim().split(/\s+/)
    return ((w.length > 1 ? w[w.length - 2][0] : '') + (w[w.length - 1]?.[0] ?? '')).toUpperCase()
}
