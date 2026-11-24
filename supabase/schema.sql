-- Family tree: schema, permissions and server-side rules.
-- Run once in Supabase > SQL Editor, then run seed.sql.
-- Every write goes through the functions at the bottom, which check the
-- caller's role and branch. Tables are read-only to members and closed to everyone else.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists people (
  id text primary key,
  data jsonb not null default '{}'::jsonb,   -- given, surname, maiden, nick, sex, birth, birthPlace, death, deceased, note, photo
  updated_at timestamptz not null default now()
);

create table if not exists unions (
  id text primary key,
  a text references people(id) on delete set null,
  b text references people(id) on delete set null,
  status text not null default 'married' check (status in ('married','divorced','partners')),
  children text[] not null default '{}'
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

create table if not exists members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  contact text,
  role text not null default 'viewer' check (role in ('admin','editor','contrib','viewer')),
  person text references people(id) on delete set null,
  grants jsonb not null default '[]'::jsonb  -- [{ "root": "<person id>", "mode": "direct" | "approve" }]
);

-- An invite waits here until that email signs in for the first time.
create table if not exists invites (
  email text primary key,
  name text not null default '',
  role text not null default 'viewer' check (role in ('admin','editor','contrib','viewer')),
  person text references people(id) on delete set null,
  grants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists change_requests (
  id text primary key default 'r' || substr(md5(random()::text), 1, 12),
  at timestamptz not null default now(),
  by uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','ok','no')),
  label text not null default '',
  change jsonb not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  by uuid references auth.users(id) on delete set null,
  label text not null default '',
  before jsonb            -- the whole tree before the change, for undo
);

-- ---------- helpers ----------
create or replace function me() returns members
language sql stable security definer set search_path = public as $$
  select * from members where user_id = auth.uid()
$$;

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid())
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and role = 'admin')
$$;

-- root + every descendant + everyone's partners
create or replace function branch_set(root text) returns setof text
language sql stable security definer set search_path = public as $$
  with recursive d(id) as (
    select root
    union
    select c from d join unions u on (u.a = d.id or u.b = d.id), unnest(u.children) c
  )
  select id from d
  union
  select case when u.a = d.id then u.b else u.a end
    from d join unions u on (u.a = d.id or u.b = d.id)
   where (case when u.a = d.id then u.b else u.a end) is not null
$$;

-- 'direct' | 'ask' | 'none' for the current user acting on one person
create or replace function access_for(target text, action text) returns text
language plpgsql stable security definer set search_path = public as $$
declare m members; g jsonb;
begin
  select * into m from members where user_id = auth.uid();
  if m is null then return 'none'; end if;
  if m.role = 'admin' then return 'direct'; end if;
  if m.role = 'viewer' then return 'none'; end if;
  if action = 'delete' then return 'ask'; end if;
  for g in select * from jsonb_array_elements(m.grants) loop
    if action in ('father','mother','sibling') and target = g->>'root' then continue; end if;
    if target in (select branch_set(g->>'root')) then
      return case when g->>'mode' = 'direct' then 'direct' else 'ask' end;
    end if;
  end loop;
  return 'ask';
end $$;

create or replace function can_review(target text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m members; g jsonb;
begin
  select * into m from members where user_id = auth.uid();
  if m is null then return false; end if;
  if m.role = 'admin' then return true; end if;
  if m.role <> 'editor' then return false; end if;
  for g in select * from jsonb_array_elements(m.grants) loop
    if g->>'mode' = 'direct' and target in (select branch_set(g->>'root')) then return true; end if;
  end loop;
  return false;
end $$;

create or replace function tree_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'home', (select value from settings where key = 'home'),
    'people', coalesce((select jsonb_object_agg(id, data) from people), '{}'::jsonb),
    'unions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'a', a, 'b', b, 'status', status, 'children', to_jsonb(children))) from unions), '[]'::jsonb)
  )
$$;

create or replace function new_id(prefix text) returns text
language sql volatile as $$ select prefix || substr(md5(random()::text || clock_timestamp()::text), 1, 12) $$;

-- ---------- applying one change (internal) ----------
create or replace function apply_change(c jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  t text := c->>'target';
  kind text := c->>'kind';
  n text; pu unions; u unions; dup unions; tp jsonb; np jsonb; male boolean;
begin
  if c->>'type' = 'edit' then
    update people set data = c->'after', updated_at = now() where id = t;

  elsif c->>'type' = 'status' then
    update unions set status = c->>'status' where id = c->>'union';

  elsif c->>'type' = 'delete' then
    update unions set a = null where a = t;
    update unions set b = null where b = t;
    update unions set children = array_remove(children, t) where t = any(children);
    delete from people where id = t;
    if (select value #>> '{}' from settings where key = 'home') = t then
      update settings set value = to_jsonb((select id from people limit 1)) where key = 'home';
    end if;

  elsif c->>'type' = 'add' then
    n := nullif(c->>'existing', '');
    if n is null then
      n := coalesce(nullif(c->>'newId', ''), new_id('p'));
      insert into people(id, data) values (n, coalesce(c->'person', '{}'::jsonb));
    end if;
    select data into tp from people where id = t;
    select data into np from people where id = n;

    if kind in ('father', 'mother') then
      select * into pu from unions where t = any(children) limit 1;
      if pu is null then
        insert into unions(id, a, b, children) values (new_id('u'), null, null, array[t]) returning * into pu;
      end if;
      if kind = 'father' then update unions set a = n where id = pu.id returning * into pu;
      else update unions set b = n where id = pu.id returning * into pu; end if;
      if pu.a is not null and pu.b is not null then
        select * into dup from unions where id <> pu.id and ((a = pu.a and b = pu.b) or (a = pu.b and b = pu.a)) limit 1;
        if dup is not null then
          update unions set children = array(select distinct x from unnest(dup.children || pu.children) x) where id = dup.id;
          delete from unions where id = pu.id;
        end if;
      end if;

    elsif kind = 'partner' then
      male := (np->>'sex') = 'M' or ((np->>'sex') is distinct from 'F' and (tp->>'sex') = 'F');
      insert into unions(id, a, b) values (new_id('u'), case when male then n else t end, case when male then t else n end);

    elsif kind = 'child' then
      update unions set children = array_remove(children, n) where n = any(children);
      if nullif(c->>'union', '') is not null then
        select * into u from unions where id = c->>'union';
      else
        select * into u from unions where (a = t and b is null) or (b = t and a is null) limit 1;
      end if;
      if u is null then
        insert into unions(id, a, b) values (new_id('u'), case when (tp->>'sex') = 'F' then null else t end, case when (tp->>'sex') = 'F' then t else null end) returning * into u;
      end if;
      update unions set children = children || n where id = u.id;

    elsif kind = 'sibling' then
      select * into pu from unions where t = any(children) limit 1;
      if pu is null then
        insert into unions(id, a, b, children) values (new_id('u'), null, null, array[t]) returning * into pu;
      end if;
      update unions set children = array_remove(children, n) where n = any(children) and id <> pu.id;
      update unions set children = children || n where id = pu.id and not (n = any(children));
    end if;
  end if;

  delete from unions where cardinality(children) = 0 and (a is null or b is null);
end $$;

-- ---------- the API the app calls ----------
-- Saves directly when the caller may, otherwise files a request. Returns 'direct' or 'ask'.
create or replace function submit_change(c jsonb, label text) returns text
language plpgsql security definer set search_path = public as $$
declare acc text; action text;
begin
  action := case c->>'type' when 'add' then c->>'kind' when 'delete' then 'delete' else 'edit' end;
  acc := access_for(c->>'target', action);
  if acc = 'none' then raise exception 'no permission'; end if;
  if acc = 'direct' then
    insert into audit_log(by, label, before) values (auth.uid(), label, tree_snapshot());
    perform apply_change(c);
  else
    insert into change_requests(by, label, change) values (auth.uid(), label, c);
  end if;
  return acc;
end $$;

create or replace function review_request(rid text, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r change_requests;
begin
  select * into r from change_requests where id = rid and status = 'open';
  if r is null then raise exception 'request not found'; end if;
  if not can_review(r.change->>'target') then raise exception 'no permission'; end if;
  if approve then
    insert into audit_log(by, label, before) values (r.by, r.label, tree_snapshot());
    perform apply_change(r.change);
  end if;
  update change_requests set status = case when approve then 'ok' else 'no' end, reviewed_by = auth.uid(), reviewed_at = now() where id = rid;
end $$;

create or replace function restore_snapshot(log_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb; lbl text;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select before, label into s, lbl from audit_log where id = log_id;
  if s is null then raise exception 'snapshot not found'; end if;
  insert into audit_log(by, label, before) values (auth.uid(), 'שחזור: ביטול "' || lbl || '"', tree_snapshot());
  delete from unions;
  update members set person = null where person is not null and not (s->'people' ? person);
  delete from people;
  insert into people(id, data) select key, value from jsonb_each(s->'people');
  insert into unions(id, a, b, status, children)
    select x->>'id', x->>'a', x->>'b', coalesce(x->>'status', 'married'),
           array(select jsonb_array_elements_text(x->'children'))
      from jsonb_array_elements(s->'unions') x;
  insert into settings(key, value) values ('home', s->'home') on conflict (key) do update set value = excluded.value;
end $$;

create or replace function set_home(pid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into settings(key, value) values ('home', to_jsonb(pid)) on conflict (key) do update set value = excluded.value;
end $$;

-- New sign-in: take the waiting invite; the very first user becomes admin.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where lower(email) = lower(new.email);
  if inv is not null then
    insert into members(user_id, name, contact, role, person, grants)
      values (new.id, inv.name, new.email, inv.role, inv.person, inv.grants) on conflict do nothing;
    delete from invites where email = inv.email;
  elsif not exists (select 1 from members) then
    insert into members(user_id, name, contact, role) values (new.id, coalesce(new.email, ''), new.email, 'admin');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- row level security ----------
alter table people enable row level security;
alter table unions enable row level security;
alter table settings enable row level security;
alter table members enable row level security;
alter table invites enable row level security;
alter table change_requests enable row level security;
alter table audit_log enable row level security;

drop policy if exists "members read" on people;          create policy "members read" on people for select using (is_member());
drop policy if exists "members read" on unions;          create policy "members read" on unions for select using (is_member());
drop policy if exists "members read" on settings;        create policy "members read" on settings for select using (is_member());
drop policy if exists "members read" on members;         create policy "members read" on members for select using (is_member());
drop policy if exists "admin writes" on members;         create policy "admin writes" on members for all using (is_admin()) with check (is_admin());
drop policy if exists "admin all" on invites;            create policy "admin all" on invites for all using (is_admin()) with check (is_admin());
drop policy if exists "members read" on change_requests; create policy "members read" on change_requests for select using (is_member());
drop policy if exists "members read" on audit_log;       create policy "members read" on audit_log for select using (is_member());

grant execute on function submit_change(jsonb, text), review_request(text, boolean), restore_snapshot(bigint), set_home(text), access_for(text, text), can_review(text) to authenticated;
revoke execute on function apply_change(jsonb) from public, anon, authenticated;

-- live updates for open screens
do $$ begin
  alter publication supabase_realtime add table people, unions, change_requests, members, settings;
exception when others then null; end $$;
