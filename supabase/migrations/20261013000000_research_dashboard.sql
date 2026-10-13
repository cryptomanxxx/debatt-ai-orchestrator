-- Private dashboard checkpoints. Existing research/analysis tables are unchanged.
begin;
create table public.research_pipeline_run (
  id uuid primary key,
  area text not null check (area in ('PINNs and turbulence','Experiment design','Kalman state estimation','Causal inference','Model evaluation')),
  model_budget integer not null check (model_budget in (5,10)),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','insufficient_evidence','insufficient_relevant_hits','insufficient_abstract_identifiers','error')),
  known_model_calls integer not null default 0 check (known_model_calls between 0 and model_budget),
  dispatch_status text not null default 'pending' check (dispatch_status in ('pending','accepted','uncertain','failed','manual')),
  github_run_id text check (github_run_id ~ '^[1-9][0-9]{0,19}$'),
  github_run_attempt integer not null default 1 check (github_run_attempt >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  report jsonb check (report is null or (
    jsonb_typeof(report)='object' and report->>'schema_version'='research-pipeline-1'
    and report->>'id'=id::text and report->>'area'=area
    and report->>'status'=status and report->>'execution_enabled'='false'
    and (report->'budget'->>'maximum_model_calls')::integer=model_budget
    and (report->'budget'->>'known_model_calls')::integer=known_model_calls
    and (report->>'checkpoint_sequence')::integer>=1
    and jsonb_typeof(report->'stages')='array' and jsonb_array_length(report->'stages')<=6
    and octet_length(report::text)<=350000
  ) is true)
);
create index on public.research_pipeline_run(created_at desc,id desc);
alter table public.research_pipeline_run enable row level security;
revoke all on public.research_pipeline_run from public,anon,authenticated,service_role;
grant select,insert,update on public.research_pipeline_run to service_role;
create function public.save_research_pipeline_checkpoint(p_report jsonb) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid := (p_report->>'id')::uuid; v_attempt integer := (p_report->>'github_run_attempt')::integer; v_row public.research_pipeline_run;
begin
  if p_report->>'schema_version' is distinct from 'research-pipeline-1'
    or p_report->>'execution_enabled' is distinct from 'false' or v_attempt is null or v_attempt<1 then
    raise exception 'invalid_pipeline_checkpoint';
  end if;
  insert into public.research_pipeline_run(id,area,model_budget,status,known_model_calls,dispatch_status,github_run_id,github_run_attempt,report)
  values(v_id,p_report->>'area',(p_report->'budget'->>'maximum_model_calls')::integer,p_report->>'status',
    (p_report->'budget'->>'known_model_calls')::integer,'manual',p_report->>'github_run_id',v_attempt,p_report)
  on conflict(id) do nothing;
  select * into v_row from public.research_pipeline_run where id=v_id for update;
  if v_row.area is distinct from p_report->>'area' or v_row.model_budget is distinct from (p_report->'budget'->>'maximum_model_calls')::integer
    or (v_row.github_run_id is not null and v_row.github_run_id is distinct from p_report->>'github_run_id') then
    raise exception 'pipeline_identity_conflict';
  end if;
  -- A delayed heartbeat cannot replace a later checkpoint or a newer rerun attempt.
  if v_attempt<v_row.github_run_attempt or (v_attempt=v_row.github_run_attempt and v_row.report is not null
    and (p_report->>'checkpoint_sequence')::integer <= (v_row.report->>'checkpoint_sequence')::integer) then return v_id; end if;
  update public.research_pipeline_run set report=p_report,status=p_report->>'status',
    known_model_calls=(p_report->'budget'->>'known_model_calls')::integer,github_run_id=p_report->>'github_run_id',
    github_run_attempt=v_attempt,updated_at=now() where id=v_id;
  return v_id;
end $$;
revoke all on function public.save_research_pipeline_checkpoint(jsonb) from public,anon,authenticated;
grant execute on function public.save_research_pipeline_checkpoint(jsonb) to service_role;
commit;
