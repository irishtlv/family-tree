import { useMemo, useState } from 'react'
import type { Person, RelKind, Sex } from '../types'
import { useStore } from '../store'
import { displayName, parentUnion, partnerIn, relation, sortedPeople, uid, unionsOf, years } from '../lib/tree'
import { shrinkImage } from '../lib/gedcom'
import { Modal } from './Modal'

/** Main fields up front, the rest folded under "עוד פרטים". */
function PersonFields({ p, set }: { p: Person; set: (p: Person) => void }) {
  const f = (k: keyof Person) => ({ value: (p[k] as string) ?? '', onChange: (e: { target: { value: string } }) => set({ ...p, [k]: e.target.value || undefined }) })
  const [photoBusy, setBusy] = useState(false)
  return (
    <>
      <div className="grid">
        <label>שם פרטי<input {...f('given')} required autoComplete="off" /></label>
        <label>שם משפחה<input {...f('surname')} autoComplete="off" /></label>
        <label>שנה או תאריך לידה<input {...f('birth')} placeholder="1948 / סביבות 1899" /></label>
        <label>מין
          <select value={p.sex ?? 'U'} onChange={e => set({ ...p, sex: e.target.value as Sex })}>
            <option value="M">זכר</option><option value="F">נקבה</option><option value="U">לא ידוע</option>
          </select>
        </label>
        <label className="chk full"><input type="checkbox" checked={!!p.deceased} onChange={e => set({ ...p, deceased: e.target.checked || undefined })} /> נפטר/ה</label>
      </div>
      <details className="more" open={!!(p.maiden || p.nick || p.birthPlace || p.death || p.note)}>
        <summary>עוד פרטים</summary>
        <div className="grid">
          <label>שם נעורים<input {...f('maiden')} /></label>
          <label>כינוי<input {...f('nick')} /></label>
          <label>מקום לידה<input {...f('birthPlace')} /></label>
          <label>פטירה<input {...f('death')} /></label>
          <label className="full">סיפורים, הערות, מקורות<textarea rows={3} {...f('note')} /></label>
          <label className="full">תמונה {photoBusy && '…'}
            <input type="file" accept="image/*" onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              setBusy(true)
              try { set({ ...p, photo: await shrinkImage(file) }) } finally { setBusy(false) }
            }} />
          </label>
          {p.photo && <label className="chk full"><input type="checkbox" onChange={e => e.target.checked && set({ ...p, photo: undefined })} /> הסרת התמונה</label>}
        </div>
      </details>
    </>
  )
}

const clean = (p: Person): Person => {
  const o: Person = {}
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '' && v !== false) (o as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v
  if (o.death) o.deceased = true
  return o
}

export function EditDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, access, submit } = useStore()
  const orig = data!.tree.people[id]
  const [p, setP] = useState<Person>({ ...orig })
  const direct = access(id, 'edit') === 'direct'
  return (
    <Modal title={`עריכת ${displayName(orig)}`} onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); onClose(); await submit({ type: 'edit', target: id, before: orig, after: clean(p) }) }}>
        <PersonFields p={p} set={setP} />
        <div className="foot">
          <button className="btn pri">{direct ? 'שמירה' : 'שליחה לאישור'}</button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  )
}

const KN: Record<RelKind, string> = { child: 'ילד/ה', partner: 'בן/בת זוג', sibling: 'אח/ות', father: 'אב', mother: 'אם' }

export function AddDialog({ id, initial, onClose }: { id: string; initial?: RelKind; onClose: () => void }) {
  const { data, me, access, submit } = useStore()
  const t = data!.tree, anchor = t.people[id]
  const pu = parentUnion(t, id)
  const kinds = (['child', 'partner', 'sibling', 'father', 'mother'] as RelKind[]).filter(k => !(k === 'father' && pu?.a) && !(k === 'mother' && pu?.b))
  const [kind, setKind] = useState<RelKind>(initial && kinds.includes(initial) ? initial : kinds[0])
  const partners = unionsOf(t, id).filter(u => partnerIn(u, id))
  const [union, setUnion] = useState(partners[0]?.id ?? '')
  const defaults = (k: RelKind): Person => ({
    sex: k === 'father' ? 'M' : k === 'mother' ? 'F' : k === 'partner' ? (anchor.sex === 'M' ? 'F' : 'M') : 'U',
    surname: ['child', 'sibling', 'father'].includes(k) ? anchor.surname : undefined,
  })
  const [p, setP] = useState<Person>(defaults(kind))
  const [existing, setExisting] = useState<string | null>(null)
  const direct = access(id, kind) === 'direct'

  // people already in the tree who look like what is being typed
  const dups = useMemo(() => {
    const g = (p.given || '').trim()
    if (g.length < 2 || existing) return []
    return sortedPeople(t).filter(([k, q]) => k !== id && q.given?.startsWith(g) && (!p.surname || q.surname === p.surname || q.maiden === p.surname)).slice(0, 4)
  }, [p.given, p.surname, existing, t, id])

  return (
    <Modal title={`הוספת קרוב ל${anchor.given ?? ''}`} onClose={onClose}>
      <form onSubmit={async e => {
        e.preventDefault()
        if (!existing && !p.given?.trim()) return
        onClose()
        await submit({ type: 'add', kind, target: id, union: kind === 'child' ? union || null : null, existing, newId: uid('p'), person: existing ? undefined : clean(p) })
      }}>
        <div className="kinds" role="radiogroup">
          {kinds.map(k => (
            <button key={k} type="button" role="radio" aria-checked={k === kind} className={k === kind ? 'on' : ''}
              onClick={() => { setKind(k); setP(q => ({ ...q, ...defaults(k), given: q.given })) }}>{KN[k]}</button>
          ))}
        </div>
        {kind === 'child' && partners.length > 0 && (
          <label className="fl">ההורה השני
            <select value={union} onChange={e => setUnion(e.target.value)}>
              {partners.map(u => <option key={u.id} value={u.id}>{displayName(t.people[partnerIn(u, id)!])}</option>)}
              <option value="">לא ידוע</option>
            </select>
          </label>
        )}
        {existing ? (
          <div className="dups">יחובר/תחובר אדם שכבר קיים בעץ: <b>{displayName(t.people[existing])}</b>
            <button type="button" onClick={() => setExisting(null)}>ביטול, זה אדם חדש</button></div>
        ) : (
          <>
            <PersonFields p={p} set={setP} />
            {dups.length > 0 && (
              <div className="dups">אולי הכוונה למישהו שכבר בעץ?
                {dups.map(([k, q]) => (
                  <button type="button" key={k} onClick={() => setExisting(k)}>
                    {displayName(q)} <small>{years(q) || relation(t, me?.person, k)}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className="foot">
          <button className="btn pri">{direct ? 'הוספה' : 'שליחה לאישור'}</button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  )
}

export function DeleteDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, me, submit, setFocus } = useStore()
  const p = data!.tree.people[id]
  const admin = me?.role === 'admin'
  const [why, setWhy] = useState('')
  return (
    <Modal title={`${admin ? 'למחוק' : 'לבקש למחוק'} את ${displayName(p)}?`} onClose={onClose}>
      <form onSubmit={async e => {
        e.preventDefault()
        onClose()
        const next = parentUnion(data!.tree, id)?.a || data!.tree.home
        await submit({ type: 'delete', target: id, why })
        if (admin) setFocus(next)
      }}>
        <label className="fl">סיבה (לא חובה)<input value={why} onChange={e => setWhy(e.target.value)} /></label>
        <div className="foot">
          <button className="btn pri danger">{admin ? 'מחיקה' : 'שליחת בקשה'}</button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  )
}
