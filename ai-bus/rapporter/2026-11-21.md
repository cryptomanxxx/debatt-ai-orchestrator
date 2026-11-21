# Professor Oraklets dag – 2026-11-21

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 5 sammanfattningar analyserade, 12 citerade fynd. Modellanrop: 5 av 14.
- **Ny hypoteskandidat:** 1; granskningskö med 3 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 0 fall godkända
- **Dagens artikel:** ingen i dag (en siffra fanns inte i det hänvisade underlaget; tidigare utkast avvisades: texten hänvisade till underlag som inte finns; svaret saknade avsnitt)
- **OpenAI:s matematiksamling:** familj 050, 051, 052 (plats 49 av 373, varv 1); 1 av 3 läsningar godkända

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease | error | 0 |
| Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions | summarized | 1 |
| automodel: A Skill for Agentic Model Discovery | summarized | 2 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access. | summarized | 3 |
| Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for Requirements Engineering Automation | summarized | 3 |
| System for systematic literature review using multiple AI agents: Concept and an empirical evaluation | summarized | 3 |

### Utdrag ur fynden

- **limitation:** Literature review automation, system reliability, and ethical concerns are critical challenges that remain unresolved. *(Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions)*
- **method:** The authors introduce automodel, an agent skill for general model discovery. *(automodel: A Skill for Agentic Model Discovery)*
- **result:** Commercial agents equipped with automodel can successfully identify novel, scientifically-relevant models across multiple domains. *(automodel: A Skill for Agentic Model Discovery)*
- **method:** Established cross-links to molecular dynamics simulations in MDposit. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **result:** Extended literature integration increased residue‑level annotations from open‑access publications. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **method:** Incorporated MOLE‑generated channel, tunnel, and pore analyses into weekly releases for download. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **method:** The authors performed a systematic literature review of LLM-supported agent-based RE automation. *(Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for R)*
- **result:** They identified 50 relevant studies, with 24 describing agent-based architectures and 26 providing benchmarks or evaluation resources. *(Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for R)*

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
| rankscreen-consistency | 20261122 | driftfel | 0 av 0 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 41 körningarna med register (högst 200): 45 preliminärt stödda, 12 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 6 (1 / 5) | svaret klipptes vid tokengränsen ×5; fel minsta antal ingrepp ×1 | 0.80 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 14 | 10 | 0 (0 / 0) | avvisat av verifieraren ×10 | 0.42 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 41 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 79 % | 45 stödda, 12 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 12 (4 / 8) | 69 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 79 % (0.2079) | 62 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 12 av 31 | körningar planerade med minnet; relativ placering i snitt 0.4478 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 050. [A counterexample to Griffiths’ positivity conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/ample-rank-two-bundles-on-the-quadric-surface-without-griffiths-positive-metrics-September-24-2026) | Algebraic and complex geometry | huvudresultat | nej |
| 051. [Kobayashi’s canonical-ampleness conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Canonical-ampleness-of-compact-hyperbolic-Kahler-manifolds-September-23-2026) | Algebraic and complex geometry | nej | nej |
| 052. [Tangent splittings and product decompositions](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Integrability-of-split-tangent-bundles-on-rationally-connected-manifolds-September-23-2026) | Algebraic and complex geometry | huvudresultat | nej |

### 051. Kobayashi’s canonical-ampleness conjecture

- **Citat:** "Every compact connected Kähler manifold of positive complex dimension with no nonconstant entire curve has ample canonical bundle and is therefore projective."
- **Metod:** Kombination av Kähler‑geometri, hyperbolicitets‑teori (Brody‑metoden) och minimal‑model‑programmets ampleness‑kriterier.
- **Öppen fråga:** Kan påståendet utökas till singulara Kähler‑varieteter eller till icke‑kompakta hyperboliska komplexa rum?
- **Labbförslag:** Välj en explicit Kähler‑yta, t.ex. ett kvadratisk hypersurface i \\mathbb{CP}^3, beräkna dess kanoniska divisor med sage och testa om den är ampl, samtidigt som man kontrollerar frånvaron av hela kurvor via numerisk brody‑test.

- Familj 050: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 052: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
