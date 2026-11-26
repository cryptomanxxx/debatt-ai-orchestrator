# Professor Oraklets dag – 2026-11-26

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 20 träffar hittade, 10 sammanfattningar arkiverade, 5 sammanfattningar analyserade, 12 citerade fynd. Modellanrop: 7 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 2 av 3 fall godkända
- **Dagens artikel:** [Hur väl Oraklets resonemang håller](artiklar/2026-11-26.md)
- **OpenAI:s matematiksamling:** familj 066, 067, 068 (plats 64 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Beat This! Live - Online Beat and Downbeat Tracking by Predicting the Future | summarized | 3 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| FlashProve-Next: Verifiable Inference for Production LLM APIs | summarized | 2 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| B-SLIM: BART Sparse Linear Interactions Model for Heterogeneous Treatment Effects | summarized | 3 |

### Utdrag ur fynden

- **method:** Adapted the offline Beat This model into a causal, low‑latency online version named Beat This! Live. *(Beat This! Live - Online Beat and Downbeat Tracking by Predicting the Future)*
- **method:** Trained the model with temporally shifted labels to predict slightly ahead of the current frame, reducing latency and improving peak‑picking. *(Beat This! Live - Online Beat and Downbeat Tracking by Predicting the Future)*
- **result:** On GTZAN, the beat F1 increased from 80.6 to 86.7 and downbeat F1 from 56.5 to 74.1 versus BeatNet+. *(Beat This! Live - Online Beat and Downbeat Tracking by Predicting the Future)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **result:** Calibration across five models showed zero false rejections over millions of GEMM/MoE and non‑GEMM blocks. *(FlashProve-Next: Verifiable Inference for Production LLM APIs)*
- **limitation:** Cross‑architecture hiding is not yet supported and is deferred to future work. *(FlashProve-Next: Verifiable Inference for Production LLM APIs)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **result:** Elevated temperature and solar radiation explained 57% of the ozone increase. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

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
| rankscreen-consistency | 20261126 | failed | 2 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 46 körningarna med register (högst 200): 49 preliminärt stödda, 13 avvisade och 13 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 7 (1 / 6) | svaret klipptes vid tokengränsen ×6; fel minsta antal ingrepp ×1 | 0.82 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 18 | 11 | 0 (0 / 0) | avvisat av verifieraren ×11 | 0.39 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 46 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 79 % | 49 stödda, 13 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 13 (4 / 9) | 75 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 79 % (0.2073) | 67 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 13 av 35 | körningar planerade med minnet; relativ placering i snitt 0.4571 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 066. [Bounded klt complements for Fano contractions](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Bounded-klt-complements-for-Fano-contractions-September-25-2026) | Algebraic and complex geometry | huvudresultat | nej |
| 067. [The Campana–Peternell conjecture in dimension six](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/The-Campana-Peternell-conjecture-in-dimension-six-September-25-2026) | Algebraic and complex geometry | nej | ja; omkörd: pass |
| 068. [Anticanonical nonvanishing in every dimension](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Anticanonical-nonvanishing-from-smooth-semipositivity-September-26-2026) | Algebraic and complex geometry | nej | nej |

- Familj 066: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 067: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 068: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
