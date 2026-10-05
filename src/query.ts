import type { Config } from './config.ts';
import type { Mode } from './router.ts';
import { CalculationError } from './tools/calculator.ts';
import { orchestrate } from './orchestrator.ts';

// Shared request validation and execution for the Node and Workers transports.
export async function executeQuery(input: unknown, config: Config) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { status: 400, data: { error: 'invalid_request' } };
  const { message, mode = 'default' } = input as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim() || message.length > 8000
    || typeof mode !== 'string' || !['default', 'reasoning', 'auto'].includes(mode))
    return { status: 400, data: { error: 'invalid_request' } };
  if (mode === 'reasoning' && config.provider !== 'mock' && !config.reasoningModel)
    return { status: 400, data: { error: 'reasoning_not_configured' } };
  try {
    return { status: 200, data: await orchestrate(message.trim(), mode as Mode, config) };
  } catch (error) {
    if (error instanceof CalculationError) return { status: 400, data: { error: error.message } };
    return { status: 502, data: { error: 'model_request_failed' } };
  }
}
