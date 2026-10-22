# The lab against a bare question

Does the lab make the model better? After every completed lab run of a supported experiment, the same model answers the same cases once more as a **bare question**. The bare question contains only the task definition, the data and the answer format. Both answers are scored by the experiment's own verifier, and the paired results are compared across runs.

## Two arms

| | Lab | Bare question |
| --- | --- | --- |
| Model | Chosen by the plan (default, reasoning or benchmark-ranked) | The same model, called the same way. A different identity is never paired. |
| Cases and data | The seeded cases | The same cases and the same data |
| Prompt | Persona, method guidance, protocol with assumptions and limitations, calibration rule | Task definition and answer format only |
| Recovery | Format correction or feedback where the experiment has one | None: one answer per case |
| Scoring | The experiment's pass rule | The same pass rule, applied to the lab's evidence after re-verifying it |

An unreadable bare answer counts as failed and is also reported as a format problem.

## Supported experiments

The first version covers three experiments; others follow when their bare prompt is defined:

- **`perturbseq-holdout`**: the class definitions, the same training summary and the batch genes.
- **`sympy-quadratic`**: the coefficients.
- **`dowhy-backdoor`**: the causal diagram (which is part of the task), the linear additive model and the data rows.

## Running

`research/bare-baseline.mjs` runs as its own step in **Oraklets forskningslabb**, after the lab step succeeds. It has its own seven-call budget. A Problem Bank run, a failed lab run or an unsupported experiment skips it, and none of these change the lab's result. The step:

- adds `baseline` to the saved report (`oraklet_experiment`), leaving the lab's own fields unchanged;
- writes `baseline.json` to the run artifact;
- adds a table to the step summary.

The bare step runs straight after the lab's own calls, so provider rate limits are likely. It waits 15 seconds before each bare call. A request that fails with a provider HTTP or transport error is retried once after 45 seconds; this is the same request again, not a second answer. The number of retries is stored as `retries`. A second failure stops the step and names the case. The job timeout is 20 minutes, which leaves room for the extra calls and pauses.

## Analysis plan (frozen)

The plan text is `BARE_ANALYSIS_PLAN` in `research/bare-baseline.mjs`. Its SHA-256 (`f7cf9ca9…`) is pinned in a test and stored with every bare result. The summary pools only results recorded under this plan.

- **Primary measure:** the lab's pass rate (final proposal) minus the bare pass rate, per experiment and model, over cases paired by run, seed and model identity.
- **Test:** an exact two-sided McNemar test on the discordant pairs, alpha 0.05.
- **Minimum:** no conclusion before 30 paired cases per experiment and model.
- **Secondary measure:** the lab's first proposal (before correction) against the bare question.

**Actions → Oraklets kalibrering** prints the pooled table next to the calibration summary and saves it as `bare-baseline.json`.

## Limitations

- The bare arm measures the lab's prompt and recovery steps for a fixed experiment. It does not measure the planner's choice of experiment or model.
- For experiments whose lab prompt is already close to a bare question (`sympy-quadratic`), a small difference is expected.
- One arm always runs after the other within the same job. Upstream provider behaviour that changes within minutes is not controlled for.
