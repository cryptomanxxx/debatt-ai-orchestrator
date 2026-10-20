# HIP and Blablador inference through the Oraklet Cloudflare Worker

This PR adds an **opt-in** `POST /v1/research/inference` route to the existing `debatt-ai-orchestrator` Worker. It uses the **existing** `ORCHESTRATOR_API_KEY` bearer authorization, JSON content-type and 32 KiB request limit. It does not change `/v1/query`, the scheduled research workflow, Cloudflare configuration, or existing model credentials.

After review and deployment, set `HIP_API_KEY` and `BLABLADOR_API_KEY` as **Cloudflare Worker Secrets** under `debatt-ai-orchestrator`, never as plain `vars` or in source control. Each request selects exactly one provider and one allowlisted model. The Worker sends a single OpenAI-compatible completion with a strict 512-token output request, 45-second timeout, bounded response, no redirects, no retries, no cross-provider fallback and no tool execution. Only a bounded textual response is returned. The response marks scientific verification and immutable backend verification **false**; these are not a research result.

Example authenticated JSON input:

```json
{"provider":"hip","model":"GLM-5.2-AWQ-INT4","prompt":"Find the roots of x² - 5x + 6 = 0."}
```

HIP: `GLM-5.2-AWQ-INT4`, `Mistral-Medium-3.5-128B`. Blablador: `alias-fast`, `alias-glm-5.3-flash`. Responses must report the exact requested model ID; providers whose aliases return a different ID fail closed until a separately reviewed, auditable resolved-model policy is introduced.

## Deployment gates

1. Obtain CI and Codex approval, merge, deploy the Worker via the repo's existing deployment process.
2. Add secrets in the Cloudflare dashboard to the `debatt-ai-orchestrator` Worker. Keep existing `MODEL_API_KEY` and Groq model configuration.
3. Run a bounded authenticated request for one model per provider; inspect failure diagnostics without exposing keys.
4. In a **separate PR**, build an opt-in GitHub Actions client which uses the existing `ORCHESTRATOR_API_KEY` to call the new endpoint and runs the independent SymPy verifier. Keep existing HIP/Blablador GitHub Environment Secrets until this route is proven.
5. Only after end-to-end validation consider migrating daily research and deleting duplicate long-lived provider credentials from GitHub. A shared bearer key remains a security tradeoff; consider GitHub OIDC and task-specific rate limits before exposing scheduled or untrusted agents.

This is not a generalized model proxy or an assertion that the two providers' service availability is guaranteed. Check API grants, quotas and provider-specific model IDs before enabling it.
