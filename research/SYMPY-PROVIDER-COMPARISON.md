# Matched HIP/Blablador SymPy comparison (manual only)

This workflow runs the **existing independently verified SymPy research pilot** twice, with the *same seed*, once per provider in separate GitHub Actions matrix jobs. It does not replace the daily experiment runner, alter its Cloudflare model, write to Supabase, or update public research reports.

## How to run

Actions → **Compare HIP and Blablador on verified SymPy cases** → Run workflow → `main`. Supply a one-to-nine-digit seed. Both jobs use the locked `research-inference` Environment, only on `main`, with repository read-only permissions. The branch rules and secrets must already be configured. No custom URLs, prompts, model IDs, code, or shell arguments are accepted.

Each provider uses its own allowlisted priority profile from `router_select.py`. Discovery checks listed API model IDs before inference. The scientific runner requests at most **three completion calls** with **768 output tokens each** per provider, at most six calls total if both succeed, plus model discovery. No automatic retry and no cross-provider fallback. The workflow produces **separate 30-day artifacts** so one provider's failure does not suppress the other's report.

## Interpreting results

Compare `report.json` artifacts by `seed`, `selected.provider`, `selected.model`, `scientificStatus`, individual controls and verifier results. A green GitHub job means the process ran; it does **not** by itself imply that the model answered correctly. An API model alias can change backend without notice, and `backendIdentityVerified: false` records that limitation. Identical seeds ensure matched synthetic problem generation, **not** scientific reproducibility of an immutable model or statistically conclusive performance. Avoid ranking providers on three cases.

**Next milestone (separate PR, not in this one):** introduce an explicitly opt-in adapter in the daily lab, with a provider-specific Environment-scoped job, a tested fallback policy, model-identity handling, strict budgets, and report provenance. Preserve Cloudflare as the scheduled default until the adapter has been validated and reviewed.
