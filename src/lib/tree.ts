import type { Member, Person, Tree, Union, RelKind, Change } from '../types'

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const unionsOf = (t: Tree, id: string) => t.unions.filter(u => u.a === id || u.b === id)
export const parentUnion = (t: Tree, id: string) => t.unions.find(u => u.children.includes(id))
export const parentsOf = (t: Tree, id: string) => {
  const u = parentUnion(t, id)
  return u ? [u.a, u.b].filter((x): x is string => !!x) : []
}
export const partnerIn = (u: Union, id: string) => (u.a === id ? u.b : u.a)
export const siblingsOf = (t: Tree, id: string) => parentUnion(t, id)?.children.filter(c => c !== id) ?? []

export const displayName = (p: Person) => [p.given, p.nick ? `(${p.nick})` : '', p.surname].filter(Boolean).join(' ')
export const fullName = (p: Person) => displayName(p) + (p.maiden && p.maiden !== p.surname ? ` (לבית ${p.maiden})` : '')
export const initials = (p: Person) => ((p.given || '?').replace(/[()]/g, '')[0] || '?') + ((p.surname || '')[0] || '')
export const years = (p: Person) => {
  const b = p.birth || '', d = p.death || ''
  if (b && d) return `${b} – ${d}`
  if (b) return p.deceased ? `${b} –` : `נ. ${b}`
  if (d) return `${p.sex === 'F' ? 'נפטרה' : 'נפטר'} ${d}`
  return ''
}
const g = (p: Person | undefined, m: string, f: string, u = `${m}/${f}`) => (p?.sex === 'M' ? m : p?.sex === 'F' ? f : u)

export const sortedPeople = (t: Tree) =>
  Object.entries(t.people).sort((a, b) => displayName(a[1]).localeCompare(displayName(b[1]), 'he'))

/* ---------------- relationship, from one person to another ---------------- */
function ancestors(t: Tree, id: string) {
  const m = new Map([[id, 0]]), q = [id]
  while (q.length) {
    const x = q.shift()!
    for (const p of parentsOf(t, x)) if (!m.has(p)) { m.set(p, m.get(x)! + 1); q.push(p) }
  }
  return m
}
function blood(t: Tree, a: string, b: string): [number, number] | null {
  if (a === b) return [0, 0]
  const A = ancestors(t, a), B = ancestors(t, b)
  let best: [number, number] | null = null
  for (const [k, da] of A) if (B.has(k)) {
    const db = B.get(k)!
    if (!best || da + db < best[0] + best[1]) best = [da, db]
  }
  return best
}
function term(up: number, dn: number, p?: Person) {
  if (dn === 0) return up === 1 ? g(p, 'אבא', 'אמא') : up === 2 ? g(p, 'סבא', 'סבתא') : up === 3 ? g(p, 'סבא רבא', 'סבתא רבתא') : `דור ${up} למעלה`
  if (up === 0) return dn === 1 ? g(p, 'בן', 'בת') : dn === 2 ? g(p, 'נכד', 'נכדה') : dn === 3 ? g(p, 'נין', 'נינה') : `צאצא דור ${dn}`
  if (up === 1 && dn === 1) return g(p, 'אח', 'אחות')
  if (up === 2 && dn === 1) return g(p, 'דוד', 'דודה')
  if (up === 3 && dn === 1) return g(p, 'אח של סבא/סבתא', 'אחות של סבא/סבתא')
  if (up === 1 && dn === 2) return g(p, 'אחיין', 'אחיינית')
  if (up === 2 && dn === 2) return g(p, 'בן דוד', 'בת דודה')
  if (up === 3 && dn === 3) return g(p, 'בן דוד שני', 'בת דודה שנייה')
  return 'קרוב/ת משפחה'
}
export function relation(t: Tree, me: string | null | undefined, id: string): string {
  if (!me || !t.people[me]) return ''
  if (me === id) return 'אני'
  const p = t.people[id]
  const r = blood(t, me, id)
  if (r) return term(r[0], r[1], p)
  for (const u of unionsOf(t, id)) {
    const q = partnerIn(u, id)
    if (!q) continue
    if (q === me) return u.status === 'divorced' ? g(p, 'גרוש', 'גרושה', 'לשעבר') : g(p, 'בן הזוג', 'בת הזוג')
    const r2 = blood(t, me, q)
    if (r2 && r2[0] + r2[1] <= 4) return `${g(p, 'בן הזוג', 'בת הזוג')} של ${term(r2[0], r2[1], t.people[q])}`
  }
  for (const u of unionsOf(t, me)) {
    const q = partnerIn(u, me)
    if (!q) continue
    const r3 = blood(t, q, id)
    if (r3 && r3[0] + r3[1] <= 3) return `${term(r3[0], r3[1], p)} של ${t.people[q]?.given ?? ''}`
  }
  return ''
}

/* ---------------- branches and permissions ---------------- */
/** A branch = the root, all their descendants, and everyone's partners. */
export function branchSet(t: Tree, root: string) {
  const s = new Set<string>(), q = [root]
  while (q.length) {
    const x = q.shift()!
    if (s.has(x) || !t.people[x]) continue
    s.add(x)
    for (const u of unionsOf(t, x)) {
      const o = partnerIn(u, x)
      if (o) s.add(o)
      q.push(...u.children)
    }
  }
  return s
}

export type Access = 'direct' | 'ask' | 'none'
export function accessFor(t: Tree, m: Member, id: string, action: RelKind | 'edit' | 'delete' | 'status'): Access {
  if (m.role === 'admin') return 'direct'
  if (m.role === 'viewer') return 'none'
  if (action === 'delete') return 'ask'
  for (const gr of m.grants) {
    // adding a parent or sibling to the branch root reaches outside the branch
    if ((action === 'father' || action === 'mother' || action === 'sibling') && id === gr.root) continue
    if (branchSet(t, gr.root).has(id)) return gr.mode === 'direct' ? 'direct' : 'ask'
  }
  return 'ask'
}
export const inMyBranch = (t: Tree, m: Member, id: string) =>
  m.role !== 'admin' && m.grants.some(gr => branchSet(t, gr.root).has(id))
export const canReview = (t: Tree, m: Member, target: string) =>
  m.role === 'admin' || (m.role === 'editor' && m.grants.some(gr => gr.mode === 'direct' && branchSet(t, gr.root).has(target)))

/* ---------------- applying a change (demo mode, and for previews) ---------------- */
const KN: Record<RelKind, string> = { father: 'אב', mother: 'אם', partner: 'בן/בת זוג', child: 'ילד/ה', sibling: 'אח/ות' }
export function describe(t: Tree, c: Change) {
  const tp = t.people[c.target]
  const tn = tp ? displayName(tp) : ''
  switch (c.type) {
    case 'edit': return `עריכת הפרטים של ${tn}`
    case 'add': return `הוספת ${KN[c.kind]} ל${tn}: ${c.existing ? displayName(t.people[c.existing] ?? {}) : displayName(c.person ?? {})}`
    case 'delete': return `מחיקת ${tn}`
    case 'status': return `שינוי סטטוס זוגיות של ${tn}`
  }
}

function newUnion(t: Tree, a: string | null, b: string | null, children: string[] = []) {
  const u: Union = { id: uid('u'), a, b, status: 'married', children }
  t.unions.push(u)
  return u
}
export function link(t: Tree, kind: RelKind, id: string, n: string, unionId?: string | null) {
  const p = t.people[id], q = t.people[n]
  if (kind === 'father' || kind === 'mother') {
    let pu = parentUnion(t, id) ?? newUnion(t, null, null, [id])
    if (kind === 'father') pu.a = n; else pu.b = n
    if (pu.a && pu.b) {
      const dup = t.unions.find(u => u !== pu && ((u.a === pu.a && u.b === pu.b) || (u.a === pu.b && u.b === pu.a)))
      if (dup) {
        dup.children.push(...pu.children.filter(c => !dup.children.includes(c)))
        t.unions.splice(t.unions.indexOf(pu), 1)
      }
    }
  } else if (kind === 'partner') {
    const male = q.sex === 'M' || (q.sex !== 'F' && p.sex === 'F')
    newUnion(t, male ? n : id, male ? id : n)
  } else if (kind === 'child') {
    const old = parentUnion(t, n)
    if (old) old.children = old.children.filter(c => c !== n)
    let u = unionId ? t.unions.find(x => x.id === unionId) : unionsOf(t, id).find(x => !partnerIn(x, id))
    if (!u) u = p.sex === 'F' ? newUnion(t, null, id) : newUnion(t, id, null)
    u.children.push(n)
  } else if (kind === 'sibling') {
    const pu = parentUnion(t, id) ?? newUnion(t, null, null, [id])
    const old = parentUnion(t, n)
    if (old && old !== pu) old.children = old.children.filter(c => c !== n)
    if (!pu.children.includes(n)) pu.children.push(n)
  }
  t.unions = t.unions.filter(u => u.children.length || (u.a && u.b))
}
export function applyChange(t: Tree, c: Change) {
  if (c.type === 'edit') {
    if (t.people[c.target]) t.people[c.target] = { ...c.after }
  } else if (c.type === 'status') {
    const u = t.unions.find(u => u.id === c.union)
    if (u) u.status = c.status
  } else if (c.type === 'delete') {
    const id = c.target
    for (const u of t.unions) {
      if (u.a === id) u.a = null
      if (u.b === id) u.b = null
      u.children = u.children.filter(x => x !== id)
    }
    delete t.people[id]
    t.unions = t.unions.filter(u => u.children.length || (u.a && u.b))
    if (t.home === id) t.home = Object.keys(t.people)[0]
  } else if (c.type === 'add') {
    let n = c.existing
    if (!n) { n = c.newId; t.people[n] = { ...c.person } }
    link(t, c.kind, c.target, n, c.union)
  }
}
