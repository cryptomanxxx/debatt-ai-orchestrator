# Research Tree Search — evidence-linked review queue (v0.1)

This is a **manual, review-only** bridge between the existing literature evidence
planner, bounded agentic tree search, Research Loop state and the Research
Portfolio Manager's six explicit *unknown* assessment fields.

It is **not** autonomous scientific discovery, a novelty checker, a calibrated
scientific ranking, or a way to execute experiments. No model, Python, shell,
network action or experiment is selected by a paper or by the tree itself.

## Run

1. Run the existing **Literature evidence planner (manual)** or **Oraklet
   research pipeline (manual)** and find its saved *evidence report UUID*
   (not the literature collection UUID or the follow-up report UUID).
2. Open **Actions → Research Tree Search (review only) → Run workflow** on
   the trusted main branch only. Branch testing must use the local offline replay
   without any Supabase database credential.
3. Supply the existing evidence report UUID. The workflow reads that immutable
   report using the existing read-only Supabase client and
   SUPABASE_URL/SUPABASE_SECRET_KEY. It does **not** write back to the database.
4. Inspect the 30-day Actions artifact:
   - reports/research-tree-review/report.json: ranked review queue, provenance,
     bounded tree trace, immutable Research Loop hypotheses and fingerprints.
   - reports/research-tree-review/summary.md: compact human-readable queue.

For a local offline replay of an existing JSON report, with no Supabase access:

    RESEARCH_TREE_INPUT_FILE=/path/to/literature-evidence-report.json node research/research-tree-planner.mjs

Run unit tests with:

    node --test tests-research/agentic-tree-search.test.mjs tests-research/research-tree-planner.test.mjs

## Search contract and interpretation

- Input must be a valid existing literature-evidence-1 report containing
  abstract-evidence-baseline planner proposals. Candidate IDs, cited article
  IDs and content hashes must match records in the same report. Each candidate
  must retain human-approval and unverified status, null scientific portfolio
  scores and an unexecutable draft protocol. Invalid provenance fails closed.
- The root expands **up to three** existing evidence-linked candidates, ordered
  by evidence count, unreviewed limitation leads and stable ID; candidates
  are not invented. Each root may branch into exactly two predetermined study
  designs: independent replication and a falsification/null-baseline test.
- The reused bounded best-first engine visits at most **nine** nodes and a
  maximum depth of two, using fixed actions only. There is no code execution,
  API access, arbitrary user text action or additional model call during the
  search. The original abstract evidence generation uses the existing research
  model in its *separate* workflow.
- Each search node creates a proposed Research Loop hypothesis with a recorded
  parent, preserving immutable revisions and fingerprints. No research attempts
  or results are recorded; there is no Problem Bank registration.
- Routing priority is an explicitly heuristic, bounded function of the number
  of matching *abstract references*, unreviewed limitation leads and whether
  a draft mentions an existing baseline. It is **not** scientific merit,
  evidence strength, model confidence, probability of success or novelty.
  All six Research Portfolio Manager dimensions (significance, novelty,
  feasibility, information gain, cost, opportunity cost) remain **unknown**.
- Every node returns verified:false, status review_only and
  requires_human_approval; a null test or replication draft cannot be
  promoted to a scientifically established result through search scoring.

A researcher must check full papers, limitations, related/subsequent work,
licensing, matched budgets, experimental protocols, independent verifiers and
falsifiable acceptance criteria before approving or registering experiments.

## Non-goals and next steps

This increment does not alter the daily researcher, model router, research
pipeline, Cloudflare Worker, Supabase schema, Problem Bank entries or web site.
The queue is an ephemeral artifact, **not** a saved approved portfolio.
A future increment can compare this heuristic with a fixed-catalog baseline,
introduce blinded human assessments, controlled model-generated alternatives and
equal-budget evaluations before any automation of research execution.


## Immutable archive quotation replay

The CLI replays summarized-paper citations against the exact archived abstract version (using `archive.version_id`), not the latest fetched abstract. It checks the archived source identity, original SHA-256, deterministic `evidencePrompt` analyzed-text SHA-256, truncation flag, and exact finding/context quote occurrence. The output stores only article/version identifiers, verification status and bounded reason codes; no raw abstract is serialized.

`citation_replay.results[].status` is `verified`, `rejected`, or `unverifiable`. Missing archived versions or pre-archive legacy reports remain `unverifiable`; they are **never** silently upgraded or replaced with newer content. A verified quote proves occurrence in the analyzed abstract, **not** that the scientific claim is true. Tree review remains non-executing and requires human approval.

When configured, the CLI uses existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` credentials for a read-only version lookup; tests inject `readArchiveVersion` without network access. The original evidence report schema and no-raw-abstract storage contract remain unchanged.
