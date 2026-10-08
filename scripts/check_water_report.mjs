import {readFileSync} from 'node:fs';
import {validateWater} from '../research/shallow-water.mjs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(report.experimentId!=='shallow-water-hybrid'||!Array.isArray(report.cases)||report.cases.length>3)throw new Error('Invalid report');
for(const c of report.cases) {
  validateWater({...c.evidence,result:c.hypothesisTest.measured},c.data);
}
