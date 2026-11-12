-- Every saved state of a component is an entry. Entries are never changed: a new state is a new
-- entry that lists the entries it continues as `predecessors`. Successors are not stored; they are
-- the entries that list an entry as predecessor. Together the entries form a DAG.
--
--   new component  predecessors = {}         one entry
--   revision       predecessors = {A}        one entry after A
--   split          predecessors = {A} each   several entries after A, in one call
--   join           predecessors = {A, B, …}  one entry after A, B, …
--
-- Entries are only added through append_entries(), which only extends leaves (entries nothing
-- continues yet) owned by the caller. A scanned code (component id + revision) finds its entry;
-- latest_for() walks on to the leaves.

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  -- the schema that decodes the payload, e.g. hello-world
  schema text not null check (schema ~ '^[a-z0-9-]+$'),
  -- the component id and revision number in the record, copied so a scanned code can be found
  component_id uuid not null,
  revision int check (revision >= 0),
  -- the full record as densing binary; it may hold more than the QR code
  payload bytea not null check (octet_length(payload) between 1 and 65536),
  -- the full history, of which the code holds a selection
  history jsonb,
  predecessors uuid[] not null default '{}' check (cardinality(predecessors) <= 16),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.entries is 'Immutable states of timber components; predecessors link them into a DAG.';

-- a scanned code matches exactly one entry
create unique index entries_code on public.entries (component_id, revision) nulls not distinct;
-- successors of X: predecessors @> {X}
create index entries_predecessors on public.entries using gin (predecessors);

alter table public.entries enable row level security;
create policy "entries are public" on public.entries for select using (true);
-- no insert, update or delete policies: rows are only added by append_entries()
revoke insert, update, delete, truncate on public.entries from anon, authenticated;
grant select on public.entries to anon, authenticated;

-- Adds entries after the given leaves and returns their ids. `entries` is a JSON array of
-- { schema, component_id, revision, payload (hex, optionally \x-prefixed), history }.
-- Errors are raised with a short code as message, which the app translates.
create function public.append_entries(predecessors uuid[], entries jsonb)
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
  if exists (select 1 from public.entries p where p.id = any (preds) and p.created_by <> uid) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if exists (select 1 from public.entries s where s.predecessors && preds) then
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

revoke execute on function public.append_entries(uuid[], jsonb) from public, anon;
grant execute on function public.append_entries(uuid[], jsonb) to authenticated;

-- The latest entries for a scanned code: its entry if nothing continues it, otherwise every leaf
-- reachable from it (several after a split). Empty when the code was never saved.
create function public.latest_for(code_component_id uuid, code_revision int default null)
returns setof public.entries
language sql
stable
set search_path = ''
as $$
  with recursive walk (id) as (
    select e.id from public.entries e
    where e.component_id = code_component_id and e.revision is not distinct from code_revision
    union
    select s.id from public.entries s join walk w on s.predecessors @> array[w.id]
  )
  select e.* from public.entries e join walk w on e.id = w.id
  where not exists (select 1 from public.entries s where s.predecessors @> array[e.id])
  order by e.created_at;
$$;

grant execute on function public.latest_for(uuid, int) to anon, authenticated;
