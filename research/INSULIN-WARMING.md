# Insulin aspart: local warming and group-curve forecasting

Run `insulin-warming-forecast` manually in **Oraklets forskningslabb**, on
`main` after merge. Leave seed empty or enter `20261008`. Leave Problem Bank ID
empty. No new secrets, database migration or Worker deployment is required.
The numerical tool runs locally in Node 24; the usual orchestrator supplies
Oraklet's three proposals. It uses three model calls and six local tool calls.
This literature-derived experiment is excluded from automatic selection.

## Question and scope

Does giving heated/unheated arms separate **curve time scales** improve their
30- and 60-minute forecasts relative to a common curve? The endpoint is the
baseline-subtracted **plasma insulin increment**, in uU/mL, not glucose.
This is a descriptive retrospective benchmark on a published group mean curve,
not a prospective clinical study, new physiological discovery or patient model.
A curve time scale is not an identified physiological absorption constant.

## Source and extraction

[Cengiz et al., Figure 2, DOI 10.1111/pedi.12001](https://pmc.ncbi.nlm.nih.gov/articles/PMC3572265/)
compares insulin aspart with and without local infusion-site warming to 38.5 C
in a randomized crossover clamp study of adolescents with type 1 diabetes.
Thirteen participated; the insulin analysis includes twelve due to an assay
problem. The glucose clamp actively maintains glucose: its glucose values
cannot be treated as an uncontrolled glucose-forecast trajectory.
Heating starts 15 minutes before the bolus and ends 60–90 minutes afterward;
the exact per-person stop times are not available in this group figure.
Unheated skin temperature is unknown. No room or outdoor temperature is
substituted for it. This is a treatment indicator, not a temperature-response law.

The checked article exposes a figure and parameter table; no machine-readable
individual or time-series dataset was located. `data/insulin-aspart-warming.json`
therefore stores **manual visual approximations** of the mean markers, with
source URL, DOI, exact figure URL, image dimensions, image SHA-256, axis ticks,
marker pixel coordinates, nominal sample times and derived concentrations.
The data file is byte-pinned in `insulin-warming.mjs`.

Extraction used the original 800 x 415 JPEG, not an upscaled reconstruction.
The y ticks are 0 at pixel 307 and 100 at pixel 107:
`concentration = (307 - markerY) * 0.5`, rounded to 0.5 uU/mL.
The x ticks are 0/100/200/300 minutes at pixels 80/236/391/547; marker positions
were checked against the nominal sampling schedule. Circles are unheated and
squares heated. The overlapping 10-minute marker is omitted rather than guessed.
Baseline zero follows the baseline-subtracted endpoint. Late negative increments
are retained, not clipped or interpreted as negative absolute insulin levels.
Mean-curve peaks are not the mean of individual peak values in the article's
table; the latter are not used to calibrate or score a forecast.

An assumed **four-pixel vertical margin**, equivalent to ±2 uU/mL, is a chosen
reading stress level. It is neither a confidence interval, empirical assay error,
nor the published SEM bars. No individual covariance or paired statistical test
can be reconstructed from these digitized group means. An independent extraction
or the original numeric data would strengthen the data basis.

## Locked models

The simple nonnegative empirical profile is

`C(t) = A * (t / tau) * exp(1 - t / tau)`, with `C(0) = 0`.

`A` is a curve peak scale, not an insulin dose. `tau` is a curve time scale in
minutes. This gamma-shaped profile is deliberately restrictive: it need not fit
the true rise, decline, baseline drift, heating duration or insulin kinetics.
Poor extrapolations and grid-boundary optima remain in the report.

| Model | Parameters | Purpose |
| --- | --- | --- |
| shared | One A, one tau: 2 | Primary common-curve baseline |
| timing | One A, separate tau per arm: 3 | Primary comparison allowing different timing |
| amplitude | Separate A, one tau: 3 | Diagnose a height difference with common timing |
| both | Separate A and tau per arm: 4 | Diagnose a combined shape/height difference |
| persistence | Last observed value per arm | Simple practical forecast reference, no fitted curve |

All curve models fit the **same observed prefix in both arms**, minimizing
unweighted squared error. Search tau on the fixed grid 10, 12, ..., 180 minutes.
For each candidate, solve nonnegative A analytically by least squares. Grid
ties retain the first pair in ascending order. No model, parameter grid,
perturbation pattern or primary comparison is selected using held-out errors.
The study and model family were selected after reading a published article:
this locked software protocol does not turn the analysis into preregistered or
truly blind confirmation.

## Chronological evaluation and reading stress

| Origin | Training samples | Actual held-out targets |
| --- | --- | --- |
| 30 min | Available points up to 30 min | 60 and 90 min |
| 60 min | Available points up to 60 min | 90 and 120 min |
| 90 min | Available points up to 90 min | 120 and 150 min |

Forecasts are generated before accessing target concentrations. Every horizon
MSE averages **two group means**, not twelve independent patient predictions.
The origins overlap, reuse target points and are not independent replicates.
Only 0–150 minutes enter fitting/scoring; the complete digitization remains
available for audit. No interpolation creates a target observation.

The primary `timing_improves_both` decision requires timing MSE lower than shared
MSE at **both** horizons, with absolute margin 1e-8 (uU/mL)^2. Otherwise the
result is `mixed_or_no_improvement`. This is a descriptive comparison, with no
significance test or clinical accuracy threshold. Beating the shared model
alone does not establish value over persistence: its MSE and a separate
`timingBeatsPersistenceBoth` flag are reported too.

Five fixed reading scenarios are run, perturbing both training and targets:

- `central`: extracted values.
- `both_up` / `both_down`: both arms shifted +2 / -2 uU/mL.
- `heated_up` / `heated_down`: heated +2 / -2, unheated -2 / +2 uU/mL.

Baseline stays zero. These correlated, uniform shifts only test the chosen
patterns; they are not exhaustive worst-case bounds over individual readings,
time errors or patient uncertainty. Robustness is labelled `all_tested_patterns`,
`some_tested_patterns` or `no_tested_patterns`, never patient probability.

## Controls, provenance and reporting

- A separate **synthetic identical-arm control** replaces the heated curve with
  the unheated curve. Extra timing freedom must not create a forecast advantage.
- A verifier searches the same fixed grid using alternative exponential/log
  arithmetic and direct residual sums instead of sufficient-statistic SSE.
  This checks numerical calculations, not physiological validity or extraction.
- Tests use analytic known-curve timing/null fixtures, mutate future observations,
  corrupt source/evidence, check model nesting and run the complete production
  report path with mocked external services.
- Before any AI proposal, the runner saves commitments binding seed, origin,
  source SHA and full protocol. Code SHA is saved by the shared runner.
- Oraklet receives the training prefix and source/protocol metadata only. He
  predicts the comparison and reading sensitivity before tool results. Since
  the figure is already public, this does not guarantee a blind AI forecast.
  Proposal accuracy is separate from the numerical hypothesis outcome.
- Full model parameters, predictions, held-out concentrations, MSEs, boundary
  flags, all reading scenarios and controls are retained in the JSON report.
  Markdown displays the comparison including persistence. Completed cases survive
  later interruption. No retries silently revise a proposal or scientific result.
- Seed changes commitment identity only. It does not generate new clinical data.

No PINN or Kalman filter is trained. No insulin dosing, individualized glucose
prediction, continuous temperature calibration or seasonal dose adjustment is
implemented. Improvement here would justify a better data-based follow-up;
failure would identify a limitation of these models and this limited data basis.
