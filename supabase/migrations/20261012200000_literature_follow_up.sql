begin;
create table public.literature_follow_up_run (
  id uuid primary key,
  parent_report_id uuid not null references public.literature_planner_run(id),
  literature_run_id uuid not null references public.literature_run(id),
  candidate_id text not null check (candidate_id ~ '^arp-[a-z-]{1,80}$'),
  created_at timestamptz not null default now(),
  report jsonb not null check ((
    jsonb_typeof(report) = 'object'
    and report->>'schema_version' = 'literature-follow-up-1'
    and report->>'id' = id::text
    and report->>'parent_report_id' = parent_report_id::text
    and report->>'literature_run_id' = literature_run_id::text
    and report->>'candidate_id' = candidate_id
    and report->>'status' in ('completed','partial','failed')
    and jsonb_typeof(report->'queries') = 'array'
    and jsonb_array_length(report->'queries') between 1 and 2
    and report->>'novelty' = 'unknown'
    and report->'assessment' = 'null'::jsonb
    and report->>'execution_enabled' = 'false'
    and report->'budget'->>'model_calls' = '0'
    and octet_length(report::text) <= 500000
  ) is true)
);
create index on public.literature_follow_up_run(parent_report_id,candidate_id,created_at desc);
alter table public.literature_follow_up_run enable row level security;
revoke all on public.literature_follow_up_run from public,anon,authenticated,service_role;
grant select,insert on public.literature_follow_up_run to service_role;
commit;
