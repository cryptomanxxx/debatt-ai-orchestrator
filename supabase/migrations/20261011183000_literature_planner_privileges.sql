-- Repair already-deployed report tables, including Supabase automatic grants.
begin;
revoke all on public.literature_planner_run
  from public,anon,authenticated,service_role;
grant select,insert on public.literature_planner_run to service_role;
commit;
