export function loadConfig(env = process.env) {
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
  return { provider, apiKey: env.ORCHESTRATOR_API_KEY, baseUrl, tokenLimitField,
    modelKey: env.MODEL_API_KEY ?? '', defaultModel: env.MODEL_DEFAULT ?? 'mock',
    reasoningModel: env.MODEL_REASONING ?? '' };
}
export type Config = ReturnType<typeof loadConfig>;
