import type { Person } from '../types'
import { displayName, initials, relation, years, inMyBranch } from '../lib/tree'
import { useStore } from '../store'

export function Avatar({ p, size }: { p: Person; size?: number }) {
  const style = size ? { width: size, height: size, fontSize: size / 3 } : undefined
  return (
    <span className={`av ${p.sex ?? ''}`} style={style}>
      {p.photo ? <img alt="" src={p.photo} /> : initials(p)}
    </span>
  )
}

/** A person's name tag. Clicking it moves them to the centre. */
export function PersonTag({ id, onPick }: { id: string; onPick?: (id: string) => void }) {
  const { data, me, setFocus } = useStore()
  if (!data) return null
  const p = data.tree.people[id]
  if (!p) return null
  const pending = data.requests.some(r => r.status === 'open' && r.change.target === id)
  const mine = me ? inMyBranch(data.tree, me, id) : false
  const sub = years(p) || relation(data.tree, me?.person, id)
  return (
    <button
      type="button"
      className={`tag ${p.sex ?? 'U'} ${p.deceased ? 'dec' : ''} ${mine ? 'mine' : ''} ${pending ? 'pend' : ''}`}
      data-go={id}
      onClick={() => (onPick ? onPick(id) : setFocus(id))}
    >
      <Avatar p={p} />
      <span className="tx">
        <b>{displayName(p)}</b>
        <span>{sub}</span>
      </span>
    </button>
  )
}
