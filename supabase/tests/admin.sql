-- Admin checks: roles, hiding, admin writes. Run as postgres after both migrations; like
-- entries.sql it is one DO block that always ends with an exception, so nothing is kept.
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  x uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid();
  r1 uuid; r2 uuid; r3 uuid; r4 uuid;
  n int;
  latest uuid[];
  passed int := 0;
begin
  insert into auth.users (id, email, aud, role, raw_app_meta_data) values
    (a, 'admin-test-a@example.invalid', 'authenticated', 'authenticated', '{}'),
    (b, 'admin-test-b@example.invalid', 'authenticated', 'authenticated', '{}'),
    (x, 'admin-test-x@example.invalid', 'authenticated', 'authenticated', '{"role":"admin"}');

  -- act as anon (null), a user, or an admin (the role travels in the token's app_metadata)
  create function pg_temp.act(who uuid, admin boolean default false) returns void language plpgsql as $f$
  begin
    if who is null then
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'app_metadata', case when admin then json_build_object('role', 'admin') else '{}'::json end)::text, true);
    end if;
  end $f$;
  create function pg_temp.e(component uuid, rev int, bytes text) returns jsonb language sql as $f$
    select jsonb_build_object('schema', 'hello-world', 'component_id', component, 'revision', rev, 'payload', '\x' || bytes, 'history', '[]'::jsonb)
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

  -- only admins may use the admin functions
  perform pg_temp.act(null);
  perform pg_temp.fails('select public.admin_users()', 'permission denied');
  perform pg_temp.act(a);
  perform pg_temp.fails('select public.admin_users()', 'not_admin');
  perform pg_temp.fails(format('select public.admin_hide(%L)', gen_random_uuid()), 'not_admin');
  perform pg_temp.fails(format('select public.admin_unhide(%L)', gen_random_uuid()), 'not_admin');
  -- and nobody can make themselves admin
  perform pg_temp.fails(format('update auth.users set raw_app_meta_data = %L where id = %L', '{"role":"admin"}', a), 'permission denied');
  perform pg_temp.act(x, true);
  if not exists (select 1 from public.admin_users() u where u.id = a and u.email = 'admin-test-a@example.invalid') then
    raise exception 'admin_users should list A with email';
  end if;
  passed := passed + 1;

  -- A saves R1, R2; B can't continue them, the admin can (R3)
  perform pg_temp.act(a);
  r1 := (public.append_entries('{}', jsonb_build_array(pg_temp.e(c1, 1, '01'))))[1];
  r2 := (public.append_entries(array[r1], jsonb_build_array(pg_temp.e(c1, 2, '02'))))[1];
  perform pg_temp.act(b);
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r2], jsonb_build_array(pg_temp.e(c1, 3, '03'))), 'not_owner');
  perform pg_temp.act(x, true);
  r3 := (public.append_entries(array[r2], jsonb_build_array(pg_temp.e(c1, 3, '03'))))[1];
  if (select created_by from public.entries where id = r3) <> x then raise exception 'R3 should be saved by the admin'; end if;
  passed := passed + 1;

  -- the admin hides R2: R2 and R3 (which continues it) are gone for everyone else
  n := public.admin_hide(r2, 'test');
  if n <> 2 then raise exception 'hiding R2 should hide 2 entries, hid %', n; end if;
  perform pg_temp.act(null);
  if exists (select 1 from public.entries where id in (r2, r3)) then raise exception 'anon still sees hidden entries'; end if;
  select array_agg(id) into latest from public.latest_for(c1, 1);
  if latest is distinct from array[r1] then raise exception 'latest_for(R1) should be R1 again for anon, got %', latest; end if;
  perform pg_temp.act(a);
  if (select count(*) from public.entries where id in (r1, r2, r3)) <> 1 then raise exception 'A should only see R1'; end if;
  passed := passed + 1;

  -- the visible leaf R1 can be continued again; hidden R2 can't be continued by anyone
  r4 := (public.append_entries(array[r1], jsonb_build_array(pg_temp.e(c1, 4, '04'))))[1];
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r2], jsonb_build_array(pg_temp.e(c1, 5, '05'))), 'hidden');
  perform pg_temp.act(x, true);
  perform pg_temp.fails(format('select public.append_entries(%L, %L)', array[r2], jsonb_build_array(pg_temp.e(c1, 5, '05'))), 'hidden');
  passed := passed + 1;

  -- the admin still sees everything, and which entries are hidden
  if (select count(*) from public.entries where id in (r1, r2, r3, r4)) <> 4 then raise exception 'admin should see all 4'; end if;
  if (select count(*) from public.hidden_entries where root = r2) <> 2 then raise exception 'admin should see 2 hidden rows'; end if;
  perform pg_temp.act(a);
  if exists (select 1 from public.hidden_entries) then raise exception 'non-admins must not see the hidden list'; end if;
  passed := passed + 1;

  -- unhiding by any entry of the hidden part restores all of it
  perform pg_temp.act(x, true);
  n := public.admin_unhide(r3);
  if n <> 2 then raise exception 'unhide should restore 2, restored %', n; end if;
  perform pg_temp.act(null);
  if (select count(*) from public.entries where id in (r1, r2, r3, r4)) <> 4 then raise exception 'anon should see all 4 again'; end if;
  passed := passed + 1;

  -- hidden_entries can't be written directly, not even by admins
  perform pg_temp.act(x, true);
  perform pg_temp.fails(format('insert into public.hidden_entries (entry_id, root) values (%L, %L)', r1, r1), 'permission denied');
  passed := passed + 1;

  raise exception 'admin: all checks passed (% groups)', passed;
end
$test$;
