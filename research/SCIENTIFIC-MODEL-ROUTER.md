# Scientific Model Router v0.1

An **opt-in** two-provider router for Professor Oraklet. The existing default and
reasoning modes remain pinned to the original provider/model to preserve
experiment reproducibility. The auto mode can now use a different configured
OpenAI-compatible endpoint for longer prompts and retry a transient primary
failure (429/500/502/503/504) once through the secondary endpoint.

## Why this is not yet an intelligent learned router
This release does not know which model is scientifically "best": there are no
cross-model benchmark scorecards or learned decisions yet. It uses explicit
operator-supplied input-character limits (not token-count guarantees), route
availability and allowlisted transient errors. Character limits are a safety
heuristic, not a substitute for model-specific context-window tokenization.
No endpoint/provider is contacted until configured with its own secret.

## Cloudflare Worker configuration (example)
Existing primary:
- MODEL_PROVIDER=openai
- MODEL_BASE_URL=https://api.groq.com/openai/v1
- MODEL_DEFAULT=openai/gpt-oss-120b
- MODEL_API_KEY (existing Worker secret)

Add an independently configured provider:
- MODEL_SECONDARY_BASE_URL: HTTPS OpenAI-compatible API base ending in /v1
- MODEL_SECONDARY_NAME: exact model ID enabled on that provider
- MODEL_SECONDARY_API_KEY: **Worker secret**, never commit to source
- MODEL_SECONDARY_CONTEXT_CHARS: optional conservative limit, default 32000
- MODEL_SECONDARY_TOKEN_LIMIT_FIELD: auto, max_tokens or max_completion_tokens
- MODEL_PRIMARY_CONTEXT_CHARS: optional conservative primary limit, default 8000

Configure secrets in Cloudflare Workers (or via Wrangler secret management).
The secondary endpoint needs its own credentials and billing/quota access.
A model's real context window is provider-specific; verify it before selecting
the limits. The API's completion-token limit is still 1024 or 4096 and its
individual upstream request timeout remains 45 seconds.

## Behavior
- POST /v1/query with mode=auto: direct to primary if within the primary
  limit, otherwise to secondary if configured and within its declared limit.
  For transient primary HTTP failures, auto retries via secondary once.
- mode=default or reasoning: NEVER transparently fail over. Any input beyond
  the declared primary character limit is rejected; scientific runs retain
  their existing model-identity guarantees.
- Non-auto API requests preserve the 8000-character limit. Auto accepts
  up to 32000 characters only when a secondary provider is configured, and
  never above its conservative declared character limit.
- API responses name the actual provider/model used and include a route
  reason and number of attempts, but never expose keys or the secondary URL.
- The existing calculator handling and experiments remain unchanged.
- All results remain subject to existing response checking; fallback is not
  an independent factual verifier.

## Next iterations
Add a capability registry with verified context/tokenizer limits,
per-provider budgeting, observed latency, tool competence, held-out benchmark
scores and traceable science-specific selection. More than two providers,
model-specific pricing, provider-native APIs and verified context expansion
are **not** implemented in v0.1.
