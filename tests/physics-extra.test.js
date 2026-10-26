// Mission-design calculators added in physics/mission-design.js: checked against closed-form results and published dates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBody } from '../physics/bodies.js';
import { propagateKepler, hohmann, planeChangeDv, circularSpeed, visViva } from '../physics/orbital.js';
import * as M from '../physics/mission-design.js';

const AU = 1.495978707e11;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12), `${msg ?? ''} got ${a}, expected ${b} (tol ${tol})`);
const SUN = getBody('sun'), EARTH = getBody('earth');

test('pure plane change: 28.5 deg at LEO speed matches 2 v sin(di/2)', () => {
  const v = circularSpeed(EARTH.mu, EARTH.radius + 200e3);
  const di = 28.5 * Math.PI / 180;
  near(M.planeChangeDv(v, di), 2 * v * Math.sin(di / 2), 1e-12);
  near(M.combinedBurnDv(v, v, di), M.planeChangeDv(v, di), 1e-12, 'combined burn with equal speeds is a pure rotation');
  near(M.combinedBurnDv(v, 1.3 * v, 0), 0.3 * v, 1e-12, 'no turn: just the speed difference');
});

test('LEO -> GEO with 28.5 deg plane change: combining the burns is cheaper than doing them separately (textbook values)', () => {
  const r1 = EARTH.radius + 185e3, r2 = 42164e3, di = 28.5 * Math.PI / 180;
  const o = M.planeChangeOptions(EARTH.mu, r1, r2, di);
  // textbook: Hohmann LEO -> GEO is about 3.9 km/s, the whole turn in the 2nd burn is about 4.2 km/s, the best split about 4.1 km/s
  near(o.hohmannOnly, 3.9e3, 0.03, 'hohmann');
  assert.ok(o.bestSplit <= o.atFirst + 1e-6 && o.bestSplit <= o.atSecond + 1e-6, 'best split is the minimum');
  assert.ok(o.bestSplit < o.separate, 'combined < separate');
  assert.ok(o.bestSplitAngle > 0 && o.bestSplitAngle < di / 4, 'most of the turn is done at the high orbit (small turn at LEO)');
});

test('circularisation burn at apoapsis equals the vis-viva speed difference', () => {
  const rp = EARTH.radius + 200e3, ra = EARTH.radius + 35786e3;
  const c = M.circularisationDv(EARTH.mu, rp, ra, 'apoapsis');
  near(c.vNow, visViva(EARTH.mu, ra, (rp + ra) / 2), 1e-12);
  near(c.dv, hohmann(EARTH.mu, rp, ra).dv2, 1e-9, 'equals the second Hohmann burn');
});

test('rotation benefit: equator launch due east gives 465 m/s, due north gives none', () => {
  near(M.rotationBenefit('earth', 0, 90), 465.1, 0.002);
  assert.ok(Math.abs(M.rotationBenefit('earth', 0, 0)) < 1e-9);
  near(M.rotationBenefit('earth', 28.573, 90), 465.1 * Math.cos(28.573 * Math.PI / 180), 0.002);
});

test('synodic period and Hohmann phase angle Earth -> Mars equal the textbook values', () => {
  const Te = 2 * Math.PI * Math.sqrt(AU ** 3 / SUN.mu), rMars = 1.523679 * AU;
  const Tm = 2 * Math.PI * Math.sqrt(rMars ** 3 / SUN.mu);
  near(M.synodicPeriod(Te, Tm) / 86400, 779.9, 0.001);
  near(M.hohmannPhaseAngle(AU, rMars) * 180 / Math.PI, 44.3, 0.005);
});

test('Lambert: reproduces a Kepler propagation (round trip, elliptic and hyperbolic-ish short arcs)', () => {
  const mu = SUN.mu;
  const r0 = [1.0 * AU, 0, 0], v0 = [0, 31000, 2000];
  for (const dt of [60 * 86400, 200 * 86400, 400 * 86400]) {
    const p = propagateKepler(mu, r0, v0, dt);
    const L = M.lambert(mu, r0, p.r, dt);
    assert.ok(L, 'solution exists');
    for (let i = 0; i < 3; i++) { assert.ok(Math.abs(L.v1[i] - v0[i]) < 0.05, `v1[${i}] dt=${dt / 86400}d: ${L.v1[i]} vs ${v0[i]}`); assert.ok(Math.abs(L.v2[i] - p.v[i]) < 0.05, `v2[${i}] dt=${dt / 86400}d`); }
  }
});

test('Lambert: 180 degree circular-to-circular arc is the Hohmann transfer (v_inf 2.94 km/s out, 2.65 km/s in, 258.8 days)', () => {
  const r1 = AU, r2 = 1.523679 * AU;
  const h = hohmann(SUN.mu, r1, r2);
  const tof = h.tof;
  near(tof / 86400, 258.8, 0.002);
  // slightly off 180 degrees to avoid the singular geometry
  const th = Math.PI - 1e-4;
  const L = M.lambert(SUN.mu, [r1, 0, 0], [r2 * Math.cos(th), r2 * Math.sin(th), 0], tof);
  const v1c = circularSpeed(SUN.mu, r1), v2c = circularSpeed(SUN.mu, r2);
  const vinf1 = Math.hypot(L.v1[0], L.v1[1] - v1c);
  near(vinf1, 2943, 0.005, 'departure v_inf');
  // arrival v_inf: difference to the circular velocity vector at arrival (direction tangent at th)
  const vcArr = [-v2c * Math.sin(th), v2c * Math.cos(th), 0];
  near(Math.hypot(L.v2[0] - vcArr[0], L.v2[1] - vcArr[1]), 2648, 0.005, 'arrival v_inf');
});

test('Earth -> Mars launch windows from the ephemerides land where real missions launched', () => {
  const w = M.findTransferWindows({ from: 'earth', to: 'mars', startT: M.dateToEpoch('2018-01-01T00:00:00Z'), spanDays: 2900, stepDays: 6 });
  assert.ok(w.length >= 4, `found ${w.length} windows`);
  const days = (d) => (Date.parse(d) - Date.parse('2000-01-01T12:00:00Z')) / 1000;
  const find = (iso, within) => w.find((x) => Math.abs(x.t0 - days(iso)) < within * 86400);
  // InSight 2018-05-05 (C3 ~ 8), Perseverance 2020-07-30 (C3 ~ 14): launch dates sit inside the 3-4 week opportunity, so +/- 30 days
  const a = find('2018-05-05T00:00:00Z', 30), b = find('2020-07-30T00:00:00Z', 30);
  assert.ok(a, 'InSight window'); assert.ok(b, 'Mars 2020 window');
  assert.ok(a.c3 / 1e6 > 6 && a.c3 / 1e6 < 12, `2018 C3 ${a.c3 / 1e6}`);
  assert.ok(b.c3 / 1e6 > 10 && b.c3 / 1e6 < 18, `2020 C3 ${b.c3 / 1e6}`);
  // windows are about one synodic period (780 days) apart
  for (let i = 1; i < w.length; i++) near((w[i].t0 - w[i - 1].t0) / 86400, 780, 0.12, 'spacing');
  // arrival speed at Mars of a minimum-energy transfer is 2.5 - 3.3 km/s
  for (const x of w) assert.ok(x.vInfArr > 2400 && x.vInfArr < 3500, `v_inf arrival ${x.vInfArr}`);
});

test('phase-angle windows (first-order) fall within two months of the Lambert windows', () => {
  const start = M.dateToEpoch('2018-01-01T00:00:00Z');
  const hw = M.hohmannWindows({ startT: start, spanDays: 3000 });
  const pw = M.findTransferWindows({ startT: start, spanDays: 3000, stepDays: 6 });
  assert.ok(hw.length >= 3);
  for (const h of hw) { const near2 = pw.some((p) => Math.abs(p.t0 - h.t0) < 70 * 86400); assert.ok(near2, `no Lambert window near ${h.date.toISOString()}`); }
});

test('interplanetary transfer: departure burn from a 200 km parking orbit for an Earth-Mars Hohmann-like transfer is about 3.6 km/s', () => {
  const t0 = M.dateToEpoch('2020-07-19T00:00:00Z');
  const tr = M.interplanetaryTransfer({ from: 'earth', to: 'mars', t0, tof: 200 * 86400, parkFrom: 200e3 });
  assert.ok(tr.dvDeparture > 3500 && tr.dvDeparture < 4100, `dv ${tr.dvDeparture}`);
  near(tr.c3, tr.vInfDep ** 2, 1e-12);
});

test('delta-v budget closes: ideal - losses = speed gained', () => {
  const b = M.deltaVBudget({ ideal: 9540, gravity: 944, drag: 62.5, steering: 1139.6 }, 408, 7792);
  assert.ok(Math.abs(b.residual) < 15, `residual ${b.residual}`);
  near(b.lossFraction, (944 + 62.5 + 1139.6) / 9540, 1e-9);
});

test('date conversion: epoch 0 is J2000', () => {
  assert.equal(M.epochToDate(0).toISOString(), '2000-01-01T12:00:00.000Z');
  near(M.dateToEpoch('2000-01-02T12:00:00Z'), 86400, 1e-12);
});
