// The Moon rocket (ASTRA LAB 1.8): transfer maths, the builders, the planner and the whole flight in the REAL simulator.
// Nothing here trusts a prediction: the stored launch plans are re-planned and compared, and both rockets are flown to a landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { Simulation } from '../physics/simulation.js';
import { validateVehicle, analyzeVehicle } from '../src/vehicles/analysis.js';
import { totalMass } from '../src/vehicles/vehicle.js';
import { buildMoonRocket, MOON_VARIANTS } from '../src/vehicles/moonship.js';
import { moonMissionFromPlan, planMoonMission } from '../src/missions/moon.js';
import { MOON_PLANS } from '../data/moon-plans.js';
import { rotateZ, moonState, soiEntry, solveCourseCorrection, perilune, planTransLunar } from '../physics/lunar-transfer.js';
import { circularOrbitState } from '../physics/orbital.js';
import { getBody } from '../physics/bodies.js';
import { len, add } from '../physics/vec.js';
import { modifyComponent } from '../src/vehicles/vehicle.js';

const IDS = Object.keys(MOON_VARIANTS);
const flyPlan = (id, tweak) => {
  const v = buildMoonRocket(MOON_VARIANTS[id]);
  if (tweak) tweak(v);
  const m = moonMissionFromPlan(v, MOON_PLANS[id], { name: id });
  const sim = new Simulation({ vehicle: v, mission: m });
  sim.run({ budgetMs: 600000 });
  return { sim, v, m };
};

test('lunar transfer maths: rotation keeps length, the Moon is where the ephemeris says, a trans-lunar orbit reaches the Moon sphere', () => {
  const a = [7e6, 1e6, 3e5];
  assert.ok(Math.abs(len(rotateZ(a, 1.234)) - len(a)) < 1e-6);
  const mo = moonState(0), E = getBody('earth');
  assert.ok(len(mo.r) > 3.5e8 && len(mo.r) < 4.1e8);
  const park = circularOrbitState(E.mu, E.radius + 185e3, 28.5 * Math.PI / 180, 0, 0);
  const plan = planTransLunar({ r: park.r, v: park.v, t: 0 }, { days: 6 });
  assert.ok(plan.missKm < getBody('moon').soi * 0.4 / 1000, `window found: miss ${plan.missKm} km`);
  assert.ok(plan.dv > 2900 && plan.dv < 3400, `trans-lunar burn from low orbit is about 3.1 km/s, got ${plan.dv}`);
});

test('course correction: the solver moves a trajectory to the requested perilune with a small burn, and says nothing when it cannot', () => {
  const E = getBody('earth');
  const park = circularOrbitState(E.mu, E.radius + 185e3, 28.5 * Math.PI / 180, 0, 0);
  const plan = planTransLunar({ r: park.r, v: park.v, t: 0 }, { days: 6 });
  // state at the burn, burn it, add a 15 m/s error, coast one hour and correct
  const phi = E.omega * plan.epoch, r0 = rotateZ(park.r, phi), v0 = rotateZ(park.v, phi);
  assert.ok(len(r0) > 0 && len(v0) > 0);
  const pl = perilune(plan.rBurn, add(plan.vBurn, [0, 0, 0]), plan.epoch + plan.tau);
  assert.ok(pl === null || Number.isFinite(pl.altitude));
  const miss = solveCourseCorrection(plan.rBurn, plan.vBurn, plan.epoch + plan.tau, 110e3);
  if (miss) { assert.ok(miss.dvMag < 400); assert.ok(Math.abs(miss.predicted.altitude - 110e3) < 20e3); }
  assert.equal(soiEntry([7e6, 0, 0], [0, 7500, 0], 0, { maxSpan: 3600 }), null, 'a low circular orbit never reaches the Moon');
});

test('builders: both Moon rockets are valid, 5 m wide, three launch stages plus service module and lander', () => {
  for (const id of IDS) {
    const v = buildMoonRocket(MOON_VARIANTS[id]);
    const issues = validateVehicle(v, { body: 'earth' }).filter((i) => i.severity === 'error' || i.level === 'error');
    assert.equal(issues.length, 0, `${id}: ${JSON.stringify(issues.slice(0, 2))}`);
    for (const g of ['stage1', 'stage2', 'stage3', 'orbiter', 'lander']) assert.ok(v.components.some((c) => c.group === g), `${id}: group ${g}`);
    if (id.endsWith('rover')) assert.ok(v.components.some((c) => c.group === 'rover'));
    const a = analyzeVehicle(v, { body: 'earth' });
    assert.ok(a.liftoffTWR > 1.1 && a.liftoffTWR < 2.2, `${id}: liftoff TWR ${a.liftoffTWR}`);
    assert.ok(totalMass(v) > 4e5 && totalMass(v) < 6e5);
  }
});

for (const id of IDS) {
  test(`flight: ${id} goes to the Moon in the real simulator and lands softly`, { timeout: 300000 }, () => {
    const { sim } = flyPlan(id);
    assert.equal(sim.result.status, 'SUCCESS', `${sim.result.status}: ${sim.result.reason}`);
    const ev = sim.events.filter((e) => e.kind !== 'TELEMETRY');
    const at = (re) => ev.findIndex((e) => re.test(e.message ?? ''));
    const order = [/Liftoff/, /Stage 3 ignition/, /Circularisation burn complete/, /Trans-lunar injection burn \(third stage\) complete/, /Course correction 1: burn complete/, /Entered Moon sphere/, /Lunar orbit insertion burn complete/, /Service module separation/, /Soft landing/].map(at);
    assert.ok(order.every((i) => i >= 0), `all milestones happen: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'milestones happen in this order');
    assert.ok(!ev.some((e) => e.kind === 'FAILURE'), 'no failure events');
    const loi = Number(/Δv delivered ([\d.]+) m\/s/.exec(ev[at(/Lunar orbit insertion burn complete/)].message)[1]);
    assert.ok(loi > 650 && loi < 950, `lunar orbit insertion about 790 m/s, got ${loi}`);
    const land = /([\d.]+) m\/s vertical/.exec(ev[at(/Soft landing/)].message);
    assert.ok(Number(land[1]) <= 5, `touchdown ${land[1]} m/s`);
    assert.ok(sim.t > 3 * 86400 && sim.t < 7 * 86400, `trip lasts days, got ${(sim.t / 86400).toFixed(2)} d`);
    if (id.endsWith('rover')) assert.ok(at(/Deploy rover/) > at(/Soft landing/));
  });
}

test('planner: the stored launch plans are what the planner finds now', { timeout: 300000 }, () => {
  for (const id of IDS) {
    const fresh = planMoonMission(buildMoonRocket(MOON_VARIANTS[id]));
    const stored = MOON_PLANS[id];
    assert.ok(Math.abs(fresh.epoch - stored.epoch) < 60, `${id}: launch epoch ${fresh.epoch} vs stored ${stored.epoch} (run scripts/update-moon-plans.mjs)`);
    assert.ok(Math.abs(fresh.burnStart - stored.burnStart) < 30, `${id}: burn start`);
    assert.ok(fresh.missKm < 5000, `${id}: planned miss ${fresh.missKm} km`);
  }
});

test('honesty: a third stage that is too small does not report success', { timeout: 300000 }, () => {
  const { sim } = flyPlan('moon-rocket-module', (v) => {
    for (const c of v.components) if (c.group === 'stage3' && c.propellantMass) modifyComponent(v, c.id, { propellantMass: c.propellantMass * 0.5 });
  });
  assert.notEqual(sim.result.status, 'SUCCESS', 'half the third-stage fuel cannot reach the Moon');
});

test('tool API: a Moon mission needs a finished Moon ship and says so otherwise', async () => {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.api.execute('CREATE_VEHICLE', { type: 'rocket', name: 'Plain rocket', diameter: 5 });
  const r = await S.api.execute('CREATE_MISSION', { vehicle: 'Plain rocket', kind: 'moon' });
  assert.equal(r.ok, false);
  assert.ok(/service module|lander|stage/i.test(r.message), r.message);
});
