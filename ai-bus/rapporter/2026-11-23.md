# Professor Oraklets dag – 2026-11-23

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 9 sammanfattningar arkiverade, 6 sammanfattningar analyserade, 16 citerade fynd. Modellanrop: 7 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 1 av 1 fall godkända
- **Dagens artikel:** ingen i dag (texten hänvisade till underlag som inte finns; tidigare utkast avvisades: texten hänvisade till underlag som inte finns; texten var inte 250–900 ord)
- **OpenAI:s matematiksamling:** familj 056, 057, 058 (plats 55 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions | summarized | 1 |
| Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis | summarized | 3 |
| CASCADE is an agentic AI framework for trustworthy biomarker discovery in precision oncology. | summarized | 3 |
| DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease | summarized | 3 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for Requirements Engineering Automation | summarized | 3 |
| System for systematic literature review using multiple AI agents: Concept and an empirical evaluation | summarized | 3 |

### Utdrag ur fynden

- **limitation:** Literature review automation, system reliability, and ethical concerns are critical challenges that remain unresolved. *(Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions)*
- **method:** Introduced a harness‑agnostic “wishful cryptanalysis” methodology that compresses reduced‑scale theory and uses live witnesses to certify mathematics automatically. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **result:** Achieved thirteen verifiable practical attacks on Keccak (SHA‑3) and AES, including breaking a 15‑year‑old public challenge and closing long‑standing practical gaps. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **limitation:** Closed platforms and generic agent loops hinder sustained open inquiry in prior approaches. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **method:** CASCADE is an agentic validation framework that uses mandatory, quantitatively gated analytical steps. *(CASCADE is an agentic AI framework for trustworthy biomarker discovery in precision oncology.)*
- **result:** CASCADE recovered known signals, flagged insufficient power instead of false positives, and corrected an artifact from HR 0.84 to 1.25. *(CASCADE is an agentic AI framework for trustworthy biomarker discovery in precision oncology.)*
- **limitation:** Existing autonomous AI pipelines lack a general method to ensure analytical correctness. *(CASCADE is an agentic AI framework for trustworthy biomarker discovery in precision oncology.)*
- **method:** DeepQuest converts unresolved review questions into testable hypotheses and ranks them using data feasibility screening and groupwise Elo ranking. *(DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

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

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- Interaction-finder: automated literature-based discovery of biological entity associations with quote-level provenance (2026)
- Jr. AI Scientist and Its Risk Report: Autonomous Scientific Exploration from a Baseline Paper (2026)
- PMark: Towards Robust and Distortion-free Semantic-level Watermarking with Channel Constraints (2026)
- What Makes AI Research Replicable? Executable Knowledge Graphs as Scientific Knowledge Representations (2026)
- FlowPIE: Test-Time Scientific Idea Evolution with Flow-Guided Literature Exploration (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261124 | driftfel | 1 av 1 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 43 körningarna med register (högst 200): 47 preliminärt stödda, 12 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 6 (1 / 5) | svaret klipptes vid tokengränsen ×5; fel minsta antal ingrepp ×1 | 0.80 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 16 | 10 | 0 (0 / 0) | avvisat av verifieraren ×10 | 0.39 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 43 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 47 stödda, 12 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 12 (4 / 8) | 71 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.2014) | 64 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 12 av 33 | körningar planerade med minnet; relativ placering i snitt 0.4635 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 056. [Termination of projective and Kähler fourfold minimal model programs](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Finite-ordinary-minimal-model-programs-on-compact-Kahler-fourfolds-October-6-2026) | Algebraic and complex geometry | nej | nej |
| 057. [Fundamental groups of special complex varieties and root orbifolds](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-conditional-abelianity-theorem-for-special-fourfold-pairs-with-a-half-weight-divisor-October-5-2026) | Algebraic and complex geometry | nej | nej |
| 058. [Semialgebraic universal covers and bounded domains](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Semialgebraic-universal-covers-of-normal-projective-varieties-September-24-2026) | Algebraic and complex geometry | huvudresultat | nej |

- Familj 056: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 057: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 058: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
