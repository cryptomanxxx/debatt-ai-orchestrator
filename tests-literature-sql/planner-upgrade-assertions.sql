set role service_role;
do $$ begin
  if (select count(*) from public.literature_planner_run
    where id='00000000-0000-4000-8000-000000000903'
    and report->>'status'='insufficient_evidence')<>1 then
    raise exception 'privilege upgrade lost existing report';
  end if;
end $$;
reset role;
