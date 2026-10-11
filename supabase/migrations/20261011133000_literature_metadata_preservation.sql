-- Upgrade an existing literature catalog without recreating tables or losing history.
begin;
select pg_advisory_xact_lock(20261011,1315);
alter table public.literature_source_record
  add column if not exists metadata_fetched_at timestamptz;

-- Recover the newest known snapshot if reports were imported out of order.
-- Timestamped observations take precedence over unknown fetch times.
with newest as (
  select distinct on (h.source_record_id) h.source_record_id,h.metadata,s.fetched_at
  from public.literature_hit h
  join public.literature_search s on s.id=h.search_id
  join public.literature_run r on r.id=s.run_id
  order by h.source_record_id,s.fetched_at desc nulls last,r.ingested_at desc,h.rank desc,s.id
)
update public.literature_source_record current_record
  set metadata=newest.metadata,metadata_fetched_at=newest.fetched_at
  from newest where current_record.id=newest.source_record_id;

create or replace function public.ingest_literature_run(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  run_id uuid; search_id uuid; article_id uuid; source_record_id uuid;
  existing_hash text; item jsonb; paper jsonb; candidate_ids uuid[]; other_id uuid;
  kept public.literature_article; other public.literature_article;
  doi_value text; arxiv_value text; hit_count integer := 0; rank_value integer;
begin
  if jsonb_typeof(p_payload->'searches') is distinct from 'array'
    or jsonb_array_length(p_payload->'searches') not between 1 and 80
    or length(p_payload->>'runKey') not between 1 and 200
    or (p_payload->>'contentHash') !~ '^[a-f0-9]{64}$'
    or p_payload->>'runKey' is null or p_payload->>'contentHash' is null then
    raise exception 'invalid_literature_payload';
  end if;
  -- Serialize catalog reconciliation and replay checks within this transaction.
  perform pg_advisory_xact_lock(20261011,1315);
  select r.id,r.content_hash into run_id,existing_hash from public.literature_run r where r.run_key=p_payload->>'runKey';
  if found then
    if existing_hash<>p_payload->>'contentHash' then raise exception 'literature_run_replay_conflict'; end if;
    return jsonb_build_object('runId',run_id,'replayed',true);
  end if;
  insert into public.literature_run(run_key,content_hash,origin_url)
    values(p_payload->>'runKey',p_payload->>'contentHash',p_payload->>'originUrl') returning id into run_id;
  for item in select value from jsonb_array_elements(p_payload->'searches') loop
    if item->>'source' not in ('openalex','semantic-scholar','core','arxiv')
      or item->>'source' is null or item->>'status' not in ('ok','error') or item->>'status' is null
      or length(item->>'query') not between 1 and 200 or item->>'query' is null
      or jsonb_typeof(item->'papers') is distinct from 'array'
      or jsonb_array_length(item->'papers')>100 then raise exception 'invalid_literature_search'; end if;
    insert into public.literature_search(run_id,query_index,query,source,status,fetched_at,attempts,http_status,latency_ms)
      values(run_id,(item->>'queryIndex')::integer,item->>'query',item->>'source',item->>'status',
        (item->>'fetchedAt')::timestamptz,(item->>'attempts')::integer,(item->>'httpStatus')::integer,(item->>'latencyMs')::integer)
      returning id into search_id;
    rank_value:=0;
    for paper in select value from jsonb_array_elements(item->'papers') loop
      if item->>'status'<>'ok' or length(paper->>'title') not between 1 and 1000
        or paper->>'title' is null or length(paper->>'sourceId') not between 1 and 500
        or paper->>'sourceId' is null
        or exists(select 1 from jsonb_object_keys(paper) k where k not in
          ('title','sourceId','sourceUrl','doi','arxivId','year','published','updated','hasAbstract','hasOpenAccessSignal'))
        then raise exception 'invalid_literature_paper'; end if;
      doi_value:=nullif(paper->>'doi',''); arxiv_value:=nullif(paper->>'arxivId','');
      if doi_value is not null and (doi_value !~ '^10\.[0-9]{4,9}/[^[:space:]]+$' or doi_value<>lower(doi_value))
        then raise exception 'invalid_literature_doi'; end if;
      if arxiv_value is not null and arxiv_value !~ '^([0-9]{4}\.[0-9]{4,5}|[a-z-]+(\.[A-Z]{2})?/[0-9]{7})$'
        then raise exception 'invalid_literature_arxiv_id'; end if;
      select array_agg(distinct a.id order by a.id) into candidate_ids from public.literature_article a
        where (doi_value is not null and a.doi=doi_value) or (arxiv_value is not null and a.arxiv_id=arxiv_value)
        or a.id in (select s.article_id from public.literature_source_record s
          where s.source=item->>'source' and s.source_id=paper->>'sourceId');
      if candidate_ids is null then
        insert into public.literature_article(doi,arxiv_id,title,year,published)
          values(doi_value,arxiv_value,paper->>'title',(paper->>'year')::integer,paper->>'published') returning id into article_id;
      else
        article_id:=candidate_ids[1];
        select * into kept from public.literature_article where id=article_id;
        if (kept.doi is not null and doi_value is not null and kept.doi<>doi_value)
          or (kept.arxiv_id is not null and arxiv_value is not null and kept.arxiv_id<>arxiv_value)
          then raise exception 'literature_identifier_conflict'; end if;
        -- A newly observed DOI/arXiv bridge can reconcile previously separate records.
        foreach other_id in array candidate_ids[2:array_length(candidate_ids,1)] loop
          select * into other from public.literature_article where id=other_id;
          if (coalesce(kept.doi,doi_value) is not null and other.doi is not null and coalesce(kept.doi,doi_value)<>other.doi)
            or (coalesce(kept.arxiv_id,arxiv_value) is not null and other.arxiv_id is not null and coalesce(kept.arxiv_id,arxiv_value)<>other.arxiv_id)
            then raise exception 'literature_identifier_conflict'; end if;
          update public.literature_source_record s set article_id=kept.id where s.article_id=other_id;
          delete from public.literature_article where id=other_id;
          kept.doi:=coalesce(kept.doi,other.doi); kept.arxiv_id:=coalesce(kept.arxiv_id,other.arxiv_id);
          kept.first_seen:=least(kept.first_seen,other.first_seen);
          kept.year:=coalesce(kept.year,other.year);
          kept.published:=coalesce(kept.published,other.published);
        end loop;
        update public.literature_article set doi=coalesce(kept.doi,doi_value),arxiv_id=coalesce(kept.arxiv_id,arxiv_value),
          year=coalesce(kept.year,(paper->>'year')::integer),published=coalesce(kept.published,paper->>'published'),
          first_seen=kept.first_seen,last_seen=now() where id=article_id;
      end if;
      insert into public.literature_source_record as current_record(article_id,source,source_id,metadata,metadata_fetched_at)
        values(article_id,item->>'source',paper->>'sourceId',paper,(item->>'fetchedAt')::timestamptz)
        on conflict(source,source_id) do update set
          metadata=case
            when (excluded.metadata_fetched_at is not null and
              (current_record.metadata_fetched_at is null or excluded.metadata_fetched_at>=current_record.metadata_fetched_at))
              or (excluded.metadata_fetched_at is null and current_record.metadata_fetched_at is null)
            then excluded.metadata else current_record.metadata end,
          metadata_fetched_at=greatest(current_record.metadata_fetched_at,excluded.metadata_fetched_at),
          last_seen=now()
        returning id into source_record_id;
      rank_value:=rank_value+1; hit_count:=hit_count+1;
      insert into public.literature_hit(search_id,rank,source_record_id,metadata)
        values(search_id,rank_value,source_record_id,paper);
    end loop;
  end loop;
  return jsonb_build_object('runId',run_id,'replayed',false,'hits',hit_count);
end;
$$;

revoke all on function public.ingest_literature_run(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_literature_run(jsonb) to service_role;
commit;
