// Trade study: variants are generated from the vehicle, flown for real; cost / payload / risk definitions; dominated designs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { designCost, designPayloadMass, generateVariants, runTrade, markDominated, riskOf } from '../src/core/trade.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
test('cost is the sum of catalog cost x count of the priced parts; unpriced parts are counted, not guessed', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const c = designCost(r.vehicle);
  const manual = r.vehicle.components.reduce((s, x) => s + (x.cost > 0 ? x.cost * (x.count ?? 1) : 0), 0);
  assert.equal(c.total, manual); assert.ok(c.total > 1e6); assert.ok(c.unpriced > 0 && c.priced > 0);
  assert.equal(c.priced + c.unpriced, r.vehicle.components.length);
  assert.ok(Math.abs(designPayloadMass(r.vehicle) - 100) < 1);
  const vars = generateVariants(r.vehicle, r.mission);
  assert.ok(vars.length >= 3 && vars.every((v) => v.label && v.note && v.vehicle.components.length));
  assert.ok(vars.find((v) => v.id === 'more-fuel').vehicle.components.some((x) => x.propellantMass > 0));
  const eng = vars.find((v) => v.id === 'engine'); if (eng) assert.ok(designCost(eng.vehicle).total !== c.total);
  assert.equal(designCost(vars.find((v) => v.id === 'more-fuel').vehicle).total, c.total, 'propellant has no catalog cost');
  // the base vehicle is untouched
  assert.equal(designCost(r.vehicle).total, c.total);
});

test('dominated designs: at least as good everywhere and better somewhere, only among designs that reached the goal', () => {
  const e = (label, payload, cost, risk, feasible = true) => ({ label, payload, cost, riskMargin: risk, mc: null, feasible });
  const r = markDominated([e('A', 100, 5, 0.5), e('B', 100, 6, 0.5), e('C', 120, 9, 0.4), e('D', 100, 5, 0.5), e('F', 500, 1, 0.0, false)]);
  assert.equal(r[1].dominated, true); assert.equal(r[1].dominatedBy, 'A');
  assert.equal(r[0].dominated, false); assert.equal(r[3].dominated, false, 'identical designs do not dominate each other');
  assert.equal(r[2].dominated, false, 'more payload and lower risk for more money is not dominated');
  assert.equal(r[4].dominated, false); assert.equal(r[4].feasible, false);
  const mcE = { riskMargin: 0.9, mc: { p: 0.1 } }; assert.equal(riskOf(mcE), 0.1);
});

test('three designs are flown for real and compared; Monte Carlo risk uses a seed', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const vars = generateVariants(r.vehicle, r.mission);
  const cands = [{ id: 'base', label: 'Baseline', vehicle: r.vehicle }, vars.find((v) => v.id === 'more-fuel'), vars.find((v) => v.id === 'payload-up')];
  const out = await runTrade(cands, { mission: r.mission, baseVehicle: r.vehicle }, { mcRuns: 0 });
  assert.equal(out.entries.length, 3);
  const base = out.entries[0];
  assert.equal(base.status, 'SUCCESS'); assert.ok(base.feasible); assert.ok(Math.abs(base.payload - 100) < 1);
  assert.ok(base.riskMargin > 0 && base.riskMargin <= 1);
  assert.ok(out.entries[2].designPayload > base.designPayload * 1.1);
  for (const en of out.entries) assert.ok('dominated' in en && Number.isFinite(en.cost));
  assert.throws(() => { throw new Error('x'); });
  const mc = await runTrade([{ id: 'base', label: 'Baseline', vehicle: clone(r.vehicle) }], { mission: r.mission, baseVehicle: r.vehicle }, { mcRuns: 5, seed: 3 });
  assert.equal(mc.entries[0].mc.runs, 5); assert.equal(mc.entries[0].mc.seed, 3); assert.ok(mc.entries[0].mc.p >= 0 && mc.entries[0].mc.hi >= mc.entries[0].mc.p);
  await assert.rejects(runTrade([], {}, {}));
});
