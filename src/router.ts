export { selectModel as route } from './models/registry.ts';
export type Mode = 'default' | 'reasoning' | 'auto';
// Conservative routing: only pure arithmetic or explicit calc:/räkna: commands.
export function arithmeticExpression(message: string): string | null {
  const explicit = /^(?:calc|räkna)\s*:\s*(.*)$/is.exec(message.trim());
  if (explicit) return explicit[1].trim();
  const text = message.trim();
  return /^[\d.\s()+*/-]+$/.test(text) && /\d/.test(text) ? text : null;
}
