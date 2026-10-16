# ACT-MAP / ACCL × VEM-Sci — controlled scientific-method prototype

This **manual, CPU-only GitHub Actions pilot** implements four bounded pieces of the DeepRAP v0.9 research plan:

1. **ACT-MAP:** a source and target synthetic structural causal model (SCM) with distinct, randomized variable identifiers and an intervention-based correspondence test;
2. **Latent Causal Correspondence (ACCL):** enumeration of candidate source→target maps **from public inputs**, with unknown action/instrument→variable alignment at Levels 3–4;
3. **Adversarial benchmark:** Levels 0–4, seeded randomized permutations, exchangeable non-causal negative-control observations, positive/partial/null-transfer cases, fixed/random/active comparison methods, and unseen intervention magnitudes;
4. **VEM-Sci:** explicit `proposed → under_test → provisionally_supported / rejected / unresolved` transitions and an independent *within-fixture* evidence gate. Proposer output never writes directly into `accepted_claims`.

**Important:** The proposer in v0.1 is a deterministic **candidate enumeration and active model-discrimination baseline**, **not an AI/LLM agent** and not evidence that Oraklet autonomously discovered a general causal law. The system runs as a standalone *Oraklet research method* pilot, and is **not** yet selected by the daily research planner. The verified scientific claims are limited to deliberately simple synthetic SCM fixtures.

## Run locally (no API keys, GPU, downloads or pip installs)

```sh
python3 -m unittest discover -s tests-research -p test_act_map_benchmark.py -v
python3 research/act_map_benchmark.py --seed 20261016 --cases-per-level 6 --output reports/act-map/report.json
```

In GitHub, open **Actions → Oraklet ACT-MAP + VEM-Sci research pilot → Run workflow**, select a seed and 2–50 fixtures per level. Each manual run saves `reports/act-map/report.json` as an artifact (30-day GitHub retention). No Supabase, model-provider calls, Cloudflare, external API secrets or write permissions are used. The report includes each public fixture, action transcript, outcome, proposed mapping, evidence gate, epistemic state, hidden ground truth revealed **only after** the gate, and aggregate metrics per strategy.

## Benchmark levels and information boundaries

| Level | Input to proposer | Research task |
| --- | --- | --- |
| 0 | Correct mapping supplied | Instrumentation and verifier upper-bound check; privileged baseline |
| 1 | Six mapping candidates (all permutations), including one correct | Candidate discrimination; privileged baseline |
| 2 | No mapping supplied; intervention-to-target action identity known | Discover variable alignment from interventions |
| 3 | No mapping or intervention alignment supplied | Discover both variable and intervention correspondences |
| 4 | No mapping or action alignment, plus partial/no-transfer cases | Reject invalid full transfer; certify only supported submechanism or abstain |

The three source structural equations (linear additive coefficients) are provided, **not inferred**. The public `observations` field contains independently generated, exchangeable **negative controls**, not target SCM samples. It cannot support observational graph inference and must not be described as real observational causal evidence. This v0.1 baseline deliberately measures intervention-only correspondence. A candidate assumes each unknown source/target/action map is a permutation of three labels; no arbitrary partial graph matching or compositional intervention semantics are learned. Level 4 tests partial transfer restricted to the `s0 → s1` edge. Scope labels use a separate seeded non-alternating assignment and case presentation is shuffled. Level 1 now uses a fixed, symmetric six-candidate control independent of hidden truth. It is not a restricted three-candidate discrimination experiment. These are reproducibility controls, **not cryptographic secrecy**: a model with repository-code access, benchmark seed and full fixture-generation knowledge can still reconstruct deterministic ground truth. A truly blinded external-model benchmark requires held-out private generation seeds and a separate trusted evaluation service.

## Acceptance and falsification

- Fixture truth/mappings are hidden from active/fixed/random selection policies at Levels 2–4; Levels 0–1 intentionally use privileged candidate controls. A SHA-256 hash of the full fixture set is computed *in-process* before evaluation and individual fixture commitments are rechecked before evaluation and in the evidence gate. This is an audit fingerprint, **not** a trusted external timestamp.
- With a maximum of three discovery interventions enforced by both selector and verifier, each strategy filters incompatible mapping hypotheses by exact predicted interventional outcomes. Active selection uses an ordinary Gini-style candidate-disagreement heuristic, then prioritizes required root/mediator role coverage once candidate discrimination is exhausted. Random selection uses only public fixture input and a domain-separated seed. **This approach is established model discrimination, not scientific novelty.**
- To propose a full/partial correspondence, one unique top-priority mapping must remain and root/mediator interventions must be observed with nontrivial effect. Proposals lacking support remain **unresolved**.
- The verifier validates discovery-record provenance by reproducing raw oracle outcomes, checks exact consistency, and then evaluates **withheld magnitudes** (`-2`, `3`) for every relevant action. Only passing claims become `accepted_claims`, labeled **provisionally_supported**; a partial claim certifies only source roles 0 and 1, not the full causal system.
- A `no_supported_transfer` decision is an **abstention within the finite hypothesis class**, *never* a universal proof of no analogy. A wrong correspondence can never earn an accepted claim merely by asserting high confidence.
- Reports keep method outcomes (`correct_scope`, `mapping_correct`, `false_certification`, probe budgets) separate from workflow success. Inspect **all three strategies** and Levels 2–4; do not infer active selection won simply because the benchmark ran.

## What would falsify the longer-term research idea?

The v0.9 spec requires ACCL to beat strong **passive and structural retrieval baselines**, maintain held-out intervention accuracy on genuinely unfamiliar nonlinear/partial structural motifs, abstain on no-transfer controls and achieve **less total evidence cost** than target-only learning. The current fixed/random baselines, 3-variable linear cases and same-family withheld magnitudes **do not** yet meet that scientific standard. This pilot can show *method correctness*, not DeepRAP novelty, general causal understanding, or real-world transfer.

## Next research integrations (not implemented yet)

- Connect an actual Blablador/HIP model through the existing GitHub Scientific Model Router as a **bounded proposer** with immutable identity provenance limitations; the verifier and held-out truth remain server-side and inaccessible to the model.
- Add learned graph and correspondence generation (not exhaustive `3!` permutations), observational baselines, variable cardinality differences, nonlinear/noisy interventional distributions, genuinely held-out motifs and compositional/partial mappings.
- Reuse pinned **DoWhy/SymPy** adapters for separate implementation cross-checks; current oracle is a self-contained deterministic Python SCM simulation and **does not** claim DoWhy/SymPy verification.
- Establish fair frontier LLM, structural, passive, target-only and oracle comparisons under matched probe/compute budgets, with predeclared metrics (CRS, ITA, FTCR, HIG, ACE, TA, NTA, SIG).
- If independently validated, integrate a bounded experiment selection into the daily Oraklet planner **only after a separate PR**, not through this workflow.

## DeepRAP source provenance

This pilot was informed by the separately maintained **DeepRAP v0.9 project source archive**. The four specifications previously displayed here as repository-relative paths are **not committed in this repository**; those paths were not valid links and have been removed rather than suggesting the documents were available for inspection. The archived source filenames are:

- `08_ACT_MAP_BENCHMARK_v0.2.md`
- `09_FORMALISATION_KILL_TEST_v0.1.md`
- `10_HOSTILE_REVIEW_v0.1.md`
- `11_DEEPRAP_DECISION_MEMO_v0.1.md`

These are **external project materials, not verifiable repo-local dependencies**. This implementation and its included tests are the inspectable reference for what this pilot actually does. Do not claim independent verification against the archived specifications unless those materials are separately made available for review.

The historical DeepRAP novelty decision remains **HOLD / NO-SUBMIT**. No claim of a novel breakthrough follows from this implementation.
