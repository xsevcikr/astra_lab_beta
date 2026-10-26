// Engineering reports built from simulation results and calculations only. Export to JSON, CSV, Markdown and a
// printable HTML page (the desktop app prints it to PDF through Electron's printToPDF).
import { massBudget, performance } from '../vehicle/model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 2) => (v === null || v === undefined ? 'n/a' : typeof v === 'number' ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-2 && v !== 0) ? v.toExponential(d) : v.toFixed(d)) : String(v));

export function buildMissionReport({ title = 'Mission engineering report', objective, vehicles = [], mission, verification, mc, review, risk, recommendations = [] }) {
  const sections = [];
  sections.push({ id: 'objective', title: 'Mission objective', text: objective || 'Not stated.' });
  sections.push({ id: 'configuration', title: 'Vehicle configuration', table: vehicles.map((v) => ({ vehicle: v.name, version: v.version, stages: v.stages.length, engines: v.stages.map((s) => s.engines.map((e) => `${e.count ?? 1}x ${e.name || e.id}`).join(' + ')).join(' / ') })) });
  sections.push({ id: 'mass', title: 'Mass budget', table: vehicles.flatMap((v) => massBudget(v).rows.map((r) => ({ vehicle: v.name, item: r.item, dry_kg: r.dry, propellant_kg: r.prop, total_kg: r.total }))) });
  sections.push({ id: 'propulsion', title: 'Propulsion and delta-v', table: vehicles.flatMap((v) => performance(v).stages.map((s) => ({ vehicle: v.name, stage: s.stage, isp_s: s.isp, thrust_N: s.thrust, dv_ms: s.dv, burn_s: s.burnTime }))), note: 'Ideal (vacuum, loss-free) delta-v; losses appear in the trajectory results.' });
  if (mission) {
    sections.push({ id: 'trajectory', title: 'Mission phases', table: mission.phases.map((p) => ({ phase: p.name, met_h: p.met / 3600, result: p.success ? 'PASS' : 'FAIL', detail: p.text, model: p.model })) });
    const rec = mission.recorder;
    const peaks = ['altitude', 'speed', 'accelerationG', 'heatShieldTemp', 'linkMargin', 'batterySoc'].filter((n) => rec.channels.has(n)).map((n) => { const s = rec.stats(n); return { channel: n, unit: rec.channels.get(n).unit, min: s.min, max: s.max, at_max_h: s.tMax !== null ? s.tMax / 3600 : null }; });
    sections.push({ id: 'telemetry', title: 'Telemetry extremes', table: peaks });
    sections.push({ id: 'loads', title: 'Maximum loads and thermal results', table: Object.entries(mission.metrics).map(([k, v]) => ({ metric: k, value: v })) });
    sections.push({ id: 'failures', title: 'Failures and anomalies', table: mission.timeline.events.filter((e) => ['critical', 'warning'].includes(e.severity)).map((e) => ({ met_h: e.t / 3600, severity: e.severity, event: e.text })) });
    sections.push({ id: 'success', title: 'Mission result', text: mission.success ? 'Mission completed: all phases passed in this simulation run.' : `Mission failed in phase "${mission.failedPhase}". The simulation stopped there; later phases were not flown.` });
  }
  if (verification) sections.push({ id: 'requirements', title: 'Requirement verification', table: verification.rows.map((r) => ({ id: r.id, requirement: r.text, value: r.result.value, status: r.result.status, margin: r.result.margin, note: r.result.note || '' })), summary: verification.counts });
  if (mc) sections.push({ id: 'montecarlo', title: 'Monte Carlo', text: `${mc.runs} runs; success ${(mc.successProbability.p * 100).toFixed(1)}% (95% CI ${(mc.successProbability.lo * 100).toFixed(1)}-${(mc.successProbability.hi * 100).toFixed(1)}%).`, table: Object.entries(mc.failureModes).map(([mode, n]) => ({ failureMode: mode, runs: n })) });
  if (risk) sections.push({ id: 'risk', title: 'Risk', table: risk.map((c) => ({ category: c.label, level: c.level, value: c.value, unit: c.unit, why: c.why })) });
  if (review) sections.push({ id: 'review', title: 'Design review findings', table: review.findings.map((f) => ({ severity: f.severity, area: f.area, finding: f.title, evidence: f.evidence, recommendation: f.recommendation })) });
  const recs = [...recommendations, ...(review?.findings || []).filter((f) => f.severity !== 'minor').map((f) => f.recommendation)];
  sections.push({ id: 'recommendations', title: 'Recommendations', list: [...new Set(recs)].slice(0, 12) });
  return { title, generated: new Date().toISOString(), sections, provenance: 'All values come from ASTRA LAB simulation runs and engineering calculations. Model labels: physics, approximation, simplification.' };
}

export function reportToMarkdown(r) {
  const out = [`# ${r.title}`, '', `Generated ${r.generated}`, '', `_${r.provenance}_`, ''];
  for (const s of r.sections) {
    out.push(`## ${s.title}`, '');
    if (s.text) out.push(s.text, '');
    if (s.note) out.push(`_${s.note}_`, '');
    if (s.table?.length) { const cols = Object.keys(s.table[0]); out.push(`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...s.table.map((row) => `| ${cols.map((c) => fmt(row[c])).join(' | ')} |`), ''); }
    if (s.list) out.push(...s.list.map((x) => `- ${x}`), '');
  }
  return out.join('\n');
}
export function tableToCSV(rows) {
  if (!rows?.length) return '';
  const cols = Object.keys(rows[0]);
  const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
}
export function reportToHTML(r) {
  const body = r.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.text ? `<p>${esc(s.text)}</p>` : ''}${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}${s.table?.length ? `<table><thead><tr>${Object.keys(s.table[0]).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.table.map((row) => `<tr>${Object.keys(s.table[0]).map((c) => `<td class="${row[c] === 'FAIL' ? 'fail' : row[c] === 'PASS' ? 'pass' : ''}">${esc(fmt(row[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${s.list ? `<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>body{font:12px/1.45 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px}h2{font-size:14px;border-bottom:1px solid #999;margin-top:20px}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #ccc;padding:3px 6px;text-align:left;font-variant-numeric:tabular-nums}th{background:#eee}.fail{color:#b00;font-weight:600}.pass{color:#060}.note{color:#555;font-style:italic}</style></head><body><h1>${esc(r.title)}</h1><p>Generated ${esc(r.generated)}</p><p class="note">${esc(r.provenance)}</p>${body}</body></html>`;
}
