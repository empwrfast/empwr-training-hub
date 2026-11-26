-- EMPWR training hub: member login, step 1 of 2 (safe to run any time)
-- Adds what login needs. Changes nothing about who can read data yet,
-- so the iPad, Coach Board and TV keep working exactly as they do now.

-- 1. Member columns
alter table sgpt.members add column if not exists email text;
alter table sgpt.members add column if not exists plan text not null default 'gym';
do $$ begin
  alter table sgpt.members add constraint members_plan_check check (plan in ('gym','remote'));
exception when duplicate_object then null; end $$;
create unique index if not exists members_email_active_uq
  on sgpt.members (lower(email)) where active and email is not null;

-- 2. Staff and gym devices (signed in with these emails, they see everyone)
create table if not exists sgpt.staff (
  email text primary key,
  role  text not null default 'coach' check (role in ('owner','coach','device')),
  added_at timestamptz not null default now()
);
insert into sgpt.staff (email, role) values
  ('rich@empwrfast.com', 'owner'),
  ('info@empwrfast.com', 'device')
on conflict (email) do nothing;

-- 3. Who is signed in
create or replace function sgpt.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sgpt.staff s
                 where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Current members only: returns nothing once a member is no longer active
create or replace function sgpt.my_member_id() returns text
language sql stable security definer set search_path = '' as $$
  select m.id::text from sgpt.members m
  where m.active and m.email is not null
    and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

-- On/off switch for the one-time device sign-in on the iPad, Coach Board and TV.
-- Starts OFF so the gym keeps running untouched while the portal is tested.
create table if not exists sgpt.settings (key text primary key, value text);
insert into sgpt.settings values ('device_signin', 'off') on conflict (key) do nothing;

create or replace function sgpt.whoami() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'gate', coalesce((select value from sgpt.settings where key = 'device_signin'), 'off') = 'on',
    'staff', sgpt.is_staff(),
    'member', (select json_build_object('id', m.id, 'first_name', m.first_name,
                                        'last_name', m.last_name, 'plan', m.plan)
               from sgpt.members m where m.id::text = sgpt.my_member_id()));
$$;

-- 4. iPad PINs (hashed, never readable, locked for 10 min after 5 misses)
do $$
declare t text := (select format_type(a.atttypid, a.atttypmod) from pg_attribute a
                   where a.attrelid = 'sgpt.members'::regclass and a.attname = 'id');
begin
  execute format('create table if not exists sgpt.member_pins (
      member_id %s primary key references sgpt.members(id) on delete cascade,
      pin_hash text not null,
      fails int not null default 0,
      locked_until timestamptz,
      updated_at timestamptz not null default now())', t);
end $$;
alter table sgpt.member_pins enable row level security;  -- no policies: only the functions below touch it
revoke all on sgpt.member_pins from anon, authenticated;

create or replace function sgpt.pin_status(p_member text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r sgpt.member_pins;
begin
  if not sgpt.is_staff() then raise exception 'not allowed'; end if;
  select * into r from sgpt.member_pins where member_id::text = p_member;
  if not found then return 'none'; end if;
  if r.locked_until > now() then return 'locked'; end if;
  return 'set';
end $$;

create or replace function sgpt.set_member_pin(p_member text, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not sgpt.is_staff() then raise exception 'not allowed'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  insert into sgpt.member_pins (member_id, pin_hash)
  select m.id, extensions.crypt(p_pin, extensions.gen_salt('bf')) from sgpt.members m where m.id::text = p_member
  on conflict (member_id) do update
    set pin_hash = excluded.pin_hash, fails = 0, locked_until = null, updated_at = now();
end $$;

create or replace function sgpt.check_member_pin(p_member text, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare r sgpt.member_pins;
begin
  if not sgpt.is_staff() then raise exception 'not allowed'; end if;
  select * into r from sgpt.member_pins where member_id::text = p_member for update;
  if not found then return 'none'; end if;
  if r.locked_until > now() then return 'locked'; end if;
  if r.pin_hash = extensions.crypt(p_pin, r.pin_hash) then
    update sgpt.member_pins set fails = 0, locked_until = null where member_id = r.member_id;
    return 'ok';
  end if;
  update sgpt.member_pins
     set fails = fails + 1,
         locked_until = case when fails + 1 >= 5 then now() + interval '10 minutes' end
   where member_id = r.member_id;
  return 'wrong';
end $$;

-- Coach reset: clears a member's PIN so they set a new one next time
create or replace function sgpt.clear_member_pin(p_member text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not sgpt.is_staff() then raise exception 'not allowed'; end if;
  delete from sgpt.member_pins where member_id::text = p_member;
end $$;

revoke all on function sgpt.pin_status(text), sgpt.set_member_pin(text,text),
  sgpt.check_member_pin(text,text), sgpt.clear_member_pin(text) from public, anon;
grant execute on function sgpt.is_staff(), sgpt.my_member_id(), sgpt.whoami(),
  sgpt.pin_status(text), sgpt.set_member_pin(text,text),
  sgpt.check_member_pin(text,text), sgpt.clear_member_pin(text) to authenticated;
grant execute on function sgpt.whoami() to anon;
grant select on sgpt.staff to authenticated;
alter table sgpt.settings enable row level security;
revoke all on sgpt.settings from anon, authenticated;
alter table sgpt.staff enable row level security;
drop policy if exists staff_read_self on sgpt.staff;
create policy staff_read_self on sgpt.staff for select to authenticated using (sgpt.is_staff());

-- Signed-in devices and members use the "authenticated" role, so it needs the same table access
-- the public link has today. The rules below (switched on in step 2) decide which rows each person sees.
grant usage on schema sgpt to authenticated;
grant select, insert, update, delete on all tables in schema sgpt to authenticated;
grant usage, select on all sequences in schema sgpt to authenticated;
alter default privileges in schema sgpt grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema sgpt grant usage, select on sequences to authenticated;
revoke all on sgpt.member_pins from authenticated;

-- 5. Access rules, written now, enforced only after step 2 turns them on.
--    Staff and gym devices: everything.  Members: only their own rows.
--    Programming (exercises, sessions, blocks): any signed-in person can read.
do $$
declare r record; has_member boolean;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'sgpt' and c.relkind in ('r','p')
             and c.relname not in ('staff','member_pins')
  loop
    continue when r.relname = 'settings';
    has_member := exists (select 1 from information_schema.columns
                          where table_schema = 'sgpt' and table_name = r.relname and column_name = 'member_id');
    execute format('drop policy if exists hub_staff_all on sgpt.%I', r.relname);
    execute format('create policy hub_staff_all on sgpt.%I for all to authenticated using (sgpt.is_staff()) with check (sgpt.is_staff())', r.relname);

    if r.relname = 'members' then
      execute 'drop policy if exists hub_member_self on sgpt.members';
      execute 'create policy hub_member_self on sgpt.members for select to authenticated using (id::text = sgpt.my_member_id())';
    elsif has_member then
      execute format('drop policy if exists hub_member_read on sgpt.%I', r.relname);
      execute format('drop policy if exists hub_member_add on sgpt.%I', r.relname);
      execute format('drop policy if exists hub_member_edit on sgpt.%I', r.relname);
      execute format('create policy hub_member_read on sgpt.%I for select to authenticated using (member_id::text = sgpt.my_member_id())', r.relname);
      execute format('create policy hub_member_add on sgpt.%I for insert to authenticated with check (member_id::text = sgpt.my_member_id())', r.relname);
      execute format('create policy hub_member_edit on sgpt.%I for update to authenticated using (member_id::text = sgpt.my_member_id()) with check (member_id::text = sgpt.my_member_id())', r.relname);
    else
      execute format('drop policy if exists hub_signed_in_read on sgpt.%I', r.relname);
      execute format('create policy hub_signed_in_read on sgpt.%I for select to authenticated using (true)', r.relname);
    end if;
  end loop;
end $$;

-- Check: lists every table, whether rules are on yet (should say false until step 2)
select c.relname as table_name, c.relrowsecurity as rules_on,
       (select count(*) from pg_policies p where p.schemaname = 'sgpt' and p.tablename = c.relname) as rules
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'sgpt' and c.relkind in ('r','p') order by 1;
