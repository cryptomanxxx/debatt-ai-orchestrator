begin;
insert into public.literature_article(id,title) values('00000000-0000-4000-8000-000000002000','Analysis fixture');
insert into public.literature_source_record(id,article_id,source,source_id,metadata) values
 ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000002000','openalex','https://openalex.org/W456','{}');
set local role service_role;
do $$ declare a jsonb; p jsonb; r jsonb; again jsonb; body text; finding jsonb; changed jsonb; begin
  body:='We compare estimators against a conventional filter. Validation on real flows remains future work. 😀';
  a:=public.save_literature_abstract(jsonb_build_object('sourceRecordId','00000000-0000-4000-8000-000000002001',
    'provider','openalex','lookupId','https://openalex.org/W456','sourceUrl','https://openalex.org/W456',
    'abstract',body,'contentHash',encode(sha256(convert_to(body,'UTF8')),'hex'),
    'fetchedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  finding:=jsonb_build_object('kind','limitation','claim','Real flow validation remains.',
    'quote','Validation on real flows remains future work.','verification','quote_match_only',
    'limitation_status','remaining','context_quote','Validation on real flows remains future work.',
    'limitation_assessment','unverified_model_interpretation');
  p:=jsonb_build_object('abstract_version_id',a->>'id','content_hash',a->>'contentHash',
    'analyzed_hash',a->>'contentHash','analyzed_characters',length(body),'prompt_hash',repeat('a',64),
    'contract_version','abstract-findings-2','profile_hash',repeat('b',64),
    'model_provider','openai','model_name','test-model','findings',jsonb_build_array(finding));
  r:=public.save_literature_analysis(p);
  again:=public.save_literature_analysis(p);
  if r->>'id'<>again->>'id' or r->>'created_at'<>again->>'created_at' then raise exception 'analysis not reused'; end if;
  changed:=public.save_literature_analysis(p||jsonb_build_object('findings','[]'::jsonb));
  if changed->'findings' <> r->'findings' then raise exception 'existing interpretation overwritten'; end if;
  changed:=public.save_literature_analysis(p||jsonb_build_object('prompt_hash',repeat('c',64)));
  if changed->>'id'=r->>'id' then raise exception 'changed prompt reused'; end if;
  changed:=public.save_literature_analysis(p||jsonb_build_object('profile_hash',repeat('d',64),'model_name','different'));
  if changed->>'id'=r->>'id' then raise exception 'changed model reused'; end if;
  begin perform public.save_literature_analysis(p||jsonb_build_object('content_hash',repeat('e',64)));
    raise exception 'wrong version hash accepted'; exception when others then if sqlerrm='wrong version hash accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('analyzed_hash',repeat('e',64)));
    raise exception 'wrong prefix hash accepted'; exception when others then if sqlerrm='wrong prefix hash accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('analyzed_characters',length(body)+1));
    raise exception 'wrong prefix length accepted'; exception when others then if sqlerrm='wrong prefix length accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('findings',jsonb_build_array(finding||'{"quote":"Invented quotation absent from archived content."}')));
    raise exception 'invented quote accepted'; exception when others then if sqlerrm='invented quote accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('findings',jsonb_build_array(finding||'{"context_quote":null}')));
    raise exception 'remaining without context accepted'; exception when others then if sqlerrm='remaining without context accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('findings',jsonb_build_array(finding||'{"verification":"scientifically_verified"}')));
    raise exception 'false verification accepted'; exception when others then if sqlerrm='false verification accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||jsonb_build_object('findings',jsonb_build_array(finding||'{"extra":"data"}')));
    raise exception 'extra finding field accepted'; exception when others then if sqlerrm='extra finding field accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p-'prompt_hash');
    raise exception 'missing key accepted'; exception when others then if sqlerrm='missing key accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||'{"extra":"data"}');
    raise exception 'extra payload field accepted'; exception when others then if sqlerrm='extra payload field accepted' then raise; end if; end;
  begin perform public.save_literature_analysis(p||'{"model_name":"wrong-model"}');
    raise exception 'key collision accepted'; exception when others then if sqlerrm='key collision accepted' then raise; end if; end;
  if (select count(*) from public.literature_evidence_analysis)<>3 then raise exception 'invalid writes leaked rows'; end if;
  -- A shorter Unicode-safe prefix cannot cite a later sentence.
  begin perform public.save_literature_analysis(p||jsonb_build_object('analyzed_characters',50,
    'analyzed_hash',encode(sha256(convert_to(left(body,50),'UTF8')),'hex'),'prompt_hash',repeat('e',64)));
    raise exception 'unseen tail quote accepted'; exception when others then if sqlerrm='unseen tail quote accepted' then raise; end if; end;
  changed:=public.save_literature_analysis(p||jsonb_build_object('analyzed_characters',50,
    'analyzed_hash',encode(sha256(convert_to(left(body,50),'UTF8')),'hex'),'prompt_hash',repeat('e',64),'findings','[]'::jsonb));
  if changed->'findings'<>'[]'::jsonb then raise exception 'empty analysis not retained'; end if;
  if has_table_privilege('service_role','public.literature_evidence_analysis','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    then raise exception 'direct evidence mutation allowed'; end if;
  begin update public.literature_evidence_analysis set findings='[]';raise exception 'analysis mutable';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.literature_article(id,title) values('00000000-0000-4000-8000-000000002002','Merged identity');
update public.literature_source_record set article_id='00000000-0000-4000-8000-000000002002'
  where id='00000000-0000-4000-8000-000000002001';
delete from public.literature_article where id='00000000-0000-4000-8000-000000002000';
do $$ begin
  if (select count(*) from public.literature_evidence_analysis)<>4 then raise exception 'catalog merge lost analyses'; end if;
  if has_table_privilege('anon','public.literature_evidence_analysis','SELECT')
    or has_table_privilege('authenticated','public.literature_evidence_analysis','SELECT')
    or has_function_privilege('anon','public.save_literature_analysis(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.save_literature_analysis(jsonb)','EXECUTE') then
    raise exception 'public evidence access'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.save_literature_analysis('{}');raise exception 'anonymous analysis access';
    exception when insufficient_privilege then null; end;
end $$;
rollback;
