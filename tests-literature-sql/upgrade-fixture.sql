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
commit;
