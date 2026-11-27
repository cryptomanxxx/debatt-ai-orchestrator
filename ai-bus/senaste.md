# Professor Oraklets dag – 2026-11-27

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 9 sammanfattningar arkiverade, 6 sammanfattningar analyserade, 14 citerade fynd. Modellanrop: 3 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 2 av 3 fall godkända
- **Dagens artikel:** [Hur väl Oraklets resonemang håller](artiklar/2026-11-27.md)
- **OpenAI:s matematiksamling:** familj 069, 071, 072 (plats 67 av 373, varv 1); 1 av 3 läsningar godkända

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions | summarized | 1 |
| Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis | summarized | 3 |
| DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease | summarized | 2 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| automodel: A Skill for Agentic Model Discovery | summarized | 2 |
| Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for Requirements Engineering Automation | summarized | 3 |
| System for systematic literature review using multiple AI agents: Concept and an empirical evaluation | summarized | 3 |

### Utdrag ur fynden

- **limitation:** Literature review automation, system reliability, and ethical concerns are critical challenges that remain unresolved. *(Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions)*
- **method:** Introduced a harness‑agnostic “wishful cryptanalysis” methodology that compresses reduced‑scale theory and uses live witnesses to certify mathematics automatically. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **result:** Achieved thirteen verifiable practical attacks on Keccak (SHA‑3) and AES, including breaking a 15‑year‑old public challenge and closing long‑standing practical gaps. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **limitation:** Closed platforms and generic agent loops hinder sustained open inquiry in prior approaches. *(Do Alice and Bob Dream of the Oracle? Wishful Cryptanalysis)*
- **result:** DeepQuest generated 42 feasible hypotheses on OASIS-3 and beat the strongest baselines on 14 of 15 evaluator dimensions. *(DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease)*
- **result:** The framework attained a 95.24% audit-assessed scientific finding rate, surpassing general-purpose executors and domain-specific agents. *(DeepQuest: From Knowledge Gaps to Scientific Discovery in Alzheimer's Disease)*
- **method:** The authors introduce automodel, an agent skill for general model discovery. *(automodel: A Skill for Agentic Model Discovery)*
- **result:** Commercial agents equipped with automodel can successfully identify novel, scientifically-relevant models across multiple domains. *(automodel: A Skill for Agentic Model Discovery)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- Interaction-finder: automated literature-based discovery of biological entity associations with quote-level provenance (2026)
- PMark: Towards Robust and Distortion-free Semantic-level Watermarking with Channel Constraints (2026)
- Jr. AI Scientist and Its Risk Report: Autonomous Scientific Exploration from a Baseline Paper (2026)
- What Makes AI Research Replicable? Executable Knowledge Graphs as Scientific Knowledge Representations (2026)
- FlowPIE: Test-Time Scientific Idea Evolution with Flow-Guided Literature Exploration (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-transfer | 20261127 | failed | 2 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 47 körningarna med register (högst 200): 51 preliminärt stödda, 13 avvisade och 14 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 7 (1 / 6) | svaret klipptes vid tokengränsen ×6; fel minsta antal ingrepp ×1 | 0.82 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 18 | 11 | 0 (0 / 0) | avvisat av verifieraren ×11 | 0.39 |
| act-map-transfer | 14 | 1 | 4 (2 / 2) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.29 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 47 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 51 stödda, 13 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 14 (4 / 10) | 78 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.2013) | 69 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 86 % | 12 av 14; per nivå 2: 5/5, 3: 4/5, 4: 3/4 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.9048 mot 2.7143 | 21 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 13 av 36 | körningar planerade med minnet; relativ placering i snitt 0.4657 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 069. [Global quantum geometric Langlands at irrational level](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Global-quantum-geometric-Langlands-at-irrational-level-October-4-2026) | Algebraic and complex geometry | nej | nej |
| 071. [Koebe’s circle-domain conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Koebes-Circle-Domain-Conjecture-September-23-2026) | Real and complex analysis | delvis | nej |
| 072. [Brennan's conjecture and the integral-means spectrum](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-strict-inverse-first-power-bound-for-univalent-functions-September-24-2026) | Real and complex analysis | huvudresultat | nej |

### 071. Koebe’s circle-domain conjecture

- **Citat:** "Resolves the existence part of Koebe's circle-domain conjecture: every domain in the Riemann sphere is conformally equivalent to a domain whose complementary components are round disks or points."
- **Metod:** Kombination av extremal‑värde‑metoder, modern quasikonform teori och He–Schramms cirkel‑paket‑teknik.
- **Öppen fråga:** Är varje cirkel‑domän med icke‑konformt avlägsnad gräns ändå unik upp till Möbius‑transformation?
- **Labbförslag:** Implementera en numerisk konform avbildning med Python‑biblioteket CirclePack för slumpmässiga domäner och verifiera att de bildade komplementen blir cirklar.

- Familj 069: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 072: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
