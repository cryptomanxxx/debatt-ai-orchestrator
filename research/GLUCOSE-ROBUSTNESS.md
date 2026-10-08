# Insulin absorption: robustness to incorrect forecast inputs

Select `glucose-robustness` in **Oraklets forskningslabb** after merging, or let
`auto` select it. Seed `20261008` matches the original run's synthetic physiology.
No new packages, credentials or database migration are needed. The experiment
uses the existing runner and publication pipeline.

## Controlled comparison

Does the adaptive bank's 30/60-minute forecasting advantage survive incorrect
meal information and assumed insulin sensitivity? The experiment retains
[the original protocol](GLUCOSE.md)'s equations, observations, filter settings
and forecast origins. It uses a Kalman filter bank, not a neural network.

For each true absorption rate (0.012, 0.024, 0.048), generate ONE true trajectory
and observation sequence. Seed selects the same true dose, meal and sensitivity
as in `glucose-absorption`. These and measurement error remain identical across
the three rates. Both forecasters receive the same deliberately incorrect inputs:

| Forecast input | Multipliers applied to true value |
| --- | --- |
| Initial meal amount | 0.7, 1, 1.3 |
| Constant insulin sensitivity | 0.7, 1, 1.3 |

The full factorial grid has nine combinations per rate: one correct control,
two meal-only errors, two sensitivity-only errors and four combined errors.
Only forecast inputs change; the true trajectory does not. The predictor never
receives the true rate or future observations, nor the correct meal/sensitivity
under an incorrect-input condition. Only absorption is adapted; sensitivity
is assumed, not estimated.

These are fixed ±30% stress levels, not sampled uncertainty or empirically
calibrated error sizes. Incorrect meal timing, missed meals, changing activity,
dehydration, temperature, sensor lag and off-grid rates remain outside scope.

## Locked decisions

Score the same 43 origins (30–240 minutes at five-minute intervals) against
synthetic truth 30 and 60 minutes ahead. Compute MSE for both methods separately.
An improved combination requires lower adaptive MSE by more than 1e-8 at BOTH
horizons. This numerical margin is not a statistical or clinical threshold.

Classify the eight incorrect combinations per rate:

| Decision | Criterion |
| --- | --- |
| `adaptive_improves_all` | All eight improve at both horizons |
| `adaptive_improves_some` | Between one and seven improve at both horizons |
| `adaptive_improves_none` | None improve at both horizons |

The correct-input control has its own original-protocol decision. Describe
robustness as `preserved_all`, `preserved_some` or `lost_all` only when the
correct control had an adaptive advantage. Otherwise report `no_clean_advantage`.
Winning with incorrect inputs does not establish preservation of a clean advantage.

Report all nine combinations, both MSEs and each method's MSE difference from
its own correct-input control. Negative differences mean improvement; positive
differences mean deterioration. Do not average away conflicting cells. The count
of improved combinations is not a patient success probability. No p-values or
clinical conclusions: overlapping forecast origins are dependent.

Before proposals, commit seed, truth, multipliers and protocol. Oraklet predicts
the clean-control decision and stress decision before evidence. There are three
proposal calls and six local tool calls (grid and standalone clean control per
rate). `passed` scores Oraklet's prediction separately from measured outcomes.
Completed cases are retained if a later call fails.

## Verification and limits

Evidence uses RK4 at 0.25 minutes. Validate every curve, forecast, MSE and decision
with midpoint at 0.125 (absolute tolerance 1e-4) and step-halved RK4 (1e-6).
The standalone clean control must exactly match the grid's clean cell, true
curve and observations. These are alternative numerical integration checks sharing
one model, not independent biological validation. Tests also compare against the
original experiment, re-score forecasts, reject forged evidence and check causal
prediction prefixes under incorrect inputs.

This remains a dimensionless pedagogical linear model, not a validated patient
model, temperature model, clinical forecast or insulin-dose optimizer. No medical
records, medical doses or hypoglycemia thresholds are used. All true rates lie
on the candidate grid. Results apply only to this locked synthetic setup.
Possible extensions include off-grid rates, sensor lag, meal timing errors and
a validated physiological simulator.
