# Oraklets dagliga forskningslabb

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

Kör **Oraklets forskningslabb → Run workflow → main**. Välj experiment:

| Val | Funktion |
| --- | --- |
| auto | Oraklet väljer upplägg och seed utifrån de tio senaste rapportsammanfattningarna |
| ratfit-baseline | Tre nya syntetiska fall, ett första förslag per fall |
| ratfit-feedback | Samma fallgenerator; högst en korrigering per fall utifrån sex synliga punkter |
| rankscreen-consistency | Klassificera fullrangssystem, med och utan planterad motsägelse |
| rankscreen-rank-deficit | Hitta rangbrist och motsägelser i beroende ekvationer |
| catalog-only | Visa körbara experiment och samtliga 49 pakets integrationsstatus, utan modell/databas |

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
Python-adapter i Actions. Se [hela experimentkatalogen](EXPERIMENTS.md)
för samtliga 49 paket i den låsta BootLoops-versionen. 47 saknar ännu
integration; bara angivna delmängder av Ratfit och Rankscreen är verifierade.
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
