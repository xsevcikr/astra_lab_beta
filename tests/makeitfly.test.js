// "Fix it and fly again" (src/core/makeitfly.js): rockets that look fine on paper but fail in a REAL flight must either fly after the
// automatic fixes (a recorded SUCCESS flight) or end with an honest explanation. Time-boxed: the whole file stays well under 2 minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { rocketBuildPlan } from '../ai/design.js';
import { applyPlan } from '../ai/plan.js';
import { TEMPLATES } from '../data/templates.js';
import { makeItFly, describeFlight, designSignature, plainCause } from '../src/core/makeitfly.js';
import { flyChecks } from '../ui/lib/rocketbuilder.js';
import { readinessReview, suborbitalDvNeeded, missionDvNeed, ascentDvNeeded } from '../src/core/readiness.js';

const tpl = async (S, id) => TEMPLATES.find((x) => x.id === id).build({ project: S.project });
const CASES = {
  '300 kg to 200 km': async (S) => applyPlan(S, rocketBuildPlan({ payloadMass: 300, altitude: 200e3, dvMargin: 1.05 })),
  '1000 kg to 200 km': async (S) => applyPlan(S, rocketBuildPlan({ payloadMass: 1000, altitude: 200e3, dvMargin: 1.05 })),
  '50 kg to 800 km': async (S) => applyPlan(S, rocketBuildPlan({ payloadMass: 50, altitude: 800e3, dvMargin: 1.2 })),
  '12 engines on stage 1': async (S) => { await tpl(S, 'small-launcher'); await S.api.execute('MODIFY_STAGE', { stage: 'stage1', engineCount: 12 }); },
  'sounding rocket, fuel x0.65': async (S) => { await tpl(S, 'sounding-rocket'); await S.api.execute('MODIFY_STAGE', { stage: 'stage1', propellantScale: 0.65 }); },
  'medium launcher, fuel x0.69': async (S) => { await tpl(S, 'medium-launcher'); for (const st of ['stage1', 'stage2']) await S.api.execute('MODIFY_STAGE', { stage: st, propellantScale: 0.69 }); },
};
const fresh = () => new AiSession({ storage: new MemoryStorage() });

test('six broken-but-green rockets: a recorded SUCCESS flight or an honest explanation (never a false claim)', { timeout: 290000 }, async () => {
  const t0 = Date.now(), BUDGET = 240000;   // an upper limit: alone it needs about 70 s, but the full suite runs many files at once and this test must not depend on a quiet computer
  let flew = 0; const lines = [];
  for (const [name, build] of Object.entries(CASES)) {
    const S = fresh(); await build(S);
    const before = JSON.stringify(S.project.vehicle.components);
    const deadline = Date.now() + Math.max(8000, (BUDGET - (Date.now() - t0)) / Math.max(1, Object.keys(CASES).length - lines.length));
    const progress = [];
    const r = await makeItFly(S.api, { maxRounds: 4, onProgress: (p) => progress.push(p.phase), shouldStop: () => Date.now() > deadline });
    assert.ok(progress.includes('fly') && progress.at(-1) === 'done', `${name}: progress is reported`);
    assert.ok(typeof r.summary === 'string' && r.summary.length > 10, `${name}: a plain sentence`);
    if (r.ok) {
      flew++;
      const { record } = await S.api.getRun(r.runId);
      assert.equal(record.result.status, 'SUCCESS', `${name}: the claimed success is a recorded SUCCESS flight`);
      assert.match(r.summary, /flew/i);
    } else {
      assert.equal(JSON.stringify(S.project.vehicle.components), before, `${name}: a rocket that was not fixed is left as it was`);
      assert.ok(r.stopped || r.cause, `${name}: says why it does not work (${r.summary})`);
    }
    lines.push(`${name}: ${r.ok ? 'flies' : 'honest: ' + r.summary.slice(0, 60)} (${r.rounds.length} flights)`);
  }
  console.log(lines.join('\n'));
  assert.ok(flew >= 4, `at least 4 of 6 end with a successful recorded flight: ${lines.join(' / ')}`);
  assert.ok(Date.now() - t0 < 270000, 'time-boxed');
});

test('the winning launch path is saved in the mission and marked in the run, so a plain re-flight (Live Flight, Replay) succeeds the same way', { timeout: 60000 }, async () => {
  const S = fresh(); await CASES['300 kg to 200 km'](S);
  const r = await makeItFly(S.api, { maxRounds: 4 });
  assert.equal(r.ok, true, r.summary);
  assert.equal(r.scheduleSaved, true);
  const run = await S.api.getRun(r.runId);
  assert.equal(run.record.meta.scheduleSaved, true);
  assert.deepEqual(run.record.meta.schedule, S.project.mission.guidance.params.schedule);
  const again = await S.api.execute('RUN_SIMULATION', { tune: false, name: 'replay of the saved path' });
  assert.equal(again.data.status, 'SUCCESS');
  assert.ok(S.project.history.stack.length > 1);          // one undo step
});

test('a rocket that already works is not changed', { timeout: 40000 }, async () => {
  const S = fresh(); await applyPlan(S, rocketBuildPlan({ payloadMass: 100, altitude: 200e3 }));
  const before = JSON.stringify(S.project.vehicle.components);
  const r = await makeItFly(S.api, {});
  assert.equal(r.ok, true); assert.equal(r.changes.length, 0); assert.match(r.summary, /Nothing had to be changed/);
  assert.equal(JSON.stringify(S.project.vehicle.components), before);
});

test('stopping gives the rocket back unchanged and says so', { timeout: 40000 }, async () => {
  const S = fresh(); await CASES['sounding rocket, fuel x0.65'](S);
  const before = JSON.stringify(S.project.vehicle.components);
  let n = 0;
  const r = await makeItFly(S.api, { shouldStop: () => ++n > 3 });
  assert.equal(r.ok, false); assert.equal(r.stopped, true); assert.match(r.summary, /Stopped/);
  assert.equal(JSON.stringify(S.project.vehicle.components), before);
});

test('an impossible goal ends with an honest reason and no false success', { timeout: 100000 }, async () => {
  const S = fresh(); await applyPlan(S, rocketBuildPlan({ payloadMass: 100, altitude: 200e3 }));
  await S.api.execute('CREATE_MISSION', { kind: 'launch', altitude: 2e6 });          // the highest orbit the app offers: more than this small rocket can do
  const before = JSON.stringify(S.project.vehicle.components);
  const r = await makeItFly(S.api, { maxRounds: 1 });
  assert.equal(r.ok, false);
  assert.match(r.summary, /still does not work/); assert.match(r.summary, /unchanged/);
  assert.equal(JSON.stringify(S.project.vehicle.components), before);
});

test('the lights judge speed against the active goal, not always against an orbit', async () => {
  const S = fresh(); await tpl(S, 'sounding-rocket');
  const v = S.project.vehicle, m = S.project.mission;
  const fc = flyChecks(v, 'earth', m);
  assert.equal(fc.need.kind, 'height'); assert.ok(fc.need.dv < 2500 && fc.need.dv > 1400, `${fc.need.dv}`);
  assert.equal(fc.items.find((i) => i.id === 'speed').state, 'ok'); assert.match(fc.items.find((i) => i.id === 'speed').text, /estimate/);
  assert.ok(Math.abs(fc.need.dv - suborbitalDvNeeded('earth', 100000)) < 1e-6);
  assert.equal(missionDvNeed(m, v).kind, 'height');
  // the same rocket against an orbit goal is far too slow
  const orbit = flyChecks(v, 'earth', { objective: { type: 'orbit', altitude: 200000 }, guidance: { mode: 'ascent' }, initial: { type: 'pad', lat: 28.5 } });
  assert.equal(orbit.need.kind, 'orbit'); assert.ok(Math.abs(orbit.need.dv - ascentDvNeeded('earth', 200000, 28.5)) < 1); assert.equal(orbit.items.find((i) => i.id === 'speed').state, 'bad');
  // readiness uses the same height budget and is labelled as a prediction
  const rv = readinessReview(v, m); assert.equal(rv.prediction, true); assert.match(rv.stations.find((s) => s.id === 'propulsion').reason, /estimate|delta-v/);
});

test('"Built well?" and Structures warn when the engines push too hard', async () => {
  const S = fresh(); await tpl(S, 'small-launcher');
  await S.api.execute('MODIFY_STAGE', { stage: 'stage1', engineCount: 12 });
  const fc = flyChecks(S.project.vehicle, 'earth', S.project.mission);
  const strong = fc.items.find((i) => i.id === 'strong');
  assert.ok(fc.sum.liftoffTWR > 2.5 && strong.state !== 'ok', `${fc.sum.liftoffTWR} ${strong.text}`);
  const st = readinessReview(S.project.vehicle, S.project.mission).stations.find((s) => s.id === 'structures');
  assert.equal(st.status, 'caution'); assert.match(st.reason, /times the weight/);
});

test('the design signature changes with the design but not with the saved launch path', async () => {
  const S = fresh(); await tpl(S, 'small-launcher');
  const a = designSignature(S.project.vehicle, S.project.mission);
  S.project.mission.guidance.params.schedule = { hF: 70000, n: 0.8 };
  assert.equal(designSignature(S.project.vehicle, S.project.mission), a);
  await S.api.execute('MODIFY_STAGE', { stage: 'stage1', engineCount: 7 });
  assert.notEqual(designSignature(S.project.vehicle, S.project.mission), a);
});

test('describeFlight explains failures in plain words', async () => {
  const S = fresh(); await CASES['sounding rocket, fuel x0.65'](S);
  const r = await S.api.execute('RUN_SIMULATION', { name: 'x' });
  const { record, telemetry } = await S.api.getRun(r.data.runId);
  const info = describeFlight(record, telemetry, S.project.vehicle, S.project.mission);
  assert.equal(info.kind, 'twr-high'); assert.match(info.cause, /push so hard/);
  assert.match(plainCause({ kind: 'dv', orbit: true }), /fuel/);
});
