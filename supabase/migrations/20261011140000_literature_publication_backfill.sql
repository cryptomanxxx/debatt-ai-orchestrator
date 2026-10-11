-- Repair missing canonical publication fields using retained source/history evidence.
begin;
select pg_advisory_xact_lock(20261011,1315);

-- Session-local validator: strict ISO syntax plus PostgreSQL calendar validation.
create or replace function pg_temp.literature_valid_publication(value text)
returns boolean language plpgsql stable strict set search_path = pg_catalog as $$
begin
  if length(value)>50 or value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|[+-][0-9]{2}:[0-5][0-9]))?$'
  then return false; end if;
  begin
    perform value::timestamptz;
  exception when data_exception then
    return false;
  end;
  return true;
end;
$$;

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
      and pg_temp.literature_valid_publication(metadata->>'published')
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
drop function pg_temp.literature_valid_publication(text);
commit;
