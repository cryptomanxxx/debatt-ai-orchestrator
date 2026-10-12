-- Complete normalized abstracts, deduplicated by content, with stable source provenance.
-- Apply once before enabling the updated manual evidence workflow.
begin;
create table public.literature_abstract_blob (
  content_hash text primary key check (content_hash ~ '^[a-f0-9]{64}$'),
  abstract_text text not null check (length(abstract_text) between 40 and 12000),
  byte_count integer not null check (byte_count = octet_length(abstract_text)),
  created_at timestamptz not null default now(),
  check (content_hash = encode(sha256(convert_to(abstract_text,'UTF8')),'hex'))
);
create table public.literature_abstract_version (
  id uuid primary key default gen_random_uuid(),
  source_record_id uuid not null references public.literature_source_record(id),
  provider text not null check (provider in ('openalex','arxiv')),
  lookup_id text not null check (length(lookup_id) between 1 and 500),
  source_url text not null check (length(source_url) between 1 and 512),
  content_hash text not null references public.literature_abstract_blob(content_hash),
  fetched_at timestamptz not null,
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source_record_id,provider,lookup_id,source_url,content_hash)
);
create index on public.literature_abstract_version(source_record_id,provider,lookup_id,last_fetched_at desc);
alter table public.literature_abstract_blob enable row level security;
alter table public.literature_abstract_version enable row level security;
revoke all on public.literature_abstract_blob,public.literature_abstract_version from public,anon,authenticated,service_role;
grant select on public.literature_abstract_blob,public.literature_abstract_version to service_role;

create function public.save_literature_abstract(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  source_row public.literature_source_record;
  article_row public.literature_article;
  version_row public.literature_abstract_version;
  provider_value text := p_payload->>'provider';
  lookup_value text := p_payload->>'lookupId';
  url_value text := p_payload->>'sourceUrl';
  text_value text := p_payload->>'abstract';
  hash_value text := p_payload->>'contentHash';
  fetched_value timestamptz;
  inserted_blob boolean;
  inserted_version boolean;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_payload))<>7
    or exists(select 1 from jsonb_object_keys(p_payload) k where jsonb_typeof(p_payload->k) is distinct from 'string' or k not in
      ('sourceRecordId','provider','lookupId','sourceUrl','abstract','contentHash','fetchedAt'))
    or not ((provider_value in ('openalex','arxiv') and length(lookup_value) between 1 and 500
      and length(url_value) between 1 and 512 and length(text_value) between 40 and 12000
      and hash_value = encode(sha256(convert_to(text_value,'UTF8')),'hex')
      and public.literature_valid_time(p_payload->>'fetchedAt',true)) is true)
    then raise exception 'invalid_abstract_payload'; end if;
  fetched_value := (p_payload->>'fetchedAt')::timestamptz;
  if fetched_value > now()+interval '5 minutes' then raise exception 'invalid_abstract_timestamp'; end if;
  -- Coordinate identity checks with catalog reconciliation. Source records survive merges.
  perform pg_advisory_xact_lock(20261011,1315);
  select * into source_row from public.literature_source_record where id=(p_payload->>'sourceRecordId')::uuid;
  if not found then raise exception 'abstract_source_not_found'; end if;
  select * into article_row from public.literature_article where id=source_row.article_id;
  if provider_value='openalex' then
    if url_value !~ '^https://openalex[.]org/W[0-9]+$' or not (
      (lookup_value ~ '^https://openalex[.]org/W[0-9]+$' and source_row.source='openalex'
        and source_row.source_id=lookup_value and url_value=lookup_value)
      or (lookup_value=article_row.doi and lookup_value ~ '^10[.][0-9]{4,9}/[^[:space:]]+$')
    ) is true then raise exception 'abstract_identity_mismatch'; end if;
  else
    if lookup_value is distinct from article_row.arxiv_id
      or lookup_value !~ '^([0-9]{4}[.][0-9]{4,5}|[a-z-]+([.][A-Z]{2})?/[0-9]{7})$'
      or not (url_value='https://arxiv.org/abs/'||lookup_value
        or (left(url_value,length('https://arxiv.org/abs/'||lookup_value||'v'))='https://arxiv.org/abs/'||lookup_value||'v'
          and substring(url_value from length('https://arxiv.org/abs/'||lookup_value||'v')+1) ~ '^[0-9]+$'))
      then raise exception 'abstract_identity_mismatch'; end if;
  end if;
  insert into public.literature_abstract_blob(content_hash,abstract_text,byte_count)
    values(hash_value,text_value,octet_length(text_value)) on conflict do nothing;
  inserted_blob := found;
  -- Detect a hash collision rather than silently substituting another text.
  if not exists(select 1 from public.literature_abstract_blob where content_hash=hash_value and abstract_text=text_value)
    then raise exception 'abstract_hash_conflict'; end if;
  insert into public.literature_abstract_version(source_record_id,provider,lookup_id,source_url,content_hash,fetched_at)
    values(source_row.id,provider_value,lookup_value,url_value,hash_value,fetched_value)
    on conflict do nothing returning * into version_row;
  inserted_version := found;
  if not inserted_version then
    update public.literature_abstract_version set last_fetched_at=clock_timestamp()
      where source_record_id=source_row.id and provider=provider_value and lookup_id=lookup_value
        and source_url=url_value and content_hash=hash_value returning * into version_row;
  end if;
  return jsonb_build_object('id',version_row.id,'contentHash',hash_value,'sourceRecordId',source_row.id,
    'provider',provider_value,'lookupId',lookup_value,'sourceUrl',url_value,
    'fetchedAt',version_row.fetched_at,'lastFetchedAt',version_row.last_fetched_at,
    'insertedBlob',inserted_blob,'insertedVersion',inserted_version,'byteCount',octet_length(text_value));
end;
$$;
revoke all on function public.save_literature_abstract(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_literature_abstract(jsonb) to service_role;
commit;
