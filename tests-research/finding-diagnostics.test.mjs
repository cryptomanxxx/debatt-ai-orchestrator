import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFindings} from '../research/literature-evidence.mjs';
const abstract='Method alpha compares sparse sensor observations. The reported result is 10 milliseconds. Validation with real observations remains future work.';
const method={kind:'method',claim:'Compare sparse observations.',quote:'Method alpha compares sparse sensor observations.'};
const inspect=f=>inspectFindings(JSON.stringify({findings:[f]}),abstract);
test('diagnostics distinguish format, types, lengths, exact quote and scientific-value changes',()=>{
  const cases=[
    [{...method,extra:'unsupported'},'invalid_finding_fields'],
    [{...method,kind:'novelty'},'invalid_finding_kind'],
    [{...method,claim:''},'invalid_claim'],
    [{...method,quote:10},'quote_not_string'],
    [{...method,quote:'short'},'quote_length_outside_bounds'],
    [{...method,quote:'x'.repeat(281)},'quote_length_outside_bounds'],
    [{...method,quote:'Null character in this quoted string\u0000.'},'quote_null_character'],
    [{...method,quote:'The reported result is 11 milliseconds.'},'quote_not_exact'],
    [{...method,quote:'Private invented model text not in the source.'},'quote_not_exact'],
  ];
  for(const [finding,reason] of cases) {
    const r=inspect(finding);assert.equal(r.findings.length,0);
    assert.deepEqual(r.validation.rejected,[{index:0,reason}]);
    assert.ok(!JSON.stringify(r).includes('Private invented'));
  }
});
test('whitespace variants are diagnosed and still rejected; no fuzzy or numerical quote repair',()=>{
  const text=abstract.replace('Method alpha','Method  alpha');
  const r=inspectFindings(JSON.stringify({findings:[method]}),text);
  assert.equal(r.findings.length,0);assert.equal(r.validation.rejected[0].reason,'quote_whitespace_variant');
  const exact={...method,quote:method.quote.replace('Method alpha','Method  alpha')};
  assert.equal(inspectFindings(JSON.stringify({findings:[exact]}),text).findings[0].quote,exact.quote);
});
test('limitation context errors are distinguished while exact supported findings retain their schema',()=>{
  const f={kind:'limitation',claim:'Validation remains.',quote:'Validation with real observations remains future work.',
    limitation_status:'remaining',context_quote:'Validation with real observations remains future work.'};
  assert.equal(inspect(f).findings[0].verification,'quote_match_only');
  for(const [change,reason] of [[{limitation_status:'proven'},'invalid_limitation_status'],
    [{context_quote:10},'context_quote_not_string'],[{context_quote:'short'},'context_quote_length_outside_bounds'],
    [{context_quote:'An invented context that is not in the source.'},'context_quote_not_exact']])
    assert.equal(inspect({...f,...change}).validation.rejected[0].reason,reason);
});
