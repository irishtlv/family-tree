import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { CH, CW, layoutTree, mirrorPath } from '../lib/layout'
import { PersonTag } from './PersonTag'

/** Desktop view: the whole tree around the focused person, with pan and zoom. */
export function TreeCanvas() {
  const { data, focus, setFocus } = useStore()
  const [up, setUp] = useState(3)
  const [dn, setDn] = useState(2)
  const stage = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ k: 1, tx: 0, ty: 0, anim: false })
  const first = useRef(true)
  const vpRef = useRef(vp)
  vpRef.current = vp

  const { nodes, paths } = useMemo(() => (data ? layoutTree(data.tree, focus, up, dn) : { nodes: [], paths: [] }), [data, focus, up, dn])

  const centerOn = (k = vp.k) => {
    const n = nodes.find(n => n.id === focus), el = stage.current
    if (!n || !el) return
    const r = el.getBoundingClientRect()
    setVp({ k, tx: r.width / 2 - (-n.x - CW / 2) * k, ty: r.height * 0.42 - (n.y + CH / 2) * k, anim: !first.current })
    first.current = false
  }
  useLayoutEffect(() => { centerOn() }, [focus, nodes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const fit = () => {
    const el = stage.current
    if (!el || !nodes.length) return
    const r = el.getBoundingClientRect()
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9
    for (const n of nodes) { const x = -n.x - CW; x1 = Math.min(x1, x); x2 = Math.max(x2, x + CW); y1 = Math.min(y1, n.y); y2 = Math.max(y2, n.y + CH) }
    const k = Math.max(0.2, Math.min(1.3, Math.min((r.width - 60) / (x2 - x1), (r.height - 60) / (y2 - y1))))
    setVp({ k, tx: (r.width - (x1 + x2) * k) / 2, ty: (r.height - (y1 + y2) * k) / 2, anim: true })
  }
  const zoomAt = (f: number, cx: number, cy: number) =>
    setVp(v => { const k = Math.max(0.15, Math.min(2.5, v.k * f)); return { k, tx: cx - (cx - v.tx) * k / v.k, ty: cy - (cy - v.ty) * k / v.k, anim: false } })

  // pan, pinch and wheel
  useEffect(() => {
    const el = stage.current!
    const ptrs = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number; tx: number; ty: number; t: EventTarget | null } | null = null
    let moved = false, pinch: { d: number; k: number } | null = null
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.zoom,.gen')) return
      el.setPointerCapture(e.pointerId)
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = false
      if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, tx: vpRef.current.tx, ty: vpRef.current.ty, t: e.target }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vpRef.current.k } }
    }
    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], r = el.getBoundingClientRect()
        zoomAt((pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d / vpRef.current.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
        moved = true
        return
      }
      if (!drag) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; el.classList.add('drag') }
      if (moved) setVp(v => ({ ...v, tx: drag!.tx + dx, ty: drag!.ty + dy, anim: false }))
    }
    const upH = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.delete(e.pointerId)
      el.classList.remove('drag')
      if (drag && !moved && !ptrs.size) {
        const c = (drag.t as Element | null)?.closest?.('[data-go]') as HTMLElement | null
        if (c?.dataset.go) setFocus(c.dataset.go)
      }
      if (ptrs.size < 2) pinch = null
      if (!ptrs.size) drag = null
    }
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top) }
    const stopClick = (e: MouseEvent) => { if ((e.target as Element).closest('.card')) { e.preventDefault(); e.stopPropagation() } }
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', upH); el.addEventListener('pointercancel', upH)
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('click', stopClick, true)
    return () => {
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', upH); el.removeEventListener('pointercancel', upH)
      el.removeEventListener('wheel', wheel); el.removeEventListener('click', stopClick, true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const seen = new Set<string>()
  return (
    <div id="stage" ref={stage}>
      <div id="world" className={vp.anim ? 'anim' : ''} style={{ transform: `translate(${vp.tx}px,${vp.ty}px) scale(${vp.k})` }}>
        <svg id="lines">{paths.map((p, i) => <path key={i} className={p.ex ? 'ex' : ''} d={mirrorPath(p.d)} />)}</svg>
        {nodes.map((n, i) => {
          const key = seen.has(n.id) ? n.id + '#' + i : n.id
          seen.add(n.id)
          return (
            <div key={key} className={'card' + (n.id === focus ? ' focus' : '')} style={{ transform: `translate(${-n.x - CW}px,${n.y}px)` }}>
              <PersonTag id={n.id} onPick={() => {}} />
              {n.more && <i className={'more ' + n.more}>{n.more === 'up' ? '▲' : '▼'}</i>}
            </div>
          )
        })}
      </div>
      <div className="gen">
        <label htmlFor="gUp">דורות ↑</label>
        <select id="gUp" value={up} onChange={e => setUp(+e.target.value)}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <option key={i}>{i}</option>)}</select>
        <label htmlFor="gDn">↓</label>
        <select id="gDn" value={dn} onChange={e => setDn(+e.target.value)}>{[0, 1, 2, 3, 4, 5, 6].map(i => <option key={i}>{i}</option>)}</select>
      </div>
      <div className="zoom">
        <button type="button" aria-label="הגדלה" onClick={() => { const r = stage.current!.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2) }}>+</button>
        <button type="button" aria-label="הקטנה" onClick={() => { const r = stage.current!.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2) }}>−</button>
        <button type="button" aria-label="התאמה למסך" onClick={fit}>⤢</button>
      </div>
    </div>
  )
}
