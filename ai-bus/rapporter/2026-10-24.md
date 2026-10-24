# Professor Oraklets dag – 2026-10-24

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 3 sammanfattningar analyserade, 5 citerade fynd. Modellanrop: 5 av 11.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 1 väntar på ditt godkännande
- **Experiment senaste dygnet:** 5 körningar, 9 av 9 fall godkända
- **Dagens artikel:** ingen i dag (en siffra fanns inte i det hänvisade underlaget)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| ADAPT for Science: A Multi-Agent System for Self-Evolving Scientific Optimization | summarized | 2 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Scientific discovery: that-what’s and what-that’s | insufficient\_evidence | 0 |
| Automated Materials Data and Knowledge Extraction using Machine Learning and Large Language Models | summarized | 2 |
| A New Paradigm: Agentic AI for Scientific Discovery | summarized | 1 |

### Utdrag ur fynden

- **method:** ADAPT leverages historical designs to select diverse initial conditions, focuses computation on promising directions, and updates its optimization procedure using feedback. *(ADAPT for Science: A Multi-Agent System for Self-Evolving Scientific Optimization)*
- **result:** On gravitational wave detector design, ADAPT achieves a mean loss of 0.204 ± 0.101, cutting loss by 54.9% versus the best classical optimizer and 62.2% versus the best general‑purpose baseline. *(ADAPT for Science: A Multi-Agent System for Self-Evolving Scientific Optimization)*
- **method:** The review describes a progression of extraction methods from heuristic rule‑based pipelines to NLP models, transformer encoders, and finally large language models. *(Automated Materials Data and Knowledge Extraction using Machine Learning and Large Language Models)*
- **method:** Agentic systems are used to extract materials information across multiple modalities such as text, tables, and figures. *(Automated Materials Data and Knowledge Extraction using Machine Learning and Large Language Models)*
- **limitation:** There is a verification crisis: a growing gap between what agentic AI systems can produce and what they can prove. *(A New Paradigm: Agentic AI for Scientific Discovery)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 3 artiklar, 1 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 0 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)
- `oraklet-shallow-water-hybrid-001` → `shallow-water-hybrid`: väntar på godkännande (manuellt experiment). Litteratur: Does a physics-informed estimator improve held-out state estimation under changing flow conditions? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-transfer | 20261025 | passed | 3 av 3 | – |
| act-map-tree | 5 | driftfel | 1 av 1 | – |
| act-map-design | 20261024 | driftfel | 0 av 0 | – |
| act-map-transfer | 20261024 | driftfel | 2 av 2 | – |
| dowhy-backdoor | 20261023 | passed | 3 av 3 | 3/3 av 3 |

## Kunskapsminne (VEM-Sci)

Från de senaste 13 körningarna med register (högst 200): 20 preliminärt stödda, 1 avvisade och 5 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 3 | 0 | 2 (1 / 1) | svaret klipptes vid tokengränsen (nivå 4) ×1 | 0.43 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 13 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 95 % | 20 stödda, 1 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 5 (3 / 2) | 26 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 92 % (0.0777) | 25 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 100 % | 3 av 3; per nivå 3: 2/2, 4: 1/1 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8462 mot 2.6154 | 13 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 4 av 6 | körningar planerade med minnet; relativ placering i snitt 0.2745 (0 = högst), 3 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
