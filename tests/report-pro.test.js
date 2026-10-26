// Professional PDF report and telemetry exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { flyRecordWith, diagnose, resolveSearchFix } from '../src/core/failure-analysis.js';
import { defaultRequirements, evaluateRequirements } from '../src/core/requirements.js';
import { runMonteCarlo } from '../src/core/montecarlo.js';
import { buildProReport, proReportToPDF, telemetryCSV, telemetryJSON } from '../src/core/report.js';
import { CHANNELS, CHANNEL_META } from '../physics/telemetry.js';
import { ASSUMPTIONS } from '../ui/lib/assumptions.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const text = (bytes) => Buffer.from(bytes).toString('latin1');

let ctx;
async function fixture() {
  if (ctx) return ctx;
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const rec = { mission: r.mission, environment: {}, settings: {} };
  const v = clone(r.vehicle); for (const c of v.components) if (c.kind === 'engine' && c.group === 'stage1') c.thrustVac *= 2.2;
  const bad = await flyRecordWith(rec, v);
  const d = diagnose(bad.record, bad.telemetry, bad.metrics);
  const res = await resolveSearchFix(d.fixes[0], bad.record); d.fixes[0] = res.fix;
  const reqs = evaluateRequirements(defaultRequirements(bad.record, { m: bad.metrics }), { record: bad.record, tel: bad.telemetry, m: bad.metrics });
  const mc = await runMonteCarlo({ runs: 4, seed: 99 }, { vehicle: r.vehicle, mission: r.mission, environment: {}, settings: {} });
  ctx = { bad, d, reqs, mc };
  return ctx;
}

test('PDF report: valid file structure, all required sections, seed + version + date, verdicts from the run', async () => {
  const { bad, d, reqs, mc } = await fixture();
  const rep = buildProReport(bad.record, bad.telemetry, { requirements: reqs, failure: d, mc, version: '9.9.9', assumptionsData: ASSUMPTIONS });
  const pdf = proReportToPDF(rep); const s = text(pdf);
  assert.ok(s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
  // cross-reference table: every offset points at "n 0 obj"
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]); const lines = s.slice(xref).split('\n');
  const nObj = Number(lines[1].split(' ')[1]);
  for (let i = 1; i < nObj; i++) { const off = Number(lines[2 + i].slice(0, 10)); assert.ok(s.slice(off).startsWith(`${i} 0 obj`), `object ${i}`); }
  const pages = (s.match(/\/Type \/Page /g) ?? []).length; assert.ok(pages >= 6, `pages ${pages}`);
  for (const h of ['Summary', 'Requirements verification', 'Design', 'Delta-v budget', 'Flight data', 'Events timeline', 'Failure analysis', 'Monte Carlo analysis', 'Assumptions and limits', 'Validation note', 'Reproducibility']) assert.ok(s.includes(h), h);
  assert.ok(s.includes('ASTRA LAB 9.9.9') && s.includes('seed 99') && /20\d\d-\d\d-\d\d/.test(s));
  assert.ok(s.includes('FAIL') && s.includes('PASS'));
  assert.ok(s.includes(bad.record.id));
  // the verdict text of every requirement row is in the PDF
  for (const r of reqs.filter((x) => x.verdict !== 'OFF')) assert.ok(s.includes(r.label.slice(0, 20)), r.label);
  assert.ok(s.includes(d.headline.slice(0, 30)));
  assert.ok(pdf.length < 600000);
});

test('PDF without optional parts still builds (successful run, no Monte Carlo, no failure)', async () => {
  const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher });
  const ok = await flyRecordWith({ mission: r.mission, environment: {}, settings: {} }, r.vehicle);
  const rep = buildProReport(ok.record, ok.telemetry, { version: '1.0.0' });
  const s = text(proReportToPDF(rep));
  assert.ok(s.includes('No failure was detected in this run.') && s.includes('No requirements were defined'));
  assert.ok(!s.includes('Monte Carlo analysis') && !s.includes('Trade study'));
});

test('telemetry export: all channels, units in every CSV header cell; JSON carries units and the same numbers', async () => {
  const { bad } = await fixture();
  const csv = telemetryCSV(bad.telemetry); const lines = csv.split('\n');
  const head = lines[0].split(',');
  assert.equal(head.length, CHANNELS.length); assert.equal(lines.length, bad.telemetry.count + 1);
  CHANNELS.forEach((c, i) => assert.equal(head[i], `${c[0]} [${c[2]}]`));
  const js = JSON.parse(telemetryJSON(bad.record, bad.telemetry, { version: '1.4.0' }));
  assert.equal(js.samples, bad.telemetry.count); assert.equal(Object.keys(js.data).length, CHANNELS.length);
  for (const id of ['alt', 'q', 'mass']) { assert.equal(js.units[id], CHANNEL_META[id].unit); assert.equal(js.data[id].length, js.samples); }
  const i = 100; assert.ok(Math.abs(js.data.alt[i] - bad.telemetry.column('alt')[i]) < 1e-3 * Math.max(1, Math.abs(js.data.alt[i])));
  assert.equal(js.run.id, bad.record.id);
  const sub = JSON.parse(telemetryJSON(bad.record, bad.telemetry, { channels: ['t', 'alt'] })); assert.deepEqual(Object.keys(sub.data), ['t', 'alt']);
});
