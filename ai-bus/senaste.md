# Professor Oraklets dag – 2026-11-18

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 9 sammanfattningar arkiverade, 4 sammanfattningar analyserade, 10 citerade fynd. Modellanrop: 5 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 2 av 3 fall godkända
- **Dagens artikel:** ingen i dag (model\_output\_truncated, openai/openai/gpt-oss-120b; tidigare utkast avvisades: texten var inte 250–900 ord)
- **OpenAI:s matematiksamling:** familj 040, 041, 042 (plats 40 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)
- **Driftfel:** article (se nedan)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| The Kernel Reality Check: Benchmarking and Distilling Efficient Attention at Scale | summarized | 3 |
| Applied Statistics and Machine Learning for Social Science Research | insufficient\_evidence | 0 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Maximum Scores and Treatment Feedback in Regression Discontinuity Designs | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |

### Utdrag ur fynden

- **method:** LARA++ is introduced as a principled extension of LARA that uses importance sampling with adaptive proposals to approximate softmax. *(The Kernel Reality Check: Benchmarking and Distilling Efficient Attention at Scale)*
- **result:** FlashAttention uses less memory and runs faster than state‑of‑the‑art kernelized attention methods for training and vision transformers across most sequence lengths. *(The Kernel Reality Check: Benchmarking and Distilling Efficient Attention at Scale)*
- **limitation:** LARA++ still incurs substantial computational overhead, so the efficiency advantage is not achieved. *(The Kernel Reality Check: Benchmarking and Distilling Efficient Attention at Scale)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** A two-assessment model is used to derive a formula separating the RD contrast into causal and composition components. *(Maximum Scores and Treatment Feedback in Regression Discontinuity Designs)*
- **result:** Simulations show that a true 4‑percentage‑point risk reduction can appear as a one‑point increase. *(Maximum Scores and Treatment Feedback in Regression Discontinuity Designs)*
- **limitation:** The authors do not evaluate the method on any published clinical study. *(Maximum Scores and Treatment Feedback in Regression Discontinuity Designs)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 1 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: granskningskö skapad.

| # | Gren | Hypotes |
| --- | --- | --- |
| 1 | candidate | The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested. |
| 2 | null-test | Test whether the candidate intervention fails to improve the primary outcome over a matched baseline under pre-registered held-out conditions. |
| 3 | replication | Test whether the candidate intervention changes the primary outcome relative to a matched baseline on independent held-out data. |
| 4 | candidate | The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested. |
| 5 | null-test | Test whether the candidate intervention fails to improve the primary outcome over a matched baseline under pre-registered held-out conditions. |
| 6 | replication | Test whether the candidate intervention changes the primary outcome relative to a matched baseline on independent held-out data. |

## Nyhetskontroll (citeringsgraf)

möjlig överlappning hittad; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- A Comprehensive Review and Tutorial on Confounding Adjustment Methods for Estimating Treatment Effects Using Observational Data (2024)
- Causal Effect Estimation using identifiable Variational AutoEncoder with Latent Confounders and Post-Treatment Variables (2024)
- Covariate selection and adjustment for efficacy and safety endpoints in indirect comparative effectiveness analyses of CAR-T-cell therapies for large B-cell lymphoma: a systematic review (2026)
- Quantized Factor Identifiable Causal Effect Variational Autoencoder (2025)
- TLRNet: Estimating Individual Treatment Effect based on Local Information and Single Learner Structure (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261119 | failed | 2 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 38 körningarna med register (högst 200): 43 preliminärt stödda, 11 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 6 (1 / 5) | svaret klipptes vid tokengränsen ×5; fel minsta antal ingrepp ×1 | 0.80 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 12 | 9 | 0 (0 / 0) | avvisat av verifieraren ×9 | 0.43 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 38 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 43 stödda, 11 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 12 (4 / 8) | 66 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.2015) | 59 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 12 av 28 | körningar planerade med minnet; relativ placering i snitt 0.4202 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 040. [Bloch’s conjecture for complex surfaces](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Blochs-Conjecture-for-Surfaces-with-pg-equals-q-equals-0-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 041. [Hyperkähler SYZ and projective-space bases](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Projective-Space-Bases-of-Lagrangian-Fibrations-September-23-2026) | Algebraic and complex geometry | nej | nej |
| 042. [Oka classification for minimal compact complex surfaces: Kodaira dimension zero and class VII](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Every-complex-K3-surface-is-Oka-September-23-2026) | Algebraic and complex geometry | nej | nej |

- Familj 040: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 041: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 042: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
