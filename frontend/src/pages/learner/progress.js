// Dùng chung cho Trang khóa học và Giao diện học. Trạng thái chủ đề / chủ đề bị khóa do backend tính
// (GET /me/courses/:id → sections[].status, sections[].locked).

/** Tên chủ đề như trên giao diện: chủ đề đầu là "Phần mở đầu". */
export const sectionLabel = (i) => (i === 0 ? 'Phần mở đầu' : `Chủ đề ${i}`)
