# Professor Oraklets dag – 2026-10-28

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 40 träffar hittade, 5 sammanfattningar arkiverade, 4 sammanfattningar analyserade, 6 citerade fynd. Modellanrop: 4 av 11.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 1 av 2 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Data is not knowledge: Hayek’s epistemological challenge to artificial intelligence | summarized | 1 |
| Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges | summarized | 1 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Software Engineering for AI-Driven Science | summarized | 2 |
| Semantic Representation for Agentic Self-Play in Automated Laboratories | summarized | 2 |

### Utdrag ur fynden

- **method:** The taxonomy is applied at three levels—the data pipeline, the tacit‑knowledge debate, and the institutional conditions of price generation—as three applications of one classification. *(Data is not knowledge: Hayek’s epistemological challenge to artificial intelligence)*
- **limitation:** Integrated AI systems capable of autonomous long-term scientific research are currently lacking. *(Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges)*
- **method:** Introduce SE4AI4Sci framework and Scientific Assurance Chain to address AI-driven science reliability. *(Software Engineering for AI-Driven Science)*
- **result:** Analyze six recent AI-for-science failures to identify break points in the Scientific Assurance Chain and shortcomings of current assurance mechanisms. *(Software Engineering for AI-Driven Science)*
- **result:** VERID enables pre‑emptive detection of critical protocol errors, mid‑run error recovery, and post‑hoc identification of subtle physical failures *(Semantic Representation for Agentic Self-Play in Automated Laboratories)*
- **limitation:** Current experimental design translation is limited by static automation and unmodeled variability *(Semantic Representation for Agentic Self-Play in Automated Laboratories)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 4 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- Artificial intelligence integration in materials science (2026)
- For Factors of AI Integration in Research: Case Study of Russian Laboratories (2026)
- Progress and ongoing conceptual challenges “on the way to integrative human neuroscience”–ten years after (2026)
- Transforming mental health research and care through artificial intelligence (2026)
- Generative artificial intelligence in fifth-generation education systems: A systematic review (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-tree | 20261028 | failed | 1 av 2 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 17 körningarna med register (högst 200): 26 preliminärt stödda, 2 avvisade och 6 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| rankscreen-consistency | 5 | 1 | 0 (0 / 0) | avvisat av verifieraren ×1 | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 17 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 93 % | 26 stödda, 2 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 6 (3 / 3) | 34 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 91 % (0.092) | 32 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8571 mot 2.6429 | 14 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 5 av 10 | körningar planerade med minnet; relativ placering i snitt 0.3941 (0 = högst), 4 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
