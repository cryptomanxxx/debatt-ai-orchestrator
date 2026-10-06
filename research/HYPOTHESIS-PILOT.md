# Oraklets hypotesförsök med verkliga data

Oraklet väljer real BNP, real konsumtion eller reala investeringar och skriver
en forskningsfråga och motivering utan observationer eller statistik.
Hypotesklassen är avgränsad: H0 phi=0 mot H1 phi!=0 för AR(1)-tillväxt med
intercept, fast lagg 1, tvåsidigt nominalt t-test och alpha=0.05. Modellen kan
inte byta metod, välja fler variabler eller skriva exekverbar kod.
Detta testar formulering inom en fast klass, inte fri vetenskaplig upptäckt.

Hypotes, protokoll, data, perioder och nollkontroll sparas med SHA-256 före
verktygsanalysen. Misslyckad sparning stoppar analysen. Statsmodels-resultat
verifieras med SciPy och separat JS-regression/Student-t/prognos; en analytisk
nollkontroll måste ge phi ungefär noll och p ungefär ett. Budget: ett
modellanrop (4096 completion-tokens) och två verktygsanrop.

## Dataproveniens

`macrodata.json` exporterar 203 kvartal 1959Q1–2009Q3 och tre kolumner från
Statsmodels 0.15.0:s `macrodata.csv`. Enligt datasetets metadata är källan FRED,
Federal Reserve Bank of St. Louis, åtkomstdatum 2009-12-15, och licensen public
domain. Det är en historisk dataversion, inte dagens reviderade statistik.

- [Datasetbeskrivning](https://www.statsmodels.org/stable/datasets/generated/macrodata.html)
- [Uppströms CSV](https://github.com/statsmodels/statsmodels/blob/v0.15.0/statsmodels/datasets/macrodata/macrodata.csv)
- CSV SHA-256: `d93c0d3a7a77ef83c3af14e46032bb1d02ae3a512b22ab94159a8ca226fcf708`.

Transform: `400*ln(x[t]/x[t-1])`, avrundad till sex decimaler. Sista 144
tillväxtvärdena: 128 träning 1973Q4–2005Q3, 16 tidsordnade prognosvärden
2005Q4–2009Q3. Ingen prognosdata går in i hypotesprövningen. Endast en variabel
väljs med metadata; ingen resultatstyrd sökning eller omkörning ingår.

Inferensen förutsätter stationär AR(1) med iid homoskedastiska innovationer;
pilotförsöket fastställer inte dessa antaganden. Strukturbrott och varierande
varians kan göra nominella p-värden missvisande. Resultatet är villkorligt,
inte kausalt eller bevis för nyhet. Utebliven förkastning bevisar inte H0.
Upprepade körningar med samma data är inte oberoende bekräftelser.
`status=passed` betyder att analys- och kontrollkedjan slutfördes, inte att H1
är sann; vetenskapligt beslut står i `hypothesisOutcome`.

## Körning och rapport

Workflow **Oraklet formulerar och testar en hypotes** körs manuellt efter
merge. Första liveförsöket triggas vid push till den särskilda pilotbranchen
`codex/oraklet-hypothesis-pilot`, efter lokala tester, för att genomföra det
beställda försöket före merge. Samma befintliga Actions-secrets och låsta
Python-beroenden används. Labbet och piloten delar concurrency-grupp.
Ingen daglig körning eller automatisk katalogplanering införs för piloten.

Supabase `oraklet_experiment` får experimentId `oraklet-macro-hypothesis-pilot`.
Artefakten innehåller hypotes, data, fullständig evidens och läsbar rapport.
Driftfel och tillgängliga delresultat sparas även vid avbrott, utan verifierad
slutsats. Tester simulerar modell/databas men kör verkliga Python-verktyg.
Lokalt: `npm test` och, med låsfilen installerad, `npm run test:science`.
