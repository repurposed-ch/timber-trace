-- Admins: users with app_metadata.role = 'admin'. Only Supabase itself (dashboard, or SQL as
-- postgres) can set app_metadata, so nobody can make themselves admin. Admins see every entry,
-- including hidden ones, can continue anyone's entries, see who saved what (admin_users), and
-- hide an entry together with everything that continues it. Entries themselves stay immutable:
-- hiding is a separate, reversible list.

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

grant execute on function public.is_admin() to anon, authenticated;

create table public.hidden_entries (
  entry_id uuid primary key references public.entries (id),
  -- the entry the admin chose to hide; everything that continued it is hidden with it
  root uuid not null references public.entries (id),
  hidden_by uuid not null default auth.uid() references auth.users (id),
  hidden_at timestamptz not null default now(),
  reason text
);

comment on table public.hidden_entries is 'Entries an admin hid from everyone else (with all that continues them); reversible.';

create index hidden_entries_root on public.hidden_entries (root);
alter table public.hidden_entries enable row level security;
create policy "admins see hidden entries" on public.hidden_entries for select using (public.is_admin());
revoke insert, update, delete, truncate on public.hidden_entries from anon, authenticated;
grant select on public.hidden_entries to authenticated;

-- used by the read rule below; security definer so the hidden list itself stays private
create function public.entry_hidden(entry uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hidden_entries h where h.entry_id = entry)
$$;

grant execute on function public.entry_hidden(uuid) to anon, authenticated;

-- hidden entries vanish for everyone but admins, also from latest_for (it runs with the caller's rights)
drop policy "entries are public" on public.entries;
create policy "entries are public unless hidden" on public.entries for select using (not public.entry_hidden(id) or public.is_admin());

-- hides an entry and everything that continues it; returns how many entries were hidden
create function public.admin_hide(entry uuid, reason text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entries e where e.id = entry) then
    raise exception 'unknown_entry';
  end if;
  with recursive below (id) as (
    select entry
    union
    select e.id from public.entries e join below b on e.predecessors @> array[b.id]
  )
  insert into public.hidden_entries (entry_id, root, hidden_by, reason)
  select b.id, entry, auth.uid(), reason from below b
  on conflict (entry_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- shows again everything that was hidden together with this entry; returns how many
create function public.admin_unhide(entry uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  delete from public.hidden_entries h where h.root = (select x.root from public.hidden_entries x where x.entry_id = entry);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- who saved what: user ids with their email, for admins only
create function public.admin_users()
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query select u.id, u.email::text from auth.users u order by u.email;
end;
$$;

revoke execute on function public.admin_hide(uuid, text) from public, anon;
revoke execute on function public.admin_unhide(uuid) from public, anon;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_hide(uuid, text) to authenticated;
grant execute on function public.admin_unhide(uuid) to authenticated;
grant execute on function public.admin_users() to authenticated;

-- append_entries as before, plus: admins may continue anyone's entries; hidden entries can't be
-- continued and don't count as successors
create or replace function public.append_entries(predecessors uuid[], entries jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  preds uuid[] := coalesce(predecessors, '{}');
  n_pred int := cardinality(coalesce(predecessors, '{}'));
  n_new int;
  e jsonb;
  ids uuid[] := '{}';
  new_id uuid;
begin
  if uid is null then
    raise exception 'signed_out' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) = 0 then
    raise exception 'bad_shape';
  end if;
  n_new := jsonb_array_length(entries);
  -- new component: one entry; join: one entry; split: one predecessor, several entries
  if (n_pred = 0 or n_pred > 1) and n_new <> 1 then
    raise exception 'bad_shape';
  end if;
  if (select count(distinct p) from unnest(preds) p) <> n_pred then
    raise exception 'bad_shape';
  end if;

  -- lock the predecessors so two saves can't both extend the same leaf
  perform 1 from public.entries p where p.id = any (preds) for update;
  if (select count(*) from public.entries p where p.id = any (preds)) <> n_pred then
    raise exception 'unknown_predecessor';
  end if;
  -- hidden entries can't be continued, not even by admins (unhide first)
  if exists (select 1 from unnest(preds) p where public.entry_hidden(p)) then
    raise exception 'hidden';
  end if;
  -- admins may continue anyone's entries
  if not public.is_admin() and exists (select 1 from public.entries p where p.id = any (preds) and p.created_by <> uid) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  -- hidden successors don't count: the visible leaf before a hidden part can be continued again
  if exists (select 1 from public.entries s where s.predecessors && preds and not public.entry_hidden(s.id)) then
    raise exception 'not_latest';
  end if;

  for e in select value from jsonb_array_elements(entries) loop
    -- keeping a predecessor's component id means a later revision of it
    if exists (
      select 1 from public.entries p
      where p.id = any (preds)
        and p.component_id = (e ->> 'component_id')::uuid
        and (e ->> 'revision' is null or p.revision is null or (e ->> 'revision')::int <= p.revision)
    ) then
      raise exception 'revision_not_increasing';
    end if;
    insert into public.entries (schema, component_id, revision, payload, history, predecessors, created_by)
    values (
      e ->> 'schema',
      (e ->> 'component_id')::uuid,
      (e ->> 'revision')::int,
      decode(regexp_replace(e ->> 'payload', '^\\x', ''), 'hex'),
      e -> 'history',
      preds,
      uid
    )
    returning id into new_id;
    ids := ids || new_id;
  end loop;
  return ids;
end;
$$;
