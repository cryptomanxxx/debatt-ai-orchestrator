# Scientific Model Router — Cloudflare-backed GitHub Action

The manual [Scientific Model Router workflow](../.github/workflows/scientific-model-router.yml) uses only the GitHub `ORCHESTRATOR_API_KEY` secret to authenticate against the fixed Cloudflare Worker. HIP and Blablador provider API keys are stored **only in Cloudflare Worker secrets**. Do not configure HIP_API_KEY or BLABLADOR_API_KEY to run this workflow.

## Operation

Run Actions → Scientific Model Router → Run workflow on `main`. Choose one of `reasoning`, `literature`, `coding`, `fast` and provider `auto`, `blablador` or `hip`.

GitHub reads `GET /v1/research/models` through the authenticated Worker, chooses one fixed allowlisted model listed in the current catalog and sends a bounded `POST /v1/research/inference` request. Cloudflare, not GitHub, talks to provider endpoints. It writes `reports/scientific-model-router/report.json` to a 30-day artifact. A successful call produces `completed_unverified`, **not** scientific evidence or proof of backend model identity. There is no automatic fallback after an inference failure.

Validation: `node --test tests-research/worker-research-client.test.mjs`.

## Guardrails and migration

The workflow stays manual and restricted to `main`; it does not alter Oraklet's scheduled research pipeline. Keep the `research-inference` GitHub Environment and its branch/approval protections while reviewing whether they are still needed. `ORCHESTRATOR_API_KEY` must remain available to the job.

No GitHub workflow reads HIP_API_KEY or BLABLADOR_API_KEY any more: every HIP/Blablador workflow (scientific router, SymPy pilot, provider comparison, Blablador benchmarks v1–v3, HIP scientific benchmark, Worker smoke test and model discovery) goes through the Cloudflare Worker. After one successful Cloudflare-backed run of the smoke test and the HIP scientific benchmark, remove HIP_API_KEY and BLABLADOR_API_KEY at both repository and Environment scopes, if present. Do not delete the Environment itself merely to remove secrets. `GET /models` success proves catalog access, **not** successful inference. Blablador `alias-*` IDs fail strict returned-model-ID verification; use explicit IDs from the discovery summary.
