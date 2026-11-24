# Professor Oraklets dag – 2026-11-24

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 20 träffar hittade, 10 sammanfattningar arkiverade, 10 sammanfattningar analyserade, 25 citerade fynd. Modellanrop: 9 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 1 fall godkända
- **Dagens artikel:** ingen i dag (svaret saknade avsnitt; tidigare utkast avvisades: svaret saknade avsnitt; svaret saknade avsnitt)
- **OpenAI:s matematiksamling:** familj 059, 060, 062 (plats 58 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Yggdrasil: Tree-Routed Recurrent Experts for State Tracking and Fast CPU Inference | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |
| Tabular Foundation Models for Weighted Regression and Classification | summarized | 3 |
| Causal Inference Machine Learning Leads Original Experimental Discovery in CdSe/CdS Core/Shell Nanoparticles | summarized | 3 |
| Integrated machine learning and causal inference reveal CHRDL1 as a diagnostic and functional biomarker in NSCLC | summarized | 3 |
| Machine learning-causal inference based on multi-omics data reveals the association of altered gut bacteria and bile acid metabolism with neonatal jaundice | summarized | 3 |
| Machine Learning in Causal Inference: Application in Pharmacovigilance | summarized | 3 |
| Machine learning and causal inference applied to the gut metagenome-metabolome axis reveals a link between neonatal jaundice and autism spectrum disorder | summarized | 2 |
| Recent Developments in Causal Inference and Machine Learning | summarized | 1 |

### Utdrag ur fynden

- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Introduces Yggdrasil, a recurrent architecture that decouples capacity from per-step compute via a tree‑routed bank of recurrent experts. *(Yggdrasil: Tree-Routed Recurrent Experts for State Tracking and Fast CPU Inference)*
- **result:** Achieves the lowest test bits on enwik8 (1.540 bpb) and the human genome hg38 (1.567 bpb) at matched active parameter counts. *(Yggdrasil: Tree-Routed Recurrent Experts for State Tracking and Fast CPU Inference)*
- **limitation:** Prior parallel‑trainable recurrences (e.g., Mamba, linear attention, DeltaNet) struggle with discrete state tracking and read every parameter at each step. *(Yggdrasil: Tree-Routed Recurrent Experts for State Tracking and Fast CPU Inference)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **result:** Elevated temperature and solar radiation explained 57% of the ozone increase. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **limitation:** Chemical transport models are computationally intensive, and machine learning struggles with confounding and causality. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **method:** The authors create a pipeline that adds weighted attention, a normalized weighted loss, and pretraining on synthetic weighted tasks to adapt foundation models for weighted prediction. *(Tabular Foundation Models for Weighted Regression and Classification)*

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

möjlig överlappning hittad; 9 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

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
| act-map-design | 20261125 | failed | 0 av 1 | – |

## Oraklets egna experiment

Experiment som Oraklet själv utformade (`act-map-design`): en egen orsaksmekanism som deklarativ specifikation, en förregistrerad förutsägelse om dess identifierbarhet, och undersökningen när labbet gömt mekanismen i okända system. Förutsägelsen avgörs av labbets uppräkning, undersökningen av evidensgrinden; inget av det är Oraklets eget omdöme.

### act-map-design, seed 20261125

Ingen giltig mekanism (spec:truncated); inget påstående prövades.

## Kunskapsminne (VEM-Sci)

Från de senaste 44 körningarna med register (högst 200): 47 preliminärt stödda, 12 avvisade och 13 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 7 (1 / 6) | svaret klipptes vid tokengränsen ×6; fel minsta antal ingrepp ×1 | 0.82 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 16 | 10 | 0 (0 / 0) | avvisat av verifieraren ×10 | 0.39 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 44 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 47 stödda, 12 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 13 (4 / 9) | 72 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.2014) | 64 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 13 av 34 | körningar planerade med minnet; relativ placering i snitt 0.4498 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 059. [Counterexamples to Zariski’s multiplicity conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Ambiently-homeomorphic-isolated-hypersurface-germs-in-C4-with-multiplicities-four-and-five-September-27-2026) | Algebraic and complex geometry | nej | ja; omkörd: pass |
| 060. [The Global Spherical Shell conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Global-Spherical-Shells-on-Minimal-Surfaces-of-Class-VII-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 062. [Projective contact classification and the LeBrun–Salamon conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Contact-Fano-manifolds-and-the-LeBrun-Salamon-conjecture-September-23-2026) | Algebraic and complex geometry | nej | nej |

- Familj 059: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 060: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 062: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
