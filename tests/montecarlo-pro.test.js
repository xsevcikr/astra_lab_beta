// Monte Carlo views: histogram bins, tornado data, orbit-error metric, description of what is varied, time estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { histogramBins, tornado, describeFactors, estimateSeconds, formatDuration, orbitErrors, failureProbability, analyzeMonteCarlo, wilson, defaultFactors, runMonteCarlo, MC_METRICS } from '../src/core/montecarlo.js';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';

test('histogram counts every valid run exactly once and separates successes from failures', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ status: i % 5 === 0 ? 'FAILURE' : 'SUCCESS', metrics: { finalPeri: 100 + i }, factors: {} }));
  rows.push({ status: 'ERROR', metrics: undefined, factors: {} });
  const h = histogramBins(rows, 'finalPeri', 8);
  assert.equal(h.n, 40); assert.equal(h.ok.reduce((a, b) => a + b, 0) + h.bad.reduce((a, b) => a + b, 0), 40);
  assert.equal(h.bad.reduce((a, b) => a + b, 0), 8); assert.equal(h.lo, 100); assert.equal(h.hi, 139);
  assert.equal(histogramBins(rows, 'nothing'), null);
});

test('tornado: on noise-free linear data the swing is exactly 2 x slope x sigma and the strongest input comes first', () => {
  const rows = []; let k = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { const a = 1 + 0.01 * (i - 4), b = 1 + 0.01 * (j - 4); rows.push({ status: a > 1.0 ? 'SUCCESS' : 'FAILURE', metrics: { y: 500 * a + 20 * b }, factors: { A: a, B: b } }); k++; }
  const t = tornado(rows, [{ name: 'B', sigma: 0.02 }, { name: 'A', sigma: 0.01 }], 'y');
  assert.equal(t[0].factor, 'A');
  assert.ok(Math.abs(t[0].slope - 500) < 1e-6 && Math.abs(t[0].swing - 2 * 500 * 0.01) < 1e-6);
  assert.ok(Math.abs(t[1].slope - 20) < 1e-6);
  assert.ok(Math.abs(t[0].low - (t[0].high - t[0].swing)) < 1e-9);
  assert.ok(t[0].pSuccessHigh > t[0].pSuccessLow);
});

test('orbit error, failure probability, descriptions and time estimates', () => {
  const m = orbitErrors({ finalPeri: 198000, finalApo: 205000 }, { objective: { type: 'orbit', altitude: 200000 } });
  assert.equal(m.periError, -2000); assert.equal(m.apoError, 5000); assert.equal(m.orbitError, 5000);
  assert.deepEqual(orbitErrors({ finalPeri: 1, finalApo: 2 }, { objective: { type: 'landing' } }), {});
  assert.ok(MC_METRICS.includes('orbitError'));
  const an = analyzeMonteCarlo(Array.from({ length: 20 }, (_, i) => ({ status: i < 17 ? 'SUCCESS' : 'FAILURE', factors: { x: 1 }, metrics: {} })), [{ name: 'x', sigma: 0.01 }]);
  const f = failureProbability(an); const [lo, hi] = wilson(3, 20);
  assert.equal(f.p, 0.15); assert.equal(f.lo, lo); assert.equal(f.hi, hi);
  const d = describeFactors([{ name: 'Engine thrust', sigma: 0.015, targets: [{ path: 'vehicle.kind[engine].thrustVac' }] }]);
  assert.match(d[0].text, /1\.5 %/); assert.deepEqual(d[0].targets, ['vehicle.kind[engine].thrustVac']);
  assert.equal(estimateSeconds(50, 2), 100); assert.equal(estimateSeconds(50, null), null);
  assert.equal(formatDuration(30), 'about 30 s'); assert.equal(formatDuration(300), 'about 5 min'); assert.equal(formatDuration(null), 'unknown');
});

test('a real Monte Carlo run records the orbit error of every flight and the seed that reproduces it', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const inputs = { vehicle: r.vehicle, mission: r.mission, environment: {}, settings: {} };
  const mc = await runMonteCarlo({ runs: 4, seed: 21 }, inputs);
  assert.equal(mc.seed, 21); assert.equal(mc.targetAltitude, 200000); assert.equal(mc.requestedRuns, 4);
  for (const row of mc.rows) { assert.ok(Number.isFinite(row.metrics.orbitError)); assert.ok(row.metrics.orbitError < 30000, 'a nominal ascent ends close to the target'); }
  const h = histogramBins(mc.rows, 'orbitError'); assert.equal(h.n, 4);
  assert.ok(tornado(mc.rows, defaultFactors(r.vehicle), 'orbitError').length === defaultFactors(r.vehicle).length);
});
