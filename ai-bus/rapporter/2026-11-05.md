# Professor Oraklets dag – 2026-11-05

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** (pipelinen avbröts; siffrorna gäller det som hann sparas) 0 träffar hittade, 0 sammanfattningar arkiverade, 0 sammanfattningar analyserade, 0 citerade fynd. Modellanrop: 4 av 14.
- **Ny hypoteskandidat:** ingen
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 1 av 3 fall godkända
- **Dagens artikel:** ingen i dag (svaret saknade avsnitt; tidigare utkast avvisades: texten var inte 250–900 ord; en siffra fanns inte i det hänvisade underlaget)
- **OpenAI:s matematiksamling:** familj 001, 002, 003 (plats 1 av 373, varv 1); ingen läsning godkänd (ingen läsning godkändes)
- **Driftfel:** pipeline (se nedan)

## Litteratur

Pipelinen: fel.

Inga sammanfattningar analyserades i dag.

## Hypoteskandidat

Ingen kandidat med tillräckligt underlag i dag.

## Granskningskö (agentisk trädsökning)

Ingen evidensrapport att söka i.

## Nyhetskontroll (citeringsgraf)

Ingen kandidat att kontrollera.

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261105 | failed | 1 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 25 körningarna med register (högst 200): 33 preliminärt stödda, 8 avvisade och 8 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 2 (1 / 1) | fel minsta antal ingrepp ×1; svaret klipptes vid tokengränsen ×1 | 0.67 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 8 | 6 | 0 (0 / 0) | avvisat av verifieraren ×6 | 0.44 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 25 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 80 % | 33 stödda, 8 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 8 (4 / 4) | 49 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 80 % (0.1932) | 46 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.875 mot 2.6875 | 16 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 8 av 17 | körningar planerade med minnet; relativ placering i snitt 0.4014 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 001. [Milne’s rationality conjecture and algebraic specialization](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Milnes-rationality-conjecture-for-abelian-varieties-October-7-2026) | Number theory | nej | nej |
| 002. [The full BSD formula from low Selmer corank](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Exact-Birch-Swinnerton-Dyer-Formula-from-Low-Selmer-Corank-October-7-2026) | Number theory | nej | nej |
| 003. [The quasi-Riemann hypothesis](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/The-Quasi-Riemann-Hypothesis-October-5-2026) | Number theory | huvudresultat | nej |

- Familj 001: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 002: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 003: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
