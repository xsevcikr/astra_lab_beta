import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BENCHMARKS, runBenchmark } from '../src/engineering/vv/benchmarks.js';
import { regressionOutputs } from '../src/engineering/vv/regression.js';

for (const b of BENCHMARKS) {
  test(`V&V ${b.category}: ${b.name}`, () => {
    const r = runBenchmark(b);
    assert.equal(r.status, 'PASS', r.error || JSON.stringify(r.checks.filter((c) => c.status !== 'PASS')));
  });
}

test('regression: nominal outputs match the approved baseline', () => {
  const base = JSON.parse(readFileSync(new URL('../src/engineering/vv/baseline.json', import.meta.url))).values;
  const now = regressionOutputs();
  for (const [k, v] of Object.entries(base)) {
    const tol = Math.max(1e-9, Math.abs(v) * 1e-6);
    assert.ok(Math.abs(now[k] - v) <= tol, `${k}: baseline ${v}, now ${now[k]}`);
  }
});
