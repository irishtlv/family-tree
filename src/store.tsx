import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { AppData, Change, Member } from './types'
import { accessFor, describe, type Access } from './lib/tree'
import type { RelKind } from './types'

export type View = 'family' | 'tree'
export type Screen = null | 'inbox' | 'admin' | 'me' | 'search'

interface Store {
  data: AppData | null
  me: Member | null
  loading: boolean
  focus: string
  setFocus(id: string): void
  view: View
  setView(v: View): void
  screen: Screen
  setScreen(s: Screen): void
  sheet: boolean
  setSheet(b: boolean): void
  access(id: string, action: RelKind | 'edit' | 'delete' | 'status'): Access
  submit(c: Change): Promise<void>
  reload(): Promise<void>
  toast(msg: string): void
  toastMsg: string
}

const Ctx = createContext<Store>(null as never)
export const useStore = () => useContext(Ctx)

const isWide = () => window.matchMedia('(min-width: 821px)').matches

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [focus, setFocusRaw] = useState(() => (location.hash.startsWith('#p-') ? decodeURIComponent(location.hash.slice(3)) : ''))
  const [view, setView] = useState<View>(isWide() ? 'tree' : 'family')
  const [screen, setScreen] = useState<Screen>(null)
  const [sheet, setSheet] = useState(false)
  const [toastMsg, setToast] = useState('')

  const reload = useCallback(async () => {
    try { setData(await api.load()) } finally { setLoading(false) }
  }, [])
  useEffect(() => { reload(); return api.subscribe(reload) }, [reload])

  const me = data ? api.currentMember(data) : null
  // start on "me" in the tree, else the tree's home person
  useEffect(() => {
    if (!data) return
    if (!focus || !data.tree.people[focus]) {
      const start = (me?.person && data.tree.people[me.person] ? me.person : data.tree.home) || ''
      if (start) setFocusRaw(start)
    }
  }, [data, me?.person]) // eslint-disable-line react-hooks/exhaustive-deps

  const setFocus = useCallback((id: string) => {
    setFocusRaw(id)
    setScreen(null)
    history.replaceState(null, '', '#p-' + encodeURIComponent(id))
  }, [])

  const toast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout((toast as unknown as { t?: number }).t)
    ;(toast as unknown as { t?: number }).t = window.setTimeout(() => setToast(''), 2800)
  }, [])

  const value = useMemo<Store>(() => ({
    data, me, loading, focus, setFocus, view, setView, screen, setScreen, sheet, setSheet, toast, toastMsg, reload,
    access: (id, action) => (data && me ? accessFor(data.tree, me, id, action) : 'none'),
    async submit(c) {
      if (!data) return
      try {
        const r = await api.submit(c, describe(data.tree, c))
        toast(r === 'direct' ? 'נשמר בעץ' : 'נשלח לאישור. השינוי יופיע אחרי שיאושר')
        await reload()
      } catch (e) {
        toast('השמירה לא הצליחה: ' + ((e as Error).message || ''))
      }
    },
  }), [data, me, loading, focus, setFocus, view, screen, sheet, toast, toastMsg, reload])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
