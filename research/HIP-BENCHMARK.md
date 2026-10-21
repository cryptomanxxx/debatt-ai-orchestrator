# HIP model comparison for Professor Oraklet

Run **HIP scientific benchmark** manually in GitHub Actions after merging the workflow. Requests go through the Cloudflare Worker's `/v1/research/models` and `/v1/research/benchmark` routes with the `ORCHESTRATOR_API_KEY` secret; `HIP_API_KEY` exists only as a Worker secret. The Worker checks catalog membership, enforces the 768-token benchmark budget and a 60-second timeout, and rejects responses whose model ID differs from the requested one (`gateway_benchmark_model_identity_mismatch`). Defaults select all nine named chat models and two repetitions: five tasks × nine models × two repeats = 90 inference requests plus one model-list request. There are no automatic retries or scheduled runs. Each answer has at most 768 output tokens (69,120 output tokens across 90 requests); input tokens are additional. Actual euro cost is not estimated without verified HIP prices.

This is internal, pre-competitive research using fixed synthetic questions. It does not change Oraklet's provider or expose HIP through a public service.

The questions, system prompt, temperature, output budget and scientific scorer are the same as `blablador_scientific_v3.py`. The five tasks cover a determinant, Bayes' rule, a causal mediator, an OLS slope and a geometric sequence. The runner imports the existing tasks and validator rather than duplicating them. Endpoints and requested chat model IDs are fixed; embeddings (`gte-Qwen2-1.5B-instruct`), reranking (`bge-reranker-v2-m3`) and the aggregate `all-proxy-models` ID are excluded. The vision model receives text only. Newly discovered unknown IDs are recorded for manual classification.

Download the run's `hip-scientific-<run>-<attempt>` artifact for `results.json` and `summary.md`. The summary is also displayed on successful runs. JSON includes per-task responses, expected answers, requested/returned model IDs, correctness, format compliance, finish reason, latency and reported token usage. Returned model IDs must exactly match the requested ID before scoring. Missing or invalid IDs are marked `model_identity_unverified`; different IDs are marked `model_mismatch`. Response metadata is validated and bounded. Partial reports are saved after every answer. Authentication, quota and rate-limit errors stop further calls; other per-model failures are recorded. Redirects are rejected and upstream error bodies are never printed.

Compare correct/all attempts, evaluated correctness, completion rate, unverified answers and latency together. A model with one correct answer and nine failed calls must not be treated as a 100% winner. Review unverified answers manually; truncation does not establish an incorrect scientific answer. Token totals cover reported usage only. Two repeats use identical prompts at temperature zero: they test repeatability, not ten independent questions. Comparisons to historical Blablador runs may also reflect provider, model revision and timing differences.

This small test is a first screening, not sufficient to establish the best model for Oraklet. Follow up with harder held-out tasks for literature evidence, experimental design, scientific coding, tool selection and structured research plans, including actual tool execution. Embedding and reranking models need separate retrieval evaluation. A model change should follow that evaluation, not happen automatically based on these five questions.

Offline checks:

```sh
python -m pip install sympy==1.13.3
python -m unittest discover -s research -p 'test_*scientific*.py'
```
