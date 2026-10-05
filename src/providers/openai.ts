import type { Config } from '../config.ts';
export async function complete(message: string, model: string, config: Config) {
  const response = await fetch(config.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.modelKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], max_tokens: 1024 })
  });
  if (!response.ok) throw new Error('Model provider request failed');
  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('Invalid model response');
  return answer;
}
