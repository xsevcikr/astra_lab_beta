import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatAltitude, formatSpeed, snap, fixed } from '../src/core/numfmt.js';
import { orbitWindow, orbitTargetText, orbitResultText } from '../src/core/orbit-goal.js';
import { missionSuits, mismatchOf, pickRunId, newMissionArgs } from '../src/core/consistency.js';

const MODES = ['beginner', 'standard', 'advanced'];

test('numfmt: float noise and negative zero are exactly 0, in every mode', () => {
  for (const mode of MODES) {
    assert.equal(formatNumber(9.313225746154785e-10 * 0, { mode }), '0');
    assert.equal(formatNumber(-0, { mode }), '0');
    assert.equal(formatNumber(-0.0001, { digits: 1, mode: 'standard' }), '0');
  }
  assert.equal(snap(9.3e-10), 0);
  assert.equal(Object.is(snap(-1e-12), 0), true);
  assert.equal(formatAltitude(9.313225746154785e-10), '0 m');
  assert.equal(formatAltitude(-4e-9), '0 m');
  assert.equal(formatSpeed(0), '0 km/h');
  assert.equal(formatSpeed(-1e-9), '0 km/h');
  assert.equal(fixed(-0.04, 1), '0.0');
});

test('numfmt: no scientific notation in Beginner / Standard, not even for huge or tiny values', () => {
  for (const mode of ['beginner', 'standard']) for (const x of [1.2e5, 3.3e9, 7.7e12, 4.2e18, 5e-9, 0.00012, 123456789, -2.5e10]) assert.doesNotMatch(formatNumber(x, { mode }), /e[+-]?\d/i, `${x} ${mode}`);
  assert.equal(formatNumber(120000), '120,000');
  assert.equal(formatNumber(1234567.8), '1,234,568');
  assert.equal(formatNumber(3.3e9), '3.3 billion');
  assert.equal(formatNumber(28000 * 1, { digits: 0 }), '28,000');
});

test('numfmt: Advanced may use scientific notation only for tiny or huge values', () => {
  assert.match(formatNumber(5e-9, { mode: 'advanced' }), /e-9$/);
  assert.match(formatNumber(4.2e18, { mode: 'advanced' }), /e18$/);
  assert.equal(formatNumber(120000, { mode: 'advanced' }), '120,000');
  assert.equal(formatNumber(1500.4, { mode: 'advanced' }), '1,500');
  assert.equal(formatNumber(12.34, { digits: 2, mode: 'advanced' }), '12.34');
});

test('numfmt: altitude and speed read like a person would say them', () => {
  assert.equal(formatAltitude(850), '850 m');
  assert.equal(formatAltitude(3.2), '3.2 m');
  assert.equal(formatAltitude(12400), '12.4 km');
  assert.equal(formatAltitude(200123), '200.1 km');
  assert.equal(formatAltitude(0, { imperial: true }), '0 ft');
  assert.equal(formatSpeed(408.4557537800932), '1,470 km/h');
  assert.equal(formatSpeed(7800), '28,080 km/h');
  assert.equal(formatSpeed(100, { kmh: false }), '100 m/s');
  assert.equal(formatSpeed(10, { imperial: true }), '22 mph');
});

test('orbit goal: target, achieved and tolerance are worded from the same window the physics judges', () => {
  const obj = { type: 'orbit', altitude: 200000, tolerance: 0.1 };
  const w = orbitWindow(obj);
  assert.deepEqual([w.target, w.minPeri, Math.round(w.maxApo), w.tolKm], [200000, 180000, 220000, 20]);
  assert.equal(orbitTargetText(obj), 'target 200 km, tolerance ±20 km (180 to 220 km)');
  assert.equal(orbitResultText(obj, 199600, 201200), 'target 200 km, achieved 199.6 × 201.2 km, tolerance ±20 km');
  assert.equal(orbitResultText({ ...obj, tolerance: 0.025 }, 199600, 201200), 'target 200 km, achieved 199.6 × 201.2 km, tolerance ±5 km');
  assert.equal(orbitWindow({ type: 'landing' }), null);
  assert.equal(Math.round(orbitWindow({ ...obj, apoapsisSlack: 5000 }).maxApo), 225000);
});

test('consistency: a vehicle only fits goals made for its kind', () => {
  const rocketGoal = { guidance: { mode: 'ascent' }, initial: { type: 'pad' }, objective: { type: 'orbit', altitude: 2e5 } };
  const probeGoal = { guidance: { mode: 'none' }, initial: { type: 'orbit' }, objective: { type: 'survive' } };
  const landGoal = { objective: { type: 'landing' } };
  const rocket = { type: 'rocket', components: [{}] }, probe = { type: 'probe', components: [{}] }, lander = { type: 'lander', components: [{}] };
  assert.equal(missionSuits(rocket, rocketGoal), true);
  assert.equal(missionSuits(probe, rocketGoal), false);
  assert.equal(missionSuits(rocket, probeGoal), false, 'a launcher is not given a spacecraft goal');
  assert.equal(missionSuits(probe, probeGoal), true);
  assert.equal(missionSuits(lander, landGoal), true);
  assert.equal(missionSuits(rocket, landGoal), false);
  assert.deepEqual(mismatchOf({ vehicle: probe, mission: rocketGoal }), { need: 'rocket', have: 'probe' });
  assert.equal(mismatchOf({ vehicle: rocket, mission: rocketGoal }), null);
  assert.deepEqual(newMissionArgs({ type: 'rocket', meta: { targetAltitude: 210000 } }), { kind: 'launch', altitude: 210000 });
  assert.deepEqual(newMissionArgs({ type: 'probe' }), { kind: 'probe_operations' });
});

test('consistency: the flight shown is the newest flight of the active vehicle', () => {
  const P = { vehicle: { name: 'B' }, runs: [{ id: 'r1', vehicle: 'B' }, { id: 'r2', vehicle: 'A' }] };
  assert.equal(pickRunId(P, null), 'r1');
  assert.equal(pickRunId(P, 'r2'), 'r2');
  assert.equal(pickRunId(P, 'gone'), 'r1');
  assert.equal(pickRunId({ vehicle: { name: 'C' }, runs: P.runs }, null), 'r2', 'no flight of this vehicle yet: newest overall');
  assert.equal(pickRunId({ vehicle: null, runs: [] }, null), null);
});
