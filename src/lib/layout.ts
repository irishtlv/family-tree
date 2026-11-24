import type { Tree } from '../types'
import { parentUnion, partnerIn, unionsOf } from './tree'

/** Hourglass layout around one person: ancestors above, siblings + descendants below.
 *  Logical x grows "forward" (first child first); the canvas mirrors it for RTL. */
export const CW = 196, CH = 76, GX = 22, RH = CH + 70

export interface Node { id: string; x: number; y: number; more?: 'up' | 'dn' }
export interface Path { d: string; ex: boolean }

export function layoutTree(t: Tree, focus: string, up: number, dn: number) {
  const nodes: Node[] = [], paths: Path[] = [], memo = new Map<string, number>()
  const card = (id: string, x: number, y: number, more?: 'up' | 'dn') => { nodes.push({ id, x, y, more }); return x + CW / 2 }
  const line = (d: string, ex = false) => paths.push({ d, ex })

  const mDesc = (id: string, d: number): number => {
    const k = id + ':' + d
    if (memo.has(k)) return memo.get(k)!
    const us = unionsOf(t, id), np = us.filter(u => partnerIn(u, id)).length
    const cw = (1 + np) * CW + np * GX
    let kw = 0, n = 0
    if (d > 0) for (const u of us) for (const c of u.children) { kw += mDesc(c, d - 1); n++ }
    if (n) kw += (n - 1) * GX
    const w = Math.max(cw, kw)
    memo.set(k, w)
    return w
  }
  const connect = (dx: number, fy: number, kids: number[], ty: number, off: number) => {
    const by = ty - (RH - CH) / 2 + off
    const xs = kids.concat(dx)
    let d = `M${dx} ${fy}V${by}M${Math.min(...xs)} ${by}H${Math.max(...xs)}`
    for (const x of kids) d += `M${x} ${by}V${ty}`
    line(d)
  }
  const pDesc = (id: string, d: number, x0: number, y: number): number => {
    const w = mDesc(id, d), us = unionsOf(t, id), parts = us.filter(u => partnerIn(u, id))
    const cw = (1 + parts.length) * CW + parts.length * GX, cx = x0 + (w - cw) / 2
    card(id, cx, y, d === 0 && us.some(u => u.children.length) ? 'dn' : undefined)
    let px = cx + CW + GX
    const pos = new Map<string, number>()
    parts.forEach((u, i) => {
      card(partnerIn(u, id)!, px, y)
      pos.set(u.id, px)
      line(`M${cx + CW} ${y + CH / 2 + (i ? 14 : 0)}H${px}`, u.status === 'divorced')
      px += CW + GX
    })
    if (d > 0) {
      const kids = us.reduce((a, u) => a + u.children.length, 0)
      let kw = 0
      for (const u of us) for (const c of u.children) kw += mDesc(c, d - 1)
      kw += Math.max(0, kids - 1) * GX
      let kx = x0 + (w - kw) / 2, fi = 0
      for (const u of us) {
        if (!u.children.length) continue
        const cs: number[] = []
        for (const c of u.children) { cs.push(pDesc(c, d - 1, kx, y + RH)); kx += mDesc(c, d - 1) + GX }
        const q = pos.get(u.id)
        connect(q != null ? q - GX / 2 : cx + CW / 2, q != null ? y + CH / 2 + (parts.indexOf(u) > 0 ? 14 : 0) : y + CH, cs, y + RH, fi * 6)
        fi++
      }
    }
    return cx + CW / 2
  }
  const mAnc = (id: string, g: number): number => {
    const k = 'a' + id + ':' + g
    if (memo.has(k)) return memo.get(k)!
    const u = parentUnion(t, id)
    let w = CW
    if (u && g > 0) {
      const ps = [u.a, u.b].filter((x): x is string => !!x)
      if (ps.length) w = Math.max(CW, ps.reduce((s, q) => s + mAnc(q, g - 1), 0) + (ps.length - 1) * GX)
    }
    memo.set(k, w)
    return w
  }
  const parentsAbove = (uId: string, g: number, xm: number, y: number) => {
    const u = t.unions.find(x => x.id === uId)!
    const ps = [u.a, u.b].filter((x): x is string => !!x)
    const tw = ps.reduce((s, q) => s + mAnc(q, g), 0) + (ps.length - 1) * GX
    let x = xm - tw / 2
    const cs = ps.map(q => { const c = pAnc(q, g, x, y); x += mAnc(q, g) + GX; return c })
    if (cs.length === 2) line(`M${cs[0] + CW / 2} ${y + CH / 2}H${cs[1] - CW / 2}`, u.status === 'divorced')
    return { mid: cs.length === 2 ? (cs[0] + cs[1]) / 2 : cs[0], fy: cs.length === 2 ? y + CH / 2 : y + CH }
  }
  const pAnc = (id: string, g: number, x0: number, y: number): number => {
    const w = mAnc(id, g), u = parentUnion(t, id)
    if (u && g > 0 && (u.a || u.b)) {
      const r = parentsAbove(u.id, g - 1, x0 + w / 2, y - RH)
      card(id, r.mid - CW / 2, y)
      connect(r.mid, r.fy, [r.mid], y, 0)
      return r.mid
    }
    card(id, x0 + (w - CW) / 2, y, u && (u.a || u.b) ? 'up' : undefined)
    return x0 + w / 2
  }

  if (!t.people[focus]) return { nodes, paths }
  const pu = parentUnion(t, focus)
  const sibs = pu && up > 0 ? pu.children : [focus]
  const sw = sibs.reduce((s, c) => s + mDesc(c, dn), 0) + (sibs.length - 1) * GX
  let x = -sw / 2
  const cs: number[] = []
  for (const c of sibs) { cs.push(pDesc(c, dn, x, 0)); x += mDesc(c, dn) + GX }
  if (pu && up > 0 && (pu.a || pu.b)) {
    const r = parentsAbove(pu.id, up - 1, 0, -RH)
    connect(r.mid, r.fy, cs, 0, 0)
  }
  return { nodes, paths }
}

/** mirror logical x for right-to-left drawing */
export const mirrorPath = (d: string) => d.replace(/(M|H)(-?[\d.]+)/g, (_m, c, v) => c + -Number(v))
