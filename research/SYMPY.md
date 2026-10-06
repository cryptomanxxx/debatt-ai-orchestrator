# SymPy: exakt andragradsexperiment

Välj `sympy-quadratic` i Oraklets forskningslabb. Experimentet ingår även i
`auto`: tre seedade syntetiska metodtester med två distinkta rationella rötter,
en dubbelrot respektive inga reella rötter. Det prövar modellens algebraiska
svar, inte en hypotes om verkliga observationer eller vetenskaplig nyhet.

## Begränsad adapter

SymPy 1.14.0 och mpmath 1.3.0 versionslåses i `sympy-requirements.lock` och
`sympy-toolchain.json`. Båda har BSD-licens. Python-adaptern tar bara emot tre
heltalskoefficienter a,b,c för a*x²+b*x+c=0 och högst två rationella kandidater.
|koefficient| får vara högst 10000 och a får inte vara noll. Kandidater ska vara
kanoniska rationella strängar med högst sex siffror per täljare/nämnare,
positiv nämnare och inga dubbletter. Modellen får inte lämna uttryck eller kod.

SymPy använder `solveset` över reella tal. I denna version accepteras bara
polynom med kvadratisk diskriminant eller negativ diskriminant. Irrationella
rötter, generella uttryck, differentialekvationer och högre grad stöds inte.
Processen har 20 sekunders timeout, högst 4096 bytes input och 16384 bytes output.

Alla indata, facit, kontrollrotmängder och protokoll hashas innan första
modellförslaget. Modellen ser endast koefficienterna och protokollet. Förslaget
låses före verktyget; därefter visas facit och kvitton i rapporten.
SymPy kontrollerar de kompletta rotmängderna och insättning i polynomet.
JavaScript verifierar oberoende med BigInt-diskriminant, heltalskvadratrot,
exakta rationella beräkningar och insättning. Även versions- och inputkvittot
kontrolleras. Inga flyttal eller numeriska toleranser används för rotverifieringen.

För varje fall körs en positiv kontroll med exakt rotmängd och en negativ där
en rot utelämnas (eller en falsk rot läggs till om rotmängden är tom).
Båda använder samma polynom. Den negativa måste avvisas även när dess övriga
rötter är korrekta. Ofullständiga lösningar räcker inte. Rötter är distinkta;
multiplicitet rapporteras inte. `passed/failed` avser modellförslagets
träffsäkerhet, separat från SymPy:s oberoende verifierade lösning.

## Körning och verifiering

Båda forskningsworkflowen installerar SymPy och kör `pip check` samt fasta
installationskontroller. CI kör dessutom riktiga adapterkontroller och hela
rapportkedjan med simulerade modell-/Supabase-API:er. SymPy-körningarna i testet
är verkliga. Katalogvisning och Cloudflare-bygget behöver ingen SymPy-installation.

```sh
python3 -m venv .research-venv
.research-venv/bin/python -m pip install -r research/requirements.lock -r research/sympy-requirements.lock
.research-venv/bin/python -m pip check
.research-venv/bin/python scripts/check_sympy.py
RESEARCH_PYTHON="$PWD/.research-venv/bin/python" npm run test:sympy
```

Manuell körning gör tre modellanrop och sex verktygsanrop. `auto` tillför ett
planeringsanrop. Resultat och felrapporter sparas genom befintlig rapportkedja
i `oraklet_experiment` och Actions-artefakten. Slutförda fall bevaras vid avbrott.
