# Professor Oraklets dag – 2026-11-17

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 6 sammanfattningar analyserade, 12 citerade fynd. Modellanrop: 8 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 0 fall godkända
- **Dagens artikel:** ingen i dag (texten hänvisade till underlag som inte finns; tidigare utkast avvisades: texten överdrev vad verifieringen visar, ordet "bevisvärde"; texten hänvisade till underlag som inte finns)
- **OpenAI:s matematiksamling:** familj 037, 038, 039 (plats 37 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access. | summarized | 2 |
| Embodied Science Agents: Making Embodied Experimental Design Learnable | error | 0 |
| Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions | summarized | 1 |
| From AI for Science to Agentic Science: A Survey on Autonomous Scientific Discovery | summarized | 1 |
| Discovering formally verified quantum programs with AI | summarized | 2 |
| Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for Requirements Engineering Automation | summarized | 3 |
| System for systematic literature review using multiple AI agents: Concept and an empirical evaluation | summarized | 3 |

### Utdrag ur fynden

- **method:** Literature integration was extended to additional open‑access publications. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **result:** MOLE‑generated protein channel, tunnel, and pore analyses are now part of the weekly release pipeline and downloadable. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **limitation:** Literature review automation, system reliability, and ethical concerns are critical challenges that remain unresolved. *(Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions)*
- **method:** The authors unify three fragmented perspectives using a comprehensive framework that links capabilities, processes, and domain-specific realizations. *(From AI for Science to Agentic Science: A Survey on Autonomous Scientific Discovery)*
- **method:** Built a quantum program library in Lean where Gemini 4 agents synthesize programs against formal specifications and verify correctness and cost. *(Discovering formally verified quantum programs with AI)*
- **result:** Achieved up to 2.57× improvement for parallel search, 290× for quantum arithmetic, and 12×, 8×, 2.5× for simulations in fusion, photochemistry, and drug‑metabolism respectively. *(Discovering formally verified quantum programs with AI)*
- **method:** The authors performed a systematic literature review of LLM-supported agent-based RE automation. *(Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for R)*
- **result:** They identified 50 relevant studies, with 24 describing agent-based architectures and 26 providing benchmarks or evaluation resources. *(Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for R)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 4 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 9 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- Interaction-finder: automated literature-based discovery of biological entity associations with quote-level provenance (2026)
- ERAF4XRD: A multimodal agentic framework for constructing validated experimental X-ray diffraction databases from scientific literature (2026)
- AI4Research: a survey of artificial intelligence for scientific research (2026)
- The 2025 AI Agent Index: Documenting Technical and Safety Features of Deployed Agentic AI Systems (2026)
- AutoLabs: cognitive multi-agent systems with self-correction for autonomous chemical experimentation (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (1 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| Oraklets experiment kunde inte slutföras | 20261117 | driftfel | 0 av 0 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 37 körningarna med register (högst 200): 41 preliminärt stödda, 10 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

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

Från 37 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

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
| 037. [The ordinary-double-point volume gap](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/The-normalized-volume-gap-in-dimension-four-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 038. [Fujita’s freeness conjecture](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Fujitas-freeness-conjecture-September-23-2026) | Algebraic and complex geometry | nej | nej |
| 039. [Nagata’s conjecture and maximal Seshadri constants](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Maximal-Multipoint-Seshadri-Constants-in-Higher-Dimensions-October-5-2026) | Algebraic and complex geometry | huvudresultat | nej |

- Familj 037: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 038: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 039: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
