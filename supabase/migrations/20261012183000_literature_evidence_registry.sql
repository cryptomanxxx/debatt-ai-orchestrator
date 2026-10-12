-- Immutable, source-version-bound model interpretations. No public read/write access.
begin;
create table public.literature_evidence_analysis (
  id uuid primary key default gen_random_uuid(),
  abstract_version_id uuid not null references public.literature_abstract_version(id),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  analyzed_hash text not null check (analyzed_hash ~ '^[a-f0-9]{64}$'),
  analyzed_characters integer not null check (analyzed_characters between 1 and 12000),
  prompt_hash text not null check (prompt_hash ~ '^[a-f0-9]{64}$'),
  contract_version text not null check (contract_version = 'abstract-findings-2'),
  profile_hash text not null check (profile_hash ~ '^[a-f0-9]{64}$'),
  model_provider text not null check (length(model_provider) between 1 and 200),
  model_name text not null check (length(model_name) between 1 and 200),
  findings jsonb not null check ((jsonb_typeof(findings) = 'array'
    and jsonb_array_length(findings) between 0 and 3 and octet_length(findings::text) <= 24000) is true),
  created_at timestamptz not null default now(),
  unique (abstract_version_id,prompt_hash,contract_version,profile_hash)
);
alter table public.literature_evidence_analysis enable row level security;
revoke all on public.literature_evidence_analysis from public,anon,authenticated,service_role;
grant select on public.literature_evidence_analysis to service_role;

create function public.save_literature_analysis(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog,public as $$
declare
  v public.literature_abstract_version;
  r public.literature_evidence_analysis;
  body text;
  analyzed text;
  f jsonb;
  field text;
  n integer;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_analysis_payload'; end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 10
    or not p_payload ?& array['abstract_version_id','content_hash','analyzed_hash','analyzed_characters',
      'prompt_hash','contract_version','profile_hash','model_provider','model_name','findings'] then
    raise exception 'invalid_analysis_payload';
  end if;
  foreach field in array array['abstract_version_id','content_hash','analyzed_hash','prompt_hash',
    'contract_version','profile_hash','model_provider','model_name'] loop
    if jsonb_typeof(p_payload->field) is distinct from 'string' then raise exception 'invalid_analysis_payload'; end if;
  end loop;
  if jsonb_typeof(p_payload->'analyzed_characters') is distinct from 'number'
    or (p_payload->>'analyzed_characters') !~ '^[0-9]{1,5}$'
    or (p_payload->>'content_hash') !~ '^[a-f0-9]{64}$'
    or (p_payload->>'analyzed_hash') !~ '^[a-f0-9]{64}$'
    or (p_payload->>'prompt_hash') !~ '^[a-f0-9]{64}$'
    or (p_payload->>'profile_hash') !~ '^[a-f0-9]{64}$'
    or p_payload->>'contract_version' <> 'abstract-findings-2'
    or length(p_payload->>'model_provider') not between 1 and 200
    or length(p_payload->>'model_name') not between 1 and 200
    or jsonb_typeof(p_payload->'findings') is distinct from 'array' then
    raise exception 'invalid_analysis_payload';
  end if;
  if jsonb_array_length(p_payload->'findings') > 3
    or octet_length((p_payload->'findings')::text) > 24000 then raise exception 'invalid_analysis_payload'; end if;
  select * into v from public.literature_abstract_version where id=(p_payload->>'abstract_version_id')::uuid;
  if not found or v.content_hash <> p_payload->>'content_hash' then raise exception 'analysis_version_mismatch'; end if;
  select abstract_text into body from public.literature_abstract_blob where content_hash=v.content_hash;
  n:=(p_payload->>'analyzed_characters')::integer;
  if n < 1 or n > length(body) then raise exception 'analysis_prefix_mismatch'; end if;
  analyzed:=left(body,n);
  if encode(sha256(convert_to(analyzed,'UTF8')),'hex') <> p_payload->>'analyzed_hash' then
    raise exception 'analysis_prefix_mismatch';
  end if;
  for f in select value from jsonb_array_elements(p_payload->'findings') loop
    if jsonb_typeof(f) is distinct from 'object' then raise exception 'invalid_analysis_finding'; end if;
    if not f ?& array['kind','claim','quote','verification'] then raise exception 'invalid_analysis_finding'; end if;
    foreach field in array array['kind','claim','quote','verification'] loop
      if jsonb_typeof(f->field) is distinct from 'string' then raise exception 'invalid_analysis_finding'; end if;
    end loop;
    if f->>'kind' not in ('method','result','limitation') or f->>'verification' <> 'quote_match_only'
      or length(btrim(f->>'claim')) not between 1 and 500
      or length(btrim(f->>'quote')) not between 20 and 280
      or length(f->>'quote') > 280 or strpos(analyzed,f->>'quote') = 0 then
      raise exception 'invalid_analysis_finding';
    end if;
    if f->>'kind' = 'limitation' then
      if (select count(*) from jsonb_object_keys(f)) <> 7
        or not f ?& array['limitation_status','context_quote','limitation_assessment']
        or jsonb_typeof(f->'limitation_status') is distinct from 'string'
        or f->>'limitation_status' not in ('remaining','prior_work','unclear')
        or f->>'limitation_assessment' is distinct from 'unverified_model_interpretation' then
        raise exception 'invalid_analysis_finding';
      end if;
      if f->'context_quote' = 'null'::jsonb then
        if f->>'limitation_status' <> 'unclear' then raise exception 'invalid_analysis_finding'; end if;
      elsif jsonb_typeof(f->'context_quote') is distinct from 'string'
        or length(btrim(f->>'context_quote')) not between 20 and 280
        or length(f->>'context_quote') > 280 or strpos(analyzed,f->>'context_quote') = 0 then
        raise exception 'invalid_analysis_finding';
      end if;
    elsif (select count(*) from jsonb_object_keys(f)) <> 4 then raise exception 'invalid_analysis_finding';
    end if;
  end loop;
  insert into public.literature_evidence_analysis(abstract_version_id,content_hash,analyzed_hash,analyzed_characters,
    prompt_hash,contract_version,profile_hash,model_provider,model_name,findings)
  values(v.id,v.content_hash,p_payload->>'analyzed_hash',n,p_payload->>'prompt_hash',p_payload->>'contract_version',
    p_payload->>'profile_hash',p_payload->>'model_provider',p_payload->>'model_name',p_payload->'findings')
  on conflict (abstract_version_id,prompt_hash,contract_version,profile_hash) do nothing;
  select * into r from public.literature_evidence_analysis where abstract_version_id=v.id
    and prompt_hash=p_payload->>'prompt_hash' and contract_version=p_payload->>'contract_version'
    and profile_hash=p_payload->>'profile_hash';
  if r.content_hash <> v.content_hash or r.analyzed_hash <> p_payload->>'analyzed_hash'
    or r.analyzed_characters <> n or r.model_provider <> p_payload->>'model_provider'
    or r.model_name <> p_payload->>'model_name' then raise exception 'analysis_key_collision'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.save_literature_analysis(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_literature_analysis(jsonb) to service_role;
commit;
