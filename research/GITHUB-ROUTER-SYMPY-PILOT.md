# GitHub Router + Professor Oraklet verified SymPy pilot

The manual [GitHub Router + SymPy workflow](../.github/workflows/github-router-sympy-pilot.yml) and [HIP/Blablador comparison matrix](../.github/workflows/sympy-provider-comparison.yml) now use the fixed Cloudflare Worker. GitHub Actions needs only `ORCHESTRATOR_API_KEY`; HIP_API_KEY and BLABLADOR_API_KEY stay in Cloudflare Worker secrets, **not** GitHub Actions.

## Execution

Run either workflow on `main`. For the pilot, choose `auto`, `hip` or `blablador` and a one-to-nine-digit deterministic seed. The comparison workflow runs both providers with the same seed and stores separate artifacts. Both use authenticated `GET /v1/research/models` and bounded `POST /v1/research/inference` via Cloudflare, checking a fixed model allowlist and fail-closed model identity.

The original `runSympyExperiment` still produces three seeded synthetic quadratic cases (two, one or no distinct real roots), commits the case fixtures before AI proposals, and verifies answers against locked SymPy Python tooling, the independent BigInt oracle, and positive and negative controls. Complete and partial reports remain in GitHub Actions artifacts for 30 days. Scientific failure of a valid proposed answer is distinct from an inference/transport/workflow error.

## Limits and validation

Provider aliases may change backend; a matching API model ID does not prove immutable model identity, so `backendIdentityVerified` remains false. The Cloudflare endpoint is a constrained text inference API, **not** an OpenAI-compatible multi-turn session: the SymPy runner serializes its two messages to one user prompt, and the Worker currently limits prompt length to 4000 characters and generation to 512 tokens. This difference must be evaluated in end-to-end smoke tests. A previous Blablador completion produced `research_response_model_mismatch`; no unknown backend identity is silently accepted.

Validation: `node --test tests-research/github-router-sympy-pilot.test.mjs tests-research/worker-research-client.test.mjs`. Workflow additionally installs pinned SymPy packages for scientific verification. The existing directly authenticated `research/scientific_model_router.py` remains a historical offline test fixture, **not** the live workflow entry point.

Keep HIP/Blablador GitHub secrets until both providers succeed in the Cloudflare-backed live workflows and all other consumers have been inventoried. Afterwards remove stale secrets at repository and Environment scopes; keep `research-inference` if approval or branch protections are useful.
