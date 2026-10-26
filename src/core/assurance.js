// Mission-assurance review (2.5): one PDF in the shape of a design-review package. It answers "can we believe this result?":
// the verdict and its margins, how far the model has been checked against real flights (and where it has not), the odds of success
// under dispersions (Monte Carlo, with a confidence interval), what the run depends on, and how to reproduce it exactly.
// Everything here is read from a recorded run and the project; nothing is invented. Missing parts say so.
import { PdfDoc } from './pdf.js';
import { VALIDATION_SUMMARY } from '../../data/validation-summary.js';

const fnum = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d) : '-');

/** The models a run switched on, and what is known about each. */
export function modelsUsed(record) {
  const env = record.environment ?? {}, st = record.settings ?? {}, v = record.vehicle ?? {};
  const out = [{ name: 'Ascent, staging and orbit insertion', status: 'checked', note: `Compared with published numbers for ${VALIDATION_SUMMARY.length} launchers (table below) and 8 reference orbits.` }];
  const comps = v.components ?? [];
  if (env.sounding) out.push({ name: `Real weather (${env.sounding.name ?? 'sounding'})`, status: 'partly', note: 'The method reproduces the standard atmosphere within 1 % density (unit test). The accuracy of the data is the balloon\'s; no flight was compared against a measured wind.' });
  else if (env.atmosphereProfile === 'tropical') out.push({ name: 'Warm tropical day', status: 'checked', note: 'Moved the Saturn V Max-Q altitude from 16 % low to 0.5 % off. A typical summer day, not a real sounding.' });
  if (env.wind?.speed) out.push({ name: 'Wind and gusts', status: 'partly', note: 'Directions and speeds are unit-tested. The structural effect of wind (bending load) is not compared with a real flight.' });
  if (env.densityScale && env.densityScale !== 1) out.push({ name: 'Air density scaling', status: 'partly', note: 'A simple multiplier; checked only for direction of effect.' });
  if (st.j2) out.push({ name: 'Precise gravity (J2)', status: 'checked', note: 'Orbit drift (precession) matches the published rate within its band.' });
  if (st.slosh) out.push({ name: 'Fuel slosh', status: 'not', note: 'A reduced-order first-mode model. Not compared with flight data.' });
  if (st.flex) out.push({ name: 'Body bending', status: 'not', note: 'One bending mode. Not compared with flight data.' });
  if (comps.some((c) => c.thrustCurve || c.thrustShape || c.thrustCurveTime)) out.push({ name: 'Thrust that changes during the burn', status: 'partly', note: 'Used in the Atlas V validation (throttle after the boosters); the Shuttle-type solid shapes are generic.' });
  if (record.mission?.objective?.type === 'landing' || /apollo|return|splash/i.test(record.mission?.name ?? '')) out.push({ name: 'Entry, parachutes and landing', status: 'partly', note: 'Apollo 11 timeline within 10 %; Curiosity touchdown speed is 10 % off (no sky-crane model).' });
  return out;
}

/** Collects what the PDF needs from the pro-report data (src/core/report.js buildProReport) and the run record. */
export function buildAssurance(rep, record) {
  const reqs = (rep.requirements ?? []).filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL');
  const mc = rep.mc?.analysis ?? null;
  return {
    title: `Mission assurance review - ${record.name ?? rep.title}`, rep, record, reqs,
    reqPass: reqs.filter((r) => r.verdict === 'PASS').length,
    models: modelsUsed(record), validation: VALIDATION_SUMMARY, mc,
    fingerprint: record.fingerprint ?? null,
    open: openItems(rep, reqs, mc, modelsUsed(record)),
  };
}

function openItems(rep, reqs, mc, models) {
  const o = [];
  if (rep.verdict?.status !== 'SUCCESS') o.push(`The recorded flight ended as ${rep.verdict?.status}: ${rep.verdict?.reason}.`);
  for (const r of reqs.filter((x) => x.verdict === 'FAIL')) o.push(`Requirement not met: ${r.label} (limit ${r.req}, measured ${r.valueText}).`);
  if (!mc) o.push('No Monte Carlo run belongs to this vehicle, so there is no probability of success. Run the Monte Carlo screen, then export again.');
  else if (mc.valid < 100) o.push(`Only ${mc.valid} dispersed flights: the confidence interval on the success probability is wide. 200 or more is customary.`);
  for (const m of models.filter((x) => x.status === 'not')) o.push(`${m.name} is on and has not been compared with a real flight.`);
  if ((rep.warningsText ?? []).length) o.push(`${rep.warningsText.length} warning(s) were raised during the flight (see section 7).`);
  return o;
}

export function assuranceToPDF(a) {
  const GREY = [0.4, 0.4, 0.45], BLUE = [0.05, 0.2, 0.5], RED = [0.75, 0.1, 0.1], GREEN = [0.05, 0.5, 0.2], AMB = [0.7, 0.45, 0.0];
  const rep = a.rep, m = rep.metrics, v = rep.verdict, ok = v.status === 'SUCCESS';
  const pdf = new PdfDoc({ title: a.title, footer: `ASTRA LAB ${rep.meta.version} | mission assurance review | ${rep.meta.date.slice(0, 10)} | run ${rep.meta.runId}` });
  pdf.y -= 8; pdf.text(pdf.margin, pdf.y - 14, 'ASTRA LAB  -  MISSION ASSURANCE REVIEW', { size: 9, bold: true, color: BLUE }); pdf.y -= 18;
  pdf.paragraph(String(a.record.name ?? rep.title).replace('Mission report - ', ''), { size: 20, bold: true, color: [0.05, 0.1, 0.25], gap: 2 });
  pdf.paragraph(`Vehicle: ${rep.vehicle.name}   |   Mission: ${rep.mission.name}   |   Body: ${rep.mission.environment}`, { size: 8.5, color: GREY });
  pdf.paragraph('This review answers one question: how far can the result of this simulated flight be trusted, and what would have to be shown before relying on it? It is generated from the recorded run and the project; nothing in it is typed by hand.', { size: 9, color: GREY, gap: 6 });
  const bad = a.open.length;
  pdf.rect(pdf.margin, pdf.y - 40, pdf.contentWidth, 38, { fill: ok && !bad ? [0.85, 0.97, 0.9] : ok ? [0.99, 0.95, 0.82] : [0.99, 0.88, 0.88] });
  pdf.text(pdf.margin + 8, pdf.y - 14, `FLIGHT RESULT: ${v.status}`, { size: 12, bold: true, color: ok ? GREEN : RED });
  pdf.text(pdf.margin + 190, pdf.y - 14, String(v.reason).slice(0, 62), { size: 9 });
  pdf.text(pdf.margin + 8, pdf.y - 26, `Requirements met: ${a.reqPass} of ${a.reqs.length}`, { size: 9, bold: true, color: a.reqPass === a.reqs.length ? GREEN : RED });
  pdf.text(pdf.margin + 190, pdf.y - 26, a.mc ? `Success under dispersions: ${fnum(100 * a.mc.successRate, 0)} % (95 % interval ${fnum(100 * a.mc.ci95[0], 0)} to ${fnum(100 * a.mc.ci95[1], 0)} %, ${a.mc.valid} flights)` : 'Success under dispersions: not assessed', { size: 9, bold: true, color: a.mc ? (a.mc.successRate >= 0.99 ? GREEN : AMB) : AMB });
  pdf.text(pdf.margin + 8, pdf.y - 36, `Open items: ${bad}`, { size: 9, bold: true, color: bad ? AMB : GREEN });
  pdf.y -= 52;
  let n = 0; const H = (t) => { pdf.ensure(110); pdf.heading(`${++n}. ${t}`); };

  H('Open items');
  if (!a.open.length) pdf.paragraph('None. The flight succeeded, every requirement is met, a Monte Carlo run supports it and no unvalidated model is switched on.', { size: 9.5 });
  else for (const t of a.open) pdf.paragraph('- ' + t, { size: 9.5, indent: 6, gap: 1 });

  H('The flight in numbers');
  pdf.table(['Metric', 'Value', 'Metric', 'Value'], [
    ['Duration', `${fnum(m.endTime, 0)} s`, 'Max altitude', `${fnum(m.maxAlt / 1000, 1)} km`],
    ['Peak dynamic pressure', `${fnum(m.maxQ / 1000, 1)} kPa at T+${fnum(m.tMaxQ, 0)} s`, 'Peak acceleration', `${fnum(m.maxG, 2)} g`],
    ['Final orbit (peri x apo)', m.finalPeri != null && m.finalPeri > 0 ? `${fnum(m.finalPeri / 1000, 1)} x ${fnum(m.finalApo / 1000, 1)} km` : 'not in orbit', 'Liftoff thrust-to-weight', fnum(m.liftoffTWR, 2)],
    ['Delta-v delivered', `${fnum(m.dvIdeal, 0)} m/s`, 'Lost to gravity / drag / steering', `${fnum(m.dvGravity, 0)} / ${fnum(m.dvDrag, 0)} / ${fnum(m.dvSteering, 0)} m/s`],
  ], [0.24, 0.26, 0.26, 0.24]);

  H('Margins against the requirements');
  if (!a.reqs.length) pdf.paragraph('No requirements were defined for this project, so there are no margins to report. Add them in the Requirements screen.', { size: 9.5 });
  else pdf.table(['Requirement', 'Limit', 'Measured', 'Margin', 'Verdict'], a.reqs.map((r) => [r.label, r.req, r.valueText, r.marginText, r.verdict]), [0.28, 0.17, 0.3, 0.13, 0.12], { size: 8.5 });

  H('How far the model has been checked');
  pdf.paragraph('The simulator is compared with published numbers for real launchers: input masses and thrust within 5 %, flight results within 10 %. The table is the state when this version was built (documentation/VALIDATION.md has every row and source).', { size: 9, gap: 3 });
  pdf.table(['Vehicle', 'Rows within band', 'Flight ended as', 'Largest error among the rows'], a.validation.map((x) => [x.name, `${x.pass} of ${x.total}`, x.status, x.worst ? `${x.worst.err > 0 ? '+' : ''}${x.worst.err} %  ${x.worst.label}`.slice(0, 54) : '-']), [0.26, 0.15, 0.17, 0.42], { size: 8 });
  pdf.paragraph('Models switched on in this run, and what is known about each:', { size: 9.5, bold: true, gap: 2 });
  pdf.table(['Model', 'Checked?', 'What is known'], a.models.map((x) => [x.name, x.status === 'checked' ? 'Yes' : x.status === 'partly' ? 'Partly' : 'No', x.note]), [0.28, 0.1, 0.62], { size: 8 });

  H('Probability of success under dispersions');
  if (!a.mc) pdf.paragraph('No Monte Carlo result belongs to this vehicle. A single flight shows that success is possible, not how likely it is. Run the Monte Carlo screen with the uncertainties you believe in (masses, thrust, drag, weather) and export again.', { size: 9.5 });
  else {
    pdf.paragraph(a.mc.verdict, { size: 9.5, bold: true });
    pdf.paragraph(`${a.mc.valid} valid flights of ${a.mc.runs} (${a.mc.errors} could not be run), seed ${rep.mc.seed}. The interval is the 95 % Wilson interval; a result of "all succeeded" still allows a failure probability up to ${fnum(100 * (1 - a.mc.ci95[0]), 0)} %.`, { size: 9 });
    if (rep.mc.factors?.length) { pdf.paragraph('What was varied:', { size: 9.5, bold: true, gap: 1 }); for (const f of rep.mc.factors.slice(0, 12)) pdf.paragraph('- ' + f.text, { size: 8.5, indent: 6, gap: 0.5 }); }
    const codes = Object.entries(a.mc.failureCodes ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
    if (codes.length) { pdf.paragraph('Most common failure causes among the dispersed flights:', { size: 9.5, bold: true, gap: 1 }); for (const [c, k] of codes) pdf.paragraph(`- ${c.replace(/_/g, ' ').toLowerCase()}: ${k} flights`, { size: 8.5, indent: 6, gap: 0.5 }); }
    const sens = (a.mc.sensitivity ?? []).filter((s) => Number.isFinite(s.rSuccess ?? s.rMetric)).slice(0, 5);
    if (sens.length) pdf.table(['Uncertainty (1 sigma)', 'Correlation with success'], sens.map((s) => [`${s.factor} (${s.sigma})`, fnum(s.rSuccess ?? s.rMetric, 2)]), [0.6, 0.4], { size: 8.5 });
  }

  H('What the flight depended on');
  if (rep.failure?.summary || rep.failure?.headline) pdf.paragraph(String(rep.failure.summary ?? rep.failure.headline), { size: 9.5 });
  for (const f of (rep.findings ?? []).slice(0, 8)) pdf.paragraph('- ' + f.text, { size: 9, indent: 6, gap: 1 });
  if (!(rep.findings ?? []).length) pdf.paragraph('No findings were recorded for this run.', { size: 9.5 });

  H('Warnings during the flight');
  if (!(rep.warningsText ?? []).length) pdf.paragraph('None.', { size: 9.5 }); else for (const w of rep.warningsText) pdf.paragraph('- ' + w, { size: 9, indent: 6, gap: 1 });

  H('Assumptions and known limits');
  for (const s of (rep.assumptions ?? []).filter((x) => x?.title).slice(0, 6)) { pdf.paragraph(s.title, { size: 9.5, bold: true, gap: 1 }); if (s.inc?.length) pdf.paragraph('Included: ' + s.inc.join('; '), { size: 8.5, indent: 6, gap: 0.5 }); if (s.ign?.length) pdf.paragraph('Not modelled: ' + s.ign.join('; '), { size: 8.5, indent: 6, gap: 2 }); }
  pdf.paragraph('Always-true limits: the simulator is an engineering-level model, not a certified tool. Structural loads are screening checks, not finite-element results. A result here never replaces an analysis qualified for the real flight.', { size: 9, color: GREY });

  H('How to reproduce this exactly');
  const fp = a.fingerprint;
  pdf.paragraph(`ASTRA LAB version ${rep.meta.version}. Run ${rep.meta.runId}. ${rep.meta.engine}.`, { size: 9 });
  if (fp) pdf.paragraph(`Input fingerprint ${fp.inputs}. Result fingerprint ${fp.results}. In ASTRA LAB, open Replay and press "Re-run and verify": equal fingerprints mean the same inputs gave the same flight, bit for bit.`, { size: 9 });
  if (rep.mc) pdf.paragraph(`Monte Carlo seed ${rep.mc.seed}, ${rep.mc.runs} runs.`, { size: 9 });

  H('Sources');
  pdf.paragraph('Published figures and their web addresses are listed row by row in documentation/VALIDATION.md and on the Validation screen. Weather and atmosphere: US Standard Atmosphere 1976; AFGL tropical atmosphere (Anderson et al., AFGL-TR-86-0110) when the warm day is selected; a balloon sounding when loaded.', { size: 9 });
  return pdf.build();
}
