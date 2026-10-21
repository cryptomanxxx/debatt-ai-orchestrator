import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverResearchModels} from '../src/research-model-catalog.ts';
const keys={HIP_API_KEY:'not-a-real-hip-secret-123',BLABLADOR_API_KEY:'not-a-real-blablador-secret-456'};
test('two hardcoded authenticated HTTPS catalogs, no arbitrary URLs',async()=>{
  for(const [provider,base,secret] of [
    ['hip','https://llm-service.ai.tu-darmstadt.de/v1/models',keys.HIP_API_KEY],
    ['blablador','https://api.blablador.fz-juelich.de/v1/models',keys.BLABLADOR_API_KEY]
  ]){
    let calls=0;
    const result=await discoverResearchModels(provider,keys,(async(url,init)=>{
      calls++;
      assert.equal(url,base);
      assert.equal(init?.method,'GET');
      assert.equal(init?.redirect,'manual');
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+secret);
      return Response.json({data:[{id:'some/model-1'},{id:'alias-fast'},{id:'alias-fast'}]});
    }) as typeof fetch);
    assert.equal(calls,1);
    assert.deepEqual(result.data,{status:'catalog_unverified',provider,
      models:['alias-fast','some/model-1'],modelCount:2,backendIdentityVerified:false,aliases:{}});
  }
});
test('rejects provider injection and missing credentials before fetch',async()=>{
  const noFetch=async()=>{throw Error('unexpected network');};
  assert.equal((await discoverResearchModels('toString',keys,noFetch as typeof fetch)).status,400);
  assert.equal((await discoverResearchModels('hip',{},noFetch as typeof fetch)).status,503);
});
test('does not leak upstream credentials, response bodies, or untrusted IDs',async()=>{
  const badResponses=[
    Response.json({error:keys.HIP_API_KEY},{status:401}),
    Response.json({data:[{id:keys.HIP_API_KEY}]}),
    Response.json({data:[{id:'evil\nheader'}]}),
    Response.json({data:[{id:'x'.repeat(201)}]}),
    Response.json({data:Array.from({length:501},(_,i)=>({id:'model-'+i}))}),
    new Response('x'.repeat(70000),{status:200}),
    Response.json({data:'bad'})
  ];
  for(const response of badResponses){
    const result=await discoverResearchModels('hip',keys,(async()=>response) as typeof fetch);
    assert.notEqual(result.status,200);
    assert.ok(!JSON.stringify(result).includes(keys.HIP_API_KEY));
  }
});

test('mixed catalogs retain valid models and discard invalid entries without leaks',async()=>{
  const response=Response.json({data:[
    {id:'alias-kimi-k3-1m'},null,{id:'bad\\nheader'}, {id:keys.BLABLADOR_API_KEY},
    {id:'alias-fast'}, {id:'GPT OSS with spaces'}, {irrelevant:true},
    {id:'alias-fast'}, {id:'long-id-'+ 'x'.repeat(220)}
  ]});
  const result=await discoverResearchModels('blablador',keys,(async()=>response) as typeof fetch);
  assert.equal(result.status,200);
  assert.deepEqual(result.data.models,['alias-fast','alias-kimi-k3-1m']);
  assert.ok(!JSON.stringify(result.data).includes(keys.BLABLADOR_API_KEY));
});
test('valid 200-character model ID is supported; excessive output model count is refused',async()=>{
  const valid='m'+'x'.repeat(199);
  const ok=await discoverResearchModels('hip',keys,(async()=>Response.json({data:[{id:valid}]})) as typeof fetch);
  assert.equal(ok.status,200);
  const tooMany=await discoverResearchModels('hip',keys,(async()=>Response.json({data:
    Array.from({length:201},(_,i)=>({id:'m'+i}))})) as typeof fetch);
  assert.equal(tooMany.status,502);
});

test('exports alias roots but keeps display-name roots internal',async()=>{
  const response=Response.json({data:[
    {id:'01 - GPT-OSS-120b - an open model',root:'openai/gpt-oss-120b'},
    {id:'alias-fast',root:'openai/gpt-oss-120b'},
    {id:'alias-default',root:'None'},
    {id:'alias-bad',root:'evil root'},
    {id:'alias-secret',root:keys.BLABLADOR_API_KEY},
    {id:'__proto__',root:'polluted/root'},
    {id:'deepseek-v4.1-flash-at-hzdr',root:'None'}
  ]});
  const result:any=await discoverResearchModels('blablador',keys,(async()=>response) as typeof fetch);
  assert.equal(result.status,200);
  assert.deepEqual(result.data.aliases,{'alias-fast':'openai/gpt-oss-120b'});
  assert.equal(result.roots.get('01 - GPT-OSS-120b - an open model'),'openai/gpt-oss-120b');
  assert.equal(result.roots.get('__proto__'),'polluted/root');
  assert.equal(({} as any).polluted,undefined);
  assert.ok(!JSON.stringify(result.data).includes('01 - GPT'));
  assert.ok(!JSON.stringify(result).includes(keys.BLABLADOR_API_KEY));
});
