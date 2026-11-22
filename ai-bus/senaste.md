# Professor Oraklets dag – 2026-11-22

*Skriven automatiskt av Oraklets dagliga litteraturforskning. Siffrorna kommer från sparade rapporter, inte från en modells egen sammanfattning. Kandidater och hypoteser är overifierade; inget här påstår en ny vetenskaplig upptäckt.*

## Sammanfattning

- **Fält i dag:** Kausal inferens (sökfråga: causal inference machine learning)
- **Litteratur:** 30 träffar hittade, 10 sammanfattningar arkiverade, 4 sammanfattningar analyserade, 8 citerade fynd. Modellanrop: 4 av 14.
- **Ny hypoteskandidat:** 1
- **Problem Bank:** 0 nya problem registrerade automatiskt, 0 väntar på ditt godkännande
- **Experiment senaste dygnet:** 1 körningar, 1 av 1 fall godkända
- **Dagens artikel:** [Hur väl Oraklets resonemang håller](artiklar/2026-11-22.md)
- **OpenAI:s matematiksamling:** familj 053, 054, 055 (plats 52 av 373, varv 1); 2 av 3 läsningar godkända
- **Driftfel:** novelty (se nedan)

## Litteratur

Pipelinen: inga tillräckligt relevanta uppföljningsträffar.

| Artikel | Status | Fynd |
| --- | --- | --- |
| Time Series Structure Learning with Local Causal Parent Discovery | summarized | 1 |
| Applied Statistics and Machine Learning for Social Science Research | insufficient\_evidence | 0 |
| Causal ML: Python package for causal inference machine learning | summarized | 1 |
| Verifiable Logic in Medical LLMs: A Critical Review of Agentic Clinical Reasoning Optimization and Neuro-Symbolic Grounding | summarized | 3 |
| Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound | summarized | 3 |

### Utdrag ur fynden

- **result:** With an exact oracle, ITPD performed the fewest conditional independence tests and the smallest average conditioning set sizes compared to baselines. *(Time Series Structure Learning with Local Causal Parent Discovery)*
- **method:** Causal ML provides uplift modeling and causal inference methods using machine learning algorithms. *(Causal ML: Python package for causal inference machine learning)*
- **method:** Neuro-symbolic grounding uses formal logic engines, ontology reasoners, and knowledge graphs to add verifiable constraints to neural outputs. *(Verifiable Logic in Medical LLMs: A Critical Review of Agentic Clinical Reasoning Optimization and N)*
- **result:** Systems with symbolic veto layers achieve large gains on safety measures. *(Verifiable Logic in Medical LLMs: A Critical Review of Agentic Clinical Reasoning Optimization and N)*
- **limitation:** Results are based on single, simulated or small‑sample studies and are not directly comparable with neural baselines. *(Verifiable Logic in Medical LLMs: A Critical Review of Agentic Clinical Reasoning Optimization and N)*
- **method:** Used integrated analysis of monitoring, satellite, and reanalysis data with explainable machine learning and causal inference. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **result:** Elevated temperature and solar radiation explained 57% of the ozone increase. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*
- **limitation:** Chemical transport models are computationally intensive, and machine learning struggles with confounding and causality. *(Causal-inference machine learning reveals the drivers of China's 2022 ozone rebound)*

## Hypoteskandidat

**Fråga:** Which reported method remains robust under a matched, independent replication?

**Hypotes:** The proposed intervention changes the measured outcome relative to a matched baseline; the direction and magnitude remain to be tested.

Underlag: 2 artiklar, 1 rapporterade begränsningar att granska. Status: overifierad, inget experiment kört.

## Granskningskö (agentisk trädsökning)

Status: kräver verifiering.

## Nyhetskontroll (citeringsgraf)

Nyhetskontrollen misslyckades (no\_openalex\_seed).

## Problem Bank

- `oraklet-dowhy-backdoor-001` → `dowhy-backdoor`: redan registrerad. Litteratur: Does adjusting for an identified confounder recover a causal effect that the unadjusted association misstates? (2 artiklar)

Registrerade problem erbjuds den dagliga labbkörningen, som kan välja att arbeta på dem.

## Experiment senaste dygnet

| Experiment | Seed | Status | Godkända fall | Rak fråga (labbet/rak) |
| --- | --- | --- | --- | --- |
| rankscreen-consistency | 20261123 | driftfel | 1 av 1 | – |

## Kunskapsminne (VEM-Sci)

Från de senaste 42 körningarna med register (högst 200): 46 preliminärt stödda, 12 avvisade och 12 olösta påståenden. Labbets planering ser samma register och prioriterar där påståenden inte höll eller belägg saknas.

| Experiment | Stödda | Avvisade | Olösta (avstått / utan svar) | Vanligaste felorsaker | Lärprioritet |
| --- | --- | --- | --- | --- | --- |
| act-map-design | 1 | 1 | 6 (1 / 5) | svaret klipptes vid tokengränsen ×5; fel minsta antal ingrepp ×1 | 0.80 |
| act-map-tree | 4 | 0 | 3 (1 / 2) | svaret klipptes vid tokengränsen (nivå 4) ×2 | 0.44 |
| rankscreen-consistency | 15 | 10 | 0 (0 / 0) | avvisat av verifieraren ×10 | 0.41 |
| act-map-transfer | 12 | 1 | 3 (2 / 1) | ingreppen täckte inte roten och mediatorn ×1; interventions angav inte en egen målvariabel för vart och ett av de tre ingreppen (nivå 3) ×1 | 0.28 |
| act-map-budget | 2 | 0 | 0 (0 / 0) | – | 0.25 |
| dowhy-backdoor | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| sympy-quadratic | 3 | 0 | 0 (0 / 0) | – | 0.20 |
| rankscreen-rank-deficit | 6 | 0 | 0 (0 / 0) | – | 0.13 |

"Preliminärt stött" gäller bara det testade fallet och dess verifierare, aldrig etablerad vetenskap.

## DeepRAP-mått

Från 42 sparade labbkörningar med VEM-Sci-register (högst 200). Bara experimentens egna oberoende verifierare avgör; varje siffra visas med sitt underlag. Få fall ger stor osäkerhet.

| Förmåga | Mått | Värde | Underlag |
| --- | --- | --- | --- |
| Resonemang | Påståenden som höll vid verifiering | 79 % | 46 stödda, 12 avvisade |
| Resonemang | Olösta (avstått / utan svar) | 12 (4 / 8) | 70 påståenden |
| Resonemang | Kalibrering: angiven säkerhet mot andel rätt (Brier) | 99 % mot 79 % (0.2046) | 63 fall |
| Abstraktion | ACT-MAP direkt: rätt beslut | 91 % | 10 av 11; per nivå 2: 4/4, 3: 3/4, 4: 3/3 |
| Abstraktion | ACT-MAP trädsökning v1: rätt beslut | 50 % | 1 av 2; per nivå 3: 1/1, 4: 0/1 |
| Abstraktion | ACT-MAP trädsökning: rätt beslut | 80 % | 4 av 5; per nivå 3: 3/3, 4: 1/2 |
| Abstraktion | ACT-MAP två ingrepp: rätt beslut | 100 % | 2 av 2; per nivå 2: 2/2 |
| Abstraktion | ACT-MAP egen mekanism: rätt beslut | 100 % | 2 av 2; per nivå 3: 2/2 |
| Abstraktion | Felaktigt godkända överföringar | 0 | alla ACT-MAP-fall |
| Planering | Ingrepp per rätt fall: Oraklet mot uppräkningsbaslinjen | 2.8947 mot 2.7368 | 19 fall där båda hade rätt |
| Planering | Två ingrepp: det andra fullbordade täckningen | 100 % | 2 av 2 fall där det var möjligt |
| Planering | Planeringen valde högsta lärprioritet | 12 av 32 | körningar planerade med minnet; relativ placering i snitt 0.4559 (0 = högst), 6 val av obeprövat experiment |

## OpenAI:s matematiksamling

Oraklet läser tre resultatfamiljer om dagen ur [openai/math](https://github.com/openai/math), i katalogens ordning ([research/openai-math/katalog.json](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/openai-math/katalog.json)). Samlingen är rådata från en ej släppt modell; resultaten är ogranskade påståenden. Citaten är kontrollerade ordagrant mot familjens sammanfattning, men resten är Oraklets tolkning och inte granskad.

| Familj | Ämne | Lean | Kod |
| --- | --- | --- | --- |
| 053. [A counterexample to Pixton completeness in Chow](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-high-arity-counterexample-to-Pixton-completeness-in-Chow-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 054. [Irrational cubic fourfolds with Hodge-theoretic and categorical K3 associations](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/Irrational-cubic-fourfolds-with-geometric-K3-categories-September-24-2026) | Algebraic and complex geometry | nej | nej |
| 055. [Gepner symmetry and large-volume stability on threefolds](https://github.com/openai/math/tree/4eaee87548250b2682affda7d05d947c05554bae/preprints/A-Gepner-stability-condition-on-every-smooth-quintic-threefold-September-24-2026) | Algebraic and complex geometry | nej | nej |

### 053. A counterexample to Pixton completeness in Chow

- **Citat:** "Constructs a tautological relation on a moduli space of stable pointed curves that vanishes in rational Chow, hence in rational cohomology, but lies outside Pixton's original relation span."
- **Metod:** Konstruktion av en tautologisk relation på moduli‑rymden av stabila spetsade kurvor och beräkning i rationell Chow‑grupp.
- **Öppen fråga:** Vilka ytterligare relationer finns utanför Pixtons spännvidd och hur kan de klassificeras i integral Chow?
- **Labbförslag:** Använd SageMath eller Macaulay2 för att explicit konstruera den givna relationen i låg genus (t.ex. g=2) och verifiera att den försvinner i rational Chow men inte i Pixtons span.

### 055. Gepner symmetry and large-volume stability on threefolds

- **Citat:** "Proves Toda's Gepner conjecture for every smooth complex quintic threefold, constructing a numerical Bridgeland stability condition with the prescribed phase shift 2/5."
- **Metod:** Konstruktion av numeriska Bridgeland‑stabilitetsvillkor med exakt Todd‑central laddning och utnyttjande av Gepner‑symmetri.
- **Öppen fråga:** Kan samma teknik ge Gepner‑symmetri och stabilitetsvillkor för andra Calabi‑Yau‑tredimensionella varieteter?
- **Labbförslag:** Implementera den givna centralkartan i Python (t.ex. med mpmath) för en kvintisk trefold och verifiera att fas‑skiftet 2/5 uppnås för olika volym‑parametrar.

- Familj 054: läsningen avvisades (citatet fanns inte ordagrant i sammanfattningen).

## Begränsningar

- Oraklet läser bara sammanfattningar, inte hela artiklar, och högst tio per dag i den nuvarande budgeten.
- Fynd är modellens tolkning med ordagranna citat; citaten kontrolleras, men tolkningen är inte granskad av en människa.
- Hypoteser, granskningskö och nyhetskontroll är förslag till vidare granskning, inte resultat.
