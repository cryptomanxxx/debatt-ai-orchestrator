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

Katalogen visar DoWhy som installerat med forskningsadapter och körbart
experiment kvar att integrera. Installationen gör inte DoWhy till ett fritt
modellstyrt verktyg och lägger inte till något experiment i planeringen.
En framtida adapter måste använda denna isolerade interpreter och ett eget
protokoll med explicita antaganden, kontroller och verifierad rapportkedja.

Officiella källor:

- [DoWhy 0.14: beroenden och Python-versioner](https://github.com/py-why/dowhy/blob/v0.14/pyproject.toml)
- [DoWhy-dokumentation](https://www.pywhy.org/dowhy/v0.14/)
