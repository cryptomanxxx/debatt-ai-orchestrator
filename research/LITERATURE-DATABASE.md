# Oraklet's persistent literature catalog

The manual literature benchmark can retain metadata and search history in the **separate orchestrator Supabase project** used by the Problem Bank. Use that project's existing `SUPABASE_URL` repository variable and `SUPABASE_SECRET_KEY` Actions secret (`sb_secret_...`). Do not use the Debatt-AI website database or its legacy service-role key. This implementation does not create a Supabase project or apply a migration remotely.

## Enable storage

1. Open the orchestrator project's Supabase SQL Editor.
2. Run `supabase/migrations/20261011131500_literature_database.sql` once, then run `supabase/migrations/20261011133000_literature_metadata_preservation.sql`. The first creates five tables and the backend RPC; the second upgrades metadata preservation without recreating tables. If the first migration was already applied, run **only the second**. Existing Problem Bank tables are unaffected.
3. Confirm the repository's `SUPABASE_URL` variable and `SUPABASE_SECRET_KEY` secret refer to this project.
4. Run **Actions → Literature benchmark (manual)** with **persist** enabled (the default). Check the persistence step and inspect the `literature_*` tables in Supabase Table Editor.

If setup is incomplete, turn **persist** off for a JSON-only benchmark. Enabled persistence fails visibly on missing configuration, schema or import errors. The JSON artifact is still uploaded with its existing 14-day retention; database rows have no automatic expiration.

## Data model

| Table | Purpose |
| --- | --- |
| `literature_article` | Canonical article UUID, title, normalized DOI, versionless arXiv ID, publication year/date when supplied, first/last observation |
| `literature_source_record` | Provider and provider record ID, article reference, latest whitelisted metadata, metadata fetch time, first/last import time |
| `literature_run` | Unique import key, content hash, GitHub run link and import time |
| `literature_search` | Run, query/index, source, success/error, fetch time, attempts, HTTP status and latency |
| `literature_hit` | Search, one-based rank, source record and immutable metadata snapshot |

Missing publication dates remain null rather than being inferred from a year. Each source's link lives in its metadata and historical hit snapshots. Fetch time lives on each search and `literature_source_record.metadata_fetched_at`; import time is distinct. Newer dated observations update current source metadata. Older observations remain in hit snapshots and cannot replace newer current metadata. Unknown fetch times cannot overwrite dated metadata; when neither observation has a date, import order is used. Equal fetch times use the latest import. `first_seen`/`last_seen` are import timestamps, not provider fetch timestamps. The upgrade restores a uniquely newest dated snapshot from existing history. If the newest fetch times tie, or all times are unknown, it preserves current metadata rather than guessing import order from UUIDs. A tied timestamp is assigned only when the retained current metadata exactly matches a snapshot at that time. Failed provider requests are saved as searches with no hits, preserving the difference between an error and a successful empty response.

DOI and arXiv IDs are unique article identities; arXiv versions share one article. A known provider record can enrich an existing article. A later record containing both DOI and arXiv ID reconciles previously separate records if their identifiers are compatible, retaining any known publication year/date from the merged records. Contradictory identifiers stop the entire import for investigation; nothing is partially saved. Equal or similar titles do not merge articles. Title-match suggestions and manual review tooling are future work.

Source metadata can change between searches. Updating a source record never rewrites historical hit metadata or rank, including repeated hits for the same source ID. An advisory transaction lock serializes catalog imports to protect reconciliation.

## Retry or import a saved report

One RPC commits the whole run. Reimporting the same run key and payload returns the existing run ID without duplicates; a different payload under that key fails. Actions keys include repository, run ID **and attempt**, so a fresh workflow rerun is a new observation. Retrying a database write for the same saved report is idempotent.

For a local metadata report, set credentials in your environment (never commit them), then:

```sh
LITERATURE_RUN_KEY=local:experiment-001 node research/literature-database.mjs /tmp/literature-benchmark.json
```

The importer requires the report's paper arrays; older aggregate-only artifacts cannot reconstruct lost hits. It stores only selected metadata, never abstracts, full text, arbitrary provider errors, credentials or raw responses. This catalog does not yet serve as an API cache or track Oraklet analysis completion.

## Backend access and verification

All five tables enable RLS and revoke access from `anon` and `authenticated`. Only the backend `service_role` can access them or execute `ingest_literature_run`. The new secret key is sent only in the `apikey` header. Do not expose it in a browser.

CI runs the migration and `tests-literature-sql/catalog.sql` against PostgreSQL 17, testing reconciliation, replay conflicts, historical snapshots, rollback and privileges. Node tests cover payload validation, normalization, metadata filtering and RPC behavior. Read-only example (Supabase SQL Editor):

```sql
select s.query, s.source, s.status, h.rank,
       h.metadata->>'title' as title, a.doi, a.arxiv_id,
       h.metadata->>'sourceUrl' as source_url, s.fetched_at
from public.literature_search s
left join public.literature_hit h on h.search_id = s.id
left join public.literature_source_record r on r.id = h.source_record_id
left join public.literature_article a on a.id = r.article_id
order by s.fetched_at desc nulls last, s.query_index, s.source, h.rank;
```
