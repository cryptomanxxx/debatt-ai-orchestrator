begin;
set local role service_role;
do $$
declare
 n integer; doi_id uuid; arxiv_id uuid; doi_value text; arxiv_value text;
 doi_search jsonb; arxiv_search jsonb; p jsonb; a public.literature_article;
begin
 -- Cross both UUID orientations with both source ingestion orders.
 for n in 0..3 loop
   doi_id:=('10000000-0000-0000-0000-'||lpad((2*n+1+n%2)::text,12,'0'))::uuid;
   arxiv_id:=('10000000-0000-0000-0000-'||lpad((2*n+2-n%2)::text,12,'0'))::uuid;
   doi_value:='10.1234/precedence-'||n; arxiv_value:='2610.'||lpad((n+1)::text,5,'0');
   insert into public.literature_article(id,doi,title,year,published) values(doi_id,doi_value,'Journal',2024,'2024-01-01');
   insert into public.literature_article(id,arxiv_id,title,year,published) values(arxiv_id,arxiv_value,'Preprint',2023,'2023-12-31T23:00:00Z');
   doi_search:=jsonb_build_object('queryIndex',0,'query','precedence','source','core','status','ok','papers',jsonb_build_array(
     jsonb_build_object('sourceId','doi-'||n,'title','Journal','doi',doi_value,'year',2024,'published','2024-01-01')));
   arxiv_search:=jsonb_build_object('queryIndex',0,'query','precedence','source','arxiv','status','ok','papers',jsonb_build_array(
     jsonb_build_object('sourceId','arxiv-'||n,'title','Preprint','arxivId',arxiv_value,'year',2023,'published','2023-12-31T23:00:00Z')));
   perform public.ingest_literature_run(jsonb_build_object('runKey','precedence-initial-'||n,'contentHash',repeat('a',64),
     'searches',case when n<2 then jsonb_build_array(doi_search,arxiv_search) else jsonb_build_array(arxiv_search,doi_search) end));
   p:=jsonb_build_object('runKey','precedence-bridge-'||n,'contentHash',repeat('b',64),'searches',jsonb_build_array(
     jsonb_build_object('queryIndex',0,'query','precedence','source','semantic-scholar','status','ok','papers',jsonb_build_array(
       jsonb_build_object('sourceId','bridge-'||n,'title','Bridge','doi',doi_value,'arxivId',arxiv_value)))));
   perform public.ingest_literature_run(p);
   select * into a from public.literature_article where doi=doi_value;
   if a.year is distinct from 2023 or a.published is distinct from '2023-12-31T23:00:00Z' then
     raise exception 'publication precedence depends on UUID or ingestion order';
   end if;
   if not exists(select 1 from public.literature_source_record where source_id='doi-'||n and metadata->>'published'='2024-01-01') then
     raise exception 'journal source publication evidence lost';
   end if;
   -- The same rule applies to incoming observations without merging two rows.
   p:=jsonb_set(p,'{runKey}',to_jsonb('precedence-earlier-'||n));
   p:=jsonb_set(p,'{searches,0,papers,0,year}',to_jsonb(2022));
   p:=jsonb_set(p,'{searches,0,papers,0,published}',to_jsonb('2022-01-01'::text));
   perform public.ingest_literature_run(p);
   p:=jsonb_set(p,'{runKey}',to_jsonb('precedence-later-'||n));
   p:=jsonb_set(p,'{searches,0,papers,0,year}',to_jsonb(2025));
   p:=jsonb_set(p,'{searches,0,papers,0,published}',to_jsonb('2025-01-01'::text));
   perform public.ingest_literature_run(p);
   select * into a from public.literature_article where doi=doi_value;
   if a.year is distinct from 2022 or a.published is distinct from '2022-01-01' then raise exception 'incoming publication precedence failed'; end if;
 end loop;
 if public.literature_earliest_publication('2024-01-01T01:00:00+02:00','2024-01-01') is distinct from '2024-01-01T01:00:00+02:00' then raise exception 'UTC precedence failed'; end if;
 if public.literature_earliest_publication('2024-01-01T00:00:00Z','2024-01-01') is distinct from '2024-01-01'
   or public.literature_earliest_publication('2024-01-01','2024-01-01T00:00:00Z') is distinct from '2024-01-01' then raise exception 'equal-instant tie depends on argument order'; end if;
 perform set_config('TimeZone','Pacific/Honolulu',true);
 if public.literature_earliest_publication('2024-01-01','2024-01-01T01:00:00Z') is distinct from '2024-01-01' then raise exception 'session timezone changed date-only precedence'; end if;
 if public.literature_earliest_publication('unknown','2024-01-01') is distinct from '2024-01-01'
   or public.literature_earliest_publication(null,null) is not null then raise exception 'missing/invalid publication handling failed'; end if;
 if has_function_privilege('anon','public.literature_earliest_publication(text,text)','execute') then raise exception 'public helper access granted'; end if;
end;
$$;
rollback;
