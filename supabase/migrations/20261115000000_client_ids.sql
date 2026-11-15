-- append_entries as before, plus: an entry may bring its own `id` (made on the device, so an
-- offline revision can name an offline predecessor), and repeating a call is harmless. A call is
-- one transaction, so after a lost response either all of its entries exist or none: when all
-- exist with the same content, predecessors and creator, their ids are returned unchanged; when
-- any of the given ids exists otherwise, it fails with id_conflict.
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
  given uuid[];
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

  -- the ids the caller brought, in order (null where the server makes one)
  select coalesce(array_agg((x ->> 'id')::uuid order by i), '{}') into given
  from jsonb_array_elements(entries) with ordinality as t (x, i);
  if (select count(distinct g) from unnest(given) g) <> (select count(g) from unnest(given) g) then
    raise exception 'bad_shape';
  end if;
  -- the same ids arriving twice at once wait for each other (a new component locks no predecessor)
  perform pg_advisory_xact_lock(hashtextextended(g::text, 0)) from (select g from unnest(given) g where g is not null order by g) s;

  -- a repeated call: every entry has an id, each exists and matches what this call would write
  if exists (select 1 from public.entries x where x.id = any (given)) then
    if exists (select 1 from unnest(given) g where g is null)
      or exists (
        select 1 from jsonb_array_elements(entries) as t (x)
        where not exists (
          select 1 from public.entries s
          where s.id = (x ->> 'id')::uuid
            and s.created_by = uid
            and s.predecessors = preds
            and s.schema = x ->> 'schema'
            and s.component_id = (x ->> 'component_id')::uuid
            and s.revision is not distinct from (x ->> 'revision')::int
            and s.payload = decode(regexp_replace(x ->> 'payload', '^\\x', ''), 'hex')
            and s.history is not distinct from x -> 'history'
        )
      ) then
      raise exception 'id_conflict';
    end if;
    return given;
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
    insert into public.entries (id, schema, component_id, revision, payload, history, predecessors, created_by)
    values (
      coalesce((e ->> 'id')::uuid, gen_random_uuid()),
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
