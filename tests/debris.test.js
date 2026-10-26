// Separated hardware is propagated with real physics (gravity + drag) after the separation event.
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { DebrisTrack, tumblingArea } from '../physics/debris.js';
import { getBody } from '../physics/bodies.js';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';

const circ = (bodyId, alt) => { const b = getBody(bodyId), r = b.radius + alt; return { r: [r, 0, 0], v: [0, Math.sqrt(b.mu / r), 0], a: r, mu: b.mu }; };
const mk = (body, s, extra = {}) => ({ id: 'd', label: 'd', groups: ['stage1'], t0: 0, body, r: s.r, v: s.v, q: [1, 0, 0, 0], mass: 1000, area: 5, cd: 1, cgSolo: 2, tumble: [0, 0, 0], ...extra });

test('debris in vacuum conserves orbital energy and closes its orbit after one period', () => {
  const s = circ('vacearth', 400e3);
  const tr = new DebrisTrack(mk('vacearth', s));
  const T = 2 * Math.PI * Math.sqrt(s.a ** 3 / s.mu);
  const st = tr.stateAt(T);
  const e0 = 0.5 * s.v[1] ** 2 - s.mu / s.a, e1 = 0.5 * Math.hypot(...st.v) ** 2 - s.mu / Math.hypot(...st.r);
  assert.ok(Math.abs((e1 - e0) / e0) < 1e-6, `energy drift ${(e1 - e0) / e0}`);
  assert.ok(Math.hypot(st.r[0] - s.r[0], st.r[1] - s.r[1], st.r[2] - s.r[2]) < 200, 'position after one period');
  assert.ok(st.alive);
});

test('drag lowers a low orbit and the object eventually reenters and hits the ground', () => {
  const s = circ('earth', 130e3);
  const tr = new DebrisTrack(mk('earth', s, { mass: 500, area: 10 }));
  const st = tr.stateAt(3600);
  assert.ok(st.alt < 130e3 - 5e3, 'decayed: ' + st.alt);
  tr.stateAt(3 * 86400);
  assert.ok(tr.impact, 'reentry and impact');
  assert.equal(tr.stateAt(tr.impact.t + 100).alive, false);
});

test('a heavier object with the same area decays more slowly (ballistic coefficient)', () => {
  const s = circ('earth', 150e3);
  const a = new DebrisTrack(mk('earth', s, { mass: 200 })).stateAt(1800).alt;
  const b = new DebrisTrack(mk('earth', s, { mass: 5000 })).stateAt(1800).alt;
  assert.ok(b > a, `${b} vs ${a}`);
});

test('tumbling mean projected area is a quarter of the surface area', () => {
  const D = 2, L = 10;
  assert.ok(Math.abs(tumblingArea(L, D) - (Math.PI * D * L + Math.PI * D * D / 2) / 4) < 1e-9);
});

test('a real two-stage launch records its jettisoned stages, which fall back to Earth', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  assert.ok(r.ok);
  const seps = r.sim.result.summary.separations;
  const s1 = seps.find((s) => s.group === 'stage1');
  assert.ok(s1?.debris, 'stage 1 debris recorded');
  assert.ok(s1.debris.mass > 100 && s1.debris.area > 1);
  const tr = new DebrisTrack(s1.debris);
  tr.stateAt(s1.t + 3000);
  assert.ok(tr.impact, 'the spent first stage reenters within an hour');
  assert.ok(tr.impact.t - s1.t > 300 && tr.impact.t - s1.t < 3000);
  // stateAt is repeatable and can be scrubbed backwards
  const a = tr.stateAt(s1.t + 200).r.join(), b = tr.stateAt(s1.t + 200).r.join();
  assert.equal(a, b);
  assert.equal(tr.stateAt(s1.t - 1), null);
});
