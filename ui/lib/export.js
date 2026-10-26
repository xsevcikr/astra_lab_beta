// Exports and the small amount of session state the professional screens share (requirements, last trade study, last applied fix).
import { saveFile, pickFile } from './widgets.js';
import { exportOEM, exportSpiceText, parseEphemeris, samplesOf, compareEphemeris } from '../../src/core/ccsds.js';
import { toast } from './dom.js';
import { runMetrics } from '../../src/core/run-analysis.js';
import { defaultRequirements, applyOverrides, evaluateRequirements } from '../../src/core/requirements.js';
import { diagnose } from '../../src/core/failure-analysis.js';
import { buildProReport, proReportToPDF, telemetryCSV, telemetryJSON, analysisScript } from '../../src/core/report.js';
import { ASSUMPTIONS } from './assumptions.js';
import { buildAssurance, assuranceToPDF } from '../../src/core/assurance.js';
import { APP_VERSION } from '../screens/settings.js';

/** Session state shared by the screens: {trade, after: {beforeRunId, afterRunId, ...}, resolved: {runId: {code: fix}}}. */
export const proState = (app) => (app._pro ??= { trade: null, after: null, resolved: {} });

// ---------------------------------------------------------------- requirements (kept in the project so they are saved with it)
export function reqStore(app) {
  const mem = app.project.memory ?? (app.project.memory = { aliases: {}, notes: [] });
  return (mem.requirements ??= { overrides: {}, custom: [] });
}
export function requirementsFor(app, record, m) {
  const st = reqStore(app);
  return applyOverrides(defaultRequirements(record, { m }), st.overrides, st.custom);
}
export function evaluateFor(app, { record, telemetry }, m) {
  return evaluateRequirements(requirementsFor(app, record, m), { record, tel: telemetry, m });
}

// ---------------------------------------------------------------- files
const base = (record) => record.name.replace(/[^\w.-]+/g, '_');
export async function exportTelemetry(app, runId, kind = 'csv') {
  try {
    const r = await app.getRun(runId);
    if (kind === 'json') return saveFile(app, `${base(r.record)}-telemetry.json`, telemetryJSON(r.record, r.telemetry, { version: APP_VERSION }), 'application/json');
    if (kind === 'py' || kind === 'm') return saveFile(app, `${base(r.record)}-analysis.${kind}`, analysisScript(r.record, kind === 'py' ? 'python' : 'matlab', `${base(r.record)}-telemetry.csv`), 'text/plain');
    return saveFile(app, `${base(r.record)}-telemetry.csv`, telemetryCSV(r.telemetry), 'text/csv');
  } catch (e) { toast(`Export failed: ${e.message}`, 'bad', 8000); return null; }
}
/** The professional PDF: requirements, failure analysis (with the last applied fix), Monte Carlo and trade study when they exist for this run. */
export async function exportProPdf(app, runId) {
  try {
    const r = await app.getRun(runId); const m = runMetrics(r.record, r.telemetry);
    const st = proState(app);
    const failure = diagnose(r.record, r.telemetry, m);
    const res = st.resolved[r.record.id]; if (res) failure.fixes = failure.fixes.map((f) => res[f.code] ?? f);
    if (st.after && (st.after.beforeRunId === r.record.id || st.after.afterRunId === r.record.id)) failure.after = st.after;
    const mc = app.api.ctx.lastMonteCarlo && app.api.ctx.lastMonteCarlo.vehicle === r.record.vehicle.name ? app.api.ctx.lastMonteCarlo : null;
    const rep = buildProReport(r.record, r.telemetry, { requirements: evaluateFor(app, r, m), failure, mc, trade: st.trade, version: APP_VERSION, assumptionsData: ASSUMPTIONS, units: app.settings.units });
    return saveFile(app, `${base(r.record)}-mission-report.pdf`, proReportToPDF(rep), 'application/pdf');
  } catch (e) { toast(`PDF export failed: ${e.message}`, 'bad', 8000); return null; }
}

/** 2.5: the mission-assurance review: can the result be trusted, and what is still open. */
export async function exportAssurancePdf(app, runId) {
  try {
    const r = await app.getRun(runId); const m = runMetrics(r.record, r.telemetry);
    const st = proState(app);
    const failure = diagnose(r.record, r.telemetry, m);
    const mc = app.api.ctx.lastMonteCarlo && app.api.ctx.lastMonteCarlo.vehicle === r.record.vehicle.name ? app.api.ctx.lastMonteCarlo : null;
    const rep = buildProReport(r.record, r.telemetry, { requirements: evaluateFor(app, r, m), failure, mc, trade: st.trade, version: APP_VERSION, assumptionsData: ASSUMPTIONS, units: app.settings.units });
    return saveFile(app, `${base(r.record)}-assurance-review.pdf`, assuranceToPDF(buildAssurance(rep, r.record)), 'application/pdf');
  } catch (e) { toast(`PDF export failed: ${e.message}`, 'bad', 8000); return null; }
}

// ---------------------------------------------------------------- trajectory exchange (2.3): CCSDS OEM and SPICE-style text
export async function exportEphemeris(app, runId, kind = 'oem') {
  try {
    const r = await app.getRun(runId);
    if (kind === 'spice') return saveFile(app, `${base(r.record)}-trajectory.spice.txt`, exportSpiceText(r.record, r.telemetry), 'text/plain');
    return saveFile(app, `${base(r.record)}.oem`, exportOEM(r.record, r.telemetry), 'text/plain');
  } catch (e) { toast(`Export failed: ${e.message}`, 'bad', 8000); return null; }
}
/** Pick an OEM or SPICE-text trajectory and compare it with this flight; returns the comparison (or null). */
export async function compareWithEphemeris(app, runId) {
  const f = await pickFile('.oem,.txt,.spice,.csv'); if (!f) return null;
  try {
    const ref = parseEphemeris(f.text), r = await app.getRun(runId);
    const cmp = compareEphemeris(samplesOf(r.telemetry, { maxSamples: 4000 }), r.record.environment?.epoch ?? 0, ref);
    if (!cmp) throw new Error('The file and this flight do not cover the same times. The times in the file must lie inside the flight (the flight starts at its mission epoch, set in the Planner).');
    return { file: f.name, ref: { object: ref.object, center: ref.center, frame: ref.frame, n: ref.samples.length }, ...cmp };
  } catch (e) { toast(`Comparison failed: ${e.message}`, 'bad', 9000); return null; }
}
