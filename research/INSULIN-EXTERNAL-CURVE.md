# Insulin aspart: separate-publication curve-shape check

## Locked analysis and provenance

Source chosen for endpoint compatibility, not forecasting outcomes:
Cengiz et al. (2014), *Faster In and Faster Out: Accelerating Insulin Absorption
and Action by Insulin Infusion Site Warming*, DOI 10.1089/dia.2013.0187,
[Figure 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC3887414/).
The paper reports 17 completed crossover clamp studies and 16 participants
with pharmacokinetic data. Insulin aspart was administered at 0.2 U/kg;
local warming to 40 °C ran from -15 to +60 minutes. The endpoint is the
baseline-subtracted plasma insulin group mean, not glucose or insulin dosage.

The earlier source was DOI 10.1111/pedi.12001. This is a separate publication
and figure from the same research group. Participant overlap is not established.
This is a retrospective additional-source check, not prospective preregistration,
a patient-level validation, or confirmed independent biological replication.
The source article and its summaries were read during selection; curve data
and forecasting outcomes were not evaluated before this specification was written.

Frozen choices carried over from the earlier experiment:

- C(t) = A (t/tau)^p exp[p(1-t/tau)], fixed p=1 versus fixed p=2.
- Separate A>=0 and tau per arm; four fitted parameters for either curve family.
- tau grid: 10,12,...,180 minutes. A is nonnegative least-squares for each tau.
- Origins 30,60,90 minutes; targets exactly +30 and +60 minutes.
- Training uses only observations at or before the origin. No interpolation of targets.
- Last observed value per arm is the persistence reference.
- All origins and both arms are reported; no selection based on future errors.
- Digitize marker centres, preserve pixel coordinates and calibration, and lock
  the data hash before computing any forecasts. A target that cannot be read
  reliably is a data limitation, not a reason to choose a different target.
- Five fixed reading stress patterns: central, both +2, both -2,
  heated +2/unheated -2, heated -2/unheated +2 uU/mL; baseline stays zero.
  These are chosen stress patterns, not confidence intervals or an exhaustive bound.
- Report signed errors, absolute errors and squared errors per arm and horizon,
  as well as pooled mean squared error. Improvement requires squared error lower
  than BOTH p=1 and persistence by more than 1e-8 at BOTH horizons in BOTH arms.
  Report pooled improvement separately so that arm-specific harm cannot be hidden.
- No statistical significance tests. Origins overlap and are not independent replicates.
- No hyperparameter search, refitting to future points, correction of model choices
  after outcomes, or tuning of p, grid, origins, references, or stress patterns.

The analysis specification and data will be hashed in the committed fixture.
The local pre-digitization specification hash is recorded there to make the
sequence auditable; it is not an externally registered or externally witnessed protocol.

## Implementation and reports

The immutable [pre-digitization specification](data/insulin-external-analysis-lock.md)
has SHA-256 `d1465d35e8cdb589a2ead8a69b5c53edcf48f23f21e90fce4dba3abb0b62b609`.
The [manually digitized fixture](data/insulin-aspart-external.json) has SHA-256
`c5247714f0b7ab7cee2e1d73ed86ac48f31d826910f060542bdbe774f17b0173`.
Its pixel centres and y-axis calibration preserve an audit trail. The source
image SHA-256 is also recorded; the publisher's figure is linked, not bundled.
These hashes pin our files, not their scientific correctness.

`research/insulin-external-curve.mjs` reuses the original fitting implementation
without changing its model forms, bounds, training loss or tie-breaking rules.
It reports per-arm signed, absolute and squared errors for both curves and
persistence at every origin, horizon and reading pattern. Pooled MSE is secondary.
The stricter groupwise success criterion is an explicitly new analysis criterion;
it is not the pooled criterion from the earlier exploratory experiment.
The null control duplicates the unheated arm and verifies equal fitted parameters;
it does not assume that identical arms rule out a benefit from a different curve form.
Alternative curve arithmetic and direct residual checks verify all numerical
results, per-group scores, model parameters and graph samples.

Oraklet commits the protocol and data hash before its three proposals and sees
only the chronological training prefix. Six local tool calls cover three observed
cases and three identical-arm controls. Proposals are scored separately from the
measured evidence; a wrong proposal does not discard numerical results. Completed
cases are saved even when a later case fails. The production runner saves the
schema-2 report to the existing Supabase table and the GitHub Actions artifact.
The website can display it through its existing research-results integration.

PNG and SVG diagnostics are generated from saved verified fits, without refitting.
`external-curve-origin-30/60/90.png` and `.svg` show the two groups separately,
solid training fits, dashed forecasts, future targets and persistence. The figure
caption identifies the additional source and its limitations. The JSON report and
plot manifest retain the data, fitted parameters, source provenance and checksums.

## Running

After merge, choose **insulin-external-curve** in **Oraklets forskningslabb** on
`main`. For a direct comparison with earlier runs, use seed `20261008`; any valid
1–9 digit seed is allowed. Seed changes only commitments, not published data.
Leave the Problem Bank ID empty unless intentionally running a matching catalog
problem. The experiment is manual-only: rerunning fixed published data does not
produce fresh biological evidence.

Validation:

- `npm test`: API and research tests, with no Python/Matplotlib dependency.
- Install `research/plot-requirements.lock`, then `npm run test:plots`: actual PNG/SVG
  integration for both the earlier and additional-source experiment.
- Tests check prefix isolation, the real earlier pooled-gain/group-harm contrast,
  exact targets, all group error definitions, forgery rejection, commitments,
  partial report persistence and the production save pipeline.

This checks numerical and software integrity. It does not verify manual digitization,
identify individual absorption, establish a seasonal temperature law, forecast blood
glucose, or recommend insulin doses. New outcomes must not be used to tune this
locked experiment; any new model would require a separately labelled exploratory study.
