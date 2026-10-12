import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { initials } from '../../auth/roles'
import { ConfirmDialog, Modal, ProgressBar, SearchInput, SelectFilter, Stat } from '../../components/ui'
import { useSelection, useToast } from '../../components/hooks'
import { DEPTS, getCourse, getCourseStats, todayVN } from '../../data/mock'
import CourseHead from './CourseHead'
import './teacher.css'

const ST_TEXT = { done: 'Đã hoàn thành', prog: 'Đang học', not: 'Chưa bắt đầu' }
const ST_PILL = { done: 'pill--green', prog: 'pill--blue', not: 'pill--gray' }
const TAG = { video: ['Video', 'tag-video'], pdf: ['PDF', 'tag-pdf'], page: ['Bài đọc', 'tag-page'], quiz: ['Kiểm tra', 'tag-quiz'] }

export default function CourseStats() {
    const { courseId } = useParams()
    const course = useMemo(() => getCourse(courseId), [courseId])
    const seed = useMemo(() => getCourseStats(), [])
    const items = seed.items
    const N = items.length
    const [people, setPeople] = useState(seed.people)
    const [pool, setPool] = useState(seed.pool)
    const [q, setQ] = useState('')
    const [f, setF] = useState('all')
    const [sel, setSel, toggleSel] = useSelection()
    const [adding, setAdding] = useState(false)
    const [removing, setRemoving] = useState(null) // mảng id
    const [toast, flash] = useToast()

    const stat = (p) => (p.done >= N ? 'done' : p.done > 0 ? 'prog' : 'not')
    const nAll = people.length
    const cnt = (s) => people.filter((p) => stat(p) === s).length
    const [nDone, nProg, nNot] = [cnt('done'), cnt('prog'), cnt('not')]
    const pc = (n) => (nAll ? Math.round((n / nAll) * 100) : 0)
    const exams = people.filter((p) => p.exam !== null)
    const list = people.filter((p) => (f === 'all' || stat(p) === f)
        && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase())))
    const allChecked = list.length > 0 && list.every((p) => sel.has(p.id))
    const rm = removing ? people.filter((p) => removing.includes(p.id)) : []

    const toggleAll = () => setSel((s) => {
        const n = new Set(s)
        list.forEach((p) => (allChecked ? n.delete(p.id) : n.add(p.id)))
        return n
    })

    function doRemove() {
        const back = rm.map(({ id, name, code, dept }) => ({ id, name, code, dept }))
        setPeople((ps) => ps.filter((p) => !removing.includes(p.id)))
        setPool((pl) => [...pl, ...back])
        setSel((s) => { const n = new Set(s); removing.forEach((i) => n.delete(i)); return n })
        flash(`Đã xóa ${removing.length} học viên khỏi khóa học.`)
        setRemoving(null)
    }

    function doAdd(chosen) {
        setPeople((ps) => [...ps, ...chosen.map((c) => ({ ...c, done: 0, exam: null, enrolled: todayVN() }))])
        setPool((pl) => pl.filter((c) => !chosen.some((x) => x.id === c.id)))
        setAdding(false)
        flash(`Đã thêm ${chosen.length} học viên vào khóa học.`)
    }

    return (
        <>
            <CourseHead course={course} />
            <main className="container container--1280 container--teach" style={{ paddingTop: 24 }}>
                <div className="stats">
                    <Stat label="Học viên ghi danh" value={nAll} />
                    <Stat label="Tỉ lệ hoàn thành" value={`${pc(nDone)}%`} sub={`${nDone}/${nAll} học viên`} color="#1C3F1A" />
                    <Stat label="Tiến độ trung bình" value={`${nAll ? Math.round(people.reduce((s, p) => s + (p.done / N) * 100, 0) / nAll) : 0}%`} />
                    <Stat label="Điểm kiểm tra cuối TB" value={exams.length ? `${Math.round(exams.reduce((s, p) => s + p.exam, 0) / exams.length)}%` : '—'}
                        sub={`${exams.length} học viên đã làm`} />
                </div>

                <div className="row" style={{ gap: 20, alignItems: 'stretch' }}>
                    <section aria-labelledby="dist" className="card card--pad" style={{ flex: '1 1 380px', gap: 14, padding: '18px 20px' }}>
                        <h2 id="dist" style={{ fontSize: 17, fontWeight: 700 }}>Trạng thái học viên</h2>
                        <div role="img" aria-label={`Đã hoàn thành ${nDone}, đang học ${nProg}, chưa bắt đầu ${nNot}`} className="dist-bar">
                            <div style={{ width: `${pc(nDone)}%`, background: 'var(--success-2)' }} />
                            <div style={{ width: `${pc(nProg)}%`, background: 'var(--primary)' }} />
                            <div style={{ width: `${pc(nNot)}%`, background: '#ADB5BD' }} />
                        </div>
                        <div className="stack" style={{ gap: 8, fontSize: 14 }}>
                            {[['Đã hoàn thành', nDone, 'var(--success-2)'], ['Đang học', nProg, 'var(--primary)'], ['Chưa bắt đầu', nNot, '#ADB5BD']].map(([t, n, c]) => (
                                <div key={t} className="legend-row">
                                    <span className="sw" style={{ background: c }} /><span style={{ flex: 1 }}>{t}</span><strong>{n}</strong>
                                    <span className="text-2" style={{ width: 44, textAlign: 'right' }}>{pc(n)}%</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section aria-labelledby="byl" className="card card--pad" style={{ flex: '2 1 480px', gap: 10, padding: '18px 20px' }}>
                        <h2 id="byl" style={{ fontSize: 17, fontWeight: 700 }}>Tỉ lệ hoàn thành theo bài</h2>
                        {items.map((it, i) => {
                            const v = pc(people.filter((p) => p.done > i).length)
                            return (
                                <div key={it.n} className="by-lesson">
                                    <span title={it.n}><span className={`type-tag ${TAG[it.t][1]}`}>{TAG[it.t][0]}</span> {it.n}</span>
                                    <ProgressBar value={v} done={v >= 80} label={`Hoàn thành ${it.n}`} />
                                    <span style={{ textAlign: 'right', fontWeight: 600 }}>{v}%</span>
                                </div>
                            )
                        })}
                    </section>
                </div>

                <section aria-labelledby="lh" className="card">
                    <div className="card__toolbar">
                        <h2 id="lh">Học viên trong khóa ({nAll})</h2>
                        <SearchInput id="sq" label="Tìm học viên" value={q} onChange={setQ} placeholder="Tìm tên hoặc mã NV" />
                        <SelectFilter id="sf" label="Lọc trạng thái" value={f} onChange={setF}
                            options={[['all', 'Mọi trạng thái'], ['done', 'Đã hoàn thành'], ['prog', 'Đang học'], ['not', 'Chưa bắt đầu']]} />
                        <button type="button" className="btn btn--primary" style={{ minHeight: 40 }} onClick={() => setAdding(true)}>+ Thêm học viên</button>
                    </div>
                    {sel.size > 0 && (
                        <div className="sel-bar">
                            <span style={{ fontSize: 14, fontWeight: 600, marginRight: 'auto' }}>Đã chọn {sel.size} học viên</span>
                            <button type="button" className="btn btn--sm btn--danger-ghost" style={{ fontWeight: 600 }} onClick={() => setRemoving([...sel])}>Xóa khỏi khóa học</button>
                            <button type="button" className="link-btn" style={{ minHeight: 36, fontSize: 13, textDecoration: 'none' }} onClick={() => setSel(new Set())}>Bỏ chọn</button>
                        </div>
                    )}
                    <div className="table-wrap">
                        <table className="table" style={{ minWidth: 940 }}>
                            <thead><tr>
                                <th scope="col" style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} /></th>
                                <th scope="col">Học viên</th><th scope="col">Phòng ban</th><th scope="col">Tiến độ</th><th scope="col">Điểm KT cuối</th>
                                <th scope="col">Trạng thái</th><th scope="col">Ngày ghi danh</th><th scope="col" style={{ textAlign: 'right' }}>Thao tác</th>
                            </tr></thead>
                            <tbody>
                                {list.map((p) => {
                                    const s = stat(p), v = Math.round((p.done / N) * 100), on = sel.has(p.id)
                                    return (
                                        <tr key={p.id} className={on ? 'is-selected' : undefined}>
                                            <td><input type="checkbox" checked={on} onChange={() => toggleSel(p.id)} aria-label={`Chọn ${p.name}`} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} /></td>
                                            <td><div className="person">
                                                <span aria-hidden="true" className="avatar avatar--sm">{initials(p.name)}</span>
                                                <span className="stack" style={{ gap: 0 }}><Link to={`/teach/students/${p.id}`}>{p.name}</Link><span style={{ fontSize: 12 }} className="muted">{p.code}</span></span>
                                            </div></td>
                                            <td>{p.dept}</td>
                                            <td><div className="progress-row" style={{ minWidth: 170 }}>
                                                <ProgressBar value={v} done={s === 'done'} label={`Tiến độ ${p.name}`} />
                                                <span className="small" style={{ whiteSpace: 'nowrap' }}>{p.done}/{N} · {v}%</span>
                                            </div></td>
                                            <td style={{ fontWeight: 600 }}>{p.exam === null ? '—' : `${p.exam}%`}</td>
                                            <td><span className={`pill ${ST_PILL[s]}`}>{ST_TEXT[s]}</span></td>
                                            <td className="text-2">{p.enrolled}</td>
                                            <td><div className="actions" style={{ flexWrap: 'nowrap' }}>
                                                <Link to={`/teach/students/${p.id}`} className="btn btn--sm">Chi tiết</Link>
                                                <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => setRemoving([p.id])} aria-label={`Xóa ${p.name} khỏi khóa học`}>Xóa khỏi khóa</button>
                                            </div></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {list.length === 0 && <p className="empty-note">Không có học viên nào phù hợp.</p>}
                </section>
            </main>

            {adding && <AddLearners pool={pool} onClose={() => setAdding(false)} onAdd={doAdd} />}
            {rm.length > 0 && (
                <ConfirmDialog title="Xóa khỏi khóa học?" confirmLabel="Xóa khỏi khóa học"
                    text={rm.length === 1
                        ? `${rm[0].name} sẽ bị xóa khỏi khóa học. Tiến độ và kết quả bài kiểm tra trong khóa này sẽ bị xóa.`
                        : `${rm.length} học viên đã chọn sẽ bị xóa khỏi khóa học, cùng tiến độ và kết quả bài kiểm tra.`}
                    onCancel={() => setRemoving(null)} onConfirm={doRemove} />
            )}
            {toast}
        </>
    )
}

function AddLearners({ pool, onClose, onAdd }) {
    const [aq, setAq] = useState('')
    const [dept, setDept] = useState('all')
    const [picks, setPicks, toggle] = useSelection()
    const cands = pool.filter((c) => (dept === 'all' || c.dept === dept) && (!aq || `${c.name} ${c.code}`.toLowerCase().includes(aq.toLowerCase())))

    return (
        <Modal title="Thêm học viên vào khóa học" width={560} onClose={onClose}
            footer={<>
                <button type="button" className="btn" onClick={onClose}>Hủy</button>
                <button type="button" className="btn btn--primary" disabled={picks.size === 0}
                    onClick={() => onAdd(pool.filter((c) => picks.has(c.id)))}>
                    {picks.size ? `Thêm ${picks.size} học viên` : 'Thêm học viên'}
                </button>
            </>}>
            <div className="row" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-soft)' }}>
                <SearchInput id="aq" label="Tìm nhân viên" value={aq} onChange={setAq} placeholder="Tìm nhân viên theo tên, mã NV" className="grow" />
                <SelectFilter id="ad" label="Lọc phòng ban" value={dept} onChange={setDept} options={[['all', 'Mọi phòng ban'], ...DEPTS.map((d) => [d, d])]} />
                <button type="button" className="btn" style={{ minHeight: 40 }}
                    onClick={() => setPicks((s) => new Set([...s, ...cands.map((c) => c.id)]))}>Chọn tất cả ({cands.length})</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 }}>
                {cands.map((c) => (
                    <label key={c.id} className={`option-row${picks.has(c.id) ? ' is-on' : ''}`}>
                        <input type="checkbox" checked={picks.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 18, height: 18, accentColor: 'var(--primary)', flex: 'none' }} />
                        <span className="stack" style={{ flex: 1, gap: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
                            <span style={{ fontSize: 12 }} className="muted">{c.code} · {c.dept}</span>
                        </span>
                    </label>
                ))}
                {cands.length === 0 && <p className="text-2" style={{ padding: '12px 0', fontSize: 14 }}>Không còn nhân viên nào chưa ghi danh phù hợp.</p>}
            </div>
        </Modal>
    )
}
