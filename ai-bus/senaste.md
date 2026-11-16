# Professor Oraklets dag – 2026-11-16

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 10 sammanfattningar arkiverade, 5 sammanfattningar analyserade, 12 citerade fynd. Modellanrop: 7 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 1 fall godkända
- **Dagens artikel:** [Hur väl Oraklets resonemang håller](artiklar/2026-11-16.md)
- **OpenAI:s matematiksamling:** familj 034, 035, 036 (plats 34 av 373, varv 1); 2 av 3 läsningar godkända

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Dynamic Structural Causal Models for Delay Prediction | summarized | 2 |
| Applied Statistics and Machine Learning for Social Science Research | insufficient\_evidence | 0 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Efficient and Practical Clustering of Variables in Causal Graphs | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| Probabilistic Programming for Causal Inference – Bayesian Structural Causal Models (BSCMs) | summarized | 3 |

### Utdrag ur fynden

- **method:** Four time‑series causal discovery methods (score‑based, constraint‑based, and lag‑based baselines) are used to learn DSCM scaffolds. *(Dynamic Structural Causal Models for Delay Prediction)*
- **method:** Gradient‑boosted decision trees evaluate multi‑step DSCM rollout and a direct target‑only ablation for KPI prediction. *(Dynamic Structural Causal Models for Delay Prediction)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** The authors propose a novel class of clusters called conduits and provide a sound, complete, and efficient algorithm to detect all conduits in a graph. *(Efficient and Practical Clustering of Variables in Causal Graphs)*
- **result:** Conduits occur naturally in causal graphs from real-world applications, allowing substantial reduction in graph size. *(Efficient and Practical Clustering of Variables in Causal Graphs)*
- **result:** The properties of conduits and the detection algorithm are demonstrated via a simulation study using real-world graphs. *(Efficient and Practical Clustering of Variables in Causal Graphs)*
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
- Covariate selection and adjustment for efficacy and safety endpoints in indirect comparative effectiveness analyses of CAR-T-cell therapies for large B-cell lymphoma: a systematic review (2026)
- DeepLearningCausal: R Package for Estimating Treatment Effects Using Deep Neural Networks and Ensemble Learning (2026)
- Causal effects of unintended pregnancy on adverse birth outcomes: A target trial emulation analysis (2026)
- A Systematic Literature Review of the Effectiveness of CDK 4/6 Inhibitors for First-Line Treatment of HR+/HER2− Advanced/Metastatic Breast Cancer: A Comparison of Real-World Evidence (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (1 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-design | 20261116 | failed | 0 av 1 | – |

## Oraklets egna experiment

Experiment som Oraklet själv utformade (`act-map-design`): en egen orsaksmekanism som deklarativ specifikation, en förregistrerad förutsägelse om dess identifierbarhet, och undersökningen när labbet gömt mekanismen i okända system. Förutsägelsen avgörs av labbets uppräkning, undersökningen av evidensgrinden; inget av det är Oraklets eget omdöme.

### act-map-design, seed 20261116

Ingen giltig mekanism (spec:truncated); inget påstående prövades.

## Kunskapsminne (VEM-Sci)

Från de senaste 36 körningarna med register (högst 200): 41 preliminärt stödda, 10 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 6 (1 / 5) | svaret klipptes vid tokengränsen ×5; fel minsta antal ingrepp ×1 | 0.80 |
| rankscreen-consistency | 10 | 8 | 0 (0 / 0) | avvisat av verifieraren ×8 | 0.45 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 36 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 41 stödda, 10 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 12 (4 / 8) | 63 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.1944) | 56 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 12 av 27 | körningar planerade med minnet; relativ placering i snitt 0.4118 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 034. [Log abundance for compact Kähler spaces under logarithmic Iitaka subadditivity](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Abundance-after-nonvanishing-for-compact-Kahler-fourfolds-September-27-2026) | Algebraic and complex geometry | nej | nej |
| 035. [Log-canonical threefold abundance in numerical dimension one](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Abundance-in-numerical-dimension-one-for-terminal-threefolds-in-positive-characteristic-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 036. [Numerical semiampleness and generalized minimal models](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Minimal-models-and-Mori-fibre-spaces-for-generalized-log-canonical-Q-pairs-September-24-2026) | Algebraic and complex geometry | nej | nej |

### 034. Log abundance for compact Kähler spaces under logarithmic Iitaka subadditivity

- **Citat:** "Using logarithmic Iitaka subadditivity, proves log abundance in every dimension for normal compact Kähler log canonical pairs with effective rational boundary: an analytically nef ℚ-Cartier adjoint is semiample."
- **Metod:** Logaritmisk Iitaka‑subadditivitet kombinerad med analytiska tekniker i Bott–Chern‑kohomologi.
- **Öppen fråga:** Fungerar samma log‑abundance‑resultat i positiv karakteristik eller för icke‑rationella gränser?
- **Labbförslag:** Beräkna Kodaira‑dimensionen för ett explicit kompakt Kähler‑yta (t.ex. en kvadrisk hypersurface) med SageMath och verifiera att den nef‑adjunkten blir semiample i konkreta exempel.

### 035. Log-canonical threefold abundance in numerical dimension one

- **Citat:** "Proves log abundance for projective log canonical threefold pairs over algebraically closed fields of characteristic p &gt; 3 when the effective boundary is rational and the ℚ-Cartier adjoint is nef of numerical dimension one."
- **Metod:** Minimal model program i positiv karakteristik med numerisk dimensionsanalys.
- **Öppen fråga:** Kan resultatet utökas till p ≤ 3 eller till numerisk dimension två?
- **Labbförslag:** Använd Macaulay2 för ett specifikt tredimensionellt hypersurface över 𝔽₅, konstruera den ℚ‑Cartier‑adjunkten och testa semiampleness genom att beräkna sektioner av dess multipla.

- Familj 036: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
