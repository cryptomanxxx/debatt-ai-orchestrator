import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCatalog,optionsFor,rewriteWorkflow,parseChoice,readFreshCatalog,PLACEHOLDER} from '../research/model-menu.mjs';

const template=`on:
  workflow_dispatch:
    inputs:
      model:
        type: choice
        # BEGIN GENERATED RESEARCH MODEL OPTIONS providers=hip,blablador
        options:
          - "${PLACEHOLDER}"
        # END GENERATED RESEARCH MODEL OPTIONS
      repeats:
        type: choice
        options: ['1', '2']
`;
const models={hip:['GLM-5.2-AWQ-INT4','Kimi-K2.6'],blablador:['Qwen3.8-27B']};

test('fresh catalog wins; failed provider keeps its previous snapshot',()=>{
 const fresh={providers:{hip:{status:'catalog_unverified',models:['Kimi-K2.6','alias-x','bge-reranker-v2-m3']},
  blablador:{status:'failed'}}};
 assert.deepEqual(mergeCatalog(fresh,{blablador:['Qwen3.8-27B','alias-fast']}),{
  models:{hip:['Kimi-K2.6'],blablador:['Qwen3.8-27B']},sources:{hip:'fresh',blablador:'previous_snapshot'}});
 assert.deepEqual(mergeCatalog(fresh).models.blablador,[]);
});
test('one menu entry carries provider and model; optional "alla" entry',()=>{
 assert.deepEqual(optionsFor(models,['hip','blablador'],false),
  ['hip / GLM-5.2-AWQ-INT4','hip / Kimi-K2.6','blablador / Qwen3.8-27B']);
 assert.deepEqual(optionsFor(models,['hip'],true),['hip / alla','hip / GLM-5.2-AWQ-INT4','hip / Kimi-K2.6']);
 assert.deepEqual(optionsFor({hip:[],blablador:[]},['hip'],true),[PLACEHOLDER]);
 assert.throws(()=>optionsFor(models,['openai'],false),/unknown_menu_provider/);
});
test('only the generated block changes and rewriting is idempotent',()=>{
 const {text,blocks}=rewriteWorkflow(template,models);
 assert.equal(blocks,1);
 assert.match(text,/        options:\n          - "hip \/ GLM-5.2-AWQ-INT4"\n          - "hip \/ Kimi-K2.6"\n          - "blablador \/ Qwen3.8-27B"\n        # END/);
 assert.equal(text.replace(/# BEGIN[^]*# END GENERATED RESEARCH MODEL OPTIONS/,''),
  template.replace(/# BEGIN[^]*# END GENERATED RESEARCH MODEL OPTIONS/,''));
 assert.equal(rewriteWorkflow(text,models).text,text);
 assert.equal(rewriteWorkflow('name: x\n',models).blocks,0);
});
test('malformed markers fail closed',()=>{
 const begin='        # BEGIN GENERATED RESEARCH MODEL OPTIONS providers=hip';
 const end='        # END GENERATED RESEARCH MODEL OPTIONS';
 assert.throws(()=>rewriteWorkflow(begin+'\n',models),/unterminated/);
 assert.throws(()=>rewriteWorkflow(end+'\n',models),/unmatched/);
 assert.throws(()=>rewriteWorkflow([begin,begin,end].join('\n'),models),/nested/);
});
test('parses menu choices strictly',()=>{
 assert.deepEqual(parseChoice('hip / GLM-5.2-AWQ-INT4'),{provider:'hip',model:'GLM-5.2-AWQ-INT4'});
 assert.deepEqual(parseChoice('blablador / alla'),{provider:'blablador',model:null});
 for(const bad of [PLACEHOLDER,'openai / gpt','hip / alias-fast','hip/GLM','hip / a b',''])
  assert.throws(()=>parseChoice(bad),/invalid_model_choice/);
});
test('missing discovery file falls back to the snapshot for every provider',async()=>{
 const missing=async()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});};
 const fresh=await readFreshCatalog('reports/provider-catalog/catalog.json',missing);
 assert.deepEqual(mergeCatalog(fresh,{hip:['Kimi-K2.6'],blablador:['Qwen3.8-27B']}),{
  models:{hip:['Kimi-K2.6'],blablador:['Qwen3.8-27B']},sources:{hip:'previous_snapshot',blablador:'previous_snapshot'}});
 await assert.rejects(readFreshCatalog('x',async()=>'{not json'),SyntaxError);
 await assert.rejects(readFreshCatalog('x',async()=>{throw Object.assign(Error('denied'),{code:'EACCES'});}),/denied/);
});
test('recommended entries come first, keep plain values, and become the default',()=>{
 const rec={hip:{model:'Kimi-K2.6',correct:9,attempts:10},blablador:{model:'Gone',correct:5,attempts:5}};
 assert.deepEqual(optionsFor(models,['hip','blablador'],true,rec),['hip / Kimi-K2.6 (rekommenderad 9/10)',
  'hip / alla','hip / GLM-5.2-AWQ-INT4','hip / Kimi-K2.6','blablador / alla','blablador / Qwen3.8-27B']);
 const {text}=rewriteWorkflow(template,models,rec);
 assert.match(text,/          - "blablador \/ Qwen3.8-27B"\n        default: "hip \/ Kimi-K2.6 \(rekommenderad 9\/10\)"\n        # END/);
 assert.equal(rewriteWorkflow(text,models,rec).text,text);
 assert.ok(!rewriteWorkflow(text,models,{}).text.includes('default:'));
 assert.deepEqual(parseChoice('hip / Kimi-K2.6 (rekommenderad 9/10)'),{provider:'hip',model:'Kimi-K2.6'});
 assert.throws(()=>parseChoice('hip / Kimi-K2.6 (rekommenderad)'),/invalid_model_choice/);
});
test('"all=N" drops the alla entry once a provider has more than N models',()=>{
 const block=n=>'        # BEGIN GENERATED RESEARCH MODEL OPTIONS providers=hip all='+n+'\n        # END GENERATED RESEARCH MODEL OPTIONS\n';
 assert.match(rewriteWorkflow(block(2),models).text,/"hip \/ alla"/);
 assert.doesNotMatch(rewriteWorkflow(block(1),models).text,/alla/);
 assert.deepEqual(optionsFor(models,['hip'],true,{},1),['hip / GLM-5.2-AWQ-INT4','hip / Kimi-K2.6']);
});
