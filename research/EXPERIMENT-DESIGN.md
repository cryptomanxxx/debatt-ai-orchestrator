# Oraklet-designed experiments

In the other catalog experiments every dataset and parameter is fixed by the protocol, and Oraklet only proposes an answer. A **design experiment** lets Oraklet choose bounded parameters itself and **preregister** its predictions before any data exist. The data generator, the tool and every check stay fixed code, and Oraklet never writes code.

## `ar1-power-design`: when does an AR(1) test reject H0?

Protocol `ar1-design-v1` (`research/ar1-design.mjs`), research domain `statistics`. The experiment can be chosen automatically by the daily lab.

1. **Design.** In a single model call, Oraklet picks exactly three different design points `(phi, n)` from the fixed design space:
   - `phi` ∈ {0, 0.1, 0.2, 0.3, 0.4, 0.6};
   - `n` ∈ {64, 96, 128};
   - at least one point must be a null control with `phi = 0`.
2. **Preregistration.** In the same answer, Oraklet commits to:
   - a hypothesis;
   - for each point, a prediction of the two-sided test's decision at α = 0.05 (`reject_h0` / `do_not_reject_h0`);
   - what is being compared;
   - a falsification criterion chosen in advance: `any_mismatch` or `two_or_more_mismatches`.

   Anything outside this contract is rejected before any data or tool call.
3. **Lock.** The design and preregistration, together with the provider and model that wrote them, are hashed (`preregistrationSha256`) and written to `commitments.json` before any data is generated. The series are generated only afterwards, and their commitments are then added to the same file.
4. **Run.** Each series is generated deterministically from the seed and its design point: y[t] = 0.2 + phi·y[t-1] + ε, with 64 burn-in steps, `n` training points and 16 holdout points.
   - Statsmodels `AutoReg` tests each series.
   - An independent floating-point OLS computation with Student-t verifies every result.
   - A numerical null control (zero lag covariance) checks the tool.
   - This uses four tool calls and one model call (plus the planning call in an automatic run).
5. **Outcome.** The preregistered criterion decides the outcome:
   - **`confirmed`**: the report status is `passed`;
   - **`refuted`**: the report status is `failed`.

   The report includes a *Förregistrering* section with the hypothesis, comparison, criterion, hash and outcome. When the run belongs to a Problem Bank problem, the Research Loop verdict follows Oraklet's locked criterion: verified when the preregistration held (with `two_or_more_mismatches`, one wrong prediction is allowed), falsified when it was refuted ([PROBLEM-BANK.md](PROBLEM-BANK.md#daily-lab-on-approved-problems)). Model-written hypothesis and comparison text is shown as escaped plain text.

## What it shows and what it does not

The experiment tests whether Oraklet can design a small test and correctly anticipate its behaviour (effect size, sample size and power). Each design point is a single realisation, so a single outcome is partly chance. Choosing a lenient falsification criterion is itself part of the design, and it is recorded. The experiment uses synthetic data and makes no claim about real time series.
