# Experimentkatalog

Välj experiment i Oraklets forskningslabb. `catalog-only` visar menyn utan modell, databas eller nycklar. `auto` väljer ett körbart experiment. Ett paket med verifierad delintegration innebär inte att hela paketet stöds.

| Körbart experiment | Verktyg | Fråga |
| --- | --- | --- |
| ratfit-baseline | ratfit | Återfinner modellen ett dolt rationellt samband utan återkoppling? |
| ratfit-feedback | ratfit | Förbättras förslaget efter ett korrigeringsförsök mot synliga punkter? |
| rankscreen-consistency | rankscreen | Kan modellen skilja lösbara linjära system från system med en planterad motsägelse? |
| rankscreen-rank-deficit | rankscreen | Kan modellen hitta rangbrist och motsägelser bland beroende ekvationer? |
| annihilator-recurrence | annihilator | Kan en rekursion rekonstruerad från träningsdata förklara undanhållna termer? |
| mixalot-model-comparison | mixalot | Vilken av två specificerade modeller stöds av exakt bayesiansk evidens? |
| statsmodels-ar1 | statsmodels | Finns lagg-1-beroende i en syntetisk tidsserie under det låsta AR(1)-protokollet? |
| sympy-quadratic | sympy | Kan Oraklet ange exakt alla distinkta reella rötter och avvisa felaktiga rotmängder? |
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
| [dowhy](https://www.pywhy.org/dowhy/v0.14/) | Ej låst | Saknar integration | Kandidat: kausal inferens med explicita antaganden och robusthetskontroller; ej integrerat | Ej körbart |
| [sympy](https://www.sympy.org/en/index.html) | 1.14.0 | Verifierad delintegration | Exakta andragradsekvationer med rationella eller inga reella rötter; BigInt-verifiering och förvanskade rotkontroller | github-actions-python |
| [scikit-learn](https://scikit-learn.org/stable/) | 1.9.1 | Installerat; saknar experimentintegration | Installerat med låsta beroenden; fasta regression-/klassificeringskontroller. Forskningsadapter och experiment återstår | github-actions-python |

Nya integrationer kräver låst källversion och licens, begränsad adapter, angiven körmiljö, positiva och negativa kontroller samt verifiering av rapportkedjan. Först därefter läggs experimentet till i körmenyn och den automatiska planeringen.
