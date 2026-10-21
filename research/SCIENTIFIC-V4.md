# Scientific benchmark v4 (domains)

Scientific v3 asks five fixed, easy questions. Most HIP and Blablador models answer all of them, so v3 cannot tell the models apart, and it says nothing about which model suits which kind of research. Scientific v4 ranks models **per research domain**. That ranking is the basis for letting Oraklet choose a model per experiment.

## Tasks

`research/domain_tasks.py` generates the suite `domains-v1`: five domains with four task kinds each.

| Domain | Task kinds |
| --- | --- |
| `symbolic` | 4×4 determinant, sum of squared cubic roots (Vieta), definite integral, derivative of a quotient at a point |
| `probability` | Bayes' theorem, hypergeometric draw, sum of two n-sided dice, at least one success |
| `causal` | Classify mediator, confounder or collider; adjust or not; P(Y=1 \| do(X=1)) and average treatment effect by backdoor adjustment |
| `statistics` | OLS slope, OLS intercept, R², unbiased sample variance |
| `discrete` | Linear recurrence, binomial coefficient, Σ k·bᵏ, least common multiple |

- **Deterministic:** questions come from fixed seeds, so every model and every run gets identical tasks. Changing the suite means a new suite version.
- **Exact answers:** the expected answer is computed with exact arithmetic (fractions and SymPy), never typed by hand. `research/test_scientific_v4.py` reproduces several kinds independently, for example OLS by solving the normal equations and Bayes by natural frequencies.
- **Scoring:** only the last `FINAL_ANSWER:` line is scored, as an integer, a fraction, a decimal or one requested word. `\frac{a}{b}`, `\boxed{}` and thousands separators are normalised. Anything else is `unverified`, and like truncated or failed calls it counts as not correct.

## Running

Actions → *Scientific benchmark v4 (domains)* → Run workflow:

- `model`: one menu entry, or `<provider> / alla`.
- `tasks_per_domain`: 8 (40 tasks) or 4 (20 tasks).
- `repeats`: 1 or 2.

Calls go through the Cloudflare Worker exactly like v3, with temperature 0 and at most 768 tokens. The artifact `scientific-v4-<run id>-<attempt>` holds every answer; for a rerun only the latest attempt is scored.

## Ranking

When a v4 run finishes, *Refresh HIP/Blablador model menu* adds it to `research/model-scores.json`, tallied per domain. It also writes the section *Domain ranking (Scientific v4)* in [MODEL-RANKING.md](MODEL-RANKING.md): correct / attempts per model and domain, with ★ on the best model per domain once it has at least four attempts there.

Aliases are pooled by backing model, as in the classic ranking. The menu recommendation still comes from the classic tasks; the domain ranking feeds the model choice in Oraklet's lab.

## Model choice in Oraklet's lab

Every catalog experiment has a research domain (`domain` in `research/catalog.mjs`), for example `dowhy-backdoor` → `causal` and `sympy-quadratic` → `symbolic`. In an automatic run, `research/lab-models.mjs` reads the committed `research/model-scores.json` and `research/model-catalog.json`. It offers the planner, per domain, at most three HIP/Blablador models with at least 8 attempts and at least 75 % correct on that domain's v4 tasks, ranked by rate, then evidence, then latency.

The planner picks the experiment and its `modelMode` in one answer:
- `default`, or `reasoning` when that model is configured;
- or one of the ranked models for **that experiment's domain**, for example `"hip / GLM-5.2-AWQ-INT4"`.

Anything else is an invalid plan. A ranked choice is written into the plan (`modelChoice`: domain, provider, model and the correct/attempts evidence) before any experiment call, so it is part of the plan commitment. All experiment calls then go to that model through the Worker's research gateway with the `lab` profile, which has the lab's 4,096-token budget. They share the usual seven-call ceiling, and the model identity stays locked for the run. A fenced or `<think>`-prefixed JSON answer is unwrapped; everything else is parsed as strictly as before.

The planning call itself still uses the configured default model. Without ranked models, for example before the first v4 run, the prompt and plan are exactly as before. Manual runs keep the default model.
