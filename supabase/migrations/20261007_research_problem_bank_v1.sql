-- Research Problem Bank v1
create schema if not exists private;

create table if not exists public.research_problem (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'),
  kind text not null check (kind in ('open','benchmark_hidden_solution','solved_training','verified_reference','failed_attempt')),
  domain text not null,
  question text not null,
  source jsonb,
  verifier_ids text[] not null default '{}',
  difficulty smallint check (difficulty between 1 and 5),
  status text not null default 'active' check (status in ('active','retired')),
  version integer not null default 1 check (version > 0),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create or replace function public.enforce_research_run_problem_fingerprint() returns trigger\nlanguage plpgsql\nas $\nbegin\n  if not exists (select 1 from public.research_problem p where p.id = new.problem_id and p.fingerprint = new.problem_fingerprint) then\n    raise exception 'problem_fingerprint_mismatch';\n  end if;\n  return new;\nend;\n$;\n\ncreate table if not exists public.research_run (
  id uuid primary key default gen_random_uuid(),
  problem_id text not null references public.research_problem(id),
  problem_fingerprint text not null,
  state jsonb not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

-- Hidden benchmark answers never live in a Data API schema.
create table if not exists private.research_problem_reference (
  problem_id text primary key references public.research_problem(id) on delete cascade,
  reference_solution jsonb not null,
  reference_fingerprint text not null check (reference_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.research_problem enable row level security;
alter table public.research_run enable row level security;
alter table private.research_problem_reference enable row level security;

revoke all on public.research_problem, public.research_run from anon, authenticated;
revoke all on schema private from public, anon, authenticated;
revoke all on private.research_problem_reference from public, anon, authenticated;

comment on table private.research_problem_reference is 'Hidden benchmark references. Keep private schema out of Supabase Data API exposed schemas.';
