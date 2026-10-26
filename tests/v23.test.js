// ASTRA LAB 2.3: thrust curves, Monte Carlo links, CCSDS/SPICE exchange, the update helpers and the Apollo return template.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { thrustFactor, THRUST_SHAPES } from '../physics/thrust-curves.js';
import { correlationFactor } from '../src/core/montecarlo.js';
import { isoOf, parseTime, parseOPM, exportOPM } from "../src/core/ccsds.js";
import { TEMPLATES } from '../data/templates.js';

const require = createRequire(import.meta.url);
const { parseFeed, isNewer } = require('../src/main/updater.cjs');

test('thrust shapes: flat gives 1, a named shape changes thrust and tails off to near zero', () => {
  assert.equal(thrustFactor({}, 0, 0), 1);
  const c = { thrustShape: 'solid-booster', solid: true, propellantMass: 1000 };
  assert.ok(thrustFactor(c, 80, 5) > 1.1, 'strong start');
  assert.ok(thrustFactor(c, 500, 60) < 0.9, 'throttle bucket');
  assert.ok(THRUST_SHAPES.neutral.curve.at(-1)[1] < 0.2, 'tail-off');
});

test('Monte Carlo links: a valid pair is accepted, a contradicting set is refused in plain words', () => {
  assert.ok(correlationFactor(['a', 'b'], [{ a: 'a', b: 'b', rho: 0.8 }]));
  assert.throws(() => correlationFactor(['a', 'b', 'c'], [{ a: 'a', b: 'b', rho: 0.95 }, { a: 'b', b: 'c', rho: 0.95 }, { a: 'a', b: 'c', rho: -0.95 }]), /contradict/);
});

test('CCSDS: time parsing and OPM round trip', () => {
  assert.equal(parseTime('2000-01-01T12:00:00'), 0);
  assert.equal(parseTime('nonsense'), null);
  assert.equal(isoOf(0), '2000-01-01T12:00:00');
  const state = { epoch: 0, r: [6778e3, 1000, -20], v: [0, 7668.5, 12] };
  const text = exportOPM({ vehicleName: 'T' }, state);
  const back = parseOPM(text);
  assert.ok(Math.abs(back.r[0] - state.r[0]) < 1 && Math.abs(back.v[1] - state.v[1]) < 1e-3);
});

test('update helpers: only safe https or github feeds; version comparison', () => {
  assert.equal(parseFeed('http://example.com/x'), null);
  assert.equal(parseFeed('https://user:pw@example.com/x'), null);
});
test('update helpers: feeds and versions', () => {
  assert.equal(parseFeed(''), null);
  assert.deepEqual(parseFeed('github:rob/astra'), { provider: 'github', owner: 'rob', repo: 'astra' });
  assert.equal(parseFeed('https://updates.example.com/astra').url, 'https://updates.example.com/astra/');
  assert.ok(isNewer('2.4.0', '2.3.0'));
  assert.ok(!isNewer('2.3.0', '2.3.0'));
  assert.ok(!isNewer('2.3.0-beta', '2.3.0'));
});

test('templates: Apollo coming home exists and is a spacecraft mission', () => {
  const t = (Array.isArray(TEMPLATES) ? TEMPLATES : Object.values(TEMPLATES)).find((x) => x.id === 'apollo-return');
  assert.ok(t); assert.equal(t.type, 'spacecraft');
});
