// Test bench (2.0): every one-click example is flown in the real simulator and gets the verdict it advertises, with a plain reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, testExample, exampleCard } from '../src/core/testbench.js';

test('test bench: every example flies and gets the expected PASS or FAIL with a plain reason', { timeout: 300000 }, async () => {
  for (const E of EXAMPLES) {
    const r = await testExample(E.id);
    assert.equal(r.pass, E.expect === 'pass', `${E.id}: ${r.headline} - ${r.reason} (${r.why})`);
    assert.ok(r.reason && r.reason.split(' ').length <= 30 && !/undefined|NaN/.test(r.reason), `${E.id}: ${r.reason}`);
    assert.ok(r.facts.length >= 1, E.id);
    const c = exampleCard(E.id); assert.ok(c.title && c.blurb && c.goal, E.id);
  }
});
