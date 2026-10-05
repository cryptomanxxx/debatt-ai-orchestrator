# Debatt-AI Orchestrator

Independent orchestration service for Debatt-AI AI 1.0. Working pipeline: HTTP → rule-based plan → model or registered tool → verification → structured response. Memory, retrieval, web search and general multi-step agent planning remain future work.

## Run

Requires Node.js 24. The Node server has no runtime dependencies or build step. TypeScript files run with Node's built-in type stripping; this is not a static type check. Workers development uses the pinned Wrangler and Miniflare dev dependencies.

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

## Cloudflare Workers

`src/worker.ts` exposes the same API in Cloudflare's Workers runtime. It shares request validation, planning, tools and inference with the Node server. Configuration is read from each request's environment bindings. Invalid configuration returns a generic HTTP 503, including on `/health`; health does not test upstream model availability.

Local development and validation:

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set a random ORCHESTRATOR_API_KEY of at least 24 characters in .dev.vars.
npm run dev:workers
```

`npm run check:workers` bundles the Worker without publishing it. Run `npm run test:workers` after that to test the bundle in Miniflare/workerd, with mocked outbound inference and no model credits. CI requires both the existing Node tests and these Workers checks in the `test` job.

### Deploy from GitHub (no local computer required)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages → Create application**, choose the GitHub repository integration and select `cryptomanxxx/debatt-ai-orchestrator`. Create a **Worker**, not a static Pages site.
2. Use Worker name `debatt-ai-orchestrator` (matching `wrangler.jsonc`), production branch `main` and repository root `/`. Set build command `npm test && npm run check:workers && npm run test:workers` and deploy command `npm run deploy:workers`. Cloudflare installs the npm dependencies. Choose the Workers Free plan for this trial.
3. After the first deployment, open the Worker **Settings → Variables and Secrets → Add**, create a **Secret** named `ORCHESTRATOR_API_KEY` with a random value of at least 24 characters, then deploy the settings change. Until this secret exists, the service intentionally returns `503 service_not_configured`.
4. Open the dashboard's Worker URL followed by `/health`; expect HTTP 200. The mock provider in `wrangler.jsonc` needs no model API key. Test an authenticated `/v1/query` request from a backend or API client; `{"message":"räkna: (2+3)*4","mode":"auto"}` returns `20` without inference costs. `{"message":"Hej"}` returns labelled mock text.

For a CLI deployment, run `npx wrangler login`, `npm run deploy:workers`, then `npx wrangler secret put ORCHESTRATOR_API_KEY` in an authenticated environment. No Cloudflare token, account ID or real secret belongs in Git. This repository only prepares the code; creating a PR does not publish a Worker or connect the Debatt-AI website.

### Enable real model inference

Keep `ORCHESTRATOR_API_KEY` and `MODEL_API_KEY` as runtime **Secrets**. Nonsecret model settings are managed by `wrangler.jsonc`: change `MODEL_PROVIDER` to `openai`, add `MODEL_BASE_URL`, `MODEL_DEFAULT` and optionally `MODEL_REASONING`, then deploy. Wrangler's `vars` are the source of truth and later deployments can overwrite dashboard edits to ordinary variables. Runtime secrets are different from build environment variables; the Worker reads runtime bindings, not build-time credentials. The backend calling the Worker must hold the orchestrator key; never send it to browser code.

Workers Free limits CPU time per request; awaiting an external model API is not CPU time, but JSON processing and local tools are. These tests verify runtime compatibility, not production CPU-budget compliance. This Worker uses no paid containers, databases, queues or Workers AI. External model providers can still charge for inference. BootLoops is not implemented here: a Python subprocess, Julia or Docker cannot run inside this Worker; a future BootLoops adapter needs a compatible external execution service.

References: [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [runtime secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Alternative Node hosting: Render

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
