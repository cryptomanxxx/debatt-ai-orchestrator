# Professor Oraklets dag – 2026-11-03

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** AI för vetenskaplig upptäckt (sökfråga: AI agents scientific discovery)
- **Litteratur:** 40 träffar hittade, 5 sammanfattningar arkiverade, 2 sammanfattningar analyserade, 3 citerade fynd. Modellanrop: 4 av 13.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 2 av 3 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar, ordet "bekräftade"; tidigare utkast avvisades: texten överdrev vad verifieringen visar, ordet "upptäckt"; en siffra fanns inte i det hänvisade underlaget)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| The Discovery Gap: Why Artificial Intelligence Must Learn to Change Its Mind "Rethinking Human–AI Collaboration from Molecule to Market" | error | 0 |
| From FAIR to AI-FAIR Metadata-First Infrastructure for AI-Enabled Science | summarized | 2 |
| Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges | summarized | 1 |
| Agentic AI systems for scientific discovery | unavailable | 0 |
| Empowering Biomedical Discovery with AI Agents | unavailable | 0 |

### Utdrag ur fynden

- **method:** Proposes AI-FAIR metadata criteria extending original FAIR principles for AI-ready infrastructure. *(From FAIR to AI-FAIR Metadata-First Infrastructure for AI-Enabled Science)*
- **limitation:** Current data infrastructure and computational resources for AI workflows in ecology and biodiversity science are fragmented. *(From FAIR to AI-FAIR Metadata-First Infrastructure for AI-Enabled Science)*
- **limitation:** Integrated AI systems capable of autonomous long-term scientific research are currently lacking. *(Towards Scientific Discovery with Generative AI: Progress, Opportunities, and Challenges)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 2 artiklar, 0 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

ingen överlappning hittad inom budgeten; 10 senare verk att granska. Att inget hittas inom budgeten bevisar inte att idén är ny.

- The metadata ecosystem and AI: Enabling FAIR and AI‐ready data (2026)
- Simulating the Future of Innovation: A Data-Grounded, Multi-Agent LLM Framework for R&D Collaboration Planning in Urban Mobility (2026)
- Leveraging explicit priors for guided learning under data scarcity (2026)
- NeuroFAIR curator: an AI-assisted framework for metadata enrichment, quality screening, curation prioritization, and FAIR readiness of brain tumor MRI data (2026)
- Transforming mental health research and care through artificial intelligence (2026)

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| act-map-design | 20261103 | failed | 2 av 3 | – |

## Oraklets egna experiment

Experiment som Oraklet själv utformade (`act-map-design`): en egen orsaksmekanism som deklarativ specifikation, en förregistrerad förutsägelse om dess identifierbarhet, och undersökningen när labbet gömt mekanismen i okända system. Förutsägelsen avgörs av labbets uppräkning, undersökningen av evidensgrinden; inget av det är Oraklets eget omdöme.

### act-map-design, seed 20261103

Mekanism: `s_1 = 2*s_0`, `s_2 = 3*s_0`.

Förutsägelse: identifierbar med minst 1 ingrepp. Labbets uppräkning: identifierbar med minst 2 ingrepp. Förutsägelsen stämde inte.

| Fall | Ingrepp | Oraklets beslut | Facit | Grinden | Baslinjen | Godkänt |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 3 | full | full | provisionally\_supported | full | ja |
| 3 | 3 | ingen | ingen | unresolved | ingen | ja |

Oraklets motivering: `Stjärnstruktur med unika koefficienter gör att en enda intervention på roten ger ett unikt värdemönster (1,2,3) som entydigt identifierar både variabelnamn och kanter.`

## Kunskapsminne (VEM-Sci)

Från de senaste 23 körningarna med register (högst 200): 31 preliminärt stödda, 4 avvisade och 8 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 2 (1 / 1) | fel minsta antal ingrepp ×1; svaret klipptes vid tokengränsen ×1 | 0.67 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| rankscreen-consistency | 6 | 2 | 0 (0 / 0) | avvisat av verifieraren ×2 | 0.30 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 23 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 89 % | 31 stödda, 4 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 8 (4 / 4) | 43 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 88 % (0.1222) | 40 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.875 mot 2.6875 | 16 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 8 av 15 | körningar planerade med minnet; relativ placering i snitt 0.3569 (0 = högst), 6 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
