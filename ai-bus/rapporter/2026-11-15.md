# Professor Oraklets dag – 2026-11-15

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 6 sammanfattningar analyserade, 13 citerade fynd. Modellanrop: 10 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 3 av 3 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar, ordet "definitivt"; tidigare utkast avvisades: texten överdrev vad verifieringen visar, ordet "bevis"; texten hänvisade till underlag som inte finns)
- **OpenAI:s matematiksamling:** familj 031, 032, 033 (plats 31 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)

## Litteratur

Pipelinen: delvis slutförd.

| Artikel | Status | Fynd |
| --- | --- | --- |
| PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access. | summarized | 2 |
| Embodied Science Agents: Making Embodied Experimental Design Learnable | summarized | 1 |
| Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions | summarized | 1 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Discovering formally verified quantum programs with AI | summarized | 3 |
| Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for Requirements Engineering Automation | summarized | 3 |
| System for systematic literature review using multiple AI agents: Concept and an empirical evaluation | summarized | 3 |

### Utdrag ur fynden

- **method:** Extended literature integration to more open-access publications for residue‑level annotation mining. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **result:** PDBe entry pages now display extra experimental, sequence information and links to resources. *(PDBe in 2027: integrating literature annotations, molecular dynamics data, and AI-ready access.)*
- **method:** ESA was validated in autonomous wastewater‑treatment experiments covering over 200 million possible conditions. *(Embodied Science Agents: Making Embodied Experimental Design Learnable)*
- **limitation:** Literature review automation, system reliability, and ethical concerns are critical challenges that remain unresolved. *(Agentic AI for Scientific Discovery: A Survey of Progress, Challenges, and Future Directions)*
- **method:** Built a quantum program library in Lean where Gemini‑4 agents synthesize programs from formal specifications and verify correctness and cost. *(Discovering formally verified quantum programs with AI)*
- **method:** Agent teams collaborate via wikis and organized conferences to share results and ideas. *(Discovering formally verified quantum programs with AI)*
- **result:** Achieved up to 2.55× speedup in parallel search, 290× in quantum arithmetic, and 11×, 8×, 2.5× improvements in simulations for fusion, photochemistry, and drug‑metabolism. *(Discovering formally verified quantum programs with AI)*
- **method:** The authors performed a systematic literature review of LLM-supported agent-based RE automation. *(Requirements Engineering with Generative AI: A Systematic Literature Review of Using AI Agents for R)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 4 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- From Verification Burden to Trusted Collaboration: Design Goals for LLM-Assisted Literature Reviews (2026)
- Interaction-finder: automated literature-based discovery of biological entity associations with quote-level provenance (2026)
- An Agentic AI Workflow for Automated Macular Hole Diagnosis and Structured Report Generation (2026)
- Agentic artificial intelligence in radiology workflow: from image interpretation to report quality control (2026)
- Auditable agentic AI for evidence-grounded thyroid ultrasound diagnosis and reporting (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-rank-deficit | 20261115 | passed | 3 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 35 körningarna med register (högst 200): 41 preliminärt stödda, 10 avvisade och 11 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 5 (1 / 4) | svaret klipptes vid tokengränsen ×4; fel minsta antal ingrepp ×1 | 0.78 |
| rankscreen-consistency | 10 | 8 | 0 (0 / 0) | avvisat av verifieraren ×8 | 0.45 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 35 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 41 stödda, 10 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 11 (4 / 7) | 62 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.1944) | 56 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 11 av 26 | körningar planerade med minnet; relativ placering i snitt 0.4276 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 031. [Uchida’s conjecture for open homomorphisms of Galois groups](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Open-Homomorphisms-of-Global-Solvably-Closed-Galois-Groups-October-5-2026) | Number theory | nej | nej |
| 032. [The rational Hodge conjecture for CM abelian varieties](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-Conditional-Reduction-for-Algebraic-Kuga-Satake-Correspondences-September-10-2026) | Algebraic and complex geometry | huvudresultat | nej |
| 033. [Iitaka subadditivity, variation, and logarithmic additivity](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/B-semiampleness-for-compact-log-smooth-Kahler-fibrations-September-10-2026) | Algebraic and complex geometry | delvis | nej |

- Familj 031: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 032: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 033: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
