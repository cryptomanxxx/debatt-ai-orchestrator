# Professor Oraklets dag – 2026-11-12

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 9 sammanfattningar arkiverade, 3 sammanfattningar analyserade, 7 citerade fynd. Modellanrop: 6 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 0 fall godkända
- **Dagens artikel:** ingen i dag (texten hänvisade till underlag som inte finns; tidigare utkast avvisades: texten hänvisade till underlag som inte finns; texten hänvisade till underlag som inte finns)
- **OpenAI:s matematiksamling:** familj 022, 023, 024 (plats 22 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Mechanistic Interpretability of Deep Neural Networks: Methods, Frameworks, and Perspectives | insufficient\_evidence | 0 |
| Applied Statistics and Machine Learning for Social Science Research | insufficient\_evidence | 0 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Beyond Chemical Fingerprinting: Raman Photonics, Molecular Spectroscopy and Explainable Artificial Intelligence for Palm Oil Authentication, Quality Assessment  | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |

### Utdrag ur fynden

- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Handheld Raman studies are used to discriminate the geographic origin of West African palm oils. *(Beyond Chemical Fingerprinting: Raman Photonics, Molecular Spectroscopy and Explainable Artificial I)*
- **result:** Machine learning–assisted Raman analysis has achieved promising predictions of peroxide, iodine, and acid values. *(Beyond Chemical Fingerprinting: Raman Photonics, Molecular Spectroscopy and Explainable Artificial I)*
- **limitation:** High within‑study accuracy does not guarantee causal provenance markers, robustness across refining states, or transferability to new instruments and regions. *(Beyond Chemical Fingerprinting: Raman Photonics, Molecular Spectroscopy and Explainable Artificial I)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **result:** Elevated temperature and solar radiation explained 57% of the ozone increase. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **limitation:** Chemical transport models are computationally intensive, and machine learning struggles with confounding and causality. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 1 artiklar, 1 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

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

ingen överlappning hittad inom budgeten; 0 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261112 | driftfel | 0 av 0 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 32 körningarna med register (högst 200): 37 preliminärt stödda, 9 avvisade och 10 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 4 (1 / 3) | svaret klipptes vid tokengränsen ×3; fel minsta antal ingrepp ×1 | 0.75 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 9 | 7 | 0 (0 / 0) | avvisat av verifieraren ×7 | 0.44 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 32 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 37 stödda, 9 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 10 (4 / 6) | 56 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.1939) | 51 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 10 av 23 | körningar planerade med minnet; relativ placering i snitt 0.4169 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 022. [The weak inhomogeneous Duffin–Schaeffer conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/The-weak-inhomogeneous-Duffin-Schaeffer-conjecture-September-25-2026) | Number theory | nej | nej |
| 023. [Patterson's first moment for cubic Gauss sums](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/An-unconditional-first-moment-for-cubic-Gauss-sums-September-25-2026) | Number theory | delvis | nej |
| 024. [An asymptotic formula for the number of totients](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/An-asymptotic-formula-for-the-number-of-totients-September-25-2026) | Number theory | delvis | nej |

- Familj 022: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 023: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 024: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
