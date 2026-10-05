import type { Config } from '../config.ts';
export function selectModel(mode: 'default' | 'reasoning', config: Config) {
  if (mode === 'reasoning' && !config.reasoningModel && config.provider !== 'mock')
    throw new Error('Reasoning model is not configured');
  if (config.provider === 'mock') return 'mock';
  return mode === 'reasoning' ? config.reasoningModel : config.defaultModel;
}
