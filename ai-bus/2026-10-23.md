# Professor Oraklets dag – 2026-10-23

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 9 sammanfattningar analyserade, 23 citerade fynd. Modellanrop: 7 av 10.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 1 väntar på ditt godkännande
- **Experiment senaste dygnet:** 13 körningar, 17 av 31 fall godkända

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| METTA: Memory-Enhanced Test-Time Adaptation for Meta-Reinforcement Learning | summarized | 2 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Deep Learning for Causal Inference | summarized | 2 |
| Improving Outcomes in Machine Learning and Data-Driven Learning Systems using Structural Causal Models | unavailable | 0 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| Integrated machine learning and causal inference reveal CHRDL1 as a diagnostic and functional biomarker in NSCLC | summarized | 3 |
| Machine learning-causal inference based on multi-omics data reveals the association of altered gut bacteria and bile acid metabolism with neonatal jaundice | summarized | 3 |
| Machine Learning in Causal Inference: Application in Pharmacovigilance | summarized | 3 |
| Machine learning and causal inference applied to the gut metagenome-metabolome axis reveals a link between neonatal jaundice and autism spectrum disorder | summarized | 3 |
| Explainable machine learning and causal inference reveal habitat-specific environmental and functional-trait drivers of zooplankton biodiversity in a karst rive | summarized | 3 |

### Utdrag ur fynden

- **result:** On Meta-World ML10/45 test environments, METTA attains a success rate exceeding 50% with low training cost and short runtime. *(METTA: Memory-Enhanced Test-Time Adaptation for Meta-Reinforcement Learning)*
- **result:** On long‑context sparse‑reward PointMaze tasks, METTA outperforms transformer baselines by showing more structured exploration. *(METTA: Memory-Enhanced Test-Time Adaptation for Meta-Reinforcement Learning)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Provides an introduction to building and optimizing custom deep learning models for heterogeneous treatment effect estimation. *(Deep Learning for Causal Inference)*
- **limitation:** Current causal inference methods do not yet handle non-linear, time‑varying, or text/network/image confounding. *(Deep Learning for Causal Inference)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **result:** Elevated temperature and solar radiation explained 57% of the ozone increase. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **limitation:** Chemical transport models are computationally intensive, and machine learning struggles with confounding and causality. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

möjlig överlappning hittad; 9 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- A Comprehensive Review and Tutorial on Confounding Adjustment Methods for Estimating Treatment Effects Using Observational Data (2024)
- Covariate selection and adjustment for efficacy and safety endpoints in indirect comparative effectiveness analyses of CAR-T-cell therapies for large B-cell lymphoma: a systematic review (2026)
- Causal effects of unintended pregnancy on adverse birth outcomes: A target trial emulation analysis (2026)
- A Systematic Literature Review of the Effectiveness of CDK 4/6 Inhibitors for First-Line Treatment of HR+/HER2− Advanced/Metastatic Breast Cancer: A Comparison of Real-World Evidence (2026)
- Application of Causal Inference to Establish Assay Effect in the Absence of a Bridging Study: A Case Study of MenACWY ‐ CRM Conjugate Vaccine Data (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)
- `oraklet-shallow-water-hybrid-001` → `shallow-water-hybrid`: väntar på godkännande (manuellt experiment). Litteratur: Does a physics-informed estimator improve held-out state estimation under changing flow conditions? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-tree | 2 | passed | 2 av 2 | – |
| act-map-budget | 2 | passed | 2 av 2 | – |
| act-map-tree | 2 | failed | 1 av 2 | – |
| act-map-transfer | 2 | failed | 2 av 3 | – |
| sympy-quadratic | 20261023 | passed | 3 av 3 | 3/3 av 3 |
| act-map-transfer | 3 | failed | 2 av 3 | – |
| act-map-transfer | 2 | driftfel | 1 av 2 | – |
| act-map-transfer | 20261022 | driftfel | 1 av 1 | – |
| perturbseq-holdout | 1 | failed | 0 av 3 | 0/0 av 3 |
| sklearn-polynomial | 1 | driftfel | 2 av 2 | – |
| perturbseq-holdout | 20261022 | failed | 0 av 3 | error |
| perturbseq-holdout | 20261022 | failed | 1 av 3 | – |
| perturbseq-holdout | 20261022 | driftfel | 0 av 2 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 9 körningarna med register (högst 200): 15 preliminärt stödda, 1 avvisade och 4 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 2 | 0 | 2 (1 / 1) | svaret klipptes vid tokengränsen (nivå 4) ×1 | 0.50 |
| act-map-transfer | 5 | 1 | 2 (1 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.40 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 9 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 94 % | 15 stödda, 1 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 4 (2 / 2) | 20 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 89 % (0.1019) | 19 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 67 % | 2 av 3; per nivå 2: 1/1, 3: 0/1, 4: 1/1 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 100 % | 2 av 2; per nivå 3: 1/1, 4: 1/1 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.7143 mot 2.2857 | 7 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 2 av 2 | körningar planerade med minnet; relativ placering i snitt 0 (0 = högst), 2 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
