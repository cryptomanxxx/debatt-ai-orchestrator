-- Simulate a report written before the forward privilege repair.
alter default privileges in schema public
  revoke all on tables from anon,authenticated,service_role;
grant all on public.literature_planner_run to anon,authenticated,service_role;
insert into public.literature_run(id,run_key,content_hash)
values ('00000000-0000-4000-8000-000000000902','planner-upgrade-fixture','fixture');
insert into public.literature_planner_run(id,literature_run_id,query_index,report)
values ('00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000902',0,
  '{"schema_version":"literature-evidence-1","id":"00000000-0000-4000-8000-000000000903","literature_run_id":"00000000-0000-4000-8000-000000000902","query_index":0,"status":"insufficient_evidence","papers":[]}');
