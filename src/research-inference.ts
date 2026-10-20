// Dedicated, bounded research inference; deliberately independent of /v1/query.
export type ResearchKeys = { HIP_API_KEY?: string; BLABLADOR_API_KEY?: string };
const PROVIDERS = {
  hip: { base: 'https://llm-service.ai.tu-darmstadt.de/v1', key: 'HIP_API_KEY', models: ['GLM-5.2-AWQ-INT4', 'Mistral-Medium-3.5-128B'] },
  blablador: { base: 'https://api.blablador.fz-juelich.de/v1', key: 'BLABLADOR_API_KEY', models: ['alias-fast', 'alias-glm-5.3-flash'] }
} as const;
const MAX_RESPONSE_BYTES = 65536;
export async function researchInference(input: unknown, keys: ResearchKeys, transport: typeof fetch = fetch) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 400, data: { error: 'invalid_request' } };
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(k => !['provider', 'model', 'prompt'].includes(k)) ||
      typeof body.provider !== 'string' || !Object.hasOwn(PROVIDERS, body.provider) ||
      typeof body.model !== 'string' || typeof body.prompt !== 'string' ||
      !body.prompt.trim() || body.prompt.length > 4000)
    return { status: 400, data: { error: 'invalid_request' } };
  const provider = body.provider as keyof typeof PROVIDERS;
  const profile = PROVIDERS[provider];
  if (!(profile.models as readonly string[]).includes(body.model)) return { status: 400, data: { error: 'model_not_allowed' } };
  const key = keys[profile.key];
  if (!key || key.length < 8) return { status: 503, data: { error: 'research_provider_not_configured' } };
  try {
    const response = await transport(profile.base + '/chat/completions', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(45000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: [{ role: 'user', content: body.prompt }], max_tokens: 512, temperature: 0 })
    });
    if (!response.ok) { await response.body?.cancel(); return { status: 502, data: { error: 'research_upstream_failed' } }; }
    const reader = response.body?.getReader();
    if (!reader) return { status: 502, data: { error: 'research_invalid_response' } };
    let total = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); return { status: 502, data: { error: 'research_invalid_response' } }; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(chunks.flatMap(chunk => Array.from(chunk))));
    const result = JSON.parse(text);
    const answer = result?.choices?.[0]?.message?.content;
    if (result?.choices?.[0]?.finish_reason !== 'stop' || typeof answer !== 'string' ||
        !answer.trim() || answer.length > 16000 || answer.includes(key) || result.model !== body.model)
      return { status: 502, data: { error: 'research_invalid_response' } };
    return { status: 200, data: { status: 'completed_unverified', provider, model: body.model, answer, scientificallyVerified: false, backendIdentityVerified: false } };
  } catch {
    return { status: 502, data: { error: 'research_upstream_failed' } };
  }
}
