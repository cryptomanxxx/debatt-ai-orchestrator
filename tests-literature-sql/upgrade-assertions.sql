begin;
set local role service_role;
do $$
begin
 if (select metadata->>'title' from public.literature_source_record where source_id='upgrade-1') is distinct from 'Newest'
   or (select metadata_fetched_at from public.literature_source_record where source_id='upgrade-1') is distinct from '2026-10-10T12:00:00Z'::timestamptz then
   raise exception 'upgrade failed to restore newest metadata';
 end if;
 if (select metadata->>'title' from public.literature_source_record where source_id='upgrade-undated') is distinct from 'Current undated'
   or (select metadata_fetched_at from public.literature_source_record where source_id='upgrade-undated') is not null then
   raise exception 'upgrade changed undated current metadata';
 end if;
 if (select metadata->>'title' from public.literature_source_record where source_id='upgrade-tied') is distinct from 'Current tied'
   or (select metadata_fetched_at from public.literature_source_record where source_id='upgrade-tied') is distinct from '2026-10-10T12:00:00Z'::timestamptz then
   raise exception 'upgrade changed tied current metadata';
 end if;
 if (select year from public.literature_article where doi='10.1234/upgrade') is distinct from 2024
   or (select published from public.literature_article where doi='10.1234/upgrade') is distinct from '2024-01-02' then
   raise exception 'upgrade did not restore publication fields from historical hits';
 end if;
 if (select year from public.literature_article where title='Conflicting years') is not null
   or (select published from public.literature_article where title='Conflicting years') is distinct from '2023-01-01' then
   raise exception 'upgrade guessed an ambiguous field or failed independent recovery';
 end if;
 if (select year from public.literature_article where title='Known publication') is distinct from 2020
   or (select published from public.literature_article where title='Known publication') is distinct from '2020-01-01' then
   raise exception 'upgrade overwrote known publication fields';
 end if;
 if exists(select 1 from public.literature_article where title='Invalid evidence' and (year is not null or published is not null)) then
   raise exception 'upgrade used invalid evidence';
 end if;
 if (select count(*) from public.literature_hit)<>11 then raise exception 'upgrade changed history'; end if;
 delete from public.literature_hit;
 delete from public.literature_search;
 delete from public.literature_run;
 delete from public.literature_source_record;
 delete from public.literature_article;
end;
$$;
commit;
