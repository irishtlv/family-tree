import type { Tree } from '../types'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function gedDate(s?: string) {
  if (!s) return ''
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (m) return `${+m[1]} ${MONTHS[+m[2] - 1] ?? ''} ${m[3]}`
  const y = s.match(/\d{4}/)
  return y ? (/סביבות|בערך|~/.test(s) ? 'ABT ' : '') + y[0] : ''
}

/** GEDCOM 5.5.1, UTF-8: imports into MyHeritage, Geni, FamilySearch, Gramps. */
export function toGedcom(t: Tree) {
  const ids = Object.keys(t.people)
  const I = new Map(ids.map((k, i) => [k, `@I${i + 1}@`]))
  const F = new Map(t.unions.map((u, i) => [u.id, `@F${i + 1}@`]))
  const L = ['0 HEAD', '1 SOUR FAMILY_TREE_APP', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8']
  for (const k of ids) {
    const p = t.people[k]
    L.push(`0 ${I.get(k)} INDI`, `1 NAME ${p.given ?? ''} /${p.surname ?? ''}/`)
    if (p.nick) L.push(`2 NICK ${p.nick}`)
    if (p.maiden && p.maiden !== p.surname) L.push(`1 NAME ${p.given ?? ''} /${p.maiden}/`, '2 TYPE birth')
    L.push(`1 SEX ${p.sex ?? 'U'}`)
    if (p.birth || p.birthPlace) {
      L.push('1 BIRT')
      if (gedDate(p.birth)) L.push('2 DATE ' + gedDate(p.birth))
      if (p.birthPlace) L.push('2 PLAC ' + p.birthPlace)
    }
    if (p.deceased || p.death) {
      const d = gedDate(p.death)
      L.push(d ? '1 DEAT' : '1 DEAT Y')
      if (d) L.push('2 DATE ' + d)
    }
    if (p.note) p.note.split('\n').forEach((x, i) => L.push((i ? '2 CONT ' : '1 NOTE ') + x))
    for (const u of t.unions) {
      if (u.a === k || u.b === k) L.push('1 FAMS ' + F.get(u.id))
      if (u.children.includes(k)) L.push('1 FAMC ' + F.get(u.id))
    }
  }
  for (const u of t.unions) {
    L.push(`0 ${F.get(u.id)} FAM`)
    for (const k of [u.a, u.b]) if (k) L.push(`1 ${t.people[k]?.sex === 'F' ? 'WIFE' : 'HUSB'} ${I.get(k)}`)
    if (u.status === 'divorced') L.push('1 DIV Y')
    for (const c of u.children) L.push('1 CHIL ' + I.get(c))
  }
  L.push('0 TRLR')
  return L.join('\n')
}

export function download(filename: string, text: string, mime = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/** square-crops and shrinks a photo to a small JPEG data URL */
export async function shrinkImage(file: File, size = 240): Promise<string> {
  const url = URL.createObjectURL(file)
  const im = new Image()
  await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url })
  const c = document.createElement('canvas'), k = Math.max(size / im.width, size / im.height)
  c.width = c.height = size
  c.getContext('2d')!.drawImage(im, (size - im.width * k) / 2, (size - im.height * k) / 2, im.width * k, im.height * k)
  URL.revokeObjectURL(url)
  return c.toDataURL('image/jpeg', 0.82)
}
