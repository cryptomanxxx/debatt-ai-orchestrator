# Autonomous Research Planner — v0.1 baseline

## Goal

Move Professor Oraklet from a fixed experiment catalog toward **evidence-grounded research planning**. This initial version is a deliberately small, auditable **offline baseline**, not an autonomous scientific discovery system.

The intended architecture has four components:

1. **Scientific Literature Intelligence:** ingest research metadata and abstracts with source links.
2. **Research Gap Discovery:** identify *candidate* unanswered questions; never assert global novelty from a limited corpus.
3. **Hypothesis & Experiment Generator:** draft testable hypotheses and methods with explicit baselines.
4. **Research Portfolio Manager:** compare significance, novelty, feasibility, information gain, direct cost, and **opportunity cost**.

## Implemented now

`research/autonomous-planner.mjs` reads a user-provided JSON array of paper records, validates metadata, groups papers using transparent topic rules, generates source-linked candidate questions and experiment designs, and emits a deterministic JSON report. It does **not** access external APIs, call a model, search full texts, infer actual scientific novelty, estimate real costs, select tools, execute experiments, or modify the existing daily workflow.

The six portfolio score fields are placeholders, **not** validated scores. v0.1 ranks by number of topic-matched papers (a simple testable baseline), not by scientific value. Every proposal is marked `candidate_unverified` and requires human approval. Citation links establish provenance only; they do not establish that the proposed gap exists.

## Input format

Create a local JSON file, e.g. `/tmp/papers.json`:

```json
[
  {
    "id": "example-paper-1",
    "title": "Active learning for scientific experiment design",
    "abstract": "An evaluation of information gain for selecting experiments.",
    "url": "https://example.org/papers/1",
    "year": 2025
  }
]
```

Only ingest material you are permitted to process. A source URL is mandatory and must be HTTPS; records must have nonempty id/title/abstract, and ids must be unique. The sample is **illustrative**, not a real paper.

Run:

```sh
node research/autonomous-planner.mjs /tmp/papers.json /tmp/proposals.json
node --test tests-research/autonomous-planner.test.mjs
```

Do not commit third-party full texts or API keys. The report contains source metadata and short method proposals, not copied paper content.

## Next increments (not implemented)

- **v0.2:** consent-compliant retrieval from open scholarly indexes (e.g. OpenAlex/arXiv), deduplication by DOI, licenses, publication dates, retraction checks, and quality filters; evaluate 100 then 1,000 real papers.
- **v0.3:** model-assisted claim extraction with exact source passages and confidence; cross-paper contradiction detection; adversarial novelty checks against independent search results.
- **v0.4:** constrained model-generated hypotheses with falsification criteria, baseline, measurable outcomes, dataset and tool requirements, and provenance; human-scored proposal quality benchmark.
- **v0.5:** calibrated portfolio ranking with measured compute/API costs and opportunity cost as foregone expected value of alternatives; diversity-aware allocation and fixed-budget comparisons.
- **v1.0:** sandboxed experiment planning and execution with independent verification, audit trails, budget limits and approval gates.

**Evaluation:** compare against fixed-catalog planning and simple keyword baselines on a held-out set. Track citation correctness, groundedness, feasibility, expert-rated importance, novelty-search false positives, diversity, cost and verified experimental outcomes. A proposal is not a scientific discovery.
