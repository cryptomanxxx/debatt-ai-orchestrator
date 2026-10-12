# One-start literature research pipeline

Open Actions → **Oraklet research pipeline (manual)** → Run workflow → `main`.
Choose only a **research area** and the **maximum model calls** (5 or 10). No internal report or collection UUID is needed. Existing standalone workflows remain available for diagnostics.

## Execution and budget

The pipeline runs the existing operations sequentially in one job:

1. Check follow-up storage.
2. Search one selected predefined research query, persist metadata and archive/reuse at most ten selected abstracts.
3. Analyze initial abstracts and save the evidence report.
4. Choose an existing evidence-backed candidate, preferring existing limitation review tasks then stable ID. This is a heuristic agenda choice, not scientific merit ranking.
5. Run the bounded follow-up search and save its report and exact parent/candidate references.
6. Read both saved follow-up queries using the same database reader and canonical article grouping as final evidence. Count eligible canonical articles after the same provider-title precedence and origin exclusion rules, choose the query with the most (ties choose the first), pass its report UUID automatically and analyze eligible abstracts. This metadata-only selection makes no model calls. Database failures stop the chain before final inference; raw per-provider titles are not scored separately.

The total model-call budget is statically split: 5 → at most 3 initial + 2 follow-up calls; 10 → 5 + 5. Cache reuse can reduce actual calls; unused quota is not reassigned. Each call keeps the existing 4096-token completion limit. No automatic model retries or experiments are enabled. Provider searches retain existing pacing/retry bounds. The workflow has a 45-minute timeout and shares the collector/follow-up concurrency group. Manual evidence runs outside this chain have separate budgets.

No new SQL migration, secret or Worker deployment is required. The existing follow-up, planner and analysis-registry migrations must have been applied. Collection defaults and the daily schedule are unchanged; the pipeline explicitly supplies a single research-area query and uses query index 0 for the initial evidence.

## Strict follow-up eligibility

Before model inference, a new lead must match a recognized method phrase in its title **and** at least two distinct terms across the combined problem/solution vocabulary. The threshold drops to one only when the entire combined vocabulary contains a single unique term; repeated terms are counted once. Confirmed origin records remain excluded; title-only copies are flagged rather than confirmed. Method-only or problem-only hits stay in the catalog and search report, but receive no follow-up model calls. This is a conservative title rule: relevant papers with uninformative titles can be missed, and eligible titles still require scientific review.

When none qualify, the evidence report uses its existing database-compatible `insufficient_evidence` status with `selection_review.outcome=insufficient_relevant_hits`. The pipeline summary exposes `insufficient_relevant_hits` and exits successfully with zero follow-up model calls. A stopped search is not proof of novelty or absence of related work. If initial analysis yields no usable candidate, the chain stops at `insufficient_evidence`.

Eligible canonical records without an OpenAlex work ID, DOI or usable arXiv identity are skipped before the analysis budget. The identifier check also honors DOI/OpenAlex fallback identities on retained source observations, as the existing loader does. Remaining records prioritize loader-compatible identifiers, new leads over possible title copies, then provider abstract signals, title score and source rank. An abstract signal is only metadata; it does not guarantee that a provider will return text. If strong title leads exist but none have usable identifiers, the separate `insufficient_abstract_identifiers` outcome explains why no analysis was attempted.

## Finding validation diagnostics

New evidence reports retain specific rejection codes and aggregate `validation_stats.rejections_by_reason`: unsupported finding fields/kind, invalid claim, quote/context type, bounds, null character, non-exact quote or whitespace-only variation. Diagnostics contain only controlled codes and indices, not rejected model text or complete abstracts. Valid findings retain the existing registry schema and cache behavior; rejected/partial interpretations remain uncached.

Whitespace-only variation is diagnosed by comparing normalized whitespace, but it is still rejected. There is no fuzzy matching, punctuation substitution, number correction, quote repair or additional model retry. Quotes must remain exact contiguous excerpts. Older reports stored a generic code and cannot retrospectively reveal the precise cause; the next live run will supply that evidence. No new SQL migration is needed.

## Reports and failures

The single `research-pipeline-report` artifact contains separate collection, initial evidence, follow-up and final evidence folders plus `pipeline.json`/`pipeline.md`. It is retained for 30 days. Each completed operation also persists its usual immutable data in Supabase; report links remain traceable after artifact expiry. The aggregate pipeline checkpoint itself is an artifact, not a new database table.

The summary records stage status, IDs, reserved quotas and known completed model calls. Provider or database failures stop subsequent stages; completed data are retained. If an in-flight model stage fails before returning its receipt, its actual calls are labelled unknown, bounded by its reserved quota. Never interpret the known completed count as the full actual count in that situation. A rerun starts a new chain and may reuse archived abstracts/analyses; it does not resume the failed stage automatically.

This first release has a manual start for the full chain. It does not add a schedule or claim validated autonomous gap discovery, portfolio assessment or experiment design.
