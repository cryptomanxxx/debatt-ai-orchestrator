import { randomUUID } from 'node:crypto';
import { route } from './router.ts';
import { complete } from './providers/openai.ts';
import type { Config } from './config.ts';
export async function orchestrate(message: string, mode: 'default' | 'reasoning', config: Config) {
  const model = route(mode, config);
  const answer = config.provider === 'mock'
    ? 'Testläge: förfrågan har passerat orchestratorn. Ingen AI-modell har anropats.'
    : await complete(message, model, config);
  return { id: randomUUID(), answer, model, provider: config.provider, mode,
    mock: config.provider === 'mock' };
}
