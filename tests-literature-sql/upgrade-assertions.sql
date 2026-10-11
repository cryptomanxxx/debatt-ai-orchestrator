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
 if (select count(*) from public.literature_hit)<>7 then raise exception 'upgrade changed history'; end if;
 delete from public.literature_hit;
 delete from public.literature_search;
 delete from public.literature_run;
 delete from public.literature_source_record;
 delete from public.literature_article;
end;
$$;
commit;
