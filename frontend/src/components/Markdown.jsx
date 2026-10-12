import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveFileUrl } from '../data/mock'

// Không bật HTML thô (không dùng rehype-raw) → <script>, onerror… trong nội dung chỉ hiện như chữ.
// defaultUrlTransform chặn javascript: …; riêng file:<id> là quy ước ảnh lưu trong object storage.
const urlTransform = (url) => (/^file:\d+$/.test(url) ? url : defaultUrlTransform(url))

const components = {
    img: ({ src, alt }) => <img src={resolveFileUrl(src)} alt={alt ?? ''} loading="lazy" />,
    table: ({ children }) => <div className="table-wrap"><table>{children}</table></div>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
}

/** Nội dung bài đọc (lessons.content, Markdown). */
export default function Markdown({ children }) {
    return (
        <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
                {children ?? ''}
            </ReactMarkdown>
        </div>
    )
}
