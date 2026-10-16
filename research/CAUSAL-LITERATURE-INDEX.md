# Scientific literature → causal retrieval index (v0.1)

This is an **independent, manual, CPU-only, no-credentials data-ingestion pilot**. It intentionally does **not** alter PR #91, automatically fetch 10,000 articles, certify causal knowledge or merge uncertain scientific claims into VEM-Sci.

## Inputs, outputs and scaling

Supply UTF-8 JSONL records with "title", "abstract", "doi" (or "id"), optionally "source" and "year". The importer validates bounded metadata (up to 10,000 rows, up to 8 KB abstracts), rejects malformed rows, deduplicates by persistent identifier, hashes title/abstract content and records provenance. The report keeps limited lexical keywords rather than full article text; an abstract's causal phrasing is **not** evidence of a verified causal graph.

The bounded inverted lexical index creates up to 5,000 cross-provider retrieval leads with >=2 shared non-stop terms. Those are *research leads*, **not** ACT-MAP claims; cross-provider does not mean cross-discipline. This is a conservative data interchange foundation only. The paper text does not automatically yield intervention targets, confounder sets, mathematical models or experimentally validated mechanisms.

No real scientific dataset, full-text corpus, bulk provider connector, storage system, embeddings or model inference is included. The inputs are intentionally caller-supplied, permitting benchmark replay without API charges and avoiding dependence on existing Supabase capacity. Source APIs and licensing/attribution requirements must be handled by an independently reviewed ingestion connector.

## Reproducible commands

\`\`\`sh
python3 -m unittest discover -s tests-research -p test_causal_literature_index.py -v
python3 research/causal_literature_index.py --input research/data/causal-literature-sample.jsonl --output reports/causal-literature/report.json
\`\`\`

CI tests the implementation; the manually dispatched GitHub Actions workflow runs a **small labeled demo fixture**, not a live corpus crawl. Artifact retention is 30 days.

## Next steps (separate review)

1. Import bounded previously archived Semantic Scholar / OpenAlex / CORE metadata with source IDs and licenses. **Do not confuse total matching metadata with usable abstracts.**
2. Partition large inputs into resumable shards, maintain idempotent content-addressed checkpoints and explicit global ingestion-rate budgets.
3. Use an LLM to extract *candidate* source/target/intervention/outcome/assumptions with exact supporting text spans, and independently evaluate extraction against human-annotated references.
4. Only then transform validated candidate causal models into ACT-MAP's bounded interfaces and a VEM-Sci verification workflow, without upgrading ambiguous literature claims to accepted science.
5. Compare retrieval quality, extraction accuracy, novelty checks, evidence strength and validated hypotheses **per compute and data-access cost**.

The project retains its original 2026 EIC Pathfinder scientific HOLD / NO-SUBMIT assessment.
