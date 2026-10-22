# Citation-graph novelty check

Literature candidates have so far recorded novelty as *unknown*. **Citation graph novelty check (manual)** takes the first step: it asks whether later work, which cites the candidate's own evidence papers, may already address the candidate's question.

## How it works

`research/citation-novelty.mjs` reads a saved evidence planner report and one candidate. It then runs a bounded best-first **tree search** (`agentic-tree-search.mjs`) over the **OpenAlex citation graph**:

1. **Seeds.** The candidate's evidence papers with a resolvable OpenAlex work (`resolved_openalex_id` or the stored OpenAlex record), at most four.
2. **Expansion.** For a work, the 25 newest non-retracted works citing it are fetched. Those whose titles share the most terms with the candidate become its children, at most four.
   - The terms come from the research question and up to two reported limitations of the evidence papers.
   - Works already seen, including the seeds, are skipped.
3. **Best-first order.** The score is the share of the candidate's first six terms (the research question comes first) that a title contains. It decides which branch is followed next, so search effort goes to the most relevant lines of later work. The search covers at most 12 works and 2 citation steps (seed → citing → citing), using at most 17 OpenAlex requests with 200 ms between them.
4. **Result.**
   - The report lists up to ten later works, ranked by relevance and then recency.
   - Status `possible_overlap_found` means a later work's title shares at least half of the counted terms.
   - Otherwise the status is `no_overlap_found_within_budget`.

Run it from Actions with the evidence **report UUID** and the exact **candidate ID**, as for the literature follow-up. The workflow reuses the existing Supabase and OpenAlex secrets. Results go to the step summary and the `citation-novelty-<run>` artifact.

## Limits

- **Titles only.** A shared-term score is a review lead, not evidence that a work answers the question. Read the listed works.
- **Bounded search.** Work outside the explored branches, uncited work and gaps in OpenAlex citation links are not ruled out. *No overlap found* never means *novel*.
- **No model calls, full texts or database writes.** It does not change any saved report.

Natural next steps are model-scored relevance of the leads' abstracts within a call budget, a reference direction (what the seeds build on), and feeding the status into Problem Bank proposals.
