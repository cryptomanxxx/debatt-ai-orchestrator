# Oraklet's daily literature research

**Oraklets dagliga litteraturforskning** (`.github/workflows/oraklet-literature-day.yml`) runs every day at **09:41 UTC** without anyone starting it. Professor Oraklet uses the literature tools himself and reports what he read and found in [`ai-bus/`](../ai-bus/README.md).

## Fields

The day's field alternates by UTC date:

| Field | Search query |
| --- | --- |
| AI for scientific discovery | `AI agents scientific discovery` |
| Causal inference | `causal inference machine learning` |

`AI for scientific discovery` is also a research area in the manual pipeline and the dashboard. The follow-up vocabulary now recognises AI-agent methods. The planner has a `causal-inference` theme, so causal-inference candidates map to the `dowhy-backdoor` catalog experiment.

## What runs, in order

1. **Research pipeline** (`research-pipeline.mjs`), with 10 model calls:
   - it collects metadata and up to ten abstracts for the field;
   - it analyses up to five abstracts with quote-checked findings;
   - it picks a candidate and searches related work;
   - it analyses up to five more abstracts from the follow-up.
2. **Research Tree Search** (`research-tree-planner.mjs`), an agentic tree search over the day's evidence report. It turns the candidate into a review queue: the candidate, a replication design and a falsification design. It makes no model calls.
3. **Citation-graph novelty check** (`citation-novelty.mjs`), a bounded agentic tree search over later OpenAlex works that cite the candidate's sources. It lists possible overlaps. It makes no model calls.
4. **Automatic Problem Bank registration.** Literature proposals that point to an automatic catalog experiment are registered with the same fingerprinted problem identity as the manual `problem-bank-create` workflow. The daily lab is then offered them as open problems. A retired version is reported as retired, never as registered. Proposals for manual-only experiments are listed in ai-bus as waiting for approval. Every Problem Bank request times out after 15 seconds.
5. **The lab's last 24 hours.** Up to 20 saved lab reports from `oraklet_experiment` (pass counts and the bare-baseline comparison) are read for the report. When more runs were saved, the report says it lists the latest 20.
6. **ai-bus report.**
   - `ai-bus/ÅÅÅÅ-MM-DD.md` and `ai-bus/senaste.md` are committed to `main`, using the model-menu app that is already allowed to push there. Only a run of `main` publishes, and the commit contains only the report on top of the latest `main`.
   - `reports/literature-day/day.json` and all tool reports go to the run artifact.

A stage that fails is recorded in the day's report and the remaining stages still run. The run is then marked failed after the report has been committed.

## What the report claims

Every number comes from saved reports, not from a model's own summary. Model and literature text is rendered as inert text. Candidates, the review queue and novelty leads are leads for further review: no hypothesis is verified and no discovery is claimed. Oraklet reads abstracts only, at most about ten a day within the current budget.

## Setup

- No new secret or migration is needed. The workflow reuses `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORCHESTRATOR_API_KEY`, the optional literature API keys, and `MODEL_MENU_APP_CLIENT_ID` / `MODEL_MENU_APP_PRIVATE_KEY` for the push to `main`.
- It has its own concurrency group. GitHub keeps only one pending run per group, so sharing the collector's group could replace a pending manual pipeline run. Provider pacing and retries cover an occasional overlap with the collector.

## Next steps

- Read far more per day with the free HIP/Blablador models: batched triage of all new papers in the fields, then structured extraction for the relevant ones.
- A claim registry across papers, to find contradictions and gaps.
