import { useState } from 'react'
import { useStore, type Screen } from './store'
import { api } from './api'
import { canReview } from './lib/tree'
import type { RelKind } from './types'
import { FamilyView } from './components/FamilyView'
import { TreeCanvas } from './components/TreeCanvas'
import { PersonPanel } from './components/PersonPanel'
import { AddDialog, DeleteDialog, EditDialog } from './components/PersonDialogs'
import { Admin, Inbox, Me, SearchResults, SearchScreen } from './components/Screens'
import { Avatar } from './components/PersonTag'
import { Login, NotInvited } from './components/Login'

type Dlg = null | { k: 'edit' } | { k: 'add'; rel?: RelKind } | { k: 'del' }

const icons = {
  family: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M12 7.5v4M6 15.5v-2h12v2" /></svg>,
  tree: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="8.5" y="16" width="7" height="5" rx="1.5" /><path d="M6.5 8v4h11V8M12 12v4" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg>,
  inbox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></svg>,
  me: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
}

export default function App() {
  const s = useStore()
  const { data, me, loading, focus, setFocus, view, setView, screen, setScreen, toastMsg, access } = s
  const [dlg, setDlg] = useState<Dlg>(null)
  const [q, setQ] = useState('')

  if (loading) return <div className="login"><p>טוען…</p></div>
  if (api.mode === 'live' && !me) return api.signedIn?.() ? <NotInvited /> : <Login />
  if (!data || !me) return null

  const pending = data.requests.filter(r => r.status === 'open' && canReview(data.tree, me, r.change.target)).length
  const tab = (n: Screen | 'family' | 'tree') => () => {
    if (n === 'family' || n === 'tree') { setView(n); setScreen(null) } else setScreen(screen === n ? null : n)
  }
  const navOn = (n: string) => (screen ? screen === n : view === n)
  const canEdit = access(focus, 'child') !== 'none'

  return (
    <div id="shell">
      <header>
        <h1>עץ המשפחה</h1>
        <div className="srch">
          <input type="search" placeholder="חיפוש שם…" value={q} onChange={e => setQ(e.target.value)} aria-label="חיפוש" />
          {q && <div className="dropdown"><SearchResults q={q} onPick={id => { setQ(''); setFocus(id) }} /></div>}
        </div>
        <div className="seg hide-m" role="tablist" aria-label="תצוגה">
          <button type="button" className={view === 'family' && !screen ? 'on' : ''} onClick={tab('family')}>משפחה</button>
          <button type="button" className={view === 'tree' && !screen ? 'on' : ''} onClick={tab('tree')}>עץ מלא</button>
        </div>
        <span className="sp" />
        <button type="button" className="hb hide-m" onClick={tab('inbox')}>עדכונים {pending > 0 && <span className="badge">{pending}</span>}</button>
        {me.role === 'admin' && <button type="button" className="hb hide-m" onClick={tab('admin')}>ניהול</button>}
        <button type="button" className="hb who" onClick={tab('me')} title={me.name}>
          {me.person && data.tree.people[me.person] && <Avatar p={data.tree.people[me.person]} size={30} />}
          <span className="hide-m">{me.name}</span>
        </button>
      </header>

      <main>
        {view === 'family' ? <FamilyView onAdd={rel => setDlg({ k: 'add', rel })} /> : <TreeCanvas />}
        <PersonPanel onEdit={() => setDlg({ k: 'edit' })} onAdd={() => setDlg({ k: 'add' })} onDelete={() => setDlg({ k: 'del' })} />
        {screen && (
          <section id="screen">
            {screen === 'inbox' && <Inbox />}
            {screen === 'admin' && <Admin />}
            {screen === 'me' && <Me />}
            {screen === 'search' && <SearchScreen />}
          </section>
        )}
      </main>

      {!screen && canEdit && <button type="button" className="fab" aria-label="הוספת קרוב" onClick={() => setDlg({ k: 'add' })}>+</button>}

      <nav id="bn">
        <button type="button" className={navOn('family') ? 'on' : ''} onClick={tab('family')}>{icons.family}משפחה</button>
        <button type="button" className={navOn('tree') ? 'on' : ''} onClick={tab('tree')}>{icons.tree}עץ מלא</button>
        <button type="button" className={navOn('search') ? 'on' : ''} onClick={tab('search')}>{icons.search}חיפוש</button>
        <button type="button" className={navOn('inbox') ? 'on' : ''} onClick={tab('inbox')}>{icons.inbox}עדכונים{pending > 0 && <span className="badge">{pending}</span>}</button>
        <button type="button" className={navOn('me') ? 'on' : ''} onClick={tab('me')}>{icons.me}אני</button>
      </nav>

      {dlg?.k === 'edit' && <EditDialog id={focus} onClose={() => setDlg(null)} />}
      {dlg?.k === 'add' && <AddDialog id={focus} initial={dlg.rel} onClose={() => setDlg(null)} />}
      {dlg?.k === 'del' && <DeleteDialog id={focus} onClose={() => setDlg(null)} />}
      <div id="toast" className={toastMsg ? 'on' : ''} role="status">{toastMsg}</div>
    </div>
  )
}
