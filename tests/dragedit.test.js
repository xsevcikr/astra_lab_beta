// Rules behind the mouse handles of the Vehicle Designer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProbe, designLauncher } from '../src/vehicles/builders.js';
import { editCaps, setLength, setDiameter, slide } from '../ui/lib/dragedit.js';
import { computeLayout, computeMassProperties } from '../physics/vehicle-model.js';
import { tankLengthFor } from '../physics/vehicle-model.js';
import { validateVehicle } from '../src/vehicles/analysis.js';

const rocket = () => designLauncher({ payloadMass: 100, targetAltitude: 200000 }).vehicle ?? designLauncher({ payloadMass: 100, targetAltitude: 200000 });

test('editing a tank length through the handle changes propellant, mass and length consistently', () => {
  const v = rocket();
  const t = v.components.find((c) => c.kind === 'fuel_tank');
  const L0 = t.length, m0 = t.propellantMass;
  const L = setLength(v, t.id, L0 + 1);
  assert.ok(Math.abs(L - (L0 + 1)) < 0.06, `${L} vs ${L0 + 1}`);
  assert.ok(t.propellantMass > m0);
  assert.ok(Math.abs(t.length - tankLengthFor(t.propellant, t.propellantMass, t.diameter)) < 1e-9);
  const before = computeMassProperties(v).mass;
  setLength(v, t.id, L0);
  assert.ok(computeMassProperties(v).mass < before);
});

test('diameter handle respects the limits and keeps the propellant volume', () => {
  const v = rocket();
  const t = v.components.find((c) => c.kind === 'oxidizer_tank');
  const vol = (c) => (Math.PI * c.diameter ** 2 / 4) * (c.length - 0.4 * c.diameter);
  const v0 = vol(t);
  setDiameter(v, t.id, t.diameter + 0.5);
  assert.ok(Math.abs(vol(t) - v0) / v0 < 0.02);
  assert.equal(setDiameter(v, t.id, 1000), 20);
  const thin = setDiameter(v, t.id, -3);   // a needle-thin tank would be hundreds of metres long: stopped at 60 m
  assert.ok(thin > 0.1 && t.length <= 60.01, `${thin} ${t.length}`);
});

test('sliding a stack part past its neighbour swaps them, inside the same stage only', () => {
  const v = rocket();
  const idx = (id) => v.components.findIndex((c) => c.id === id);
  const stage1 = v.components.filter((c) => c.group === 'stage1' && c.mount === 'stack');
  const a = stage1[stage1.length - 2], b = stage1[stage1.length - 1];   // two neighbours at the top of stage 1
  const ia = idx(a.id), ib = idx(b.id);
  assert.ok(ib > ia);
  let r = slide(v, a.id, 0.1 * (a.length + b.length) / 2, computeLayout(v));   // too little: nothing happens
  assert.equal(r.swapped ?? 0, 0);
  r = slide(v, a.id, (a.length + b.length) / 2 + 0.01, computeLayout(v));
  assert.equal(r.swapped, 1);
  assert.ok(idx(a.id) > idx(b.id), 'order swapped');
  // the top part of stage 1 must not jump into stage 2
  const top = v.components.filter((c) => c.group === 'stage1' && c.mount === 'stack').pop();
  const ordBefore = v.components.map((c) => c.id).join();
  r = slide(v, top.id, 100, computeLayout(v));
  assert.ok(r.blocked, 'stage boundary is respected');
  assert.equal(v.components.map((c) => c.id).join(), ordBefore);
});

test('capabilities: rovers have no handles, nose cone can be resized, engines only slide', () => {
  const v = rocket();
  const nose = v.components.find((c) => c.kind === 'fairing' || c.kind === 'nose_cone');
  const eng = v.components.find((c) => c.kind === 'engine');
  assert.deepEqual(Object.keys(editCaps(v, nose)), ['length', 'diameter', 'move']);
  assert.equal(editCaps(v, nose).length, true);
  assert.equal(editCaps(v, eng).length, false);
  assert.equal(editCaps({ ...v, type: 'rover' }, nose).move, null);
});

test('validation still runs after mouse edits (no silent corruption)', () => {
  const v = rocket();
  const t = v.components.find((c) => c.kind === 'fuel_tank');
  setLength(v, t.id, t.length + 3); setDiameter(v, t.id, t.diameter + 0.2);
  assert.doesNotThrow(() => validateVehicle(v, { body: 'earth' }));
});
