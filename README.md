# Debatt-AI Orchestrator

Independent orchestration service for Debatt-AI AI 1.0. Working pipeline: HTTP → rule-based plan → model or registered tool → verification → structured response. Memory, retrieval, web search and general multi-step agent planning remain future work.

## Run

Requires Node.js 24. No external dependencies or build step. TypeScript files run with Node's built-in type stripping; this is not a static type check.

```sh
cp .env.example .env
# Set ORCHESTRATOR_API_KEY to a random secret of at least 24 characters.
node --env-file=.env src/server.ts
```

`npm test` runs local HTTP integration tests without spending model credits.

## API

`GET /health` is public and returns service status. It does not check model-provider availability.

`POST /v1/query` requires `Authorization: Bearer <ORCHESTRATOR_API_KEY>` and `Content-Type: application/json`.

```json
{"message":"Förklara alternativkostnad på svenska.","mode":"default"}
```

Response fields: `id`, `answer`, `model`, `provider`, `mode`, `mock`, `plan`, `trace`, `verification` and, for arithmetic, `toolResult`. Default provider is `mock`, which returns an explicitly labelled test response, not an AI answer. `reasoning` selects the optional configured reasoning model. Existing `default` and `reasoning` modes keep their model paths. New `auto` mode routes pure arithmetic and explicit `calc:` / `räkna:` commands to the local calculator; other text uses the default model.

For real inference set `MODEL_PROVIDER=openai`, `MODEL_BASE_URL` (HTTPS URL ending in `/v1`), `MODEL_API_KEY` and `MODEL_DEFAULT` to values supplied by your chosen OpenAI-compatible provider. `MODEL_REASONING` is optional. No particular model or provider availability is assumed.

## Render setup (next milestone)

Create a Node web service from this repository. Build command: `node --version`. Start command: `npm start`. Set environment variables in Render, not in Git. Render provides `PORT`. Use `/health` as health-check path. This repository does not create or deploy a Render service automatically.

Keep the orchestrator key on the Debatt-AI backend, never in browser code. No CORS is enabled: this initial service is designed for backend-to-backend calls. Before public production use add per-user quotas/rate limiting and monitoring. Requests are limited to 32 KiB, messages to 8,000 characters, and output to 1,024 tokens; upstream calls time out after 45 seconds. There is no persistent local state, retry loop or arbitrary code execution.

## Modules and planning

- `src/models/registry.ts`: configured default/reasoning model selection.
- `src/tools/`: allowlisted tool registry and arithmetic parser.
- `src/planning/planner.ts`: a bounded two-step plan (model or calculator, then verification).
- `src/verification/verifier.ts`: output format and arithmetic consistency checks.
- `src/router.ts`: conservative rules for automatic arithmetic routing.
- `src/orchestrator.ts`: executes the plan and exposes a trace.

Example request:

```json
{"message":"räkna: (2 + 3) * 4","mode":"auto"}
```

Returns `answer: "20"`, `provider: "local"`, `model: null`, `mock: false`, an arithmetic plan and `verification.scope: "arithmetic_consistency"`. No model credits are spent. Arithmetic supports decimal points, parentheses, unary signs and `+ - * /`. It uses JavaScript floating-point numbers, not exact financial arithmetic. Limits: 512 characters, 256 tokens, nesting depth 32. Invalid explicit calculations return HTTP 400 without falling back to paid inference. No `eval`, shell or arbitrary code execution.

**Verification limits:** calculator results are replayed with the same parser and checked against the answer, which is a consistency check, not an independent mathematical proof. Model answers only receive a nonempty-text check (`scope: "response_shape"`, `factualityChecked: false`). Mock text reports `not_verified`. A passed check never means a model's factual claims were confirmed. Plans contain one execution step and one verification step, not open-ended task decomposition. Tool/network integrations can be added through the registry and planner later.

## Token-limit compatibility

`MODEL_TOKEN_LIMIT_FIELD=auto` (default) sends `max_completion_tokens` to the official `api.openai.com` endpoint and recognised o-series model IDs such as `o3-mini`, including provider-prefixed IDs. Other compatible providers keep `max_tokens`. Set `MODEL_TOKEN_LIMIT_FIELD=max_completion_tokens` or `max_tokens` to override this selection for provider-specific aliases or requirements. An override applies to both configured models; automatic selection is based on the actual selected model ID. Exactly one limit field is sent, always capped at 1,024 tokens. For `max_completion_tokens` this budget includes hidden reasoning tokens as well as visible output, so it can run out before a visible answer is produced. No automatic retry or budget increase is performed.

Reference: [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
