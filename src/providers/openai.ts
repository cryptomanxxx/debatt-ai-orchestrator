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
// Transient upstream statuses are retried within a deadline that keeps the whole call under the
// research runner's 55 s client timeout. Timeouts and transport errors are not retried: the
// provider may already have run (and billed) that request.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
export const modelRetry = { attempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, deadlineMs: 50000, minAttemptMs: 10000 };
function retryDelay(response: Response, attempt: number) {
  const header = response.headers.get('Retry-After');
  const seconds = header && /^\d{1,4}$/.test(header.trim()) ? Number(header) * 1000 : 0;
  return Math.min(Math.max(modelRetry.baseDelayMs * 2 ** (attempt - 1), seconds), modelRetry.maxDelayMs);
}
export async function complete(message: string, model: string, config: Config, completionTokenLimit: CompletionTokenLimit = 1024) {
  const deadline = Date.now() + modelRetry.deadlineMs;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(config.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(Math.min(45000, Math.max(1, deadline - Date.now()))),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.modelKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: message }],
          [tokenLimitParameter(model, config)]: completionTokenLimit })
      });
      if (!response.ok) {
        await response.body?.cancel();
        const delay = retryDelay(response, attempt);
        if (RETRYABLE_STATUSES.has(response.status) && attempt < modelRetry.attempts
          && Date.now() + delay + modelRetry.minAttemptMs <= deadline) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
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
}
