begin;
set local role service_role;
do $$
declare
 p jsonb; result jsonb; n integer;
begin
 p:='{"runKey":"first","contentHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","searches":[
 {"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"1","title":"Same title","doi":"10.1234/a"}]},
 {"queryIndex":0,"query":"AI","source":"arxiv","status":"ok","papers":[{"sourceId":"http://arxiv.org/abs/2610.01234v1","title":"Same title","arxivId":"2610.01234"}]},
 {"queryIndex":0,"query":"AI","source":"semantic-scholar","status":"error","httpStatus":429,"papers":[]}
 ]}';
 result:=public.ingest_literature_run(p);
 if result->>'replayed'<>'false' or (result->>'hits')::integer<>2 then raise exception 'initial import failed'; end if;
 result:=public.ingest_literature_run(p);
 if result->>'replayed'<>'true' then raise exception 'replay not detected'; end if;
 if (select count(*) from public.literature_run)<>1 or (select count(*) from public.literature_article)<>2 then raise exception 'unexpected duplicates'; end if;
 begin
   perform public.ingest_literature_run(jsonb_set(p,'{contentHash}',to_jsonb(repeat('b',64))));
   raise exception 'changed replay accepted';
 exception when others then
   if sqlerrm<>'literature_run_replay_conflict' then raise; end if;
 end;
 -- Bridge links both existing identities; retain both prior search hits.
 perform public.ingest_literature_run('{"runKey":"bridge","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","searches":[{"queryIndex":0,"query":"AI","source":"semantic-scholar","status":"ok","papers":[{"sourceId":"s1","title":"Bridge","doi":"10.1234/a","arxivId":"2610.01234"}]}]}');
 if (select count(*) from public.literature_article)<>1 or (select count(distinct article_id) from public.literature_source_record)<>1
   or (select count(*) from public.literature_hit)<>3 then raise exception 'bridge reconciliation failed'; end if;
 -- Identical titles alone must not cause a merge. Repeated source IDs retain hit rank.
 perform public.ingest_literature_run('{"runKey":"no-identifiers","contentHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","searches":[{"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"2","title":"Same title"},{"sourceId":"3","title":"Same title"},{"sourceId":"2","title":"Same title revised"}]}]}');
 if (select count(*) from public.literature_article)<>3 or (select count(*) from public.literature_source_record)<>5
   or (select count(*) from public.literature_hit)<>6 then raise exception 'source identity or rank retention failed'; end if;
 if (select metadata->>'title' from public.literature_hit where rank=1 and search_id in (select id from public.literature_search where run_id in (select id from public.literature_run where run_key='no-identifiers')))<>'Same title' then raise exception 'historical metadata changed'; end if;
 -- Any conflict or accidental full text must roll back the entire import.
 for n in 1..2 loop
   begin
     if n=1 then
       perform public.ingest_literature_run('{"runKey":"conflict","contentHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","searches":[{"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"new","title":"Transient"},{"sourceId":"1","title":"Conflict","doi":"10.1234/different"}]}]}');
     else
       perform public.ingest_literature_run('{"runKey":"fulltext","contentHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","searches":[{"queryIndex":0,"query":"AI","source":"core","status":"ok","papers":[{"sourceId":"new","title":"Not allowed","fullText":"do not store"}]}]}');
     end if;
     raise exception 'invalid import accepted';
   exception when others then
     if sqlerrm not in ('literature_identifier_conflict','invalid_literature_paper') then raise; end if;
   end;
 end loop;
 if (select count(*) from public.literature_run)<>3 or (select count(*) from public.literature_hit)<>6 then raise exception 'transaction rollback failed'; end if;
 if has_table_privilege('anon','public.literature_article','select') or has_table_privilege('authenticated','public.literature_hit','insert')
   or has_function_privilege('anon','public.ingest_literature_run(jsonb)','execute') then raise exception 'public access granted'; end if;
 if not has_function_privilege('service_role','public.ingest_literature_run(jsonb)','execute') then raise exception 'backend access missing'; end if;
end;
$$;
rollback;
