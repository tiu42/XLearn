import { useRef, useState } from 'react'
import { errorMessage } from '../api'
import Markdown from './Markdown'

const TABLE = '\n| Cột 1 | Cột 2 |\n|---|---|\n| | |\n'

/**
 * Ô soạn Markdown cho bài đọc: thanh công cụ, chèn ảnh, xem trước.
 * onUploadImage(file) → Promise<{ id }>: tải ảnh lên rồi chèn ![…](file:<id>).
 * resolveFile(src): đổi file:<id> thành URL khi xem trước.
 */
export default function MarkdownEditor({ id, value, onChange, rows = 12, onUploadImage, resolveFile }) {
    const [tab, setTab] = useState('write')
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState('')
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

    async function pickImage(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
        // Ảnh lên object storage; backend gắn vào bài (lesson_files 'inline') khi lưu bài
        setUploading(true)
        setUploadError('')
        try {
            const { id: fileId } = await onUploadImage(file)
            insert(`\n![${alt}](file:${fileId})\n`)
        } catch (err) {
            setUploadError(err?.response ? errorMessage(err, 'Không tải được ảnh lên.') : err?.message || 'Không tải được ảnh lên.')
        } finally {
            setUploading(false)
        }
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
                        <button type="button" className="md-tool" onClick={() => fileInput.current?.click()} disabled={uploading}>
                            {uploading ? 'Đang tải ảnh…' : 'Chèn ảnh'}
                        </button>
                        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickImage} />
                    </div>
                )}
            </div>
            {tab === 'write' ? (
                <textarea id={id} ref={ta} rows={rows} className="textarea md-editor__input" value={value}
                    onChange={(e) => onChange(e.target.value)} spellCheck={false}
                    placeholder="# Tiêu đề&#10;&#10;Nội dung bài đọc… Dùng **đậm**, danh sách, bảng; ảnh chèn bằng nút Chèn ảnh." />
            ) : (
                <div className="md-editor__preview">
                    {value.trim() ? <Markdown resolveFile={resolveFile}>{value}</Markdown> : <p className="text-2">Chưa có nội dung.</p>}
                </div>
            )}
            {uploadError && <span className="error" role="alert">{uploadError}</span>}
            <span className="small text-2">Hỗ trợ Markdown: tiêu đề (#), **đậm**, danh sách (-), bảng, ảnh. Không chạy mã HTML.</span>
        </div>
    )
}
