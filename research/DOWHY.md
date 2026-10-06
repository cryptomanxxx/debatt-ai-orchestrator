# DoWhy i forskningsmiljön

DoWhy 0.14 och samtliga runtimeberoenden versionslåses i
`dowhy-requirements.lock` och `dowhy-toolchain.json`. DoWhy använder MIT-licens.
Installation och kontroller körs i en separat `.dowhy-venv` med Python 3.12.

DoWhy 0.14 kräver SciPy <=1.15.3 på Python 3.12; den befintliga forskningsmiljön
använder SciPy 1.18.1. DoWhy-låsfilen använder därför SciPy 1.15.3 i sin egen
miljö. Installera inte DoWhy-låsfilen i `.research-venv` eller PyMC-miljön.
Ingen aktivering eller PATH-ändring görs: varje kommando använder explicit
`.dowhy-venv/bin/python`. De befintliga experimentens låsningar ändras inte.

## Fast installationskontroll

`scripts/check_dowhy.py` kontrollerar låsfilens överensstämmelse med manifestet
samt samtliga installerade paketversioner. `pip check` verifierar beroenden.
Ett fast NetworkX-diagram anger z->t, z->y och t->y. Ett balanserat faktoriellt
syntetiskt dataset med 25 observationer har oberoende z,u, t=z+u och
utfall y=tau*t+2*z. Inga externa data, användarvalda diagram eller
modellgenererad kod används.

DoWhy måste identifiera z som backdoor-justeringsvariabel och återfinna
unit-contrast-effekten tau med linjär regression för både tau=3 och tau=0.
Den analytiska referensen kontrolleras inom absolut tolerans 1e-10. En separat
naiv regression utan z måste ge tau+1 i samma konstruktion. Det visar att
justeringen fungerar även när en ojusterad association är missvisande.
Detta är en installationskontroll för ett känt syntetiskt diagram; det
validerar inte kausala antaganden om verkligheten och kör ingen generell
refutationskedja. Inga signifikans- eller konfidensintervall begärs.

## Workflows och lokal körning

Oraklets forskningslabb och hypotesworkflow installerar och kontrollerar den
isolerade miljön före forskning. Ett separat CI-jobb gör samma sak från den
låsta filen. `catalog-only` installerar inga Python-paket. Vanliga `npm test`
och Cloudflare behöver inte DoWhy.

```sh
python3 -m venv .dowhy-venv
.dowhy-venv/bin/python -m pip install -r research/dowhy-requirements.lock
.dowhy-venv/bin/python -m pip check
.dowhy-venv/bin/python scripts/check_dowhy.py
```

## Körbart experiment: dowhy-backdoor

Katalogen och Oraklets labb erbjuder `dowhy-backdoor`. Tre seedade fall prövar
positiv, negativ och utebliven kausal effekt under samma fasta diagram.
Varje fall har 75 balanserade observationer: z,u i {-2,-1,0,1,2},
v i {-1,0,1}, t=z+u och y=intercept+tau*t+gamma*z+v.
Den ojusterade associationskoefficienten är tau+gamma/2. Det negativa
fallet har positiv ojusterad association; nolleffekten har också positiv association.

Diagrammet, observerad och tillräcklig justeringsvariabel z, frånvaro av
ytterligare dolda gemensamma orsaker samt linjär additiv konstant effekt
är givna antaganden. Detta är metodtester på syntetiska data, ingen
kausal upptäckt eller validering av antaganden om verkligheten.

Alla dataset, syntetiska facit och kontroller binds med SHA-256 före första
modellanropet. Oraklet ser huvudfallets data, diagram och protokoll och anger
justeringsvariabel och numerisk effekt före verktygskörning. Facit och
kontrolldata visas först i rapporten. Inga korrigeringsanrop görs.
Fel förslag blir ett vetenskapligt underkänt resultat även om DoWhy fungerar.

Den fasta Python-adaptern identifierar backdoor-justering för z och använder
DoWhys linjära regression för do(t=1) minus do(t=0). JavaScript beräknar
oberoende koefficienterna med exakta rationella kovarianser och verifierar
effekt, intercept, z-koefficient, ojusterad association och residual-MSE.
Toleransen är 1e-8*(1+|referens|); |effekt|<=1e-9 klassas som nolleffekt.
Varje fall har en kontroll med samma confounding men en annan kausal effekt
och ett annat beslut. Totalt används tre modellanrop och sex verktygsanrop.

Adaptern accepterar endast 25–125 heltalsrader med tre begränsade kolumner.
Diagram, estimator och kod kan inte ändras av modellen. Singulära designer,
extra indata, icke-finita tal, versionsdrift och fel inputfingeravtryck avvisas.
Varje verktygsanrop har 30 sekunders timeout, högst 8 KiB indata och 16 KiB
utdata och använder explicit `.dowhy-venv/bin/python` (eller `DOWHY_PYTHON`).
`RESEARCH_PYTHON` används inte av DoWhy.

Rapporten sparar första förslag, både verktygskvitton, facit, kontroller och
antaganden i JSON/Supabase. Markdown visar justerad effekt och ojusterad
association. Driftfel sparar slutförda fall som delresultat med felstatus.
Inga p-värden, konfidensintervall eller DoWhy-refutationskedjor används.

```sh
npm run test:dowhy
EXPERIMENT=dowhy-backdoor EXPERIMENT_SEED=123 node research/runner.mjs
```

Runnern kräver de vanliga orchestrator- och Supabase-nycklarna.
Testsviten kör riktig DoWhy med simulerade modell- och lagringssvar.

Officiella källor:

- [DoWhy 0.14: beroenden och Python-versioner](https://github.com/py-why/dowhy/blob/v0.14/pyproject.toml)
- [DoWhy-dokumentation](https://www.pywhy.org/dowhy/v0.14/)
