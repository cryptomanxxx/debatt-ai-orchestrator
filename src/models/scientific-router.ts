import type { Config } from '../config.ts';
import { complete, ModelRequestError } from '../providers/openai.ts';
import type { CompletionTokenLimit } from '../providers/openai.ts';

// v0.1 uses explicit limits, not guessed provider context sizes.
export function chooseScientificRoute(message: string, mode: 'default' | 'reasoning' | 'auto', config: Config) {
  const secondaryReady = Boolean(config.secondaryBaseUrl && config.secondaryKey && config.secondaryModel);
  const longContext = message.length > config.primaryContextChars;
  if (longContext && mode === 'auto') {
    if (!secondaryReady || message.length > config.secondaryContextChars)
      throw new Error('context_capacity_unavailable');
    return { selected: 'secondary' as const, reason: 'primary_context_limit_exceeded', secondaryReady };
  }
  if (longContext) throw new Error('context_capacity_unavailable');
  return { selected: 'primary' as const, reason: 'configured_primary', secondaryReady };
}
function secondaryConfig(config: Config): Config {
  return { ...config, baseUrl: config.secondaryBaseUrl, modelKey: config.secondaryKey,
    tokenLimitField: config.secondaryTokenField };
}
function retriable(error: unknown) {
  return error instanceof ModelRequestError
    && error.code === 'model_upstream_http_error'
    && [429, 500, 502, 503, 504].includes(error.upstreamStatus ?? 0);
}
export async function routedCompletion(message: string, mode: 'default' | 'reasoning' | 'auto',
  primaryModel: string, config: Config, limit: CompletionTokenLimit,
  inference: typeof complete = complete) {
  const decision = chooseScientificRoute(message, mode, config);
  if (decision.selected === 'secondary') {
    const answer = await inference(message, config.secondaryModel, secondaryConfig(config), limit);
    return { answer, provider: 'openai-compatible-secondary', model: config.secondaryModel,
      routing: { route: 'secondary', reason: decision.reason, attempts: 1 } };
  }
  try {
    const answer = await inference(message, primaryModel, config, limit);
    return { answer, provider: config.provider, model: primaryModel,
      routing: { route: 'primary', reason: decision.reason, attempts: 1 } };
  } catch (error) {
    // Identity-locked default and reasoning modes never switch providers.
    // Auto may retry ONLY on an allowlisted transient upstream HTTP failure.
    if (mode !== 'auto' || !decision.secondaryReady || message.length > config.secondaryContextChars || !retriable(error))
      throw error;
    const answer = await inference(message, config.secondaryModel, secondaryConfig(config), limit);
    return { answer, provider: 'openai-compatible-secondary', model: config.secondaryModel,
      routing: { route: 'secondary', reason: 'primary_transient_failure', attempts: 2 } };
  }
}
