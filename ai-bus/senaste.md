# Professor Oraklets dag – 2026-11-06

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 40 träffar hittade, 7 sammanfattningar arkiverade, 3 sammanfattningar analyserade, 5 citerade fynd. Modellanrop: 5 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 3 av 3 fall godkända
- **Dagens artikel:** [Dagens labbkörningar](artiklar/2026-11-06.md)
- **OpenAI:s matematiksamling:** familj 004, 005, 006 (plats 4 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: otillräckligt underlag.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Applied Statistics and Machine Learning for Social Science Research | insufficient\_evidence | 0 |
| Doubly-robust causal inference for multi-valued treatment regimes with recurrent neural networks | summarized | 1 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Deep Learning for Causal Inference | error | 0 |
| Identification and Bounding of Joint Expectation over Potential Outcomes | summarized | 3 |
| Identification and estimation of the joint distribution of potential outcomes in causal inference (要約) | unavailable | 0 |

### Utdrag ur fynden

- **result:** In simulations, LTMLE with either ensemble machine learning or RNNs is approximately unbiased with near‑nominal coverage, while sequential g‑computation with ensemble methods is substantially biased under a dynamic rule. *(Doubly-robust causal inference for multi-valued treatment regimes with recurrent neural networks)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Introduce novel identification assumptions called comonotonicity and countercomonotonicity. *(Identification and Bounding of Joint Expectation over Potential Outcomes)*
- **method:** Derive sharp bounds for two broad classes of functions when the novel assumptions are not used. *(Identification and Bounding of Joint Expectation over Potential Outcomes)*
- **result:** Obtain new bounds on moments of individual causal effects, aiding measurement of effect heterogeneity. *(Identification and Bounding of Joint Expectation over Potential Outcomes)*

## Hypoteskandidat

**Fråga:** Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 2 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

möjlig överlappning hittad; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- A Comprehensive Review and Tutorial on Confounding Adjustment Methods for Estimating Treatment Effects Using Observational Data (2024)
- Covariate selection and adjustment for efficacy and safety endpoints in indirect comparative effectiveness analyses of CAR-T-cell therapies for large B-cell lymphoma: a systematic review (2026)
- Causal effects of unintended pregnancy on adverse birth outcomes: A target trial emulation analysis (2026)
- Application of Causal Inference to Establish Assay Effect in the Absence of a Bridging Study: A Case Study of MenACWY ‐ CRM Conjugate Vaccine Data (2026)
- Causal effect estimation framework for early human decision-making under nuclear emergencies: Integrating virtual reality and machine learning (2025)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-transfer | 20261106 | passed | 3 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 26 körningarna med register (högst 200): 36 preliminärt stödda, 8 avvisade och 8 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 2 (1 / 1) | fel minsta antal ingrepp ×1; svaret klipptes vid tokengränsen ×1 | 0.67 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 8 | 6 | 0 (0 / 0) | avvisat av verifieraren ×6 | 0.44 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 26 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 82 % | 36 stödda, 8 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 8 (4 / 4) | 52 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 82 % (0.1814) | 49 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 8 av 18 | körningar planerade med minnet; relativ placering i snitt 0.4216 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 004. [Hilbert’s tenth problem over ℚ](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-pointwise-2-converse-for-elliptic-curves-with-rational-two-torsion-October-7-2026) | Number theory | nej | nej |
| 005. [Irrationality of Catalan’s constant](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Catalans-constant-is-irrational-September-24-2026) | Number theory | delvis | nej |
| 006. [Goldfeld’s conjecture: densities and mean analytic rank](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Goldfelds-analytic-density-conjecture-and-the-2-converse-for-elliptic-curves-October-7-2026) | Number theory | nej | nej |

- Familj 004: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 005: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 006: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
