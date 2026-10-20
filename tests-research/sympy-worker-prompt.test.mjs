import test from 'node:test';
import assert from 'node:assert/strict';
import {sympyWorkerPrompt,SYMPY_WORKER_PROMPT_VERSION} from '../research/sympy-worker-prompt.mjs';
import {makeSympyCases,parseSympyProposal} from '../research/sympy.mjs';
test('same seeded scientific coefficients, explicit JSON-only contract, no answer leakage',()=>{
 const cases=[...makeSympyCases('20261020'),...makeSympyCases('27')];
 assert.equal(SYMPY_WORKER_PROMPT_VERSION,'sympy-worker-json-v2');
 for(const f of cases){
  const prompt=sympyWorkerPrompt([{role:'system',content:'fixed experiment'},
    {role:'user',content:JSON.stringify({protocol:{id:'exact-quadratic-v1'},coefficients:f.input.coefficients})}]);
  assert.ok(prompt.includes(JSON.stringify(f.input.coefficients)));
  assert.ok(prompt.includes('"method", "roots", "reason"'));
  assert.ok(prompt.includes('utan kodblock'));
  assert.ok(prompt.length<4000);
  assert.ok(prompt.split(String.fromCharCode(10)).length>4);
  assert.ok(!prompt.includes(f.commitment));
  if (f.truth.roots.length > 0) assert.ok(!prompt.includes(JSON.stringify(f.truth.roots)));
  // The empty roots array [] is an essential formatting instruction, not a leaked answer.
  assert.ok(!prompt.includes('"roots":["-2","1/2"]'));
 }
});
test('strict verifier format remains enforced',()=>{
 assert.ok(parseSympyProposal('{"method":"sympy","roots":["2","3"],"reason":"Rötter."}'));
 assert.equal(parseSympyProposal('Här är svaret: {"method":"sympy","roots":["2","3"],"reason":"Rötter."}'),null);
 assert.equal(parseSympyProposal('```json\n{"method":"sympy","roots":["2","3"],"reason":"Rötter."}\n```'),null);
});
test('malformed or unexpected experiment input fails closed',()=>{
 for(const messages of [[],[{role:'user',content:'{}'}],
  [{role:'system',content:''},{role:'user',content:'not JSON'}],
  [{role:'system',content:''},{role:'user',content:JSON.stringify({protocol:{id:'exact-quadratic-v1'},coefficients:['1','2','3'],extra:'x'})}],
 ]){assert.throws(()=>sympyWorkerPrompt(messages),/invalid_sympy_messages/);}
});
