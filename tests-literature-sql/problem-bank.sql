begin;
insert into public.research_problem(id,kind,domain,question,version,fingerprint)
values ('pb-fixture-active','open','fixture','Active fixture question?',1,repeat('a',64)),
 ('pb-fixture-retired','open','fixture','Retired fixture question?',1,repeat('b',64));
update public.research_problem set status='retired' where id='pb-fixture-retired';
set local role service_role;
do $$ declare run_id uuid; finished timestamptz; begin
  insert into public.research_run(problem_id,problem_version,problem_fingerprint,state)
  values ('pb-fixture-active',1,repeat('a',64),'{}') returning id into run_id;
  begin
    insert into public.research_run(problem_id,problem_version,problem_fingerprint,state)
    values ('pb-fixture-retired',1,repeat('b',64),'{}');
    raise exception 'run started on retired problem';
  exception when raise_exception then
    if sqlerrm <> 'research_problem_not_active' then raise; end if;
  end;
  begin
    update public.research_problem set question='Changed?' where id='pb-fixture-active';
    raise exception 'problem version changed';
  exception when raise_exception then
    if sqlerrm <> 'research_problem_version_immutable' then raise; end if;
  end;
  begin
    insert into public.research_problem(id,kind,domain,question,source,fingerprint)
    values ('pb-fixture-hidden','benchmark_hidden_solution','fixture','Hidden?','{"answer":"42"}',repeat('c',64));
    raise exception 'unsafe benchmark source accepted';
  exception when raise_exception then
    if sqlerrm <> 'unsafe_benchmark_source' then raise; end if;
  end;
  update public.research_run set status='completed' where id=run_id returning completed_at into finished;
  if finished is null then raise exception 'database did not set completion clock'; end if;
  begin
    update public.research_run set state='{"changed":true}' where id=run_id;
    raise exception 'terminal run changed';
  exception when raise_exception then
    if sqlerrm <> 'research_run_terminal_immutable' then raise; end if;
  end;
  begin
    delete from public.research_run where id=run_id;
    raise exception 'terminal run deleted';
  exception when raise_exception then
    if sqlerrm <> 'research_run_terminal_immutable' then raise; end if;
  end;
end $$;
reset role;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,'public.research_problem','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege(role_name,'public.research_run','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'public access';
    end if;
    if has_schema_privilege(role_name,'private','USAGE') then raise exception 'private schema exposed'; end if;
  end loop;
  if not has_table_privilege('service_role','public.research_run','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'missing backend privileges';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.research_problem'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.research_run'::regclass)
    or not (select relrowsecurity from pg_class where oid='private.research_problem_reference'::regclass) then
    raise exception 'missing RLS';
  end if;
end $$;
rollback;
