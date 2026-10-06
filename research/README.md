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

Seed är 1–9 siffror; tomt ger dagens UTC-datum. Manuella körningar kan upprepa
samma seed för jämförelse. Auto avvisar en identisk experiment/seed-kombination
i den lästa historiken. Detta är ingen global dubblettgaranti.

Schemat kör dagligen cirka 05:17 UTC (07:17 svensk sommartid, 06:17 vintertid).
GitHub kan fördröja schemalagda körningar. Dagliga körningar använder `auto`.
Det gamla Debatt-AI-workflowet är manuellt och behövs inte för den nya motorn.

## Vetenskapligt och operativt kontrakt

Ratfit är det enda anslutna BootLoops-verktyget. Katalogens två poster är
experimentupplägg för detta verktyg, inte hela BootLoops utbud. Oraklet får
välja en strukturerad plan och motivering, men ingen exekverbar kod eller nya
metoder. Data är syntetiska med känt facit; körningen är inte en vetenskaplig
upptäckt och tre fall räcker inte för att belägga generell förbättring.

Planen skrivs och SHA-256 loggas före körningen. Alla datafingeravtryck sparas
före modellförslagen. Bara synliga punkter lämnas till modellen; facit och
undanhållna punkter redovisas efteråt. Separat exakt BigInt-kontroll testar
modellens koefficienter. Ratfit måste godkänna rätt data och avvisa felaktig
kontrolldata. Godkänd Ratfit är inte ett godkännande av modellens förslag.

Modellen är orchestratorns konfigurerade standardmodell, för närvarande Groq
GPT-OSS 120B. Ingen leverantörskedja importeras från webbplatsen. Provider och
modell-ID låses från första anropet (inklusive planering); byte avbryter
körningen. API-alias garanterar inte oförändrade modellvikter hos leverantören.
Högst sju modellanrop och sex verktygsanrop per körning, inga automatiska
retries. API:ts befintliga tokenbudget gäller även här. Större budget eller
andra modeller kräver separat konfiguration. Detta tak begränsar antalet
anrop, inte en garanterad kostnad eller CPU-förbrukning för alla körningar.

Rapporter med felaktiga förslag sparas som `failed` men workflowet är grönt
när mätningen slutförts. Modellbyte, ogiltig plan/JSON eller trasig kontroll
ger en sparad driftfelsrapport (`executionStatus: error`) och rött workflow.
Databasfel ger rött workflow; lokala rapportfiler laddas ändå upp som artefakt
om de hunnit skapas. Inga råa API-fel eller nycklar skrivs i rapporterna.
Webbplatsens befintliga cache kan fördröja när en ny rapport syns.

Tester: `npm run test:research`. De använder simulerade API-svar, inga nycklar
eller modellkrediter. CI kör dem tillsammans med befintliga API-tester.
