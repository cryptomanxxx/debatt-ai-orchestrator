# OpenAI:s matematiksamling: vad som har störst potential för nya framsteg

**Datum:** 2026-11-04
**Källa:** [openai/math](https://github.com/openai/math), commit `4eaee87` (2026-10-29), Apache-2.0
**Underlag i repot:** [katalog.json](katalog.json) (alla 373 familjer) och [garsia_entropy.py](garsia_entropy.py) (pilot för experiment E1)

## Sammanfattning

Samlingen innehåller 721 manuskript i 373 resultatfamiljer. En internt utvecklad, ej släppt OpenAI-modell har skrivit dem. Många påstår att de löser kända öppna problem, bland andra Unique Games-förmodan, att Exponential Time Hypothesis är falsk, ω ≤ 9/4 för matrismultiplikation och den kvasi-Riemannska hypotesen.

OpenAI kallar själva materialet för rådata, inte färdiga artiklar. Tre manuskript har redan dragits tillbaka, och 14 har rättats i efterhand. Ingen av slutsatserna nedan påstår att resultaten stämmer. De gäller var det finns mest att bygga vidare på, och vad labbet kan pröva själv.

- **Alla sammanfattningar lästa.** Jag har läst sammanfattningarna för alla 373 familjer och innehållsförteckningen med de 721 abstrakten. De 21 familjer som har körbar kod har jag gått igenom i detalj.
- **Omkörning.** Jag körde om verifieringen för 20 paket i 17 av de 21 kodfamiljerna. Alla gick igenom inom sin dokumenterade omfattning. Ett paket (Mahler, familj 087) går inte att köra som beskrivet, eftersom en fil saknas.
- **Pilotexperiment.** Ett eget pilotexperiment bygger på dimensionsformeln i familj 148. Det återger det kända värdet 0,995713 för Bernoulli-faltningen med det gyllene snittet, med alla sex decimaler. Formeln används sedan på ett nytt fall: en Salem-parameter, där resultatet antyder full dimension trots att faltningen enligt familj 153 är singulär.
- **Störst potential.** Mest att bygga vidare på finns i fem områden:
  - matrismultiplikation (107);
  - sampling och räkning för statistik: perfekta matchningar, kontingenstabeller, grafbyten och log-konkav sampling (113, 115, 131, 139);
  - Bernoulli-faltningar (148, 153);
  - datorstödda spektralgap för spinnkedjor (268);
  - rekonstruktionströsklar på träd (229).
- **Viktigaste verktygen.** De mest användbara verktygen är Lean-biblioteket med Comparator-utmaningarna och mönstret "certifikat plus oberoende kontrollprogram i exakt aritmetik". Samma mönster bör labbet ta till sig för Oraklets egna experiment.

**Vem som har läst:** Den här genomgången har Claude gjort. Professor Oraklet har ännu inte läst samlingen själv; hans litteraturdag hämtar artiklar från de vanliga litteraturdatabaserna, och openai/math finns inte där. Avsnittet [Nästa steg](#nästa-steg) föreslår hur Oraklet kan läsa katalogen och köra experimenten i labbet.

## 1. Vad samlingen är

| | Antal |
|---|---|
| Manuskript | 721 |
| Resultatfamiljer | 373 |
| Familjer med huvudresultatet i Lean-katalogen (`lean/formalization.yaml`) | 138 |
| Familjer med Lean-dokumentation av någon del (omfattningen varierar) | 245 |
| Familjer med körbar verifieringskod | 21 |
| Indragna manuskript (7 oktober) | 3 |
| Lean-filer i biblioteket (Lean 4.34.1) | cirka 162 000 |
| Comparator-utmaningar (påstående plus bevis att jämföra) | 418 |

Varje resultat tog i snitt tre timmars beräkning. Modellen fick ungefär 4 000 problem, och ett urval efter betydelse gav katalogen.

**Ämnesfördelning** (familjer; i parentes de med Lean-dokumentation):

| Ämne | Familjer | Lean |
|---|---|---|
| Teoretisk datalogi | 41 | 35 |
| Kombinatorik | 37 | 33 |
| Algebraisk och komplex geometri | 36 | 9 |
| Talteori | 31 | 17 |
| Sannolikhet och statistisk mekanik | 29 | 19 |
| Differentialgeometri | 29 | 15 |
| Matematisk fysik | 25 | 17 |
| Operatoralgebror | 19 | 15 |
| Algebra | 18 | 10 |
| Topologi | 18 | 3 |
| Reell och komplex analys | 16 | 11 |
| Partiella differentialekvationer | 16 | 11 |
| Konvex och metrisk geometri | 15 | 13 |
| Gruppteori | 14 | 12 |
| Dynamiska system och ergodteori | 12 | 9 |
| Funktionalanalys | 11 | 10 |
| Matematisk logik | 6 | 6 |

Datalogi, kombinatorik och logik är nästan helt formaliserade. Algebraisk geometri och topologi är det minst. Där är påståendena alltså svårast att kontrollera.

## 2. Hur genomgången gjordes

1. **Läsning.** Jag läste sammanfattningarna för alla 373 familjer och innehållsförteckningen med abstrakten för de 721 manuskripten. Ämnesindelningen kommer från samlingens översikt.
2. **Klassning.** Varje familj märktes med ämne, Lean-status, kod och antal manuskript. Resultatet finns i [katalog.json](katalog.json).
3. **Kod.** För de 21 kodfamiljerna läste jag verifieringsbeskrivningarna och körde de kontroller som går att köra i en vanlig Linux-miljö med Python 3, NumPy, SciPy, SymPy och g++. Varje paket kördes i en egen kopia utanför samlingen.
4. **Pilot.** Ett av experimentförslagen provades i liten skala (avsnitt 5, E1).

Bevisen i fulltext har jag inte granskat. Med 721 manuskript och flera hundra sidor per familj går det inte i en genomgång som den här. Bedömningen av potential bygger på sammanfattningarna, verifieringsstatus och vad koden faktiskt gör.

## 3. Omkörning av verifieringen

Alla körningar gjordes 2026-11-04, med Python 3.13, NumPy 2.3.5, SciPy 1.18.1 och SymPy 1.14.0.

| Familj | Paket | Vad som kördes | Resultat | Tid |
|---|---|---|---|---|
| 189 Cykel–klick-Ramseytal | båda kontrollprogrammen | fullständig omkörning | PASS: 3 099 mönster i alla 42 parameterpar, båda programmen ger samma utdata | 177 s |
| 187 Snaky på 21 drag | 21-dragscertifikat plus tre rekonstruktioner | fullständig omkörning | PASS (route21, route25, route35) | cirka 2,5 min |
| 361 Harmonisk dimension | räknekontroll | fullständig | PASS ("exact count proves (3): True") | 21 s |
| 153 Bernoulli-faltningar | grad-31-certifikat | fullständig | PASS | 37 s |
| 101 Isotropa konstanter | skalära certifikat | fullständig | PASS | 5 s |
| 352 Calabi-flödets singularitet | certifikat, marginaler, svans | fullständig | PASS | 78 s |
| 348 Einstein-fyrmångfalder | två paket | fullständig, jämförd med sparade resultat | PASS (53 identiteter, 21 certifikatrader) | 5 s vardera |
| 272 Sammanflätning utan nyckel | tre kontroller | fullständig, utdata byte för byte | PASS, identiska med sparade utdata | 2 s |
| 067 Campana–Peternell | certifikat | fullständig | PASS | 129 s |
| 059 Zariskis multiplicitet | rang och explicit relation | fullständig | PASS | 22 s |
| 371 Schrödinger-blowup | exakt kontrollprogram plus jämförelse | fullständig | PASS, alla bevarade fält lika, 4 filidentiteter OK | under 1 s |
| 266 Ömsesidigt opartiska baser, d = 6 | Fourier-certifikat | fullständig | PASS, tre rader lika med appendix A | 170 s |
| 266 | sparad numerisk körning | konsistenskontroll | PASS (C++-programmen kördes inte) | 12 s |
| 268 Haldane-gapet | randfältsartikeln | skalär, test- och termisk kontroll | PASS | 16 s |
| 210 Foulkes, sjätte potensen | `--check` | endast indata och tabeller | PASS (C++-beräkningen kördes inte) | 1 s |
| 107 Matrismultiplikation | indata plus rektangulära kontroller | delvis | PASS (den fullständiga C++-omkörningen av kvadratcertifikatet kördes inte) | 3 s |
| 087 Mahler-förmodan | `reproduce.py` | som dokumenterat | **FAIL:** `verification/SOURCE-MANIFEST.json` saknas i samlingen | 4 s |
| 087 | samma tio program, manifestet ersatt med aktuella hashar | fullständig | PASS för alla tio program; att programmen är de fästa versionerna kunde inte kontrolleras | 13 s |

Paketen i familjerna 090, 119, 205 och 229, den periodiska Haldane-artikeln och familj 367 kördes inte. De kräver python-flint, Boost eller en lång C++-körning.

**Vad omkörningen visar:** den ändliga aritmetiken i paketen går att återskapa på en annan maskin, och den ger samma utdata som samlingen har sparat. Paketen säger själva att de inte kontrollerar de analytiska stegen som kopplar beräkningen till satsen. En PASS här betyder alltså att beräkningsdelen håller, inte att satsen är bevisad.

**Fynd att rapportera:** familj 087 kan inte verifieras med den dokumenterade instruktionen, eftersom manifestfilen som fäster programmens källkod saknas. Det kan rapporteras till samlingens förvaltare. Rapporten här har inte skickat något till dem.

## 4. Störst potential för ytterligare framsteg

### Kriterier

1. **Verifierbarhet:** Lean, körbar kod, eller båda.
2. **Räckvidd:** hur många andra problem eller fält resultatet eller metoden påverkar.
3. **Fortsättning:** om det finns konkreta öppna följdfrågor som går att angripa.
4. **Labbets möjlighet:** om labbet kan pröva något själv med fria verktyg.

### Artiklar och familjer

| Rang | Familj | Varför | Status |
|---|---|---|---|
| 1 | **107 Matrismultiplikation, ω ≤ 9/4** | ω styr komplexiteten för en stor del av linjär algebra, grafalgoritmer och dynamisk programmering. Metoden (tensorkonstruktioner med numeriska certifikat) kan ge fler gränser, till exempel för rektangulär multiplikation och över ändliga kroppar. Konstanterna gör den opraktisk, men den teoretiska räckvidden är störst i samlingen. | Lean: huvudresultatet. Kod: delvis omkörd (PASS). |
| 2 | **113, 115, 131, 139 Sampling och räkning** | Effektiv räkning av perfekta matchningar och exakt eller nästan likformig sampling av kontingenstabeller med givna marginaler. Snabb blandning för grafbyten, alltså nollmodeller för nätverk med givna grader. Få frågeanrop för log-konkav sampling. Allt det här används direkt i statistik: exakta test i tabeller, nätverksanalys och MCMC. Det ligger nära labbets PyMC- och DoWhy-arbete. | Lean: 113 och 139 huvudresultat; 115 och 131 Lean-dokumentation. |
| 3 | **378 ETH är falsk** | Om algoritmen håller ritar den om kartan för finkornig komplexitet, och många villkorliga undre gränser faller. En oberoende grupp (Impagliazzo, Paturi, Williams) granskar beviset. | Lean: huvudresultatet. |
| 4 | **102, 105, 106 Unique Games och approximationströsklar** | Om de stämmer avgör de optimala approximationsgränser för Max-Cut, Vertex Cover och många andra problem. Mycket följdforskning bygger på dessa förmodanden. | Lean: huvudresultaten. |
| 5 | **148 och 153 Bernoulli-faltningar och självlika mått** | Dimensionsformeln gäller utan separationsvillkor, och 153 ger en aritmetisk klassificering. Kvantiteterna är beräkningsbara, så labbet kan pröva dem direkt (E1). | 148 Lean: huvudresultat. 153 omkört (PASS). |
| 6 | **268 Haldane-gapet för spinn-1-kedjan** | Ett datorstött bevis för ett spektralgap i en kvantspinnkedja. Metoden, med ändliga beräkningar plus exakta rationella gränser, kan överföras till andra kedjor som spinn-2 och bilinjär–bikvadratisk modell. | Kod: randfältsartikeln omkörd (PASS). |
| 7 | **229 Rekonstruktionströsklar på träd** | Exakta trösklar för tre- och fyrtillstånds Potts-kanaler, med följder för gemenskapsdetektion i stokastiska blockmodeller. Fallen q ≥ 5 är öppna följdfrågor. | Lean-dokumentation. Kod kräver Boost. |
| 8 | **266 Exakt tre ömsesidigt opartiska baser i dimension 6** | Ett certifierat datorbevis i kvantinformation. Frågan för dimension 10 och 12 är öppen, och metoden kan prövas där. | Lean-dokumentation. Kod: två paket omkörda (PASS). |
| 9 | **090 Det triangulära gittrets universella optimalitet** | Fourier- och LP-certifikat i samma tradition som Cohn–Kumar–Viazovska. Fler potentialer och dimensioner är naturliga fortsättningar. | Lean-dokumentation. Kod kräver python-flint. |
| 10 | **003 Kvasi-Riemann-hypotesen (Re s > 7/8)** | Ett nollfritt halvplan för alla Dirichlet-L-funktioner skulle påverka nästan all analytisk talteori. | Lean: huvudresultatet. |

Utanför topplistan finns flera explicita konstruktioner som går att kontrollera med dator, och som labbet kan pröva oberoende:

- 156: Borsuk falsk i dimension 9;
- 158: planet går inte att färga med fem färger;
- 161: motexempel till Sidorenko med 35 hörn och 66 kanter;
- 076: ultraplatta Littlewood-polynom.

### Kod och verktyg

| Rang | Verktyg | Varför det går att återanvända |
|---|---|---|
| 1 | **Lean-biblioteket och Comparator-utmaningarna** (`lean/`, 418 utmaningar) | Det oberoende sättet att kontrollera ett påstående: Comparator jämför en formell sats med beviset. Det gör det möjligt att skilja formaliserade resultat från resten. Det kräver Lean 4.34.1, Mathlib-cache och mycket minne. |
| 2 | **Certifikat plus kontrollprogram i exakt aritmetik** (101, 153, 352, 348, 361, 371) | Kontrollprogram som bara använder Pythons standardbibliotek och bråktal: inga beroenden, deterministiska och snabba. Samma mönster passar Oraklets experiment: spara certifikatet och kontrollera det med ett litet oberoende program. |
| 3 | **Två oberoende implementationer** (189 Ramsey, 187 Snaky) | Samma ändliga beräkning skriven två gånger, med jämförelse av utdata byte för byte. Det är en mall för hur labbet kan granska sina egna sökningar. |
| 4 | **Certifikatmaskineriet för matrismultiplikation** (107; Python plus C++ med GMP) | Exakt kontroll av tensoridentiteter och gränser. Det kan återanvändas för att kontrollera nya algoritmer för multiplikation av små matriser. |
| 5 | **Spektralgapskedjan** (268; NumPy, SciPy och exakta rationella tal) | Ändliga exakta beräkningar plus intervallgränser för kvantspinnkedjor. |
| 6 | **Certifierad gren-och-gräns i binary64** (266) och **Arb-certifikat** (090, python-flint) | Rigorös numerik för problem där exakt aritmetik är för dyr. |

## 5. Förslag på nya experiment

Experimenten är utformade för labbet: små, deterministiska, med en förutsägelse registrerad i förväg och ett kontrollprogram. Inget av dem kräver betalda modeller.

### E1. Dimensionen för Bernoulli-faltningar med Salem-parametrar (familj 148 och 153)

- **Idé:** beräkna h/χ (entropitakt delad med Lyapunov-exponent) exakt för algebraiska parametrar. Enligt formeln är dimensionen min(1, h/χ).
- **Kalibrering:** för det gyllene snittet ger [garsia_entropy.py](garsia_entropy.py) h/χ = **0,995713**. Det kända värdet (Alexander–Zagier) är 0,99571…, så alla sex decimaler stämmer från n ≈ 20.
- **Nytt fall:** λ = 1/τ, där τ ≈ 1,72208 är det minsta kvartiska Salem-talet (x⁴ − x³ − x² − x + 1). Familj 153 påstår att faltningen är singulär här. Piloten ger h/χ ≈ 1,124 vid n = 15, 1,103 vid n = 20 och 1,091 vid n = 24. Kvoten sjunker långsamt och har inte konvergerat.
- **Förutsägelse (registrerad här):** gränsvärdet av h/χ är större än 1. Dimensionen är då 1, trots att måttet är singulärt.
- **Kontroll:** exakt räkning i ℤ[λ]. Entropin är subadditiv, så h = inf H_n/n och varje H_n/n är en övre gräns för h. Förutsägelsen förkastas alltså om H_n/(nχ) < 1 för något n. Att bekräfta den kräver i stället en undre gräns för h, som uppräkningen inte ger; det är experimentets svåra del. Större n kräver en kompilerad implementation.

### E2. Rekonstruktionströsklar för Potts-modellen med q ≥ 5 (familj 229)

- **Idé:** populationsdynamik med NumPy för trosfortplantning på d-reguljära träd. Uppskatta den verkliga rekonstruktionströskeln och jämför med Kesten–Stigum-gränsen dλ² = 1.
- **Kalibrering:** q = 3 och q = 4, där familj 229 påstår att tröskeln är exakt dλ² = 1.
- **Förutsägelse:** för q ≥ 5 och små d ligger tröskeln strikt under Kesten–Stigum. Det är känt för stora d (Sly 2009).

### E3. Spektralgap för spinnkedjor med exakt diagonalisering (familj 268)

- **Idé:** exakt diagonalisering med glesa matriser (SciPy) på ringar med L = 6–14 platser.
- **Kalibrering:** spinn-1 Heisenberg, där Haldane-gapet numeriskt är 0,4105 och familj 268 påstår sig bevisa att det är positivt.
- **Nytt fall:** den bilinjär–bikvadratiska kedjan längs vinkeln θ, med AKLT-punkten som andra kalibrering. Förutsägelsen registreras per θ före körningen.
- **Förbehåll:** numeriska uppskattningar, inte bevis.

### E4. Matrismultiplikation i litet format (familj 107)

- **Idé:** ett exakt kontrollprogram för Brent-ekvationerna i Python. Det återger Strassen (rang 7 för 2×2) och Laderman (rang 23 för 3×3). Sedan görs en sökning med flip-grafmetoden över GF(2) för format som ⟨2,2,3⟩ och ⟨3,3,4⟩.
- **Förutsägelse:** sökningen når de kända bästa rangerna men inte lägre. En lägre rang vore ett nytt resultat och kontrolleras exakt.

### E5. Opartiska baser i dimension 10 (familj 266)

- **Idé:** numerisk sökning efter fyra ömsesidigt opartiska baser i dimension 6 (kalibrering: ska misslyckas enligt satsen) och i dimension 10 (öppet).
- **Förutsägelse:** sökningen misslyckas i båda. Ett lyckat utfall i dimension 10 kontrolleras med exakt aritmetik.

### E6. Ett register över omkörningar

- **Idé:** kör kontrollerna i avsnitt 3 automatiskt varje vecka och för in utfallen i labbets rapporter. Upptäck om paket slutar fungera, som 087 gör i dag, och om sparade utdata ändras.
- **Kostnad:** cirka 15 minuter CPU, utan nätverk under körningen.

### E7. Oberoende kontroll av utvalda Lean-utmaningar

- **Idé:** bygg Comparator och kontrollera några få utmaningar oberoende, till exempel 156 (Borsuk) och 158 (planet), som är små kombinatoriska påståenden.
- **Kostnad:** stor: Lean-verktygskedjan och Mathlib-cachen kräver flera GB och lång byggtid. Lämplig som ett separat projekt.

## 6. Att tillämpa verktygen på nya problem

- **Exakt aritmetik** (familj 148, 153): `garsia_entropy.py` fungerar för varje Bernoulli-faltning med en algebraisk heltalsparameter. Det räcker att lägga till minimalpolynomet i `CASES`.
- **Kontrollprogrammen för Ramsey och Snaky** (189, 187) är specialskrivna för sina satser och kan inte direkt användas på andra parametrar. Det som går att återanvända är arbetssättet med två oberoende program och jämförelse av utdata.
- **Spektralgapskedjan och de certifierade sökningarna** (268, 266) kan anpassas till andra kedjor och dimensioner, men koden är skriven för sina specifika fall. Experimenten E3 och E5 börjar därför med egna, enklare implementationer, kalibrerade mot de kända fallen.
- **Lean-biblioteket** innehåller mycket allmän matematik som andra formaliseringar kan använda. Det är det mest återanvändbara verktyget, men också det tyngsta.

## 7. Förbehåll

- **Påståenden, inte resultat.** Resultaten är påståenden från en ej släppt modell. De flesta är inte granskade av andra matematiker, och OpenAI skriver själva att ej formaliserade resultat kan ha fel.
- **Lean-täckning.** Ungefär 42 % av huvudresultaten (300 av 719) är formaliserade enligt samlingen. Lean-dokumentationen beskriver ibland bara en del av ett resultat.
- **Omkörningens räckvidd.** Omkörningen visar att beräkningarna går att återskapa, inte att satserna är bevisade.
- **Beräkningsbarhet styr rangordningen.** Rangordningen i avsnitt 4 bygger på sammanfattningar, verifieringsstatus och räckvidd. Den väger beräkningsbara resultat högre, eftersom labbet kan pröva dem.

## Nästa steg

1. **Oraklet läser katalogen.** Oraklets litteraturdag kan få [katalog.json](katalog.json) som ytterligare källa, så att han läser de 373 sammanfattningarna och skriver sina egna fynd och hypoteser i ai-bus.
2. **Experimenten i Problem Bank.** E1–E3 kan läggas in i Problem Bank som förslag med de förutsägelser som registrerats här, så att labbet kör dem och rapporterar utfallet.
3. **Omkörningsregistret.** E6 kan byggas som ett eget arbetsflöde.
