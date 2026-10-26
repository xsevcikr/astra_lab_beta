import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVehicle } from '../src/engineering/vehicle/library.js';
import { simulateAscent, AscentSim, tuneAscent } from '../src/engineering/flight/ascent.js';
import { simulateDescent } from '../src/engineering/flight/descent.js';
import { simulateEntry, entryCorridor } from '../src/engineering/flight/entry.js';
import { simulateRendezvous } from '../src/engineering/flight/rendezvous.js';
import { Replay, TimeWarp } from '../src/engineering/flight/timeline.js';
import { compareRuns } from '../src/engineering/flight/recorder.js';
import { runLunarMission, defaultLunarArchitecture } from '../src/engineering/workflow/lunarMission.js';

test('ascent: heavy launcher reaches the target parking orbit with physical loads', () => {
  const r = simulateAscent(loadVehicle('heavy-lunar'), { targetAlt: 185e3, kickDeg: 6 });
  assert.equal(r.outcome, 'orbit');
  assert.ok(Math.abs(r.orbit.periapsisAlt - 185e3) < 10e3);
  assert.ok(r.maxG > 3 && r.maxG < 6.5 && r.maxQ.q > 20e3 && r.maxQ.q < 45e3);
  assert.ok(r.losses.gravity > 500 && r.losses.drag > 10);
  for (const ch of ['altitude', 'dynamicPressure', 'structuralMargin', 'noseTemp']) assert.ok(r.recorder.names().includes(ch));
});
test('ascent: an engine failure is recorded and is not hidden', () => {
  const v = loadVehicle('small-launcher');
  const r = simulateAscent(v, { targetAlt: 200e3, kickDeg: 16, failures: [{ t: 30, type: 'engine-out', engines: 3 }] });
  assert.ok(r.timeline.events.some((e) => e.type === 'failure'));
  assert.notEqual(r.outcome, 'orbit');
});
test('ascent: target tuning returns a kick that reaches orbit', () => {
  const k = tuneAscent(loadVehicle('heavy-lunar'), { targetAlt: 185e3 });
  assert.ok(k.reachesOrbit);
});
test('descent: nominal landing, and radar loss is reported in the timeline', () => {
  const v = loadVehicle('lunar-lander');
  const r = simulateDescent(v, { seed: 2 });
  assert.equal(r.outcome, 'landed'); assert.ok(r.touchdown.vz < 3 && r.touchdown.vh < 1.2);
  const f = simulateDescent(v, { seed: 2, failures: [{ t: 200, type: 'radar-failure' }] });
  assert.ok(f.timeline.events.some((e) => e.text.includes('radar')));
  const e = simulateDescent(v, { seed: 2, failures: [{ t: 300, type: 'engine-failure' }] });
  assert.equal(e.outcome, 'crash');
});
test('descent: too little propellant cannot land', () => {
  const v = loadVehicle('lunar-lander'); v.stages[0].propMass = 4000;
  const r = simulateDescent(v, { seed: 1, record: false });
  assert.notEqual(r.outcome, 'landed');
});
test('entry: corridor exists for the crew capsule; steep entries overload, shallow ones skip', () => {
  const c = entryCorridor('crew-capsule', {}, { from: -4, to: -9, step: -0.5 });
  assert.ok(c.shallow !== null && c.steep !== null && c.shallow > c.steep);
  assert.equal(simulateEntry('crew-capsule', { gammaDeg: -3, record: false }).outcome, 'skip-out');
  assert.ok(['overload', 'impact'].includes(simulateEntry('crew-capsule', { gammaDeg: -12, record: false }).outcome));
});
test('entry: Mars EDL lands the rover; a failed parachute is fatal', () => {
  const ok = simulateEntry('mars-lander', { body: 'mars', entryAlt: 125000, entrySpeed: 5800, gammaDeg: -15.5, record: false });
  assert.equal(ok.outcome, 'landed');
  const bad = simulateEntry('mars-lander', { body: 'mars', entryAlt: 125000, entrySpeed: 5800, gammaDeg: -15.5, record: false, dispersions: { chuteFailures: [0] } });
  assert.notEqual(bad.outcome, 'landed');
});
test('rendezvous and docking succeed nominally and fail with a bad navigation system', () => {
  assert.equal(simulateRendezvous({ seed: 3, record: false }).outcome, 'docked');
  const bad = [1, 2, 3, 4, 5].map((s) => simulateRendezvous({ seed: s, record: false, navSd: 2000, navVelSd: 2 }));
  assert.ok(bad.some((r) => !r.success));
});
test('replay seeks to events and plays in reverse; time warp drops near critical events', () => {
  const r = simulateAscent(loadVehicle('small-launcher'), { targetAlt: 200e3, kickDeg: 16 });
  const rp = new Replay(r.recorder);
  const sep = r.recorder.events.find((e) => e.type === 'separation');
  const f = rp.seekEvent(sep); assert.equal(f.t <= sep.t, true);
  rp.play(-2); rp.advance(1); assert.ok(rp.t < f.t);
  const tw = new TimeWarp({ maxDt: 0.05 }); tw.set(1000);
  const plan = tw.plan(1 / 60, { secondsToCritical: 3, critical: 'staging' });
  assert.ok(plan.warp < 1000 && plan.dt <= 0.05 + 1e-12);
  assert.equal(compareRuns(r.recorder, r.recorder).every((c) => c.maxDiff === 0), true);
});
test('lunar mission runs from launch to splashdown and stops honestly on failure', () => {
  const ok = runLunarMission(defaultLunarArchitecture());
  assert.equal(ok.success, true);
  assert.equal(ok.phases.length, 11);
  assert.ok(ok.metrics['crew.maxG'] < 10);
  const arch = defaultLunarArchitecture(); arch.csm.stages[0].propMass = 9000;
  const bad = runLunarMission(arch);
  assert.equal(bad.success, false);
  assert.match(bad.failedPhase, /Trans-Earth|Lunar orbit/);
  assert.ok(bad.timeline.events.some((e) => e.severity === 'critical'));
});
