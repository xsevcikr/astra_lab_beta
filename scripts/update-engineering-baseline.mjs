// Re-approve the regression baseline after an intentional physics change: node scripts/update-engineering-baseline.mjs
import { writeFileSync } from 'node:fs';
import { regressionOutputs } from '../src/engineering/vv/regression.js';
const out = regressionOutputs();
writeFileSync(new URL('../src/engineering/vv/baseline.json', import.meta.url), JSON.stringify({ approved: new Date().toISOString(), values: out }, null, 2));
console.log('baseline written', out);
