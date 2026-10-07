-- Use the Supabase database clock when a research run becomes terminal.
create or replace function public.guard_research_run_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('completed','failed') then
    raise exception 'research_run_terminal_immutable';
  end if;
  if old.status = 'running'
     and new.status in ('completed','failed')
     and new.completed_at is null then
    new.completed_at := greatest(clock_timestamp(), old.started_at);
  end if;
  if new.id is distinct from old.id
     or new.problem_id is distinct from old.problem_id
     or new.problem_version is distinct from old.problem_version
     or new.problem_fingerprint is distinct from old.problem_fingerprint
     or new.started_at is distinct from old.started_at then
    raise exception 'research_run_lineage_immutable';
  end if;
  if new.status = 'running' and new.completed_at is not null then
    raise exception 'invalid_research_run_transition';
  end if;
  if new.status in ('completed','failed') and new.completed_at is null then
    raise exception 'invalid_research_run_transition';
  end if;
  return new;
end;
$$;
