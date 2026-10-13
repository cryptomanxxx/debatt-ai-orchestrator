import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { defaultModelProfile } from '../src/models/profile.ts';
import { executeQuery } from '../src/query.ts';
import { createApp } from '../src/server.ts';
const key='profile-test-key-at-least-24-characters';
const env={ORCHESTRATOR_API_KEY:key,MODEL_PROVIDER:'openai',MODEL_DEFAULT:'m',
  MODEL_API_KEY:'private-provider-key',MODEL_BASE_URL:'https://provider.example/v1'};
test('model fingerprint excludes secrets and changes with inference configuration',()=>{
  const config=loadConfig(env),profile=defaultModelProfile(config);
  assert.deepEqual(defaultModelProfile({...config,apiKey:'rotated',modelKey:'rotated'}),profile);
  for (const changed of [{defaultModel:'different'},{baseUrl:'https://another.example/v1'},{tokenLimitField:'max_tokens'}])
    assert.notEqual(defaultModelProfile({...config,...changed}).fingerprint,profile.fingerprint);
  assert.equal(profile.model,'m');assert.equal(profile.provider,'openai');
  assert.equal(profile.reasoningAvailable,false);
  const withReasoning=defaultModelProfile({...config,reasoningModel:'r'});
  assert.equal(withReasoning.reasoningAvailable,true);assert.equal(withReasoning.fingerprint,profile.fingerprint);
  assert.ok(!JSON.stringify(profile).includes('provider.example'));assert.ok(!JSON.stringify(profile).includes('private-provider-key'));
});
test('changed or invalid model fingerprints are rejected before upstream inference',async()=>{
  const config=loadConfig(env),original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected inference');};
  try {
    assert.equal((await executeQuery({message:'Analyze',expectedModelFingerprint:'a'.repeat(64)},config)).status,409);
    for (const request of [{expectedModelFingerprint:'invalid'}, {expectedModelFingerprint:null},
      {expectedModelFingerprint:defaultModelProfile(config).fingerprint,mode:'auto'}])
      assert.equal((await executeQuery({message:'Analyze',...request},config)).status,400);
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});
test('Node profile endpoint is authenticated, has no model call and forbids query strings',async()=>{
  const config=loadConfig(env),app=createApp(config);
  await new Promise<void>(resolve=>app.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${app.address().port}/v1/model-profile`;
  try {
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url+'?extra=1',{headers:{Authorization:'Bearer '+key}})).status,404);
    const response=await fetch(url,{headers:{Authorization:'Bearer '+key}});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.deepEqual(await response.json(),defaultModelProfile(config));
  } finally {await new Promise<void>(resolve=>app.close(()=>resolve()));}
});
