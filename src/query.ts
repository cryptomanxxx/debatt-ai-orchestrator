import type { Config } from './config.ts';
import type { Mode } from './router.ts';
import { CalculationError } from './tools/calculator.ts';
import { orchestrate } from './orchestrator.ts';
import { BOOTLOOPS_TOOL, validateRatfitInput, runBootLoops } from './tools/registry.ts';
import type { BootLoopsExecutor } from './tools/registry.ts';
import { BootLoopsInputError } from './tools/bootloops.ts';

// Shared request validation and execution for the Node and Workers transports.
export async function executeQuery(input: unknown, config: Config, bootloops?: BootLoopsExecutor) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { status: 400, data: { error: 'invalid_request' } };
  const request = input as Record<string, unknown>;
  if ('tool' in request) {
    if (request.tool !== BOOTLOOPS_TOOL || Object.keys(request).some(key => !['tool', 'input'].includes(key)))
      return { status: 400, data: { error: 'invalid_tool_request' } };
    try {
      const args = validateRatfitInput(request.input);
      if (!bootloops) return { status: 503, data: { error: 'bootloops_runtime_unavailable' } };
      const data = await runBootLoops(args, bootloops);
      return { status: data.toolResult.accepted ? 200 : 422, data };
    } catch (error) {
      return { status: error instanceof BootLoopsInputError ? 400 : 502,
        data: { error: error instanceof BootLoopsInputError ? 'invalid_bootloops_input' : 'bootloops_execution_failed' } };
    }
  }
  const { message, mode = 'default' } = request;
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
