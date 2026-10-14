import { useState } from 'react'
import { errorMessage } from '../../api'
import { Modal } from '../../components/ui'
import { useSelection } from '../../components/hooks'
import { useEnrolStudent, useStudent } from './learnersApi'
import { fromDueAt, toDueAt, useTeachCourses } from './teachApi'

/** Ô chọn hạn hoàn thành ('YYYY-MM-DD' giờ Việt Nam). */
export function DueField({ id, value, onChange, hint }) {
    return (
        <div className="field">
            <label htmlFor={id}>Hạn hoàn thành</label>
            <input id={id} type="date" className="input" style={{ maxWidth: 220 }} value={value} onChange={(e) => onChange(e.target.value)} />
            {hint && <span className="text-2" style={{ fontSize: 12 }}>{hint}</span>}
        </div>
    )
}

/** Đổi hạn hoàn thành của một ghi danh. onSave(dueAt | null) trả về Promise. */
export function DueDateModal({ title, dueAt, onClose, onSave }) {
    const [due, setDue] = useState(fromDueAt(dueAt))
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')

    async function save() {
        setBusy(true)
        setErr('')
        try {
            await onSave(toDueAt(due))
        } catch (e) {
            setErr(errorMessage(e, 'Không lưu được hạn hoàn thành.'))
            setBusy(false)
        }
    }

    return (
        <Modal title={title} width={440} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
            </>}>
            <div className="dialog__body">
                <DueField id="due-edit" value={due} onChange={setDue} hint="Để trống nếu không có hạn." />
                {err && <div role="alert" className="status-msg status-msg--error">{err}</div>}
            </div>
        </Modal>
    )
}

/** Thêm một học viên vào các khóa user được quản lý học viên (không phải trợ giảng). */
export function EnrolCoursesModal({ student, onClose, onDone }) {
    const { data: detail } = useStudent(student.id)
    const { data: courses, isPending, error } = useTeachCourses()
    const enrol = useEnrolStudent(student.id)
    const [picks, , toggle] = useSelection()
    const [due, setDue] = useState('')
    const enrolled = new Set((detail?.courses ?? []).map((c) => c.course_id))
    const opts = (courses?.items ?? []).filter((c) => c.can_edit)

    function submit() {
        enrol.mutate({ courseIds: [...picks], dueAt: toDueAt(due) }, {
            onSuccess: ({ added }) => onDone(`Đã thêm ${student.full_name} vào ${added} khóa học.`),
        })
    }

    return (
        <Modal title={`Thêm ${student.full_name} vào khóa học`} width={520} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={picks.size === 0 || enrol.isPending} onClick={submit}>
                    {enrol.isPending ? 'Đang thêm…' : picks.size ? `Thêm vào ${picks.size} khóa học` : 'Thêm vào khóa học'}
                </button>
            </>}>
            <div className="dialog__body">
                <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <legend style={{ padding: 0, marginBottom: 6, fontSize: 14, fontWeight: 600 }}>Chọn khóa học</legend>
                    {isPending && <span className="text-2" style={{ fontSize: 14 }}>Đang tải…</span>}
                    {error && <div role="alert" className="status-msg status-msg--error">{errorMessage(error, 'Không tải được danh sách khóa học.')}</div>}
                    {opts.map((c) => {
                        const already = enrolled.has(c.id)
                        return (
                            <label key={c.id} className={`option-row${already ? ' is-disabled' : picks.has(c.id) ? ' is-on' : ''}`} style={{ minHeight: 46, fontSize: 15, gap: 10 }}>
                                <input type="checkbox" checked={already || picks.has(c.id)} disabled={already} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: 'var(--primary)', flex: 'none' }} />
                                <span style={{ flex: 1 }}>{c.title}{c.status === 'draft' && <span className="text-2" style={{ fontSize: 12 }}> · Bản nháp</span>}</span>
                                {already && <span style={{ fontSize: 12 }} className="text-2">Đã ghi danh</span>}
                            </label>
                        )
                    })}
                    {courses && opts.length === 0 && <span className="text-2" style={{ fontSize: 14 }}>Bạn chưa có khóa học nào được quản lý học viên.</span>}
                </fieldset>
                <DueField id="enrol-due" value={due} onChange={setDue} hint="Để trống để dùng hạn mặc định của từng khóa." />
                {enrol.error && <div role="alert" className="status-msg status-msg--error">{errorMessage(enrol.error, 'Không thêm được vào khóa học.')}</div>}
            </div>
        </Modal>
    )
}
