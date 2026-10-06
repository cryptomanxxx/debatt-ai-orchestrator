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

Hypotes, beslutströskel, modellklass och tränings-/kontrolldelning finns i
`research/science.mjs`. De inkluderas i datans SHA-256 innan modellförslagen.
Ett resultat har två skilda betydelser: modellens förslag kan vara rätt eller
fel; verktygens evidens kan stödja H0, stödja H1 eller vara otillräcklig.
Rapporterna blandar inte ihop dessa. En korrekt beräkning kan fortfarande
bygga på fel antaganden eller besvara en ointressant fråga.

Dessa sju katalogexperiment använder syntetiska data. De verifierar verktyg och
forskningsmetoder. De etablerar inte ett nytt fynd från verkliga observationer.

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

## Ytterligare verktyg att undersöka

| Kandidat | Potential | Status hos oss |
| --- | --- | --- |
| [PyMC](https://www.pymc.io/welcome.html) | Bayesianska modeller, parameterosäkerhet och posteriora prediktiva kontroller | Saknar integration |
| [DoWhy](https://www.pywhy.org/dowhy/v0.14/) | Kausal inferens med uttryckliga antaganden och refutationskontroller | Saknar integration |
| [SymPy](https://www.sympy.org/en/index.html) | Symboliska ekvationer och kontroll av matematiska identiteter | Saknar integration |

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
