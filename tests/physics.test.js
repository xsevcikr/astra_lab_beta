// Automated physics validation: the simulator is compared with closed-form analytical solutions.
// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { ball, engineStage, rel } from './helpers.js';
import { Simulation } from '../physics/simulation.js';
import { getBody } from '../physics/bodies.js';
import { G0 } from '../physics/constants.js';
import { elementsFromState, propagateKepler, hohmann, circularSpeed, orbitalPeriod, circularOrbitState } from '../physics/orbital.js';
import { len, dot, cross } from '../physics/vec.js';
import { Atmosphere } from '../physics/atmosphere.js';
import { axialCoeff, NOSE_FACTORS } from '../physics/aero.js';

const noneMission = (initial, extra = {}) => ({ name: 'test', objective: { type: 'none' }, initial, maxTime: 1e5, ...extra });

test('surface gravity of Earth, Moon and Mars equals GM/R^2', () => {
  const ref = { earth: 9.7982, moon: 1.6238, mars: 3.7279 }; // published equatorial values (m/s^2)
  for (const id of ['earth', 'moon', 'mars']) {
    const b = getBody(id);
    assert.ok(rel(b.gravity, b.mu / b.radius ** 2) < 1e-12);
    assert.ok(rel(b.gravity, ref[id]) < 2e-3, `${id}: ${b.gravity} vs ${ref[id]}`);
  }
});

test('simulated gravitational acceleration matches GM/r^2 on Earth, Moon and Mars', () => {
  for (const id of ['earth', 'moon', 'mars']) {
    const b = getBody(id), r0 = b.radius + 400e3;
    const sim = new Simulation({ vehicle: ball(), mission: noneMission({ type: 'state', r: [r0, 0, 0], v: [0, 0, 0], body: id }), environment: { body: id }, settings: { accuracy: 'high' } });
    const dt = 2;
    sim.run({ untilT: dt });
    // at rest, radial fall: Delta v ~ g(r) t (g changes by ~ 1e-6 over this distance)
    const gExp = b.mu / (r0 * r0);
    const dv = -sim.now.vSpeed;
    assert.ok(rel(dv / sim.t, gExp) < 1e-4, `${id}: measured ${dv / sim.t} expected ${gExp}`);
  }
});

// radial free fall from rest: exact solution of the radial Kepler orbit  t(r) = sqrt(r0^3/(2mu)) [ sqrt(x(1-x)) + acos(sqrt x) ], x = r/r0
test('free fall from rest follows the exact radial Kepler solution (airless Earth)', () => {
  const b = getBody('vacearth'), r0 = 9.0e6;
  const sim = new Simulation({ vehicle: ball(), mission: noneMission({ type: 'state', r: [r0, 0, 0], v: [0, 0, 0], body: 'vacearth' }), environment: { body: 'vacearth' }, settings: { accuracy: 'high' } });
  sim.run({ untilT: 700 });
  const r = Math.hypot(sim.y[0], sim.y[1], sim.y[2]);
  const x = r / r0;
  const tAnalytic = Math.sqrt(r0 ** 3 / (2 * b.mu)) * (Math.sqrt(x * (1 - x)) + Math.acos(Math.sqrt(x)));
  assert.ok(Math.abs(tAnalytic - sim.t) < 0.05, `analytic fall time ${tAnalytic} vs simulated ${sim.t}`);
  // energy conservation
  const v = Math.hypot(sim.y[3], sim.y[4], sim.y[5]);
  const E = v * v / 2 - b.mu / r, E0 = -b.mu / r0;
  assert.ok(Math.abs(E - E0) / Math.abs(E0) < 1e-9);
});

test('constant thrust in gravity-free space: rocket equation dv = Isp g0 ln(m0/m) (Tsiolkovsky)', () => {
  const veh = engineStage({ dry: 100, prop: 400, thrust: 5000, isp: 300 });
  const sim = new Simulation({ vehicle: veh, mission: noneMission({ type: 'state', r: [7e6, 0, 0], v: [0, 0, 0], body: 'void' }, { guidance: { mode: 'inertial', params: { vector: [1, 0, 0] } }, events: [{ id: 'i', name: 'Ignite', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'main' } }] }), environment: { body: 'void' } });
  sim.run({ untilT: 40 });
  const m0 = 500, mdot = 5000 / (300 * G0);
  const spool = sim.fv.mass; // actual mass
  const dvExp = 300 * G0 * Math.log(m0 / spool);
  assert.ok(rel(sim.now.speed, dvExp) < 2e-4, `v=${sim.now.speed} expected ${dvExp}`);
  // propellant flow rate: mass lost == thrust/(Isp g0) * burn time
  assert.ok(rel(m0 - spool, mdot * (sim.now.speed > 0 ? 40 : 0)) < 0.01);
  // ideal delta-v accounting in the simulator equals the rocket equation
  assert.ok(rel(sim.budget.ideal, dvExp) < 5e-3, `budget ${sim.budget.ideal} vs ${dvExp}`);
});

test('propellant depletion: engine stops when the tanks are empty and mass equals dry mass', () => {
  const veh = engineStage({ dry: 100, prop: 100, thrust: 5000, isp: 300 });
  const sim = new Simulation({ vehicle: veh, mission: noneMission({ type: 'state', r: [7e6, 0, 0], v: [0, 0, 0], body: 'void' }, { guidance: { mode: 'inertial', params: { vector: [1, 0, 0] } }, events: [{ id: 'i', name: 'Ignite', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'main' } }] }), environment: { body: 'void' } });
  sim.run({ untilT: 90 });
  const tBurn = 100 / (5000 / (300 * G0));
  const spent = sim.events.find((e) => e.kind === 'ENGINE_SPENT');
  assert.ok(spent, 'depletion event logged');
  assert.ok(Math.abs(spent.t - tBurn) < 0.3, `depleted at ${spent.t}, expected ${tBurn}`);
  assert.ok(Math.abs(sim.fv.mass - 100) < 1e-6, `final mass ${sim.fv.mass}`);
  assert.ok(rel(sim.now.speed, 300 * G0 * Math.log(200 / 100)) < 2e-4);
  assert.equal(sim.now.thrust, 0);
  // coasting afterwards: velocity constant
  const v1 = sim.now.speed; sim.run({ untilT: 120 });
  assert.ok(rel(sim.now.speed, v1) < 1e-9);
});

test('drag: velocity of a falling body follows v = vt tanh(g t / vt) with terminal speed vt = sqrt(2 m g / (rho CdA))', () => {
  const b = getBody('denseair');
  const veh = ball(100, 0.5);
  const sim = new Simulation({ vehicle: veh, mission: noneMission({ type: 'local', altitude: 200e3, lat: 0, lon: 0 }), environment: { body: 'denseair' }, settings: { accuracy: 'high', dt: 0.01 } });
  const rho = 1.225, S = Math.PI * 0.25 ** 2;
  const CA = axialCoeff(0.2) * 3.0; // body falls base-first (reference: documented base factor 3.0 for a plain stack)
  const r = Math.hypot(sim.y[0], sim.y[1], sim.y[2]);
  const g = b.mu / (r * r);
  const vt = Math.sqrt((2 * 100 * g) / (rho * CA * S));
  sim.run({ untilT: 40 });
  const vExp = vt * Math.tanh((g * sim.t) / vt);
  const vSim = -sim.now.vSpeed;
  assert.ok(rel(vSim, vExp) < 0.01, `v=${vSim} expected ${vExp} (terminal ${vt})`);
  assert.ok(sim.now.mach < 0.5);
});

test('circular orbit: period, constant radius, energy and angular momentum conserved', () => {
  const b = getBody('vacearth'), alt = 400e3, a = b.radius + alt;
  const T = orbitalPeriod(b.mu, a);
  const sim = new Simulation({ vehicle: ball(), mission: noneMission({ type: 'orbit', altitude: alt, inclination: 51.6 }), environment: { body: 'vacearth' }, settings: { accuracy: 'high' } });
  const r0 = [sim.y[0], sim.y[1], sim.y[2]], v0 = [sim.y[3], sim.y[4], sim.y[5]];
  const h0 = len(cross(r0, v0));
  let rmin = Infinity, rmax = 0;
  while (sim.t + 1 < T && !sim.finished) { sim.step(); const r = Math.hypot(sim.y[0], sim.y[1], sim.y[2]); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
  sim.run({ untilT: T });
  const rEnd = [sim.y[0], sim.y[1], sim.y[2]];
  const err = Math.hypot(rEnd[0] - r0[0], rEnd[1] - r0[1], rEnd[2] - r0[2]);
  // the last step may overshoot T by up to one time step: allow that distance, nothing more
  assert.ok(err < Math.abs(sim.t - T) * circularSpeed(b.mu, a) + 5, `position error after one period: ${err} m (overshoot ${sim.t - T} s)`);
  assert.ok((rmax - rmin) < 1, `radius variation ${rmax - rmin} m`);
  const h1 = len(cross(rEnd, [sim.y[3], sim.y[4], sim.y[5]]));
  assert.ok(rel(h1, h0) < 1e-9);
  assert.ok(rel(circularSpeed(b.mu, a), len(v0)) < 1e-9);
  assert.ok(Math.abs(sim.now.incl - 51.6) < 1e-6);
});

test('elliptical orbit: matches the analytic Kepler propagator, conserves energy and angular momentum, period = 2 pi sqrt(a^3/mu)', () => {
  const b = getBody('vacearth');
  const sim = new Simulation({ vehicle: ball(), mission: noneMission({ type: 'orbit', periapsis: 300e3, apoapsis: 12000e3, inclination: 28 }), environment: { body: 'vacearth' }, settings: { accuracy: 'high' } });
  const r0 = [sim.y[0], sim.y[1], sim.y[2]], v0 = [sim.y[3], sim.y[4], sim.y[5]];
  const el = elementsFromState(b.mu, r0, v0);
  assert.ok(rel(el.rp, b.radius + 300e3) < 1e-9 && rel(el.ra, b.radius + 12000e3) < 1e-9);
  const T = orbitalPeriod(b.mu, el.a);
  const E0 = len(v0) ** 2 / 2 - b.mu / len(r0), h0 = cross(r0, v0);
  sim.run({ untilT: 1.3 * T });
  const an = propagateKepler(b.mu, r0, v0, sim.t);
  const dr = Math.hypot(sim.y[0] - an.r[0], sim.y[1] - an.r[1], sim.y[2] - an.r[2]);
  assert.ok(dr < 50, `distance from analytic solution: ${dr} m`);
  const E1 = len([sim.y[3], sim.y[4], sim.y[5]]) ** 2 / 2 - b.mu / len([sim.y[0], sim.y[1], sim.y[2]]);
  assert.ok(Math.abs(E1 - E0) / Math.abs(E0) < 1e-8, 'energy');
  const h1 = cross([sim.y[0], sim.y[1], sim.y[2]], [sim.y[3], sim.y[4], sim.y[5]]);
  assert.ok(len([h1[0] - h0[0], h1[1] - h0[1], h1[2] - h0[2]]) / len(h0) < 1e-9, 'angular momentum');
  // after one period the state repeats (the last step may overshoot T slightly: compare with the analytic solution at the actual time)
  const sim2 = new Simulation({ vehicle: ball(), mission: noneMission({ type: 'orbit', periapsis: 300e3, apoapsis: 12000e3, inclination: 28 }), environment: { body: 'vacearth' }, settings: { accuracy: 'high' } });
  sim2.run({ untilT: T });
  assert.ok(Math.abs(sim2.t - T) < 1.0);
  const back = propagateKepler(b.mu, r0, v0, T - sim2.t); // remaining/overshoot time is tiny
  const drT = Math.hypot(sim2.y[0] - r0[0], sim2.y[1] - r0[1], sim2.y[2] - r0[2]);
  assert.ok(drT < Math.abs(sim2.t - T) * len(v0) + 5, `position error after one period ${drT} m`);
});

test('orbital elements <-> state vectors and Hohmann transfer (textbook LEO -> GEO)', () => {
  const mu = 3.986004418e14;
  const s = circularOrbitState(mu, 7.0e6, 0.5, 1.0, 2.0);
  const el = elementsFromState(mu, s.r, s.v);
  assert.ok(el.e < 1e-9 && rel(el.a, 7.0e6) < 1e-9);
  const h = hohmann(mu, 6678e3, 42164e3);
  const dv1 = h.dv1 ?? h.dvs?.[0], dv2 = h.dv2 ?? h.dvs?.[1];
  assert.ok(Math.abs(dv1 - 2426) < 15 && Math.abs(dv2 - 1467) < 15, `dv ${dv1} ${dv2}`);
});

test('atmosphere models: U.S. Standard Atmosphere 1976 and Mars reference values', () => {
  const a = new Atmosphere({ model: 'us76' });
  const ref = [[0, 1.2250], [5000, 0.7364], [11000, 0.36392], [20000, 0.088035], [30000, 0.018410], [50000, 1.0269e-3]];
  for (const [h, rho] of ref) assert.ok(rel(a.query(h).rho, rho) < 0.01, `rho(${h} m)=${a.query(h).rho} vs ${rho}`);
  assert.ok(rel(a.query(0).p, 101325) < 1e-4 && Math.abs(a.query(0).T - 288.15) < 1e-6);
  const m = new Atmosphere({ model: 'glenn-mars' });
  assert.ok(rel(m.query(0).p, 699) < 0.02);
  assert.ok(rel(m.query(0).rho, 0.0155) < 0.1);
});

test('staging: separation conserves velocity (momentum), removes exactly the stage mass, and the upper stage keeps flying', () => {
  const lower = engineStage({ dry: 100, prop: 300, thrust: 6000, isp: 300, group: 'lower' });
  const veh = { ...lower, components: [...lower.components, { id: 'up', kind: 'payload', name: 'Upper mass', mount: 'stack', group: 'upper', mass: 80, length: 0.5, diameter: 0.5, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 }], stages: [{ id: 'lower', name: 'Lower', order: 1 }, { id: 'upper', name: 'Upper', order: 2 }] };
  const sim = new Simulation({ vehicle: veh, mission: noneMission({ type: 'state', r: [7e6, 0, 0], v: [0, 0, 0], body: 'void' }, { guidance: { mode: 'inertial', params: { vector: [1, 0, 0] } }, events: [
    { id: 'i', name: 'Ignite', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'lower' } },
    { id: 's', name: 'Shutdown', condition: { type: 'time', value: 20 }, action: { type: 'SHUTDOWN', group: 'lower' } },
    { id: 'x', name: 'Separate', condition: { type: 'time', value: 25 }, action: { type: 'SEPARATE', group: 'lower' } }] }), environment: { body: 'void' } });
  sim.run({ untilT: 24.9 });
  const vBefore = sim.now.speed, mBefore = sim.fv.mass;
  sim.run({ untilT: 25.5 });
  assert.ok(rel(sim.now.speed, vBefore) < 1e-9, 'velocity continuous across separation');
  assert.ok(Math.abs(sim.fv.mass - 80) < 1e-9, `mass after separation ${sim.fv.mass}`);
  assert.ok(mBefore > 80 && sim.separations.length === 1);
  // rocket equation for the first burn: 500 kg -> 500 - 20 s * mdot
  const mdot = 6000 / (300 * G0);
  assert.ok(rel(vBefore, 300 * G0 * Math.log(480 / (480 - 20 * mdot))) < 5e-3);
});

test('vehicle mass properties: mass and centre of gravity are the sums over components', async () => {
  const { computeMassProperties } = await import('../physics/vehicle-model.js');
  const veh = engineStage({ dry: 100, prop: 400 });
  const mp = computeMassProperties(veh);
  assert.ok(Math.abs(mp.mass - 500) < 1e-9 && Math.abs(mp.dryMass - 100) < 1e-9 && Math.abs(mp.propellantMass - 400) < 1e-9);
  assert.ok(mp.cg > 0 && mp.cg < mp.length);
});

test('determinism: identical inputs give bit-identical results', () => {
  const mk = () => new Simulation({ vehicle: engineStage({ dry: 100, prop: 200, thrust: 4000 }), mission: noneMission({ type: 'orbit', altitude: 300e3 }, { guidance: { mode: 'prograde' }, events: [{ id: 'i', name: 'Ignite', condition: { type: 'time', value: 10 }, action: { type: 'IGNITE', group: 'main' } }] }), environment: { body: 'vacearth' } });
  const a = mk(), b = mk();
  a.run({ untilT: 300 }); b.run({ untilT: 300 });
  assert.deepEqual([...a.y], [...b.y]);
  assert.equal(a.telemetry.count, b.telemetry.count);
});

test('sphere-of-influence radii (Laplace) match published values', () => {
  assert.ok(rel(getBody('moon').soi, 6.62e7) < 0.02);
  assert.ok(rel(getBody('earth').soi, 9.25e8) < 0.02);
  assert.ok(rel(getBody('mars').soi, 5.77e8) < 0.02);
});
