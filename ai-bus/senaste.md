# Professor Oraklets dag – 2026-11-14

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 20 träffar hittade, 10 sammanfattningar arkiverade, 10 sammanfattningar analyserade, 27 citerade fynd. Modellanrop: 6 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 1 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar, ordet "upptäckt"; tidigare utkast avvisades: texten hänvisade till underlag som inte finns; texten hänvisade till underlag som inte finns)
- **OpenAI:s matematiksamling:** familj 028, 029, 030 (plats 28 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| A Sensitivity Framework for Assessing External Validity | summarized | 3 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Learning Mixtures of Exponential Family | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| FADO: Learning Causal Explanations with Prior-Fitted Networks | summarized | 2 |
| Integrated machine learning and causal inference reveal CHRDL1 as a diagnostic and functional biomarker in NSCLC | summarized | 3 |
| Machine learning-causal inference based on multi-omics data reveals the association of altered gut bacteria and bile acid metabolism with neonatal jaundice | summarized | 3 |
| Machine Learning in Causal Inference: Application in Pharmacovigilance | summarized | 3 |
| Machine learning and causal inference applied to the gut metagenome-metabolome axis reveals a link between neonatal jaundice and autism spectrum disorder | summarized | 3 |
| Beyond Prediction: Explaining Health Disparities in Diabetes Risk Through Fairness-Aware Machine Learning and Causal Inference | summarized | 3 |

### Utdrag ur fynden

- **method:** Introduces a partial identification framework for assessing external validity across site-level variables. *(A Sensitivity Framework for Assessing External Validity)*
- **method:** Proposes a novel debiasing approach yielding semiparametrically efficient estimators for constrained optimization estimands. *(A Sensitivity Framework for Assessing External Validity)*
- **result:** Demonstrates construction of external‑validity intervals for a held‑out country using multi‑site microcredit data. *(A Sensitivity Framework for Assessing External Validity)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** The authors introduce a convex-loss estimator that sidesteps the log-partition function, solving a convex program for each fixed label assignment. *(Learning Mixtures of Exponential Family)*
- **result:** The conditional population loss uniquely determines both the interaction matrix and each sample’s linear parameter. *(Learning Mixtures of Exponential Family)*
- **result:** Finite‑sample bounds are proven for the global empirical minimizer on interaction error (Frobenius norm) and average squared linear‑parameter error. *(Learning Mixtures of Exponential Family)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

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
- Covariate selection and adjustment for efficacy and safety endpoints in indirect comparative effectiveness analyses of CAR-T-cell therapies for large B-cell lymphoma: a systematic review (2026)
- DeepLearningCausal: R Package for Estimating Treatment Effects Using Deep Neural Networks and Ensemble Learning (2026)
- Causal effects of unintended pregnancy on adverse birth outcomes: A target trial emulation analysis (2026)
- A Systematic Literature Review of the Effectiveness of CDK 4/6 Inhibitors for First-Line Treatment of HR+/HER2− Advanced/Metastatic Breast Cancer: A Comparison of Real-World Evidence (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-design | 20261114 | failed | 0 av 1 | – |

## Oraklets egna experiment

Experiment som Oraklet själv utformade (`act-map-design`): en egen orsaksmekanism som deklarativ specifikation, en förregistrerad förutsägelse om dess identifierbarhet, och undersökningen när labbet gömt mekanismen i okända system. Förutsägelsen avgörs av labbets uppräkning, undersökningen av evidensgrinden; inget av det är Oraklets eget omdöme.

### act-map-design, seed 20261114

Ingen giltig mekanism (spec:truncated); inget påstående prövades.

## Kunskapsminne (VEM-Sci)

Från de senaste 34 körningarna med register (högst 200): 38 preliminärt stödda, 10 avvisade och 11 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 5 (1 / 4) | svaret klipptes vid tokengränsen ×4; fel minsta antal ingrepp ×1 | 0.78 |
| rankscreen-consistency | 10 | 8 | 0 (0 / 0) | avvisat av verifieraren ×8 | 0.45 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 34 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 79 % | 38 stödda, 10 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 11 (4 / 7) | 59 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 79 % (0.2054) | 53 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 11 av 25 | körningar planerade med minnet; relativ placering i snitt 0.4094 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 028. [Uniformly bounded components of Gaussian-prime graphs](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Bounded-Step-Walks-on-Gaussian-Primes-September-26-2026) | Number theory | huvudresultat | nej |
| 029. [Primitive roots for every admissible integer base](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Primitive-roots-for-every-admissible-integer-base-October-4-2026) | Number theory | nej | nej |
| 030. [Modularity of elliptic curves over imaginary quadratic fields](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Modularity-of-elliptic-curves-over-imaginary-quadratic-fields-October-4-2026) | Number theory | nej | nej |

- Familj 028: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 029: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 030: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
