import type { AppData, Member } from '../types'
import type { Api } from './index'
import seed from '../data/seed.json'
import { accessFor, applyChange, canReview, describe, uid } from '../lib/tree'

const KEY = 'family-tree-demo-v1'
const USER = 'family-tree-demo-user'

const sampleMembers: Member[] = [
  { id: 'm1', name: 'איריס', role: 'admin', person: 'iris', grants: [] },
  { id: 'm2', name: 'גלית חסדאי (דוגמה)', role: 'editor', person: 'galit', grants: [{ root: 'galit', mode: 'direct' }] },
  { id: 'm3', name: 'שרה פינטו (דוגמה)', role: 'editor', person: 'sara_p', grants: [{ root: 'sara_p', mode: 'approve' }] },
  { id: 'm4', name: 'מירה רזון (דוגמה)', role: 'contrib', person: 'mira', grants: [] },
  { id: 'm5', name: 'אלמה (דוגמה)', role: 'viewer', person: 'alma', grants: [] },
]

/** Demo backend: everything lives in this browser's localStorage. */
export function createDemoApi(): Api {
  let data: AppData
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { data = null as never }
  if (!data) data = { tree: structuredClone(seed) as AppData['tree'], members: sampleMembers, requests: [], log: [] }
  let me = localStorage.getItem(USER) || 'm1'
  const listeners = new Set<() => void>()
  const save = () => { localStorage.setItem(KEY, JSON.stringify(data)); listeners.forEach(f => f()) }
  const meMember = () => data.members.find(m => m.id === me) ?? data.members[0]

  return {
    mode: 'demo',
    async load() { return structuredClone(data) },
    currentMember: d => d.members.find(m => m.id === me) ?? d.members[0],
    async submit(change, label) {
      const m = meMember()
      const action = change.type === 'add' ? change.kind : change.type === 'delete' ? 'delete' : 'edit'
      const a = accessFor(data.tree, m, change.target, action)
      if (a === 'none') throw new Error('אין הרשאה')
      if (a === 'direct') {
        data.log.unshift({ id: uid('l'), at: Date.now(), by: m.id, label, before: structuredClone(data.tree) })
        data.log = data.log.slice(0, 60)
        applyChange(data.tree, change)
      } else {
        data.requests.unshift({ id: uid('r'), at: Date.now(), by: m.id, status: 'open', change })
      }
      save()
      return a
    },
    async review(id, approve) {
      const r = data.requests.find(r => r.id === id)
      if (!r || r.status !== 'open') return
      if (!canReview(data.tree, meMember(), r.change.target)) throw new Error('אין הרשאה')
      if (approve) {
        data.log.unshift({ id: uid('l'), at: Date.now(), by: r.by, label: describe(data.tree, r.change), before: structuredClone(data.tree) })
        applyChange(data.tree, r.change)
      }
      r.status = approve ? 'ok' : 'no'
      save()
    },
    async undo(id) {
      const l = data.log.find(l => l.id === id)
      if (!l?.before || meMember().role !== 'admin') return
      data.log.unshift({ id: uid('l'), at: Date.now(), by: me, label: `שחזור: ביטול "${l.label}"`, before: structuredClone(data.tree) })
      data.tree = structuredClone(l.before)
      save()
    },
    async setHome(pid) { data.tree.home = pid; save() },
    async saveMember(m) {
      const i = data.members.findIndex(x => x.id === m.id)
      if (i >= 0) data.members[i] = m; else data.members.push(m)
      save()
    },
    async removeMember(id) { data.members = data.members.filter(m => m.id !== id); save() },
    switchUser(id) { me = id; localStorage.setItem(USER, id); listeners.forEach(f => f()) },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f) },
  }
}
