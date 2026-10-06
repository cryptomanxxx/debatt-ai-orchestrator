# SymPy i forskningsmiljön

SymPy 1.14.0 och dess beroende mpmath 1.3.0 versionslåses i
`sympy-requirements.lock`; samma versioner finns i `sympy-toolchain.json`.
SymPy använder BSD-licens och mpmath BSD-licens.

Både Oraklets forskningslabb och hypotesworkflow installerar paketen och kör
`pip check` samt `scripts/check_sympy.py` före forskningen. Katalogvisning
(`catalog-only`) behöver ingen Python-installation. CI kontrollerar både den
vanliga forskningsmiljön och PyMC-miljön med SymPy installerat.

Installationskontrollen verifierar versionslåsningen, rötterna 2 och 3 till
x²−5x+6=0, exakt derivata och motsvarande integral. Den tar inte emot uttryck
eller kod från en användare eller AI-modell. Detta verifierar installationen,
inte en generell forskningsadapter. SymPy visas därför som installerat men
saknar ännu experimentintegration; inget nytt experiment läggs till i menyn.

## Lokal kontroll

```sh
python3 -m venv .research-venv
.research-venv/bin/python -m pip install -r research/requirements.lock -r research/sympy-requirements.lock
.research-venv/bin/python -m pip check
.research-venv/bin/python scripts/check_sympy.py
```

SymPy körs i GitHub Actions Python-miljö. Cloudflare-bygget och vanliga
`npm test` behöver inte SymPy. Nästa integrationssteg är en avgränsad adapter
med egna indataregler, positiva/negativa kontroller och verifierad rapportkedja.
