# Exploratory insulin curve-shape follow-up

## Why this is a follow-up, not independent confirmation

The results of `insulin-warming-forecast` on this figure were already inspected
before this protocol was written. The new hypothesis is therefore explicitly
exploratory. Neither the chronological split nor the commitment makes the
already-public figure a fresh independent test. The old experiment is unchanged.
Better results here would require evaluation on other data before claiming
generalization.

The immutable manual extraction is the same
[`insulin-aspart-warming.json`](data/insulin-aspart-warming.json), with SHA-256
`d2bf4f391efd43544362bc09cd82c2d321ad4368520247eb661ef4e348ff78f3`.
Its coordinate provenance, omitted overlapping 10-minute markers, late negative
increments and selected reading-error assumptions are documented in
[the original protocol](INSULIN-WARMING.md).

Source: Cengiz et al., **Acceleration of Insulin Pharmacodynamic Profile by a
Novel Insulin Infusion Site Warming Device**, Figure 2,
[DOI 10.1111/pedi.12001](https://pmc.ncbi.nlm.nih.gov/articles/PMC3572265/).
These are published mean plasma-insulin increments, with insulin measurements
available for 12 participants. The euglycemic clamp maintained glucose; this is
not a free-running glucose-forecast experiment. Warming stopped after 60–90
minutes; a single smooth curve does not explicitly model that change.

## Locked comparison

Both empirical forms use

\[
C(t)=A(t/\tau)^p\exp[p(1-t/\tau)],\qquad C(0)=0.
\]

The original form fixes `p=1`. The alternative fixes `p=2`, allowing a different
early rise. The exponent is not estimated or selected on the held-out points.
`A >= 0` is the curve scale and `tau` its empirical peak time, not an identified
physiological absorption constant. The alternatives are empirical assumptions,
not biological laws derived from the publication.

| Model | Fixed exponent | Estimated parameters | Role |
| --- | --- | --- | --- |
| shared | 1 | One A, one tau (2) | Original diagnostic |
| timing | 1 | One A, two tau (3) | Previous primary, now diagnostic |
| amplitude | 1 | Two A, one tau (3) | Original diagnostic |
| both | 1 | Two A, two tau (4) | Primary original-form reference |
| shape2 | 2 | Two A, two tau (4) | Primary alternative |
| persistence | None | No curve fit | Last observed value per group |

Matching four estimated parameters avoids attributing improvement merely to
adding fitted parameters. It does not remove the exploratory nature of choosing
a new fixed form after viewing previous results.

At each origin (30, 60, 90 minutes), every curve model uses **only points at or
before that origin**, for both groups. The same fixed tau grid, 10, 12, ..., 180
minutes, is searched; each nonnegative amplitude is solved by least squares.
No model is chosen based on future error, and no extra curve shapes are tried
within the experiment. The three origins overlap and are not independent trials.

Forecasts at exactly +30 and +60 minutes are evaluated against the extracted
points; no target interpolation is used. At each horizon, MSE is the mean of the
two squared group errors, in `(uU/mL)^2`, not an individual-level accuracy metric.

Primary decision `shape_beats_both_references` requires `shape2` to beat BOTH
`both` and persistence by more than `1e-8` at BOTH horizons. Otherwise the result
is `mixed_or_no_improvement`. All older models, training errors, fitted
parameters, predictions and grid-boundary flags are retained regardless of the
decision. No significance tests, patient probabilities or pooled family claims.

## Reading sensitivity and verification

The five existing fixed digitization patterns are central; both groups +2;
both groups -2; heated +2/unheated -2; heated -2/unheated +2 uU/mL. Baseline
remains zero. Each pattern perturbs training and future points consistently.
These are selected stress patterns, not exhaustive uncertainty bounds, SEM or
confidence intervals. Robustness counts how many patterns meet the same primary
rule: all, some or none. A change of seed changes commitments, not these data.

The verifier recomputes candidate curves in log space and evaluates training
residuals directly, instead of using the adapter's sufficient-statistic SSE.
The original adapter similarly verifies its curves. This is arithmetic checking
of the same algorithm/data, **not independent biological or source validation**.
Tampered metrics, parameters, curve samples and provenance are rejected.

An identical-arm null control must give equal fitted parameters and predictions
for both arms. It does NOT require no improvement from `p=2`: changing a curve
form can improve predictions for identical arms too. Tests also recover a known
synthetic `p=2` curve, preserve predictions when future observations change, and
check the complete production report and plotting path with mocked services.

## Graphs and running

Choose `insulin-curve-shape` manually in **Oraklets forskningslabb** on `main`
after merge. Use seed `20261008` or leave it blank for the UTC date. Leave the
Problem Bank-ID empty unless it matches this exact catalog question.
The experiment is excluded from automatic planning because rerunning the same
public figure does not produce new empirical evidence.

The normal report appears in the existing Supabase-backed research lab. The
Actions artifact adds three PNG and three SVG graphs:
`curve-shape-origin-30`, `curve-shape-origin-60`, `curve-shape-origin-90`.
Each graph has separate panels for each group and for old-model diagnostics
versus the primary form/persistence comparison. Training curves are solid;
forecasts are dashed over a shaded future region. Filled points are training
observations, hollow points future observations and crosses evaluated targets.
The plots show the central reading only; tables contain all five stress cases.
Future observations are displayed for inspection but never used in fitting.

Plots are generated by the pinned Matplotlib environment after the report is
saved, including completed cases in a partial failure report. The plotting
script checks samples against saved parameters and never refits the models.
`curve-plots.json` records the source report hash, renderer version and image
hashes. Plots are in the downloadable artifact; they are not embedded images in
the website or GitHub summary. No website deployment or database migration is
required.

For local development:

```sh
python3 -m pip install -r research/plot-requirements.lock
npm test
python3 scripts/plot_insulin_curves.py reports/oraklet-lab/report.json
```

Budget: three model proposals and six local tool calls (observed and identical
arm control for each origin). Oraklet's proposal accuracy is separate from the
computed outcome; wrong proposals retain the complete evidence. A better fit or
an optimum inside the grid does not establish physiological identifiability.
No dose optimization, continuous temperature law, PINN or Kalman filter is used.
