// Version history: dedupe, cap with named versions, branch archive, restore-as-new, diff and key numbers (real analysis of a real design).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, summarizeState, diffStates, changeSummary } from '../src/core/history.js';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';

test('push dedupes identical states and caps unnamed snapshots; named versions survive the cap', () => {
  const h = new History({ limit: 5 });
  const a = h.push({ x: 1 }, 'one'); assert.equal(h.push({ x: 1 }, 'same'), a); assert.equal(h.list().length, 1);
  h.name(a, 'Baseline');
  for (let i = 2; i <= 12; i++) h.push({ x: i }, `v${i}`);
  const l = h.list();
  assert.ok(l.length <= 6 && l.some((e) => e.name === 'Baseline'), 'named kept'); assert.ok(l.find((e) => e.current).label === 'v12');
  assert.equal(h.name(999, 'x'), false);
  h.name(a, ''); assert.equal(h.list().find((e) => e.n === a)?.name ?? null, null);
});

test('undo then a new change archives the redo branch; restoring a branch version is a new undoable step', () => {
  const h = new History();
  h.push({ x: 1 }, 'A'); const b = h.push({ x: 2 }, 'B'); h.push({ x: 3 }, 'C');
  h.undo(); h.undo();
  h.push({ x: 9 }, 'D');
  assert.ok(!h.list().some((e) => e.label === 'C'), 'C is not in the main list'); assert.ok(h.list({ branches: true }).some((e) => e.label === 'C' && e.branch), 'but it is kept as a branch');
  const before = h.list().length;
  const r = h.restoreAsNew(b); assert.deepEqual(r.state, { x: 2 }); assert.equal(h.list().length, before + 1);
  assert.equal(h.list().at(-1).meta.restoredFrom, b);
  const u = h.undo(); assert.deepEqual(u.state, { x: 9 }, 'restore can be undone');
  assert.ok(h.list({ branches: true }).some((e) => e.label === 'B' && e.branch) && h.list({ branches: true }).some((e) => e.label === 'C'), 'no version destroyed');
  assert.equal(h.restoreAsNew(12345), null);
  const again = History.fromJSON(JSON.parse(JSON.stringify(h))); assert.equal(again.list({ branches: true }).length, h.list({ branches: true }).length);
});

test('summary and diff of real designs come from the real analysis', async () => {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.send('Build me a two-stage rocket carrying a 100 kg space probe.'); await S.send('yes');
  const P = S.project, v1 = P.designState();
  const s = summarizeState(v1);
  assert.ok(s.mass > 1000 && s.deltaV > 5000 && s.twr > 1 && s.stages === 2 && s.payload > 0, JSON.stringify(s));
  const v = P.vehicle; const tank = v.components.find((c) => c.kind === 'fuel_tank');
  const removed = v.components.find((c) => c.kind === 'interstage');
  tank.propellantMass *= 0.5;
  v.components.splice(v.components.indexOf(removed), 1);
  const v2 = P.designState();
  const d = diffStates(v1, v2);
  assert.equal(d.parts.removed.length, 1); assert.equal(d.parts.changed.length, 1); assert.equal(d.parts.changed[0].props[0].prop, 'propellantMass');
  const dv = d.numbers.find((r) => r.key === 'deltaV'); assert.ok(dv.delta < 0);
  assert.match(changeSummary(v1, v2), /−1 part/); assert.equal(changeSummary(null, v1), 'First version'); assert.equal(diffStates(v1, v1).same, true);
});
