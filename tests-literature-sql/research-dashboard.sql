-- Run after the dashboard migration; contains only test fixtures.
begin;
do $$
begin
  if has_table_privilege('anon','public.research_pipeline_run','SELECT') or has_table_privilege('authenticated','public.research_pipeline_run','SELECT')
    or has_function_privilege('anon','public.save_research_pipeline_checkpoint(jsonb)','EXECUTE') then raise exception 'dashboard_public_access'; end if;
end $$;
set local role service_role;
insert into public.research_pipeline_run(id,area,model_budget) values('00000000-0000-4000-8000-000000000001','PINNs and turbulence',5);
select public.save_research_pipeline_checkpoint('{"id":"00000000-0000-4000-8000-000000000001","schema_version":"research-pipeline-1","area":"PINNs and turbulence","status":"running","execution_enabled":false,"budget":{"maximum_model_calls":5,"known_model_calls":1},"checkpoint_sequence":2,"github_run_id":"123","github_run_attempt":1,"stages":[]}'::jsonb);
-- A delayed snapshot must not erase a later counter.
select public.save_research_pipeline_checkpoint('{"id":"00000000-0000-4000-8000-000000000001","schema_version":"research-pipeline-1","area":"PINNs and turbulence","status":"running","execution_enabled":false,"budget":{"maximum_model_calls":5,"known_model_calls":0},"checkpoint_sequence":1,"github_run_id":"123","github_run_attempt":1,"stages":[]}'::jsonb);
do $$
begin
  if (select known_model_calls from public.research_pipeline_run where id='00000000-0000-4000-8000-000000000001')<>1 then raise exception 'stale_checkpoint_replaced_newer'; end if;
  begin
    perform public.save_research_pipeline_checkpoint('{"id":"00000000-0000-4000-8000-000000000001","schema_version":"research-pipeline-1","area":"PINNs and turbulence","status":"running","execution_enabled":false,"budget":{"maximum_model_calls":5,"known_model_calls":1},"checkpoint_sequence":3,"github_run_id":"999","github_run_attempt":1,"stages":[]}'::jsonb);
    raise exception 'accepted_foreign_run';
  exception when raise_exception then if sqlerrm<>'pipeline_identity_conflict' then raise; end if; end;
  begin
    insert into public.research_pipeline_run(id,area,model_budget) values('00000000-0000-4000-8000-000000000002','arbitrary',100);
    raise exception 'accepted_arbitrary_area_budget';
  exception when check_violation then null; end;
end $$;
select public.save_research_pipeline_checkpoint('{"id":"00000000-0000-4000-8000-000000000001","schema_version":"research-pipeline-1","area":"PINNs and turbulence","status":"running","execution_enabled":false,"budget":{"maximum_model_calls":5,"known_model_calls":0},"checkpoint_sequence":1,"github_run_id":"123","github_run_attempt":2,"stages":[]}'::jsonb);
select public.save_research_pipeline_checkpoint('{"id":"00000000-0000-4000-8000-000000000001","schema_version":"research-pipeline-1","area":"PINNs and turbulence","status":"completed","execution_enabled":false,"budget":{"maximum_model_calls":5,"known_model_calls":4},"checkpoint_sequence":99,"github_run_id":"123","github_run_attempt":1,"stages":[]}'::jsonb);
do $$
begin
  if (select github_run_attempt from public.research_pipeline_run where id='00000000-0000-4000-8000-000000000001')<>2
    or (select known_model_calls from public.research_pipeline_run where id='00000000-0000-4000-8000-000000000001')<>0 then raise exception 'old_attempt_replaced_newer'; end if;
end $$;
rollback;
