begin;
set local role service_role;
do $$
declare
 result jsonb; a_old uuid; a_new uuid; n integer;
begin
 -- Two OpenAlex works with their own DOIs, as stored before the provider changed one of them.
 result:=public.ingest_literature_run('{"runKey":"drift-seed","contentHash":"1111111111111111111111111111111111111111111111111111111111111111","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","papers":[
   {"sourceId":"https://openalex.org/W9000000001","title":"Drifting work","doi":"10.99999/old"},
   {"sourceId":"https://openalex.org/W9000000002","title":"Canonical work","doi":"10.99999/new"},
   {"sourceId":"https://openalex.org/W9000000003","title":"Renamed work","doi":"10.99999/before"}]}]}');
 if (result->>'identifierConflicts')::integer<>0 then raise exception 'clean import reported conflicts'; end if;
 select id into a_old from public.literature_article where doi='10.99999/old';
 select id into a_new from public.literature_article where doi='10.99999/new';

 -- W1 now reports W2's DOI, and W3 a DOI nobody holds: the run is saved instead of aborting.
 result:=public.ingest_literature_run('{"runKey":"drift","contentHash":"2222222222222222222222222222222222222222222222222222222222222222","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","papers":[
   {"sourceId":"https://openalex.org/W9000000001","title":"Drifting work","doi":"10.99999/new"},
   {"sourceId":"https://openalex.org/W9000000003","title":"Renamed work","doi":"10.99999/after"}]}]}');
 if result->>'replayed'<>'false' or (result->>'hits')::integer<>2 or (result->>'identifierConflicts')::integer<>2 then
   raise exception 'drifted import not saved: %',result; end if;
 if (select article_id from public.literature_source_record where source='openalex' and source_id='https://openalex.org/W9000000001') is distinct from a_new
   then raise exception 'drifted record not moved to the article holding its DOI'; end if;
 if (select doi from public.literature_article where id=a_old) is distinct from '10.99999/old'
   then raise exception 'earlier article changed or removed'; end if;
 if (select a.doi from public.literature_source_record s join public.literature_article a on a.id=s.article_id
     where s.source='openalex' and s.source_id='https://openalex.org/W9000000003') is distinct from '10.99999/after'
   or (select count(*) from public.literature_article where doi='10.99999/before')<>1
   then raise exception 'record with an unclaimed new DOI not given its own article'; end if;
 if (select count(*) from public.literature_hit h join public.literature_search s on s.id=h.search_id
     join public.literature_run r on r.id=s.run_id where r.run_key='drift')<>2 then raise exception 'hits missing'; end if;
 result:=public.ingest_literature_run('{"runKey":"drift","contentHash":"2222222222222222222222222222222222222222222222222222222222222222","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","papers":[
   {"sourceId":"https://openalex.org/W9000000001","title":"Drifting work","doi":"10.99999/new"},
   {"sourceId":"https://openalex.org/W9000000003","title":"Renamed work","doi":"10.99999/after"}]}]}');
 if result->>'replayed'<>'true' then raise exception 'replay not detected'; end if;

 -- A DOI held by one article and an arXiv ID held by another: linked to the DOI's article, nothing merged.
 perform public.ingest_literature_run('{"runKey":"bridge-seed","contentHash":"3333333333333333333333333333333333333333333333333333333333333333","searches":[
   {"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"drift-core","title":"DOI side","doi":"10.99999/doi-side"}]},
   {"queryIndex":0,"query":"AI","source":"arxiv","status":"ok","papers":[{"sourceId":"http://arxiv.org/abs/2699.00001v1","title":"arXiv side","doi":"10.99999/other-doi","arxivId":"2699.00001"}]}]}');
 select count(*) into n from public.literature_article where doi in ('10.99999/doi-side','10.99999/other-doi');
 result:=public.ingest_literature_run('{"runKey":"bridge-conflict","contentHash":"4444444444444444444444444444444444444444444444444444444444444444","searches":[{"queryIndex":0,"query":"AI","source":"semantic-scholar","status":"ok","papers":[
   {"sourceId":"drift-s2","title":"Both","doi":"10.99999/doi-side","arxivId":"2699.00001"}]}]}');
 if (result->>'identifierConflicts')::integer<>1 or n<>2
   or (select count(*) from public.literature_article where doi in ('10.99999/doi-side','10.99999/other-doi'))<>2
   or (select a.doi from public.literature_source_record s join public.literature_article a on a.id=s.article_id
       where s.source='semantic-scholar' and s.source_id='drift-s2') is distinct from '10.99999/doi-side'
   or (select arxiv_id from public.literature_article where doi='10.99999/doi-side') is not null
   then raise exception 'conflicting bridge merged or misplaced: %',result; end if;

 -- A consistent bridge still merges.
 perform public.ingest_literature_run('{"runKey":"merge-seed","contentHash":"5555555555555555555555555555555555555555555555555555555555555555","searches":[
   {"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"merge-core","title":"Same","doi":"10.99999/merge"}]},
   {"queryIndex":0,"query":"AI","source":"arxiv","status":"ok","papers":[{"sourceId":"http://arxiv.org/abs/2699.00002v1","title":"Same","arxivId":"2699.00002"}]}]}');
 result:=public.ingest_literature_run('{"runKey":"merge","contentHash":"6666666666666666666666666666666666666666666666666666666666666666","searches":[{"queryIndex":0,"query":"AI","source":"semantic-scholar","status":"ok","papers":[
   {"sourceId":"merge-s2","title":"Same","doi":"10.99999/merge","arxivId":"2699.00002"}]}]}');
 if (result->>'identifierConflicts')::integer<>0
   or (select count(*) from public.literature_article where doi='10.99999/merge' or arxiv_id='2699.00002')<>1
   then raise exception 'consistent bridge not merged'; end if;

 -- An out-of-order recovery import of an older observation keeps its hit but does not move the link back.
 perform public.ingest_literature_run('{"runKey":"fresh-seed","contentHash":"8888888888888888888888888888888888888888888888888888888888888888","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","fetchedAt":"2026-11-01T12:00:00Z","papers":[
   {"sourceId":"https://openalex.org/W9000000010","title":"Older identity","doi":"10.99999/fresh-a"},
   {"sourceId":"https://openalex.org/W9000000011","title":"Other work","doi":"10.99999/fresh-b"}]}]}');
 result:=public.ingest_literature_run('{"runKey":"fresh-newer","contentHash":"9999999999999999999999999999999999999999999999999999999999999999","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","fetchedAt":"2026-11-10T12:00:00Z","papers":[
   {"sourceId":"https://openalex.org/W9000000010","title":"Newer identity","doi":"10.99999/fresh-b"}]}]}');
 if (select a.doi from public.literature_source_record s join public.literature_article a on a.id=s.article_id
     where s.source='openalex' and s.source_id='https://openalex.org/W9000000010') is distinct from '10.99999/fresh-b'
   then raise exception 'newer observation did not move the link'; end if;
 result:=public.ingest_literature_run('{"runKey":"fresh-older-recovery","contentHash":"aaaa999999999999999999999999999999999999999999999999999999999999","searches":[{"queryIndex":0,"query":"AI","source":"openalex","status":"ok","fetchedAt":"2026-11-05T12:00:00Z","papers":[
   {"sourceId":"https://openalex.org/W9000000010","title":"Older identity","doi":"10.99999/fresh-a"}]}]}');
 if (result->>'hits')::integer<>1 then raise exception 'older observation hit not retained'; end if;
 if (select a.doi from public.literature_source_record s join public.literature_article a on a.id=s.article_id
     where s.source='openalex' and s.source_id='https://openalex.org/W9000000010') is distinct from '10.99999/fresh-b'
   or (select metadata->>'doi' from public.literature_source_record where source='openalex' and source_id='https://openalex.org/W9000000010') is distinct from '10.99999/fresh-b'
   then raise exception 'older recovery import moved the link back'; end if;

 -- Invalid input still rolls back the whole import.
 begin
   perform public.ingest_literature_run('{"runKey":"drift-fulltext","contentHash":"7777777777777777777777777777777777777777777777777777777777777777","searches":[{"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"drift-new","title":"Ok"},{"sourceId":"drift-bad","title":"Bad","fullText":"x"}]}]}');
   raise exception 'invalid import accepted';
 exception when others then
   if sqlerrm<>'invalid_literature_paper' then raise; end if;
 end;
 if exists(select 1 from public.literature_run where run_key='drift-fulltext') then raise exception 'rollback failed'; end if;
 if has_function_privilege('anon','public.ingest_literature_run(jsonb)','execute')
   or not has_function_privilege('service_role','public.ingest_literature_run(jsonb)','execute') then raise exception 'privileges changed'; end if;
end;
$$;
rollback;
