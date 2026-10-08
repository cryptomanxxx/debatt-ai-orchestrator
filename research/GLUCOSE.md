# Synthetic insulin absorption and causal glucose forecasting

Run `glucose-absorption` in **Oraklets forskningslabb**, or let `auto` select it.
No additional runtime packages, medical records or schema migration are needed.
The standard runner commits fixtures before Oraklet predicts the outcomes and stores
schemaVersion 2 reports in the existing lab table. The website's generic structured
report renderer can display these reports. Do not use its Ratfit renderer.

## Scope

This is a pedagogical, dimensionless linear compartment simulation, NOT a validated
Bergman/Hovorka/UVA-Padova implementation. It tests the mechanism of altered
absorption and causal forecast adaptation. It does not model temperature, real
patients, insulin prescriptions, clinical thresholds or dose optimization. No
neural network is used. A positive result establishes performance only under the
synthetic model and its specified assumptions.

Time is in minutes; all other quantities are dimensionless. The state is
`[S1,S2,I,X,G,M]`; G is a deviation from a reference glucose level, not an absolute
clinical concentration. Negative deviations are allowed and are not hypoglycemia.
The fixed equations are:

```
dS1/dt = -ka*S1
dS2/dt = ka*(S1-S2)
dI/dt  = ka*S2 - 0.04*I
dX/dt  = 0.03*(sensitivity*I-X)
dG/dt  = -0.012*G - X + 0.025*M
dM/dt  = -0.025*M
```

At t=0 the first depot holds a bolus and the gut depot holds a meal; other states
start at zero. This is a linearized explanatory model, including an additive insulin
action term, not the multiplicative `-X*G` of the clinical minimal model.
No later meals or doses occur; activity and physiology are constant.
Three cases vary ka over 0.012, 0.024 and 0.048. Seed selects bounded initial
meal, bolus and sensitivity. Within each comparison only ka changes.

## Mechanism and controls

Compare each curve against ka=0.024, using minimum G, its timing and absorbed amount
at 60 and 360 minutes. The unchanged-rate control must be exactly identical.
The analytical absorbed amount is `dose*(1-exp(-ka*t)*(1+ka*t))`; its infinite-time
limit is the same bolus at every rate. A finite observation window need not contain
all absorbed insulin. The reported minimum is over the 0–360 minute window, sampled
every five minutes, not a guaranteed global or continuous-time minimum.

## Forecast protocol

Observations at five-minute intervals have a fixed sinusoidal error of amplitude
0.015. This is a reproducible stress fixture, NOT calibrated stochastic sensor noise.
The filter assumes variance 0.015² and process variance 0.00005; these are locked
method settings, not estimated patient properties. It uses a scalar glucose
Kalman update with common covariance (initial variance 0.001). The adaptive bank
has rates [0.012,0.024,0.048] and equal prior weights; cumulative Gaussian innovation
scores weight the candidate forecasts. The fixed comparator uses the same glucose
update with rate=0.024. No unobserved insulin/meal state is Kalman-updated.
The true rate is withheld from the bank. Other physiology and the initial bolus/meal
are known by construction. Thus this is a deliberately favorable model-identification
test, not an estimate of real-world performance or joint identifiability.

Lock predictions at origins 30–240 minutes, then evaluate against hidden synthetic
truth at 30 and 60 minutes ahead (43 origins per horizon). All observations used at
an origin are at or before it. Both methods have identical information. Improvement
requires lower MSE by more than 1e-8 at BOTH horizons, otherwise the decision is
`mixed_or_no_improvement`. Do not infer significance from overlapping forecast
windows or pool the three cases as independent clinical subjects.

RK4 at step 0.25 generates evidence. Independently implemented midpoint at 0.125
and RK4 step-halving must agree (absolute tolerances 1e-4 and 1e-6). These checks
verify numerical consistency, not biological validity. Oraklet predicts absorption
at 60 minutes and forecast winner BEFORE evidence; report `passed` scores that
prediction, separately from the measured mechanistic and forecasting outcomes.

## Background and next steps

- Glucose/insulin modeling: https://pubmed.ncbi.nlm.nih.gov/7033284/
- UVA/Padova research simulator: https://github.com/jxx123/simglucose
- Physiological glucose prediction: https://arxiv.org/abs/1901.07467

These are background references, not claims this toy reproduces their models.
Before any translation to physiological research, reproduce a validated simulator,
vary insulin sensitivity independently, include sensor lag and missing/incorrect
meal records, expand the rate grid, test off-grid rates and stochastic noise, and
compare robust baselines on held-out subjects. Real temperature effects require
measured evidence; no temperature-to-rate mapping has been assumed here.
