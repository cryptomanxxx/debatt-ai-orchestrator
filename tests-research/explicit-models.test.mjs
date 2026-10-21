import test from 'node:test';
import assert from 'node:assert/strict';
import {explicitModels} from '../research/explicit-models.mjs';
test('filters aliases and non-chat models without hardcoded defaults',()=>{
 assert.deepEqual(explicitModels(['alias-fast','gpt-3.5-turbo','text-davinci-003',
  'text-embedding-ada-002','gpt-oss-anonymizer','faster-whisper-large-v3',
  'deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B','bad id','../x']),
  ['deepseek-v4.1-flash-at-hzdr','Qwen3.8-27B']);
});
test('fails closed for missing and duplicate model catalogs',()=>{
 assert.throws(()=>explicitModels(undefined),/invalid_model_catalog/);
 assert.throws(()=>explicitModels(['qwen3','qwen3']),/duplicate/);
 assert.deepEqual(explicitModels(['alias-fast']),[]);
});
