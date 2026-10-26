# Professor Oraklets dag – 2026-10-26

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 6 sammanfattningar arkiverade, 3 sammanfattningar analyserade, 6 citerade fynd. Modellanrop: 4 av 11.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 2 av 3 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Semantic Representation for Agentic Self-Play in Automated Laboratories | summarized | 2 |
| Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges | summarized | 1 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Empowering Biomedical Discovery with AI Agents | unavailable | 0 |
| A New Paradigm: Agentic AI for Scientific Discovery | summarized | 3 |

### Utdrag ur fynden

- **result:** VERID enables pre‑emptive error detection, mid‑run recovery, and post‑hoc identification of subtle physical failures in experimental protocols. *(Semantic Representation for Agentic Self-Play in Automated Laboratories)*
- **limitation:** Current translation of experimental designs to reliable physical execution is limited by static automation and unmodeled variability. *(Semantic Representation for Agentic Self-Play in Automated Laboratories)*
- **limitation:** Integrated AI systems capable of autonomous long-term scientific research are currently lacking. *(Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges)*
- **method:** The article proposes a six-stage workflow from literature synthesis to manuscript generation. *(A New Paradigm: Agentic AI for Scientific Discovery)*
- **result:** Quantitative evidence on failure rates of agentic AI systems was compiled. *(A New Paradigm: Agentic AI for Scientific Discovery)*
- **limitation:** A verification crisis shows a gap between what AI systems can produce and what they can prove. *(A New Paradigm: Agentic AI for Scientific Discovery)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- Transforming mental health research and care through artificial intelligence (2026)
- Generative artificial intelligence in fifth-generation education systems: A systematic review (2026)
- From tool to collaborator: rethinking GIScience as GIS becomes agentic and autonomous (2026)
- Decoding complexity through machine learning is redefining scientific discovery (2026)
- Ambulatory assessment in mental health: expert consensus and recommendations (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261026 | failed | 2 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 15 körningarna med register (högst 200): 22 preliminärt stödda, 2 avvisade och 5 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 3 | 0 | 2 (1 / 1) | svaret klipptes vid tokengränsen (nivå 4) ×1 | 0.43 |
| rankscreen-consistency | 2 | 1 | 0 (0 / 0) | avvisat av verifieraren ×1 | 0.40 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 15 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 92 % | 22 stödda, 2 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 5 (3 / 2) | 29 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 89 % (0.1052) | 28 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 100 % | 3 av 3; per nivå 3: 2/2, 4: 1/1 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8462 mot 2.6154 | 13 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 5 av 8 | körningar planerade med minnet; relativ placering i snitt 0.3088 (0 = högst), 4 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
