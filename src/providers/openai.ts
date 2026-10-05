import type { Config } from '../config.ts';
export function tokenLimitParameter(model: string, config: Config) {
  if (config.tokenLimitField !== 'auto') return config.tokenLimitField;
  // Includes o1/o3/o4 variants, dated names and provider-prefixed model IDs.
  const modelName = model.split('/').at(-1) ?? model;
  return new URL(config.baseUrl).hostname === 'api.openai.com' || /^o\d+(?:-|$)/.test(modelName)
    ? 'max_completion_tokens' : 'max_tokens';
}
export async function complete(message: string, model: string, config: Config) {
  const response = await fetch(config.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.modelKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }],
      [tokenLimitParameter(model, config)]: 1024 })
  });
  if (!response.ok) throw new Error('Model provider request failed');
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Invalid model response');
  return answer;
}
