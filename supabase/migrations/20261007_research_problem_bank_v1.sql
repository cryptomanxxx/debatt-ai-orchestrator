-- Research Problem Bank v1
create schema if not exists private;

create table if not exists public.research_problem (
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'),
  kind text not null check (kind in ('open','benchmark_hidden_solution','solved_training','verified_reference','failed_attempt')),
  domain text not null,
  question text not null,
  source jsonb,
  verifier_ids text[] not null default '{}',
  difficulty smallint check (difficulty between 1 and 5),
  status text not null default 'active' check (status in ('active','retired')),
  version integer not null default 1 check (version > 0),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (id, version),
  unique (id, fingerprint),
  unique (id, version, fingerprint)
);

create or replace function public.validate_research_problem_source()
returns trigger
language plpgsql
as $
declare
  source_key text;
  source_value jsonb;
begin
  if new.kind <> 'benchmark_hidden_solution' or new.source is null then
    return new;
  end if;

  if jsonb_typeof(new.source) <> 'object' then
    raise exception 'unsafe_benchmark_source';
  end if;

  for source_key, source_value in select key, value from jsonb_each(new.source)
  loop
    if source_key not in ('provider','collection','problem_id','url','citation','license') then
      raise exception 'unsafe_benchmark_source';
    end if;
    if jsonb_typeof(source_value) not in ('string','null') then
      raise exception 'unsafe_benchmark_source';
    end if;
  end loop;

  return new;
end;
$;

drop trigger if exists research_problem_source_guard on public.research_problem;
create trigger research_problem_source_guard
before insert or update of kind, source on public.research_problem
for each row
execute function public.validate_research_problem_source();

create or replace function public.prevent_research_problem_update()
returns trigger
language plpgsql
as $
begin
  raise exception 'research_problem_version_immutable';
end;
$;

drop trigger if exists research_problem_immutable_guard on public.research_problem;
create trigger research_problem_immutable_guard
before update on public.research_problem
for each row
execute function public.prevent_research_problem_update();

create table if not exists public.research_run (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null,
  problem_version integer not null,
  problem_fingerprint text not null,
  state jsonb not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (problem_id, problem_version, problem_fingerprint)
    references public.research_problem(id, version, fingerprint),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create or replace function public.prevent_research_run_lineage_update()
returns trigger
language plpgsql
as $$
begin
  if new.problem_id is distinct from old.problem_id
     or new.problem_version is distinct from old.problem_version
     or new.problem_fingerprint is distinct from old.problem_fingerprint then
    raise exception 'research_run_lineage_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists research_run_lineage_immutable_guard on public.research_run;
create trigger research_run_lineage_immutable_guard
before update of problem_id, problem_version, problem_fingerprint on public.research_run
for each row
execute function public.prevent_research_run_lineage_update();

-- Hidden benchmark answers never live in a Data API schema.
create table if not exists private.research_problem_reference (
  problem_id text not null,
  problem_version integer not null,
  reference_solution jsonb not null,
  reference_fingerprint text not null check (reference_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (problem_id, problem_version),
  foreign key (problem_id, problem_version)
    references public.research_problem(id, version) on delete cascade
);

alter table public.research_problem enable row level security;
alter table public.research_run enable row level security;
alter table private.research_problem_reference enable row level security;

revoke all on public.research_problem, public.research_run from anon, authenticated;
revoke all on schema private from public, anon, authenticated;
revoke all on private.research_problem_reference from public, anon, authenticated;

comment on table private.research_problem_reference is 'Hidden benchmark references. Keep private schema out of Supabase Data API exposed schemas.';
