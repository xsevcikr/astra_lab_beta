import test from 'node:test';
import assert from 'node:assert/strict';
import { runMonteCarlo } from '../src/engineering/analysis/montecarlo.js';
import { lunarLandingModel, entryModel, ascentModel, rendezvousModel } from '../src/engineering/analysis/models.js';
import { tornado, successDrivers } from '../src/engineering/analysis/sensitivity.js';
import { sweepModel, sweepVehicle } from '../src/engineering/analysis/sweep.js';
import { tradeStudy } from '../src/engineering/analysis/trade.js';
import { optimize } from '../src/engineering/analysis/optimize.js';
import { landerSizing } from '../src/engineering/analysis/experiments.js';
import { wilson, describe, ellipse } from '../src/engineering/analysis/stats.js';
import { loadVehicle } from '../src/engineering/vehicle/library.js';
import { performance } from '../src/engineering/vehicle/model.js';
import { simulateAscent } from '../src/engineering/flight/ascent.js';
import { sampleParam } from '../src/engineering/analysis/uncertainty.js';
import { makeRng } from '../src/engineering/core/rng.js';

test('Monte Carlo is reproducible from its seed and records inputs with outputs', () => {
  const a = runMonteCarlo(entryModel(), { runs: 20, seed: 9 }), b = runMonteCarlo(entryModel(), { runs: 20, seed: 9 });
  assert.deepEqual(a.results.map((r) => r.metrics.maxG), b.results.map((r) => r.metrics.maxG));
  assert.ok(a.results.every((r) => r.inputs && r.seed));
  assert.ok(a.metrics.maxG.histogram.counts.reduce((x, y) => x + y, 0) === a.metrics.maxG.n);
});
test('Monte Carlo of the lunar landing reports probability with a confidence interval', () => {
  const r = runMonteCarlo(lunarLandingModel(), { runs: 30, seed: 2 });
  assert.ok(r.successProbability.lo <= r.successProbability.p && r.successProbability.p <= r.successProbability.hi);
  assert.ok(r.metrics.propellantRemaining.n > 0);
  assert.equal(successDrivers(r).length, r.params.length);
});
test('uncertainty sampling respects distributions and bounds', () => {
  const rng = makeRng(1);
  const v = Array.from({ length: 5000 }, () => sampleParam({ nominal: 1, sd: 0.1, min: 0.9, distribution: 'normal' }, rng));
  assert.ok(Math.min(...v) >= 0.9);
  const u = Array.from({ length: 5000 }, () => sampleParam({ min: 2, max: 3, distribution: 'uniform' }, rng));
  assert.ok(Math.abs(describe(u).mean - 2.5) < 0.02);
});
test('statistics helpers', () => {
  const w = wilson(95, 100); assert.ok(w.lo > 0.88 && w.hi < 0.985);
  const e = ellipse([0, 1, 2, 3, 4], [0, 1, 2, 3, 4.1]); assert.ok(e.rx > e.ry);
});
test('tornado ranks parameters by influence', () => {
  const t = tornado(lunarLandingModel(), 'propellantRemaining');
  assert.ok(t.rows.length >= 8);
  for (let i = 1; i < t.rows.length; i++) if (t.rows[i - 1].flipsOutcome === t.rows[i].flipsOutcome) assert.ok(t.rows[i - 1].swing >= t.rows[i].swing);
});
test('parameter sweep: more upper-stage propellant raises delta-v; thrust sweep changes acceleration', () => {
  const rows = sweepVehicle(loadVehicle('small-launcher'), 'stages.1.propMass', 1500, 3000, 4, (v) => ({ success: true, metrics: performance(v) }));
  assert.ok(rows[3].totalDv > rows[0].totalDv);
  const s = sweepModel(entryModel(), 'gammaError', -2, 2, 5); assert.ok(s[0].maxG > s[2].maxG && s[2].maxG > s[4].maxG, 'steeper entry gives higher deceleration');
});
test('trade study ranks designs and reports the Pareto set', () => {
  const a = loadVehicle('small-launcher'), b = loadVehicle('small-launcher');
  b.id = 'b'; b.name = 'Bigger upper stage'; b.stages[1].propMass = 2600; b.stages[1].dryMass = 280;
  const t = tradeStudy([a, b]);
  assert.equal(t.rows.length, 2); assert.ok(t.pareto.length >= 1); assert.ok(t.rows[0].weightedScore >= t.rows[1].weightedScore);
});
test('experiment mode finds a feasible lightest lander and explains why', () => {
  const r = optimize(landerSizing({ payload: 2000, seeds: [1] }), { iterations: 15, initial: 10 });
  assert.ok(r.best && r.best.feasible);
  assert.ok(r.evaluated > r.feasible, 'some candidates were rejected');
  assert.match(r.explanation, /Best of/);
});
test('the marginal small launcher shows a real weak point under dispersions', () => {
  const r = runMonteCarlo(ascentModel(loadVehicle('small-launcher')), { runs: 20, seed: 4 });
  assert.ok(r.successProbability.p < 0.95);
  const v = loadVehicle('small-launcher'); v.payload.mass = 150;
  const better = runMonteCarlo(ascentModel(v), { runs: 20, seed: 4 });
  assert.ok(better.successProbability.p > r.successProbability.p);
});
test('rendezvous model runs under Monte Carlo', () => {
  const r = runMonteCarlo(rendezvousModel(), { runs: 5 });
  assert.equal(r.runs, 5);
});
