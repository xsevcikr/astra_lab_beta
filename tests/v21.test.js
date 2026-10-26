// 2.1: weather (wind, gusts, air density), precise gravity (J2), weather in Monte Carlo, run fingerprints and analysis scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../src/core/runner.js';
import { runMetrics } from '../src/core/run-analysis.js';
import { buildRunRecord, inputFingerprint, resultFingerprint } from '../src/core/project.js';
import { runMonteCarlo, environmentFactors, defaultFactors, describeFactors, MC_MAX_RUNS } from '../src/core/montecarlo.js';
import { analysisScript } from '../src/core/report.js';
import { runMissionCase, summarise } from '../src/core/mission-validation.js';
import { TEMPLATE_BY_ID } from '../data/templates.js';
import { Simulation } from '../physics/simulation.js';

const BASE = TEMPLATE_BY_ID['sounding-rocket'].make();   // one design for every flight, so equal inputs really are equal (templates draw fresh ids each time)
const sounding = () => JSON.parse(JSON.stringify(BASE));
const fly = async (env = {}, settings = {}) => { const { vehicle, mission } = sounding(); const sim = await runSimulation({ vehicle, mission, environment: env, settings }); return { sim, rec: buildRunRecord(sim), m: runMetrics(buildRunRecord(sim), sim.telemetry) }; };

test('no weather: results are exactly what they were without the new environment keys', async () => {
  const a = await fly({}), b = await fly({ wind: { speed: 0 }, densityScale: 1 });
  assert.equal(a.rec.fingerprint.results, b.rec.fingerprint.results);
  assert.equal(a.rec.engine.weather, false);
});

test('wind pushes the rocket, the same seed gives the same flight, another seed another one', async () => {
  const calm = await fly({}), w1 = await fly({ wind: { speed: 40, fromDeg: 270, seed: 4 } }), w2 = await fly({ wind: { speed: 40, fromDeg: 270, seed: 4 } }), w3 = await fly({ wind: { speed: 40, fromDeg: 270, seed: 9 } });
  assert.equal(w1.rec.fingerprint.results, w2.rec.fingerprint.results, 'deterministic');
  assert.notEqual(w1.rec.fingerprint.results, calm.rec.fingerprint.results, 'the wind changes the flight');
  assert.notEqual(w1.rec.fingerprint.results, w3.rec.fingerprint.results, 'the seed changes the gusts');
  assert.equal(w1.rec.engine.weather, true);
  const dEnd = (x) => Math.hypot(x.sim.telemetry.column('lat').at(-1) - calm.sim.telemetry.column('lat').at(-1), x.sim.telemetry.column('lon').at(-1) - calm.sim.telemetry.column('lon').at(-1));
  assert.ok(dEnd(w1) > 1e-5, 'it lands somewhere else');
});

test('a denser atmosphere gives more dynamic pressure', async () => {
  const a = await fly({}), b = await fly({ densityScale: 1.3 });
  assert.ok(b.m.maxQ > a.m.maxQ * 1.1, `max Q ${a.m.maxQ} -> ${b.m.maxQ}`);
});

test('input fingerprint: stable for equal inputs, different when weather or gravity changes', async () => {
  const a = await fly({}), b = await fly({}), c = await fly({ wind: { speed: 10 } }), d = await fly({}, { j2: true });
  assert.equal(inputFingerprint(a.rec), inputFingerprint(b.rec));
  assert.notEqual(inputFingerprint(a.rec), inputFingerprint(c.rec));
  assert.notEqual(inputFingerprint(a.rec), inputFingerprint(d.rec));
  assert.match(a.rec.fingerprint.inputs, /^[0-9a-f]{14}$/);
  assert.equal(resultFingerprint(a.rec), a.rec.fingerprint.results);
  assert.equal(d.rec.engine.gravity, 'point mass + J2');
});

test('J2: the orbit plane drifts at the Sun-synchronous rate and like the space station', { timeout: 120000 }, async () => {
  const r = await runMissionCase('precession');
  assert.deepEqual(summarise(r.rows), { total: 2, pass: 2, fail: 0, missing: 0 });
  assert.ok(Math.abs(r.rows[0].err) < 0.01, 'within 1 % of 0.9856 deg/day');
});

test('Monte Carlo with weather: wind and density are drawn per flight, reproducible, listed in the description', { timeout: 120000 }, async () => {
  const { vehicle, mission } = sounding();
  const factors = [...defaultFactors(vehicle), ...environmentFactors()];
  const go = () => runMonteCarlo({ runs: 4, seed: 11, factors }, { vehicle, mission });
  const a = await go(), b = await go();
  const wk = 'Wind speed (random direction)';
  assert.ok(a.rows.every((r) => r.factors[wk] >= 0 && Number.isFinite(r.factors['Air density'])));
  assert.ok(a.rows.some((r) => r.factors[wk] > 1), 'some flights have wind');
  assert.deepEqual(a.rows.map((r) => r.metrics?.maxAlt), b.rows.map((r) => r.metrics?.maxAlt), 'same seed, same results');
  assert.ok(describeFactors(factors).some((d) => /wind/i.test(d.text)));
  assert.equal(MC_MAX_RUNS, 500);
  const withoutWeather = await runMonteCarlo({ runs: 2, seed: 11, factors: defaultFactors(vehicle) }, { vehicle, mission });
  assert.equal(withoutWeather.rows.length, 2);
});

test('analysis scripts load the exported CSV and carry the fingerprint', async () => {
  const { rec } = await fly({});
  const py = analysisScript(rec, 'python', 'run-telemetry.csv'), m = analysisScript(rec, 'matlab', 'run-telemetry.csv');
  for (const s of [py, m]) { assert.ok(s.includes('run-telemetry.csv')); assert.ok(s.includes(rec.fingerprint.inputs)); }
  assert.match(py, /pd\.read_csv/); assert.match(m, /readtable/);
});

test('the wind blows the way its compass direction says (from the west pushes east, from the north pushes south)', () => {
  const { vehicle, mission } = sounding();
  const R = 6378137 + 12000, at = (fromDeg, r) => { const sim = new Simulation({ vehicle, mission, environment: { wind: { speed: 10, fromDeg, gustFraction: 0 } } }); return sim._windAt(r[0] * R, r[1] * R, r[2] * R, R, 12000).map((x) => +x.toFixed(6) + 0); };
  assert.deepEqual(at(270, [1, 0, 0]), [0, 10, 0], 'on the equator at 0 deg longitude, east is +y');
  assert.deepEqual(at(0, [1, 0, 0]), [0, 0, -10], 'from the north blows towards the south pole');
  assert.deepEqual(at(180, [1, 0, 0]), [0, 0, 10]);
  assert.deepEqual(at(270, [0, 1, 0]), [-10, 0, 0], 'at 90 deg east longitude, east is -x');
  const sim = new Simulation({ vehicle, mission, environment: { wind: { speed: 10, fromDeg: 270, gustFraction: 0 } } });
  assert.equal(Math.hypot(...sim._windAt(6378137, 0, 0, 6378137, 0)), 2, 'at the ground the wind is 20 % of the jet-stream speed');
  assert.deepEqual(sim._windAt(6378137 + 30000, 0, 0, 6378137 + 30000, 30000), [0, 0, 0], 'no wind above 26 km');
});

test('2.4 wind turns with height and has a thin shear layer; both are off unless asked for', () => {
  const { vehicle, mission } = sounding();
  const mk = (wind) => new Simulation({ vehicle, mission, environment: { wind: { speed: 10, fromDeg: 270, gustFraction: 0, ...wind } } });
  const R = 6378137, at = (sim, alt) => sim._windAt(R + alt, 0, 0, R + alt, alt);
  const plain = at(mk({}), 12000), turned = at(mk({ turnDeg: 90 }), 12000);
  assert.ok(Math.abs(plain[1] - 10) < 1e-9 && Math.abs(plain[2]) < 1e-9, 'unchanged by default');
  assert.ok(Math.abs(turned[1]) < 1e-9 && Math.abs(Math.abs(turned[2]) - 10) < 1e-9, 'a 90 degree turn at 12 km points the wind north or south');
  const lo = Math.hypot(...at(mk({ shearAlt: 9000, shearSpeed: 20 }), 3000)), mid = Math.hypot(...at(mk({ shearAlt: 9000, shearSpeed: 20 }), 9000)), base = Math.hypot(...at(mk({}), 9000));
  assert.ok(mid - base > 19.9 && lo < base, 'the shear layer adds its extra speed only near its altitude');
});
