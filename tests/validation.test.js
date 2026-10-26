// Validation against published launcher data (src/core/validation.js, data/validation-vehicles.js).
// These tests do two jobs: (1) the data is well formed and every published number carries its source;
// (2) the simulator keeps reproducing the published trajectory numbers to the stated tolerance (a regression guard,
// NOT a promise that the model is exact: rows that fail are listed as expected failures so they cannot hide).
import test from 'node:test';
import assert from 'node:assert/strict';
import { VALIDATION_VEHICLES, TOLERANCE_NOTE, runValidationFlight, compareRows, summariseRows, sunSynchronousInclination } from '../src/core/validation.js';
import { deltaVBudget } from '../physics/mission-design.js';

const byId = (id) => VALIDATION_VEHICLES.find((v) => v.id === id);

test('every published value has a number, a unit, a tolerance (or is context-only) and an https source URL', () => {
  assert.equal(VALIDATION_VEHICLES.length, 9);
  for (const V of VALIDATION_VEHICLES) {
    assert.ok(V.assumptions.length >= 3 && V.simplified.length >= 3, `${V.id} lists its assumptions`);
    const ids = new Set();
    for (const r of V.rows) {
      assert.ok(Number.isFinite(r.value) && r.value > 0, `${V.id}/${r.id} value`);
      assert.match(r.url, /^https:\/\/[a-z0-9.-]+\//i, `${V.id}/${r.id} url`);
      assert.ok(r.source && r.source.length > 10, `${V.id}/${r.id} source text`);
      assert.ok(r.tol == null || (r.tol > 0 && r.tol <= 0.2), `${V.id}/${r.id} tolerance`);
      assert.equal(r.kind, r.tol == null ? 'context' : 'graded');
      assert.ok(!ids.has(r.id), `duplicate row ${r.id}`); ids.add(r.id);
    }
  }
  assert.equal(TOLERANCE_NOTE.input.tol, 0.05); assert.equal(TOLERANCE_NOTE.flight.tol, 0.10);
});

test('unit conversions of the Apollo 11 press-kit table (feet to metres)', () => {
  const rows = byId('saturn-v').rows;
  const get = (id) => rows.find((r) => r.id === id).value;
  assert.ok(Math.abs(get('maxQAlt') - 13218.0) < 1, 'Max-Q altitude 43,365 ft = 13.218 km');
  assert.ok(Math.abs(get('s1CutoffAlt') - 66341.0) < 1, '217,655 ft = 66.34 km');
  assert.ok(Math.abs(get('finalCutoffSpeed') - 7791.4) < 0.5, '25,562.4 ft/s = 7,791.4 m/s (orbital speed at 190 km is 7,79 km/s: the table is space-fixed)');
  assert.ok(Math.abs(get('s2Burn') - (551.4 - 163.2)) < 1e-9, 'S-II burn = 9:11.4 - 2:43.2');
});

test('grading logic: pass / fail / context / missing and the error sign', () => {
  const V = { rows: [
    { id: 'a', metric: 'a', value: 100, tol: 0.1, kind: 'graded' }, { id: 'b', metric: 'b', value: 100, tol: 0.1, kind: 'graded' },
    { id: 'c', metric: 'c', value: 100, tol: null, kind: 'context' }, { id: 'd', metric: 'd', value: 100, tol: 0.1, kind: 'graded' } ] };
  const rows = compareRows(V, { a: 109, b: 85, c: 50 });
  assert.deepEqual(rows.map((r) => r.status), ['pass', 'fail', 'context', 'missing']);
  assert.ok(rows[1].err < 0 && Math.abs(rows[1].err + 0.15) < 1e-12);
  assert.deepEqual(summariseRows(rows), { total: 2, pass: 1, fail: 1, missing: 1, context: 1 });
});

test('sun-synchronous inclination at 500 km is about 97.4 degrees (J2 formula)', () => {
  const i = sunSynchronousInclination(500e3);
  assert.ok(i > 97.3 && i < 97.5, String(i));
});

test('Saturn V (Apollo 11): reaches the 185 km parking orbit and reproduces the S-IC cutoff and orbit to within 10%', () => {
  const r = runValidationFlight('saturn-v');
  assert.ok(r.reached, r.sim.result.reason);
  const row = (id) => r.rows.find((x) => x.id === id);
  for (const id of ['liftoffMass', 'liftoffThrust', 'maxQT', 'maxQSpeed', 's1CutoffT', 's1CutoffAlt', 's1CutoffSpeed', 's2CutoffAlt', 's2CutoffSpeed', 'finalCutoffSpeed', 'orbitPeri', 'orbitApo']) {
    assert.equal(row(id).status, 'pass', `${id}: sim ${row(id).sim} vs ${row(id).value} (${(row(id).err * 100).toFixed(1)}%)`);
  }
  // 2.4: with the warm Florida day (AFGL tropical atmosphere) the Max-Q altitude matches too; with the standard atmosphere it is about 16% low whatever the pitch table
  assert.equal(row('maxQAlt').status, 'pass', `Max-Q altitude ${(row('maxQAlt').err * 100).toFixed(1)}%`);
  assert.ok(r.rows.every((x) => x.sim != null), 'every row measured');
  // delta-v budget closes for a flight that is powered all the way (direct insertion)
  const tel = r.sim.telemetry, n = tel.count, sp = tel.column('speed');
  const b = deltaVBudget({ ideal: r.metrics.dvIdeal, gravity: r.metrics.dvGravity, drag: r.metrics.dvDrag, steering: r.metrics.dvSteering }, sp[0], sp[n - 1]);
  assert.ok(Math.abs(b.residual) < 0.02 * sp[n - 1], `budget residual ${b.residual} m/s`);
  assert.ok(b.lossFraction > 0.1 && b.lossFraction < 0.35, `loss fraction ${b.lossFraction}`);
});

test('validation flights are deterministic (same numbers twice)', () => {
  const a = runValidationFlight('electron'), b = runValidationFlight('electron');
  assert.equal(JSON.stringify(a.metrics), JSON.stringify(b.metrics));
});

test('Electron: reaches the 500 km orbit with its 200 kg payload; input rows agree with the sources; the published burn times are NOT matched', () => {
  const r = runValidationFlight('electron');
  assert.ok(r.reached, r.sim.result.reason);
  const row = (id) => r.rows.find((x) => x.id === id);
  assert.equal(row('liftoffMass').status, 'pass'); assert.equal(row('liftoffThrust').status, 'pass');
  assert.equal(row('orbitPeri').status, 'pass'); assert.equal(row('orbitApo').status, 'pass');
  assert.equal(row('s1CutoffT').status, 'fail', 'honest: constant-thrust model burns out ~17% early');
  assert.ok(row('s1CutoffT').err < -0.1);
});

test('Falcon 9: reaches ~200 km with the published 22.8 t payload; input rows and the corrected height (2.0) pass', () => {
  const r = runValidationFlight('falcon-9');
  assert.ok(r.reached, r.sim.result.reason);
  const row = (id) => r.rows.find((x) => x.id === id);
  for (const id of ['liftoffMass', 'liftoffThrust', 'meco', 'orbitPeri', 'height']) if (row(id)) assert.equal(row(id).status, 'pass', id);
});

test('Atlas V 551: boosters burn out on time and the published payload reaches orbit; the RD-180 throttle gives the published 253 s core burn (2.4)', () => {
  const r = runValidationFlight('atlas-v-551');
  const row = (id) => r.rows.find((x) => x.id === id);
  assert.equal(row('boosterBurn').status, 'pass'); assert.equal(row('reachedOrbit').status, 'pass');
  assert.equal(row('s1Burn').status, 'pass', 'with the throttle-back the core burns for the published 253 s');
  assert.ok(r.metrics.orbitApo > 250000, 'the single-burn flight still overshoots its apogee (the real Centaur burns twice); the page says so');
});

test('Ariane 5 ECA: reaches the 200 km parking orbit with the published GTO payload and matches both burn times', () => {
  const r = runValidationFlight('ariane-5-eca');
  const row = (id) => r.rows.find((x) => x.id === id);
  for (const id of ['boosterBurn', 's1Burn', 'reachedOrbit']) assert.equal(row(id).status, 'pass', `${id}: ${row(id).sim} vs ${row(id).value}`);
});

test('New Shepard: input rows agree and, with the tuned average throttle (2.5), the apogee matches; the top speed is still about 30% high', () => {
  const r = runValidationFlight('new-shepard');
  const row = (id) => r.rows.find((x) => x.id === id);
  for (const id of ['liftoffMass', 'liftoffThrust', 's1CutoffT']) assert.equal(row(id).status, 'pass', id);
  assert.equal(row('maxAlt').status, 'pass'); assert.equal(row('maxSpeed').status, 'fail', 'the published top speed is NOT matched; the page must keep saying so');
  assert.ok(row('maxAlt').sim > 100e3, 'it does fly above the Karman line');
});
