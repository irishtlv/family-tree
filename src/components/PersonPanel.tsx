import { useStore } from '../store'
import { api } from '../api'
import { displayName, fullName, parentUnion, partnerIn, relation, unionsOf, years } from '../lib/tree'
import { Avatar } from './PersonTag'
import type { UnionStatus } from '../types'

/** Details and actions for the focused person: side panel on desktop, bottom sheet on phones. */
export function PersonPanel({ onEdit, onAdd, onDelete }: { onEdit(): void; onAdd(): void; onDelete(): void }) {
  const { data, me, focus, setFocus, access, submit, sheet, setSheet, reload, toast } = useStore()
  if (!data || !data.tree.people[focus]) return <aside id="panel" />
  const t = data.tree, p = t.people[focus]
  const pu = parentUnion(t, focus)
  const parents = pu ? [pu.a, pu.b].filter((x): x is string => !!x) : []
  const us = unionsOf(t, focus)
  const kids = us.flatMap(u => u.children)
  const sibs = pu ? pu.children.filter(c => c !== focus) : []
  const a = access(focus, 'edit')
  const go = (id: string) => { setFocus(id); setSheet(false) }
  const chip = (id: string) => (
    <button type="button" key={id} className={`chip ${t.people[id]?.sex ?? ''}`} onClick={() => go(id)}>{displayName(t.people[id] ?? {})}</button>
  )
  const facts: [string, string][] = ([
    ['שם מלא', fullName(p)],
    ['לידה', [p.birth, p.birthPlace].filter(Boolean).join(', ')],
    ['פטירה', p.death || (p.deceased ? 'נפטר/ה' : '')],
    ['הקשר אלייך', relation(t, me?.person, focus)],
  ] as [string, string][]).filter(f => f[1])

  return (
    <>
      <div id="scrim" className={sheet ? 'on' : ''} onClick={() => setSheet(false)} />
      <aside id="panel" className={sheet ? 'open' : ''} aria-label="פרטים">
        <div className="ph">
          <Avatar p={p} size={64} />
          <div><h2>{displayName(p)}</h2><p>{years(p)}</p></div>
        </div>
        {a === 'direct' && <div className="perm ok">אפשר לערוך ישירות. השינויים נכנסים לעץ מיד.</div>}
        {a === 'ask' && <div className="perm ask">השינויים שלך יישלחו לאישור לפני שייכנסו לעץ.</div>}
        {a === 'none' && <div className="perm">יש לך הרשאת צפייה בלבד.</div>}
        {a !== 'none' && (
          <div className="acts">
            <button type="button" className="btn pri" onClick={onEdit}>עריכה</button>
            <button type="button" className="btn acc" onClick={onAdd}>+ קרוב</button>
            {me?.role === 'admin' && focus !== t.home && (
              <button type="button" className="btn" onClick={async () => { await api.setHome(focus); await reload(); toast('נקבע כמרכז העץ') }}>קבע כמרכז העץ</button>
            )}
          </div>
        )}
        <dl className="facts">{facts.map(([k, v]) => <div key={k} className="fact"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {p.note && <div className="note">{p.note}</div>}
        <div className="sec">
          <h3>הורים</h3><div className="chips">{parents.length ? parents.map(chip) : '—'}</div>
          <h3>בני/בנות זוג</h3>
          <div className="chips">
            {us.filter(u => partnerIn(u, focus)).map(u => (
              <span key={u.id} className="chipwrap">
                {chip(partnerIn(u, focus)!)}
                {a !== 'none' && (
                  <select aria-label="סטטוס" value={u.status} onChange={e => submit({ type: 'status', target: focus, union: u.id, status: e.target.value as UnionStatus })}>
                    <option value="married">נשואים</option><option value="divorced">לשעבר</option><option value="partners">בני זוג</option>
                  </select>
                )}
              </span>
            ))}
            {!us.some(u => partnerIn(u, focus)) && '—'}
          </div>
          <h3>ילדים</h3><div className="chips">{kids.length ? kids.map(chip) : '—'}</div>
          <h3>אחים ואחיות</h3><div className="chips">{sibs.length ? sibs.map(chip) : '—'}</div>
        </div>
        {a !== 'none' && (
          <div className="acts" style={{ marginTop: 22 }}>
            <button type="button" className="btn danger-text" onClick={onDelete}>{me?.role === 'admin' ? 'מחיקה' : 'בקשת מחיקה'}</button>
          </div>
        )}
      </aside>
    </>
  )
}
