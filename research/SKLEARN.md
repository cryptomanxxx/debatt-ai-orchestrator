# Scikit-learn: linjär eller kvadratisk modell

Välj `sklearn-polynomial` i Oraklets forskningslabb. Experimentet ingår även
i `auto` och jämför två fasta OLS-modeller: y=b0+b1*x och y=b0+b1*x+b2*x².
Tre seedade syntetiska fall använder ett linjärt samband, ett kvadratiskt
samband och ett linjärt samband med en avvikande träningspunkt vid x=0.
Det sista fallet är en avsiktligt planterad outlier, inte ett slumpmässigt
brusurval eller ett robusthetstest med representativa verkliga data.

## Protokoll och datadelning

Varje fall har nio träningspunkter (x=-4..4), två valideringspunkter (x=-5,5)
och två separata testpunkter (x=-6,6). Datadelarna har inga gemensamma x-värden.
Fasta extrapolationspunkter innebär att detta inte är ett slumpmässigt
representativt test av generell prognosförmåga. Alla data, syntetiska facit,
kontrolldata och protokoll hashas före första modellförslaget.

Oraklet ser endast träningspunkterna och det gemensamma protokollet. Han
föreslår grad 1 eller 2 och en kort motivering. Han ser inga validerings-/testvärden
eller verktygsresultat före förslaget. Att välja bäst på osedda punkter är inte
säkert möjligt utifrån träningen; `passed/failed` jämför första förslaget med
det uppmätta valideringsvalet och är separat från kontrollkedjans status.

Python använder en `PolynomialFeatures(include_bias=False)`/`LinearRegression`
pipeline för vardera graden. Endast träningsdata går till `fit`; modellerna
tränas inte om. Grad 2 väljs bara om dess validerings-MSE är mer än 1e-9 lägre
än grad 1, annars väljs den enklare modellen. Test-MSE rapporteras utan att
påverka modellvalet. Testpunkter och båda modellernas testfel blir synliga först
i slutrapporten; de används inte för korrigeringsförsök. Inga p-värden,
signifikanspåståenden eller vetenskapliga nyhetsanspråk görs.

En oberoende JavaScript-implementation löser normalekvationerna med exakt
rationell BigInt-aritmetik, beräknar alla koefficienter, prediktioner och MSE
och väljer graden med exakt jämförelse mot 1/1 000 000 000. Scikit-learns
flyttalsresultat måste stämma inom 1e-8*(1+|referensvärde|). Beslut och grader
ska stämma exakt. Avvikelser, icke-finita tal och negativa MSE avvisas.

För varje primärfall körs också en kontrasterande kontroll med ett känt rent
linjärt eller kvadratiskt samband som måste ge motsatt modellval. Den kontrollerar
att verktyget kan skilja alternativen, inte bara leverera ett konstant beslut.
CI avvisar dessutom manipulerade verktygskvitton och kontrollerar att ändrade
testetiketter inte ändrar passning eller modellval och att ändrade validerings-
etiketter inte ändrar passningen.

## Begränsad adapter

Scikit-learn 1.9.1 och alla runtimeberoenden versionslåses i
`sklearn-requirements.lock` och `sklearn-toolchain.json`. NumPy, SciPy och
Narwhals matchar forskningsmiljön; Cloudpickle och Threadpoolctl matchar PyMC.
Scikit-learn har BSD-3-Clause-licens.

Adaptern tar endast strukturerade heltalspunkter i `train`, `validation`, `test`:
6–32 träningspunkter, 2–16 punkter per validerings-/testdel, |x|<=16, |y|<=10000
och unika x-värden över alla tre delar. JS och Python validerar gränserna
oberoende. Ingen uttrycksparser, vald estimator, fria hyperparametrar eller
modellgenererad kod stöds. Subprocessen har 20 sekunders timeout, högst 8192
bytes input och 16384 bytes output. Beräkning sker med en tråd.

## Körning och verifiering

Tre modellanrop och sex verktygsanrop behövs, plus ett planeringsanrop för
`auto`. Färdiga fall bevaras vid avbrott. Rapporten visar båda valideringsfelen,
vald grad och separat testfel; fulla data, förslag och kvitton sparas i
`oraklet_experiment` och Actions-artefakten. Livekörning använder det befintliga
modell- och databasflödet. Ingen separat hostingtjänst behövs.

```sh
python3 -m venv .research-venv
.research-venv/bin/python -m pip install -r research/requirements.lock -r research/sympy-requirements.lock -r research/sklearn-requirements.lock
.research-venv/bin/python -m pip check
.research-venv/bin/python scripts/check_sklearn.py
RESEARCH_PYTHON="$PWD/.research-venv/bin/python" npm run test:sklearn
```

Installationskontrollerna körs också med PyMC i CI. Den nya integrationssuiten
kör verklig Scikit-learn och rapportkedjan med simulerade modell-/Supabase-API:er.
`catalog-only`, Cloudflare och vanliga `npm test` behöver inte Scikit-learn.
Detta är en avgränsad delintegration; klassificering och fria modeller ingår inte.

Officiella källor:

- [Installation och beroenden](https://scikit-learn.org/stable/install.html)
- [PolynomialFeatures](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.PolynomialFeatures.html)
- [LinearRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LinearRegression.html)
