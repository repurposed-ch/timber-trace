-- Graph and access checks for public.entries. Run as postgres (SQL editor, Management API, or
-- psql). Everything happens inside one DO block that always ends with an exception, so nothing it
-- creates is kept: the message starts with "entries: all checks passed" or names the failed check.
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  c3 uuid := gen_random_uuid();
  r uuid; r2 uuid; p uuid; q uuid; j uuid;
  c4 uuid := gen_random_uuid();
  k1 uuid := gen_random_uuid();
  k2 uuid := gen_random_uuid();
  k3 uuid := gen_random_uuid();
  k4 uuid := gen_random_uuid();
  call text;
  ids uuid[];
  latest uuid[];
  passed int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (a, 'entries-test-a@example.invalid', 'authenticated', 'authenticated'),
    (b, 'entries-test-b@example.invalid', 'authenticated', 'authenticated');

  create function pg_temp.act(who uuid) returns void language plpgsql as $f$
  begin
    if who is null then
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    end if;
  end $f$;
  create function pg_temp.e(component uuid, rev int, bytes text) returns jsonb language sql as $f$
    select jsonb_build_object('schema', 'hello-world', 'component_id', component, 'revision', rev, 'payload', '\x' || bytes, 'history', '[]'::jsonb)
  $f$;
  create function pg_temp.ei(id uuid, component uuid, rev int, bytes text) returns jsonb language sql as $f$
    select pg_temp.e(component, rev, bytes) || jsonb_build_object('id', id)
  $f$;
  create function pg_temp.fails(sql text, expect text) returns void language plpgsql as $f$
  declare
    got text;
  begin
    begin
      execute sql;
    exception when others then
      got := sqlerrm;
    end;
    if got is null then
      raise exception 'expected % but it succeeded: %', expect, sql;
    elsif got not like '%' || expect || '%' then
      raise exception 'expected %, got "%" for: %', expect, got, sql;
    end if;
  end $f$;
  execute format('grant usage on schema %I to anon, authenticated', pg_my_temp_schema()::regnamespace);
  execute format('grant execute on all functions in schema %I to anon, authenticated', pg_my_temp_schema()::regnamespace);

  -- anon reads but can't write
  perform pg_temp.act(null);
  perform count(*) from public.entries;
  perform * from public.latest_for(c1, 1);
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', '{}', jsonb_build_array(pg_temp.e(c1, 1, '01'))), 'permission denied');
  passed := passed + 1;

  -- direct writes fail for everyone
  perform pg_temp.act(a);
  perform pg_temp.fails(format('insert into public.entries (schema, component_id, payload) values (%L, %L, %L)', 'hello-world', c1, '\x01'), 'permission denied');
  passed := passed + 1;

  -- A: root R, revision R2; the code of R leads to R2
  r := (public.append_entries('{}', jsonb_build_array(pg_temp.e(c1, 1, '01'))))[1];
  r2 := (public.append_entries(array[r], jsonb_build_array(pg_temp.e(c1, 2, '02'))))[1];
  select array_agg(id) into latest from public.latest_for(c1, 1);
  if latest is distinct from array[r2] then raise exception 'latest_for(R) should be R2, got %', latest; end if;
  select array_agg(id) into latest from public.latest_for(c1, 2);
  if latest is distinct from array[r2] then raise exception 'latest_for(R2) should be R2, got %', latest; end if;
  passed := passed + 1;

  -- R is no longer a leaf; revision numbers must increase; duplicate codes are rejected
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r], jsonb_build_array(pg_temp.e(c1, 3, '03'))), 'not_latest');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r2], jsonb_build_array(pg_temp.e(c1, 0, '03'))), 'revision_not_increasing');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', '{}', jsonb_build_array(pg_temp.e(c1, 2, '03'))), 'duplicate key');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[gen_random_uuid()], jsonb_build_array(pg_temp.e(c3, 1, '03'))), 'unknown_predecessor');
  passed := passed + 1;

  -- B can't extend A's entry
  perform pg_temp.act(b);
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r2], jsonb_build_array(pg_temp.e(c1, 3, '03'))), 'not_owner');
  passed := passed + 1;

  -- A splits R2 into P and Q (new component ids); the old code leads to both
  perform pg_temp.act(a);
  ids := public.append_entries(array[r2], jsonb_build_array(pg_temp.e(c2, 1, '04'), pg_temp.e(c3, 1, '05')));
  p := ids[1]; q := ids[2];
  select array_agg(id order by id) into latest from public.latest_for(c1, 1);
  if latest is distinct from (select array_agg(x order by x) from unnest(array[p, q]) x) then raise exception 'latest_for(R) should be {P, Q}, got %', latest; end if;
  passed := passed + 1;

  -- a split needs exactly one predecessor; several to several is rejected
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[p, q], jsonb_build_array(pg_temp.e(gen_random_uuid(), 1, '06'), pg_temp.e(gen_random_uuid(), 1, '07'))), 'bad_shape');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', '{}', jsonb_build_array(pg_temp.e(gen_random_uuid(), 1, '06'), pg_temp.e(gen_random_uuid(), 1, '07'))), 'bad_shape');
  passed := passed + 1;

  -- A joins P and Q into J; every older code leads to J
  j := (public.append_entries(array[p, q], jsonb_build_array(pg_temp.e(gen_random_uuid(), 1, '08'))))[1];
  select array_agg(id) into latest from public.latest_for(c1, 1);
  if latest is distinct from array[j] then raise exception 'latest_for(R) after the join should be {J}, got %', latest; end if;
  select array_agg(id) into latest from public.latest_for(c2, 1);
  if latest is distinct from array[j] then raise exception 'latest_for(P) should be {J}, got %', latest; end if;
  passed := passed + 1;

  -- the entry holds the full payload and history, whatever the code held
  if (select payload from public.entries where id = j) <> '\x08'::bytea then raise exception 'payload not stored as bytes'; end if;
  passed := passed + 1;

  -- entries can't be changed or deleted, not even by their owner
  perform pg_temp.fails(format('update public.entries set payload = %L where id = %L', '\x09', j), 'permission denied');
  perform pg_temp.fails(format('delete from public.entries where id = %L', j), 'permission denied');
  perform pg_temp.act(null);
  perform pg_temp.fails(format('delete from public.entries where id = %L', j), 'permission denied');
  passed := passed + 1;

  -- entries may bring their own ids (made offline); a repeated call returns them and adds nothing
  perform pg_temp.act(a);
  ids := public.append_entries('{}', jsonb_build_array(pg_temp.ei(k1, c4, 1, '11')));
  if ids is distinct from array[k1] then raise exception 'client id should be kept, got %', ids; end if;
  ids := public.append_entries('{}', jsonb_build_array(pg_temp.ei(k1, c4, 1, '11')));
  if ids is distinct from array[k1] then raise exception 'repeated root should return K1, got %', ids; end if;
  if (select count(*) from public.entries where component_id = c4) <> 1 then raise exception 'repeated root added a row'; end if;
  passed := passed + 1;

  -- repeating a revision works although its predecessor is no longer a leaf (the first call made it so)
  ids := public.append_entries(array[k1], jsonb_build_array(pg_temp.ei(k2, c4, 2, '12')));
  ids := public.append_entries(array[k1], jsonb_build_array(pg_temp.ei(k2, c4, 2, '12')));
  if ids is distinct from array[k2] then raise exception 'repeated revision should return K2, got %', ids; end if;
  if (select count(*) from public.entries where component_id = c4) <> 2 then raise exception 'repeated revision added a row'; end if;
  passed := passed + 1;

  -- an id that exists with anything else is a conflict: other payload, predecessors, revision, creator
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k1], jsonb_build_array(pg_temp.ei(k2, c4, 2, '13'))), 'id_conflict');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', '{}', jsonb_build_array(pg_temp.ei(k2, c4, 2, '12'))), 'id_conflict');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k1], jsonb_build_array(pg_temp.ei(k2, c4, 3, '12'))), 'id_conflict');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k2], jsonb_build_array(pg_temp.ei(k1, c4, 3, '14'))), 'id_conflict');
  perform pg_temp.act(b);
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k1], jsonb_build_array(pg_temp.ei(k2, c4, 2, '12'))), 'id_conflict');
  perform pg_temp.act(a);
  passed := passed + 1;

  -- a repeated split returns both ids; a split where only some ids exist, or one has none, conflicts
  call := format('select public.append_entries(%L, %L)', array[k2], jsonb_build_array(pg_temp.ei(k3, gen_random_uuid(), 1, '15'), pg_temp.ei(k4, gen_random_uuid(), 1, '16')));
  execute call into ids;
  execute call into ids;
  if ids is distinct from array[k3, k4] then raise exception 'repeated split should return {K3, K4}, got %', ids; end if;
  if (select count(*) from public.entries where predecessors = array[k2]) <> 2 then raise exception 'repeated split added rows'; end if;
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k2], jsonb_build_array(pg_temp.ei(k3, gen_random_uuid(), 1, '15'), pg_temp.ei(gen_random_uuid(), gen_random_uuid(), 1, '17'))), 'id_conflict');
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k2], jsonb_build_array(pg_temp.ei(k3, gen_random_uuid(), 1, '15'), pg_temp.e(gen_random_uuid(), 1, '17'))), 'id_conflict');
  -- the same id twice in one call is malformed
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[k3], jsonb_build_array(pg_temp.ei(k1, gen_random_uuid(), 1, '18'), pg_temp.ei(k1, gen_random_uuid(), 1, '19'))), 'bad_shape');
  passed := passed + 1;

  raise exception 'entries: all checks passed (% groups)', passed;
end
$test$;
