# Daily literature collection

The collector refreshes the five predefined research questions, saves metadata/search history to the orchestrator catalog, and archives complete normalized abstracts for a bounded selection. It makes **zero model calls** and does not generate hypotheses, execute experiments or fetch full text/PDF files.

## Schedule and setup

`.github/workflows/literature-collection.yml` runs on the default branch every day at **08:17 UTC**. GitHub schedules may be delayed; this is an intended daily trigger, not an exact-time guarantee. Once merged, the schedule is active. It can also be started under **Actions → Daily literature collection → Run workflow → main**, with a maximum of 5, 10, 25 or 50 selected articles (default 50).

Use the separate orchestrator Supabase project and the already configured `SUPABASE_URL` variable and `SUPABASE_SECRET_KEY` secret. Catalog and abstract-archive migrations must already be applied. **No new SQL migration or secret is required for this collector.** It reuses `CORE_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_API_KEY` if configured. Missing/expired keys and source rate limits are reflected in the source status rather than silently treated as zero results. The workflow does not receive an orchestrator/model API key.

The workflow shares the `literature-benchmark-live` concurrency group with the manual metadata benchmark, so those two collectors do not overlap. It does not cancel an already running collector. Python 3.11 is installed for safe arXiv Atom parsing.

## Collection bounds

The queries are the existing `DEFAULT_QUERIES` in `research/literature-benchmark.mjs`:

- physics informed neural networks turbulence
- active learning scientific experiment design
- Kalman filter neural state estimation
- causal inference machine learning
- mixture of experts model evaluation

Each query retains at most 10 metadata records from each of OpenAlex, Semantic Scholar, CORE and arXiv: at most 200 retained records across 20 searches. Semantic Scholar uses its documented `/paper/search/bulk` keyword endpoint, sorted by `publicationDate:desc`, with an optional API key. One response can contain up to 1,000 records; only the first local sample of 10 is normalized/retained, and its pagination token is never followed. Responses are capped at 5 MB. This mode is not relevance ranking; all terms must match under Semantic Scholar's keyword/English-stemming rules. The ordinary manual benchmark continues to use relevance search by default. There is at most one retry per search (40 search attempts maximum), with existing provider pacing and a maximum five-second retry backoff. Search ranking remains provider-specific; arXiv uses its existing recent-submission ordering. This is repeated monitoring of a bounded sample, not an exhaustive feed of all new scientific publications.

The normalized benchmark sample is imported atomically before abstract collection. `searches.json` records source-level `retrievalMethod` plus `sourceMethods`, and the collection JSON/Markdown labels the bulk method. The persistent catalog run key contains `s2-bulk-date-desc`, preserving the configured Semantic Scholar mode even after artifact expiration; the catalog search schema is unchanged. The collector then reads at most 10 canonical articles per query using the existing lowest-source-rank/UUID selection. It deduplicates article UUIDs across those queries and considers at most 50 unique articles overall, including unavailable/error outcomes. It may collect fewer than 50; it does not fill missing slots with unrestricted searches.

Abstracts are read through the existing archive: matching entries fetched less than 24 hours ago are reused. Otherwise at most one provider abstract request is started per selected article, using canonical OpenAlex identity/DOI or an arXiv ID for a DOI-less preprint. There are no abstract retries or fallback after an OpenAlex failure. The provider-fetch phase waits three seconds before its first provider call, and the arXiv loader maintains three-second spacing thereafter. Content is persisted before being marked available; identical text does not add another content blob.

A 20-minute work budget stops starting new query/article work; the job has a 30-minute timeout. A request already running can finish after the work-budget boundary. Each completed article writes a progress checkpoint. Interrupted runs may leave archived content and imported metadata; inspect the most recent checkpoint and database for recovery. A GitHub retry creates a new search run; abstract blobs/versions remain deduplicated.

## Results and failure behavior

The `literature-collection-report` artifact contains `searches.json` (metadata/provider statuses), `collection.json` and a Markdown summary, retained for 30 days. Metadata, search history and archived abstracts remain in Supabase independently of artifact retention. Full abstracts are not copied into collection artifacts.

The collection report includes the saved catalog run UUID, run key and source methods, successful/failed search counts, selected/available/unavailable/error abstract counts, cache reuse, newly inserted versions, new text bytes and provider abstract attempts. New text bytes exclude database indexes, metadata and table overhead. Model calls are always zero.

A `partial` run can be green: it means usable content was archived or reused, but a source/query/article failed, content was missing or the work budget expired. An `insufficient_content` run has no usable abstract and fails after writing its report. Setup/import failures fail the run with a bounded diagnostic; if setup validation fails before report creation, there may be no artifact. Earlier successfully archived articles are not erased by a later failure. The collector never analyzes scientific merit or claims that a sample contains verified research gaps.

To analyze the newly saved query later, start **Literature evidence planner (manual)** and enter the `literature_run_id` from the collection report, a query index (0–4) and a five-article budget. That is a separate model-consuming action.


Semantic Scholar bulk API contract: [official tutorial](https://www.semanticscholar.org/product/api/tutorial) and [Graph API schema](https://api.semanticscholar.org/graph/v1/swagger.json). Bulk can still return rate-limit errors; these remain failed searches rather than zero-paper successes. Receiving an API key later does not require a code change: it is already passed in the header when configured.
