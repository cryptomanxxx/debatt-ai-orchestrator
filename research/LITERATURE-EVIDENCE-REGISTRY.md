# Evidence registry and research protocol drafts

The manual evidence workflow now saves reusable **abstract-level model interpretations** in `public.literature_evidence_analysis`. The existing literature catalog, abstract archive and immutable planner reports remain separate. The daily collector still makes zero model calls.

## Deployment

1. Apply `supabase/migrations/20261012183000_literature_evidence_registry.sql` once in the **orchestrator** Supabase SQL Editor, after the existing abstract-archive migration. It adds one private immutable table and a backend write RPC; it does not rewrite earlier reports or archived abstracts.
2. Deploy the updated orchestrator Worker using the repository's existing deployment process (`npm run deploy:workers` for `wrangler.jsonc`, or the corresponding BootLoops-bound configuration). The manual workflow now requires the authenticated `GET /v1/model-profile` endpoint and fingerprint-guarded `/v1/query` requests. An old Worker returns 404 at preflight and no paid inference is started. Existing query clients are unaffected.
3. Run **Literature evidence planner (manual)** with a saved collection UUID, a query index and five selected papers. Run it again with the same selections to inspect cache reuse. No new secret or GitHub variable is required.

The first updated run creates new analyses. Previous reports are not automatically backfilled into the registry. The new registry keeps only fully validated findings, including a valid empty findings array. Partial findings remain in their diagnostic report but are not cached, so later runs can retry them.

## Reuse and identity

The cache requires the same archived abstract version, complete serialized prompt hash, analysis contract version and current default-model profile hash. The prompt includes title, instructions, source text and truncation flag. The registry also checks the complete content hash, analyzed prefix hash, prefix length, provider and model. Changed content/version, changed title/instructions or changed model configuration therefore prevents reuse. Cross-source copies remain separate analysis identities even when their abstract blobs are shared.

The authenticated profile endpoint returns provider, model and a fingerprint of the configured provider/model/base URL/token-limit behavior. It returns no API keys or base URL. The workflow reads this profile before analysis. New inference requests carry the expected fingerprint; if configuration changed, the orchestrator rejects them before inference. Returned model/profile identity must match. The inference-profile contract must be incremented if inference behavior changes outside those fields. This identifies configuration, not a cryptographic digest of model weights; unannounced upstream changes behind the same model identifier cannot be detected.

Cached quotations are revalidated against the current supplied abstract prefix before use. The database RPC independently verifies the version/content/prefix hashes and requires quotations and limitation context to occur in that archived prefix. Prefix length is counted in Unicode code points for PostgreSQL; existing report character counts remain JavaScript UTF-16 counts. A matching quotation establishes textual provenance, not entailment or scientific correctness.

Analyses have no time expiration: the archived version is immutable. The abstract loader still rechecks the provider after its 24-hour freshness interval; unchanged text/version can then reuse its analysis. Model/provider failures and malformed responses are not cached. A valid empty interpretation is cached, remains `insufficient_evidence` and does not create a proposal. Cache/database errors fail that paper without silently spending another model call. A failed save excludes that paper from planning; other successfully saved papers survive. Concurrent inserts retain the first stored interpretation and return it rather than overwriting it.

Only the backend role can read the table or execute the RPC. Direct INSERT/UPDATE/DELETE/TRUNCATE and public access are revoked, including grants inherited from Supabase defaults. Source-version foreign keys survive canonical article merges. Database administrators retain their normal administration capabilities.

Each report still gets its own UUID and current search provenance. Paper entries include `analysis.id`, creation time and reuse status; planner citations include the analysis ID and abstract version ID. `analysis_stats` and `budget.model_calls` distinguish reuse from paid inference. Fresh and reused reports reference the same findings without storing another complete abstract.

## Gap review and experiment planning

Remaining limitations with matched context become candidates with stable finding references. Each candidate now has a **not-yet-searched** review task: use the referenced title/claim as search seeds, examine related and subsequent work, check contrary results, and inspect the full paper's assumptions. This release prepares the review tasks; it does not perform those follow-up searches, verify novelty or establish a research gap.

Each heuristic topic proposal now includes a structured experiment **draft**: suggested intervention, baselines, outcomes and controls, plus references to supporting articles. Dataset, sample size, seeds, primary outcome, decision rule and resource budget remain unset. These are transparent design templates, not model-generated bespoke protocols or claims derived from the literature. Drafts are not preregistered, are not execution-ready and are not automatically inserted into the Problem Bank or executed.

Portfolio assessment includes scientific significance, novelty, feasibility, information gain, cost and opportunity cost. Each remains unknown with a specific evidence requirement. Opportunity cost requires comparing competing experiments under the same budget. No fabricated merit score, automatic priority or budget allocation is added.

## Inspect saved analyses

```sql
select a.id, a.created_at, s.article_id, a.abstract_version_id,
       a.model_provider, a.model_name, a.contract_version,
       jsonb_array_length(a.findings) as finding_count
from public.literature_evidence_analysis a
join public.literature_abstract_version v on v.id = a.abstract_version_id
join public.literature_source_record s on s.id = v.source_record_id
order by a.created_at desc
limit 20;

select id, created_at, report->'analysis_stats' as analyses,
       report->'budget' as budget
from public.literature_planner_run
order by created_at desc
limit 10;
```

Next development: execute bounded, logged gap-review searches; assess the retrieved evidence; specify and register one catalog-supported experiment; compare candidate experiments under a measured resource budget. Full-text acquisition remains a separate feature.
