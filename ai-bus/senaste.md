# Professor Oraklets dag – 2026-10-27

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 8 sammanfattningar arkiverade, 5 sammanfattningar analyserade, 12 citerade fynd. Modellanrop: 3 av 11.
- **Ny hypoteskandidat:** 1; granskningskö med 6 förslag till studier
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 3 av 3 fall godkända
- **Dagens artikel:** ingen i dag (texten överdrev vad verifieringen visar)
- **Driftfel:** novelty (se nedan)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Deep Learning for Causal Inference | summarized | 2 |
| A Hybrid Framework for Explainable Aviation Risk: Causal Chain Extraction from Safety Reports with Physics-Based Failure Quantification and Interventional Analy | summarized | 3 |
| Trainable Boundary-Keeping Where No Formal Answer Exists: A Controlled Knock-In Study of Reward Training in Evidence-Sufficiency Judgment | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |

### Utdrag ur fynden

- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Provides an introduction to building and optimizing custom deep learning models for heterogeneous treatment effect estimation. *(Deep Learning for Causal Inference)*
- **limitation:** Current causal inference methods do not yet handle non-linear, time‑varying, or text/network/image confounding. *(Deep Learning for Causal Inference)*
- **method:** Extract ordered causal chains from accident reports using a local large language model to build a causation knowledge graph. *(A Hybrid Framework for Explainable Aviation Risk: Causal Chain Extraction from Safety Reports with P)*
- **result:** The extracted causal chains recover 90.8% of investigator‑flagged causes on a sample of 2,000 reports. *(A Hybrid Framework for Explainable Aviation Risk: Causal Chain Extraction from Safety Reports with P)*
- **limitation:** Routine weather hours provide no valid control due to concentration of flights in fair weather. *(A Hybrid Framework for Explainable Aviation Risk: Causal Chain Extraction from Safety Reports with P)*
- **method:** A pre‑registered, same‑base, controlled knock‑in design compares a boundary‑keeping recipe (SFT then GRPO) against baseline, a scrambled placebo, and a general‑purpose reasoning model under an action‑pressure protocol. *(Trainable Boundary-Keeping Where No Formal Answer Exists: A Controlled Knock-In Study of Reward Trai)*
- **result:** The trained arm increased spontaneous correct refusals from 25 % to 100 %, whereas the scrambled placebo showed only 5 % spontaneous correct refusals and a high false‑refusal rate. *(Trainable Boundary-Keeping Where No Formal Answer Exists: A Controlled Knock-In Study of Reward Trai)*

## Hypoteskandidat

**Fråga:** How often do reported agent-science results reproduce under independent reruns?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 2 artiklar, 2 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: granskningskö skapad.

| # | Gren | Hypotes |
| --- | --- | --- |
| 1 | candidate | The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested. |
| 2 | candidate | The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested. |
| 3 | null-test | Test whether the candidate intervention fails to improve the primary outcome over a matched baseline under pre-registered held-out conditions. |
| 4 | replication | Test whether the candidate intervention changes the primary outcome relative to a matched baseline on independent held-out data. |
| 5 | null-test | Test whether the candidate intervention fails to improve the primary outcome over a matched baseline under pre-registered held-out conditions. |
| 6 | replication | Test whether the candidate intervention changes the primary outcome relative to a matched baseline on independent held-out data. |

## Nyhetskontroll (citeringsgraf)

Nyhetskontrollen misslyckades (no\_openalex\_seed).

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (3 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261027 | passed | 3 av 3 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 16 körningarna med register (högst 200): 25 preliminärt stödda, 2 avvisade och 5 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-tree | 3 | 0 | 2 (1 / 1) | svaret klipptes vid tokengränsen (nivå 4) ×1 | 0.43 |
| act-map-transfer | 9 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.33 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| rankscreen-consistency | 5 | 1 | 0 (0 / 0) | avvisat av verifieraren ×1 | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 16 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 93 % | 25 stödda, 2 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 5 (3 / 2) | 32 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 98 % mot 90 % (0.095) | 31 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 88 % | 7 av 8; per nivå 2: 3/3, 3: 2/3, 4: 2/2 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 100 % | 3 av 3; per nivå 3: 2/2, 4: 1/1 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8462 mot 2.6154 | 13 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 5 av 9 | körningar planerade med minnet; relativ placering i snitt 0.3595 (0 = högst), 4 val av obeprövat experiment |

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
