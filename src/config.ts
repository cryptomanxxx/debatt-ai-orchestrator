export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const provider = env.MODEL_PROVIDER ?? 'mock';
  if (!['mock', 'openai'].includes(provider)) throw new Error('Invalid MODEL_PROVIDER');
  if (!env.ORCHESTRATOR_API_KEY || env.ORCHESTRATOR_API_KEY.length < 24)
    throw new Error('ORCHESTRATOR_API_KEY must contain at least 24 characters');
  const baseUrl = env.MODEL_BASE_URL ?? '';
  const tokenLimitField = env.MODEL_TOKEN_LIMIT_FIELD ?? 'auto';
  if (!['auto', 'max_tokens', 'max_completion_tokens'].includes(tokenLimitField))
    throw new Error('Invalid MODEL_TOKEN_LIMIT_FIELD');
  if (provider === 'openai') {
    if (!env.MODEL_API_KEY || !env.MODEL_DEFAULT) throw new Error('Missing model configuration');
    if (new URL(baseUrl).protocol !== 'https:') throw new Error('MODEL_BASE_URL must use HTTPS');
  }
  // Optional second OpenAI-compatible endpoint. All three settings are required;
  // keys remain Worker secrets and never appear in API profiles or reports.
  const secondaryValues = [env.MODEL_SECONDARY_BASE_URL, env.MODEL_SECONDARY_API_KEY, env.MODEL_SECONDARY_NAME];
  if (secondaryValues.some(Boolean) && !secondaryValues.every(Boolean))
    throw new Error('Incomplete secondary model configuration');
  const secondaryUrl = env.MODEL_SECONDARY_BASE_URL ?? '';
  if (secondaryUrl) {
    const parsed = new URL(secondaryUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
      throw new Error('Invalid secondary model URL');
  }
  const positiveLimit = (raw: string | undefined, fallback: number) => {
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1000 || n > 100000) throw new Error('Invalid context character limit');
    return n;
  };
  const primaryContextChars = positiveLimit(env.MODEL_PRIMARY_CONTEXT_CHARS, 8000);
  const secondaryContextChars = positiveLimit(env.MODEL_SECONDARY_CONTEXT_CHARS, 32000);
  const secondaryTokenField = env.MODEL_SECONDARY_TOKEN_LIMIT_FIELD ?? 'auto';
  if (!['auto','max_tokens','max_completion_tokens'].includes(secondaryTokenField))
    throw new Error('Invalid secondary token limit field');
  return { secondaryModel: env.MODEL_SECONDARY_NAME ?? '',
    secondaryBaseUrl: secondaryUrl, secondaryKey: env.MODEL_SECONDARY_API_KEY ?? '',
    secondaryTokenField, primaryContextChars, secondaryContextChars,
    provider, apiKey: env.ORCHESTRATOR_API_KEY, baseUrl, tokenLimitField,
    modelKey: env.MODEL_API_KEY ?? '', defaultModel: env.MODEL_DEFAULT ?? 'mock',
    reasoningModel: env.MODEL_REASONING ?? '' };
}
export type Config = ReturnType<typeof loadConfig>;
