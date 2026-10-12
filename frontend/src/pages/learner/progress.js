// Tiến độ theo chủ đề, dùng chung cho Trang khóa học và Giao diện học.

export const sectionStatus = (s) => {
    const done = s.items.filter((i) => i.done).length
    return done === s.items.length ? 'done' : done > 0 ? 'prog' : 'not'
}

/** Khóa học tuần tự (courses.is_sequential): chủ đề i bị khóa khi có chủ đề đứng trước chưa hoàn thành. */
export function lockedSections(course) {
    if (!course.is_sequential) return course.sections.map(() => false)
    let blocked = false
    return course.sections.map((s) => {
        const locked = blocked
        if (sectionStatus(s) !== 'done') blocked = true
        return locked
    })
}

/** Tên chủ đề như trên giao diện: chủ đề đầu là "Phần mở đầu". */
export const sectionLabel = (i) => (i === 0 ? 'Phần mở đầu' : `Chủ đề ${i}`)
