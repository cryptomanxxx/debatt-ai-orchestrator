# Bounded literature follow-up

**Literature follow-up (manual)** retrieves related-work leads for one candidate in an explicitly selected, saved evidence report. It makes no model calls and executes no experiments. It does not establish novelty, unresolved gaps, contradictions or scientific correctness.

## Setup and first run

1. After merging, apply `supabase/migrations/20261012200000_literature_follow_up.sql` in the **orchestrator** Supabase SQL Editor. The earlier planner migrations must exist. It creates a private append-only backend report table; no existing reports are changed.
2. Open Actions → **Literature follow-up (manual)** → Run workflow on `main`.
3. Enter the evidence **report UUID**, not the collection UUID, and the exact candidate ID shown in that report. For the completed October 12 validation run: `planner_report_id=6f14d7f6-de91-4c84-8dc7-169798dccd69`, `candidate_id=arp-fluid-state-estimation`.

Existing Supabase and provider credentials are reused; no Worker deployment or new secret is required. Missing table, missing report or invalid candidate fails before provider searches.

## Bounds and provenance

The runner derives at most two deterministic keyword queries: one from the candidate's question and one from its first evidence paper's title. It removes punctuation/common stop words, retains at most twelve distinct terms per seed and caps each query at 200 characters. This is an initial heuristic; truncated terms and provider-specific matching can miss relevant work. It works even when a report has no remaining-limitation candidates.

Each query searches OpenAlex, Semantic Scholar, CORE and arXiv for up to ten retained records per source: at most 80 metadata records and 16 search attempts including one retry per search. Calls are sequential with three-second provider pacing and retry backoff capped at five seconds. Semantic Scholar uses bulk keyword search sorted by publication date; it retains only the first ten results and never follows pagination. The existing providers enforce their request timeouts. The workflow has a 15-minute timeout and shares the collectors' concurrency group.

Search metadata, rankings, dates, identities, timestamps and provider failures are imported using the existing catalog RPC. A new `literature_follow_up_run` report binds that imported run UUID to the exact parent report and candidate. The report also stores the derived queries and provider search methods. A database import failure stops the run; a failed linking save can leave an imported catalog run and a recovery artifact, without deleting earlier data. Rerunning makes a new search run rather than claiming cached searches are fresh.

The workflow artifact `literature-follow-up-report` contains JSON and Markdown, retained for 30 days. Successful persisted reports remain in Supabase. All-source failure is saved as `failed` then fails the job; individual failures yield `partial`. Zero results from a successful source remains a successful search, never proof of an unresolved gap. Provider error text is removed from reports. No abstract/full text/PDF collection occurs here.

To inspect linked reports:

```sql
select id, parent_report_id, candidate_id, literature_run_id,
       created_at, report->>'status' as status
from public.literature_follow_up_run
order by created_at desc
limit 20;
```

The returned `literature_run_id` can be explicitly passed to **Literature evidence planner (manual)** with `query_index=0` or `1` to analyze retrieved abstracts. Those are indices of the follow-up queries, not the original five daily queries. Always pass explicit run IDs when comparing reports: the planner's blank-ID default uses the newest import, which may now be a follow-up run.

The next stage is to assess these leads against the precise proposed intervention, baselines and remaining limitations, and then specify a preregistered experiment. Portfolio scores and novelty remain unknown in this release.
