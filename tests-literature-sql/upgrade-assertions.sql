begin;
set local role service_role;
do $$
declare article_id uuid;
begin
 if (select metadata->>'title' from public.literature_source_record where source_id='upgrade-1') is distinct from 'Newest'
   or (select metadata_fetched_at from public.literature_source_record where source_id='upgrade-1') is distinct from '2026-10-10T12:00:00Z'::timestamptz then
   raise exception 'upgrade failed to restore newest metadata';
 end if;
 if (select count(*) from public.literature_hit)<>3 then raise exception 'upgrade changed history'; end if;
 select r.article_id into article_id from public.literature_source_record r where source_id='upgrade-1';
 delete from public.literature_hit;
 delete from public.literature_search;
 delete from public.literature_run;
 delete from public.literature_source_record;
 delete from public.literature_article a where a.id=article_id;
end;
$$;
commit;
