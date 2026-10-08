# Från metodtester till automatiserad vetenskaplig forskning

[Det första avgränsade hypotesförsöket med verkliga makrodata](HYPOTHESIS-PILOT.md)
låter Oraklet välja en variabel och formulera frågan före verktygsanalysen.

BootLoops kan beräkna konsekvenser av vissa vetenskapliga modeller och kontrollera
matematiska samband. Det behöver en specificerad fråga och data; ett biblioteks
installation innebär inte att fria vetenskapliga påståenden kan testas direkt.

## Körbara första protokoll

| Experiment | Hypotes och beslut | Oberoende kontroll |
| --- | --- | --- |
| annihilator-recurrence | En konstant rekursion av ordning högst två förklarar serien; håll sex termer utanför passningen | Två primtal, exakt rekonstruktion, BigInt-residualer och ändrad kontrollsvans |
| mixalot-model-comparison | H0: känd kategorisk signatur; H1: blandning av två fasta signaturer med uniform viktprior; BF10 10 respektive 1/10 | Två uppströmsimplementationer plus separat exakt polynomintegration; låst kontroll [0,24] eller [12,12] måste ge ett annat beslut |
| statsmodels-ar1 | H0: ingen lagg-1-koefficient; förutbestämd AR(1), alpha 0.05 och Holm över tre fall | SciPy-regression, separat JS-regression/t-fördelning, analytisk nollkontroll och holdoutprognos |
| sympy-quadratic | Exakt komplett mängd distinkta reella rötter till en andragradsekvation; rationella rötter eller inga reella rötter | SymPy solveset, oberoende BigInt-diskriminant och rationell insättning; förvanskad rotmängd måste avvisas |
| sklearn-polynomial | Modellens gradförslag jämförs med valideringsval mellan två fasta OLS-modeller; testdelen används inte för val | Exakt rationell OLS, alla prediktioner/MSE, kontrasterande kontroll och strikt separata datadelar |
| dowhy-backdoor | Justerad effekt av do(t=1)-do(t=0) under fast observerad-confounder-DAG och linjär modell | Exakta rationella kovarianser, kända effekter och nollkontroller; ojusterad bias och kontrasterande data |
| glucose-absorption | Ändrad absorption i en dimensionslös modell; adaptiv fördel kräver lägre MSE vid både 30 och 60 minuter | RK4/midpoint, steghalvering, identisk oförändrad kontroll och kausala prognosursprung |
| glucose-robustness | Kvarstår adaptiv fördel vid fasta ±30% fel i måltid och antagen känslighet? Alla åtta felaktiga kombinationer klassas per absorptionstakt | RK4/midpoint/steghalvering för varje kombination; separat korrekt kontroll som exakt matchar gridens kontroll; oförändrat facit |
| glucose-temperature-evidence (manuell) | Publicerade temperaturkontraster; två antagna kurvor och deskriptiv överföring mellan studier; lokal hud och omgivning hålls isär | Låst källsammanfattning med SHA-256, alternativa aritmetiska uttryck och syntetiska nollkontroller; ingen ny klinisk inferens |
| insulin-warming-forecast (manuell) | Gruppkurvor för aspart: separata tidsparametrar mot gemensam kurva, 30–60-minutersholdout; höjd- och persistensreferenser | Låst figuravläsning, alternativa residualberäkningar, identiska-armkontroll och fem avläsningsmönster; ingen patient- eller absorptionsidentifiering |
| pymc-gdp-ar1 (endast manuellt) | Positiv/negativ lagg-1-koefficient endast om lika-svansat 95% posteriorintervall utesluter noll; låsta priorer | Fyra MCMC-kedjor, diagnostik, logdensitetskontroller, analytisk posterior i Python/JS och centrerad nollkontroll |

Hypotes, beslutströskel, modellklass och tränings-/kontrolldelning finns i
`research/science.mjs`, `research/sympy.mjs`, `research/pymc.mjs`, `research/sklearn.mjs` och `research/dowhy.mjs`. Se även
[SymPy-protokollet](SYMPY.md), [PyMC-protokollet](PYMC.md) och
[Scikit-learn-protokollet](SKLEARN.md) samt [DoWhy-protokollet](DOWHY.md). De inkluderas i datans SHA-256 innan modellförslagen.
Ett resultat har två skilda betydelser: modellens förslag kan vara rätt eller
fel; verktygen redovisar den verifierade lösningen eller inferensen enligt
respektive protokoll. SymPy ger en exakt rotmängd; statistiska resultat är
villkorliga på modellens antaganden och kan vara otillräckliga.
Rapporterna blandar inte ihop dessa. En korrekt beräkning kan fortfarande
bygga på fel antaganden eller besvara en ointressant fråga.

Katalogen har fjorton körbara experiment: tolv syntetiska metodtester, inklusive
SymPy, Scikit-learn, DoWhy och de två [glukosprotokollen](GLUCOSE-ROBUSTNESS.md), en manuell [temperaturåteranalys](GLUCOSE-TEMPERATURE.md) och en manuell PyMC-uppföljning med historiska BNP-data. Metodtesterna
verifierar verktyg och forskningsmetoder; de etablerar inte ett nytt fynd från
verkliga observationer. PyMC-uppföljningen återanvänder hypotespilotens data
och är explorativ, inte en oberoende replikation. Den väljs inte av `auto`.

## Nästa steg för en verklig forskningsfråga

1. Definiera hypotes, mätbara variabler, alternativ och varför frågan är relevant.
2. Välj en verklig datakälla med dokumenterad proveniens, licens, tidsperiod,
   urval och bortfall. Lås datasetversion och dela utvecklings-/kontrolldata.
3. Registrera analys, antaganden, effektmått, osäkerhet och beslutskriterier före
   slutanalysen. Registrera också negativa och misslyckade försök.
4. Kör analysen, replikera genom en oberoende väg och pröva alternativa
   antaganden. Upprepade sökningar måste ingå i analysens selektionshistorik.
5. Redovisa observation, beräkning, tolkning och begränsningar separat. Kontrollera
   litteraturen innan ett resultat kallas nytt. Granska slutsatsen före publicering.

Orchestratorn har nu byggstenar för steg 3–4 och reproducerbara rapporter. Den har
ännu ingen generell automatisk datainsamling, fri experimentkompilator eller
vetenskaplig publiceringsagent. Det är separata integrationer.

## Externa verktyg: integration och vidare utveckling

| Verktyg | Potential | Status hos oss |
| --- | --- | --- |
| [PyMC](https://www.pymc.io/) | Bayesianska modeller, parameterosäkerhet och posteriora prediktiva kontroller | Verifierad delintegration: fast bayesiansk AR(1) för manuell BNP-uppföljning; generella modeller och posteriorprediktiva kontroller återstår |
| [DoWhy](https://www.pywhy.org/dowhy/v0.14/) | Kausal inferens med uttryckliga antaganden och refutationskontroller | Verifierad delintegration i isolerad miljö: fast backdoor-diagram, justerad linjär effekt och rationell kontroll; generella diagram och refutationskedja återstår |
| [Scikit-learn](https://scikit-learn.org/stable/) | Regression, klassificering och modellval | Verifierad delintegration: linjär/kvadratisk OLS, separat validering/test och rationell kontroll; generella modeller återstår |
| [SymPy](https://www.sympy.org/en/index.html) | Symboliska ekvationer och kontroll av matematiska identiteter | Verifierad delintegration: sympy-quadratic, avgränsade exakta andragradsekvationer; generell symbolisk analys återstår |

SciPy är installerat som låst beroende och används redan som kontrollväg för
Statsmodels. Det är ännu inte ett generellt modellstyrt verktyg i katalogen.

## BootLoops-exemplet

Matthew Schwartz beskriver 36 manuskript inom 18 fält med 19 medförfattare under
tre månader. Artikeln beskriver samtidigt expertstyrning, manuella kontroller,
separata granskningssessioner och återkommande modellfel. Det är en redogörelse
för hans projekt, inte ett testresultat för vår orchestrator eller ett påstående
att alla manuskript är oberoende validerade eller accepterade för publicering.

Källa: [Claude-shaped science, Anthropic, 1 oktober 2026](https://www.anthropic.com/research/claude-shaped-science).
BootLoops ägs och underhålls enligt artikelns disclosure av Schwartz; det är
inte ett Anthropic-projekt. Vi använder hans öppna verktyg med vår egen modell
och forskningsmotor.
