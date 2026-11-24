import { createClient } from '@supabase/supabase-js'
import type { AppData, Member, Person, Union } from '../types'
import type { Api } from './index'

/** Live backend. Reads come straight from the tables (members only, via RLS);
 *  every write is a database function that checks role and branch on the server. */
export function createSupabaseApi(url: string, key: string): Api {
  const sb = createClient(url, key)
  let uidNow: string | null = null
  sb.auth.getSession().then(({ data }) => { uidNow = data.session?.user.id ?? null })
  sb.auth.onAuthStateChange((_e, s) => { uidNow = s?.user.id ?? null })

  const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data }

  return {
    mode: 'live',
    async load() {
      const s = (await sb.auth.getSession()).data.session
      uidNow = s?.user.id ?? null
      if (!s) return { tree: { home: '', people: {}, unions: [] }, members: [], requests: [], log: [] }
      const [people, unions, settings, members, invites, requests, log] = await Promise.all([
        sb.from('people').select('id,data'),
        sb.from('unions').select('id,a,b,status,children'),
        sb.from('settings').select('key,value'),
        sb.from('members').select('user_id,name,contact,role,person,grants'),
        sb.from('invites').select('email,name,role,person,grants'),
        sb.from('change_requests').select('*').order('at', { ascending: false }).limit(100),
        sb.from('audit_log').select('id,at,by,label').order('at', { ascending: false }).limit(60),
      ])
      const P: Record<string, Person> = {}
      for (const r of must(people) as { id: string; data: Person }[]) P[r.id] = r.data
      const home = ((must(settings) as { key: string; value: unknown }[]).find(x => x.key === 'home')?.value as string) || Object.keys(P)[0]
      const mem: Member[] = (must(members) as { user_id: string; name: string; contact: string; role: Member['role']; person: string | null; grants: Member['grants'] }[])
        .map(m => ({ id: m.user_id, name: m.name, contact: m.contact, role: m.role, person: m.person, grants: m.grants ?? [] }))
      // invites are visible to admins only; show them as members waiting to sign in
      for (const i of (invites.data ?? []) as { email: string; name: string; role: Member['role']; person: string | null; grants: Member['grants'] }[])
        mem.push({ id: 'invite:' + i.email, name: i.name + ' (הוזמן/ה)', contact: i.email, role: i.role, person: i.person, grants: i.grants ?? [] })
      return {
        tree: { home, people: P, unions: must(unions) as Union[] },
        members: mem,
        requests: (must(requests) as { id: string; at: string; by: string; status: 'open' | 'ok' | 'no'; change: AppData['requests'][0]['change'] }[])
          .map(r => ({ id: r.id, at: Date.parse(r.at), by: r.by, status: r.status, change: r.change })),
        log: (must(log) as { id: number; at: string; by: string; label: string }[]).map(l => ({ id: String(l.id), at: Date.parse(l.at), by: l.by, label: l.label })),
      }
    },
    signedIn: () => uidNow !== null,
    currentMember: d => d.members.find(m => m.id === uidNow) ?? null,
    async submit(change, label) {
      return must(await sb.rpc('submit_change', { c: change, label })) as 'direct' | 'ask'
    },
    async review(id, approve) { must(await sb.rpc('review_request', { rid: id, approve })) },
    async undo(id) { must(await sb.rpc('restore_snapshot', { log_id: Number(id) })) },
    async setHome(pid) { must(await sb.rpc('set_home', { pid })) },
    async saveMember(m, isNew) {
      if (isNew || m.id.startsWith('invite:')) {
        const email = (m.contact || '').trim().toLowerCase()
        if (!email.includes('@')) throw new Error('צריך כתובת מייל להזמנה')
        must(await sb.from('invites').upsert({ email, name: m.name, role: m.role, person: m.person || null, grants: m.grants }))
        // the invitee gets a sign-in link by email
        await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } })
      } else {
        must(await sb.from('members').update({ name: m.name, role: m.role, person: m.person || null, grants: m.grants }).eq('user_id', m.id))
      }
    },
    async removeMember(id) {
      if (id.startsWith('invite:')) must(await sb.from('invites').delete().eq('email', id.slice(7)))
      else must(await sb.from('members').delete().eq('user_id', id))
    },
    async sendCode(email) { must(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } })) },
    async verifyCode(email, token) { must(await sb.auth.verifyOtp({ email, token, type: 'email' })) },
    async signOut() { await sb.auth.signOut() },
    subscribe(f) {
      const ch = sb.channel('tree')
      for (const table of ['people', 'unions', 'change_requests', 'members', 'settings'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => f())
      ch.subscribe()
      const { data } = sb.auth.onAuthStateChange(() => f())
      return () => { sb.removeChannel(ch); data.subscription.unsubscribe() }
    },
  }
}
