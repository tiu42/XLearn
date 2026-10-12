import { useRef, useState } from 'react'
import { registerLocalFile } from '../data/mock'
import Markdown from './Markdown'

const TABLE = '\n| Cột 1 | Cột 2 |\n|---|---|\n| | |\n'

/** Ô soạn Markdown cho bài đọc: thanh công cụ, chèn ảnh, xem trước. */
export default function MarkdownEditor({ id, value, onChange, rows = 12 }) {
    const [tab, setTab] = useState('write')
    const ta = useRef(null)
    const fileInput = useRef(null)

    // Bọc vùng chọn bằng before/after, hoặc chèn mẫu khi chưa chọn gì; giữ con trỏ sau đoạn chèn
    function insert(before, after = '', placeholder = '') {
        const el = ta.current
        const start = el?.selectionStart ?? value.length
        const end = el?.selectionEnd ?? value.length
        const picked = value.slice(start, end) || placeholder
        const next = value.slice(0, start) + before + picked + after + value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
            if (!el) return
            el.focus()
            const pos = start + before.length + picked.length + after.length
            el.setSelectionRange(pos, pos)
        })
    }

    // Đầu dòng: thêm tiền tố (## , - ) vào đầu dòng chứa con trỏ
    function linePrefix(prefix) {
        const el = ta.current
        const start = el?.selectionStart ?? value.length
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        onChange(value.slice(0, lineStart) + prefix + value.slice(lineStart))
        requestAnimationFrame(() => el?.focus())
    }

    function pickImage(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        // Bản mock: ảnh giữ trong trình duyệt. Khi có API: upload → storage_objects + lesson_files (purpose = 'inline')
        const fileId = registerLocalFile(file)
        insert(`\n![${file.name.replace(/\.[^.]+$/, '')}](file:${fileId})\n`)
    }

    return (
        <div className="md-editor">
            <div className="md-editor__bar" role="toolbar" aria-label="Định dạng">
                <div role="tablist" aria-label="Chế độ" className="seg" style={{ padding: 2 }}>
                    <button type="button" role="tab" aria-selected={tab === 'write'} aria-pressed={tab === 'write'} onClick={() => setTab('write')}>Soạn</button>
                    <button type="button" role="tab" aria-selected={tab === 'preview'} aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Xem trước</button>
                </div>
                {tab === 'write' && (
                    <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="md-tool" onClick={() => insert('**', '**', 'chữ đậm')} aria-label="Chữ đậm"><b>B</b></button>
                        <button type="button" className="md-tool" onClick={() => insert('*', '*', 'chữ nghiêng')} aria-label="Chữ nghiêng"><i>I</i></button>
                        <button type="button" className="md-tool" onClick={() => linePrefix('## ')} aria-label="Tiêu đề">H</button>
                        <button type="button" className="md-tool" onClick={() => linePrefix('- ')} aria-label="Danh sách">•</button>
                        <button type="button" className="md-tool" onClick={() => insert(TABLE)} aria-label="Chèn bảng">Bảng</button>
                        <button type="button" className="md-tool" onClick={() => fileInput.current?.click()}>Chèn ảnh</button>
                        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickImage} />
                    </div>
                )}
            </div>
            {tab === 'write' ? (
                <textarea id={id} ref={ta} rows={rows} className="textarea md-editor__input" value={value}
                    onChange={(e) => onChange(e.target.value)} spellCheck={false}
                    placeholder="# Tiêu đề&#10;&#10;Nội dung bài đọc… Dùng **đậm**, danh sách, bảng; ảnh chèn bằng nút Chèn ảnh." />
            ) : (
                <div className="md-editor__preview">
                    {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-2">Chưa có nội dung.</p>}
                </div>
            )}
            <span className="small text-2">Hỗ trợ Markdown: tiêu đề (#), **đậm**, danh sách (-), bảng, ảnh. Không chạy mã HTML.</span>
        </div>
    )
}
