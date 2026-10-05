import { arithmeticExpression, route } from '../router.ts';
import type { Mode } from '../router.ts';
import type { Config } from '../config.ts';
export type Action = { kind: 'tool'; tool: 'calculator'; expression: string }
  | { kind: 'model'; model: string; message: string };
export type Plan = { version: 1; strategy: 'arithmetic' | 'direct'; reason: string;
  steps: [Action, { kind: 'verify' }] };
export function createPlan(message: string, mode: Mode, config: Config): Plan {
  const expression = mode === 'auto' ? arithmeticExpression(message) : null;
  if (expression !== null) return { version: 1, strategy: 'arithmetic',
    reason: 'Recognised arithmetic; use a deterministic tool without model calls.',
    steps: [{ kind: 'tool', tool: 'calculator', expression }, { kind: 'verify' }] };
  return { version: 1, strategy: 'direct', reason: mode === 'reasoning'
    ? 'Caller selected the reasoning model.' : 'Use the default model for language tasks.',
    steps: [{ kind: 'model', model: route(mode === 'reasoning' ? 'reasoning' : 'default', config), message }, { kind: 'verify' }] };
}
