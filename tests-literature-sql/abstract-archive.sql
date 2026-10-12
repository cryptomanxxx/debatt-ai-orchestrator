begin;
insert into public.literature_article(id,title,doi,arxiv_id) values
 ('00000000-0000-4000-8000-000000001000','Archive fixture','10.1234/archive','2610.01234');
insert into public.literature_source_record(id,article_id,source,source_id,metadata) values
 ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001000','openalex','https://openalex.org/W123','{}'),
 ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001000','arxiv','http://arxiv.org/abs/2610.01234v1','{}');
set local role service_role;
do $$ declare p jsonb; a jsonb; b jsonb; c jsonb; body text; begin
  body := 'Complete normalized scientific abstract, long enough for the archive fixture: 水 😀.';
  p:=jsonb_build_object('sourceRecordId','00000000-0000-4000-8000-000000001001','provider','openalex',
    'lookupId','https://openalex.org/W123','sourceUrl','https://openalex.org/W123','abstract',body,
    'contentHash',encode(sha256(convert_to(body,'UTF8')),'hex'),'fetchedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  a:=public.save_literature_abstract(p);
  if a->>'insertedBlob'<>'true' or a->>'insertedVersion'<>'true' then raise exception 'first insert failed'; end if;
  b:=public.save_literature_abstract(p);
  if a->>'id'<>b->>'id' or b->>'insertedBlob'<>'false' or b->>'insertedVersion'<>'false' then raise exception 'replay not deduplicated'; end if;
  c:=public.save_literature_abstract(p||jsonb_build_object('sourceRecordId','00000000-0000-4000-8000-000000001002',
    'provider','arxiv','lookupId','2610.01234','sourceUrl','https://arxiv.org/abs/2610.01234v1'));
  if c->>'insertedBlob'<>'false' or c->>'insertedVersion'<>'true' then raise exception 'shared content not deduplicated'; end if;
  body:=body||' New results.';
  c:=public.save_literature_abstract(p||jsonb_build_object('abstract',body,'contentHash',encode(sha256(convert_to(body,'UTF8')),'hex')));
  if c->>'id'=a->>'id' then raise exception 'changed text erased old version'; end if;
  if (select count(*) from public.literature_abstract_blob)<>2 or (select count(*) from public.literature_abstract_version)<>3 then
    raise exception 'incorrect archive counts'; end if;
  if not exists(select 1 from public.literature_abstract_blob where content_hash=a->>'contentHash' and abstract_text=p->>'abstract') then
    raise exception 'original text not retained'; end if;
  begin perform public.save_literature_abstract(p||'{"contentHash":"bad"}');raise exception 'bad hash accepted';
    exception when others then if sqlerrm='bad hash accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p||'{"sourceUrl":"https://evil.invalid/secret"}');raise exception 'bad URL accepted';
    exception when others then if sqlerrm='bad URL accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p||'{"lookupId":"https://openalex.org/W999"}');raise exception 'wrong lookup accepted';
    exception when others then if sqlerrm='wrong lookup accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p||'{"sourceRecordId":"00000000-0000-4000-8000-000000009999"}');raise exception 'unknown source accepted';
    exception when others then if sqlerrm='unknown source accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p||'{"fetchedAt":"2099-01-01T00:00:00Z"}');raise exception 'future timestamp accepted';
    exception when others then if sqlerrm='future timestamp accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p-'abstract');raise exception 'missing text accepted';
    exception when others then if sqlerrm='missing text accepted' then raise; end if; end;
  begin perform public.save_literature_abstract(p||'{"extra":"field"}');raise exception 'extra field accepted';
    exception when others then if sqlerrm='extra field accepted' then raise; end if; end;
  if (select count(*) from public.literature_abstract_blob)<>2 then raise exception 'invalid write leaked rows'; end if;
  if has_table_privilege('service_role','public.literature_abstract_blob','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('service_role','public.literature_abstract_version','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    then raise exception 'direct mutations allowed'; end if;
  begin update public.literature_abstract_blob set abstract_text=abstract_text;
    raise exception 'text mutable'; exception when insufficient_privilege then null; end;
  begin delete from public.literature_abstract_version;
    raise exception 'version deletable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Simulate the catalog merge: only source records move; archived versions stay valid.
insert into public.literature_article(id,title) values('00000000-0000-4000-8000-000000001003','Kept identity');
update public.literature_source_record set article_id='00000000-0000-4000-8000-000000001003'
  where article_id='00000000-0000-4000-8000-000000001000';
delete from public.literature_article where id='00000000-0000-4000-8000-000000001000';
do $$ begin
  if (select count(*) from public.literature_abstract_version)<>3 then raise exception 'merge lost versions'; end if;
  if has_table_privilege('anon','public.literature_abstract_blob','SELECT')
    or has_table_privilege('authenticated','public.literature_abstract_version','SELECT')
    or has_function_privilege('anon','public.save_literature_abstract(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.save_literature_abstract(jsonb)','EXECUTE')
    then raise exception 'public archive access'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.save_literature_abstract('{}');raise exception 'anonymous RPC access';
    exception when insufficient_privilege then null; end;
end $$;
rollback;
