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
      models:['alias-fast','some/model-1'],modelCount:2,backendIdentityVerified:false});
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
    Response.json({data:[{id:'x'.repeat(130)}]}),
    Response.json({data:Array.from({length:201},(_,i)=>({id:'model-'+i}))}),
    new Response('x'.repeat(70000),{status:200}),
    Response.json({data:'bad'})
  ];
  for(const response of badResponses){
    const result=await discoverResearchModels('hip',keys,(async()=>response) as typeof fetch);
    assert.notEqual(result.status,200);
    assert.ok(!JSON.stringify(result).includes(keys.HIP_API_KEY));
  }
});
