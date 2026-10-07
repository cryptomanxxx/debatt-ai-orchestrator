-- Prevent new runs from starting against a retired Problem Bank entry.
-- Lock the matching problem row while checking status so run creation and retirement serialize.
create or replace function public.guard_research_run_insert_active_problem()
returns trigger
language plpgsql
as $$
declare
  persisted_status text;
begin
  select p.status
    into persisted_status
    from public.research_problem p
    where p.id = new.problem_id
      and p.version = new.problem_version
      and p.fingerprint = new.problem_fingerprint
    for share;

  if persisted_status is distinct from 'active' then
    raise exception 'research_problem_not_active';
  end if;

  return new;
end;
$$;

drop trigger if exists research_run_active_problem_guard on public.research_run;
create trigger research_run_active_problem_guard
before insert on public.research_run
for each row
execute function public.guard_research_run_insert_active_problem();
