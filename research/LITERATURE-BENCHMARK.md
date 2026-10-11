# Scientific literature source benchmark — v0.4 pilot

This is a **metadata-only, opt-in benchmark** for Professor Oraklet. It does not change the scheduled research agent, download full texts, evaluate scientific relevance, or prove novelty. It compares **OpenAlex**, **Semantic Scholar**, **CORE**, and **arXiv** using metadata-only search. CORE's open-access repository focus and ranking semantics differ from the other providers; results are not relevance-equivalent. No full texts are fetched or stored.

## Run

### GitHub Actions (recommended)

After this workflow is merged into `main`, open **Actions → Literature benchmark (manual) → Run workflow**, select 5, 10 or 20 papers per query and source, then inspect the run summary and download the `literature-benchmark-results` artifact (retained for 14 days). This workflow is **manual only**: it is never scheduled and does not modify the research agent. It executes offline tests before the live API calls. GitHub Actions runners require outbound network access.

Optionally configure repository Actions secrets `OPENALEX_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`, and `CORE_API_KEY`. Without them, the script attempts anonymous API access; providers may reject or throttle requests. Never put API keys in workflow inputs or commit them. Failed requests are recorded in the output as errors, not interpreted as zero matching papers. The JSON artifact retains normalized paper metadata (title, DOI, source ID/link, year, and availability flags) alongside aggregate metrics. The run summary shows clickable title/DOI/source tables, up to 20 records per query/source; the artifact retains all returned records up to the requested limit. Neither output retains API credentials, abstracts, raw API responses or full texts. Older aggregate-only reports remain readable.

### Local command

Requires Node 24+ and Python 3 (standard library only, for namespace-aware Atom XML parsing). Network access is used only when the command is run explicitly.

```sh
node --test tests-research/literature-benchmark.test.mjs tests-research/arxiv-literature.test.mjs tests-research/summarize-literature-benchmark.test.mjs
OPENALEX_API_KEY=... SEMANTIC_SCHOLAR_API_KEY=... CORE_API_KEY=... node research/literature-benchmark.mjs 10 /tmp/literature-benchmark.json
```

The Semantic Scholar key is optional where unauthenticated access is available; expect rate limits. Consult provider terms and quotas before running at scale. The output path must not exist already. Do not commit keys, API responses or third-party full texts.

The pilot runs five predefined cross-disciplinary questions, sequentially, with at most 10 results per source/query by default (200 total records). You may set the limit to 1–100. Requests are paced sequentially (1.2 seconds between providers/queries by default). HTTP 429 and transient HTTP 5xx responses are retried at most twice. HTTP 429 uses 2 and 4 second exponential backoff, HTTP 5xx uses 1 and 2 seconds; valid Retry-After seconds or HTTP dates are respected when longer, with each wait capped at 10 seconds by default. The manual GitHub Actions job has a 25-minute timeout to accommodate worst-case bounded retries for the five default queries. This cap is a deliberate runtime budget and may be shorter than a provider's requested cooldown; repeated 429 errors remain errors, not missing papers.  authentication and other permanent errors are not retried. The report includes HTTP status and attempt count on failures. arXiv additionally waits 3 seconds before every request, including retries; its reported latency includes this pacing. Workflow concurrency serializes live benchmark jobs. Do not run another local arXiv client concurrently with this workflow. Errors are recorded per source. API access can fail and does not indicate that the provider has no relevant papers.

Metrics: returned record count, DOI count, DOI overlap, abstract availability, open-access **signal** (not confirmed downloadable full text), request latency, and error status. Missing DOI records are excluded from overlap; a zero overlap is not proof of disjoint coverage. The API ranking algorithms differ and this is not a controlled relevance comparison.

**Next phase:** verify CORE access under its licence and API terms with live results; expand to 20 pre-registered queries; blinded human relevance labels, reference-set recall, publication-date freshness, licensing and retraction checks, rate-limit handling, provider-specific pagination, request budgeting and full-text availability checks. Do not rank providers by scientific quality from this pilot alone.

API references:
- https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/search-entities
- https://api.semanticscholar.org/api-docs/

## CORE v3 access and licensing

The CORE adapter uses `GET https://api.core.ac.uk/v3/search/works/` with `q`, `limit`, and `exclude=fullText`, and sends optional `CORE_API_KEY` in the `Authorization: Bearer` header. The exclusion asks CORE to omit full text from the response before download, for both anonymous and authenticated requests; see `SearchParameters.exclude` in https://api.core.ac.uk/swagger/v3.json. Anonymous API access may be throttled or denied. Request a key at https://core.ac.uk/services/api if needed; check https://core.ac.uk/terms before using CORE in a deployed product or service. CORE metadata can signal availability of a full text, but this benchmark **never downloads, stores, republishes, or assumes a licence for full texts**. No CORE API key is required to run the offline tests. Pairwise DOI overlap metrics are computed only when both providers succeed. CORE indexes many works without DOIs, so DOI overlap is only a partial measure of its coverage.

Semantic Scholar's unauthenticated requests share capacity with other anonymous clients. A personal key typically provides 1 request/second across endpoints, per https://www.semanticscholar.org/product/api. An HTTP 429 is a provider access failure, not evidence of zero scientific papers.

## arXiv metadata and early research access

The adapter calls `GET https://export.arxiv.org/api/query` without an API key. It combines quoted `all:` terms with `AND`, requests `start=0` and the selected `max_results`, and sorts by `submittedDate` descending to surface newly submitted research. This differs intentionally from the other providers' ranking; counts and overlap do not measure scientific relevance. arXiv is a preprint repository, not evidence that a paper has been peer reviewed; some records also refer to subsequently published papers. DOI is optional, so DOI-only overlap undercounts arXiv coverage.

The Atom feed is parsed with Python's standard-library XML parser, with namespace handling, a bounded parser input and timeout, rejection of DTD/entity declarations, and explicit handling of API error entries. The adapter reads metadata only; PDF links are never followed. It retains submission/update dates for arXiv records. Failed HTTP/Atom responses remain source errors, while a valid empty Atom feed is a successful zero-result response.

References:
- https://info.arxiv.org/help/api/user-manual.html
- https://info.arxiv.org/help/api/tou.html (one connection and no more than one request every three seconds; descriptive metadata is CC0)
