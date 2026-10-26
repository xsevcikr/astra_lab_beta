// "What is still missing?" checks: every broken design is reported in plain words, every offered fix really works (through the tool API), and the fixed design flies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { launchNeeds, launchChecklist, applyNeedFix, runNeeds } from '../src/core/needs.js';

async function rocket() {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.send('Build me a two-stage rocket carrying a 100 kg space probe.'); await S.send('yes');
  return S;
}
const restore = (v, snap) => { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, JSON.parse(snap)); };
const ids = (P) => launchNeeds(P).map((n) => n.id);

test('a good rocket has nothing missing and a full green checklist', async () => {
  const S = await rocket(); const c = launchChecklist(S.api.project);
  assert.deepEqual(c.needs.filter((n) => n.severity === 'block'), []);
  assert.ok(c.checks.every((x) => x.status === 'ok'), JSON.stringify(c.checks));
});

test('no vehicle / empty vehicle / no mission', async () => {
  const S = new AiSession({ storage: new MemoryStorage() }); const P = S.api.project;
  const n = launchNeeds(P); assert.ok(n.find((x) => x.id === 'no-vehicle' && x.severity === 'block' && x.fix.tool === 'CREATE_VEHICLE'));
  assert.ok(n.find((x) => x.id === 'no-mission'));
  const r = await applyNeedFix(S.api, n.find((x) => x.id === 'no-vehicle').fix); assert.ok(r.ok, r.message);
  assert.ok(P.vehicle.components.length);
});

test('every item is short, plain and has a place to look', async () => {
  const S = await rocket(); const P = S.api.project; const v = P.vehicle; const snap = JSON.stringify(v);
  const cases = [(x) => { x.components = x.components.filter((c) => c.kind !== 'engine'); }, (x) => { x.components = x.components.filter((c) => !/tank/.test(c.kind)); }, (x) => { x.components = x.components.filter((c) => c.group !== 'payload'); }];
  for (const f of cases) {
    f(v);
    for (const n of launchNeeds(P)) {
      assert.ok(['block', 'warn'].includes(n.severity));
      assert.ok(n.title.split(/\s+/).length <= 8, n.title); assert.ok(n.why.split(/\s+/).length <= 15, n.why);
      assert.ok(n.where && n.show.screen, n.id);
    }
    restore(v, snap);
  }
});

for (const [label, mutate, expectId] of [
  ['no engine in a stage', (v) => { v.components = v.components.filter((c) => !(c.kind === 'engine' && c.group === 'stage1')); }, 'stage-no-engine:stage1'],
  ['no fuel tanks in a stage', (v) => { v.components = v.components.filter((c) => !(/tank/.test(c.kind) && c.group === 'stage1')); }, 'stage-no-tank:stage1'],
  ['no payload', (v) => { v.components = v.components.filter((c) => c.group !== 'payload'); }, 'no-payload'],
  ['too heavy to lift', (v) => { v.components.push({ id: 'ballast', kind: 'payload', name: 'Ballast', mount: 'stack', group: 'payload', mass: 150000, length: 1, diameter: 1, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 }); }, 'low-twr'],
]) {
  test(`${label}: reported, fix applied through the tool API, then it flies`, { timeout: 120000 }, async () => {
    const S = await rocket(); const P = S.api.project; mutate(P.vehicle);
    const need = launchNeeds(P).find((n) => n.id === expectId); assert.ok(need, `${expectId} in ${ids(P)}`);
    assert.ok(need.show.params && need.show.screen === 'designer');
    if (need.fix) {
      const r = await applyNeedFix(S.api, need.fix); assert.ok(r.ok, r.message);
      assert.ok(!ids(P).includes(expectId), `${expectId} still there`);
      assert.deepEqual(launchNeeds(P).filter((n) => n.severity === 'block'), []);
      const run = await S.api.execute('RUN_SIMULATION', { name: 'after-fix' }); assert.ok(run.ok, run.message);
    } else assert.equal(label, 'too heavy to lift', 'only the too-heavy case may lack a fix');
  });
}

test('no mission, wrong mission and missing run', async () => {
  const S = await rocket(); const P = S.api.project;
  const fake = { vehicle: P.vehicle, mission: null, environment: P.environment };
  const n = launchNeeds(fake).find((x) => x.id === 'no-mission'); assert.ok(n, 'no mission'); assert.equal(n.fix.tool, 'CREATE_MISSION');
  const mm = launchNeeds({ ...fake, mission: { name: 'x', guidance: { mode: 'none' }, initial: { type: 'orbit' }, objective: { type: 'landing' } } });
  assert.ok(mm.find((x) => x.id === 'mission-mismatch'));
  assert.deepEqual(runNeeds({ runs: [] }).map((x) => x.id), ['no-run']);
  assert.deepEqual(runNeeds({ runs: [{ id: 'a' }] }, 'a'), []);
});

test('running flight is a blocker with a Stop fix', async () => {
  const S = await rocket(); const n = launchNeeds(S.api.project, { running: true }).find((x) => x.id === 'running');
  assert.equal(n.severity, 'block'); assert.equal(n.fix.tool, 'STOP_SIMULATION');
});
