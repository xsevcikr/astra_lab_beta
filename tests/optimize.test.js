// Trajectory and trade optimisers (src/optimize): methods, staging, transfer burns, ascent path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nelderMead, nelderMeadAsync, goldenSection, bisect, paretoFront } from '../src/optimize/methods.js';
import { optimalStaging, numericStaging, stagingTrade, compareWithOptimum, familyStages } from '../src/optimize/staging.js';
import { optimiseOrbitTransfer, optimiseInterplanetary, biellipticDv } from '../src/optimize/transfer.js';
import { optimiseAscent, ascentOptimisable, flyAscent, missionWith, upperStageInfo } from '../src/optimize/ascent.js';
import { hohmann } from '../physics/orbital.js';
import { findTransferWindows, dateToEpoch } from '../physics/mission-design.js';
import { getBody } from '../physics/bodies.js';
import { G0 } from '../physics/constants.js';
import { templateById } from '../data/templates.js';

const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

// ------------------------------------------------------------------ methods
test('Nelder-Mead finds the Rosenbrock minimum and stays inside the bounds', () => {
  const vars = [{ id: 'x', min: -2, max: 2 }, { id: 'y', min: -1, max: 3 }];
  const f = ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2;
  const r = nelderMead(f, vars, [-1.5, 2], { maxEvaluations: 3000, tolX: 1e-10 });
  assert.ok(Math.abs(r.x[0] - 1) < 1e-3 && Math.abs(r.x[1] - 1) < 2e-3, `got ${r.x}`);
  assert.ok(r.history.every((h) => h.x[0] >= -2 && h.x[0] <= 2 && h.x[1] >= -1 && h.x[1] <= 3), 'every evaluated point is inside the box');
  // optimum on a bound
  const b = nelderMead(([x]) => -x, [{ id: 'x', min: 0, max: 5 }], [1], { maxEvaluations: 200 });
  assert.ok(Math.abs(b.x[0] - 5) < 1e-4, `bound optimum ${b.x[0]}`);
});

test('Nelder-Mead (async) respects the evaluation budget and can be stopped', async () => {
  const vars = [{ id: 'x', min: -5, max: 5 }, { id: 'y', min: -5, max: 5 }];
  let n = 0;
  const r = await nelderMeadAsync(async ([x, y]) => { n++; return (x - 1) ** 2 + (y + 2) ** 2; }, vars, [3, 3], { maxEvaluations: 25 });
  assert.ok(n <= 25 && r.evaluations === n);
  let k = 0;
  const s = await nelderMeadAsync(async ([x]) => { k++; return x * x; }, vars, [3, 3], { maxEvaluations: 100, shouldStop: () => k >= 5 });
  assert.equal(s.stopped, true); assert.equal(s.history.length, 5);
});

test('golden section, bisection and the Pareto front', () => {
  assert.ok(Math.abs(goldenSection((x) => (x - 2.5) ** 2, 0, 10).x - 2.5) < 1e-6);
  assert.ok(Math.abs(bisect((x) => x * x - 2, 0, 2) - Math.SQRT2) < 1e-9);
  assert.equal(bisect((x) => x * x + 1, 0, 2), null);
  const pts = paretoFront([{ a: 1, b: 5 }, { a: 2, b: 2 }, { a: 3, b: 3 }, { a: 5, b: 1 }], [{ key: 'a', better: 'lower' }, { key: 'b', better: 'lower' }]);
  assert.deepEqual(pts.map((p) => p.dominated), [false, false, true, false]);
  assert.deepEqual(pts[2].dominatedBy, [1]);
});

// ------------------------------------------------------------------ staging
test('closed-form optimal staging matches a brute-force numerical optimum (2 and 3 stages)', () => {
  for (const stages of [[{ isp: 300, eps: 0.07 }, { isp: 345, eps: 0.09 }], [{ isp: 270, eps: 0.1 }, { isp: 320, eps: 0.11 }, { isp: 450, eps: 0.14 }]]) {
    const a = optimalStaging({ dv: 9300, payload: 1000, stages }), b = numericStaging({ dv: 9300, payload: 1000, stages });
    assert.ok(a.feasible && b.feasible);
    assert.ok(rel(a.dv, 9300) < 1e-9, 'delta-v budget is met exactly');
    assert.ok(a.gross <= b.gross * (1 + 1e-7), `closed form ${a.gross} vs numeric ${b.gross}`);
    assert.ok(rel(a.gross, b.gross) < 1e-5);
  }
});

test('identical stages share the delta-v equally; the rocket equation holds per stage', () => {
  const r = optimalStaging({ dv: 8000, payload: 500, stages: familyStages('kerolox', 1).concat(familyStages('kerolox', 1)) });
  assert.ok(Math.abs(r.stages[0].dv - r.stages[1].dv) < 1e-6);
  for (const s of r.stages) {
    assert.ok(rel(s.isp * G0 * Math.log(s.ignitionMass / (s.ignitionMass - s.propellant)), s.dv) < 1e-9);
    assert.ok(rel(s.structure / (s.structure + s.propellant), s.eps) < 1e-9);
  }
});

test('staging beyond the theoretical limit is reported as infeasible', () => {
  const r = optimalStaging({ dv: 12000, payload: 100, stages: [{ isp: 300, eps: 0.1 }] });   // limit 300*9.81*ln(10) = 6774 m/s
  assert.equal(r.feasible, false); assert.ok(r.dvMax > 6700 && r.dvMax < 6800);
});

test('staging trade: Pareto set is non-dominated and the best row is the lightest', () => {
  const T = stagingTrade({ dv: 9300, payload: 1000 });
  const ok = T.rows.filter((r) => r.feasible);
  assert.ok(ok.length > 5 && T.pareto.length >= 1);
  assert.equal(T.best, ok.reduce((a, b) => (b.gross < a.gross ? b : a)).id);
  for (const id of T.pareto) {
    const p = T.rows.find((r) => r.id === id);
    assert.ok(!ok.some((q) => q !== p && q.gross <= p.gross && q.dryMass <= p.dryMass && q.count <= p.count && (q.gross < p.gross || q.dryMass < p.dryMass || q.count < p.count)));
  }
  assert.ok(T.rows.find((r) => r.id === 'kerolox-1').feasible === false, 'one kerolox stage cannot reach orbit');
});

test('a real vehicle is compared with the optimum split for the same delta-v', () => {
  const { vehicle } = templateById('small-launcher').make();
  const c = compareWithOptimum(vehicle);
  assert.equal(c.vehicle.stages.length, 2);
  assert.ok(rel(c.optimum.dv, c.vehicle.dv) < 1e-9);
  assert.ok(c.optimum.gross <= c.vehicle.gross + 1e-6, 'the optimum split is never heavier');
  assert.ok(c.payloadAtSameGross >= c.vehicle.payload - 1e-9);
});

// ------------------------------------------------------------------ transfers
test('orbit transfer: Hohmann wins below the bi-elliptic crossover, bi-elliptic wins far above it', () => {
  const E = getBody('earth');
  const low = optimiseOrbitTransfer({ alt1: 300e3, alt2: 35786e3, dIncDeg: 0 });
  assert.equal(low.best.id, 'hohmann-split');
  assert.ok(rel(low.best.dv, hohmann(E.mu, E.radius + 300e3, E.radius + 35786e3).dvTotal) < 1e-9);
  assert.ok(Math.abs(low.best.dv - 3893) < 5, `LEO to GEO ${low.best.dv}`);
  const hi = optimiseOrbitTransfer({ alt1: 200e3, alt2: 400000e3, dIncDeg: 0 });   // radius ratio ~ 63
  assert.equal(hi.best.id, 'bielliptic');
  assert.ok(hi.best.dv < hi.options.find((o) => o.id === 'hohmann-split').dv);
  // a bi-elliptic transfer whose high point is the target orbit is exactly the Hohmann transfer
  const r1 = E.radius + 300e3, r2 = E.radius + 20000e3;
  assert.ok(rel(biellipticDv(E.mu, r1, r2, r2).dv, hohmann(E.mu, r1, r2).dvTotal) < 1e-9);
});

test('orbit transfer with a plane change: the optimised split beats doing the turn in one place', () => {
  const r = optimiseOrbitTransfer({ alt1: 300e3, alt2: 35786e3, dIncDeg: 28.5 });
  const by = Object.fromEntries(r.options.map((o) => [o.id, o.dv]));
  assert.ok(by['hohmann-split'] <= by['hohmann-first'] && by['hohmann-split'] <= by['hohmann-second'] && by['hohmann-split'] <= by.separate);
  assert.ok(r.best.dv <= by['hohmann-split'] + 1e-6);
  assert.ok(by['hohmann-split'] > 4150 && by['hohmann-split'] < 4300, `GTO-style 28.5 deg transfer ${by['hohmann-split']}`);
  assert.ok(Math.abs(r.best.split.reduce((a, b) => a + b, 0) - 28.5) < 1e-6, 'the whole turn is done');
});

test('interplanetary optimiser finds the Earth-Mars window at least as well as the window scan', () => {
  const startT = dateToEpoch('2026-01-01T00:00:00Z');
  const r = optimiseInterplanetary({ startT, spanDays: 700, cost: 'c3' });
  const w = findTransferWindows({ startT, spanDays: 700 })[0];
  assert.ok(r.best && w);
  assert.ok(r.best.c3 <= w.c3 * 1.005, `optimiser C3 ${r.best.c3 / 1e6} vs scan ${w.c3 / 1e6}`);
  assert.ok(Math.abs(r.best.t0 - w.t0) < 15 * 86400, 'same window');
  const tot = optimiseInterplanetary({ startT, spanDays: 700, cost: 'total' });
  assert.ok(tot.best.dvTotal <= r.best.dvTotal + 1e-6, 'minimising total delta-v gives a total no higher than minimising C3');
  assert.equal(r.grid.values.length, r.grid.t0s.length);
});

// ------------------------------------------------------------------ ascent
test('ascent optimiser refuses missions it cannot tune', () => {
  const { vehicle, mission } = templateById('small-launcher').make();
  assert.equal(ascentOptimisable(vehicle, mission), null);
  assert.match(ascentOptimisable({ ...vehicle, type: 'rover' }, mission), /rockets/);
  assert.match(ascentOptimisable(vehicle, { ...mission, guidance: { mode: 'pitch_program', params: {} } }), /ascent/);
  assert.match(ascentOptimisable(vehicle, { ...mission, objective: { type: 'suborbital', altitude: 1e5 } }), /orbit/);
  const m2 = missionWith(mission, [5, 120000, 0.5, 3]);
  assert.equal(m2.guidance.params.kickAngle, 5); assert.equal(m2.guidance.params.schedule.hF, 120000); assert.equal(mission.guidance.params.kickAngle, 3.5, 'the original mission is not changed');
});

test('ascent: a max-Q cap below the flight\'s max Q makes the flight infeasible with a reason', async () => {
  const { vehicle, mission } = templateById('small-launcher').make();
  const r = await flyAscent({ vehicle, mission, limits: { maxQ: 10000 } });
  assert.equal(r.reached, true); assert.equal(r.feasible, false);
  assert.match(r.reason, /dynamic pressure/);
  assert.ok(r.propLeft > 0 && r.propLeft < upperStageInfo(vehicle).propellant, 'left-over propellant is measured in the last stage');
});

test('ascent optimiser never returns a worse path than the mission\'s own', async () => {
  const { vehicle, mission } = templateById('small-launcher').make();
  const r = await optimiseAscent(vehicle, mission, { maxFlights: 7, robustChecks: 0 });
  assert.ok(r.history.length <= 7);
  assert.equal(r.baseline.n, 1);
  assert.ok(r.baseline.feasible, 'the template flies as it is');
  assert.ok(r.best.feasible && r.best.propLeft >= r.baseline.propLeft);
  assert.ok(r.best.maxQ <= r.baseline.maxQ * 1.1 + 1e-6, 'the automatic max-Q cap holds');
  assert.equal(r.mission.guidance.params.kickAngle, r.best.x.kickAngle);
  assert.ok(typeof r.explanation === 'string' && r.explanation.length > 40);
});
