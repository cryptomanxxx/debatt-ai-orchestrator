# GitHub Scientific Model Router → Oraklet SymPy pilot

This manual, opt-in research workflow connects the existing GitHub Scientific Model Router to **Professor Oraklet's real, existing, independently verified SymPy experiment** without Cloudflare or Supabase.

## Execution

After merging, go to GitHub Actions → **GitHub Router + Oraklet SymPy research pilot** → Run workflow. Choose `auto`, `blablador`, or `hip` and a one-to-nine-digit seed.

- The existing Python router performs live discovery using the already configured GitHub Secrets `BLABLADOR_API_KEY` and `HIP_API_KEY` and selects an allowlisted model for the `reasoning` category. The runner independently checks the returned provider/model against a small explicit allowlist.
- A Node.js GitHub runner calls that model's OpenAI-compatible endpoint directly. Model identity is pinned for all three experiment cases, with at most **three model inference calls** and 768 output tokens requested per call.
- The original `runSympyExperiment` creates three committed synthetic problems, asks the model for exact roots, runs the existing locked SymPy Python verifier and independent BigInt oracle, and records positive and negative controls. The model cannot supply a self-declared correctness score.
- Complete and partial JSON results, including selected model, commitments, controls and verifications, are retained as a GitHub Actions artifact for 30 days.

The model can make incorrect proposals and the research run still finishes with a scientific `failed` result. That differs from workflow failure caused by transport, invalid model response or a broken verification chain.

## Research guardrails

This is a manual pilot, **not** a deployment or integration into the daily scheduled research planner. There is **no Cloudflare model call, no Groq requirement, no Supabase database write and no new secrets**. No silent mid-experiment provider fallback. The selection priority remains static; it is not proof of superior model quality. The model's provider-listed availability is checked before committing a route, while downstream output identity must match the selected model.

The user inputs do not authorize arbitrary URLs, code execution, experiment types, new secrets or unrestricted tool calls.

## Validation

```sh
node --test tests-research/github-router-sympy-pilot.test.mjs
```

The workflow also installs pinned SymPy requirements before live scientific verification.

Next: compare identical seeds across HIP and Blablador, add strict context/token limits from validated provider metadata, score cost and latency, and only then propose reviewable integration into the daily Oraklet research loop.
