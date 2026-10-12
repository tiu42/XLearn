import { useCallback, useEffect, useRef, useState } from 'react'

/** Thông báo nổi góc phải, tự ẩn sau 2,6 giây. */
export function useToast() {
    const [msg, setMsg] = useState('')
    const timer = useRef(null)
    useEffect(() => () => clearTimeout(timer.current), [])
    const flash = useCallback((m) => {
        setMsg(m)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setMsg(''), 2600)
    }, [])
    const toast = msg ? <div role="status" className="toast">{msg}</div> : null
    return [toast, flash]
}

/** Tập id được chọn (checkbox) dạng Set bất biến. */
export function useSelection(initial = []) {
    const [sel, setSel] = useState(() => new Set(initial))
    const toggle = useCallback((id) => setSel((s) => {
        const n = new Set(s)
        if (n.has(id)) n.delete(id); else n.add(id)
        return n
    }), [])
    return [sel, setSel, toggle]
}
