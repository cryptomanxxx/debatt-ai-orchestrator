# Experimentkatalog

Välj experiment i Oraklets forskningslabb. `catalog-only` visar menyn utan modell, databas eller nycklar. `auto` väljer ett körbart experiment. Ett paket med verifierad delintegration innebär inte att hela paketet stöds.

| Körbart experiment | Verktyg | Fråga |
| --- | --- | --- |
| shallow-water-hybrid (endast manuellt) | shallow-water-hybrid | Förbättrar ett diskret fysikinformerat nätverk med adaptivt UKF tillståndsskattning och korta prognoser för släta kanalvågor med få sensorer och förändrat mätbrus? |
| ratfit-baseline | ratfit | Återfinner modellen ett dolt rationellt samband utan återkoppling? |
| ratfit-feedback | ratfit | Förbättras förslaget efter ett korrigeringsförsök mot synliga punkter? |
| rankscreen-consistency | rankscreen | Kan modellen skilja lösbara linjära system från system med en planterad motsägelse? |
| rankscreen-rank-deficit | rankscreen | Kan modellen hitta rangbrist och motsägelser bland beroende ekvationer? |
| annihilator-recurrence | annihilator | Kan en rekursion rekonstruerad från träningsdata förklara undanhållna termer? |
| mixalot-model-comparison | mixalot | Vilken av två specificerade modeller stöds av exakt bayesiansk evidens? |
| statsmodels-ar1 | statsmodels | Finns lagg-1-beroende i en syntetisk tidsserie under det låsta AR(1)-protokollet? |
| sympy-quadratic | sympy | Kan Oraklet ange exakt alla distinkta reella rötter och avvisa felaktiga rotmängder? |
| sklearn-polynomial | scikit-learn | Vilken av två fasta regressionsmodeller väljs på separat valideringsdata och hur går det på testpunkterna? |
| dowhy-backdoor | dowhy | Kan Oraklet skilja en justerad kausal effekt från ojusterad association under ett fast diagram? |
| glucose-absorption | glucose-simulator | Hur påverkar absorptionstakten en syntetisk glukoskurva och 30–60-minutersprognoser? |
| glucose-robustness | glucose-robustness-simulator | Kvarstår adaptiva prognosfördelar när måltidsuppgifter och antagen insulinkänslighet är felaktiga? |
| glucose-temperature-evidence (endast manuellt) | temperature-evidence | Vad stöder publicerade temperaturstudier om insulinabsorption, och räcker sammanfattningarna för en överförbar temperaturmodell? |
| insulin-external-curve (endast manuellt) | insulin-external-curve | Håller exponent-2-kurvans prognosfördel på en separat publicerad aspartfigur, i båda grupperna och vid både 30 och 60 minuter? |
| insulin-curve-shape (endast manuellt) | insulin-curve-shape | Ger en förutbestämd alternativ kurvform bättre 30–60-minutersprognoser än både den ursprungliga kurvformen och senaste avlästa värdet? |
| insulin-warming-forecast (endast manuellt) | insulin-warming-forecast | Förbättrar separata tidsparametrar för lokal uppvärmning 30–60-minutersprognoser för publicerade gruppkurvor av insulin aspart? |
| pymc-gdp-ar1 (endast manuellt) | pymc | Hur osäker är lagg-1-koefficienten i historisk BNP-tillväxt under låsta bayesianska priorer? |

## BootLoops: lokal integrationsstatus

Inventering av 49 paket vid commit `66b680ce742e654cfe86da4f072a69061fe182b1`. Uppströms egna tester innebär inte integration hos oss.

| Metod/paket | Status hos oss | Omfattning eller nästa steg | Körmiljö |
| --- | --- | --- | --- |
| [abacus](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/abacus) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [amflow-kit](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/amflow-kit) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [annihilator](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/annihilator) | Verifierad delintegration | Exakt konstant rekursion, ordning högst två; två primtal och extern holdout | github-actions-python |
| [ansatzer](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ansatzer) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [baller](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/baller) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [blade](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/blade) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [clinch](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/clinch) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [coalescer](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/coalescer) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [cosmoflow](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/cosmoflow) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [counterweight](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/counterweight) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [dipstick](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/dipstick) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [dogtag](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/dogtag) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [eichler](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/eichler) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [ellipticus](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ellipticus) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [emitall](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/emitall) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [eras](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/eras) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [famhar](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/famhar) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [ffcapital](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ffcapital) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [formglue](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/formglue) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [frobenius-boundary](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/frobenius-boundary) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [galois](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/galois) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [gatekeeper](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/gatekeeper) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [geotriage](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/geotriage) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [gpl-eval](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/gpl-eval) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [holonomic](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/holonomic) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [kira-stack](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/kira-stack) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [landau-alphabet](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/landau-alphabet) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [lockpick](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/lockpick) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [longhand](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/longhand) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [maxcut](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/maxcut) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [membound](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/membound) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [mixalot](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/mixalot) | Verifierad delintegration | Frozen-component-evidens: två fasta kategoriska signaturer, Dirichlet(1,1) | github-actions-python |
| [nestor](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/nestor) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [numkin](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/numkin) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [pmflow](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/pmflow) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [popcorn](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/popcorn) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [posq](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/posq) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [qinvert](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/qinvert) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [rankscreen](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/rankscreen) | Verifierad delintegration | Tre primtal, sparse-backend; exakt oberoende rangkontroll | github-actions-python |
| [ratfit](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/ratfit) | Verifierad delintegration | Thiele + exakt holdoutkontroll | orchestrator-api |
| [seedling](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/seedling) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [subtropica](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/subtropica) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [surd](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/surd) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [terrier](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/terrier) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [tropical-sampler](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/tropical-sampler) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [trust](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/trust) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [vopclose](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/vopclose) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [wayfinder](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/wayfinder) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |
| [winnow](https://github.com/BootLoops-ai/bootloops/tree/66b680ce742e654cfe86da4f072a69061fe182b1/tools/winnow) | Saknar integration | Adapter, beroenden och acceptanstester återstår att verifiera. | Ej körbart |

## Verktyg utanför BootLoops

| Verktyg | Version | Status | Omfattning | Körmiljö |
| --- | --- | --- | --- | --- |
| [statsmodels](https://www.statsmodels.org/stable/tsa.html) | 0.15.0 | Verifierad delintegration | Installerat med låsta beroenden; AutoReg AR(1), nominalt t-test, Holm-korrigering och holdoutprognos | github-actions-python |
| [pymc](https://www.pymc.io/) | 6.3.2 | Verifierad delintegration | Konjugat bayesiansk AR(1), låsta priorer, fyra MCMC-kedjor, kvalitetsgränser och oberoende analytisk posterior | github-actions-python |
| [dowhy](https://www.pywhy.org/dowhy/v0.14/) | 0.14 | Verifierad delintegration | Fast backdoor-diagram och justerad linjär regression; positiv/negativ/nolleffekt, exakt rationell kontroll och kontrasterande data | github-actions-python-isolated |
| [sympy](https://www.sympy.org/en/index.html) | 1.14.0 | Verifierad delintegration | Exakta andragradsekvationer med rationella eller inga reella rötter; BigInt-verifiering och förvanskade rotkontroller | github-actions-python |
| [scikit-learn](https://scikit-learn.org/stable/) | 1.9.1 | Verifierad delintegration | Fasta linjära/kvadratiska OLS-modeller; separata tränings-, validerings- och testpunkter, exakt rationell kontroll | github-actions-python |
| [glucose-simulator](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/GLUCOSE.md) | synthetic-absorption-v1 | Verifierad delintegration | Dimensionslös glukos–insulinsimulering; kausal filterbank, RK4/midpointkontroll; inga kliniska doser | github-actions-node |
| [glucose-robustness-simulator](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/GLUCOSE-ROBUSTNESS.md) | synthetic-absorption-robustness-v1 | Verifierad delintegration | Låst 3 × 3 stresstest av felaktig måltid/känslighet; parade kausala prognoser och separat korrekt kontroll; syntetiskt, inga dosråd | github-actions-node |
| [insulin-external-curve](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/INSULIN-EXTERNAL-CURVE.md) | insulin-external-curve-v1 | Verifierad delintegration | Separat publicerad aspartfigur; låsta exponent-1/2-modeller, gruppvisa prefixfel och persistens; ej bekräftad oberoende biologisk replikation | github-actions-node |
| [insulin-curve-shape](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/INSULIN-CURVE-SHAPE.md) | insulin-curve-shape-v1 | Verifierad delintegration | Utforskande återanalys av samma figur; fasta formexponenter, lika parameterantal, persistensreferens och prefixgrafer; ingen oberoende validering | github-actions-node |
| [insulin-warming-forecast](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/INSULIN-WARMING.md) | insulin-warming-forecast-v1 | Verifierad delintegration | Avlästa aspart-gruppkurvor; prefixprognoser, tids-/höjdkontroller och avläsningsstresstest; ingen patient- eller glukosprognos | github-actions-node |
| [temperature-evidence](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/GLUCOSE-TEMPERATURE.md) | temperature-evidence-v1 | Verifierad delintegration | Publicerade gruppsammanfattningar; effektkvoter, alternativa temperaturkurvor och deskriptivt överföringstest; ingen patientkalibrering | github-actions-node |
| [shallow-water-hybrid](https://github.com/cryptomanxxx/debatt-ai-orchestrator/blob/main/research/SHALLOW-WATER.md) | shallow-water-hybrid-v1 | Verifierad delintegration | Reducerade linjära kanalvågor; diskret fysikinformerat nätverk, fast/adaptivt UKF, prefixprognoser och numerisk replay; ingen turbulens | github-actions-python |

Nya integrationer kräver låst källversion och licens, begränsad adapter, angiven körmiljö, positiva och negativa kontroller samt verifiering av rapportkedjan. Först därefter läggs experimentet till i körmenyn och den automatiska planeringen.
