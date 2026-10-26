// Requirements checklist: every verdict is computed from the recorded run; limits are editable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { flyRecordWith } from '../src/core/failure-analysis.js';
import { defaultRequirements, evaluateRequirements, applyOverrides, summarize, requirementText, designLimits } from '../src/core/requirements.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
let good, bad;
async function flights() {
  if (good) return { good, bad };
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const rec = { mission: r.mission, environment: {}, settings: {} };
  good = await flyRecordWith(rec, clone(r.vehicle));
  const v = clone(r.vehicle); for (const c of v.components) if (c.kind === 'engine' && c.group === 'stage1') c.thrustVac *= 2.2;
  bad = await flyRecordWith(rec, v);
  return { good, bad };
}
const row = (rows, id) => rows.find((r) => r.id === id);

test('a successful ascent passes the default checklist and every value equals the recorded measurement', async () => {
  const { good: g } = await flights();
  assert.equal(g.status, 'SUCCESS');
  const reqs = defaultRequirements(g.record, { m: g.metrics });
  const rows = evaluateRequirements(reqs, { record: g.record, tel: g.telemetry, m: g.metrics });
  for (const id of ['goal', 'orbit', 'twr', 'maxq', 'struct', 'g', 'payload']) assert.equal(row(rows, id).verdict, 'PASS', id + ': ' + row(rows, id).valueText);
  assert.equal(row(rows, 'maxq').value, g.metrics.maxQ);
  assert.equal(row(rows, 'g').value, g.metrics.maxG);
  assert.equal(row(rows, 'twr').value, g.metrics.liftoffTWR);
  // margin to the structural limit is computed from the weakest exposed part
  const lim = designLimits(g.record.vehicle);
  assert.ok(Math.abs(row(rows, 'maxq').margin - (lim.qLimit - g.metrics.maxQ) / lim.qLimit) < 1e-12);
  // the evidence points at a real time and channel of the telemetry
  const ev = row(rows, 'maxq').evidence; assert.equal(ev.channel, 'q'); assert.equal(ev.t, g.metrics.tMaxQ);
  const orbit = row(rows, 'orbit'); assert.ok(orbit.value < 0.1 && /km/.test(orbit.valueText));
  assert.ok(summarize(rows).total >= 8);
});

test('a failed flight fails the right requirements with negative margins', async () => {
  const { bad: b } = await flights();
  const rows = evaluateRequirements(defaultRequirements(b.record, { m: b.metrics }), { record: b.record, tel: b.telemetry, m: b.metrics });
  assert.equal(row(rows, 'goal').verdict, 'FAIL');
  assert.equal(row(rows, 'maxq').verdict, 'FAIL'); assert.ok(row(rows, 'maxq').margin < 0);
  assert.equal(row(rows, 'payload').verdict, 'FAIL');          // payload is only counted as delivered when the goal was reached
  assert.equal(row(rows, 'twr').verdict, 'PASS');
  assert.equal(summarize(rows).allPass, false);
});

test('limits can be edited, requirements switched off and custom ones added; the verdict follows', async () => {
  const { bad: b } = await flights();
  const reqs = defaultRequirements(b.record, { m: b.metrics });
  const q = reqs.find((r) => r.id === 'maxq');
  const relaxed = applyOverrides(reqs, { maxq: { limit: b.metrics.maxQ * 1.1 }, goal: { enabled: false } }, [{ id: 'c1', metric: 'twr', op: '>=', limit: 5, label: 'Very strong liftoff' }]);
  const rows = evaluateRequirements(relaxed, { record: b.record, tel: b.telemetry, m: b.metrics });
  assert.equal(row(rows, 'maxq').verdict, 'PASS'); assert.ok(row(rows, 'maxq').margin > 0.08);
  assert.equal(row(rows, 'goal').verdict, 'OFF');
  assert.equal(row(rows, 'c1').verdict, 'FAIL');                // liftoff T/W is about 3.7, below 5
  assert.equal(q.limit, designLimits(b.record.vehicle).qLimit, 'defaults are not modified');
  assert.match(requirementText({ op: '>=', limit: 5, unit: '', scale: 1, d: 2 }), /at least 5/);
});
