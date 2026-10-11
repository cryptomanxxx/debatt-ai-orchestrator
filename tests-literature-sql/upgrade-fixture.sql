-- Seed the original schema before installing the forward migration.
begin;
set local role service_role;
select public.ingest_literature_run('{"runKey":"upgrade:new","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","fetchedAt":"2026-10-10T12:00:00Z","papers":[{"sourceId":"upgrade-1","title":"Newest"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:old","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","fetchedAt":"2026-10-01T12:00:00Z","papers":[{"sourceId":"upgrade-1","title":"Older recovery"}]}]}');
select public.ingest_literature_run('{"runKey":"upgrade:unknown","contentHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","searches":[{"queryIndex":0,"query":"upgrade","source":"core","status":"ok","papers":[{"sourceId":"upgrade-1","title":"Unknown fetch time"}]}]}');
commit;
