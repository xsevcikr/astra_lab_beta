// Post-mission engineering report: structured data -> HTML (screen / print), PDF (offline writer) and CSV (telemetry).
import { debrisReport, runMetrics, timeline, findings, chartSeries, REPORT_CHARTS, CHANNEL_META } from './run-analysis.js';
import { analyzeVehicle } from '../vehicles/analysis.js';
import { PdfDoc } from './pdf.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d) : '–');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildReport(record, tel, { units = 'metric' } = {}) {
  const res = record.result ?? {};
  const m = runMetrics(record, tel);
  let design = null;
  try {
    const an = analyzeVehicle(record.vehicle, { body: record.environment?.body ?? 'earth' });
    design = {
      totalMass: an.totalMass, dryMass: an.dryMass, propellantMass: an.propellantMass, liftoffTWR: an.liftoffTWR, dvVacuum: an.dvVacuum, length: an.length, diameter: an.diameter,
      stages: an.stages.map((s) => ({ id: s.id, name: s.name, ignitionMass: s.ignitionMass, propellant: s.propellant, engines: s.engines, thrustVac: s.thrustVac, dvVac: s.dvVac, burnTime: s.burnTime, twrStart: s.twrStart })),
    };
  } catch { /* vehicle without engines etc. */ }
  const failures = res.failures ?? [];
  const solutions = [...new Set(failures.flatMap((f) => f.solutions ?? []))];
  const labels = [...new Set((record.vehicle.components ?? []).map((c) => c.dataSource ?? 'user'))];
  return {
    schema: 'astra.report/1',
    title: `Mission report — ${record.name}`,
    generated: new Date().toISOString(),
    run: { id: record.id, created: record.created, engine: record.engine },
    verdict: { status: res.status ?? 'UNKNOWN', reason: res.reason ?? '', objectiveMet: !!res.objective?.success, objective: res.objective },
    vehicle: { name: record.vehicle.name, type: record.vehicle.type, components: record.vehicle.components.length, design },
    mission: { name: record.mission.name, description: record.mission.description ?? '', objective: record.mission.objective, environment: record.environment?.body, events: record.mission.events?.length ?? 0 },
    metrics: m,
    findings: findings(record, tel, m),
    timeline: timeline(record),
    debris: (() => { try { return debrisReport(record); } catch { return []; } })(),
    failures,
    recommendations: solutions,
    charts: REPORT_CHARTS.map((c) => ({ ...c, ...chartSeries(tel, c.channels) })),
    dataLabels: labels,
    assumptions: [
      'Numerical model: RK4 integration of 6-DOF rigid-body dynamics with variable mass (see documentation/PHYSICS.md).',
      'Reference frame: body-centred inertial frame per celestial body, patched-conic sphere-of-influence transfers, Keplerian ephemerides.',
      'Vehicle data labelled "fictional" or "user" are not real product specifications; "estimated" values are engineering estimates.',
      'A simulation shows what this model predicts for these inputs; it is not a flight-certification result.',
    ],
    units,
  };
}


/** One text row per jettisoned piece: what it was, where and when it comes down (or which orbit it stays in). */
export function debrisRows(rep) {
  return (rep.debris ?? []).map((d) => {
    const name = d.group.startsWith('deploy:') ? 'Spent upper stage after payload release' : d.group === 'fairing' ? 'Payload fairing' : `${d.group.replace('stage', 'Stage ')}`;
    const where = d.impact
      ? `Impact ${fmt(d.impact.after / 60, 1)} min after separation at ${fmt(Math.abs(d.impact.lat), 2)}° ${d.impact.lat >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(d.impact.lon), 2)}° ${d.impact.lon >= 0 ? 'E' : 'W'}${d.impact.downrangeKm != null ? `, ${fmt(d.impact.downrangeKm, 0)} km downrange` : ''}, ${fmt(d.impact.speed, 0)} m/s`
      : d.orbit ? `Still in flight after ${fmt(d.orbit.horizon / 3600, 0)} h, orbit ${fmt(d.orbit.periAlt / 1000, 0)} x ${Number.isFinite(d.orbit.apoAlt) ? fmt(d.orbit.apoAlt / 1000, 0) : '(escape)'} km` : '-';
    return [name, `${fmt(d.mass, 0)} kg`, `T+${fmt(d.tSep, 0)} s at ${fmt((d.altSep ?? 0) / 1000, 0)} km`, where];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------------------------
function svgChart(ch, w = 720, h = 200) {
  const pad = { l: 56, r: 12, t: 22, b: 26 };
  const cols = ['#4aa3ff', '#ff7a45', '#45d483', '#c07cff'];
  let lo = Infinity, hi = -Infinity;
  for (const id of ch.channels) for (const v of ch.series[id]) { const y = v * ch.scale; if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
  if (!Number.isFinite(lo)) return '';
  if (hi - lo < 1e-9) hi = lo + 1;
  const t = ch.t, t0 = t[0], t1 = t[t.length - 1] > t[0] ? t[t.length - 1] : t[0] + 1;
  const X = (v) => pad.l + ((v - t0) / (t1 - t0)) * (w - pad.l - pad.r), Y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" class="chart"><rect x="0" y="0" width="${w}" height="${h}" fill="#0d1420"/>`;
  for (let k = 0; k <= 4; k++) { const v = lo + (k / 4) * (hi - lo); s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1f2b3d"/><text x="${pad.l - 6}" y="${Y(v) + 3}" fill="#8fa3bf" font-size="10" text-anchor="end">${Math.abs(v) >= 1000 ? v.toExponential(1) : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)}</text>`; }
  for (let k = 0; k <= 5; k++) { const v = t0 + (k / 5) * (t1 - t0); s += `<text x="${X(v)}" y="${h - 8}" fill="#8fa3bf" font-size="10" text-anchor="middle">${v.toFixed(0)}</text>`; }
  ch.channels.forEach((id, i) => {
    const pts = t.map((tt, j) => `${X(tt).toFixed(1)},${Y(ch.series[id][j] * ch.scale).toFixed(1)}`).join(' ');
    s += `<polyline fill="none" stroke="${cols[i % 4]}" stroke-width="1.6" points="${pts}"/><text x="${pad.l + 8 + i * 110}" y="14" fill="${cols[i % 4]}" font-size="11">${esc(CHANNEL_META[id]?.label ?? id)}</text>`;
  });
  return s + `<text x="${w - pad.r}" y="14" fill="#8fa3bf" font-size="11" text-anchor="end">${esc(ch.title)} [${esc(ch.unit)}] vs time [s]</text></svg>`;
}

export function reportToHTML(rep) {
  const v = rep.verdict, m = rep.metrics;
  const okc = v.status === 'SUCCESS' ? '#45d483' : '#ff5c5c';
  const conf = { CONFIRMED: '#ff5c5c', LIKELY: '#ffb04a', POSSIBLE: '#9fb0c8' };
  const rows = (arr) => arr.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  const metricRows = [
    ['Result', esc(v.status), 'Reason', esc(v.reason)],
    ['Mission duration', `${fmt(m.endTime, 0)} s`, 'Max altitude', `${fmt(m.maxAlt / 1000, 1)} km`],
    ['Peak dynamic pressure', `${fmt(m.maxQ / 1000, 1)} kPa @ T+${fmt(m.tMaxQ, 0)} s`, 'Peak acceleration', `${fmt(m.maxG, 2)} g`],
    ['Delta-v delivered', `${fmt(m.dvIdeal, 0)} m/s`, 'Losses (grav / drag / steer)', `${fmt(m.dvGravity, 0)} / ${fmt(m.dvDrag, 0)} / ${fmt(m.dvSteering, 0)} m/s`],
    ['Initial mass', `${fmt(m.initialMass, 0)} kg`, 'Propellant used', `${fmt(m.propellantUsed, 0)} of ${fmt(m.initialPropellant, 0)} kg`],
    ['Final orbit (peri × apo)', m.finalPeri != null ? `${fmt(m.finalPeri / 1000, 1)} × ${fmt(m.finalApo / 1000, 1)} km` : '–', 'Peak nose temperature', `${fmt(m.maxTempNose, 0)} K`],
  ];
  const design = rep.vehicle.design;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(rep.title)}</title>
<style>
:root{color-scheme:dark}body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;background:#0a0f18;color:#dbe6f5;margin:0;padding:32px;max-width:960px;margin:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;border-bottom:1px solid #22324a;padding-bottom:6px;margin-top:32px;color:#8ec5ff}h3{font-size:14px;margin:14px 0 4px}
.badge{display:inline-block;padding:2px 12px;border-radius:12px;font-weight:700;background:${okc}22;color:${okc};border:1px solid ${okc}}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid #1c2a40;padding:5px 8px;text-align:left;vertical-align:top}th{color:#8ea3c0;font-weight:600;background:#101a2b}
.card{background:#101a2b;border:1px solid #22324a;border-radius:8px;padding:12px 16px;margin:10px 0}.muted{color:#8ea3c0;font-size:12px}
.chart{width:100%;height:auto;border:1px solid #22324a;border-radius:6px;margin:6px 0}ul{margin:4px 0;padding-left:22px}code{background:#16233a;padding:1px 5px;border-radius:4px}
.tag{font-size:11px;font-weight:700;padding:1px 8px;border-radius:10px;border:1px solid}
@media print{body{background:#fff;color:#000}.card,th{background:#f3f5f8;border-color:#ccd}h2{color:#134}.chart{filter:invert(1) hue-rotate(180deg)}}
</style></head><body>
<h1>${esc(rep.title)}</h1><div class="muted">Generated ${esc(rep.generated)} · Vehicle: ${esc(rep.vehicle.name)} (${esc(rep.vehicle.type)}) · Mission: ${esc(rep.mission.name)} · Body: ${esc(rep.mission.environment)}</div>
<p><span class="badge">${esc(v.status)}</span> ${esc(v.reason)}</p>
<h2>1. Summary of results</h2><table>${rows(metricRows)}</table>
<h2>2. Findings</h2><ul>${rep.findings.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>
${design ? `<h2>3. Vehicle design</h2><div class="card">Total mass ${fmt(design.totalMass, 0)} kg · dry ${fmt(design.dryMass, 0)} kg · propellant ${fmt(design.propellantMass, 0)} kg · length ${fmt(design.length, 1)} m · diameter ${fmt(design.diameter, 2)} m · liftoff T/W ${fmt(design.liftoffTWR, 2)} · vacuum Δv ${fmt(design.dvVacuum, 0)} m/s</div>
<table><tr><th>Stage</th><th>Ignition mass</th><th>Propellant</th><th>Engines</th><th>Vac. thrust</th><th>Δv (vac)</th><th>Burn time</th></tr>${rows(design.stages.map((s) => [esc(s.name), `${fmt(s.ignitionMass, 0)} kg`, `${fmt(s.propellant, 0)} kg`, s.engines, `${fmt(s.thrustVac / 1000, 0)} kN`, `${fmt(s.dvVac, 0)} m/s`, `${fmt(s.burnTime, 0)} s`]))}</table>` : ''}
<h2>4. Mission timeline</h2><table><tr><th>T+ [s]</th><th>Type</th><th>Event</th></tr>${rows(rep.timeline.map((e) => [fmt(e.t, 1), esc(e.kind), esc(e.text)]))}</table>
${rep.debris?.length ? `<h2>5. Jettisoned hardware and predicted impact points</h2><table><tr><th>Piece</th><th>Mass</th><th>Separated</th><th>Outcome</th></tr>${rows(debrisRows(rep).map((r) => r.map(esc)))}</table><p class="muted">Each piece is flown on with gravity and drag from its recorded state. Nominal separation velocity and tumbling drag (Cd 1.0) are assumed; winds and lift are not modelled, so the position is an estimate, not a range-safety clearance.</p>` : ''}
<h2>6. Failure analysis</h2>${rep.failures.length ? rep.failures.map((f) => `<div class="card"><h3>${esc(f.title)} <span class="tag" style="color:${conf[f.confidence] ?? '#9fb0c8'};border-color:${conf[f.confidence] ?? '#9fb0c8'}">${esc(f.confidence)}</span> <span class="muted">T+${fmt(f.t, 1)} s · ${esc(f.severity)}</span></h3>
<p><b>Cause:</b> ${esc(f.primaryCause)}</p>${f.contributing?.length ? `<b>Contributing factors</b><ul>${f.contributing.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
${f.evidence?.length ? `<b>Evidence (from telemetry)</b><table>${rows(f.evidence.map((e) => [esc(e.label), `${Number.isFinite(e.value) ? Number(e.value).toPrecision(5) : esc(e.value)} ${esc(e.unit ?? '')}`]))}</table>` : ''}
${f.equation ? `<p><b>Governing equation:</b> ${esc(f.equation.name)}: <code>${esc(f.equation.formula)}</code> ${esc(f.equation.values ?? '')}</p>` : ''}
<p><b>Consequence:</b> ${esc(f.consequences)}</p>${f.solutions?.length ? `<b>Suggested solutions</b><ul>${f.solutions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>`).join('') : '<p>No failures were detected.</p>'}
<h2>7. Recommendations</h2>${rep.recommendations.length ? `<ul>${rep.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p>No corrective action is required by this run.</p>'}
<h2>8. Telemetry charts</h2>${rep.charts.map(svgChart).join('')}
<h2>9. Data labels and assumptions</h2><p class="muted">Component data sources in this vehicle: ${rep.dataLabels.map(esc).join(', ')}.</p><ul>${rep.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
</body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------------------
export function reportToPDF(rep) {
  const pdf = new PdfDoc({ title: rep.title });
  const v = rep.verdict, m = rep.metrics;
  pdf.y -= 8; pdf.text(pdf.margin, pdf.y - 14, 'ASTRA LAB', { size: 9, bold: true, color: [0.05, 0.2, 0.5] }); pdf.y -= 16;
  pdf.paragraph(rep.title, { size: 20, bold: true, color: [0.05, 0.1, 0.25], gap: 2 });
  pdf.paragraph(`Vehicle: ${rep.vehicle.name} (${rep.vehicle.type})   Mission: ${rep.mission.name}   Body: ${rep.mission.environment}   Generated: ${rep.generated}`, { size: 8.5, color: [0.4, 0.4, 0.45] });
  pdf.rect(pdf.margin, pdf.y - 26, pdf.contentWidth, 24, { fill: v.status === 'SUCCESS' ? [0.85, 0.97, 0.9] : [0.99, 0.88, 0.88] });
  pdf.text(pdf.margin + 8, pdf.y - 18, `RESULT: ${v.status}`, { size: 12, bold: true, color: v.status === 'SUCCESS' ? [0.05, 0.5, 0.2] : [0.75, 0.1, 0.1] });
  pdf.text(pdf.margin + 140, pdf.y - 18, String(v.reason).slice(0, 80), { size: 9 });
  pdf.y -= 34;
  pdf.heading('1. Summary of results');
  pdf.table(['Metric', 'Value', 'Metric', 'Value'], [
    ['Mission duration', `${fmt(m.endTime, 0)} s`, 'Max altitude', `${fmt(m.maxAlt / 1000, 1)} km`],
    ['Peak dynamic pressure', `${fmt(m.maxQ / 1000, 1)} kPa at T+${fmt(m.tMaxQ, 0)} s`, 'Peak acceleration', `${fmt(m.maxG, 2)} g`],
    ['Delta-v delivered', `${fmt(m.dvIdeal, 0)} m/s`, 'Gravity / drag / steering loss', `${fmt(m.dvGravity, 0)} / ${fmt(m.dvDrag, 0)} / ${fmt(m.dvSteering, 0)} m/s`],
    ['Initial mass', `${fmt(m.initialMass, 0)} kg`, 'Propellant used', `${fmt(m.propellantUsed, 0)} of ${fmt(m.initialPropellant, 0)} kg`],
    ['Final orbit (peri x apo)', m.finalPeri != null ? `${fmt(m.finalPeri / 1000, 1)} x ${fmt(m.finalApo / 1000, 1)} km` : '-', 'Peak nose temperature', `${fmt(m.maxTempNose, 0)} K`],
  ], [0.24, 0.26, 0.26, 0.24]);
  pdf.heading('2. Findings');
  for (const f of rep.findings) pdf.paragraph('• ' + f.text, { size: 9.5, indent: 6, gap: 1.5 });
  const d = rep.vehicle.design;
  if (d) {
    pdf.heading('3. Vehicle design');
    pdf.paragraph(`Total mass ${fmt(d.totalMass, 0)} kg, dry ${fmt(d.dryMass, 0)} kg, propellant ${fmt(d.propellantMass, 0)} kg, length ${fmt(d.length, 1)} m, diameter ${fmt(d.diameter, 2)} m, liftoff T/W ${fmt(d.liftoffTWR, 2)}, vacuum delta-v ${fmt(d.dvVacuum, 0)} m/s.`, { size: 9.5 });
    pdf.table(['Stage', 'Ignition mass', 'Propellant', 'Engines', 'Vac. thrust', 'Dv (vac)', 'Burn'], d.stages.map((s) => [s.name, `${fmt(s.ignitionMass, 0)} kg`, `${fmt(s.propellant, 0)} kg`, String(s.engines), `${fmt(s.thrustVac / 1000, 0)} kN`, `${fmt(s.dvVac, 0)} m/s`, `${fmt(s.burnTime, 0)} s`]), [0.2, 0.15, 0.14, 0.1, 0.15, 0.14, 0.12]);
  }
  pdf.heading('4. Mission timeline');
  pdf.table(['T+ [s]', 'Type', 'Event'], rep.timeline.map((e) => [fmt(e.t, 1), e.kind, e.text]), [0.1, 0.16, 0.74], { size: 8.5 });
  if (rep.debris?.length) {
    pdf.heading('5. Jettisoned hardware and predicted impact points');
    pdf.table(['Piece', 'Mass', 'Separated', 'Outcome'], debrisRows(rep), [0.2, 0.09, 0.19, 0.52], { size: 8.5 });
    pdf.paragraph('Each piece is flown on with gravity and drag from its recorded state (nominal separation velocity, tumbling drag Cd 1.0). Winds and lift are not modelled: the position is an estimate, not a range-safety clearance.', { size: 8.5, color: [0.4, 0.4, 0.45] });
  }
  pdf.heading('6. Failure analysis');
  if (!rep.failures.length) pdf.paragraph('No failures were detected.', { size: 10 });
  for (const f of rep.failures) {
    pdf.heading(`${f.title}  [${f.confidence}]`, 2);
    pdf.paragraph(`T+${fmt(f.t, 1)} s, severity ${f.severity}`, { size: 8.5, color: [0.4, 0.4, 0.45] });
    pdf.paragraph('Cause: ' + f.primaryCause, { size: 9.5 });
    if (f.contributing?.length) { pdf.paragraph('Contributing factors:', { size: 9.5, bold: true, gap: 1 }); for (const c of f.contributing) pdf.paragraph('• ' + c, { size: 9, indent: 8, gap: 1 }); }
    if (f.evidence?.length) pdf.table(['Evidence (from telemetry)', 'Value'], f.evidence.map((e) => [e.label, `${Number.isFinite(e.value) ? Number(e.value).toPrecision(5) : e.value} ${e.unit ?? ''}`]), [0.6, 0.4], { size: 8.5 });
    if (f.equation) pdf.paragraph(`Governing equation - ${f.equation.name}: ${f.equation.formula}  ${f.equation.values ?? ''}`, { size: 9 });
    pdf.paragraph('Consequence: ' + f.consequences, { size: 9.5 });
    if (f.solutions?.length) { pdf.paragraph('Suggested solutions:', { size: 9.5, bold: true, gap: 1 }); for (const c of f.solutions) pdf.paragraph('• ' + c, { size: 9, indent: 8, gap: 1 }); }
  }
  pdf.heading('7. Recommendations');
  if (!rep.recommendations.length) pdf.paragraph('No corrective action is required by this run.', { size: 10 });
  for (const r of rep.recommendations) pdf.paragraph('• ' + r, { size: 9.5, indent: 6, gap: 1.5 });
  pdf.heading('8. Telemetry charts');
  const palette = [[0.1, 0.4, 0.9], [0.9, 0.35, 0.1]];
  for (const ch of rep.charts) pdf.chart({ title: ch.title, unit: ch.unit, t: ch.t, series: ch.channels.map((id, i) => ({ label: CHANNEL_META[id]?.label ?? id, values: ch.series[id].map((x) => x * ch.scale), color: palette[i % 2] })), height: 100 });
  pdf.heading('9. Data labels and assumptions');
  pdf.paragraph(`Component data sources: ${rep.dataLabels.join(', ')}.`, { size: 9.5 });
  for (const a of rep.assumptions) pdf.paragraph('• ' + a, { size: 9, indent: 6, gap: 1.5 });
  return pdf.build();
}

export const reportToCSV = (tel, channels) => tel.toCSV(channels);

/** Summary rows as CSV (metrics of one run) - handy for spreadsheets. */
export function metricsToCSV(m) {
  const rows = Object.entries(m).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean').map(([k, v]) => `${k},${typeof v === 'string' ? JSON.stringify(v) : v}`);
  return ['metric,value', ...rows].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// PROFESSIONAL MISSION REPORT (requirements, failure analysis, Monte Carlo, trade study, assumptions, reproducibility)
// ---------------------------------------------------------------------------------------------------------------
import { VALIDATION_VEHICLES, TOLERANCE_NOTE } from '../../data/validation-vehicles.js';
import { histogramBins, tornado as mcTornado, describeFactors } from './montecarlo.js';
import { CHANNEL_INDEX } from '../../physics/telemetry.js';
import { designLimits } from './requirements.js';
import { designCost } from './trade.js';

const evVal = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 100 ? v.toFixed(1) : Number(v.toPrecision(4)).toString()) : String(v));
const MC_LABEL = { orbitError: 'Orbit error: larger of periapsis / apoapsis miss [m]', periError: 'Periapsis error [m]', apoError: 'Apoapsis error [m]', finalPeri: 'Final periapsis [m]', finalApo: 'Final apoapsis [m]', maxQ: 'Max dynamic pressure [Pa]', maxG: 'Peak acceleration [g]', maxAlt: 'Max altitude [m]', touchdownVertical: 'Touchdown vertical speed [m/s]', propellantUsed: 'Propellant used [kg]', endTime: 'Mission duration [s]' };
const fnum = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d) : '-');
const ASSUMPTION_KINDS = { orbit: ['ascent', 'orbit'], landing: ['landing'], traverse: ['rover'], survive: ['orbit'] };

/**
 * Everything the PDF / HTML needs, gathered once.
 * opts: {requirements: rows from evaluateRequirements, failure: result of diagnose() (+ .fix {title, ba}), mc: Monte Carlo result,
 *        trade: runTrade() result, version, assumptionsData: ASSUMPTIONS from ui/lib/assumptions.js, units}
 */
export function buildProReport(record, tel, opts = {}) {
  const base = buildReport(record, tel, { units: opts.units });
  const m = base.metrics, lim = designLimits(record.vehicle);
  const kinds = [...(ASSUMPTION_KINDS[record.mission?.objective?.type] ?? ['ascent', 'orbit'])]; if (opts.mc) kinds.push('montecarlo');
  const assumptions = opts.assumptionsData ? kinds.filter((k) => opts.assumptionsData[k]).map((k) => ({ title: opts.assumptionsData[k].title, inc: opts.assumptionsData[k].inc, ign: opts.assumptionsData[k].ign })) : [];
  const dvBudget = m.dvIdeal > 0 ? [
    { label: 'Delivered by engines (ideal)', value: m.dvIdeal }, { label: 'Lost to gravity', value: m.dvGravity ?? 0 }, { label: 'Lost to drag', value: m.dvDrag ?? 0 }, { label: 'Lost to steering', value: m.dvSteering ?? 0 },
    ...(base.vehicle.design ? [{ label: 'Design total (vacuum, rocket eq.)', value: base.vehicle.design.dvVacuum }] : []),
  ] : [];
  const markers = (base.timeline ?? []).filter((e) => /ignition|separation|cutoff|burn|jettison|liftoff|deploy/i.test(e.text) && e.kind !== 'FAILURE').slice(0, 7).map((e) => ({ t: e.t, label: e.text.split(' — ')[0].replace(/ \(.*\)/, '').slice(0, 22) }));
  const failMarks = (record.result?.failures ?? []).map((f) => ({ t: f.t, label: f.code.replace(/_/g, ' ').toLowerCase().slice(0, 22), color: [0.8, 0.1, 0.1] }));
  const mc = opts.mc ? (() => {
    const an = opts.mc.analysis, metric = an.metric;
    return { name: opts.mc.name, vehicle: opts.mc.vehicle, seed: opts.mc.seed, runs: opts.mc.rows.length, wallMs: opts.mc.wallMs, analysis: an, factors: describeFactors(opts.mc.factors), hist: histogramBins(opts.mc.rows, metric), metric, tornado: mcTornado(opts.mc.rows, opts.mc.factors, metric).slice(0, 8), targetAltitude: opts.mc.targetAltitude };
  })() : null;
  return {
    ...base, schema: 'astra.report.pro/1', title: `Mission report - ${record.name}`,
    meta: { version: opts.version ?? 'unknown', date: new Date().toISOString(), runId: record.id, runCreated: record.created, engine: `${record.engine?.name ?? 'astra-physics'} ${record.engine?.version ?? ''}, ${record.engine?.integrator ?? 'RK4'}, ${record.engine?.deterministic ? 'deterministic' : ''}`.trim(), dt: record.settings?.dt, accuracy: record.settings?.accuracy, fingerprint: record.fingerprint?.inputs, resultFingerprint: record.fingerprint?.results, gravity: record.settings?.j2 ? 'point mass + J2 (equatorial bulge)' : 'point mass', weather: record.environment?.wind?.speed ? `wind ${record.environment.wind.speed} m/s from ${record.environment.wind.fromDeg ?? 270} deg, gusts ${Math.round(100 * (record.environment.wind.gustFraction ?? 0.25))} %, seed ${record.environment.wind.seed ?? 1}${record.environment.densityScale && record.environment.densityScale !== 1 ? `, air density ${Math.round(100 * record.environment.densityScale)} %` : ''}` : (record.environment?.densityScale && record.environment.densityScale !== 1 ? `air density ${Math.round(100 * record.environment.densityScale)} %` : 'no wind, standard air density'), seed: opts.mc?.seed ?? opts.trade?.seed ?? null },
    cost: (() => { try { return designCost(record.vehicle); } catch { return null; } })(), warningsText: (record.result?.warnings ?? []).slice(0, 8).map((w) => `Warning at T+${fnum(w.t, 0)} s: ${w.message}`), requirements: opts.requirements ?? [], failureAnalysis: opts.failure ?? null, limits: lim, dvBudget, markers: [...markers, ...failMarks], mc, trade: opts.trade ?? null, assumptionGroups: assumptions,
    validation: {
      vehicles: VALIDATION_VEHICLES.map((v) => v.name),
      text: `The simulator is compared with published data for ${VALIDATION_VEHICLES.map((v) => v.name).join(', ')} (Validation screen and documentation/VALIDATION.md). Input numbers are graded within 5 %, flight results within 10 %; some rows are outside their bands and are reported as such. This design is not one of those vehicles: its results are model predictions, not flight data.`,
      bands: TOLERANCE_NOTE ? 'See validation page for tolerance bands.' : '',
    },
  };
}

export function proReportToPDF(rep) {
  const GREY = [0.4, 0.4, 0.45], BLUE = [0.05, 0.2, 0.5], RED = [0.75, 0.1, 0.1], GREEN = [0.05, 0.5, 0.2];
  const pdf = new PdfDoc({ title: rep.title, footer: `ASTRA LAB ${rep.meta.version} | ${rep.meta.date.slice(0, 10)} | run ${rep.meta.runId}${rep.meta.seed != null ? ` | seed ${rep.meta.seed}` : ''}` });
  const v = rep.verdict, m = rep.metrics;
  const okc = v.status === 'SUCCESS';
  // ---- cover
  pdf.y -= 8; pdf.text(pdf.margin, pdf.y - 14, 'ASTRA LAB  -  MISSION REPORT', { size: 9, bold: true, color: BLUE }); pdf.y -= 18;
  pdf.paragraph(rep.title.replace('Mission report - ', ''), { size: 20, bold: true, color: [0.05, 0.1, 0.25], gap: 2 });
  pdf.paragraph(`Vehicle: ${rep.vehicle.name} (${rep.vehicle.type})   |   Mission: ${rep.mission.name}   |   Body: ${rep.mission.environment}`, { size: 8.5, color: GREY });
  pdf.paragraph(`Report date ${rep.meta.date.slice(0, 19).replace('T', ' ')} UTC   |   ASTRA LAB version ${rep.meta.version}   |   Run ${rep.meta.runId} (${String(rep.meta.runCreated).slice(0, 19).replace('T', ' ')})`, { size: 8.5, color: GREY });
  const reqs = rep.requirements.filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL'), rp = reqs.filter((r) => r.verdict === 'PASS').length;
  pdf.rect(pdf.margin, pdf.y - 30, pdf.contentWidth, 28, { fill: okc ? [0.85, 0.97, 0.9] : [0.99, 0.88, 0.88] });
  pdf.text(pdf.margin + 8, pdf.y - 14, `RESULT: ${v.status}`, { size: 12, bold: true, color: okc ? GREEN : RED });
  pdf.text(pdf.margin + 140, pdf.y - 14, String(v.reason).slice(0, 70), { size: 9 });
  if (reqs.length) pdf.text(pdf.margin + 8, pdf.y - 25, `Requirements: ${rp} of ${reqs.length} met`, { size: 8.5, color: rp === reqs.length ? GREEN : RED, bold: true });
  pdf.y -= 40;
  let n = 0; const H = (t) => { pdf.ensure(120); pdf.heading(`${++n}. ${t}`); };
  // ---- summary
  H('Summary');
  pdf.table(['Metric', 'Value', 'Metric', 'Value'], [
    ['Mission duration', `${fnum(m.endTime, 0)} s`, 'Max altitude', `${fnum(m.maxAlt / 1000, 1)} km`],
    ['Peak dynamic pressure', `${fnum(m.maxQ / 1000, 1)} kPa at T+${fnum(m.tMaxQ, 0)} s`, 'Peak acceleration', `${fnum(m.maxG, 2)} g at T+${fnum(m.tMaxG, 0)} s`],
    ['Delta-v delivered', `${fnum(m.dvIdeal, 0)} m/s`, 'Gravity / drag / steering loss', `${fnum(m.dvGravity, 0)} / ${fnum(m.dvDrag, 0)} / ${fnum(m.dvSteering, 0)} m/s`],
    ['Liftoff mass', `${fnum(m.initialMass, 0)} kg`, 'Propellant used', `${fnum(m.propellantUsed, 0)} of ${fnum(m.initialPropellant, 0)} kg`],
    ['Final orbit (peri x apo)', m.finalPeri != null ? `${fnum(m.finalPeri / 1000, 1)} x ${fnum(m.finalApo / 1000, 1)} km` : '-', 'Liftoff thrust-to-weight', fnum(m.liftoffTWR, 2)],
  ], [0.24, 0.26, 0.26, 0.24]);
  for (const f of rep.findings.filter((x) => x.level !== 'info' || true).slice(0, 8)) pdf.paragraph('- ' + f.text, { size: 9, indent: 6, gap: 1 });
  // ---- requirements
  H('Requirements verification');
  if (!rep.requirements.length) pdf.paragraph('No requirements were defined for this report.', { size: 9.5 });
  else {
    pdf.paragraph('Each verdict compares the limit with a value measured in this recorded run (telemetry and result data) or computed from the flown design. Margin is the distance to the limit; positive means the requirement is met with room to spare.', { size: 8.5, color: GREY });
    pdf.table(['Requirement', 'Limit', 'Measured', 'Margin', 'Verdict'], rep.requirements.filter((r) => r.verdict !== 'OFF').map((r) => [r.label, r.req, r.valueText, r.marginText, r.verdict]), [0.28, 0.17, 0.3, 0.13, 0.12], { size: 8, colors: (cell, col) => (col === 4 ? (cell === 'PASS' ? GREEN : cell === 'FAIL' ? RED : GREY) : null), boldCols: [4] });
  }
  // ---- design
  const d = rep.vehicle.design;
  H('Design');
  if (d) {
    pdf.paragraph(`Total mass ${fnum(d.totalMass, 0)} kg, dry ${fnum(d.dryMass, 0)} kg, propellant ${fnum(d.propellantMass, 0)} kg, length ${fnum(d.length, 1)} m, diameter ${fnum(d.diameter, 2)} m, liftoff thrust-to-weight ${fnum(d.liftoffTWR, 2)}, vacuum delta-v (rocket equation) ${fnum(d.dvVacuum, 0)} m/s.`, { size: 9.5 });
    pdf.table(['Stage', 'Ignition mass', 'Propellant', 'Engines', 'Vac. thrust', 'Dv (vac)', 'Burn time', 'T/W start'], d.stages.map((s) => [s.name, `${fnum(s.ignitionMass, 0)} kg`, `${fnum(s.propellant, 0)} kg`, String(s.engines), `${fnum(s.thrustVac / 1000, 0)} kN`, `${fnum(s.dvVac, 0)} m/s`, `${fnum(s.burnTime, 0)} s`, fnum(s.twrStart, 2)]), [0.16, 0.14, 0.13, 0.09, 0.13, 0.12, 0.11, 0.12], { size: 8.5 });
  } else pdf.paragraph('The static design analysis is not available for this vehicle.', { size: 9.5 });
  if (rep.limits.qLimit || rep.limits.gLimit) pdf.paragraph(`Part ratings: dynamic pressure ${rep.limits.qLimit ? fnum(rep.limits.qLimit / 1000, 1) + ' kPa' + (rep.limits.qName ? ` (${rep.limits.qName})` : '') : 'none declared'}; acceleration ${rep.limits.gLimit ? fnum(rep.limits.gLimit, 1) + ' g' + (rep.limits.gName ? ` (${rep.limits.gName})` : '') : 'none declared'}.`, { size: 8.5, color: GREY });
  const cost = rep.cost;
  if (cost) pdf.paragraph(`Hardware cost from catalog costs (illustrative US$, parts without a catalog cost are not counted): ${Math.round(cost.total).toLocaleString('en-US')} US$ for ${cost.priced} priced parts, ${cost.unpriced} parts unpriced.`, { size: 8.5, color: GREY });
  // ---- delta-v
  H('Delta-v budget');
  if (rep.dvBudget.length) {
    pdf.bars({ title: 'Delta-v delivered and lost in this flight', unit: 'm/s', items: rep.dvBudget.map((b, i) => ({ label: b.label, value: b.value, color: [[0.1, 0.4, 0.9], [0.9, 0.4, 0.15], [0.6, 0.3, 0.75], [0.8, 0.65, 0.1], [0.4, 0.4, 0.45]][i % 5], text: `${fnum(b.value, 0)} m/s` })) });
    const loss = (m.dvGravity ?? 0) + (m.dvDrag ?? 0) + (m.dvSteering ?? 0);
    pdf.paragraph(`Of the ${fnum(m.dvIdeal, 0)} m/s the engines delivered, ${fnum(loss, 0)} m/s (${fnum((100 * loss) / m.dvIdeal, 0)} %) was lost to gravity, drag and steering. Values are accumulated during the simulated flight, not estimated.`, { size: 9 });
  } else pdf.paragraph('No delta-v budget was recorded for this mission type.', { size: 9.5 });
  // ---- charts
  H('Flight data');
  const palette = [[0.1, 0.4, 0.9], [0.9, 0.35, 0.1]];
  for (const ch of rep.charts) {
    const limit = ch.title === 'Dynamic pressure' && rep.limits.qLimit ? { value: rep.limits.qLimit * ch.scale, label: 'rating' } : ch.title === 'Acceleration' && rep.limits.gLimit ? { value: rep.limits.gLimit, label: 'rating' } : null;
    pdf.chart({ title: ch.title, unit: ch.unit, t: ch.t, markers: rep.markers, limit, height: 105, series: ch.channels.map((id, i) => ({ label: CHANNEL_META[id]?.label ?? id, values: ch.series[id].map((x) => x * ch.scale), color: palette[i % 2] })) });
  }
  // ---- events
  H('Events timeline');
  pdf.table(['T+ [s]', 'Type', 'Event'], rep.timeline.map((e) => [fnum(e.t, 1), e.kind, e.text]), [0.1, 0.16, 0.74], { size: 8, colors: (cell, col, row) => (rep.timeline[row]?.kind === 'FAILURE' && col === 1 ? RED : null) });
  if (rep.debris?.length) { pdf.heading('Jettisoned hardware', 2); pdf.table(['Piece', 'Mass', 'Separated', 'Outcome'], debrisRows(rep), [0.2, 0.09, 0.19, 0.52], { size: 8 }); }
  // ---- failure analysis
  H('Failure analysis');
  const fa = rep.failureAnalysis;
  if (!fa || (!fa.causes?.length && !rep.failures.length)) pdf.paragraph('No failure was detected in this run.', { size: 9.5 });
  else {
    pdf.paragraph(fa.headline, { size: 10.5, bold: true, color: RED });
    pdf.table(['T+ [s]', 'Problem', 'What happened'], fa.causes.map((c) => [fnum(c.t, 0), c.title + (c.confidence ? ` [${c.confidence}]` : ''), c.plain]), [0.09, 0.28, 0.63], { size: 8 });
    for (const c of fa.causes.slice(0, 4)) {
      pdf.heading(`${c.title} (T+${fnum(c.t, 0)} s)`, 3);
      pdf.paragraph('Cause: ' + c.cause, { size: 9 });
      if (c.evidence?.length) pdf.table(['Evidence (from telemetry)', 'Value'], c.evidence.map((e) => [e.label, `${evVal(e.value)} ${e.unit ?? ''}`]), [0.6, 0.4], { size: 8 });
      if (c.equation) pdf.paragraph(`Equation - ${c.equation.name}: ${c.equation.formula}  ${c.equation.values ?? ''}`, { size: 8.5, color: GREY });
    }
    if (fa.fixes?.length) {
      pdf.heading('Suggested fixes (sizes computed, see method)', 2);
      pdf.table(['Fix', 'Number', 'Method'], fa.fixes.map((f) => [f.title, f.number?.text ?? '-', f.how === 'none' ? 'not computed' : f.how]), [0.5, 0.25, 0.25], { size: 8.5 });
      for (const f of fa.fixes.filter((x) => x.detail)) pdf.paragraph(`${f.title}: ${f.detail}`, { size: 8, color: GREY, gap: 1.5 });
    }
    if (fa.after) {
      pdf.heading('Before and after the applied fix', 2);
      pdf.paragraph(`Applied: ${fa.after.applied}. Result: ${fa.after.text}`, { size: 9.5, bold: true, color: fa.after.verdict === 'FIXED' ? GREEN : RED });
      pdf.table(['', 'Before', 'After'], fa.after.rows.map((r) => [`${r.label}${r.unit ? ' [' + r.unit + ']' : ''}`, typeof r.a === 'number' ? fnum(r.a, Math.abs(r.a) < 100 ? 2 : 0) : String(r.a ?? '-'), typeof r.b === 'number' ? fnum(r.b, Math.abs(r.b) < 100 ? 2 : 0) : String(r.b ?? '-')]), [0.4, 0.3, 0.3], { size: 8.5 });
    }
  }
  if (rep.warningsText?.length) { pdf.heading('Warnings during the flight', 3); for (const w of rep.warningsText) pdf.paragraph('- ' + w, { size: 8.5, indent: 6, gap: 1 }); }
  // ---- Monte Carlo
  if (rep.mc) {
    H('Monte Carlo analysis');
    const a = rep.mc.analysis;
    pdf.paragraph(`${a.verdict}`, { size: 10, bold: true });
    pdf.paragraph(`Design flown: ${rep.mc.vehicle ?? rep.vehicle.name}. Seed ${rep.mc.seed}, ${rep.mc.runs} flights, success probability ${fnum(100 * a.successRate, 0)} % (95 % Wilson interval ${fnum(100 * a.ci95[0], 0)} to ${fnum(100 * a.ci95[1], 0)} %). The same seed reproduces the same draws and the same results.`, { size: 9 });
    pdf.paragraph('What was varied (each flight multiplies these inputs by a random factor):', { size: 9, bold: true, gap: 1 });
    for (const f of rep.mc.factors) pdf.paragraph('- ' + f.text, { size: 8.5, indent: 6, gap: 1 });
    if (rep.mc.hist) pdf.histogram({ title: `Distribution of ${MC_LABEL[rep.mc.metric] ?? rep.mc.metric}`, hist: rep.mc.hist, label: MC_LABEL[rep.mc.metric] ?? rep.mc.metric });
    if (rep.mc.tornado.length && rep.mc.tornado.some((x) => x.swing > 0)) pdf.tornado({ title: `Sensitivity of ${MC_LABEL[rep.mc.metric] ?? rep.mc.metric} to +/- 1 sigma of each input`, items: rep.mc.tornado.filter((x) => x.low != null).map((x) => ({ label: x.factor, low: x.low, high: x.high })), center: (rep.mc.tornado[0].low + rep.mc.tornado[0].high) / 2 });
    if (Object.keys(a.failureCodes).length) pdf.paragraph('Failure modes seen: ' + Object.entries(a.failureCodes).sort((x, y) => y[1] - x[1]).map(([c, k]) => `${c} x${k}`).join(', '), { size: 8.5 });
  }
  // ---- trade study
  if (rep.trade) {
    H('Trade study');
    for (const d2 of Object.values(rep.trade.definitions ?? {})) pdf.paragraph('- ' + d2, { size: 8, indent: 6, gap: 1, color: GREY });
    pdf.table(['Design', 'Result', 'Payload', 'Cost (US$)', 'Risk', 'Note'], rep.trade.entries.map((e) => [e.label, e.status, `${fnum(e.payload, 0)} kg`, Math.round(e.cost).toLocaleString('en-US'), e.mc ? `${fnum(100 * e.mc.p, 0)} % fail (${fnum(100 * e.mc.lo, 0)}-${fnum(100 * e.mc.hi, 0)})` : `${fnum(100 * e.riskMargin, 0)} % of limit`, e.dominated ? `dominated by ${e.dominatedBy}` : e.feasible ? 'efficient' : 'does not reach goal']), [0.2, 0.11, 0.1, 0.14, 0.2, 0.25], { size: 8 });
  }
  // ---- assumptions
  H('Assumptions and limits');
  for (const g of rep.assumptionGroups) {
    pdf.heading(g.title, 2);
    pdf.paragraph('Modelled:', { size: 8.5, bold: true, gap: 1 }); for (const [t] of g.inc) pdf.paragraph('- ' + t, { size: 8, indent: 6, gap: 0.8 });
    pdf.paragraph('Ignored or approximated:', { size: 8.5, bold: true, gap: 1 }); for (const [t] of g.ign) pdf.paragraph('- ' + t, { size: 8, indent: 6, gap: 0.8 });
  }
  for (const a of rep.assumptions) pdf.paragraph('- ' + a, { size: 8.5, indent: 6, gap: 1 });
  pdf.paragraph(`Component data sources in this vehicle: ${rep.dataLabels.join(', ')}.`, { size: 8.5, color: GREY });
  // ---- validation, reproducibility
  H('Validation note');
  pdf.paragraph(rep.validation.text, { size: 9 });
  H('Reproducibility');
  pdf.table(null, [
    ['ASTRA LAB version', rep.meta.version], ['Report date (UTC)', rep.meta.date], ['Run id / recorded', `${rep.meta.runId} / ${rep.meta.runCreated}`], ['Physics engine', rep.meta.engine], ['Time step / accuracy', `${rep.meta.dt ?? 'default'} s / ${rep.meta.accuracy ?? 'standard'}`],
    ['Input fingerprint', rep.meta.fingerprint ?? 'not recorded (run made with an older version)'], ['Result fingerprint', rep.meta.resultFingerprint ?? 'not recorded'],
    ['Gravity / weather', `${rep.meta.gravity ?? 'point mass'}; ${rep.meta.weather ?? 'no wind, standard air density'}`],
    ['Random seed', rep.meta.seed != null ? String(rep.meta.seed) : 'not used (single deterministic flight)'],
  ], [0.3, 0.7], { size: 8.5 });
  pdf.paragraph('The simulation is deterministic: the same vehicle, mission, environment, settings and seed give the same numbers. A simulation shows what this model predicts for these inputs; it is not a flight-certification result.', { size: 8.5, color: GREY });
  return pdf.build();
}

// ---------------------------------------------------------------------------------------------------------------
// TELEMETRY EXPORT (all channels, units in the header)
// ---------------------------------------------------------------------------------------------------------------
/** CSV with every channel; the header cell of each column is "id [unit]". Values are SI. */
export function telemetryCSV(tel, { channels } = {}) { return tel.toCSV(channels); }
/**
 * A ready-to-run analysis script for scientists: loads the telemetry CSV that was exported next to it (same base name) and plots altitude,
 * speed and mass. kind: 'python' (numpy, pandas, matplotlib) or 'matlab' (also GNU Octave). Header cells of the CSV look like "id [unit]".
 */
export function analysisScript(record, kind, csvName) {
  const fp = record.fingerprint?.inputs ?? 'n/a', title = `${record.vehicle?.name ?? 'vehicle'}: ${record.mission?.name ?? 'mission'}`.replace(/['"%\\]/g, ' ');
  if (kind === 'matlab') return `% ASTRA LAB telemetry loader (MATLAB / GNU Octave). Run ${record.id}, input fingerprint ${fp}.
% Put this file next to ${csvName} and run it. Columns are named after the channel ids, all values are SI.
T = readtable('${csvName}', 'VariableNamingRule', 'modify');
disp(T.Properties.VariableNames);
t = T.t;
figure; subplot(3,1,1); plot(t, T.alt/1000); ylabel('altitude [km]'); title('${title}');
subplot(3,1,2); plot(t, T.speed); ylabel('speed [m/s]');
subplot(3,1,3); plot(t, T.mass); ylabel('mass [kg]'); xlabel('time [s]');
`;
  return `"""ASTRA LAB telemetry loader. Run ${record.id}, input fingerprint ${fp}.
Put this file next to ${csvName} and run it (needs pandas, matplotlib). Header cells look like "id [unit]"; all values are SI."""
import re
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("${csvName}")
df.columns = [re.sub(r"\\s*\\[.*\\]$", "", c) for c in df.columns]   # drop the unit from the names: df["alt"], df["speed"], ...
print(list(df.columns))
fig, ax = plt.subplots(3, 1, sharex=True)
ax[0].plot(df["t"], df["alt"] / 1000); ax[0].set_ylabel("altitude [km]"); ax[0].set_title("${title}")
ax[1].plot(df["t"], df["speed"]); ax[1].set_ylabel("speed [m/s]")
ax[2].plot(df["t"], df["mass"]); ax[2].set_ylabel("mass [kg]"); ax[2].set_xlabel("time [s]")
plt.show()
`;
}
/** JSON: run description, units and labels per channel, and the data as columns (all values SI). */
export function telemetryJSON(record, tel, { version = null, channels } = {}) {
  const ids = channels?.length ? channels : Object.keys(CHANNEL_INDEX);
  const data = {}, units = {}, labels = {};
  for (const id of ids) { data[id] = Array.from(tel.column(id), (x) => (Number.isInteger(x) ? x : Number(x.toPrecision(9)))); units[id] = CHANNEL_META[id].unit; labels[id] = CHANNEL_META[id].label; }
  return JSON.stringify({ schema: 'astra.telemetry/1', generator: `ASTRA LAB ${version ?? ''}`.trim(), run: { id: record.id, name: record.name, created: record.created, vehicle: record.vehicle?.name, mission: record.mission?.name, status: record.result?.status, reason: record.result?.reason, engine: record.engine }, samples: tel.count, unitsSystem: 'SI', units, labels, data });
}
