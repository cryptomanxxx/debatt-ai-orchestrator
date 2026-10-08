// Public diagnostics contain fixed codes and bounded metadata, never raw errors.
const codes = new Set(['unexpected_error', 'model_http_error', 'model_transport_error',
  'tool_http_error', 'tool_transport_error', 'invalid_tool_evidence', 'invalid_model_proposal',
  'invalid_model_response', 'model_changed', 'invalid_plan', 'invalid_seed', 'duplicate_plan',
  'model_budget_exceeded', 'tool_budget_exceeded', 'model_upstream_http_error',
  'model_output_truncated', 'model_empty_response', 'model_invalid_response', 'model_budget_not_applied']);
export class ResearchError extends Error {
  constructor(code, context = {}) {
    super(codes.has(code) ? code : 'unexpected_error');
    this.diagnostic = { code: this.message };
    if (Number.isInteger(context.httpStatus) && context.httpStatus >= 100 && context.httpStatus <= 599)
      this.diagnostic.httpStatus = context.httpStatus;
    if (Number.isInteger(context.upstreamStatus) && context.upstreamStatus >= 100 && context.upstreamStatus <= 599)
      this.diagnostic.upstreamStatus = context.upstreamStatus;
    if (Number.isInteger(context.case) && context.case >= 1 && context.case <= 3)
      this.diagnostic.case = context.case;
    if (['initial_proposal', 'correction', 'positive_control', 'negative_control'].includes(context.operation))
      this.diagnostic.operation = context.operation;
  }
}
export function diagnostic(error, context = {}) {
  return new ResearchError(error instanceof ResearchError ? error.message : 'unexpected_error',
    { ...(error instanceof ResearchError ? error.diagnostic : {}), ...context }).diagnostic;
}
