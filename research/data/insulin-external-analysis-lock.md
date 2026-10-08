# Insulin aspart: separate-publication curve-shape check

## Analysis specification locked before digitization and evaluation

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
