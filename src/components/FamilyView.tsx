import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { displayName, parentUnion, partnerIn, relation, unionsOf, years } from '../lib/tree'
import { Avatar, PersonTag } from './PersonTag'
import type { RelKind } from '../types'

const STATUS = { married: 'נשואים', divorced: 'לשעבר', partners: 'בני זוג' }

/** Mobile-first view: one person in the middle, their closest family around them. */
export function FamilyView({ onAdd }: { onAdd: (k?: RelKind) => void }) {
  const { data, me, focus, setFocus, setSheet, access } = useStore()
  const [trail, setTrail] = useState<string[]>([])
  const top = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!focus) return
    setTrail(t => {
      const i = t.indexOf(focus)
      const n = i >= 0 ? t.slice(0, i + 1) : [...t, focus]
      return n.slice(-6)
    })
    top.current?.scrollTo({ top: 0 })
  }, [focus])

  if (!data || !data.tree.people[focus]) return <section id="fam" />
  const t = data.tree, p = t.people[focus]
  const pu = parentUnion(t, focus)
  const us = unionsOf(t, focus)
  const withPartner = us.filter(u => partnerIn(u, focus))
  const sibs = pu ? pu.children.filter(c => c !== focus) : []
  const canAdd = access(focus, 'child') !== 'none'
  const rel = relation(t, me?.person, focus)
  const ghost = (k: RelKind, label: string) =>
    canAdd ? <button type="button" className="tag ghost" onClick={() => onAdd(k)}>+ {label}</button> : <span />

  return (
    <section id="fam" ref={top}>
      <nav className="crumbs" aria-label="מסלול">
        {trail.filter(id => t.people[id]).map(id => (
          <button key={id} type="button" onClick={() => setFocus(id)} aria-current={id === focus}>{t.people[id].given}</button>
        ))}
      </nav>

      <div className="lbl">הורים</div>
      <div className="row2">
        {pu?.a ? <PersonTag id={pu.a} /> : ghost('father', 'אב')}
        {pu?.b ? <PersonTag id={pu.b} /> : ghost('mother', 'אם')}
      </div>

      <div className="hero">
        <Avatar p={p} size={72} />
        <div className="grow">
          <h2 className={p.deceased ? 'dec' : ''}>{displayName(p)}</h2>
          <p>{years(p)}</p>
          {rel && <span className="rel">{rel}</span>}
        </div>
        <button type="button" className="btn sm" onClick={() => setSheet(true)}>פרטים</button>
      </div>

      {withPartner.length > 0 && (
        <div className="partners">
          {withPartner.map(u => (
            <div className="pline" key={u.id}>
              <small>{STATUS[u.status]}</small>
              <PersonTag id={partnerIn(u, focus)!} />
            </div>
          ))}
        </div>
      )}

      {us.filter(u => u.children.length).map(u => {
        const other = partnerIn(u, focus)
        const label = us.filter(x => x.children.length).length > 1 ? `ילדים עם ${other ? t.people[other]?.given : 'הורה לא ידוע'}` : 'ילדים'
        return (
          <div key={u.id}>
            <div className="lbl">{label} · {u.children.length}</div>
            <div className="hs">{u.children.map(c => <PersonTag key={c} id={c} />)}</div>
          </div>
        )
      })}
      {!us.some(u => u.children.length) && canAdd && (
        <>
          <div className="lbl">ילדים</div>
          <div className="hs"><button type="button" className="tag ghost" onClick={() => onAdd('child')}>+ ילד/ה</button></div>
        </>
      )}

      {sibs.length > 0 && (
        <>
          <div className="lbl">אחים ואחיות · {sibs.length}</div>
          <div className="hs">{sibs.map(c => <PersonTag key={c} id={c} />)}</div>
        </>
      )}
    </section>
  )
}
