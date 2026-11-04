# Oraklets beräkningsexperiment från openai/math

Arbetsflödet **Oraklets beräkningsexperiment (openai/math)** (`.github/workflows/oraklet-openai-math-experiments.yml`) kör experimenten E1–E3 från [RAPPORT.md](RAPPORT.md) varje måndag kl. 05:23 UTC, och kan också startas för hand. Det gör inga modellanrop.

Varje körning består av två delar:

- **Kalibreringar:** fall med kända svar, som visar att beräkningen fungerar.
- **Ett nytt fall per experiment:** fallet väljs ur en fast lista efter veckonumret.

Förutsägelserna för de nya fallen står i [experiments.py](experiments.py) (`e1_prediction`, `e2_prediction`, `e3_prediction`) och registrerades innan något nytt fall kördes. Testerna kör bara kalibreringar.

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

- **Parametrar:** 20 000 meddelanden, 80 nivåer, med frö efter veckan.
- **Rekonstruktion:** gäller om medelöverlappet efter 80 nivåer överstiger 0,05.
- **Tröskeln λ\*:** bestäms med nio halveringar, vilket ger upplösningen 1/512.

| | Fall | Förutsägelse |
|---|---|---|
| Kalibrering | Ising, q = 2 och d = 2, där tröskeln är exakt Kesten–Stigum, λ_KS = 1/√d | — |
| Nya fall | (q, d) = (3,2), (4,2), (5,2), (5,3), (6,2), (7,2), (8,2), (5,4), (6,3), (8,3) | q ≤ 4: lika med Kesten–Stigum (familj 229 påstår det för q = 3 och 4). q ≥ 5: under Kesten–Stigum. |

**Beslutsregel:**

- **"lika med Kesten–Stigum"** om |λ\*/λ_KS − 1| ≤ 0,03.
- **"under Kesten–Stigum"** om kvoten är under 0,97.

## E3. Spektralgap för spinn-1-ringar (familj 268)

Experimentet diagonaliserar exakt den bilinjär–bikvadratiska kedjan H = Σ cos θ (S·S) + sin θ (S·S)² på ringar med L = 6, 8, 10 och 12 platser, i sektorn Sz = 0.

| | Fall | Förutsägelse |
|---|---|---|
| Kalibreringar | Heisenberg (θ = 0, gap) och Takhtajan–Babujian (θ = −π/4, gaplös) | — |
| Nya fall | θ/π = AKLT-punkten (arctan(1/3)/π), 0,05; 0,15; 0,2; −0,1; −0,2; 0,3; 0,4 | gap för −π/4 < θ < π/4 (Haldane-fasen), gaplös-lik för θ ≥ π/4 |

**Beslutsregel:** den sattes på kalibreringarna innan något nytt fall kördes.

- **"gap"** om L·Δ växer med mer än 5 % i vart och ett av de två sista stegen, och Δ(12) > 0,05.
- **"gaplös-lik"** om L·Δ ändras mindre än 5 % i båda stegen.
- **"oavgjort"** annars.

## Förbehåll

- **E2 och E3** ger numeriska uppskattningar med ändlig population, ändligt djup och ändlig storlek.
- **E1:s övre gräns** är rigorös, men den räcker i praktiken bara till att avgöra fall långt under 1. Skattningen är inte rigorös.
- **Inget experiment** verifierar en sats i openai/math. De prövar förutsägelser i närliggande, beräkningsbara frågor.
