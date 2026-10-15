# Deep Reasoning & Agentic Tree Search: v0.1 pilot

## Scope

Manual, strictly bounded model-method comparison for Professor Oraklet. It
reuses the current Orchestrator API and existing exact quadratic verifier.
This is not an autonomous discovery system, and it is not a clone of
Sakana AI Scientist-v2.

- research/agentic-tree-search.mjs contains a reusable best-first search with
  explicit maximum node, depth and branching limits. The engine cannot invoke
  network APIs, processes or arbitrary tools by itself; its callbacks must be
  allowlisted by the caller.
- research/deep-reasoning-benchmark.mjs uses three fixed strategies:
  discriminant, factoring, and a depth-two cross-check. The model generates
  candidate answers; strategies and topology are deterministic in v0.1.
- The verifier is the existing exact BigInt oracle in research/sympy.mjs, not
  an unrestricted Python/SymPy session. Model responses cannot supply their
  own success scores.

## What a score means

Three seeded synthetic quadratic cases are shared by all configured model
modes, including commitments and coefficients. All answers are submitted
before verification; the model prompt excludes the hidden roots. A failed
tree node may send its own prior root suggestion and accepted/rejected status
to a follow-up; the verifier's correct roots are never passed to the model.

Direct mode receives ONE model call per case; tree search receives UP TO THREE
additional calls per case. Report actual call counts alongside answer accuracy.
Never present increased tree accuracy as a fair equal-compute comparison:
tree uses extra inference and tool-verification feedback.

The verifier's "verified" status means an exact synthetic arithmetic check
passed. It does not mean new scientific knowledge was discovered. Three
cases do not support statistically robust claims about model capability.

## Execution and storage

Actions > Deep Reasoning & Agentic Tree Search benchmark > Run workflow.
Choose default for the first smoke test. Choose reasoning or both only when
the deployed Orchestrator model profile reports a configured reasoning mode.
The workflow reuses GitHub Actions secret ORCHESTRATOR_API_KEY. Optionally
set the Actions variable ORCHESTRATOR_API_URL to an HTTPS endpoint ending in
/v1/query. The current Worker endpoint is the built-in default.

There is no automatic schedule. No changes to daily research, research
database, experiment catalog or public website. The maximum is 24 model
calls total and three evaluated search nodes per case, with a two-level tree.
Runs may spend inference credits; no API cost is incurred in offline mode.

Offline check:
    node research/deep-reasoning-benchmark.mjs --offline

Unit tests (mocked models; no secrets):
    node --test tests-research/agentic-tree-search.test.mjs tests-research/deep-reasoning-benchmark.test.mjs

Live and partial JSON results are uploaded as GitHub Actions artifacts with
30-day retention in reports/deep-reasoning/report.json. They are not added
to Supabase or committed back to Git.

## Next steps

1. Run a default-model smoke test and inspect the provider, model identity,
   actual call count, failure codes and per-branch trace.
2. Configure a real reasoning model and rerun the SAME seed in both modes.
3. Add larger held-out benchmarks and equal-inference-budget controls.
4. Add timing, token usage, and monetary cost where provider metadata allows.
5. Integrate only explicitly reviewed and allowlisted planning actions into
   Oraklet's existing Research Loop and Problem Bank, with independent
   verification and approval requirements.
