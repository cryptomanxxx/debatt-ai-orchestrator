# Perturb-seq: held-out gene knockouts

`perturbseq-holdout` is the lab's first automatic experiment on real measurements the model has not been shown. Oraklet predicts how strongly knocking out a gene changes transcription in one neuron type, for genes whose data the original authors held out of a published screen, and is scored against their locked counts and two fixed baselines.

## Source

Sun A, Park JJ, DeTomaso D, et al. *Distributed AI agents enable comprehensive discovery of biological insights at scale.* bioRxiv (2026), [doi:10.64898/2026.10.15.759436](https://doi.org/10.64898/2026.10.15.759436). Data from [jinlabneurogenomics/distributed_agent](https://github.com/jinlabneurogenomics/distributed_agent/tree/c20445d929f5aedce1d539ef6fbd8843b8c06e25) at commit `c20445d`, MIT-licensed repository:

- `data/inputs/holdout/151_TH_Prkcd_Grin2c_Glut_deg_counts_training.csv`: 1,674 training knockouts (SHA-256 `48fb8105…`).
- `data/inputs/holdout/151_TH_Prkcd_Grin2c_Glut_deg_counts_holdouts.csv`: 272 held-out knockouts (SHA-256 `2b037b12…`).

The screen is acute, sparse CRISPR-Cas9 loss of function in postmitotic mouse neurons (AAV at P16, single-nucleus RNA-seq at P37–44). The endpoint `n_degs` is the number of measured genes with a Benjamini–Hochberg-adjusted Wilcoxon p < 0.05 in `151 TH Prkcd Grin2c Glut` (thalamic glutamatergic) cells.

`research/data/perturbseq-holdout.json` is the two CSVs converted by `research/import-perturbseq-holdout.mjs`, which checks both source hashes. The module refuses to load if the snapshot's own SHA-256 (`1afb917d…`) changes.

## Protocol `perturbseq-holdout-v1`

Classes: `none` (0 DEGs), `weak` (1–49), `strong` (at least 50). The held-out set has 172 / 72 / 28.

1. **Commitment before predictions.** The seed orders each class by SHA-256 and draws three disjoint batches of 12 genes: 6 `none`, 4 `weak`, 2 `strong`. That is 36 genes per run. Their commitments are written before any model call.
2. **What Oraklet sees per case:** the 12 gene symbols, the training class counts, the 30 strongest training knockouts and a seeded sample of 30 other training knockouts with their counts. It does not see expression profiles, held-out counts or the batch composition. It answers `predictions` (one class per gene) and `reason`. The lab's calibration rule adds `confidence`.

   The parser accepts common shapes: a Markdown fence, capitalised classes, gene keys in another case, a list of `{gene, class}` rows, or per-gene objects. Any other answer gets one format correction per case. The request is repeated with a fixed description of the problem, never the model's own text. The case records `formatCorrection`, and its first proposal counts as not passed. A second unreadable answer stops the run with `invalid_model_proposal` and names the case.
3. **Evidence.** The local tool returns the held-out counts and both baselines for the batch. The verifier recomputes everything on a separate code path (alternative class thresholds, prefix search and scoring) and rejects any difference.
4. **Baselines.**
   - Always `none`. This scores exactly 0.5 by construction.
   - Symbol family: the median count of training genes sharing the longest gene-symbol prefix, if that prefix is at least four characters; otherwise `none`.

   The four-character threshold was fixed before any run. On all 272 held-out genes it scores 64% three-class accuracy versus 63% for always-`none`. On the stratified batches, across ten seeds, it averages 54%. This baseline sees the whole training table; Oraklet sees only the summary.
5. **Pass rule per case:** Oraklet's three-class accuracy must be strictly above always-`none` and at least equal to the symbol family. Reports also give effect versus no-effect accuracy, the confusion matrix, per-gene tables and the run total over 36 genes.

The run uses one planning call and three experiment calls, at most six with format corrections (≤ 7 in total). It also uses three tool calls (≤ 6).

## Published reference points

The authors' own full-set results (`task1_deg_count_comparison.csv`) were scored on all 272 genes as zero versus non-zero. Their agents also saw expression signatures. With roughly 0.72–0.75 accuracy against 0.63 for always-zero, they are context, not a directly comparable score.

## Limitations

- One cell type and one summary measure from one screen. DEG counts also depend on cell numbers and statistical power.
- The authors chose the held-out genes (no-effect, depletion and cluster groups), so the held-out set is not a random sample of the screen.
- Twelve genes per case is noisy. Conclusions need many runs; use the cross-run calibration and the per-run totals.
- The data were published in October 2026 in a public repository. A model trained later could have seen the answers. Lab calls have no web access.
- This is a prediction test, not a new biological finding.
