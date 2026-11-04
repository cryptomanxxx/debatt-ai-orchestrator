# Oraklets beräkningsexperiment från openai/math

Arbetsflödet **Oraklets beräkningsexperiment (openai/math)** (`.github/workflows/oraklet-openai-math-experiments.yml`) kör experimenten E1–E4 och omkörningen E6 från [RAPPORT.md](RAPPORT.md) varje måndag kl. 05:23 UTC, och kan också startas för hand. Det gör inga modellanrop.

Varje körning består av två delar:

- **Kalibreringar:** fall med kända svar, som visar att beräkningen fungerar.
- **Ett nytt fall per experiment:** fallet väljs ur en fast lista efter veckonumret.

Förutsägelserna för de nya fallen står i [experiments.py](experiments.py) (`e1_prediction` till `e4_prediction`) och registrerades innan något nytt fall kördes. Testerna kör bara kalibreringar.

Utfallet hamnar i `ai-bus/berakningar/ÅÅÅÅ-MM-DD.md`, med ett register i `ai-bus/berakningar/README.md`, och i körningens artefakt (`reports/openai-math-experiments/result.json`). Ett nytt fall bedöms bara när dess experiments kalibrering är godkänd. En misslyckad kalibrering markerar körningen som misslyckad efter att rapporten har sparats.

## E1. Bernoulli-faltningar (familj 148 och 153)

Experimentet räknar exakt upp alla summor Σ ±λᵏ i ℤ[λ], för algebraiska heltal λ i (0, 1), och mäter entropin H_n. Det ger två tal:

- **Rigorös övre gräns:** min H_n/(nχ), där χ = log(1/λ). Gränsen gäller eftersom entropin är subadditiv.
- **Numerisk skattning:** (H_n − H_(n−1))/χ.

| | Fall | Förutsägelse |
|---|---|---|
| Kalibrering | 1/φ, det gyllene snittet: skattningen ska ligga inom 10⁻⁵ från 0,995713 | — |
| Nya fall, i tur och ordning | kvartiskt Salem-tal 1,72208; tribonacci (Pisot); plastiska talet (Pisot); kvartiskt Salem-tal 1,88320; Lehmers tal (Salem) | h/χ < 1, dimension strikt under 1. För Pisot-parametrarna är det redan känt (Garsia). |

**Beslutsregel:**

- **"under 1 (rigoröst)"** om den övre gränsen är under 1.
- **"under 1 (numeriskt)"** om skattningen är under 0,999 och ändrades mindre än 10⁻⁴ i sista steget.
- **"oavgjort"** annars.

Breuillard–Varjús olikhet h ≤ log M(λ) = χ för Salem-parametrarna betyder att h/χ aldrig överstiger 1. Skattningar över 1 visar bara att n är för litet.

## E2. Rekonstruktionströsklar för Potts-kanalen (familj 229)

Experimentet beräknar populationsdynamik för trosfortplantning på ett träd där varje nod har d barn, med q-tillstånds Potts-kanalen M = λI + (1 − λ)/q. Starten är full information i löven.

- **Parametrar:** 20 000 meddelanden, 80 och 160 nivåer, med frö efter veckan.
- **Rekonstruktion (regel 2, från 2026-11-09):** gäller om medelöverlappet efter 160 nivåer är över 0,01 och minst 0,8 gånger överlappet efter 80 nivåer, alltså om det har stabiliserats på ett positivt värde i stället för att avta. Regeln sattes på Ising-kalibreringarna, utan att något nytt fall kördes.
- **Tröskeln λ\*:** bestäms med nio halveringar, vilket ger upplösningen 1/512.

| | Fall | Förutsägelse |
|---|---|---|
| Kalibreringar | Ising, q = 2, med d = 2 och d = 3: där är tröskeln exakt Kesten–Stigum, λ_KS = 1/√d | — |
| Nya fall | (q, d) = (3,2), (4,2), (5,2), (5,3), (6,2), (7,2), (8,2), (5,4), (6,3), (8,3) | q ≤ 4: lika med Kesten–Stigum (familj 229 påstår det för q = 3 och 4). q ≥ 5: under Kesten–Stigum. |

**Beslutsregel:**

- **"lika med Kesten–Stigum"** om |λ\*/λ_KS − 1| ≤ 0,03.
- **"under Kesten–Stigum"** om kvoten är under 0,97.
- **"metodfel"** om kvoten är över 1,03. Ovanför Kesten–Stigum går rekonstruktion alltid att göra, så den sanna tröskeln kan inte ligga där. Ett sådant utfall bedöms inte.

## E3. Spektralgap för spinn-1-ringar (familj 268)

Experimentet diagonaliserar exakt den bilinjär–bikvadratiska kedjan H = Σ cos θ (S·S) + sin θ (S·S)² på ringar med L = 6, 8, 10 och 12 platser, i sektorn Sz = 0. För θ ≥ π/4 används i stället L = 6, 9 och 12. Där har kedjan mjuka moder med period 3, så bara längder delbara med 3 går att jämföra (från 2026-11-09).

| | Fall | Förutsägelse |
|---|---|---|
| Kalibreringar | Heisenberg (θ = 0, gap), Takhtajan–Babujian (θ = −π/4, gaplös) och Uimin–Lai–Sutherland (θ = π/4, gaplös, med L = 6, 9, 12) | — |
| Nya fall | θ/π = AKLT-punkten (arctan(1/3)/π), 0,05; 0,15; 0,2; −0,1; −0,2; 0,3; 0,4 | gap för −π/4 < θ < π/4 (Haldane-fasen), gaplös-lik för θ ≥ π/4 |

**Beslutsregel:** den sattes på kalibreringarna innan något nytt fall kördes.

- **"gap"** om L·Δ växer med mer än 5 % i vart och ett av de sista stegen (två steg med L = 6–12, ett med L = 6, 9, 12), och Δ(12) > 0,05.
- **"gaplös-lik"** om L·Δ ändras mindre än 5 % i varje sådant steg.
- **"oavgjort"** annars.

## E4. Matrismultiplikation i litet format (familj 107)

Experimentet söker scheman för att multiplicera en n×m-matris med en m×p-matris över GF(2), med Kauers–Moosbauers flip-grafvandring i [matmul_flip.py](matmul_flip.py).

- **Start och sökning:** sökningen börjar i standardalgoritmen, med rang n·m·p. Den gör sedan slumpvisa byten, tar bort nolltermer, slår ihop termer som delar två faktorer och tar ett "plussteg" för att lämna en platå.
- **Kontroll:** varje schema kontrolleras exakt mot matrismultiplikationstensorn över GF(2), genom att varje indextrippel räknas modulo 2.
- **Körning:** tre frön per fall, med 6 miljoner steg var.

| | Fall | Förutsägelse |
|---|---|---|
| Kalibreringar | ⟨2,2,2⟩ ska nå rang 7 (Strassen) och ⟨2,2,3⟩ rang 11, båda kända optimum | — |
| Nya fall, med referensrang | ⟨2,2,4⟩ 14, ⟨2,3,3⟩ 15, ⟨2,2,5⟩ 18, ⟨2,3,4⟩ 20, ⟨3,3,3⟩ 23, ⟨2,3,5⟩ 25, ⟨2,4,4⟩ 26, ⟨3,3,4⟩ 29, ⟨3,3,5⟩ 36 | inte under referensrangen. Referensrangerna är de bästa kända över GF(2) enligt litteraturen (Kauers–Moosbauer, Fawzi m.fl.). |

**Beslutsregel:**

- Den lägsta exakt kontrollerade rangen jämförs med referensen: under, lika eller över.
- **Ett utfall under referensen** är ett schema som klarar den exakta kontrollen. Det ska jämföras med litteraturen innan något påstås. Det bästa schemat sparas i artefakten.

## E6. Omkörning av openai/math:s egna kontroller

[replication.py](replication.py) kör varje vecka om 18 av de verifieringspaket som rapporten körde om, på den senaste versionen av openai/math. Det hämtar bara paketens kataloger, med en gles klon på cirka 240 MB. Varje paket körs med sitt dokumenterade kommando och bedöms efter sin egen text för godkänt.

**Status per paket:**

- **godkänd** eller **misslyckades**;
- **tidsgränsen överskreds**, efter 15 minuter;
- **paketet saknas**, om katalogen inte längre finns;
- för det kända felet i Mahler-paketet (087), där `SOURCE-MANIFEST.json` saknas: **känt fel kvarstår** eller **känt fel åtgärdat**.

Ett misslyckat paket markerar inte körningen som misslyckad, eftersom felet ligger i samlingen och inte i labbet. Det syns däremot i rapporten, med de sista raderna av paketets utdata i artefakten.

## Rättelser

- **2026-11-04, E2, q = 5 och d = 3:** regel 1 gav tröskeln 1,118 gånger Kesten–Stigum. Det är omöjligt, eftersom rekonstruktion alltid går att göra ovanför gränsen. Regeln, ett överlapp över 0,05 efter 80 nivåer, missade rekonstruktion strax över gränsen, där det stabiliserade överlappet är litet för q = 5. Bedömningen "stämmer inte" var därför ogiltig, och fallet räknas inte. Regel 2 och metodfelsutfallet gäller från och med 2026-11-09.
- **2026-11-04, E3, θ = 0,4π:** storleksserien 6, 8, 10, 12 gav gapen 0,43, 0,14, 0,05 och 0,21. Den blandar ringlängder som är delbara med 3 med sådana som inte är det, och utfallet blev oavgjort. Från och med 2026-11-09 används L = 6, 9, 12 för θ ≥ π/4.

## Förbehåll

- **E4:s scheman** är exakt kontrollerade, men bara över GF(2). Att sökningen inte hittar ett schema säger inget om att det inte finns.
- **E6** visar att samlingens ändliga beräkningar går att återskapa, inte att satserna är bevisade.
- **E2 och E3** ger numeriska uppskattningar med ändlig population, ändligt djup och ändlig storlek.
- **E1:s övre gräns** är rigorös, men den räcker i praktiken bara till att avgöra fall långt under 1. Skattningen är inte rigorös.
- **Inget experiment** verifierar en sats i openai/math. De prövar förutsägelser i närliggande, beräkningsbara frågor.
