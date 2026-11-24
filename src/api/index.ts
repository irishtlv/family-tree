import type { AppData, Change, Member } from '../types'
import { createDemoApi } from './demo'
import { createSupabaseApi } from './supabase'

/** Everything the screens need from a backend. Two implementations:
 *  demo (browser only, sample users) and Supabase (real sign-in, shared data). */
export interface Api {
  mode: 'demo' | 'live'
  load(): Promise<AppData>
  /** current signed-in member, or null when signed out */
  currentMember(data: AppData): Member | null
  /** saves directly when allowed, else files a request; returns which happened */
  submit(change: Change, label: string): Promise<'direct' | 'ask'>
  review(requestId: string, approve: boolean): Promise<void>
  undo(logId: string): Promise<void>
  setHome(personId: string): Promise<void>
  saveMember(m: Member, isNew: boolean): Promise<void>
  removeMember(id: string): Promise<void>
  /** live: email one-time code; demo: unused */
  sendCode?(email: string): Promise<void>
  verifyCode?(email: string, code: string): Promise<void>
  signOut?(): Promise<void>
  /** live: is anyone signed in (even if not yet invited) */
  signedIn?(): boolean
  /** demo only: act as another sample user */
  switchUser?(id: string): void
  /** called when someone else changes the data */
  subscribe(onChange: () => void): () => void
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const api: Api = url && key ? createSupabaseApi(url, key) : createDemoApi()
