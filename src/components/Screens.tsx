import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import type { Change, Member, Person, Role } from '../types'
import { branchSet, canReview, describe, displayName, fullName, relation, sortedPeople, uid, years } from '../lib/tree'
import { download, toGedcom } from '../lib/gedcom'
import { Avatar } from './PersonTag'
import { Modal } from './Modal'

const when = (t: number) => {
  const d = (Date.now() - t) / 6e4
  return d < 1 ? 'עכשיו' : d < 60 ? `לפני ${Math.round(d)} דק׳` : d < 1440 ? `לפני ${Math.round(d / 60)} שע׳` : new Date(t).toLocaleDateString('he-IL')
}
const ROLE: Record<Role, string> = { admin: 'מנהלת', editor: 'עורך/ת ענף', contrib: 'תורם/ת', viewer: 'צופה' }
const FIELD: Partial<Record<keyof Person, string>> = { given: 'שם פרטי', surname: 'שם משפחה', maiden: 'שם נעורים', nick: 'כינוי', sex: 'מין', birth: 'לידה', birthPlace: 'מקום לידה', death: 'פטירה', note: 'הערות' }

function Diff({ c }: { c: Change }) {
  if (c.type !== 'edit') return null
  const rows = (Object.keys(FIELD) as (keyof Person)[]).filter(k => String(c.before[k] ?? '') !== String(c.after[k] ?? ''))
  if (c.before.photo !== c.after.photo) rows.push('photo')
  return (
    <div className="diff">
      {rows.map(k => k === 'photo'
        ? <span key={k} className="full">תמונה חדשה</span>
        : <span key={k} className="drow"><span>{FIELD[k]}</span><span className="o">{String(c.before[k] ?? '—')}</span><span className="n">{String(c.after[k] ?? '—')}</span></span>)}
    </div>
  )
}

export function Inbox() {
  const { data, me, setFocus, reload, toast } = useStore()
  if (!data || !me) return null
  const t = data.tree
  const name = (id: string) => data.members.find(m => m.id === id)?.name ?? 'בן/בת משפחה'
  const open = data.requests.filter(r => r.status === 'open')
  const mine = open.filter(r => canReview(t, me, r.change.target))
  const waiting = open.filter(r => r.by === me.id && !canReview(t, me, r.change.target))
  const done = data.requests.filter(r => r.status !== 'open').slice(0, 10)
  const act = async (id: string, ok: boolean) => {
    try { await api.review(id, ok); toast(ok ? 'אושר ונכנס לעץ' : 'נדחה'); await reload() } catch (e) { toast((e as Error).message) }
  }
  return (
    <>
      <h2>עדכונים</h2>
      {mine.length > 0 && <>
        <div className="lbl">ממתינים לאישור שלך · {mine.length}</div>
        <div className="list">{mine.map(r => (
          <div className="item" key={r.id}>
            <h4>{describe(t, r.change)}</h4>
            <p>{name(r.by)} · {when(r.at)}{r.change.type === 'delete' && r.change.why ? ' · ' + r.change.why : ''}</p>
            <Diff c={r.change} />
            <div className="acts tight">
              <button type="button" className="btn sm pri" onClick={() => act(r.id, true)}>אישור</button>
              <button type="button" className="btn sm" onClick={() => act(r.id, false)}>דחייה</button>
              {t.people[r.change.target] && <button type="button" className="btn sm" onClick={() => setFocus(r.change.target)}>הצגה בעץ</button>}
            </div>
          </div>))}
        </div>
      </>}
      {waiting.length > 0 && <>
        <div className="lbl">הבקשות שלך ממתינות לאישור</div>
        <div className="list">{waiting.map(r => <div className="item" key={r.id}><h4>{describe(t, r.change)}</h4><p>{when(r.at)}</p></div>)}</div>
      </>}
      <div className="lbl">מה חדש בעץ</div>
      <div className="list">
        {data.log.length ? data.log.slice(0, 30).map(l => (
          <div className="item" key={l.id}>
            <h4>{l.label}</h4><p>{name(l.by)} · {when(l.at)}</p>
            {me.role === 'admin' && (
              <div className="acts tight"><button type="button" className="btn sm" onClick={async () => { await api.undo(l.id); toast('העץ שוחזר'); await reload() }}>החזרת העץ למצב שלפני השינוי</button></div>
            )}
          </div>
        )) : <div className="empty">עדיין אין שינויים</div>}
      </div>
      {done.length > 0 && <>
        <div className="lbl">בקשות שטופלו</div>
        <div className="list">{done.map(r => <div className="item" key={r.id}><h4>{describe(t, r.change)}</h4><p>{name(r.by)} · {r.status === 'ok' ? 'אושר' : 'נדחה'}</p></div>)}</div>
      </>}
    </>
  )
}

function MemberDialog({ m, isNew, onClose }: { m: Member; isNew: boolean; onClose(): void }) {
  const { data, me, reload, toast } = useStore()
  const [v, setV] = useState<Member>(m)
  const g = v.grants[0]
  const opts = sortedPeople(data!.tree).map(([k, q]) => <option key={k} value={k}>{displayName(q)}{q.birth ? ' · ' + q.birth : ''}</option>)
  return (
    <Modal title={isNew ? 'הזמנת קרוב/ה' : 'עריכת הרשאות'} onClose={onClose}>
      <form onSubmit={async e => {
        e.preventDefault()
        try { await api.saveMember(v, isNew); toast(isNew ? (api.mode === 'live' ? 'נשלחה הזמנה במייל' : 'בגרסה האמיתית תישלח עכשיו הזמנה') : 'נשמר'); onClose(); await reload() }
        catch (err) { toast((err as Error).message) }
      }}>
        <div className="grid">
          <label className="full">שם<input required value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></label>
          {(isNew || v.id.startsWith('invite:')) && <label className="full">מייל להזמנה<input type="email" required={api.mode === 'live'} value={v.contact ?? ''} onChange={e => setV({ ...v, contact: e.target.value })} placeholder="יישלח קישור כניסה" /></label>}
          <label>תפקיד
            <select value={v.role} onChange={e => setV({ ...v, role: e.target.value as Role })}>
              {(Object.keys(ROLE) as Role[]).map(r => <option key={r} value={r}>{ROLE[r]}</option>)}
            </select>
          </label>
          <label>זה/זו בעץ
            <select value={v.person ?? ''} onChange={e => setV({ ...v, person: e.target.value || null })}><option value="">—</option>{opts}</select>
          </label>
          <label className="full">ענף לעריכה: צאצאי…
            <select value={g?.root ?? ''} onChange={e => setV({ ...v, grants: e.target.value ? [{ root: e.target.value, mode: g?.mode ?? 'approve' }] : [] })}>
              <option value="">ללא ענף</option>{opts}
            </select>
          </label>
          {g && <label className="full">אופן העריכה בענף
            <select value={g.mode} onChange={e => setV({ ...v, grants: [{ root: g.root, mode: e.target.value as 'direct' | 'approve' }] })}>
              <option value="direct">עריכה ישירה</option><option value="approve">כל שינוי באישור שלך</option>
            </select>
          </label>}
          {g && <p className="hint full">בענף: {branchSet(data!.tree, g.root).size} אנשים (הצאצאים ובני הזוג שלהם)</p>}
        </div>
        <div className="foot">
          <button className="btn pri">{isNew ? 'הזמנה' : 'שמירה'}</button>
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          {!isNew && v.id !== me?.id && <button type="button" className="btn danger-text" onClick={async () => { await api.removeMember(v.id); onClose(); await reload() }}>הסרה</button>}
        </div>
      </form>
    </Modal>
  )
}

export function Admin() {
  const { data, me } = useStore()
  const [edit, setEdit] = useState<{ m: Member; isNew: boolean } | null>(null)
  if (!data || me?.role !== 'admin') return <><h2>ניהול</h2><div className="empty">רק למנהלת</div></>
  const t = data.tree
  return (
    <>
      <h2>אנשים והרשאות</h2>
      {api.mode === 'demo' && <p className="demo">מצב הדגמה: המשתמשים כאן לדוגמה. אחרי חיבור Supabase כל אחד יתחבר עם המייל שלו.</p>}
      <div className="list">
        {data.members.map(m => (
          <div className="item" key={m.id}>
            <h4>{m.name} · {ROLE[m.role]}</h4>
            <p>{m.person && t.people[m.person] ? 'בעץ: ' + displayName(t.people[m.person]) : 'לא מקושר/ת לאדם בעץ'}</p>
            {m.grants.map(g => <p key={g.root}>ענף: צאצאי {t.people[g.root] ? displayName(t.people[g.root]) : '?'} · {g.mode === 'direct' ? 'עריכה ישירה' : 'באישור'} · {branchSet(t, g.root).size} אנשים</p>)}
            <div className="acts tight"><button type="button" className="btn sm" onClick={() => setEdit({ m, isNew: false })}>עריכה</button></div>
          </div>
        ))}
      </div>
      <div className="acts">
        <button type="button" className="btn acc" onClick={() => setEdit({ m: { id: uid('m'), name: '', role: 'editor', grants: [] }, isNew: true })}>+ הזמנת קרוב/ה</button>
        <button type="button" className="btn" onClick={() => download('family-tree.ged', toGedcom(t))}>ייצוא GEDCOM</button>
        <button type="button" className="btn" onClick={() => download('family-tree.json', JSON.stringify(t, null, 1), 'application/json')}>גיבוי JSON</button>
      </div>
      {edit && <MemberDialog m={edit.m} isNew={edit.isNew} onClose={() => setEdit(null)} />}
    </>
  )
}

export function Me() {
  const { data, me, setScreen, setFocus, reload } = useStore()
  if (!data || !me) return null
  const t = data.tree
  return (
    <>
      <h2>אני</h2>
      <div className="item"><h4>{me.name}</h4><p>{ROLE[me.role]}{me.person && t.people[me.person] ? ' · ' + displayName(t.people[me.person]) : ''}</p></div>
      <div className="acts">
        {me.person && <button type="button" className="btn" onClick={() => setFocus(me.person!)}>הצג אותי בעץ</button>}
        {me.role === 'admin' && <button type="button" className="btn" onClick={() => setScreen('admin')}>ניהול אנשים והרשאות</button>}
        {api.signOut && <button type="button" className="btn" onClick={async () => { await api.signOut!(); await reload() }}>יציאה</button>}
      </div>
      {api.switchUser && <>
        <div className="lbl">התחברות כמשתמש אחר (הדגמה)</div>
        <p className="demo">כך אפשר לראות מה כל אחד רואה ומה מותר לו לעשות.</p>
        <div className="list">
          {data.members.map(m => (
            <button type="button" key={m.id} className={'item pick' + (m.id === me.id ? ' on' : '')}
              onClick={() => { api.switchUser!(m.id); if (m.person) setFocus(m.person) }}>
              <h4>{m.name}</h4>
              <p>{{ admin: 'מנהלת: עורכת הכל ומאשרת', editor: m.grants[0]?.mode === 'direct' ? 'עורכת את הענף שלה ישירות' : 'עורכת ענף, באישור', contrib: 'מציע/ה שינויים לאישור', viewer: 'צפייה בלבד' }[m.role]}</p>
            </button>
          ))}
        </div>
      </>}
    </>
  )
}

export function SearchResults({ q, onPick }: { q: string; onPick(id: string): void }) {
  const { data, me } = useStore()
  if (!data || !q.trim()) return null
  const s = q.trim()
  const hits = sortedPeople(data.tree).filter(([, p]) => `${fullName(p)} ${p.birth ?? ''} ${p.birthPlace ?? ''}`.includes(s)).slice(0, 30)
  if (!hits.length) return <div className="empty">לא נמצא</div>
  return (
    <div className="res">
      {hits.map(([k, p]) => (
        <button type="button" key={k} onClick={() => onPick(k)}>
          <Avatar p={p} size={36} />
          <span><b>{displayName(p)}</b><small>{[relation(data.tree, me?.person, k), years(p)].filter(Boolean).join(' · ')}</small></span>
        </button>
      ))}
    </div>
  )
}

export function SearchScreen() {
  const { setFocus } = useStore()
  const [q, setQ] = useState('')
  return (
    <>
      <h2>חיפוש</h2>
      <input className="bigsearch" type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="שם, שם נעורים, כינוי או מקום" />
      <SearchResults q={q} onPick={setFocus} />
    </>
  )
}
