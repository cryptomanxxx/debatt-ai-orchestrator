# Kanalvågor: diskret fysikinformerat nätverk och adaptivt UKF

## Frågan och avgränsningen

Förbättrar ett fysikinformerat neuralt övergångsnätverk med adaptivt UKF tillståndsskattning och korta prognoser för släta kanalvågor när bara vattennivån mäts och mätbruset förändras?

Detta är en syntetisk CPU-pilot. Den prövar en reducerad linjär modell av ekvationerna för **grunt vatten**, inte grundvatten, full fluiddynamik eller turbulens. Den kan visa om extra beräkningssteg hjälper under det låsta protokollet, men inte att metoden fungerar i en verklig kanal. Parametrar och beslutskriterium fastställs före Oraklets förslag och sparas i `shallow-water-config.json`. Vi har sett pilotens lokala resultat vid utveckling; detta är inte en prospektivt förregistrerad studie eller blind oberoende validering.

Inspiration: [de Curtò och de Zarzà, Hybrid State Estimation (2024), DOI 10.3390/electronics13112208](https://doi.org/10.3390/electronics13112208). Vi använder idén neuralt fysikinformerat övergångssteg plus adaptivt UKF. Vår diskreta fysikförlust, lilla nätverksarkitektur och anpassning av endast mätkovariansen är egna val. Vi reproducerar inte deras nätverksarkitektur, MC-dropout, parameteraugmentation eller rapporterade resultat. [Clawpacks öppna ekvationsbeskrivning](https://www.clawpack.org/riemann_book/html/Shallow_water.html) ger bakgrund till vattenekvationerna. Ingen uppströmskod eller externa mätdata kopieras.

## Vattenekvationerna

För en periodisk platt kanal med konstant basdjup H och medelström U, små nivåavvikelser η och hastighetsavvikelser v:

\[
\eta_t+U\eta_x+H v_x=0,\qquad
v_t+U v_x+g\eta_x=-r v.
\]

Detta är linjäriseringen av mass- och momentumekvationerna runt det konstanta grundtillståndet, med ett antaget linjärt motstånd på hastighetsavvikelsen. H=2 m, U=0.3 m/s, L=200 m, g=9.81 m/s², r=0.003 s⁻¹. Periodiska randvillkor motsvarar en återkommande vågkanal; ingen inflödeshydrograf, flodutlopp, topografi, regn, torkning eller turbulent ström ingår. Djupmedelvärdet är fixerat, så total massa bevaras av konstruktionen.

En Fourier-mod, k=2π/L, ger fyra tillstånd:

\[
\eta=H(q_1\cos kx+q_2\sin kx),\qquad
v=c(q_3\cos kx+q_4\sin kx),\quad c=\sqrt{gH}.
\]

\[
\dot q=Aq,\quad A=\begin{pmatrix}
0&-kU&0&-kc\\ kU&0&kc&0\\0&-kc&-r&-kU\\kc&0&kU&-r
\end{pmatrix}.
\]

Två höjdsensorer vid x=0 och x=L/4 mäter q₁ och q₂ med oberoende normalfördelat brus. Det motsvarar nivåmätning efter subtraktion av H och division med H. Hastighet mäts inte; den skattas genom dynamiken. Tidssteg 2 s, totalt 160 s.

## Fyra jämförelser

| Metod | Övergång | Mätkovarians |
| --- | --- | --- |
| physics-fixed | Explicit midpoint, I+dt A+dt² A²/2 | Fast R |
| physics-adaptive | Samma fysiksteg | Adaptivt R |
| pinn-fixed | Tränat diskret fysikinformerat nätverk | Fast R |
| pinn-adaptive | Samma tränade nätverk | Adaptivt R |

Alla använder samma observationer, blind start q=0, samma initiala P, fast Q och UKF-parametrar. Den klassiska modellen känner samma fysik som nätverket. Ingen fördel byggs in genom en avsiktligt felaktig fysikmodell. Explicit midpoint är en grov numerisk referens, inte bästa möjliga solver; bättre klassisk integration kan ändra jämförelsen. I denna linjära gräns behövs egentligen inte UKF, men piloten verifierar den verkliga sigma-punktsimplementationen inför senare olinjära experiment.

Facit skapas via den analytiska linjära lösningen exp(A dt), beräknad med egenvärdesuppdelning. Fin RK4 och steghalvering kontrollerar denna lösning. Fysikfiltret använder midpoint, inte facitsteget. Nätverkets offline-par använder RK4 med åtta delsteg, inte testbanans mätningar. Samma kända ekvationer används av alla; ingen osäker fysik, parameteridentifiering eller PDE-nätkonvergens studeras här.

## Ett faktiskt tränat nätverk

NumPy implementerar ett 4–16–4 tanh-nätverk med analytisk backpropagation och Adam. Övergången är Fθ(q)=q+0.3 s MLPθ(q/s), s=0.05. Normaliserade tillstånd z=q/s tränas på 256 slumpade offline-tillstånd inom [-1,1]⁴. 256 andra kollokationspunkter används för fysikförlusten. En tredje slumpström ger separat övergångsvalidering. Tränings-, kollokations- och valideringsseed är fasta och skilda från testbanans seed. Arkitektur, 2000 epoker, Adam-steghastighet 0.01 och fysikvikt 0.1 är låsta. Ingen testbaserad early stopping, omträning eller arkitektursökning sker.

\[
L=\operatorname{mean}\lVert F_\theta(z)-z_{RK4,next}\rVert^2
 +0.1\operatorname{mean}\lVert F_\theta(z)-z-dt\,A(z+F_\theta(z))/2\rVert^2.
\]

Det andra ledet är en **diskret midpoint-residual** av de reducerade vattenekvationerna. Detta är ett diskret fysikinformerat neuralt flow-map-nätverk, inte en kontinuerlig PINN med derivator i rum och tid. Förkortningen `pinn` används i metodnamnen med denna uttryckliga avgränsning. Alla vikter och tränings-/valideringsförluster sparas. En finita-differens-kontroll prövar kombinationsförlustens gradient. Viktosäkerhet modelleras inte.

## UKF, adaptation och kausalitet

Fyra tillstånd ger nio sigma-punkter. α=1, β=2, κ=0. Initial P=0.0004 I; Q=1e-8 I per steg, R₀=1e-6 I i normaliserade nivåtillstånd. Prediction använder sigma-punkter genom vald övergång; measurement update använder tillgängliga sensorer. Vid bortfall görs endast prediction eller uppdatering med den återstående sensorn.

Adaptivt R använder kovariansmatchning: diag(innovation² minus förutsagd mätvarians), klippt till [1e-6, 0.000064], med EMA-takt 0.08. Aktuell innovation påverkar **nästa** stegs R. Ingen sann brusnivå, framtida innovation eller dold hastighet matas in i filtret. R är endast adaptivt mätbrus; processmodellfel och mätfel kan ändå sammanblandas. Q och fysikparametrarna skattas inte.

Efter varje prognosursprung fryses dataåtkomsten och vald modell/UKF predikterar utan observationer till +4 och +8 s. Kovaransen fortplantas med samma fasta Q. Parametrar och vikter ändras inte av prognosens facit.

## Tre testfall och ett strikt beslut

Seed ger nya initialvillkor och mätbrus via en separat NumPy-generator, utan att ändra träning eller protokoll. Välj samma seed för reproducerbara testdata. Tider kan variera med dator och last.

1. Konstant låg brusstandardavvikelse: 0.002 m i sensorerna.
2. Samma grundkonstruktion, med brusstandardavvikelse 0.008 m från t=80 s.
3. Samma brusbyte plus deterministiskt bortfall: sensor två var tredje steg, båda var femte steg.

Varje scenario har en egen seedad bana. Dessa tre banor är ingen skattning av generell framgångssannolikhet. Primär MSE beräknas separat för nivå och hastighet över 32 punkter i en vågperiod. Filtrering bedöms från t=40 s; prognoser har elva ursprung från t=40 till t=140 s med 10 s mellanrum. Prognosfelen beräknas vid exakt +4 och +8 s. Tids-/rumspunkter och överlappande prognoser är beroende.

`hybrid_improves_all` kräver att pinn-adaptive är minst 5% bättre och mer än 1e-10 absolut lägre i MSE än **var och en** av de andra tre metoderna för **båda** fälten i **alla tre** endpoint-familjerna (filter, +4, +8). Annars `mixed_or_no_improvement`. Absolutgränsen tillämpas på två olika fältenheter som en numerisk golvregel, inte ett praktiskt betydelsemått. Alla metoder och fel redovisas; ett negativt resultat avslutar inte rapporteringen.

Rapporten visar också uppmätt täckning för nominella 95%-band, NIS per observerad sensor, minsta kovariansegenvärde, djupets positivitet, sigma-punkter utanför träningsboxen samt separata tränings- och inferenstider. Banden är modellvillkorade Gaussiska approximationer, inte validerade konfidensintervall för riktiga vattendrag. Nätverksvikters osäkerhet ingår inte. Dålig täckning ska därför kunna synas.

Oraklet föreslår slutsats före beräkningen. `passed/failed` gäller **Oraklets träffsäkerhet**, inte om hybriden är bra. `executionStatus: completed/error` skiljer slutförd analys från driftfel.

## Kontroller och rapportkedja

Källkod, konfiguration och NumPy 2.3.5 är låsta. Före modellförslag binds seed, scenario och deterministisk generator till en SHA-256-commitment; detta är ett generatoråtagande, inte hash av ett redan utläst sensorarkiv. Python kontrollerar analytiskt facit mot RK4, UKF mot ett separat vanligt Kalmanfilter i den linjära gränsen och nätverksgradient mot finite differences.

JavaScript skriver om matrix exponential med reell Taylorserie, replayar filtersteg och prognoser från sparade vikter och observationer, kontrollerar adaptive-R-kausalitet och beräknar om nivå-/hastighetsfel och täckning. Denna replay verifierar numerik, inte biologisk/fysisk giltighet eller att nätverket är globalt optimalt. CI provar förvanskade vikter, prognoser, kovarianser och slutsatser, samt att framtida observationer/facit inte ändrar tidigare skattningar eller prognoser.

JSON bevarar fulla vikter, observationer, syntetiskt facit, alla filterkovarianser och prognoser. Markdown sammanfattar jämförelsen; PNG/SVG visar nivå/hastighet och adaptation. Vid avbrott sparas slutförda fall. Nätverket tränas på nytt per scenario med identiska träningsdata/vikter för enkel fristående reproduktion; jämförelsen rapporterar denna träningstid separat. Tiden på den lokala utvecklingsmiljön är inte en garanti för GitHub-hostad CPU.

## Köra

I GitHub Actions → **Oraklets forskningslabb** → **Run workflow**:

- Branch `main` efter merge.
- Experiment `shallow-water-hybrid`.
- Seed exempelvis `20261008`; samma seed reproducerar data även om datumet ändras.
- Lämna Problem Bank-ID tomt för en vanlig katalogkörning.

Experimentet är manuellt, inte del av daglig `auto`-planering. Workflow installerar låsta NumPy- och Matplotlib-beroenden och sparar grafer och rapport i Actions-artefakten. Oraklets rapport sparas också via den befintliga databaskedjan till forskningslabbet.

Utveckling: `python3 -m pip install -r research/shallow-water-requirements.lock -r research/plot-requirements.lock`, sedan `npm run test:shallow-water`. Standard `npm test` kör kontraktstester utan Python/Matplotlib, så Worker-byggen får inget nytt Pythonkrav.
