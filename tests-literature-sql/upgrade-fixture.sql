-- Seed the original schema before installing the forward migration.
begin;
set local role service_role;
select public.ingest_literature_run('{"runKey":"upgrade:new","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","fetchedAt":"2026-10-10T12:00:00Z","papers":[{"sourceId":"upgrade-1","title":"Newest"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:old","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","fetchedAt":"2026-10-01T12:00:00Z","papers":[{"sourceId":"upgrade-1","title":"Older recovery"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:unknown","contentHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","papers":[{"sourceId":"upgrade-1","title":"Unknown fetch time"}]}]}');
-- Deterministic ties: the earlier snapshot has the lower search UUID.
-- ingested_at is identical throughout this transaction.
insert into public.literature_article(id,title) values
 ('10000000-0000-0000-0000-000000000001','Undated'),
 ('10000000-0000-0000-0000-000000000002','Dated tie');
insert into public.literature_source_record(id,article_id,source,source_id,metadata) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','core','upgrade-undated','{"sourceId":"upgrade-undated","title":"Current undated"}'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','core','upgrade-tied','{"sourceId":"upgrade-tied","title":"Current tied"}');
insert into public.literature_run(id,run_key,content_hash) values
 ('30000000-0000-0000-0000-000000000001','upgrade:ties',repeat('d',64));
insert into public.literature_search(id,run_id,query_index,query,source,status,fetched_at) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',0,'old unknown','core','ok',null),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',1,'current unknown','core','ok',null),
 ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',2,'old tie','core','ok','2026-10-10T12:00:00Z'),
 ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001',3,'current tie','core','ok','2026-10-10T12:00:00Z');
insert into public.literature_hit(search_id,rank,source_record_id,metadata) values
 ('40000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000001','{"sourceId":"upgrade-undated","title":"Older undated"}'),
 ('40000000-0000-0000-0000-000000000002',1,'20000000-0000-0000-0000-000000000001','{"sourceId":"upgrade-undated","title":"Current undated"}'),
 ('40000000-0000-0000-0000-000000000003',1,'20000000-0000-0000-0000-000000000002','{"sourceId":"upgrade-tied","title":"Older tied"}'),
 ('40000000-0000-0000-0000-000000000004',1,'20000000-0000-0000-0000-000000000002','{"sourceId":"upgrade-tied","title":"Current tied"}');
-- Reproduce the legacy RPC deleting the only canonical publication evidence.
insert into public.literature_article(id,doi,arxiv_id,title) values
 ('10000000-0000-0000-0000-000000000003','10.1234/upgrade',null,'Bridge DOI'),
 ('10000000-0000-0000-0000-000000000004',null,'2610.09999','Bridge arXiv');
select public.ingest_literature_run('{"runKey":"upgrade:publication-evidence","contentHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","searches":[{"queryIndex":0,"query":"bridge","source":"core","status":"ok","papers":[{"sourceId":"upgrade-bridge-doi","title":"DOI","doi":"10.1234/upgrade"}]},{"queryIndex":0,"query":"bridge","source":"arxiv","status":"ok","papers":[{"sourceId":"upgrade-bridge-arxiv","title":"arXiv","arxivId":"2610.09999","year":2024,"published":"2024-01-02"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:publication-bridge","contentHash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","searches":[{"queryIndex":0,"query":"bridge","source":"semantic-scholar","status":"ok","papers":[{"sourceId":"upgrade-bridge-link","title":"Linked","doi":"10.1234/upgrade","arxivId":"2610.09999"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:publication-source-update","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","searches":[{"queryIndex":0,"query":"bridge","source":"arxiv","status":"ok","papers":[{"sourceId":"upgrade-bridge-arxiv","title":"No publication fields","arxivId":"2610.09999"}]}]}');
do $$
begin
 if (select year from public.literature_article where doi='10.1234/upgrade') is not null
   or (select published from public.literature_article where doi='10.1234/upgrade') is not null then
   raise exception 'fixture did not reproduce lost publication metadata';
 end if;
 if exists(select 1 from public.literature_source_record where source_id='upgrade-bridge-arxiv' and metadata ? 'year') then
   raise exception 'fixture must retain year only in historical hit';
 end if;
end;
$$;
-- Ambiguous evidence, known fields and malformed legacy values.
insert into public.literature_article(id,title,year,published) values
 ('10000000-0000-0000-0000-000000000005','Conflicting years',null,null),
 ('10000000-0000-0000-0000-000000000006','Known publication',2020,'2020-01-01'),
 ('10000000-0000-0000-0000-000000000007','Invalid evidence',null,null);
insert into public.literature_source_record(article_id,source,source_id,metadata) values
 ('10000000-0000-0000-0000-000000000005','core','upgrade-conflict-a','{"year":2023,"published":"2023-01-01"}'),
 ('10000000-0000-0000-0000-000000000005','core','upgrade-conflict-b','{"year":2024,"published":"2023-01-01"}'),
 ('10000000-0000-0000-0000-000000000006','core','upgrade-known','{"year":2021,"published":"2021-01-01"}'),
 ('10000000-0000-0000-0000-000000000007','core','upgrade-invalid','{"year":2147483647,"published":{}}');
commit;
