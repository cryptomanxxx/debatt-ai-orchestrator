# Professor Oraklets dag – 2026-10-31

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 9 sammanfattningar analyserade, 23 citerade fynd. Modellanrop: 4 av 12.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 0 fall godkända
- **Dagens artikel:** ingen i dag (en siffra fanns inte i det hänvisade underlaget; även första utkastet avvisades: texten överdrev vad verifieringen visar, ordet "bekräftades")

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Alpha-TCM: A Nine-Layer Framework for TCM-Guided Multimodal Inference and Structured-Prior Auditing | error | 0 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Deep Learning for Causal Inference | summarized | 2 |
| Evaluating Causal Reasoning in LLMs: A Case Study in the Challenges of Procedural Generation | summarized | 2 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| Integrated machine learning and causal inference reveal CHRDL1 as a diagnostic and functional biomarker in NSCLC | summarized | 3 |
| Machine learning-causal inference based on multi-omics data reveals the association of altered gut bacteria and bile acid metabolism with neonatal jaundice | summarized | 3 |
| Machine Learning in Causal Inference: Application in Pharmacovigilance | summarized | 3 |
| Machine learning and causal inference applied to the gut metagenome-metabolome axis reveals a link between neonatal jaundice and autism spectrum disorder | summarized | 3 |
| Explainable machine learning and causal inference reveal habitat-specific environmental and functional-trait drivers of zooplankton biodiversity in a karst rive | summarized | 3 |

### Utdrag ur fynden

- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Provides an introduction to building and optimizing custom deep learning models for heterogeneous treatment effect estimation. *(Deep Learning for Causal Inference)*
- **limitation:** Current causal inference methods do not yet handle non-linear, time‑varying, or text/network/image confounding. *(Deep Learning for Causal Inference)*
- **result:** Simple models such as random forests achieve high performance on CLadder-generated data after training on a sample. *(Evaluating Causal Reasoning in LLMs: A Case Study in the Challenges of Procedural Generation)*
- **result:** Commercial LLMs are extremely brittle on CLadder tests, and removing critical text sections has little impact on their performance. *(Evaluating Causal Reasoning in LLMs: A Case Study in the Challenges of Procedural Generation)*
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

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| Oraklets experiment kunde inte slutföras | 20261031 | driftfel | 0 av 0 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 20 körningarna med register (högst 200): 29 preliminärt stödda, 2 avvisade och 6 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| rankscreen-consistency | 5 | 1 | 0 (0 / 0) | avvisat av verifieraren ×1 | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 20 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 94 % | 29 stödda, 2 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 6 (3 / 3) | 37 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 91 % (0.0841) | 35 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8571 mot 2.6429 | 14 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 6 av 12 | körningar planerade med minnet; relativ placering i snitt 0.3824 (0 = högst), 5 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
