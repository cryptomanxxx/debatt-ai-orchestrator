import type { Config } from './config.ts';
export function route(mode: 'default' | 'reasoning', config: Config) {
  if (mode === 'reasoning' && !config.reasoningModel && config.provider !== 'mock')
    throw new Error('Reasoning model is not configured');
  return mode === 'reasoning' ? (config.reasoningModel || 'mock') : config.defaultModel;
}
