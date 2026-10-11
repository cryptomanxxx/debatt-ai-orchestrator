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
 -- Force publication metadata onto the article that UUID ordering will discard.
 update public.literature_article set year=2026,published='2026-10-01'
   where id=(select id from public.literature_article order by id desc limit 1);
 -- Bridge links both existing identities; retain both prior search hits.
 perform public.ingest_literature_run('{"runKey":"bridge","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","searches":[{"queryIndex":0,"query":"AI","source":"semantic-scholar","status":"ok","papers":[{"sourceId":"s1","title":"Bridge","doi":"10.1234/a","arxivId":"2610.01234"}]}]}');
 if (select count(*) from public.literature_article)<>1 or (select count(distinct article_id) from public.literature_source_record)<>1
   or (select count(*) from public.literature_hit)<>3 then raise exception 'bridge reconciliation failed'; end if;
 if (select year from public.literature_article) is distinct from 2026
   or (select published from public.literature_article) is distinct from '2026-10-01' then raise exception 'bridge lost publication metadata'; end if;
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
do $$
declare p jsonb;
begin
 p:='{"runKey":"newest","contentHash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","searches":[{"queryIndex":0,"query":"AI","source":"core","status":"ok","fetchedAt":"2026-10-10T12:00:00Z","papers":[{"sourceId":"1","title":"Newest metadata"}]}]}';
 perform public.ingest_literature_run(p);
 p:=jsonb_set(p,'{runKey}',to_jsonb('older-recovery'::text));
 p:=jsonb_set(p,'{searches,0,fetchedAt}',to_jsonb('2026-10-01T12:00:00Z'::text));
 p:=jsonb_set(p,'{searches,0,papers,0,title}',to_jsonb('Older metadata'::text));
 perform public.ingest_literature_run(p);
 p:=jsonb_set(p,'{runKey}',to_jsonb('unknown-recovery'::text));
 p:=p #- '{searches,0,fetchedAt}';
 perform public.ingest_literature_run(p);
 if (select metadata->>'title' from public.literature_source_record where source='core' and source_id='1') is distinct from 'Newest metadata'
   or (select metadata_fetched_at from public.literature_source_record where source='core' and source_id='1') is distinct from '2026-10-10T12:00:00Z'::timestamptz then
   raise exception 'older or unknown observation overwrote newer metadata';
 end if;
 if (select h.metadata->>'title' from public.literature_hit h join public.literature_search s on s.id=h.search_id join public.literature_run r on r.id=s.run_id where r.run_key='older-recovery') is distinct from 'Older metadata' then raise exception 'older recovery snapshot not retained'; end if;
 p:=jsonb_set(p,'{runKey}',to_jsonb('later-observation'::text));
 p:=jsonb_set(p,'{searches,0,fetchedAt}',to_jsonb('2026-10-11T12:00:00Z'::text));
 p:=jsonb_set(p,'{searches,0,papers,0,title}',to_jsonb('Later metadata'::text));
 perform public.ingest_literature_run(p);
 if (select metadata->>'title' from public.literature_source_record where source='core' and source_id='1') is distinct from 'Later metadata' then raise exception 'newer observation not applied'; end if;
end;
$$;
rollback;
