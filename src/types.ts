export type Sex = 'M' | 'F' | 'U'

export interface Person {
  given?: string
  surname?: string
  maiden?: string
  nick?: string
  sex?: Sex
  /** Free text: "1948", "12/03/1948", "סביבות 1899" */
  birth?: string
  birthPlace?: string
  death?: string
  deceased?: boolean
  note?: string
  /** data: URL in demo mode, storage path / URL in Supabase mode */
  photo?: string
}

export type UnionStatus = 'married' | 'divorced' | 'partners'

export interface Union {
  id: string
  /** first partner (usually the man); null when unknown */
  a: string | null
  b: string | null
  status: UnionStatus
  children: string[]
}

export interface Tree {
  home: string
  people: Record<string, Person>
  unions: Union[]
}

export type Role = 'admin' | 'editor' | 'contrib' | 'viewer'

export interface Grant {
  root: string
  mode: 'direct' | 'approve'
}

export interface Member {
  id: string
  name: string
  contact?: string
  role: Role
  person?: string | null
  grants: Grant[]
}

export type RelKind = 'father' | 'mother' | 'partner' | 'child' | 'sibling'

export type Change =
  | { type: 'edit'; target: string; before: Person; after: Person }
  | { type: 'add'; target: string; kind: RelKind; union?: string | null; existing?: string | null; newId: string; person?: Person }
  | { type: 'status'; target: string; union: string; status: UnionStatus }
  | { type: 'delete'; target: string; why?: string }

export interface ChangeRequest {
  id: string
  at: number
  by: string
  status: 'open' | 'ok' | 'no'
  change: Change
}

export interface LogEntry {
  id: string
  at: number
  by: string
  label: string
  /** snapshot of the tree before the change, for undo */
  before?: Tree
}

export interface AppData {
  tree: Tree
  members: Member[]
  requests: ChangeRequest[]
  log: LogEntry[]
}
