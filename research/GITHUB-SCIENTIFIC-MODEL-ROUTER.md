# Scientific Model Router — GitHub Actions v0.1

**GitHub Actions owns the model selection.** This pilot does not call Cloudflare, does not need `ORCHESTRATOR_API_KEY`, and reuses GitHub environment secrets `BLABLADOR_API_KEY` and `HIP_API_KEY` scoped to `research-inference`. It never publishes provider keys or changes the daily research runner.

## Operation

Run **Actions → Scientific Model Router (GitHub-native) → Run workflow**. Choose the task category (`reasoning`, `literature`, `coding`, `fast`) and `auto`, `blablador` or `hip` provider. The router consults its audited fixed priority list, performs live `GET /models` discovery on the **official endpoints already used by this repository**, and selects the first listed allowed model with a configured secret.

The first pilot then sends **one** fixed-category research prompt, requesting at most 512 output tokens, and writes `reports/scientific-model-router/report.json` as a GitHub Actions artifact for 30 days. An unavailable model is skipped before inference. There is **no automatic retry after an inference failure**, preventing silent model changes during a task. Model identification must match the requested model ID, and a successful API call is recorded as *unverified* scientific output.

The offline test suite uses no API keys or network:

```sh
python -m unittest discover -s research -p 'test_scientific_model_router.py'
```

## Design limits

This first version is a **deterministic available-model selector**, not a benchmark-trained scientific ranking or model-independent context-window solution. Priority lists are operator-set hypotheses; no claim that a given model outperforms others. Routing on actual prompt token count, scientific score, costs or published context-window capacities requires verified provider metadata and additional held-out evaluations. The pilot chooses among the named Blablador/HIP models only, does not run arbitrary user-authored code, and does not replace the production daily pipeline.

**Architecture:** GitHub Environment Secrets → scheduled/manual Actions runner → model discovery/selection → selected provider API → report artifact. Cloudflare is not involved in model selection for this pilot.

Before integrating with the daily planner, evaluate candidate models on shared scientific tasks, lock identities for each experimental run, and check available context tokens (including expected output), cost, provider policy and latency. A later version can call the selected provider directly from GitHub-hosted research experiments.

## Environment key migration and verification

The eight HIP/Blablador jobs are restricted to the `main` ref with `if: github.ref == 'refs/heads/main'` and use the `research-inference` environment. Configure its selected branch policy for `main` and set **both** environment secrets before migrating. These code checks complement, but cannot substitute for, repository branch protection and trusted changes on `main`.

**Do not rely on passing tests while identically named repository secrets still exist:** GitHub silently falls back to a repository secret when the environment secret is missing. Keep a secure external backup of both current key values, then after merging, remove the repository-level `HIP_API_KEY` and `BLABLADOR_API_KEY` **before** running the HIP and Blablador connection smoke tests on `main`. If either test fails, restore the environment secret from the secure backup and retry; do not recreate the repository-wide secret. If there is no secure backup, provision/rotate keys at their provider before proceeding. Never include keys in code, logs, artifacts, PRs or comments.
