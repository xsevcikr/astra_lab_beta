// Failure analysis: timeline, computed fixes, applying a fix through the tool API as one undo step, honest before / after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { Project } from '../src/core/project.js';
import { ToolAPI, ToolContext } from '../ai/toolapi.js';
import { flyRecordWith, diagnose, resolveSearchFix, applyOps, applyFix, opsToToolCalls, beforeAfter, failureTimeline } from '../src/core/failure-analysis.js';
import { stagePropellant } from '../src/core/failure-analysis.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
let base;
async function fixture() {
  if (base) return base;
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  assert.ok(r.ok);
  base = { vehicle: r.vehicle, mission: r.mission, rec: { mission: r.mission, environment: {}, settings: {} } };
  return base;
}
const strong = (v) => { for (const c of v.components) if (c.kind === 'engine' && c.group === 'stage1') c.thrustVac *= 2.2; return v; };   // far too much thrust: max-Q failure

test('a failed flight is explained on a timeline with the first problem, measured numbers and computed fixes', async () => {
  const { vehicle, rec } = await fixture();
  const r = await flyRecordWith(rec, strong(clone(vehicle)));
  assert.equal(r.status, 'FAILURE');
  const d = diagnose(r.record, r.telemetry, r.metrics);
  assert.equal(d.status, 'FAILED');
  const first = r.record.result.failures.map((f) => f).sort((a, b) => a.t - b.t)[0];
  assert.equal(d.causes[0].code, first.code);
  assert.equal(d.causes[0].t, first.t);
  assert.match(d.headline, /First problem at T\+\d+ s/);
  assert.ok(d.timeline.some((e) => e.code === first.code && Math.abs(e.t - first.t) < 1e-9));
  assert.ok(d.timeline.every((e, i, a) => i === 0 || a[i - 1].t <= e.t), 'timeline is in time order');
  assert.ok(d.timeline.some((e) => e.title.startsWith('Max-Q')), 'max-Q marker comes from telemetry');
  // plain text contains the measured value from the failure record
  assert.match(d.causes[0].plain, new RegExp(String((first.evidence.find((e) => e.label === 'Dynamic pressure').value / 1000).toFixed(1))));
  assert.equal(d.fixes[0].code, first.code);
  assert.equal(d.fixes[0].search.kind, 'thrust');
});

test('fix by test flights: smaller thrust is found by flying, then applied as ONE undo step, re-flown and shown before / after', async () => {
  const { vehicle, mission, rec } = await fixture();
  const bad = strong(clone(vehicle));
  const r = await flyRecordWith(rec, bad);
  const d = diagnose(r.record, r.telemetry, r.metrics);
  const tried = [];
  const res = await resolveSearchFix(d.fixes[0], r.record, { onTry: (t) => tried.push(t) });
  assert.ok(res.ok, JSON.stringify(res.tried.map((t) => [t.value, t.status, t.codes])));
  assert.ok(tried.length >= 1 && tried.length <= 5);
  const op = res.fix.ops[0];
  assert.equal(op.op, 'stage-thrust'); assert.ok(op.scale < 0.9 && op.scale >= 0.25);
  assert.ok(tried.slice(0, -1).every((t) => t.codes.includes(d.fixes[0].code)), 'earlier candidates still failed');

  // apply through the tool API to a project that holds the bad vehicle
  const tested = applyOps(clone(bad), res.fix.ops);      // what the test flight flew
  const project = new Project('fix test'); bad.id = 'veh_bad'; project.setVehicle(bad); project.setMission(clone(mission)); project.commit('Design');
  const api = new ToolAPI(new ToolContext({ project }));
  const steps0 = project.history.stack.length;
  const thrust0 = project.vehicle.components.filter((c) => c.kind === 'engine' && c.group === 'stage1').map((c) => c.thrustVac);
  const ap = await applyFix(api, res.fix, 'veh_bad');
  assert.ok(ap.ok, ap.message);
  assert.equal(project.history.stack.length, steps0 + 1, 'exactly one undo step');
  const thrust1 = project.vehicle.components.filter((c) => c.kind === 'engine' && c.group === 'stage1').map((c) => c.thrustVac);
  thrust1.forEach((t, i) => assert.ok(Math.abs(t / thrust0[i] - op.scale) < 1e-3));
  // the changed vehicle is the one that was test-flown
  assert.deepEqual(project.vehicle.components.map((c) => c.thrustVac), tested.components.map((c) => c.thrustVac));
  // re-fly through the tool, compare honestly
  const run = await api.execute('RUN_SIMULATION', { tune: false });
  assert.ok(run.ok);
  const after = await api.getRun(run.data.runId);
  const ba = beforeAfter(r.record, r.metrics, after.record, (await import('../src/core/run-analysis.js')).runMetrics(after.record, after.telemetry));
  assert.equal(ba.verdict, after.record.result.status === 'SUCCESS' ? 'FIXED' : ba.verdict);
  assert.equal(ba.rows.find((x) => x.key === 'status').a, 'FAILURE');
  // undo restores the design in one step
  project.undo();
  assert.deepEqual(project.vehicle.components.filter((c) => c.kind === 'engine' && c.group === 'stage1').map((c) => c.thrustVac), thrust0);
});

test('rocket-equation fix: propellant to add is computed from the vehicle mass model and the verified result is reported honestly', async () => {
  const { vehicle, rec } = await fixture();
  const v = clone(vehicle);
  applyOps(v, [{ op: 'stage-propellant', group: 'stage2', total: stagePropellant(vehicle, 'stage2') * 0.8 }]);     // 20 % less upper-stage propellant
  const r = await flyRecordWith(rec, v);
  assert.equal(r.status, 'FAILURE');
  const d = diagnose(r.record, r.telemetry, r.metrics);
  const fx = d.fixes.find((f) => f.code === 'INSUFFICIENT_DELTA_V'); assert.ok(fx);
  assert.equal(fx.how, 'rocket equation');
  assert.ok(fx.number.value >= 1 && fx.number.unit === 'kg');
  const add = fx.ops[0].total - fx.ops[0].from; assert.equal(add, fx.number.value);
  assert.ok(Math.abs(fx.ops[0].from - stagePropellant(v, 'stage2')) < 1e-6);
  const res = await resolveSearchFix(fx, r.record);
  assert.ok(res.tried.length >= 1);
  assert.ok(res.ok, JSON.stringify(res.tried.map((t) => [t.value, t.status])));
  {
    const r2 = await flyRecordWith(r.record, applyOps(clone(r.record.vehicle), res.fix.ops));
    assert.equal(beforeAfter(r.record, r.metrics, r2.record, r2.metrics).verdict, r2.status === 'SUCCESS' ? 'FIXED' : beforeAfter(r.record, r.metrics, r2.record, r2.metrics).verdict);
    assert.ok(res.fix.ops[0].total - res.fix.ops[0].from >= add, 'verified amount is at least the estimate');
  }
});

test('operations map to tool calls with the same numbers; a refused call leaves the project unchanged', async () => {
  const { vehicle, mission } = await fixture();
  const project = new Project('ops'); const v = clone(vehicle); v.id = 'veh_x'; project.setVehicle(v); project.setMission(clone(mission)); project.commit('Design');
  const calls = opsToToolCalls([{ op: 'stage-propellant', group: 'stage2', total: 2000, from: 1578 }, { op: 'stage-engines', group: 'stage1', count: 2, from: 1 }], v);
  assert.deepEqual(calls.map((c) => c.tool), ['MODIFY_STAGE', 'MODIFY_STAGE']);
  const api = new ToolAPI(new ToolContext({ project }));
  const ap = await applyFix(api, { title: 'test', ops: [{ op: 'stage-propellant', group: 'stage2', total: 2000, from: 1578 }] }, 'veh_x');
  assert.ok(ap.ok);
  assert.ok(Math.abs(stagePropellant(project.vehicle, 'stage2') - 2000) < 1);
  const bad = await applyFix(api, { title: 'bad', ops: [{ op: 'stage-propellant', group: 'nostage', total: 5, from: 1 }] }, 'veh_x');
  assert.equal(bad.ok, false);
  assert.ok(Math.abs(stagePropellant(project.vehicle, 'stage2') - 2000) < 1, 'unchanged after refusal');
  assert.equal((await applyFix(api, { title: 'x', ops: [] }, 'veh_x')).ok, false);
});

test('a successful flight has no failure fixes and a timeline that ends with success', async () => {
  const { vehicle, rec } = await fixture();
  const r = await flyRecordWith(rec, clone(vehicle));
  assert.equal(r.status, 'SUCCESS');
  const d = diagnose(r.record, r.telemetry, r.metrics);
  assert.equal(d.fixes.length, 0); assert.ok(['OK', 'PARTIAL'].includes(d.status));
  const tl = failureTimeline(r.record, r.telemetry, r.metrics);
  assert.equal(tl[tl.length - 1].title, 'Mission goal reached');
});
