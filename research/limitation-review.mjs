// Conservative English abstract cue detection, not semantic verification.
// A reported response is not proof that the limitation was solved.
const RESPONSE = /\b(?:leading to (?:the )?proposal of|(?:we|this (?:work|paper|study)|the authors)\s+(?:propose|introduce|develop|address|correct|resolve)|(?:proposed|introduced|developed)\s+(?:method|approach|framework|solution)|to (?:correct|address|resolve|overcome|mitigate))\b/i;

export function reportedResponse(finding) {
  if (finding?.kind !== 'limitation') return null;
  const text = [finding.context_quote, finding.quote].filter(v => typeof v === 'string');
  for (const excerpt of text) {
    const match = RESPONSE.exec(excerpt);
    if (match) return {context:excerpt,solution_seed:excerpt.slice(match.index),
      assessment:'reported_response_requires_review'};
  }
  return null;
}

export function effectiveLimitationStatus(finding) {
  if (finding?.limitation_status === 'remaining' && reportedResponse(finding)) return 'unclear';
  return finding?.limitation_status ?? 'unclear';
}
