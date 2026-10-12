# Literature evidence planner

This manual, bounded workflow connects Oraklet's persistent literature catalog to the research planner. It reads one saved query, selects up to 5 or 10 canonical articles, fetches available OpenAlex or arXiv abstracts, asks the configured research model to extract methods, reported results and explicit limitations, and persists a report with review-only research candidates. No experiment is executed or registered in the Problem Bank.

## Setup and first run

1. Use the separate **orchestrator** Supabase project. Apply the existing [catalog migrations](LITERATURE-DATABASE.md) if needed, then run `supabase/migrations/20261011180000_literature_planner_reports.sql` once in SQL Editor. It adds an append-only backend report table; existing catalog tables and ingestion functions are unchanged. Then run `supabase/migrations/20261011183000_literature_planner_privileges.sql`. If the report table already exists, run only the latter forward migration; do not rerun table creation. It removes automatic Supabase grants before granting SELECT/INSERT, preserving existing rows.
2. Apply `supabase/migrations/20261012160000_literature_abstract_archive.sql` once before running the updated workflow. It creates the private complete-abstract archive and backend write RPC. The preflight checks both archive tables before provider/model processing.
3. Reuse Actions variable `SUPABASE_URL` and secrets `SUPABASE_SECRET_KEY` and `ORCHESTRATOR_API_KEY`. Optional `OPENALEX_API_KEY` is sent only as a bearer header. The configured orchestrator must return real model responses with the requested 4096 completion-token budget.
4. Open **Actions → Literature evidence planner (manual) → Run workflow → main**. Set a stored literature run UUID, or leave it blank to use the newest imported run. Query index is zero-based (0 is the first query); select 5 papers for the first run.
5. Inspect the step summary and `literature-evidence-report` artifact. Persistent reports are in `public.literature_planner_run`.

For the first catalog run validated on October 11, use `c4cbc9ed-e52a-4ba6-9679-888d47b4bb03`, query index `0` (physics-informed neural networks and turbulence).

```sql
select id, literature_run_id, query_index, created_at,
       report->>'status' as status,
       report->'coverage' as coverage,
       report->'budget' as budget
from public.literature_planner_run
order by created_at desc;
```

Local execution requires credentials in the environment:

```sh
LITERATURE_RUN_ID=c4cbc9ed-e52a-4ba6-9679-888d47b4bb03 \
LITERATURE_QUERY_INDEX=0 LITERATURE_MAX_PAPERS=5 \
node research/run-literature-evidence.mjs
```

## What the report means

The database read embeds searches, immutable hits, current canonical article identifiers and up to 10 linked OpenAlex records in one statement after selecting the run. These lookup identifiers are recorded separately from the historical hit provenance; later DOI/OpenAlex enrichment can therefore resolve an older hit whose snapshot had neither. Articles are deduplicated by those canonical IDs, never by title. Selection uses the lowest source rank, then UUID as a deterministic tie-breaker. Rankings from different providers are not calibrated, so this selection is a bounded sample, not a scientific relevance ranking. The report retains query/provider status, search IDs, source-record IDs and ranks. Persisted hit metadata has no source field: provenance is validated by matching the enclosing search source against the linked source record, including its record ID and provider ID. Tests use metadata produced by the production importer. Missing providers and failed searches are visible.

OpenAlex content lookup uses a linked canonical OpenAlex work ID (ordered by source ID), otherwise a normalized canonical DOI; historical hit identifiers are a fallback. The nested OpenAlex records are filtered and bounded without filtering out articles with no OpenAlex record. Returned IDs must match. If an article lacks an OpenAlex identity and DOI but has a canonical arXiv ID, the loader requests its abstract directly via the arXiv Atom API `id_list` endpoint. Returned article identity must match; the returned version is recorded in the HTTPS content URL. A versionless lookup returns the currently available version, which may differ from the historical hit. Requests are spaced by at least three seconds within each run, including failed attempts. The existing safe XML parser exposes abstract text only in an opt-in evidence mode; metadata-only benchmark/import output is unchanged. CORE and Semantic Scholar contribute discovery metadata; their abstracts are not fetched directly. There is one provider lookup per article, with no fallback after an OpenAlex failure. Missing abstracts or failed lookups remain visible. Full text and PDFs are not fetched. Redirects are rejected, so merged OpenAlex IDs may require a fresh catalog search.

Each model call returns at most three findings: method, reported result or explicit limitation, each with a short exact quotation. A quotation must occur verbatim in the normalized source abstract or supplied prefix. Valid findings are retained individually; invalid findings are excluded from both article evidence and gap candidates. The report stores bounded accepted/rejected counts and rejection indexes/reasons, never rejected claims/quotations or raw model responses. Any rejected finding makes the report partial; an article with only rejected findings remains an error. Malformed top-level output still rejects the entire response. Model identity is recorded even when finding validation fails. The report records provider/model, abstract retrieval time, SHA-256 and content URL. **Quote matching checks textual provenance only; it does not establish that the paraphrase follows from the quote, that the paper is correct or that a result replicates.** Model output remains unverified interpretation. Abstracts can omit critical methods, assumptions and limitations; a truncated prefix can omit additional information and must not be treated as complete abstract analysis.

The planner groups these summaries heuristically and attaches their findings to hypothesis/experiment templates. For each limitation, the model classifies its context as `remaining` (an explicit limitation/future work of the reported study), `prior_work` (an earlier-method obstacle or motivation addressed by the study), or `unclear`. It supplies a second short exact context quotation, validated against the same supplied abstract/prefix. This classification is an **unverified model interpretation**, not an automated semantic judgment. Only `remaining` findings with matched context become **candidates needing full-paper and subsequent-literature review**, never proven research gaps. Prior-work and unclear findings remain on the article and are listed by reference in `limitation_review`, excluded from gap candidates. Legacy three-field limitations default to unclear; missing context never implies an unresolved gap. Gap candidates reference the context quote once stored on the article, avoiding duplication. No absence-of-evidence or novelty claim is inferred from this sample. Significance, novelty, feasibility, information gain, cost and opportunity cost remain `null`; there is no merit ranking or automatic execution. Cross-paper contradiction analysis, free-form experiment generation and portfolio optimization remain future work.

## Storage, budgets and failures

Complete normalized abstracts are now persisted in the private archive before any model call. Content is deduplicated by SHA-256 in `literature_abstract_blob`; provider/source-record/lookup identity, content URL and hash identify a version in `literature_abstract_version`. Identical content shares one blob even across sources. Changed text or arXiv content version URL creates a new version. Re-fetching an unchanged version updates only `last_fetched_at`; its original retrieval timestamp and content remain unchanged. Stable source-record foreign keys allow catalog article merges without losing versions.

The loader reuses a matching cached abstract for 24 hours after the last provider fetch. After expiry it performs one provider lookup; unchanged text does not create another blob/version. Current canonical identity enrichment changes the lookup key and prevents reuse under a different identifier. Cached text, hash and identity are validated. Missing/stale cache is refreshed; archive read/write errors fail that paper before paid inference, rather than silently analyzing unarchived text. Reports and planner citations reference the exact saved version, with content/analysis hashes. `archive_stats` reports new versions, cache reuse and newly stored text bytes (excluding indexes/table overhead).

Reports/artifacts retain summaries, short quotations and version references, rather than another copy of the complete abstract. Raw provider/model responses and full text/PDF are not retained. Model analysis is not cached: each successful selected article still receives at most one model call per manual run. The [daily collector](LITERATURE-COLLECTION.md) gathers metadata and archived abstracts separately without model calls; this analysis workflow remains manual. OpenAlex describes its dataset as CC0, but a full paper's reuse terms are separate. See the official [API overview](https://help.openalex.org/api/), [work attributes](https://help.openalex.org/data/works/attributes/), [singleton lookups](https://help.openalex.org/api/get-single-entities/) and [authentication](https://help.openalex.org/api/authentication/).

At most one provider abstract attempt and one model call per selected article; no automatic retries. The default maximum is 5 model calls, optionally 10, each with a 4096 completion-token budget. Retrieved abstracts are capped at 12,000 characters. The complete serialized model message, including instructions, title and JSON escaping, is capped at the orchestrator’s 8,000-character input limit. Oversized abstracts are shortened to a Unicode-safe prefix, with truncation flags, original/analyzed character counts and separate full/analysis SHA-256 hashes in the report. Findings must quote the supplied prefix, never unseen tail text. A final size guard rejects oversized messages before HTTP. All HTTP responses are bounded. Processing is sequential and HTTP calls time out. Cost in currency is not estimated. Workflow concurrency limits overlapping planner runs; it is manual only.

Individual content/model failures remain visible without erasing successful articles. Reports distinguish `completed`, `partial` and `insufficient_evidence`. `partial` can finish with a green workflow, so inspect coverage. No usable summary yields a failed workflow after saving the diagnostic report. A failed database save also fails the workflow; JSON/Markdown artifacts have already been written and are uploaded with 30-day retention. If setup/read fails before report creation, no report artifact exists.

Every manual run saves a new immutable report, with no cache reuse yet. Database reports have no automatic expiration. JSON article IDs reflect the catalog identity at read time; future reconciliation may change the retained UUID, while preserved source-record IDs continue to identify the evidence. The table intentionally has no article foreign key that would block catalog merges. Only `service_role` can select/insert reports; automatic grants are explicitly revoked from PUBLIC, anon, authenticated and service_role before granting SELECT/INSERT only. UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER are removed even on projects with permissive default ACLs.

The workflow explicitly installs Python 3.11 for safe Atom parsing. arXiv API contract and pacing: [official API manual](https://info.arxiv.org/help/api/user-manual.html).

Tests cover identity deduplication, provenance, failed searches, lookup identity mismatch, forged quotations, partial failures, unknown merit scores, real-model/budget enforcement, backend credentials and report constraints/grants. CI tests the new migration alongside existing catalog reconciliation in PostgreSQL 17.

Reports retain only the lowest-ranked historical observation per provider for each selected article (at most four observations), with total/per-provider hit counts and an explicit truncation flag. Complete observations remain in the persistent literature catalog. Planner evidence references the article's report entry rather than duplicating source hits or findings. Before abstract or model calls, metadata must fit a 100,000-byte pretty-JSON budget and an explicit worst-case completed-report bound must fit 500,000 bytes. That bound charges six JSON bytes per permitted UTF-16 code unit for claims, quotations and model names, both possible finding copies (paper and gap candidate), one additional bounded context quote per limitation, the actual encoded title copy, bounded OpenAlex URLs, and fixed structure/template overhead. Content metadata is whitelisted and bounded. PostgreSQL-incompatible null characters are rejected. A conservative 500,000-byte report check runs before the database POST, and artifacts remain available if persistence fails. Neither limit changes the stored catalog or requires a new SQL migration.

## Inspect the abstract archive

Only the backend role can read these tables or execute `save_literature_abstract`; it cannot directly insert, modify or delete archived content/version rows. The RPC atomically verifies identity and content hash, shares text by hash, and records provenance. Apply the migration in the orchestrator project, not the website project. Existing reports are not backfilled or rewritten.

```sql
select count(*) as unique_abstracts,
       coalesce(sum(byte_count),0) as content_bytes
from public.literature_abstract_blob;

select v.id, s.article_id, v.provider, v.lookup_id, v.source_url,
       v.fetched_at, v.last_fetched_at, b.byte_count, b.abstract_text
from public.literature_abstract_version v
join public.literature_source_record s on s.id=v.source_record_id
join public.literature_abstract_blob b on b.content_hash=v.content_hash
order by v.created_at desc
limit 10;
```
