# PyMC: bayesiansk BNP-uppföljning

Välj `pymc-gdp-ar1` manuellt i Oraklets forskningslabb efter merge. PyMC 6.3.2
och alla transitiva paket installeras från `pymc-requirements.lock`; övriga
experiment behöver inte PyMC. Daglig automatisk planering väljer inte denna
uppföljning. Det är en verifierad delintegration för en fast modell, inte stöd
för fritt modellgenererad PyMC-kod. PyMC licensieras under Apache-2.0.

Analysen använder samma dokumenterade historiska BNP-tillväxt som
[hypotespiloten](HYPOTHESIS-PILOT.md): 128 träningskvartal 1973Q4–2005Q3.
Holdout lagras i rapporten men används inte för skattning eller prognostest
i detta experiment. Frågan gäller posteriorosäkerhet för lagg-1-koefficienten.
Det är en explorativ uppföljning på samma data, inte oberoende replikation.

## Låst modell och priorer

Tillväxt `g[t] = intercept + phi*g[t-1] + epsilon[t]`; Gaussian innovationer
med gemensam varians och första observationen behandlad som given.

- `variance ~ InverseGamma(shape=3, scale=16)`.
- `[intercept, phi] | variance ~ Normal([0,0], variance*diag(100,1))`.
- Sampler: PyMC NUTS, fyra kedjor, 1 000 tune + 1 000 sparade drag per kedja,
  target_accept 0.95, en kärna och explicit seed. PyTensor kör Numba-backend
  med C-kompilator avstängd och tillfällig kompileringskatalog.
- Kvalitetskrav: rank-Rhat högst 1.01, bulk- och tail-ESS minst 400 för alla
  parametrar, noll divergenser. Misslyckade krav blir driftfel; inget automatiskt
  nytt seed eller ändrad tröskel används för att få godkänt resultat.

PyMC:s logdensitet kontrolleras i tre fasta punkter mot prior + likelihood.
Den konjugata modellen har dessutom en analytisk posterior: en separat
matrisberäkning och SciPy Student-t ger medelvärde, equal-tailed 95% intervall
och `P(phi>0)`. MCMC måste stämma inom fasta Monte Carlo-felgränser.
JavaScript beräknar posteriorn, Student-t-sannolikhet, intervall och modellens
logdensitet oberoende och verifierar hela versions-/inputkvittot.

En analytisk nollkontroll med laggkovarians noll måste ge posteriorcentrering
phi=0, P(phi>0)=0.5 och ett intervall som omfattar noll. Samma samplerkrav
gäller där. Input begränsas till 64–128 decimalvärden och ett seed på 1–9
siffror. Subprocessen har 180 sekunders timeout och fasta storleksgränser.

## Rapportens betydelse

Positiv/negativ koefficient rapporteras endast om 95% posteriorintervallet
ligger helt över/under noll; annars otillräcklig evidens. Detta är ett låst
posteriorbaserat beslut, inte ett frekventistiskt p-värde eller Bayesfaktor.
En kontinuerlig prior ger inte posterior sannolikhet för punktnollan phi=0.
Modellens gissning redovisas separat; `passed/failed` gäller dess träffsäkerhet.
Uppmätt evidens finns i `hypothesisTest.measured`, även om gissningen var fel.

Priorerna tillåter koefficienter utanför stationaritetsområdet; modellen
fastställer inte stationaritet, homoskedasticitet eller stabilitet över tiden.
Resultatet är villkorligt på modellen och priorerna och innebär inte kausalitet
eller vetenskaplig nyhet. Ett nytt sampler-seed ger inte ett nytt dataset.

## Lokal verifiering

```sh
python3 -m venv .pymc-venv
.pymc-venv/bin/python -m pip install -r research/pymc-requirements.lock
.pymc-venv/bin/python -m pip check
RESEARCH_PYMC_PYTHON="$PWD/.pymc-venv/bin/python" npm run test:pymc
```

`npm test` och Cloudflares byggkommando kräver inte PyMC. Ett separat CI-jobb
kör riktiga GDP-/nollkontrollanalyser och verifierar runnerns rapportkedja med
kvittot från dessa verktygskörningar. Modell- och Supabase-API:er simuleras i CI.
