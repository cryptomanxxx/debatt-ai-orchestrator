import { randomUUID } from 'node:crypto';
import { routedCompletion } from './models/scientific-router.ts';
import type { CompletionTokenLimit } from './providers/openai.ts';
import { createPlan } from './planning/planner.ts';
import { executeTool } from './tools/registry.ts';
import type { ToolResult } from './tools/registry.ts';
import { verify } from './verification/verifier.ts';
import type { Config } from './config.ts';
import type { Mode } from './router.ts';
export async function orchestrate(message: string, mode: Mode, config: Config, completionTokenLimit: CompletionTokenLimit = 1024) {
  const plan = createPlan(message, mode, config);
  const action = plan.steps[0];
  const started = performance.now();
  let toolResult: ToolResult | undefined;
  let answer: string;
  let usedModel: string | null = action.kind === 'model' ? action.model : null;
  let usedProvider = action.kind === 'model' ? config.provider : 'local';
  let routing: {route: string; reason: string; attempts: number} | undefined;
  const mock = action.kind === 'model' && config.provider === 'mock';
  if (action.kind === 'tool') {
    toolResult = executeTool(action.tool, action.expression);
    answer = String(toolResult.value);
  } else {
    if (mock) answer = 'Testläge: förfrågan har passerat orchestratorn. Ingen AI-modell har anropats.';
    else {
      const outcome = await routedCompletion(action.message, mode, action.model, config, completionTokenLimit);
      answer = outcome.answer;
      usedModel = outcome.model;
      usedProvider = outcome.provider;
      routing = outcome.routing;
    }
  }
  const durationMs = Math.round(performance.now() - started);
  const verification = verify(answer, toolResult, mock);
  if (verification.status === 'failed') throw new Error('Verification failed');
  // Public plan omits the user's message/expression; never returns model secrets.
  return { id: randomUUID(), answer, model: usedModel,
    provider: usedProvider, mode, mock,
    ...(routing ? { routing } : {}),
    plan: { version: plan.version, strategy: plan.strategy, reason: plan.reason,
      steps: [{ kind: action.kind, ...(action.kind === 'tool' ? { tool: action.tool } : { model: usedModel }) }, { kind: 'verify' }] },
    trace: [{ step: 1, kind: action.kind, status: 'completed', durationMs },
      { step: 2, kind: 'verify', status: verification.status }],
    ...(toolResult ? { toolResult } : { inference: { completionTokenLimit } }), verification };
}
