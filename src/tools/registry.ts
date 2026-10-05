import { calculate } from './calculator.ts';
export type ToolResult = { tool: 'calculator'; expression: string; value: number };
// Only registered tools can execute. No user-defined names, URLs or shell commands.
export function executeTool(name: string, expression: string): ToolResult {
  if (name !== 'calculator') throw new Error('Unknown tool');
  return { tool: 'calculator', expression, value: calculate(expression) };
}
