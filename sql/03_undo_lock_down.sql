-- Emergency undo for step 2: reopens the hub the way it was, so the gym keeps running.
do $$
declare r record;
begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'sgpt' and c.relkind in ('r','p','v') and c.relname not in ('staff','member_pins')
  loop
    if r.relkind = 'v' then
      execute format('alter view sgpt.%I set (security_invoker = false)', r.relname);
    else
      execute format('alter table sgpt.%I disable row level security', r.relname);
    end if;
    execute format('grant select, insert, update on sgpt.%I to anon', r.relname);
  end loop;
end $$;
