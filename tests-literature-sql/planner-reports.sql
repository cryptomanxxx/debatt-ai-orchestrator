-- Append-only backend reports must not interfere with catalog reconciliation.
begin;
insert into public.literature_run(id,run_key,content_hash)
values ('00000000-0000-4000-8000-000000000900','planner-report-fixture','fixture');
set local role service_role;
insert into public.literature_planner_run(id,literature_run_id,query_index,report)
values ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000900',0,
  '{"schema_version":"literature-evidence-1","id":"00000000-0000-4000-8000-000000000901","literature_run_id":"00000000-0000-4000-8000-000000000900","query_index":0,"status":"insufficient_evidence","papers":[]}');
do $$ begin
  if (select count(*) from public.literature_planner_run where id='00000000-0000-4000-8000-000000000901')<>1 then
    raise exception 'planner report not readable';
  end if;
  begin
    update public.literature_planner_run set report=report;
    raise exception 'unexpected backend update access';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.literature_planner_run;
    raise exception 'unexpected backend delete access';
  exception when insufficient_privilege then null; end;
  begin
    truncate public.literature_planner_run;
    raise exception 'unexpected backend truncate access';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('service_role','public.literature_planner_run','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'unexpected mutation privileges';
  end if;
end $$;
reset role;
do $$ declare role_name text; begin
  begin
    insert into public.literature_planner_run(id,literature_run_id,query_index,report)
    values (gen_random_uuid(),'00000000-0000-4000-8000-000000000900',0,'{}');
    raise exception 'missing report fields accepted';
  exception when check_violation then null; end;
  begin
    insert into public.literature_planner_run(id,literature_run_id,query_index,report)
    values (gen_random_uuid(),'00000000-0000-4000-8000-000000000900',0,
      '{"schema_version":"literature-evidence-1","id":null,"literature_run_id":null,"query_index":null,"status":"completed","papers":[]}');
    raise exception 'null identity fields accepted';
  exception when check_violation then null; end;
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.literature_planner_run','select')
      or has_table_privilege(role_name,'public.literature_planner_run','insert') then raise exception 'public planner access'; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.literature_planner_run'::regclass) then raise exception 'RLS absent'; end if;
end $$;
rollback;
