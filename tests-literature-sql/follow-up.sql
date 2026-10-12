begin;
insert into public.literature_run(id,run_key,content_hash)
values ('00000000-0000-4000-8000-000000000950','follow-up-fixture','fixture');
insert into public.literature_planner_run(id,literature_run_id,query_index,report)
values ('00000000-0000-4000-8000-000000000951','00000000-0000-4000-8000-000000000950',0,
 '{"schema_version":"literature-evidence-1","id":"00000000-0000-4000-8000-000000000951","literature_run_id":"00000000-0000-4000-8000-000000000950","query_index":0,"status":"completed","papers":[]}');
set local role service_role;
insert into public.literature_follow_up_run(id,parent_report_id,literature_run_id,candidate_id,report)
values ('00000000-0000-4000-8000-000000000952','00000000-0000-4000-8000-000000000951',
 '00000000-0000-4000-8000-000000000950','arp-fluid-state-estimation',
 '{"schema_version":"literature-follow-up-1","id":"00000000-0000-4000-8000-000000000952","parent_report_id":"00000000-0000-4000-8000-000000000951","literature_run_id":"00000000-0000-4000-8000-000000000950","candidate_id":"arp-fluid-state-estimation","status":"completed","queries":["physics informed"],"novelty":"unknown","assessment":null,"execution_enabled":false,"budget":{"model_calls":0}}');
do $$ declare r public.literature_follow_up_run; begin
  select * into r from public.literature_follow_up_run where id='00000000-0000-4000-8000-000000000952';
  if r.id is null then raise exception 'backend cannot read follow-up'; end if;
  begin
    insert into public.literature_follow_up_run values (gen_random_uuid(),r.parent_report_id,r.literature_run_id,r.candidate_id,now(),'{}');
    raise exception 'empty report accepted';
  exception when check_violation then null; end;
  begin
    insert into public.literature_follow_up_run values (gen_random_uuid(),r.parent_report_id,r.literature_run_id,r.candidate_id,now(),r.report);
    raise exception 'mismatched identity accepted';
  exception when check_violation then null; end;
  begin
    update public.literature_follow_up_run set report=report;
    raise exception 'backend update allowed';
  exception when insufficient_privilege then null; end;
  if has_table_privilege('service_role','public.literature_follow_up_run','DELETE,TRUNCATE,UPDATE,REFERENCES,TRIGGER') then
    raise exception 'excess backend privileges';
  end if;
end $$;
reset role;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.literature_follow_up_run','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'public access';
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.literature_follow_up_run'::regclass) then raise exception 'missing RLS'; end if;
end $$;
rollback;
