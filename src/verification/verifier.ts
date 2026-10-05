import { calculate } from '../tools/calculator.ts';
import type { ToolResult } from '../tools/registry.ts';
export type Verification = { status: 'passed' | 'failed' | 'not_verified';
  scope: 'arithmetic_consistency' | 'response_shape' | 'mock'; checks: string[];
  factualityChecked: false };
export function verify(answer: string, toolResult?: ToolResult, mock = false): Verification {
  if (mock) return { status: 'not_verified', scope: 'mock', checks: [], factualityChecked: false };
  if (toolResult) {
    let consistent = false;
    try { consistent = Number.isFinite(toolResult.value)
      && toolResult.value === calculate(toolResult.expression)
      && answer === String(toolResult.value); } catch { /* Reject invalid evidence. */ }
    return { status: consistent ? 'passed' : 'failed', scope: 'arithmetic_consistency',
      checks: ['finite_number', 'parser_replay', 'answer_matches_tool'], factualityChecked: false };
  }
  return { status: typeof answer === 'string' && !!answer.trim() ? 'passed' : 'failed',
    scope: 'response_shape', checks: ['nonempty_text'], factualityChecked: false };
}
