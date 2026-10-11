-- Persist abstract-level interpretations and traceable planning candidates.
-- Article UUIDs in JSON are historical snapshots: no FK that blocks DOI/arXiv merges.
begin;
create table public.literature_planner_run (
  id uuid primary key,
  literature_run_id uuid not null references public.literature_run(id),
  query_index integer not null check (query_index between 0 and 19),
  created_at timestamptz not null default now(),
  report jsonb not null check ((
    jsonb_typeof(report) = 'object'
    and report->>'schema_version' = 'literature-evidence-1'
    and report->>'id' = id::text
    and report->>'literature_run_id' = literature_run_id::text
    and (report->>'query_index')::integer = query_index
    and report->>'status' in ('completed','partial','insufficient_evidence')
    and jsonb_typeof(report->'papers') = 'array'
    and jsonb_array_length(report->'papers') between 0 and 10
    and octet_length(report::text) <= 500000
  ) is true)
);
create index on public.literature_planner_run(literature_run_id,query_index,created_at desc);
alter table public.literature_planner_run enable row level security;
revoke all on public.literature_planner_run from public,anon,authenticated,service_role;
grant select,insert on public.literature_planner_run to service_role;
commit;
