// Monte Carlo dispersion analysis: every run is a real simulation; the statistics are checked against known values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, normal, wilson, describe, pearson, runMonteCarlo, defaultFactors, monteCarloToCSV } from '../src/core/montecarlo.js';
import { applyParameter } from '../src/core/experiments.js';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';

test('seeded generator is reproducible and roughly standard normal', () => {
  const a = makeRng(7), b = makeRng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const r = makeRng(3); const xs = Array.from({ length: 20000 }, () => normal(r));
  const d = describe(xs);
  assert.ok(Math.abs(d.mean) < 0.03 && Math.abs(d.sd - 1) < 0.03, `${d.mean} ${d.sd}`);
  assert.ok(Math.max(...xs.map(Math.abs)) <= 3);
});

test('Wilson interval, percentiles and correlation match textbook values', () => {
  const [lo, hi] = wilson(8, 10);
  assert.ok(Math.abs(lo - 0.4902) < 1e-3 && Math.abs(hi - 0.9433) < 1e-3, `${lo} ${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  const d = describe([1, 2, 3, 4, 5]);
  assert.equal(d.mean, 3); assert.equal(d.p50, 3); assert.ok(Math.abs(d.sd - Math.sqrt(2.5)) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12);
});

test('kind-wide parameter paths scale every matching component', () => {
  const v = designLauncher({ payloadMass: 100 });
  const veh = v.vehicle ?? v;
  const inp = { vehicle: JSON.parse(JSON.stringify(veh)), mission: {}, environment: {}, settings: {} };
  const before = inp.vehicle.components.filter((c) => c.kind === 'engine').map((c) => c.thrustVac);
  applyParameter(inp, 'vehicle.kind[engine].thrustVac', 1.1, 'scale');
  const after = inp.vehicle.components.filter((c) => c.kind === 'engine').map((c) => c.thrustVac);
  after.forEach((x, i) => assert.ok(Math.abs(x / before[i] - 1.1) < 1e-12));
  assert.throws(() => applyParameter(inp, 'vehicle.kind[rcs].nonexistent', 1.1, 'scale'));
});

test('Monte Carlo on a real launcher: reproducible, and a large propellant shortfall is the driver of failures', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  assert.ok(r.ok);
  const inputs = { vehicle: r.vehicle, mission: r.mission, environment: {}, settings: {} };
  assert.ok(defaultFactors(inputs.vehicle).length >= 3);
  // tiny dispersions: the design has margin, everything should succeed
  const tight = await runMonteCarlo({ runs: 6, seed: 5, factors: [{ name: 'Engine thrust', sigma: 0.002, targets: [{ path: 'vehicle.kind[engine].thrustVac' }] }] }, inputs);
  assert.equal(tight.analysis.success, 6, tight.analysis.verdict);
  assert.ok(tight.analysis.ci95[0] > 0.5);
  // the same seed reproduces the same draws and results
  const again = await runMonteCarlo({ runs: 6, seed: 5, factors: [{ name: 'Engine thrust', sigma: 0.002, targets: [{ path: 'vehicle.kind[engine].thrustVac' }] }] }, inputs);
  assert.deepEqual(again.rows.map((x) => [x.factors, x.status, x.metrics?.finalPeri]), tight.rows.map((x) => [x.factors, x.status, x.metrics?.finalPeri]));
  // wide propellant dispersion (uniform 0.8 .. 1.2 of the nominal loading): some flights must fail, and propellant must correlate with success
  const wide = await runMonteCarlo({ runs: 14, seed: 11, factors: [{ name: 'Propellant loaded', sigma: 0.115, dist: 'uniform', targets: ['fuel_tank', 'oxidizer_tank'].map((k) => ({ path: `vehicle.kind[${k}].propellantMass`, mode: 'scale' })) }] }, { ...inputs });
  const w = wide.analysis;
  assert.ok(w.success > 0 && w.failed > 0, `mixed outcome expected: ${w.verdict}`);
  assert.ok(w.sensitivity[0].rSuccess > 0.3, `propellant should correlate with success: ${w.sensitivity[0].rSuccess}`);
  assert.ok(Object.keys(w.failureCodes).length >= 1);
  assert.match(monteCarloToCSV(wide), /Propellant loaded/);
});
