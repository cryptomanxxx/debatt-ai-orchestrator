import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleModels,withOptions,updateMenu} from '../research/update-scientific-model-menu.mjs';
const template=`name: scientific
      models:
        type: choice
        # BEGIN GENERATED BLABLADOR MODEL OPTIONS
        options:
          - REFRESH_MODEL_CATALOG_FIRST
        # END GENERATED BLABLADOR MODEL OPTIONS
      repeats:
        type: choice
`;
test('filters aliases and non-chat models without hardcoded defaults',()=>{
 assert.deepEqual(eligibleModels(['alias-fast','gpt-3.5-turbo','text-davinci-003',
  'text-embedding-ada-002','gpt-oss-anonymizer','faster-whisper-large-v3',
  'deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B']),
  ['deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B']);
});
test('only generated dropdown block is changed',()=>{
 const output=withOptions(template,['deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B']);
 assert.ok(output.includes('          - "deepseek-v4.1-flash-at-hzdr"')); 
 assert.ok(output.includes('          - "Qwen3.8-27B"'));
 assert.match(output,/      repeats:\n        type: choice/);
 assert.equal(withOptions(output,['deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B']),output);
 assert.throws(()=>withOptions('without markers',['model']),/markers/);
});
test('fails closed for missing, oversized and duplicate model catalogs',()=>{
 assert.throws(()=>eligibleModels(['alias-fast']),/1_to_25/);
 assert.throws(()=>eligibleModels(Array(26).fill(0).map((_,i)=>'model-'+i)),/1_to_25/);
 assert.throws(()=>eligibleModels(['qwen3','qwen3']),/duplicate/);
});
test('updates only fixed workflow on main using current SHA',async()=>{
 const calls=[];
 const fake=async(url,opts)=>{
  calls.push({url,opts});
  if(opts.method==='PUT')return {ok:true,status:200};
  return {ok:true,json:async()=>({sha:'original-sha',encoding:'base64',content:Buffer.from(template).toString('base64')})};
 };
 await updateMenu({catalog:{providers:{blablador:{status:'catalog_unverified',models:['Qwen3.8-27B']}}},
 repository:'example/repo',token:'mock-token',fetchImpl:fake});
 assert.equal(calls.length,2);
 assert.ok(calls[0].url.endsWith('/.github/workflows/blablador-scientific-v3.yml?ref=main'));
 const sent=JSON.parse(calls[1].opts.body);
 assert.equal(sent.branch,'main');assert.equal(sent.sha,'original-sha');
 assert.ok(!sent.content.includes('mock-token'));
});
test('does not attempt writes when credential is missing',async()=>{
 let calls=0;
 await assert.rejects(updateMenu({catalog:{providers:{blablador:{status:'catalog_unverified',models:['Qwen3.8-27B']}}},
 repository:'example/repo',token:'',fetchImpl:async()=>{calls++;}}),/credential/);
 assert.equal(calls,0);
});

test('retries one stale SHA conflict using a fresh read, without logging response bodies',async()=>{
 let reads=0,writes=0;
 const fake=async(_url,opts)=>{
  if(opts.method==='PUT'){
   writes++;
   return writes===1?{ok:false,status:409,json:async()=>({message:'Conflict'})}:{ok:true,status:200};
  }
  reads++;
  return {ok:true,json:async()=>({sha:'sha-'+reads,encoding:'base64',content:Buffer.from(template).toString('base64')})};
 };
 await updateMenu({catalog:{providers:{blablador:{status:'catalog_unverified',models:['Qwen3.8-27B']}}},
  repository:'example/repo',token:'test-token',fetchImpl:fake});
 assert.equal(reads,2);assert.equal(writes,2);
});
test('does not retry when GitHub rejects a protected branch',async()=>{
 let reads=0,writes=0;
 const fake=async(_url,opts)=>{
  if(opts.method==='PUT'){writes++;return {ok:false,status:409,json:async()=>({message:'Changes must be made through a pull request: protected branch'})};}
  reads++;return {ok:true,json:async()=>({sha:'sha',encoding:'base64',content:Buffer.from(template).toString('base64')})};
 };
 await assert.rejects(updateMenu({catalog:{providers:{blablador:{status:'catalog_unverified',models:['Qwen3.8-27B']}}},
  repository:'example/repo',token:'test-token',fetchImpl:fake}),/409_branch_protection_or_ruleset/);
 assert.equal(reads,1);assert.equal(writes,1);
});
