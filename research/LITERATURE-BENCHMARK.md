# Scientific literature source benchmark — v0.2 pilot

This is a **metadata-only, opt-in benchmark** for Professor Oraklet. It does not change the scheduled research agent, download full texts, evaluate scientific relevance, or prove novelty. It currently compares **OpenAlex** and **Semantic Scholar**. CORE is deferred until its access terms, authentication, and comparable search semantics are validated.

## Run

Requires Node 24+. Network access is used only when the command is run explicitly.

```sh
node --test tests-research/literature-benchmark.test.mjs
OPENALEX_API_KEY=... SEMANTIC_SCHOLAR_API_KEY=... node research/literature-benchmark.mjs 10 /tmp/literature-benchmark.json
```

The Semantic Scholar key is optional where unauthenticated access is available; expect rate limits. Consult provider terms and quotas before running at scale. The output path must not exist already. Do not commit keys, API responses or third-party full texts.

The pilot runs five predefined cross-disciplinary questions, sequentially, with at most 10 results per source/query by default (100 total records). You may set the limit to 1–100. No retries are attempted on 429 responses; errors are recorded per source. API access can fail and does not indicate that the provider has no relevant papers.

Metrics: returned record count, DOI count, DOI overlap, abstract availability, open-access **signal** (not confirmed downloadable full text), request latency, and error status. Missing DOI records are excluded from overlap; a zero overlap is not proof of disjoint coverage. The API ranking algorithms differ and this is not a controlled relevance comparison.

**Next phase:** evaluate CORE access and a third adapter; expand to 20 pre-registered queries; blinded human relevance labels, reference-set recall, publication-date freshness, licensing and retraction checks, rate-limit handling, provider-specific pagination, request budgeting and full-text availability checks. Do not rank providers by scientific quality from this pilot alone.

API references:
- https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/search-entities
- https://api.semanticscholar.org/api-docs/
