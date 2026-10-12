// Icon nét (stroke) lấy từ thiết kế; màu theo currentColor.
const Svg = ({ size = 20, sw = 1.8, children, fill = 'none' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'}
        strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
)

export const ChevronDown = (p) => <Svg size={14} sw={2} {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const ChevronLeft = (p) => <Svg size={16} sw={2} {...p}><path d="M15 18l-6-6 6-6" /></Svg>
export const PlayIcon = (p) => <Svg size={14} fill="currentColor" {...p}><path d="M8 5v14l11-7z" /></Svg>
export const LockIcon = (p) => <Svg size={12} sw={2.2} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
export const CloseIcon = (p) => <Svg size={16} sw={2} {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const TimerIcon = (p) => <Svg size={16} sw={2} {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></Svg>
export const EyeIcon = ({ off, ...p }) => (
    <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{off && <path d="M3 3l18 18" />}</Svg>
)
export const QuizIcon = (p) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></Svg>
export const CalendarIcon = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
export const FileIcon = (p) => <Svg size={18} {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></Svg>
export const SidebarIcon = ({ open, ...p }) => (
    <Svg size={18} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d={open ? 'M9 4v16M15 10l-2 2 2 2' : 'M9 4v16M13 10l2 2-2 2'} /></Svg>
)
export const CheckIcon = (p) => <Svg size={14} sw={2.4} {...p}><path d="M5 12l5 5 9-10" /></Svg>
