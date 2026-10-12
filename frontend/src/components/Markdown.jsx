import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveFileUrl } from '../data/mock'

// Không bật HTML thô (không dùng rehype-raw) → <script>, onerror… trong nội dung chỉ hiện như chữ.
// defaultUrlTransform chặn javascript: …; riêng file:<id> là quy ước ảnh lưu trong object storage.
const urlTransform = (url) => (/^file:\d+$/.test(url) ? url : defaultUrlTransform(url))

const components = (resolve) => ({
    img: ({ src, alt }) => <img src={resolve(src)} alt={alt ?? ''} loading="lazy" />,
    table: ({ children }) => <div className="table-wrap"><table>{children}</table></div>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
})
const MOCK_COMPONENTS = components(resolveFileUrl)

/**
 * Nội dung bài đọc (lessons.content, Markdown).
 * resolveFile(src): đổi file:<id> thành URL; bỏ trống = dùng file mẫu (màn giảng viên chưa có API).
 */
export default function Markdown({ children, resolveFile }) {
    return (
        <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}
                components={resolveFile ? components(resolveFile) : MOCK_COMPONENTS}>
                {children ?? ''}
            </ReactMarkdown>
        </div>
    )
}
