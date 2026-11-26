-- EMPWR training hub: member login, step 2 of 2 (the lock-down)
-- Run ONLY after the iPad, Coach Board laptop and TV computer are signed in
-- with info@empwrfast.com (or rich@). After this, the public link alone
-- shows nothing: devices and coaches see everyone, members see only themselves.

do $$
declare r record; p record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'sgpt' and c.relkind in ('r','p')
  loop
    -- remove any older open rules so only the hub_ rules from step 1 remain
    for p in select policyname from pg_policies
             where schemaname = 'sgpt' and tablename = r.relname
               and policyname not like 'hub\_%' and policyname <> 'staff_read_self'
    loop
      execute format('drop policy %I on sgpt.%I', p.policyname, r.relname);
    end loop;
    execute format('alter table sgpt.%I enable row level security', r.relname);
    execute format('revoke all on sgpt.%I from anon', r.relname);
  end loop;
end $$;

-- Views follow the rules of the tables underneath them
do $$
declare v record;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'sgpt' and c.relkind = 'v'
  loop
    execute format('alter view sgpt.%I set (security_invoker = true)', v.relname);
    execute format('revoke all on sgpt.%I from anon', v.relname);
  end loop;
end $$;

-- Devices must sign in from now on
update sgpt.settings set value = 'on' where key = 'device_signin';

-- Check: every table should say rules_on = true
select c.relname as name, c.relkind as kind, c.relrowsecurity as rules_on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'sgpt' and c.relkind in ('r','p','v') order by 1;
