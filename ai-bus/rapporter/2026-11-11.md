# Professor Oraklets dag – 2026-11-11

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** (pipelinen avbröts; siffrorna gäller det som hann sparas) 0 träffar hittade, 0 sammanfattningar arkiverade, 0 sammanfattningar analyserade, 0 citerade fynd. Modellanrop: 4 av 14.
- **Ny hypoteskandidat:** ingen
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 0 av 0 fall godkända
- **Dagens artikel:** ingen i dag (texten var inte 250–900 ord; tidigare utkast avvisades: texten var inte 250–900 ord; en siffra fanns inte i det hänvisade underlaget)
- **OpenAI:s matematiksamling:** familj 019, 020, 021 (plats 19 av 373, varv 1); 1 av 3 läsningar godkända
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

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (1 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| Oraklets experiment kunde inte slutföras | 20261111 | driftfel | 0 av 0 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 31 körningarna med register (högst 200): 37 preliminärt stödda, 9 avvisade och 10 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

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

Från 31 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

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
| Planering | Planeringen valde högsta lärprioritet | 10 av 22 | körningar planerade med minnet; relativ placering i snitt 0.4064 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 019. [The local p-adic section conjecture and global consequences](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Etale-covers-with-a-prescribed-exterior-sheet-September-24-2026) | Number theory | nej | nej |
| 020. [Squarefree quartics and power-free polynomial values](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Squarefree-values-of-quartics-and-power-free-values-of-polynomials-September-24-2026) | Number theory | huvudresultat | nej |
| 021. [A quadratic bound for Jacobsthal’s function](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-quadratic-bound-for-Jacobsthals-function-September-25-2026) | Number theory | huvudresultat | nej |

### 019. The local p-adic section conjecture and global consequences

- **Citat:** "rational points on every smooth proper geometrically connected curve of genus at least two over a finite extension of ℚp correspond bijectively to conjugacy classes of sections of its full arithmetic étale fundamental group"
- **Metod:** studier av lokala p‑adiska sektioner, global gluing‑teknik och användning av det fulla aritmetiska étale fundamentala gruppen
- **Öppen fråga:** Gäller liknande sektioner för andra typer av kurvor, t.ex. hyperelliptiska kurvor över allmänna talfält?
- **Labbförslag:** Implementera i SageMath beräkning av sektioner för en liten p‑adisk kurva (t.ex. y^2 = x^3 + px + 1) och jämför med de faktiska rationella punkterna.

- Familj 020: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).
- Familj 021: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
