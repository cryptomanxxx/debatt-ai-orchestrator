# Oraklet's daily literature research

**Oraklets dagliga litteraturforskning** (`.github/workflows/oraklet-literature-day.yml`) runs every day at **09:41 UTC** without anyone starting it. Professor Oraklet uses the literature tools himself and reports what he read and found in [`ai-bus/`](../ai-bus/README.md).

## Fields

The day's field alternates by UTC date:

| Field | Search query |
| --- | --- |
| AI for scientific discovery | `AI agents scientific discovery` |
| Causal inference | `causal inference machine learning` |

`AI for scientific discovery` is also a research area in the manual pipeline and the dashboard. The follow-up vocabulary now recognises AI-agent methods. The planner has a `causal-inference` theme, so causal-inference candidates map to the `dowhy-backdoor` catalog experiment.

## What runs, in order

1. **Research pipeline** (`research-pipeline.mjs`), with 10 model calls:
   - it collects metadata and up to ten abstracts for the field;
   - it analyses up to five abstracts with quote-checked findings;
   - it picks a candidate and searches related work;
   - it analyses up to five more abstracts from the follow-up.
2. **Research Tree Search** (`research-tree-planner.mjs`), an agentic tree search over the day's evidence report. It turns the candidate into a review queue: the candidate, a replication design and a falsification design. It makes no model calls.
3. **Citation-graph novelty check** (`citation-novelty.mjs`), a bounded agentic tree search over later OpenAlex works that cite the candidate's sources. It lists possible overlaps. It makes no model calls.
4. **Automatic Problem Bank registration.** Literature proposals that point to an automatic catalog experiment are registered with the same fingerprinted problem identity as the manual `problem-bank-create` workflow. The daily lab is then offered them as open problems. A retired version is reported as retired, never as registered. Proposals for manual-only experiments are listed in ai-bus as waiting for approval. Every Problem Bank request times out after 15 seconds.
5. **The lab's last 24 hours.** Up to 20 saved lab reports from `oraklet_experiment` (pass counts and the bare-baseline comparison) are read for the report. When more runs were saved, the report says it lists the latest 20. For each run of `act-map-design`, a section **Oraklets egna experiment** shows what Oraklet designed: his mechanism as the lab's own equations, his preregistered prediction against the lab's enumeration, and each investigation's decision, truth, gate and baseline. His reason is shown as inert text.
6. **Oraklet's memory.** The VEM-Sci register of verified claims from the latest saved lab runs, with each experiment's learning priority. It is the same register the daily lab plans with; see [ACT-MAP-LAB.md](ACT-MAP-LAB.md#vem-sci-register).
7. **Oraklet's short article** (`research/daily-article.mjs`). At most three model calls on top of the pipeline's ten (a draft and, if the lab rejects it, up to two rewrites), so the article brings the day to thirteen, and the reading below to fourteen. The calls are paced like the lab's (10 s apart, 45 s before repeating a rate-limited or failed request), because the free models rate-limit back-to-back calls; a failed call's record names the provider, the model and the upstream HTTP status.
   - **Fact sheet.** The lab builds a numbered fact sheet from the saved reports only: lab runs, Oraklet's own designs, the VEM-Sci register, DeepRAP, and the literature findings with their verified quotes as references. An article is written only when the sheet holds a verified outcome: a completed case or a decided claim, not an empty register.
   - **Writing.** Oraklet writes a 250–900-word article in Swedish, more an extended summary than a full paper, with the sections Sammanfattning, Bakgrund, Metod, Resultat and Begränsningar. He cites `[F#]` for facts and `[R#]` for literature.
   - **The lab's own edits before the checks** (since the free model kept writing overstating words and numbers that do not match the facts, the lab now does both itself; each edit is listed at the end of the published article):
     - **Numbers from placeholders.** Oraklet writes `{F3}` where a lab fact should give the numbers, and the lab puts that fact's text in word for word (without its full stop). Literature facts, whose quotes carry full stops, do not expand; a placeholder that names no fact of the lab's own stays and is refused as an unknown citation.
     - **Toning down.** A wording that overstates (below) is replaced by a weaker one: "bekräftade" by "stödde preliminärt", "upptäckt" by "iakttagelse" ("har upptäckt" by "har iakttagit"), "bevis" by "belägg", "genombrott" by "framsteg", and so on; an unknown form of a stem gets the stem's noun. A direct negation is left as it is, and so is every word in a sentence that speaks of absence, doubt or negation (saknar, saknas, brist, utan, svårt, ifrågasätter, förnekar, ingen, inte …): there a weaker word would make the negative claim stronger ("saknar belägg" says more than "saknar bevis"), so such a sentence is refused for a rewrite as before. Every edit is listed in the article; the day's record keeps the total and at most 20 of the changes.
     - **Striking.** After those edits, a sentence that the number or citation checks refuse (a number no cited fact holds, a number or sentence without a citation) is struck and the rest checked again, at most six sentences. Striking never adds a claim; if the article then falls below 250 words, or another check fails, it is refused as before.
   - **Checks before publishing.**
     - Every sentence must cite the sheet, every citation must exist in it, and the article must cite at least one verified result.
     - Every number must be written in digits and appear, with the word or sign that follows it and in the fact's order, in a fact cited in the same sentence. So "3 av 1" does not pass where the fact says "1 av 3". Dates are not allowed, and number words only where a cited fact uses the same word itself, as in a label the lab wrote ("ACT-MAP två ingrepp").
     - The title is written by the lab from the topic of the first verified result cited, never by the model, since a title cites nothing.
     - Wordings that overstate a result (bevis, bekräfta, genombrott, upptäcka, fastställa, säkerställa …) are toned down by the lab before this check (above), so the check now only catches what the toning missed; Markdown and links are refused. A direct negation states the opposite and is allowed ("ingen ny upptäckt", "inte bekräftat"): a negator (inte, ej, ingen, inget, inga, aldrig) at most two words before the word, with only qualifying words between ("ny", "vetenskaplig", "någon", "ett", "heller" …). Qualifying words include "empirisk", "statistisk", "oberoende", "extern", "direkt" and "tydlig", so "ingen empirisk bekräftelse" is allowed. Any other word between, after any negator, could start a new claim or move the negation to something else ("inte preliminärt och bevisar", "inte … utan ett genombrott", "inte bara", "Ingen forskare ifrågasätter genombrottet", "Ingen förnekar upptäckten"), so the sentence is refused. "utan" (without) negates as well ("utan experimentell bekräftelse"), except after an earlier negator in the same sentence, where "inte … utan" means "but instead" and the sentence is refused. "Kausal upptäckt" (causal discovery) is the name of a method family and is allowed only in the fixed forms "<metod|ramverk|framework|algoritm|verktyg|teknik…> för [one word] kausal upptäckt" and "inom kausal upptäckt"; "Oraklet gjorde en kausal upptäckt" and "Metoden gav en kausal upptäckt" are still refused. The prompt names the words, asks the model to avoid every word starting with "bekräft" even when negated, and offers "overifierat", "inte prövat", "saknar experimentellt stöd", "preliminärt stött" and "inte granskat" instead. A rewrite after a refused word is told to drop the word entirely, negated or not.
     - These checks cannot catch every change of meaning in prose, such as a flipped verb. That is why the article lists its cited facts and is marked unreviewed.
   - **Rewrites.** A rejected draft gets up to two rewrites. Each is told the lab's reason, the refused word or number, and the refused sentence (the model's own text, at most 300 characters), and must pass the same checks.
   - **Drafts.** Every rejected draft is saved, with its reason, in `reports/literature-day/article-drafts.json` in the run's artifact, never in `ai-bus` or `day.json`, so a failed day can be read.
   - **Failure.** An article whose rewrites also fail is not published, and the day's report gives every reason and overstating word. Without a verified lab or register result there is no article.
   - **Published files.** The article goes to `ai-bus/artiklar/ÅÅÅÅ-MM-DD.md` (one per date; a rerun the same day replaces it, or withdraws it when the rerun publishes none), with the cited facts and references and a fixed footer saying it is unreviewed. `ai-bus/artiklar/README.md` indexes all articles, and the daily report links the day's article. Both indexes are rebuilt by `research/ai-bus-index.mjs` on the latest `main` before the publish commit, so a file that reached `main` during the run stays listed.
8. **OpenAI's mathematics collection** (`research/openai-math-reading.mjs`). Oraklet reads three result families a day from [openai/math](https://github.com/openai/math), in the order of [research/openai-math/katalog.json](openai-math/katalog.json), so the 373 families take about four months. The step runs last, after the article, and makes one model call through its own client; it waits the lab's 10 s spacing when the article called just before.
   - **What he writes.** For each family: a word-for-word quote of the main claim from its summary, the method that seems to carry the result, an open follow-up question, and a small computation the lab could run (or "inget").
   - **Checks.** The lab checks the shape, that each quote occurs in that family's summary (whitespace aside), the lengths (quote 20–300 characters, the other texts 3–300), and that no link is written. Each family is checked on its own: a failing note is listed with a fixed reason and the others are kept.
   - **Report.** The ai-bus report gets a section with the day's families (subject, Lean status, code and the lab's replication from [RAPPORT.md](openai-math/RAPPORT.md)) and Oraklet's notes as inert text. The notes are his interpretation and are not reviewed; the collection itself is unreviewed raw data.
   - The computations proposed in the report run separately, weekly and without a model; see [openai-math/EXPERIMENTS.md](openai-math/EXPERIMENTS.md).
9. **ai-bus report.**
   - `ai-bus/rapporter/ÅÅÅÅ-MM-DD.md` with the report index `ai-bus/rapporter/README.md`, `ai-bus/senaste.md`, and the day's article with the index when one was published, are committed to `main`, using the model-menu app that is already allowed to push there. Only a run of `main` publishes, and the commit contains only the report on top of the latest `main`.
   - `reports/literature-day/day.json` and all tool reports go to the run artifact.

A stage that fails or misses its deadline (pipeline 35 minutes, each other stage 2–5 minutes, including the memory read and the reading) is recorded in the day's report and the remaining stages still run. A summary figure whose stage failed is shown as unknown, never as zero. The publish step commits only the two files this run generated. The run is then marked failed after the report has been committed.

## What the report claims

Every number comes from saved reports, not from a model's own summary. Model and literature text is rendered as inert text. Candidates, the review queue and novelty leads are leads for further review: no hypothesis is verified and no discovery is claimed. Oraklet reads abstracts only, at most about ten a day within the current budget. From the openai/math catalog he reads three family summaries a day; his notes there are interpretations with checked quotes, not results.

## Setup

- No new secret or migration is needed. The workflow reuses `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORCHESTRATOR_API_KEY`, the optional literature API keys, and `MODEL_MENU_APP_CLIENT_ID` / `MODEL_MENU_APP_PRIVATE_KEY` for the push to `main`.
- It has its own concurrency group. GitHub keeps only one pending run per group, so sharing the collector's group could replace a pending manual pipeline run. Provider pacing and retries cover an occasional overlap with the collector.

## Next steps

- Read far more per day with the free HIP/Blablador models: batched triage of all new papers in the fields, then structured extraction for the relevant ones.
- A claim registry across papers, to find contradictions and gaps.
