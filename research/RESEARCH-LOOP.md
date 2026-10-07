# Research Loop v1

Research Loop v1 inför ett maskinläsbart forskningsobjekt inspirerat av OpenAI:s offentliga math-release, men gör inga anspråk på att återimplementera deras interna modell eller dolda infrastruktur.

Flödet är: **problem → hypotes → försök → verktyg/evidens → verifiering → resultat → revision**.

## Kontrakt

Ett problem har en explicit compute-budget (maxAttempts, 1–20). Misslyckade och inkonklusiva försök bevaras i stället för att skrivas över. Varje mutation skapar en revisionspost och ett deterministiskt SHA-256-fingeravtryck. Resultat kan avslutas som verified, falsified, inconclusive eller needs_external_verification.

verified och falsified kräver explicit verifiering. Detta är avsiktligt: ett modellsvar är inte verifiering. Befintliga verifierade delintegrationer (SymPy, scikit-learn, DoWhy, PyMC, Statsmodels och BootLoops-adaptrar) kan senare kopplas till loopen genom sina begränsade adapters.

V1 exekverar inte godtycklig modellgenererad kod, laddar inte automatiskt OpenAI:s manuskript och påstår inte att ett forskningsresultat är nytt. Nästa steg är en runner som mappar katalogiserade forskningsmetoder till recordAttempt och separata verifierare, samt persistens av hela problemfamiljen.
