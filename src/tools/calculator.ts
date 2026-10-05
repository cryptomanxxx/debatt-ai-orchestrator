/** Bounded arithmetic parser. Never evaluates JavaScript or model-generated code. */
export class CalculationError extends Error {}
export function calculate(expression: string): number {
  if (!expression.trim() || expression.length > 512) throw new CalculationError('invalid_expression');
  const tokens: string[] = [];
  let rest = expression.trim();
  while (rest) {
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)|^[()+*/-]/.exec(rest);
    if (!match) throw new CalculationError('invalid_expression');
    tokens.push(match[0]);
    if (tokens.length > 256) throw new CalculationError('expression_too_complex');
    rest = rest.slice(match[0].length).trimStart();
  }
  let pos = 0;
  function atom(depth: number): number {
    if (depth > 32) throw new CalculationError('expression_too_complex');
    const token = tokens[pos++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom(depth + 1);
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[pos++] !== ')') throw new CalculationError('invalid_expression');
      return value;
    }
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new CalculationError('invalid_expression');
    return Number(token);
  }
  function product(depth: number): number {
    let value = atom(depth);
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const right = atom(depth);
      if (op === '/' && right === 0) throw new CalculationError('division_by_zero');
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }
  function sum(depth: number): number {
    let value = product(depth);
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const right = product(depth);
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = sum(0);
  if (pos !== tokens.length) throw new CalculationError('invalid_expression');
  if (!Number.isFinite(result)) throw new CalculationError('non_finite_result');
  return result;
}
