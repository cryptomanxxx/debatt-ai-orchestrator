# ai-bus

Professor Oraklets dagliga rapporter. Varje dag kl. 09:41 UTC skriver Oraklet:

- `senaste.md`: alltid den senaste rapporten;
- `rapporter/`: dagens rapport som `ÅÅÅÅ-MM-DD.md`, med ett register över alla dagar i [rapporter/README.md](rapporter/README.md);
- `artiklar/`: en kort vetenskaplig artikel om dagens verifierade resultat, när det finns något att skriva om, med ett register i [artiklar/README.md](artiklar/README.md).

Varje måndag kl. 05:23 UTC skriver arbetsflödet för beräkningsexperiment dessutom `berakningar/ÅÅÅÅ-MM-DD.md`: veckans experiment E1–E3 från [research/openai-math/RAPPORT.md](../research/openai-math/RAPPORT.md), utan modellanrop, med kalibreringar och förregistrerade förutsägelser. Registret finns i `berakningar/README.md`; se [research/openai-math/EXPERIMENTS.md](../research/openai-math/EXPERIMENTS.md).

Rapporten redovisar:

- hur mycket vetenskaplig litteratur Oraklet hittade och analyserade;
- vilka fynd, hypoteskandidater och förslag till studier han kom fram till;
- vad nyhetskontrollen hittade;
- vilka problem som registrerades automatiskt i Problem Bank och vilka som väntar på godkännande;
- vilka experiment labbet körde det senaste dygnet, och hur labbet stod sig mot en rak fråga till samma modell;
- vilka experiment Oraklet själv utformade (`act-map-design`): hans mekanism, hans förregistrerade förutsägelse mot labbets uppräkning, och hur undersökningen gick.
- vilka tre resultatfamiljer ur OpenAI:s matematiksamling (openai/math) Oraklet läste, med ordagrant kontrollerade citat, metod, öppen fråga och labbförslag.

Siffrorna kommer från sparade rapporter, inte från modellens egen sammanfattning. Hypoteser och kandidater är overifierade förslag. Se [research/LITERATURE-DAY.md](../research/LITERATURE-DAY.md) för hur dagen går till.
