import type { Config } from '../config.ts';
export type CompletionTokenLimit = 1024 | 4096;
export class ModelRequestError extends Error {
  code: string;
  upstreamStatus?: number;
  constructor(code: 'model_upstream_http_error' | 'model_output_truncated' | 'model_empty_response'
    | 'model_invalid_response' | 'model_transport_error', upstreamStatus?: number) {
    super(code);
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}
export function tokenLimitParameter(model: string, config: Config) {
  if (config.tokenLimitField !== 'auto') return config.tokenLimitField;
  // Includes o1/o3/o4 variants, dated names and provider-prefixed model IDs.
  const modelName = model.split('/').at(-1) ?? model;
  return new URL(config.baseUrl).hostname === 'api.openai.com' || /^o\d+(?:-|$)/.test(modelName)
    ? 'max_completion_tokens' : 'max_tokens';
}
export async function complete(message: string, model: string, config: Config, completionTokenLimit: CompletionTokenLimit = 1024) {
  try {
    const response = await fetch(config.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.modelKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: message }],
        [tokenLimitParameter(model, config)]: completionTokenLimit })
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ModelRequestError('model_upstream_http_error', response.status);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new ModelRequestError('model_invalid_response'); }
    if (data?.choices?.[0]?.finish_reason === 'length') throw new ModelRequestError('model_output_truncated');
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new ModelRequestError('model_empty_response');
    return answer;
  } catch (error) {
    if (error instanceof ModelRequestError) throw error;
    throw new ModelRequestError('model_transport_error');
  }
}
