import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const path of ['wrangler.jsonc', 'wrangler.bootloops.jsonc']) {
  test(`${path} persists safe production invocation logs`, () => {
    const config=JSON.parse(readFileSync(path,'utf8'));
    assert.equal(config.name,'debatt-ai-orchestrator');
    assert.equal(config.observability?.logs?.enabled,true);
    assert.equal(config.observability?.logs?.head_sampling_rate,1);
    assert.equal(config.observability?.logs?.invocation_logs,true);
    assert.equal(config.observability?.logs?.persist,true);
    assert.equal(config.observability?.traces?.enabled,false);
  });
}
