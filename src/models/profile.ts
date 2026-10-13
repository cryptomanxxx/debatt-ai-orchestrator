import { createHash } from 'node:crypto';
import type { Config } from '../config.ts';

// Increment when inference behavior changes in ways not represented by config.
export function defaultModelProfile(config: Config) {
  const fingerprint = createHash('sha256').update(JSON.stringify({
    contract: 'default-inference-1', provider: config.provider, model: config.defaultModel,
    baseUrl: config.baseUrl, tokenLimitField: config.tokenLimitField,
  })).digest('hex');
  // reasoningAvailable tells planners whether mode 'reasoning' can be requested; it is not part of
  // the default-model fingerprint, which only guards default-mode calls.
  return { provider: config.provider, model: config.defaultModel, fingerprint,
    mode: 'default', completionTokenLimit: 4096,
    reasoningAvailable: config.provider === 'mock' || Boolean(config.reasoningModel) };
}
