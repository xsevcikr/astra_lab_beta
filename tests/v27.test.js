// ASTRA LAB 2.7: the fixes from the engineering audit (tilted Earth, true Earth rotation, the Moon in its real orbit plane, drag in orbit,
// one atmosphere for both physics engines, J3/J4 and third-body gravity, aerodynamic pitch damping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBody, bodyStateRelParent, bodyStateAbs, sunDirection, rotationAngle, convertFrame, toRoot, fromRoot, surfacePointInertial, latLonFromInertial } from '../physics/bodies.js';
import { zonalAccel, thirdBodies, thirdBodyAccel } from '../physics/gravity.js';
import { Atmosphere } from '../physics/atmosphere.js';
import { atmosphere as engAtmosphere } from '../src/engineering/core/atmosphere.js';
import { Simulation } from '../physics/simulation.js';
import { readFileSync } from 'node:fs';
import { convertTime } from '../physics/time.js';
import './helpers.js';   // registers the airless 'vacearth'

const DEG = Math.PI / 180, DAY = 86400, YEAR = 365.25 * DAY;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

test('the Earth is tilted: the Sun climbs and falls by the obliquity (23.44 deg) over a year, and is on the equator at the equinoxes', () => {
  let lo = 90, hi = -90;
  for (let d = 0; d < 366; d++) { const s = sunDirection('earth', d * DAY); const dec = Math.asin(s[2]) / DEG; // sunDirection points from the body TO the Sun... sign: it is body -> Sun
    lo = Math.min(lo, -dec); hi = Math.max(hi, -dec); }
  assert.ok(Math.abs(hi - 23.44) < 0.5 && Math.abs(lo + 23.44) < 0.5, `declination range ${lo.toFixed(2)} .. ${hi.toFixed(2)}`);
});

test('the Earth rotation angle at J2000 UT1 is the true 280.46 deg, and a surface point round-trips through latitude/longitude', () => {
  assert.ok(Math.abs(rotationAngle('earth', convertTime(0, 'UT1', 'TDB')) / DEG - 280.46061837) < 1e-6);   // epoch = TDB, rotation follows UT1 (physics/time.js)
  const r = surfacePointInertial('earth', 28.573 * DEG, -80.649 * DEG, 123456, 6378137), ll = latLonFromInertial('earth', r, 123456);
  assert.ok(Math.abs(ll.lat / DEG - 28.573) < 1e-9 && Math.abs(ll.lon / DEG + 80.649) < 1e-9);
});

test('the Moon orbits 5.145 deg from the ecliptic, so 18 to 29 deg from the Earth equator, and its node regresses with an 18.6 year period', () => {
  let lo = 90, hi = 0;
  for (let k = 0; k < 19 * 12; k++) {
    const t = k * 30.4 * DAY, s = bodyStateRelParent('moon', t), h = cross(s.r, s.v);
    const incl = Math.acos(h[2] / len(h)) / DEG;
    lo = Math.min(lo, incl); hi = Math.max(hi, incl);
    const hRoot = cross(toRoot('earth', s.r), toRoot('earth', s.v)), inclEcl = Math.acos(hRoot[2] / len(hRoot)) / DEG;
    assert.ok(inclEcl > 4.95 && inclEcl < 5.35, `ecliptic inclination ${inclEcl}`);   // DE440: 5.145 deg mean, +-0.15 deg solar perturbation
  }
  assert.ok(lo > 17.8 && lo < 18.8 && hi > 28 && hi < 29, `equatorial inclination range ${lo.toFixed(2)} .. ${hi.toFixed(2)}`);
});

test('frames: converting Earth axes -> Moon axes -> Earth axes returns the vector; heliocentric positions add up through the chain', () => {
  const v = [1.2e6, -3.4e6, 5.6e6], back = convertFrame('moon', 'earth', convertFrame('earth', 'moon', v));
  assert.ok(len([back[0] - v[0], back[1] - v[1], back[2] - v[2]]) < 1e-6);
  const moon = bodyStateAbs('moon', 5 * DAY).r, earth = bodyStateAbs('earth', 5 * DAY).r, rel = toRoot('earth', bodyStateRelParent('moon', 5 * DAY).r);
  assert.ok(len([moon[0] - earth[0] - rel[0], moon[1] - earth[1] - rel[1], moon[2] - earth[2] - rel[2]]) < 1);
  assert.ok(Math.abs(len(earth) / 1.495978707e11 - 1) < 0.02);
});

test('the Moon pole (IAU mean pole) is within 2 deg of the ecliptic pole, not 23 deg away as the Earth pole is', () => {
  const z = toRoot('moon', [0, 0, 1]), zm = toRoot('earth', [0, 0, 1]);
  assert.ok(Math.acos(z[2]) / DEG < 2, `${Math.acos(z[2]) / DEG}`);
  assert.ok(Math.abs(Math.acos(zm[2]) / DEG - 23.4393) < 1e-3);
});

test('J2, J3 and J4 acceleration equals the gradient of the potential', () => {
  const E = getBody('earth'), p = [3e6, 2e6, 5.5e6];
  const U = (x, y, z) => { const r = Math.hypot(x, y, z), s = z / r, f = (E.radius / r); return (E.mu / r) * (1 - E.j2 * f ** 2 * ((3 * s * s - 1) / 2) - E.j3 * f ** 3 * ((5 * s ** 3 - 3 * s) / 2) - E.j4 * f ** 4 * ((35 * s ** 4 - 30 * s * s + 3) / 8)); };
  const num = [0, 1, 2].map((i) => { const a = [...p], b = [...p]; a[i] += 1; b[i] -= 1; return (U(...a) - U(...b)) / 2; });
  const r = len(p), a = zonalAccel(E, ...p, [-E.mu * p[0] / r ** 3, -E.mu * p[1] / r ** 3, -E.mu * p[2] / r ** 3]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - num[i]) < 1e-6 * Math.abs(num[i]) + 1e-9, `axis ${i}: ${a[i]} vs ${num[i]}`);
});

test('third body: at the geostationary radius the Moon pulls with about 7e-6 m/s2 (tidal) and the Sun with about 3e-6', () => {
  const tb = thirdBodies('earth', 0), r = 42164e3;
  const moon = thirdBodyAccel([tb[0]], r, 0, 0, [0, 0, 0]), sun = thirdBodyAccel([tb[1]], r, 0, 0, [0, 0, 0]);
  assert.ok(len(moon) > 1e-6 && len(moon) < 1.5e-5, `moon ${len(moon)}`);
  assert.ok(len(sun) > 1e-6 && len(sun) < 8e-6, `sun ${len(sun)}`);
});

test('the Engineering atmosphere now agrees with the main simulator at 120, 300 and 400 km (it used a 7 km scale height above 86 km)', () => {
  const a = new Atmosphere({ model: 'us76', height: 1e9 });
  for (const h of [100e3, 120e3, 300e3, 400e3]) assert.ok(Math.abs(engAtmosphere('earth', h).density / a.query(h).rho - 1) < 1e-9, `${h}`);
});

function orbitMission() {
  const v = JSON.parse(readFileSync(new URL('../vehicles/space-probe.vehicle.json', import.meta.url), 'utf8')); const veh = v.vehicle ?? v;
  return { vehicle: veh, mission: { name: 'decay', initial: { type: 'orbit', altitude: 220e3, inclination: 51.6 }, guidance: { mode: 'none' }, maxTime: 6 * 3600, events: [], objective: { type: 'none' } } };
}
test('drag acts in orbit: a 220 km orbit loses height in 2 hours, and loses nothing in the vacuum version of the Earth', () => {
  const run = (body) => { const { vehicle, mission } = orbitMission(); const sim = new Simulation({ vehicle, mission, environment: { body }, settings: { maxTime: 7200 } }); while (!sim.finished && sim.t < 7200) sim.step(); return len([sim.y[0], sim.y[1], sim.y[2]]) - getBody('earth').radius; };
  const withDrag = run('earth'), vac = run('vacearth');
  assert.ok(vac - withDrag > 100, `decay ${(vac - withDrag).toFixed(0)} m`);
});

test('drag reaches 1000 km but the "is it an orbit" limit stays at 150 km', () => {
  const E = getBody('earth'); assert.ok(E.atmosphereModel.dragHeight >= 1e6);
  assert.ok(getBody('earth').atmosphereModel.height === 150000, 'the orbit-stability limit stays at 150 km');
});

import { splitSummary, compareRows } from '../src/core/validation.js';
test('validation scoreboard: build checks are counted apart from predictions, loose context rows cannot hide a 20 % miss, a failed flight is shown', () => {
  const V = { flight: { pitch: [[0, 90]] }, rows: [
    { id: 'a', metric: 'liftoffMass', value: 100, tol: 0.05, kind: 'graded' }, { id: 'b', metric: 'maxQT', value: 100, tol: 0.1, kind: 'graded' },
    { id: 'c', metric: 's1CutoffAlt', value: 100, tol: null, kind: 'context' }, { id: 'd', metric: 's1CutoffSpeed', value: 100, tol: null, kind: 'context' } ] };
  const rows = compareRows(V, { liftoffMass: 101, maxQT: 105, s1CutoffAlt: 80, s1CutoffSpeed: 110 });
  const s = splitSummary(rows, V, false);
  assert.deepEqual(s.build, { pass: 1, total: 1 }); assert.deepEqual(s.prediction, { pass: 1, total: 1 });
  assert.equal(s.context.misses.length, 1); assert.equal(s.context.misses[0].id, 'c');
  assert.equal(s.fitted, true); assert.equal(s.reached, false);
});
