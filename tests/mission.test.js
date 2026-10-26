import test from 'node:test';
import assert from 'node:assert/strict';
import { planetInfo, definePlanet, landingSite, listPlanets } from '../mission/planets.js';
import { stackStats, burnStack, transferToMoon, hyperbolicBurn, earthEntrySpeed, poweredDescentDv, dvOf } from '../mission/dv.js';
import { flyEntry, entryCorridor } from '../mission/entry.js';
import { validateLunarMission, PASS, WARNING, FAIL } from '../mission/validate.js';
import { APOLLO_STYLE, cloneArch } from '../mission/presets.js';
import { Mission } from '../mission/phases.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test('built-in planets have physically correct derived values', () => {
  const e = planetInfo('earth'), m = planetInfo('moon'), r = planetInfo('mars');
  assert.ok(rel(e.surfaceGravity, 9.798) < 0.01);
  assert.ok(rel(m.surfaceGravity, 1.62) < 0.01);
  assert.ok(rel(r.surfaceGravity, 3.72) < 0.01);
  assert.ok(rel(e.surfacePressure, 101325) < 1e-6);
  assert.ok(r.surfacePressure > 400 && r.surfacePressure < 1000);
  assert.equal(m.hasAtmosphere, false);
  assert.ok(m.sites.length >= 3 && landingSite('moon', 'mare-tranquil').slopeDeg < 5);
  assert.ok(rel(planetInfo('earth').escapeSpeedSurface, 11186) < 0.01);
});

test('a new world can be added as data only', () => {
  const info = definePlanet({ id: 'testworld', name: 'Test', mu: 1e13, radius: 2e6, rotationPeriod: 50000, atmosphere: { model: 'exponential', rho0: 0.5, scaleHeight: 8000, T0: 250, height: 100000 } });
  assert.ok(info.hasAtmosphere && rel(info.scaleHeight, 8000) < 0.01);
  assert.ok(listPlanets().includes('testworld'));
  assert.throws(() => definePlanet({ id: 'bad', name: 'Bad', mu: -1, radius: 1 }));
});

test('transfer numbers match published lunar mission values', () => {
  const t = transferToMoon({ parkAlt: 185e3 });
  assert.ok(Math.abs(t.tli - 3130) < 60, `TLI ${t.tli}`);
  assert.ok(Math.abs(t.tof / 86400 - 5.0) < 0.5);
  const loi = hyperbolicBurn(4.9028e12, 1737400 + 111e3, t.vInfMoon);
  assert.ok(loi > 750 && loi < 950, `LOI ${loi}`);
  assert.ok(Math.abs(earthEntrySpeed() - 11000) < 150);
  const d = poweredDescentDv({});
  assert.ok(d.total > 1900 && d.total < 2300);
});

test('rocket equation and staging agree with hand calculation', () => {
  const s = { name: 's', dry: 1000, prop: 9000, thrustVac: 1e5, ispVac: 300 };
  const st = stackStats([s], 0);
  assert.ok(rel(st.totalDv, 300 * 9.80665 * Math.log(10)) < 1e-12);
  const two = stackStats([s, { ...s, name: 's2' }], 500);
  assert.ok(two.totalDv > st.totalDv);
  const b = burnStack([s, { ...s, name: 's2' }], 0, st.totalDv * 0.2);
  assert.ok(b.ok && b.stages.length === 2 && b.stages[0].prop < 9000);
  assert.ok(!burnStack([s], 0, 1e5).ok);
});

test('Apollo-like corridor and loads', () => {
  const veh = { mass: 5560, cd: 1.28, area: 12, ld: 0.3, noseRadius: 4.7 };
  const c = entryCorridor({ v: earthEntrySpeed(), vehicle: veh, limits: { maxG: 12, maxHeatLoad: 6e8 } });
  assert.ok(c.shallow > 4.3 && c.shallow < 5.8, `shallow ${c.shallow}`);
  assert.ok(c.steep > 6.5 && c.steep < 8.2, `steep ${c.steep}`);
  const skip = flyEntry({ v: earthEntrySpeed(), gammaDeg: -3, vehicle: veh });
  assert.ok(skip.skipped, 'too shallow must skip out');
  const steep = flyEntry({ v: earthEntrySpeed(), gammaDeg: -12, vehicle: veh, bank: 'ballistic' });
  assert.ok(steep.peakG > 15, 'too steep must be deadly');
});

test('Mars entry uses the Mars atmosphere: a heavy capsule barely slows by 7 km', () => {
  const veh = { mass: 1000, cd: 1.6, area: 5, ld: 0, noseRadius: 1.5 };
  const r = flyEntry({ body: 'mars', v: 5500, gammaDeg: -15, vehicle: veh, bank: 'ballistic', stopAlt: 7000 });
  assert.ok(r.completed || r.impacted);
  assert.ok(r.vEnd > 150, `Mars entry should still be fast low down, got ${r.vEnd}`);
});

test('the Apollo-style preset passes validation', () => {
  const r = validateLunarMission(APOLLO_STYLE);
  assert.notEqual(r.status, FAIL, r.checks.filter((c) => c.status === FAIL).map((c) => c.id).join());
  assert.ok(r.canReachMoon && r.canReturn);
});

test('validation fails for the right engineering reason', () => {
  const run = (mutate) => { const a = cloneArch(APOLLO_STYLE); mutate(a); return validateLunarMission(a); };
  const st = (r, id) => r.checks.find((c) => c.id === id).status;
  let r = run((a) => { a.launcher.stages[0].prop *= 0.4; a.launcher.stages[0].thrustSl *= 0.3; });
  assert.equal(st(r, 'liftoff'), FAIL);
  r = run((a) => { a.launcher.stages[2].prop = 10000; });
  assert.equal(st(r, 'tli'), FAIL); assert.equal(r.canReachMoon, false);
  r = run((a) => { a.sm.prop = 8000; });
  assert.equal(st(r, 'loi'), FAIL);
  r = run((a) => { a.lm.descent.prop = 3000; });
  assert.equal(st(r, 'descent'), FAIL);
  r = run((a) => { a.lm.descent.throttleMin = 0.9; });
  assert.equal(st(r, 'hover'), FAIL);
  r = run((a) => { a.lm.ascent.prop = 800; });
  assert.equal(st(r, 'ascent'), FAIL);
  r = run((a) => { a.mission.entryAngleDeg = 3; });
  assert.equal(st(r, 'corridor'), FAIL);
  r = run((a) => { a.mission.entryAngleDeg = 11; });
  assert.equal(st(r, 'corridor'), FAIL);
  r = run((a) => { a.cm.parachutes.mains = 1; a.cm.parachutes.mainArea = 150; });
  assert.equal(st(r, 'chutes'), FAIL);
  r = run((a) => { a.cm.heatShield.areaDensity = 5; });
  assert.equal(st(r, 'heatshield'), FAIL);
  r = run((a) => { a.launcher.stages[2].restarts = 0; });
  assert.equal(st(r, 'tli-restart'), FAIL);
  for (const c of r.checks) assert.ok(c.why && c.title, 'every check explains itself');
});

test('adding payload mass degrades the margin monotonically', () => {
  const dv = (extra) => { const a = cloneArch(APOLLO_STYLE); a.lm.cargo = extra; return validateLunarMission(a).analysis.launcher.afterOrbit.totalDv; };
  assert.ok(dv(0) > dv(2000) && dv(2000) > dv(6000));
});

test('phase model refuses to fake progress', () => {
  const m = new Mission('lunar-orbit-rendezvous', { crew: 3 });
  assert.equal(m.phases.length, 24);
  m.advance(); // prelaunch
  m.advance({ perigee: 185e3 }); // launch
  assert.equal(m.phase.id, 'stage-sep');
  const bad = new Mission('lunar-orbit-rendezvous');
  bad.advance(); bad.advance({ failure: 'out-of-propellant', shortfall: 400 });
  assert.equal(bad.outcome, 'failed'); assert.equal(bad.failure.phase, 'launch');
});

function fly(m, until, hooks = {}) {
  for (let n = 0; n < 60 && m.phase.id !== until; n++) {
    hooks[m.phase.id]?.(m);
    m.advance();
    if (m.outcome !== 'in-progress') return;
  }
}

test('crew must be in the right spacecraft', () => {
  const m = new Mission('lunar-orbit-rendezvous', { crew: 3 });
  fly(m, 'lm-sep');
  m.transfer(['crew-1', 'crew-2'], 'lm');
  assert.throws(() => m.transfer(['crew-3'], 'lm'), /seats/);
  fly(m, 'tei', {
    ascent: (x) => x.setFlag('ascentStageSeparated'),
    docking: (x) => x.setFlag('dockedHardLatch'),
    'crew-transfer': (x) => x.transfer(['crew-1', 'crew-2'], 'cm'),
    'lm-jettison': (x) => x.setFlag('lmJettisoned'),
  });
  assert.equal(m.phase.id, 'tei');
  assert.equal(m.outcome, 'in-progress');
  // forget to bring the lander crew home: the jettison gate fails the mission
  const left = new Mission('lunar-orbit-rendezvous', { crew: 2 });
  fly(left, 'lm-sep');
  left.transfer(['crew-1'], 'lm');
  fly(left, 'tei', { ascent: (x) => x.setFlag('ascentStageSeparated'), docking: (x) => x.setFlag('dockedHardLatch') });
  assert.equal(left.outcome, 'failed');
  assert.equal(left.failure.reason, 'gate-not-met');
});

test('Mars template adds entry phases only because Mars has an atmosphere', () => {
  const mars = new Mission('planetary-lander', { params: { body: 'mars' } });
  assert.ok(mars.phases.some((p) => p.id === 'atmo-entry'));
  const moon = new Mission('planetary-lander', { params: { body: 'moon' } });
  assert.ok(!moon.phases.some((p) => p.id === 'atmo-entry'));
});
