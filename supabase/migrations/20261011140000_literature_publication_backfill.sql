-- Repair missing canonical publication fields using retained source/history evidence.
begin;
select pg_advisory_xact_lock(20261011,1315);

with evidence as (
  select s.article_id,h.metadata
  from public.literature_source_record s
  join public.literature_hit h on h.source_record_id=s.id
  union all
  select s.article_id,s.metadata from public.literature_source_record s
), values_seen as (
  select article_id,
    case when jsonb_typeof(metadata->'year')='number'
      and (metadata->>'year') ~ '^[0-9]{1,4}$'
      then metadata->>'year' end as year_value,
    case when jsonb_typeof(metadata->'published')='string'
      and length(btrim(metadata->>'published')) between 1 and 50
      then metadata->>'published' end as published_value
  from evidence
), recovered as (
  select article_id,
    case when count(distinct year_value)=1 then min(year_value)::integer end as year,
    case when count(distinct published_value)=1 then min(published_value) end as published
  from values_seen group by article_id
)
update public.literature_article a
  set year=coalesce(a.year,r.year),published=coalesce(a.published,r.published)
  from recovered r
  where a.id=r.article_id
    and ((a.year is null and r.year is not null)
      or (a.published is null and r.published is not null));

-- Conflicting historical values remain unresolved; never guess or overwrite known fields.
commit;
