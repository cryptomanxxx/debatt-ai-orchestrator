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
# Keep MODEL_PROVIDER=mock from the example for local testing without Groq credentials.
npm run dev:workers
```

`npm run check:workers` bundles the Worker without publishing it. Run `npm run test:workers` after that to test the bundle in Miniflare/workerd, with mocked outbound inference and no model credits. CI requires both the existing Node tests and these Workers checks in the `test` job.

### Deploy from GitHub (no local computer required)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages → Create application**, choose the GitHub repository integration and select `cryptomanxxx/debatt-ai-orchestrator`. Create a **Worker**, not a static Pages site.
2. Use Worker name `debatt-ai-orchestrator` (matching `wrangler.jsonc`), production branch `main` and repository root `/`. Set build command `npm test && npm run check:workers && npm run test:workers` and deploy command `npm run deploy:workers`. Cloudflare installs the npm dependencies. Choose the Workers Free plan for this trial.
3. After the first deployment, open the Worker **Settings → Runtime variables and secrets → Production**, create a **Secret** named `ORCHESTRATOR_API_KEY` with a random value of at least 24 characters and a **Secret** named `MODEL_API_KEY` containing your Groq API key, then deploy the settings change. Until both secrets exist, the service intentionally returns `503 service_not_configured`. These are runtime secrets, not the similarly named settings under **Builds**.
4. Open the dashboard's Worker URL followed by `/health`; expect HTTP 200. Test an authenticated `/v1/query` request from a backend or API client; `{"message":"räkna: (2+3)*4","mode":"auto"}` returns `20` without inference costs. To test the Groq connection, send `{"message":"Svara bara med ordet Hej.","mode":"default"}` and expect HTTP 200, a nonempty `answer`, `mock: false` and `model: "openai/gpt-oss-120b"`. Health and calculator success alone do not verify the Groq connection.

For a CLI deployment, run `npx wrangler login`, `npm run deploy:workers`, then both `npx wrangler secret put ORCHESTRATOR_API_KEY` and `npx wrangler secret put MODEL_API_KEY` in an authenticated environment. Enter the orchestrator key and Groq API key respectively at the prompts. The Worker returns 503 until both runtime secrets are present. No Cloudflare token, account ID or real secret belongs in Git. This repository only prepares the code; creating a PR does not publish a Worker or connect the Debatt-AI website.

### Enable real model inference

Keep `ORCHESTRATOR_API_KEY` and `MODEL_API_KEY` as runtime **Secrets**. Nonsecret model settings are managed by `wrangler.jsonc`: change `MODEL_PROVIDER` to `openai`, add `MODEL_BASE_URL`, `MODEL_DEFAULT` and optionally `MODEL_REASONING`, then deploy. Wrangler's `vars` are the source of truth and later deployments can overwrite dashboard edits to ordinary variables. Runtime secrets are different from build environment variables; the Worker reads runtime bindings, not build-time credentials. The backend calling the Worker must hold the orchestrator key; never send it to browser code.

The Workers deployment is configured for Groq's OpenAI-compatible Chat Completions API:

| Runtime setting | Value |
| --- | --- |
| `MODEL_PROVIDER` | `openai` (the API compatibility adapter, not the inference host) |
| `MODEL_BASE_URL` | `https://api.groq.com/openai/v1` |
| `MODEL_DEFAULT` | `openai/gpt-oss-120b` |
| `MODEL_TOKEN_LIMIT_FIELD` | `max_completion_tokens` |
| `MODEL_API_KEY` | Your Groq API key, stored as a runtime Secret |

For an existing mock deployment, add and deploy the `MODEL_API_KEY` runtime Secret **before** deploying the Groq configuration. Keep the existing `ORCHESTRATOR_API_KEY`. A GitHub Actions secret does not automatically become a Cloudflare runtime secret. The Node server still defaults to mock when `MODEL_PROVIDER` is unset. The Workers `reasoning` mode remains unavailable until `MODEL_REASONING` is configured; the default GPT-OSS model can reason regardless of that routing label. Inference uses the existing 1,024-token completion budget, including reasoning tokens, so use a short prompt for the first connection test. Groq availability, model permissions and free-tier limits depend on your Groq account.

Groq references: [OpenAI compatibility](https://console.groq.com/docs/openai), [supported models](https://console.groq.com/docs/models), [token-limit parameter](https://console.groq.com/docs/api-reference).

Workers Free limits CPU time per request; awaiting an external model API is not CPU time, but JSON processing and local tools are. These tests verify runtime compatibility, not production CPU-budget compliance. This Worker uses no paid containers, databases, queues or Workers AI. External model providers can still charge for inference. The BootLoops tool runs in Node/Python and can also run in an internal Python Worker via the optional deployment described below. Without that service binding Cloudflare returns `503 bootloops_runtime_unavailable`.

References: [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/), [runtime secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Alternative Node hosting: Render

Create a Node web service from this repository. Build command: `node --version`. Start command: `npm start`. Set environment variables in Render, not in Git. Render provides `PORT`. Use `/health` as health-check path. This repository does not create or deploy a Render service automatically.

Keep the orchestrator key on the Debatt-AI backend, never in browser code. No CORS is enabled: this initial service is designed for backend-to-backend calls. Before public production use add per-user quotas/rate limiting and monitoring. Requests are limited to 32 KiB, messages to 8,000 characters, and completion to 1,024 tokens by default (4,096 for explicit research requests); upstream calls time out after 45 seconds. There is no persistent local state, retry loop or arbitrary code execution.

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

## BootLoops trial: exact rational reconstruction

The registered `bootloops_ratfit` tool executes BootLoops' **real, unmodified**
Ratfit `thiele_gate` module, vendored at commit
`66b680ce742e654cfe86da4f072a69061fe182b1` with its MIT license and a checked
SHA-256 fingerprint. This first trial covers one tool, not the entire toolkit.
See [upstream Ratfit](https://bootloops.ai/tools/ratfit.html) and
[provenance](vendor/bootloops/PROVENANCE.md).

Requires Linux with Python 3.12 and Node 24. No Python packages, new server,
AI credentials or model credits are needed for the test:

```sh
npm run test:bootloops
```

The CI workflow runs the `bootloops` job automatically on pushes and PRs.
It executes the actual Python code, checks a planted `(x+1)/(x+2)` function
against separately withheld exact values, checks a constant function, and
requires a deliberately corrupted holdout to fail. A local authenticated Node
HTTP test verifies the full transport-to-Python path. This test does not call
the deployed Cloudflare URL or Groq. Existing `npm test` remains Python-free,
so the Cloudflare build command can stay as configured.

Send the following to the **Node** server's authenticated `POST /v1/query`:

```json
{
  "tool": "bootloops_ratfit",
  "input": {
    "banked": [["0","1/2"],["1","2/3"],["2","3/4"],["3","4/5"],["6","7/8"],["7","8/9"]],
    "holdout": [["4","5/6"],["5","6/7"]]
  }
}
```

Every value must be an exact integer or fraction **string**; decimals,
floating-point JSON numbers, commands and code are rejected. `banked` has
4–12 points, `holdout` 2–8, each numerator/denominator at most 24 digits.
All x coordinates must be distinct across both sets, including equivalent
fractions. The fit uses at most eight banked points; other banked points and
all holdouts must match exactly. Input origins remain the caller's responsibility.

HTTP 200 means every held-out value matched. Changing `5/6` to `0` produces
HTTP 422 with `verification.status: "failed"`. Invalid data returns 400;
execution failures return a generic 502. Neither refusal nor unavailability
falls back to a model. Output includes provenance, continued-fraction depth,
checked/failed counts, plan and trace; it does not return an executable formula.
`exact_rational_holdout` verifies consistency with the supplied held-out data,
not the scientific truth of that data or a universal proof of the function.

The bridge uses a fixed Python script and standard-library rational arithmetic;
it accepts JSON on stdin and allows no expression evaluation, paths or shell
commands. The process inherits only PATH, has a five-second wall timeout,
four-second CPU cap, 256 MiB address-space cap and 16 KiB input/output bounds.
At most two tool processes can run concurrently per Node process. This is a
bounded tool adapter, not a general sandbox for arbitrary Python programs.

**Cloudflare deployment:** the JavaScript Worker uses a private service binding to
the separate Python Worker described below; it never starts a Python subprocess.
A deployment without that binding returns `503 bootloops_runtime_unavailable`
for valid tool requests. Groq, health and calculator routes do not require it.

## Connect BootLoops inside Cloudflare

`bootloops-worker/` is a Python Worker named **debatt-ai-bootloops**.
The orchestrator sends only validated exact samples over an internal HTTP
Service Binding called **BOOTLOOPS**. Authentication stays at the public
orchestrator boundary; neither its key nor the Groq key is forwarded.
The Python Worker has `workers_dev: false`, `preview_urls: false` and no
routes, so it is accessible only through a service binding on the same account.
Do not add a public domain or enable workers.dev for this service.

The Python bridge and Worker share `scripts/bootloops_core.py`. Preparation
copies this file and the fingerprint-checked upstream module into the bundle;
generated copies are ignored by Git. The Python Worker checks the source
fingerprint at initialization, validates data independently, limits its body
to 16 KiB while streaming, and returns 422 on a failed exact holdout.
It does not import the Node subprocess bridge or its Unix-only resource module.

The ordinary `wrangler.jsonc` stays usable before the Python service exists.
`wrangler.bootloops.jsonc` declares the optional binding and the same production
Groq settings. Deploy the Python Worker **first**, then switch the existing
orchestrator's deploy command to this configuration. This avoids breaking
automatic main deployments before the target Worker has been created.

### Deploy from the dashboard, using the same GitHub repo

After merging:

1. Create another Worker from **cryptomanxxx/debatt-ai-orchestrator**, name
   **debatt-ai-bootloops**, production branch **main**, repository root **/**.
2. Build command:
   `python3 -m pip install uv==0.12.19 && npm run check:bootloops:worker`
   Deploy command: `npm run deploy:bootloops:worker`.
   Disable preview builds. Cloudflare's build token is created by the GitHub
   integration; no model or orchestrator runtime secrets are needed here.
   Python 3.13 and Node 24 are required in the build image.
3. Wait for the Python deployment to succeed. Its configured public and preview
   URLs are disabled, so there is no Visit URL to test directly.
4. In the **existing debatt-ai-orchestrator** Worker, change its deploy command
   from `npm run deploy:workers` to **`npm run deploy:workers:bootloops`**.
   Keep the existing build command and runtime secrets. Trigger a new build
   from main. The repository configuration adds **BOOTLOOPS → debatt-ai-bootloops**.
   A dashboard-only binding can be removed by later Wrangler deployments;
   use the configured deploy command for every subsequent deployment.
5. In this repo's GitHub **Actions**, manually run **Testa BootLoops i Cloudflare**
   on main. It uses the existing ORCHESTRATOR_API_KEY repository secret.
   Expect 200 for the planted rational function, 422 for a corrupted holdout,
   and 401 without authentication. It makes no Groq calls and logs no inputs,
   raw responses or keys.

Local/CI checks require uv 0.12.19 and Node 24:

```sh
npm ci
npm run test:bootloops
npm run check:workers
npm run check:workers:bootloops
npm run check:bootloops:worker
npm run test:bootloops:worker
```

The `bootloops-worker` CI job builds the Python bundle with pinned
workers-py 1.17.6 and workers-runtime-sdk 1.9.2, runs its real Pyodide/workerd
server, checks positive and corrupted controls, and connects it to the
orchestrator bundle via Miniflare's service binding. This local integration
uses an HTTP transport between runtimes; the production binding stays internal.
The existing `test` and `bootloops` jobs cover API regressions and native Python.

**Free-plan check:** successful CI does not certify production CPU usage.
Workers Free allows 10 ms CPU per request. After the manual live test, inspect
the **Python Worker's Observability/Logs** CPU time and errors; logging is
enabled but the code never prints request bodies. Larger exact fractions or
more sample points may exceed the budget. No paid service is enabled by this
repository; validate usage before increasing input sizes. The subprocess's
Unix CPU/memory caps are replaced by Cloudflare's runtime limits in this path.

For development, run `npm run profile:bootloops` to profile a fixed public
positive fixture and check a corrupted holdout. It reports native Python
validation, fit and gate timings, plus a call profile; these are **not**
Cloudflare CPU measurements. The bridge parses bounded rational strings once
and sets upstream `probe=0` to skip duplicated lookahead evaluations. Upstream
still validates every banked point and gates every holdout. The pinned upstream
file is unchanged. `npm run test:bootloops` compares reports with the original
parser and default fit settings, including corrupted samples, poles, degeneracy
and input limits. After deploying both Workers, rerun **Testa BootLoops i
Cloudflare** and compare the Python Worker's CPU time with the earlier 23–26 ms
observations; an improvement or a successful test alone does not certify that
all allowed inputs stay below 10 ms.

### Measure the Python runtime separately

After **both** Workers have deployed the diagnostic routes, manually run the
GitHub workflow **Mät BootLoops steg i Cloudflare**. It uses the existing
`ORCHESTRATOR_API_KEY` secret and makes 15 sequential requests (three rounds,
varying stage order). No model calls, paid services or extra secrets are needed.
The public `POST /v1/diagnostics/bootloops` route requires the same Bearer key
and accepts only `{"stage":"transport|json|validate|fit|full"}` with one actual
stage name. It never accepts caller-provided samples, code or a repeat count.

Each request forwards the same fixed fixture body to a distinct internal path
`/v1/diagnostics/bootloops/{stage}`. All stages drain the bounded request body
and send a small JSON diagnostic marker; they do not report a verified tool result.

| Stage | Work added after draining the body |
|---|---|
| transport | Return the diagnostic marker |
| json | Decode JSON and compare with the fixed fixture |
| validate | Also validate and construct exact fractions |
| fit | Also reconstruct and validate all banked points |
| full | Run the normal compute function, including both holdout checks |

The workflow records stage names and UTC request timestamps, **not CPU time**.
In Cloudflare, open **debatt-ai-bootloops → Observability**, match the paths and
timestamps, and read `$workers.cpuTimeMs`. Confirm the `scriptVersion.id` matches
the newly deployed Python Worker (also shown in the GitHub Workers Builds check).
Compare the repeated readings for each stage. These totals include runtime,
transport, response and potentially startup costs. Different isolates, scheduling
and stage-control overhead make subtraction only an approximate comparison;
this is not a precise in-process CPU profiler. High transport readings would
suggest a runtime/transport floor; higher full readings would suggest additional
computation cost. The existing **Testa BootLoops i Cloudflare** workflow remains
the functional positive/corrupted/authentication test.

References: [Python Workers](https://developers.cloudflare.com/workers/languages/python/),
[Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/),
[build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
[CPU limits](https://developers.cloudflare.com/workers/platform/limits/).

## Token-limit compatibility

`MODEL_TOKEN_LIMIT_FIELD=auto` (default) sends `max_completion_tokens` to the official `api.openai.com` endpoint and recognised o-series model IDs such as `o3-mini`, including provider-prefixed IDs. Other compatible providers keep `max_tokens`. Set `MODEL_TOKEN_LIMIT_FIELD=max_completion_tokens` or `max_tokens` to override this selection for provider-specific aliases or requirements. An override applies to both configured models; automatic selection is based on the actual selected model ID. Exactly one limit field is sent. The default budget is 1,024 tokens. Authenticated model requests may explicitly set `completionTokenLimit: 4096`; only 1024 and 4096 are accepted. The research runner opts into 4096 and records/verifies the budget. For `max_completion_tokens` this budget includes hidden reasoning tokens as well as visible output, so it can run out before a visible answer is produced. No automatic retry or dynamic budget increase is performed.

Reference: [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).

## Oraklets forskningslabb

[Daglig automatisk forskning, experimentmeny och driftinstruktioner](research/README.md).
Forskningsmotorn använder befintlig Cloudflare-modell, Ratfit via API och
Rankscreen, Annihilator, Mixalot och Statsmodels i GitHub Actions. [Experimentkatalogen](research/EXPERIMENTS.md)
visar sju körbara experiment och lokal integrationsstatus för 49 BootLoops-paket samt externa verktyg.
[Hypotesprotokollen](research/HYPOTHESES.md) beskriver exakt rekonstruktion,
bayesiansk modelljämförelse och tidsserieprövning.
`catalog-only` i Actions visar katalogen utan modell eller databas. Motorn sparar rapporter
i AI-universitetets Supabase-tabell och kräver ingen PR för en ny körning.
