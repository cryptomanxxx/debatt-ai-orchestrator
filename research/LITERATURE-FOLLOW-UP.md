# Bounded literature follow-up

**Literature follow-up (manual)** retrieves related-work leads for one candidate in an explicitly selected, saved evidence report. It makes no model calls and executes no experiments. It does not establish novelty, unresolved gaps, contradictions or scientific correctness.

## Setup and first run

1. After merging, apply `supabase/migrations/20261012200000_literature_follow_up.sql` in the **orchestrator** Supabase SQL Editor. The earlier planner migrations must exist. It creates a private append-only backend report table; no existing reports are changed.
2. Open Actions → **Literature follow-up (manual)** → Run workflow on `main`.
3. Enter the evidence **report UUID**, not the collection UUID, and the exact candidate ID shown in that report. For the completed October 12 validation run: `planner_report_id=6f14d7f6-de91-4c84-8dc7-169798dccd69`, `candidate_id=arp-fluid-state-estimation`.

Existing Supabase and provider credentials are reused; no Worker deployment or new secret is required. Missing table, missing report or invalid candidate fails before provider searches.

## Bounds and provenance

The runner derives at most two deterministic keyword queries. When an eligible limitation is present, it uses its claim and the reported response/context; ambiguous proposed responses take precedence over remaining limitations. Otherwise it uses the candidate's question and first evidence paper's title. The bounded method vocabulary currently recognizes PINNs, Kalman filters, symbolic regression and neural operators. It combines a method anchor with up to three problem terms, removes narrative wording and expands PINN in the solution query. Each query is capped at 200 characters. This is an initial heuristic; truncated terms, unknown methods and provider-specific matching can miss relevant work. It works even when a report has no remaining-limitation candidates.

For the measurement-alignment fixture the queries are `pinn misaligned velocity measurements` and `transformation embedded physics informed neural networks`. Other domains use the same bounded term extraction with recognized method anchors where available; this is not universal scientific terminology extraction.

## Origin tracking and analysis selection

Each new follow-up report stores the originating candidate's evidence identities and the title-anchor policy. Every source hit is marked `confirmed_origin`, `possible_origin_title` or `not_matched_to_origin`. Canonical UUID, normalized DOI/arXiv or matching namespaced provider IDs confirm an origin match. Normalized exact titles only flag possible duplicates; they do not establish identity. Unmatched records are not thereby independent evidence. Existing catalog reconciliation handles repeated DOI/arXiv identities.

To use this policy for abstract analysis, supply the new follow-up **report UUID** in **Literature evidence planner (manual) → follow_up_report_id**, select query index 0 or 1, and choose the paper budget. The linked literature run is read automatically; leave `literature_run_id` blank or supply the same linked run. A conflicting run/query fails before model inference. Older follow-up reports without quality context must be rerun first.

All canonical hits are reviewed before applying the paper budget, so a useful lower-ranked hit can outrank irrelevant first-ranked hits. Confirmed origin articles are excluded from the analysis budget, retained in the catalog and counted in the report. Possible title copies remain eligible with a warning. Title matches receive two heuristic points for a recognized method phrase and one for any problem/solution token, then ties use source rank and canonical UUID. Per-paper reports show the exact matched anchors and label this as title overlap, not semantic relevance, scientific merit, novelty or independence. Low-overlap records remain eligible after higher-overlap records, so limited metadata can still lead to weak selections.

Passing only `literature_run_id` retains the original source-rank selection for ordinary collection runs. No new SQL migration, model call or Worker deployment is needed for query generation and origin tracking; abstract analysis remains a separate model-consuming workflow.

To investigate an exact limitation, optionally provide **both** `limitation_article_id` and `limitation_finding_index` (0–2). The article must be cited by the selected candidate, and the indexed finding must be a limitation. The report records that exact finding reference. For the October 12 follow-up analysis use report `49fbb385-9742-4253-b400-61c5f97cfdac`, candidate `arp-fluid-state-estimation`, article `130e1819-2d32-4324-b5eb-f88effc634b2`, finding `2`. The derived solution query includes transformation-embedded PINNs rather than only repeating the general estimator question.

The planner conservatively excludes a model-labelled remaining limitation when its exact quotation/context contains selected English response cues (for example “leading to the proposal of” or “to correct”). It records the original model label and a review reason. This does **not** assert that the response succeeded: adequacy and residual limitations require review. The cue guard only sees the quoted context; responses elsewhere or differently worded can escape it, and ambiguous wording can exclude a valid residual limitation. The extraction prompt therefore also asks the model to inspect the entire supplied abstract prefix. A changed prompt hash prevents reuse of interpretations from the older prompt. Existing analyses and reports remain immutable; no new SQL migration is required.

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
