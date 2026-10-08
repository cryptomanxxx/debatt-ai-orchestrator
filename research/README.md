# Oraklets dagliga forskningslabb

`insulin-warming-forecast` jämför enkla 30–60-minutersprognoser av manuellt
avlästa aspart-gruppkurvor med och utan lokal uppvärmning. Separata tids- och
höjdparametrar, persistensreferens och avläsningsstresstest redovisas. Det gäller
insulininkrement i blodet, inte patienters blodsocker eller doser. Kör manuellt.
Se [data, modeller och protokoll](INSULIN-WARMING.md).

`glucose-temperature-evidence` är en manuell återanalys av publicerade
temperaturstudier med källhänvisningar, två alternativa temperaturkurvor och
ett deskriptivt överföringstest. Den skattar ingen patientmodell eller dos.
Se [temperaturprotokollet](GLUCOSE-TEMPERATURE.md).

Uppföljningen `glucose-robustness` testar felaktiga måltidsuppgifter och antagen
insulinkänslighet i det syntetiska absorptionsexperimentet. Välj den manuellt med
seed `20261008` för att matcha första körningen, eller låt `auto` välja den.
Se [protokoll, kontroller och begränsningar](GLUCOSE-ROBUSTNESS.md).

Forskningsmotorn ligger i orchestrator-repot. Webbplatsen visar rapporterna i
den befintliga Supabase-tabellen `oraklet_experiment` (schemaVersion 2).
Ingen ny databasmigrering krävs. Upprepad forskning ändrar data och planer,
inte Git-kod. En ny integration eller ändrad experimentmetod kräver fortfarande PR.

## Aktivera efter merge

Lägg `SUPABASE_SERVICE_ROLE_KEY` som Actions-secret i **detta repo**.
Återanvänd den befintliga nyckeln från Debatt-AI; lägg den inte i kod eller chatt.
`ORCHESTRATOR_API_KEY` finns redan för live-testerna. Ingen Groq-nyckel behövs
i Actions: modellen anropas genom den befintliga Cloudflare-orchestratorn.
Inga Cloudflare-inställningar eller nya betaltjänster behövs för denna ändring.

Kör **Oraklets forskningslabb → Run workflow → main**. För en persistent Problem Bank-körning anger du `problem_bank_id` och version. Problemets `source.experiment_id` måste peka på ett körbart katalogexperiment och problemets fråga måste exakt motsvara katalogfrågan; annars avbryts körningen före modell- eller verktygsanrop. Då skapas en `research_run` före experimentet, rapporten översätts till Research Loop-hypotes/försök/resultat och runnen avslutas atomiskt som `completed` eller `failed`. Tomt Problem Bank-ID behåller den befintliga fristående labbkörningen. Problem Bank använder `SUPABASE_URL` och `SUPABASE_SECRET_KEY`; den äldre rapporttabellen fortsätter tills vidare använda `SUPABASE_SERVICE_ROLE_KEY`.

Välj experiment:

| Val | Funktion |
| --- | --- |
| auto | Oraklet väljer upplägg och seed utifrån de tio senaste rapportsammanfattningarna |
| ratfit-baseline | Tre nya syntetiska fall, ett första förslag per fall |
| ratfit-feedback | Samma fallgenerator; högst en korrigering per fall utifrån sex synliga punkter |
| rankscreen-consistency | Klassificera fullrangssystem, med och utan planterad motsägelse |
| rankscreen-rank-deficit | Hitta rangbrist och motsägelser i beroende ekvationer |
| annihilator-recurrence | Återfinn en konstant rekursion och testa undanhållna termer |
| mixalot-model-comparison | Jämför två specificerade kategoriska modeller med exakt Bayesfaktor |
| statsmodels-ar1 | Testa tidsberoende med förutbestämt AR(1)-test, Holm och holdoutprognos |
| sympy-quadratic | Lös exakta andragradsekvationer; komplett reell rotmängd och oberoende BigInt-kontroll |
| sklearn-polynomial | Jämför linjär/kvadratisk OLS på validering, rapportera separat test-MSE och verifiera med rationell aritmetik |
| dowhy-backdoor | Skatta effekt under fast diagram; jämför justerad/ojusterad regression och verifiera med rationell aritmetik |
| catalog-only | Visa BootLoops och externa verktygs integrationsstatus, utan modell/databas |

Seed är 1–9 siffror; tomt ger dagens UTC-datum. Manuella körningar kan upprepa
samma seed för jämförelse. Om auto väljer en experiment/seed-kombination som
finns bland de tio senaste rapporterna väljer labbet nästa lediga seed för
det experimentet, utan ett nytt modellanrop. Ändringen sparas i planens
`seedAdjustment` och ingår i SHA-256 före datagenereringen. Manuellt valda
experiment behåller sin seed. Detta är ingen global dubblettgaranti.

Schemat kör dagligen cirka 05:17 UTC (07:17 svensk sommartid, 06:17 vintertid).
GitHub kan fördröja schemalagda körningar. Dagliga körningar använder `auto`.
Det gamla Debatt-AI-workflowet är manuellt och behövs inte för den nya motorn.

## Vetenskapligt och operativt kontrakt

Katalogen skiljer experiment från verktyg: två Ratfit-experiment använder
samma API-adapter och två Rankscreen-experiment använder samma lokala
Python-adapter i Actions. Tre ytterligare experiment använder begränsade
Annihilator-, Mixalot- och Statsmodels-operationer i Actions. Se [hela experimentkatalogen](EXPERIMENTS.md)
för samtliga 49 paket i den låsta BootLoops-versionen. 45 BootLoops-paket saknar ännu integration. Angivna delmängder av Ratfit,
Rankscreen, Annihilator och Mixalot är verifierade. Statsmodels är ett separat
installerat verktyg; endast AR(1)-adaptern är verifierad hos oss.
DoWhy kör `dowhy-backdoor` i en separat versionslåst Python-miljö med fast
diagram, justerad linjär regression och oberoende rationell kontroll.
Se [DoWhy-protokollet](DOWHY.md).
PyMC har ett manuellt BNP-experiment.
SymPy 1.14.0 och mpmath 1.3.0 installeras i båda forskningsworkflowen från
`sympy-requirements.lock`. Versionskontroll och fasta tester av ekvationslösning,
exakt derivata och integration körs före forskningen och i CI, även tillsammans
med PyMC-miljön. SymPy har en begränsad adapter för exakta andragradsekvationer
och experimentet `sympy-quadratic` kan väljas manuellt eller av `auto`.
Se [SymPy-protokollet](SYMPY.md).
Scikit-learn 1.9.1 installeras med låsta beroenden i forskningsworkflowen.
Versioner, regression och klassificering kontrolleras även i CI tillsammans
med PyMC och SymPy. `sklearn-polynomial` har en begränsad adapter för
modellval mellan grad 1 och 2, med oberoende OLS-kontroll och separat testdel;
se [Scikit-learn-protokollet](SKLEARN.md).
GitHub-menyn och planeringen innehåller endast körbara experiment.
`catalog-only` visar även väntande metoder i körningens Summary och artefakt.
Ändra katalogen, dispatch och workflowmenyn tillsammans; CI kontrollerar att de stämmer. Oraklet får
välja en strukturerad plan och motivering, men ingen exekverbar kod eller nya
metoder. Data är syntetiska med känt facit; körningen är inte en vetenskaplig
upptäckt och tre fall räcker inte för att belägga generell förbättring.

Planen skrivs och SHA-256 loggas före körningen. Alla datafingeravtryck sparas
före modellförslagen. I Ratfit lämnas bara synliga punkter till modellen; facit och
undanhållna punkter redovisas efteråt. Separat exakt BigInt-kontroll testar
modellens koefficienter. Ratfit måste godkänna rätt data och avvisa felaktig
kontrolldata. Godkänd Ratfit är inte ett godkännande av modellens förslag.

Rankscreen visar hela ekvationssystemet för modellen och mäter klassificering,
inte prediktion på dolda data. Tre seedade system paras med tre kontroller där
högerledet ändras. Rankscreen kör sparse-backend med tre fasta primtal.
Rang och konsistens jämförs med en oberoende exakt BigInt-beräkning av minorer.
Enighet mellan primtal behandlas som screening; exakt kontroll är slutlig
auktoritet. Oenighet eller felaktigt kvitto avbryter körningen. Adaptern begränsar
indata till 12 rader, fyra variabler och heltalssträngar med högst nio siffror,
15 sekunder och 64 KiB utdata. Experimenten använder tre variabler.
Modellen kan inte välja kod, primtal, filer, beroenden eller exekveringsväg.
Inga tillägg i den publika API- eller Cloudflare-miljön behövs.

Modellen är orchestratorns konfigurerade standardmodell, för närvarande Groq
GPT-OSS 120B. Ingen leverantörskedja importeras från webbplatsen. Provider och
modell-ID låses från första anropet (inklusive planering); byte avbryter
körningen. API-alias garanterar inte oförändrade modellvikter hos leverantören.
Högst sju modellanrop och sex verktygsanrop per körning, inga automatiska
retries. Forskningsanrop begär 4096 completion-tokens, inklusive modellens reasoning,
och verifierar att orchestratorn använder denna budget. Vanliga API-anrop
behåller 1024. Budgeten sparas som `inferenceSettings` i rapport och planartefakt.
Andra modeller kräver separat konfiguration. Detta tak begränsar antalet
anrop, inte en garanterad kostnad eller CPU-förbrukning för alla körningar.

Rapporter med felaktiga förslag sparas som `failed` men workflowet är grönt
när mätningen slutförts. Modellbyte, ogiltig plan/JSON eller trasig kontroll
ger en sparad driftfelsrapport (`executionStatus: error`) och rött workflow.
Databasfel ger rött workflow; lokala rapportfiler laddas ändå upp som artefakt
om de hunnit skapas. Inga råa API-fel eller nycklar skrivs i rapporterna.
Webbplatsens befintliga cache kan fördröja när en ny rapport syns.

Tester: `npm run test:research` och `npm run test:bootloops`. Modell- och
databassvar simuleras, men Rankscreen kör riktig låst uppströmskod via Python.
Tester omfattar parade kontroller, oenighet mellan primtal, dålig nämnare,
begränsad indata, rapportdispatch och avvisning av ändrade kvitton. Ingen
modellkredit eller nyckel används. CI kör dem tillsammans med befintliga API-tester.

## Driftfelsdiagnostik

Rapportens `failure` innehåller en fast felkod, fallnummer och operation samt
HTTP-status när den finns. Modellsvar som stoppas av tokenbudgeten avvisas
som `model_output_truncated`; tomma svar, leverantörens HTTP-fel och nätverksfel
har separata koder. Råa feltexter och nycklar skrivs aldrig till rapporten.
Slutförda fall sparas i `progress.json` och i driftfelsrapporten, tydligt som
delresultat från ett avbrutet experiment. Inga automatiska retries införs. API:ts nya felkoder kräver att orchestrator-Workern deployas efter merge.

`Testa forskningsdatans BootLoops-kontroller` kör sex fasta positiva och
negativa kontroller med seed 20261006, utan modell eller databas. Det är ett
manuellt live-test som skiljer verktygsdrift från modellfel.

Det observerade tokenstoppet med 1024 tokens motiverar en explicit
forskningsbudget på 4096. Ändringen kräver deployment av orchestrator-Workern efter merge.
Om den gamla versionen fortfarande används avbryts körningen med
`model_budget_not_applied` i stället för att tyst köra med fel budget.
4096 tokens garanterar inte att varje svar blir färdigt; eventuella nya
tokenstopp fortsätter att rapporteras som driftfel.

## Underhåll av katalogen

`research/bootloops-inventory.json` låser paketlistan till samma uppströmscommit
som verktygen. `research/catalog.mjs` kopplar flera experiment till ett verktyg
och anger integrationsomfattning/körmiljö. `npm run research:catalog` skriver
Markdown och JSON i `reports/oraklet-lab/`; `research/EXPERIMENTS.md` ska motsvara
den genererade Markdown-filen. Uppströms paketlista är en inventering, inte
en lista över verktyg som automatiskt går att köra hos oss.

## Installation av forskningsverktyg

Actions installerar `research/requirements.lock` med Python 3.12 före forskning
och i de två CI-jobb som kör vetenskapstester. Statsmodels 0.15.0 och samtliga
transitiva paket är versionslåsta. `catalog-only` behöver inga beroenden.
Varje ny vetenskaplig operation verifierar versionerna mot `toolchain.json`.
Beroendedrift blir driftfel, inte ett tyst nytt experiment.

Lokalt:

```sh
python3 -m venv .research-venv
.research-venv/bin/python -m pip install -r research/requirements.lock
npm test
PATH="$PWD/.research-venv/bin:$PATH" npm run test:science
PATH="$PWD/.research-venv/bin:$PATH" npm run test:bootloops
```

`npm test` kräver inte de låsta vetenskapspaketen och används i Cloudflare-bygget.
`npm run test:science` kör de verkliga vetenskapliga Python-adaptrarna och
rapporttesterna; CI kör alltid detta steg efter installation av låsfilen.

`RESEARCH_PYTHON` kan ange en absolut sökväg till Python för de nya adaptrarna.
Använd annars samma Python 3.12 som installerat låsfilen. Ingen ny modellnyckel,
Cloudflare-service eller databasändring behövs.

## Hypotesprövning

[PyMC:s bayesianska BNP-uppföljning](PYMC.md) finns som `pymc-gdp-ar1` i menyn.
Den väljs manuellt och installerar en separat låst PyMC-miljö i Actions.
`npm run test:pymc` verifierar denna adapter; ordinarie Cloudflare-bygge
behöver inte PyMC-paketen.

Se [hypotesprotokollen och forskningsriktningen](HYPOTHESES.md). En hypotes måste
ha definierad modell, data, antaganden och beslutskriterier. Dessa låses före
modellens svar och verktygskörningen. Fingeravtrycket inkluderar protokoll,
träningsdata, holdout, kontroller och syntetiskt facit.

- Annihilator passar högst ordning två med konstanta koefficienter på 24
  träningsvärden, vid två fasta primtal. Sex externa kontrolltermer används
  endast efter rekonstruktionen. Modellen ser de första tolv träningsvärdena.
  Den ändrade kontrollsvansen måste avvisas med samma rekonstruerade formel.
  De tre serierna är olika inom körningen: vid parameterkollision ökas det
  andra startvärdet deterministiskt, samtidigt som geometriska serier undviks.
- Mixalot jämför en känd signatur med en blandning av två fasta signaturer.
  Priorerna och BF-trösklarna låses; två uppströmsvägar och en separat exakt
  BigInt-polynomintegration måste ge samma evidens. Före modellförslaget väljs
  en känd kontroll: [12,12] ska stödja H1 om primärdata stödjer H0; annars ska
  [0,24] stödja H0. Kontrollens förväntade beslut ingår i fingeravtrycket och
  rapporten, och körningen avbryts om kontrollen inte ger ett annat beslut.
  Antalet verkliga grupper
  kan inte identifieras generellt från dessa iid kategoriska räknedata.
- Statsmodels passar AR(1) med intercept på 88 observationer och använder 16
  holdoutobservationer enbart för prognosutvärdering. SciPy kontrollerar
  skattning/standardfel/p-värde; separat JavaScript kontrollerar regression,
  Student-t-svans, intervall och prognos. Alpha 0.05 låses i förväg och Holm
  korrigerar familjen med tre tester. Till dess alla tre fall är klara markeras
  familjeinferensen som ofullständig. Korrigeringen täcker inte återkommande
  dagskörningar. Utebliven förkastning innebär inte att H0 bevisats.

Rapportens `hypothesisTest` och Summary-tabellen visar uppmätt evidens och
beslut separat från modellförslagets träffsäkerhet. `passed/failed` fortsätter
mäta om modellförslagen stämmer, medan `executionStatus` anger driftstatus.
Dessa är syntetiska acceptans- och metodtester, inte fynd från verkliga data.
Adaptrarna tillåter inte fria Pythonprogram, dataset-URL:er, filvägar, priorer,
laggval eller p-värdesoptimering från modellen. Nya testklasser behöver en
reviewad adapter; fler bibliotek gör inte automatiskt alla hypoteser körbara.
