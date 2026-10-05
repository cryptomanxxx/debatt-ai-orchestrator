# Debatt-AI Orchestrator

Independent orchestration service for Debatt-AI AI 1.0. First milestone: HTTP → model selection → provider → structured response. Planning, tools, memory and verification are future work.

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

Response fields: `id`, `answer`, `model`, `provider`, `mode`, `mock`. Default provider is `mock`, which returns an explicitly labelled test response, not an AI answer. `reasoning` selects the optional configured reasoning model; no automatic classification yet.

For real inference set `MODEL_PROVIDER=openai`, `MODEL_BASE_URL` (HTTPS URL ending in `/v1`), `MODEL_API_KEY` and `MODEL_DEFAULT` to values supplied by your chosen OpenAI-compatible provider. `MODEL_REASONING` is optional. No particular model or provider availability is assumed.

## Render setup (next milestone)

Create a Node web service from this repository. Build command: `node --version`. Start command: `npm start`. Set environment variables in Render, not in Git. Render provides `PORT`. Use `/health` as health-check path. This repository does not create or deploy a Render service automatically.

Keep the orchestrator key on the Debatt-AI backend, never in browser code. No CORS is enabled: this initial service is designed for backend-to-backend calls. Before public production use add per-user quotas/rate limiting and monitoring. Requests are limited to 32 KiB, messages to 8,000 characters, and output to 1,024 tokens; upstream calls time out after 45 seconds. There is no persistent local state, retry loop or arbitrary code execution.
