# Scikit-learn i forskningsmiljön

Scikit-learn 1.9.1 installeras från `sklearn-requirements.lock`. Alla dess
runtimeberoenden är versionslåsta i samma fil och `sklearn-toolchain.json`.
NumPy, SciPy och Narwhals använder befintliga forskningsversioner; Cloudpickle
och Threadpoolctl matchar PyMC-miljön. Scikit-learn använder BSD-3-Clause-licens.
Officiella installationsinstruktioner: https://scikit-learn.org/stable/install.html.

Oraklets forskningslabb och hypotesworkflow installerar paketet före forskningen.
CI kontrollerar installationen både i den vanliga forskningsmiljön och tillsammans
med PyMC och SymPy. `pip check` kontrollerar beroendekompatibilitet och
`scripts/check_sklearn.py` verifierar låsfil, installerade versioner, en känd
linjär regression och klassificering med en StandardScaler-pipeline.
Prediktionspunkterna ingår inte i träningen. Kontrollerna använder fasta lokala
data och en tråd; de hämtar inga dataset och kör ingen modellgenererad kod.

Detta verifierar installationen. Scikit-learn har ännu ingen forskningsadapter
eller körbart experiment och kan inte väljas av Oraklets experimentplanering.
En sådan integration behöver eget protokoll, tränings-/testdelning, kontroller
och verifierad rapportkedja. `catalog-only`, Cloudflare och vanliga `npm test`
kräver inte Scikit-learn.

## Lokal kontroll

```sh
python3 -m venv .research-venv
.research-venv/bin/python -m pip install -r research/requirements.lock -r research/sympy-requirements.lock -r research/sklearn-requirements.lock
.research-venv/bin/python -m pip check
.research-venv/bin/python scripts/check_sklearn.py
```

För PyMC-kompatibilitet installeras dessutom `research/pymc-requirements.lock`
i miljön före samma kontroller.
