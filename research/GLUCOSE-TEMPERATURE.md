# Temperature, insulin absorption and model transfer

Run `glucose-temperature-evidence` manually in **Oraklets forskningslabb** on
main after merging. No new packages, keys, GPU or database migration are required.
This is a reanalysis of published aggregate results, not a new human experiment.
Repeated seeds change commitments only; they do not create new empirical data.
The automatic daily planner excludes this fixed-data literature audit.

## Question

What evidence connects measured temperature with insulin absorption, and is it
enough to determine a transferable temperature-response curve? There are three
locked cases, selected by a targeted primary-source search, not a systematic review:

| Case | Public data used | Analysis |
| --- | --- | --- |
| [1981](https://pubmed.ncbi.nlm.nih.gov/7010077/) | Ambient 20/35 °C; reported disappearance-rate ratio 1.5–1.6, n=6 | Two assumed interpolations with identical endpoints |
| [1988](https://diabetesjournals.org/care/article/11/10/769/1857/Combined-Effect-of-Exercise-and-Ambient) | Ambient 10/30 °C; reported absorption ratio 3–5, n=9 | Descriptive transfer from 1981 without refitting |
| [2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6835184/) | Local skin cooling/warming, glargine; Table 3 normalized insulin-AUC summaries, n=14 | Separate ratios and the original p-values; no absorption-rate fit |

The reviewed extraction is `temperature-evidence.json`, locked by a byte-level
SHA-256 in `glucose-temperature.mjs`. It holds source URLs, DOI, location, endpoint,
context and extraction date. A changed source file requires a reviewed hash update.
Runtime never scrapes changing pages or silently downloads patient data.

## Temperature curves and transfer

Let r be a reported warm/cold ratio, x=(T−Tcold)/(Twarm−Tcold). Compare
`R_log(T)=r^x` and `R_linear(T)=1+(r−1)*x` inside each source's temperature range.
Both match the two endpoints but differ at intermediate temperatures. These
normalized response curves are deliberate model assumptions, not measurements
between endpoints, validated absorption constants or glucose predictions.
Reported ranges are descriptive spans, not confidence intervals.

Assume the first study's constant log slope transfers to the second contrast:
`R_1988_assumed = r_1981^(20/15)`. This gives approximately 1.7171–1.8714,
outside the reported target span. The target's 10 °C is also outside the first
study's 20–35 °C domain. Report this as an assumption/transport mismatch, not a
formal statistical rejection of a shared causal effect. Insulin, outcome metric,
meal and exercise conditions differ; no cross-study pooling or meta-analysis occurs.
Both summaries were known when selecting this protocol, so the target is not a
prospective or independently held-out validation dataset.

The local study is kept separate. Serum-insulin AUC reflects more than depot
absorption. Room temperature is not substituted for an unmeasured control skin
temperature. Published p-values are retained, not regenerated from summary SDs:
within-person covariance is unavailable. Failure to detect a warming/control
difference does not prove no warming effect. Study caveats are in the source file.

## Execution, interpretation and controls

Commit the protocol and data fingerprint before Oraklet's response. The model
receives published inputs; its task is interpretation, not a blind prediction of
unseen clinical observations. It identifies the evidence decision and whether a
unique temperature law has been determined. `passed` scores this response,
separately from descriptive empirical results.

There are three model calls and six bounded local tool calls: original data and
a synthetic equality control per case. Controls set response ratios to one and
publish no fabricated p-values. They are labelled synthetic, never new patient
observations. Alternative arithmetic verifies transformations and source integrity;
it cannot verify extraction accuracy, reproduce the original statistical analysis
or certify biology. Source extraction remains reviewable against the linked papers.

Reports include source provenance, each assumed curve, the transfer comparison
and local contrasts. Partial results survive later execution errors. Tests reject
forged results, changed source bytes, unknown studies and user-supplied temperatures.

This experiment deliberately does not modify the existing synthetic glucose model.
It supplies no temperature-to-ka lookup, clinical glucose forecast, individualized
absorption curve or insulin-dose recommendation. To estimate those relationships
requires suitable raw data, explicit insulin/site/exercise context and independent
validation. No intervention on the user or family is part of this experiment.
