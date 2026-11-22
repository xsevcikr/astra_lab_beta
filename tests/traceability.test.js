// 2.9: requirements traceability. Mission need -> requirement -> allocated parts -> verification method -> evidence from a recorded run,
// coverage gaps, change impact between two runs, and the exchange files (CSV, Markdown, ReqIF).
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { flyRecordWith } from '../src/core/failure-analysis.js';
import { defaultRequirements, evaluateRequirements, applyOverrides } from '../src/core/requirements.js';
import { buildTrace, changeImpact, traceToCSV, traceToMarkdown, traceToReqIF, parseRequirementsCSV, METHODS } from '../src/core/traceability.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
let F;
async function flights() {
  if (F) return F;
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const rec = { mission: r.mission, environment: {}, settings: {} };
  const good = await flyRecordWith(rec, clone(r.vehicle));
  const v = clone(r.vehicle); for (const c of v.components) if (c.kind === 'engine' && c.group === 'stage1') c.thrustVac *= 2.2;
  const bad = await flyRecordWith(rec, v);
  F = { good, bad };
  return F;
}
const traceOf = (f, extra = {}) => {
  const reqs = applyOverrides(defaultRequirements(f.record, { m: f.metrics }), extra.overrides, extra.custom);
  const rows = evaluateRequirements(reqs, { record: f.record, tel: f.telemetry, m: f.metrics });
  return { reqs, rows, trace: buildTrace({ reqs, rows, record: f.record, history: extra.history }) };
};

test('every requirement traces up to the mission need and down to real parts of the flown vehicle, with its evidence', async () => {
  const { good } = await flights();
  const { trace, rows } = traceOf(good);
  assert.match(trace.need.text, /200 km orbit/);
  const ids = new Set(good.record.vehicle.components.map((c) => c.id));
  for (const i of trace.items) {
    assert.equal(i.parent, 'MN-1'); assert.ok(METHODS[i.method], i.id); assert.match(i.text, /shall/);
    for (const a of i.allocated) assert.ok(ids.has(a.id), `${i.id} -> ${a.id}`);
    const row = rows.find((r) => r.id === i.key);
    if (row.verdict === 'PASS') { assert.equal(i.status, 'VERIFIED'); assert.equal(i.evidence.measured, row.valueText); assert.equal(i.evidence.channel, row.evidence.channel); }
  }
  const twr = trace.items.find((i) => i.key === 'twr'); assert.ok(twr.allocated.length && twr.allocated.every((a) => a.kind === 'engine'));
  const q = trace.items.find((i) => i.key === 'maxq'); assert.ok(q.allocated.every((a) => good.record.vehicle.components.find((c) => c.id === a.id).maxQ != null));
  assert.equal(trace.items.find((i) => i.key === 'dv').method, 'A');
  const c = trace.coverage; assert.equal(c.components, good.record.vehicle.components.length); assert.ok(c.componentsTraced > 0 && c.componentsTraced <= c.components);
  assert.equal(c.verified + c.failed + c.notVerified.length, c.requirements);
  assert.equal(trace.configuration.runId, good.record.id);
});

test('a failed run shows FAILED items, a switched-off requirement is WAIVED, and history counts verdicts across runs', async () => {
  const { good, bad } = await flights();
  const gRows = traceOf(good).rows, bRows = traceOf(bad).rows;
  const { trace } = traceOf(bad, { overrides: { therm: { enabled: false } }, history: [{ runId: 'a', name: 'good', rows: gRows }, { runId: 'b', name: 'bad', rows: bRows }] });
  assert.ok(trace.items.some((i) => i.status === 'FAILED'));
  assert.equal(trace.items.find((i) => i.key === 'therm').status, 'WAIVED'); assert.equal(trace.coverage.waived, 1);
  const goal = trace.items.find((i) => i.key === 'goal');
  assert.deepEqual(goal.history.map((h) => h.verdict), [gRows.find((r) => r.id === 'goal').verdict, bRows.find((r) => r.id === 'goal').verdict]);
});

test('change impact: a stage-1 engine change asks to re-check the engine requirements and leaves unrelated ones alone', async () => {
  const { good, bad } = await flights();
  const { reqs } = traceOf(good);
  const imp = changeImpact(good.record, bad.record, reqs);
  assert.ok(imp.changes.some((c) => c.what === 'part changed' && /thrustVac/.test(c.detail)));
  const ids = imp.retest.map((r) => r.key);
  for (const k of ['goal', 'twr', 'orbit']) assert.ok(ids.includes(k), k);
  assert.ok(imp.unaffected.length > 0, 'something is unaffected');
  assert.equal(imp.retest.length + imp.unaffected.length, reqs.length);
  const none = changeImpact(good.record, good.record, reqs); assert.equal(none.changes.length, 0); assert.equal(none.retest.length, 0);
});

test('exchange files: CSV, Markdown and ReqIF carry every requirement; CSV import changes limits and adds custom requirements', async () => {
  const { good } = await flights();
  const { trace, reqs } = traceOf(good);
  const csv = traceToCSV(trace); const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, trace.items.length + 2); assert.match(lines[0], /^ID,Parent,Requirement/);
  const md = traceToMarkdown(trace); for (const i of trace.items) assert.ok(md.includes(i.id));
  const x = traceToReqIF(trace, { now: '2026-11-13T00:00:00Z' });
  assert.match(x, /<REQ-IF xmlns="http:\/\/www.omg.org\/spec\/ReqIF\/20110401\/reqif.xsd">/);
  assert.equal((x.match(/<SPEC-OBJECT /g) ?? []).length, trace.items.length + 1);
  assert.equal((x.match(/<SPEC-HIERARCHY /g) ?? []).length, trace.items.length + 1);
  assert.ok(!/[<>]"/.test(x.replace(/<[^>]+>/g, '')), 'no raw markup inside values');
  // import
  const src = 'id;metric;op;limit;label;enabled\nREQ-G;;;4,5;;\nmaxq;;;30;;no\n;maxTemp;at most;900;Nose below 900 K;\n;warp;<=;9;bad;';
  const imp = parseRequirementsCSV(src, reqs);
  assert.equal(imp.overrides.g.limit, 4.5); assert.equal(imp.overrides.maxq.limit, 30000); assert.equal(imp.overrides.maxq.enabled, false);
  assert.equal(imp.custom.length, 1); assert.equal(imp.custom[0].metric, 'maxTemp'); assert.equal(imp.custom[0].op, '<='); assert.equal(imp.custom[0].limit, 900);
  assert.equal(imp.skipped.length, 1); assert.match(imp.skipped[0].reason, /warp/);
  assert.throws(() => parseRequirementsCSV('a,b\n1,2', reqs), /limit/);
  // formula injection is neutralised in the CSV export
  const evil = { ...trace, need: { ...trace.need, text: '=HYPERLINK("x")' } };
  assert.match(traceToCSV(evil), /"'=HYPERLINK\(""x""\)"/);
});
