// Credibility assessment (2.9): how far can the simulator be trusted, shown honestly.
//
// src/core/validation.js flies nine real rockets and compares the result with published numbers against a fixed +/-10 % band. A band says
// nothing about how well either side is known. This module adds ERROR BARS on both sides and asks the question a test engineer asks:
// "is the difference bigger than what the uncertainties can explain?"
//
//   * published side: every row gets a 1-sigma uncertainty and a ROLE from data/validation-uncertainty.js (prediction, calibrated, ...);
//   * simulator side: the same flight is flown again N times with the inputs dispersed (thrust, Isp, propellant, dry mass, air density);
//     the spread of each measured number is the simulator's 1-sigma error bar;
//   * verdict: d = simulated - published, sigma_c = sqrt(sigma_sim^2 + sigma_pub^2), z = d / sigma_c.
//       |z| <= 2  consistent   (the difference is inside the combined error bars)
//       |z| <= 3  tension
//       |z| >  3  inconsistent (the model has an error the listed uncertainties do not explain: a MODEL-FORM error)
//     The model-form error estimate is max(0, |d| - 2 sigma_c): what the model would have to be off by.
//
// Only rows with role 'prediction' count as validation evidence. Calibrated, target, plan, build and consistency rows are shown, but are
// never counted in the headline. A flight that fails is reported as a failure even when its rows look good.
//
// The credibility scores follow the eight factors of NASA-STD-7009A (Standard for Models and Simulations), SIMPLIFIED and SELF-ASSESSED:
// the levels are computed from the evidence in this file with the rules below. It is not an official NASA assessment.
import { Simulation } from '../../physics/simulation.js';
import { buildFlight, measure, compareRows, getValidationVehicle, VALIDATION_VEHICLES } from './validation.js';
import { makeRng, normal } from './montecarlo.js';
import { yieldToLoop } from './runner.js';
import { VEHICLE_ROWS, MISSION_ROWS, ROLES, SIM_DISPERSIONS } from '../../data/validation-uncertainty.js';

export { ROLES, SIM_DISPERSIONS, VEHICLE_ROWS, MISSION_ROWS };
export const Z_CONSISTENT = 2, Z_TENSION = 3;
const BINARY = new Set(['reachedOrbit']);

// ---- error-bar arithmetic ---------------------------------------------------------------------------------------------------------------

/** 1-sigma of a published value in the row's own unit, or null for binary rows. */
export function publishedSigma(row, u) {
  if (!u || BINARY.has(row.metric)) return null;
  if (u.abs != null) return u.abs;
  if (u.rel != null) return Math.abs(row.value) * u.rel;
  return null;
}

/** Verdict from a z-score. */
export function verdictOf(z) {
  if (z == null || Number.isNaN(z)) return 'missing';   // +/-Infinity (a difference with no error bar at all) is inconsistent
  const a = Math.abs(z);
  return a <= Z_CONSISTENT ? 'consistent' : a <= Z_TENSION ? 'tension' : 'inconsistent';
}

/**
 * Compare one simulated number (with its 1-sigma) with one published number (with its 1-sigma).
 * Returns {d, rel, sigmaC, z, verdict, modelForm, modelFormRel}.
 */
export function compareWithErrorBars(sim, sigmaSim, pub, sigmaPub) {
  if (sim == null || !Number.isFinite(sim) || pub == null) return { d: null, rel: null, sigmaC: null, z: null, verdict: 'missing', modelForm: null, modelFormRel: null };
  const d = sim - pub;
  const sigmaC = Math.hypot(sigmaSim ?? 0, sigmaPub ?? 0);
  const z = sigmaC > 0 ? d / sigmaC : (d === 0 ? 0 : Infinity * Math.sign(d));
  const modelForm = Math.max(0, Math.abs(d) - Z_CONSISTENT * sigmaC);
  return { d, rel: pub !== 0 ? d / pub : null, sigmaC, z, verdict: verdictOf(z), modelForm, modelFormRel: pub !== 0 ? modelForm / Math.abs(pub) : null };
}

/** Binary outcome (1 = it happened) against a success probability p measured in n dispersed runs. */
export function binaryVerdict(p, n) {
  if (p == null || !n) return 'missing';
  return p >= 0.8 ? 'consistent' : p > 0.2 ? 'tension' : 'inconsistent';
}

/** Wilson score interval (95 %) for k successes in n trials. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function meanStd(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return { mean: null, std: null, n: 0 };
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const std = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { mean, std, n: v.length };
}

// ---- dispersed flights --------------------------------------------------------------------------------------------------------------------

/**
 * Apply one random draw of SIM_DISPERSIONS to a freshly built validation flight (mutates vehicle and mission). Engines and stages draw
 * independently; both tanks of a stage share one propellant draw so the mixture ratio is kept. Payload mass is not dispersed.
 */
export function disperse(vehicle, mission, rng) {
  const sig = Object.fromEntries(SIM_DISPERSIONS.map((d) => [d.id, d.sigma]));
  const draws = {};
  const groupDraw = (key) => (draws[key] ??= normal(rng));
  for (const c of vehicle.components) {
    if (c.kind === 'payload') continue;
    if (c.kind === 'engine') {
      const ft = 1 + sig.thrust * normal(rng), fi = 1 + sig.isp * normal(rng);
      for (const k of ['thrustVac', 'thrustSl', 'thrustSL']) if (typeof c[k] === 'number') c[k] *= ft;
      for (const k of ['ispVac', 'ispSl']) if (typeof c[k] === 'number') c[k] *= fi;
    }
    if (typeof c.propellantMass === 'number' && c.propellantMass > 0) c.propellantMass *= 1 + sig.prop * groupDraw(`prop:${c.group}`);
    if (typeof c.mass === 'number' && c.mass > 1) c.mass *= 1 + sig.dry * normal(rng);
  }
  mission.environment = { ...(mission.environment ?? {}), densityScale: Math.max(0.5, 1 + sig.density * normal(rng)) };
  return { vehicle, mission };
}

/** Did the flight do what the real one did? Orbital: the mission ended in SUCCESS. Suborbital: it crossed 100 km (the mission goal). */
export function flightOutcome(V, sim, metrics) {
  if (V.flight?.suborbital) return { ok: (metrics.maxAlt ?? 0) >= 100e3, how: 'Crossed 100 km (the Karman line)', reason: `apogee ${Math.round((metrics.maxAlt ?? 0) / 1000)} km` };
  const ok = sim.result?.status === 'SUCCESS';
  const best = metrics.peakPeriapsis, target = V.flight?.altitude;
  const near = !ok && Number.isFinite(best) && target ? ` (best periapsis ${Math.round(best / 1000)} km of the ${Math.round(target / 1000)} km target${best >= 0.95 * target ? ': in orbit, but the mission did not end cleanly' : ''})` : '';
  return { ok, how: 'Mission ended in a clean orbit', reason: `${sim.result?.reason ?? ''}${near}` };
}

/** Fly one validation case, nominal (seed null) or dispersed. opts.async yields to the browser. */
export async function flyCase(id, seed = null, opts = {}) {
  const { V, vehicle, mission } = buildFlight(id, { maxTime: opts.maxTime });
  if (seed != null) disperse(vehicle, mission, makeRng(seed));
  const sim = new Simulation({ vehicle, mission });
  const t0 = Date.now(), wall = opts.maxWallMs ?? 120000;
  if (opts.async) {
    while (!sim.finished && Date.now() - t0 < wall) { sim.run({ budgetMs: 14 }); await yieldToLoop(); if (opts.shouldStop?.()) break; }
  } else sim.run({ budgetMs: wall });
  if (!sim.finished) sim._finish(null, 'Wall-clock budget exhausted');
  const metrics = measure(sim, vehicle, V);
  return { V, sim, metrics, outcome: flightOutcome(V, sim, metrics) };
}

/** Keep only what the assessment needs from a flight (the generated file and the page store this, not the telemetry). */
const slim = (f) => ({ metrics: f.metrics, ok: f.outcome.ok, status: f.sim.result?.status ?? null, reason: f.outcome.reason });

/**
 * Nominal flight plus n dispersed flights of one vehicle. opts: {n = 24, seed = 1, async, onProgress({i, n}), shouldStop}.
 * Returns {id, nominal, runs} with slim flights only.
 */
export async function dispersionStudy(id, opts = {}) {
  const n = opts.n ?? 24, seed = opts.seed ?? 1;
  const nominal = slim(await flyCase(id, null, opts));
  const runs = [];
  for (let i = 0; i < n; i++) {
    if (opts.shouldStop?.()) break;
    runs.push(slim(await flyCase(id, seed * 1000 + i + 1, opts)));
    opts.onProgress?.({ i: i + 1, n });
  }
  return { id, n: runs.length, seed, nominal, runs };
}

// ---- assessment of one vehicle / one mission ---------------------------------------------------------------------------------------------

function rowOut(r, u, sim, sigmaSim, extra = {}) {
  const sigmaPub = publishedSigma(r, u);
  const cmp = compareWithErrorBars(sim, sigmaSim, r.value, sigmaPub);
  const role = u?.role ?? 'unclassified';
  return { id: r.id, label: r.label, metric: r.metric, unit: r.unit, kind: r.kind, group: r.group, published: r.value, sigmaPub, sim, sigmaSim, ...cmp,
    band: r.tol, bandStatus: r.status, role, evidence: !!ROLES[role]?.evidence && r.kind === 'graded', basis: u?.basis ?? null, source: r.source, url: r.url, note: r.note ?? null, ...extra };
}

/** Rows with error bars for one vehicle, from a dispersion study. */
export function assessVehicle(study) {
  const V = getValidationVehicle(study.id);
  const table = VEHICLE_ROWS[V.id] ?? {};
  const nomRows = compareRows(V, study.nominal.metrics);
  const okRuns = study.runs.filter((r) => r.ok).length;
  const inOrbit = V.flight?.suborbital ? okRuns : study.runs.filter((r) => r.metrics.reachedOrbit === 1).length;   // got the low point above 95 % of the target
  const rows = nomRows.map((r) => {
    const u = table[r.id];
    if (BINARY.has(r.metric)) {
      const k = study.runs.filter((x) => x.metrics[r.metric] === 1).length, n = study.runs.length;
      const p = n ? k / n : null;
      return rowOut(r, u, r.sim, null, { binary: true, p, ci: wilson(k, n), verdict: r.sim == null ? 'missing' : binaryVerdict(p, n), z: null });
    }
    const ms = meanStd(study.runs.map((x) => x.metrics[r.metric]));
    return rowOut(r, u, r.sim, ms.n >= 3 ? ms.std : null, { simMean: ms.mean, nRuns: ms.n });
  });
  return {
    id: V.id, name: V.name, short: V.short, kind: 'vehicle',
    outcome: { ok: study.nominal.ok, reason: study.nominal.reason, status: study.nominal.status, how: V.flight?.suborbital ? 'Crossed 100 km (the Karman line)' : 'Mission ended in a clean orbit' },
    dispersed: { n: study.runs.length, ok: okRuns, rate: study.runs.length ? okRuns / study.runs.length : null, ci: wilson(okRuns, study.runs.length), inOrbit },
    fitted: !!V.flight?.pitch, suborbital: !!V.flight?.suborbital, pitchLabel: V.pitchLabel, rows,
  };
}

/** Rows with error bars for one real-mission case (src/core/mission-validation.js result). No dispersions: the simulator side has no error bar. */
export function assessMission(caseResult) {
  const C = caseResult.C, table = MISSION_ROWS[C.id] ?? {};
  const rows = caseResult.rows.map((r) => rowOut(r, table[r.id], r.sim, null));
  const bad = rows.filter((r) => r.kind === 'graded' && r.bandStatus === 'fail').length;
  return { id: C.id, name: C.name, kind: 'mission', outcome: { ok: bad === 0 && rows.every((r) => r.sim != null || r.kind === 'context'), reason: bad ? `${bad} row(s) outside the band` : '' }, dispersed: null, rows };
}

// ---- headline and credibility scores ---------------------------------------------------------------------------------------------------

const count = (rows, v) => rows.filter((r) => r.verdict === v).length;

/** The honest headline over all cases: predictions only, plus every failure. */
export function headline(cases) {
  const all = cases.flatMap((c) => c.rows.map((r) => ({ ...r, caseId: c.id, caseName: c.name })));
  const pred = all.filter((r) => r.evidence && r.verdict !== 'missing');
  const notEvidence = all.filter((r) => !r.evidence && r.kind === 'graded');
  const failures = [];
  for (const c of cases) {
    if (!c.outcome.ok) failures.push({ caseId: c.id, caseName: c.name, what: c.kind === 'vehicle' ? `The nominal flight FAILED: ${c.outcome.reason || c.outcome.status}` : c.outcome.reason, severity: 'failure' });
    if (c.dispersed && c.dispersed.n && c.dispersed.rate < 0.8) failures.push({ caseId: c.id, caseName: c.name, what: robustnessText(c), severity: 'robustness' });
  }
  for (const r of pred) {
    if (r.verdict !== 'inconsistent') continue;
    const what = r.binary ? `${r.label}: happens in only ${Math.round((r.p ?? 0) * 100)} % of the dispersed flights`
      : `${r.label}: off by ${fmtRel(r.rel)}, ${fmtZ(r.z)} outside the combined error bar${r.sigmaSim == null ? ' (this case has no simulator error bar)' : ''}`;
    failures.push({ caseId: r.caseId, caseName: r.caseName, what, severity: 'prediction' });
  }
  for (const r of all) if (r.evidence && r.verdict === 'missing') failures.push({ caseId: r.caseId, caseName: r.caseName, what: `${r.label}: not measured (the event never happened in the simulation)`, severity: 'prediction' });
  const roles = {};
  for (const r of all.filter((x) => x.kind === 'graded')) roles[r.role] = (roles[r.role] ?? 0) + 1;
  const bandPass = all.filter((r) => r.kind === 'graded' && r.bandStatus === 'pass').length, graded = all.filter((r) => r.kind === 'graded').length;
  return {
    predictions: { total: pred.length, consistent: count(pred, 'consistent'), tension: count(pred, 'tension'), inconsistent: count(pred, 'inconsistent') },
    notEvidence: notEvidence.length, roles, band: { pass: bandPass, total: graded },
    flights: { total: cases.filter((c) => c.kind === 'vehicle').length, ok: cases.filter((c) => c.kind === 'vehicle' && c.outcome.ok).length },
    medianModelForm: median(pred.map((r) => r.modelFormRel).filter((x) => x != null && Number.isFinite(x))),
    failures,
  };
}
/** Why the dispersed flights fail, in one sentence. */
export function robustnessText(c) {
  const D = c.dispersed, pc = (k) => `${Math.round((k / D.n) * 100)} %`;
  if (c.suborbital) return `Only ${pc(D.ok)} of ${D.n} dispersed flights cross 100 km: the throttle was tuned to reach 106 km, so a slightly weaker or heavier vehicle stays below the line`;
  const why = [];
  if (D.inOrbit > D.ok) why.push(`${pc(D.inOrbit)} get into orbit (low point above 95 % of the target), so ${D.inOrbit - D.ok > (D.n - D.ok) / 2 ? 'most' : 'some'} misses are the end-of-mission logic, not the rocket's performance`);
  if (c.fitted) why.push('the pitch table was fitted to the nominal vehicle only');
  why.push('it flies the published MAXIMUM payload, so there is no performance reserve (a real rocket\'s quoted maximum already keeps one)');
  return `Only ${pc(D.ok)} of ${D.n} dispersed flights end in a clean orbit: ${why.join('; ')}`;
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** |z| for people: '3.4 sigma', capped at 'more than 50 sigma'. */
export const fmtZ = (z) => (z == null || Number.isNaN(z) ? '–' : Math.abs(z) > 50 ? 'more than 50 sigma' : `${Math.abs(z).toFixed(1)} sigma`);
export const fmtRel = (e) => (e == null || !Number.isFinite(e) ? '–' : `${e >= 0 ? '+' : '−'}${Math.abs(e * 100).toFixed(1)} %`);

/** Level names of the simplified NASA-STD-7009A scale used here. */
export const LEVELS = ['0 · Insufficient evidence', '1 · Minimal', '2 · Some', '3 · Significant', '4 · Strong'];

/**
 * The eight NASA-STD-7009A credibility factors, scored 0 to 4 from the evidence. `evidence` = {tests, unitTests, analyticPass, analyticTotal, ci}.
 * Each factor returns {id, name, level, why, next}: `why` is the evidence, `next` what would raise the level.
 */
export function credibilityScores(cases, H, evidence = {}) {
  const vehicles = cases.filter((c) => c.kind === 'vehicle');
  const pr = H.predictions;
  const consFrac = pr.total ? pr.consistent / pr.total : 0;
  const caseWithPred = new Set(cases.flatMap((c) => c.rows.filter((r) => r.evidence && r.verdict !== 'missing').map(() => c.id))).size;
  const dispersedDone = vehicles.filter((c) => c.dispersed?.n >= 10).length;
  const meanRate = vehicles.length ? vehicles.reduce((s, c) => s + (c.dispersed?.rate ?? 0), 0) / vehicles.length : 0;
  const allRows = cases.flatMap((c) => c.rows);
  const withSigma = allRows.filter((r) => r.sigmaPub != null || r.binary).length;
  const estimatedInputs = evidence.estimatedInputs ?? null;
  const F = [];
  {
    const ap = evidence.analyticTotal ? evidence.analyticPass / evidence.analyticTotal : 0;
    const level = !evidence.unitTests ? 0 : evidence.unitTests >= 200 && ap === 1 ? 2 : 1;
    F.push({ id: 'verification', name: 'Verification', level, why: `${evidence.unitTests ?? 0} automated unit tests (${evidence.testFiles ?? 0} files); ${evidence.analyticPass ?? 0} of ${evidence.analyticTotal ?? 0} textbook orbit and J2 checks pass; J3/J4 gravity checked against the gradient of the potential.`, next: 'Level 3 needs a documented numerical-error study (step-size convergence of each flight) and a cross-check against an independent tool such as GMAT.' });
  }
  {
    const level = pr.total === 0 ? 0 : pr.total < 5 || caseWithPred < 3 ? 1 : consFrac >= 0.75 && H.flights.ok === H.flights.total ? 3 : 2;
    F.push({ id: 'validation', name: 'Validation', level, why: `${pr.total} independent predictions from ${caseWithPred} cases compared with flight data with error bars: ${pr.consistent} consistent, ${pr.tension} in tension, ${pr.inconsistent} inconsistent. ${H.flights.total - H.flights.ok} of ${H.flights.total} nominal rocket flights fail. ${H.notEvidence} other graded rows are calibration, targets, plan or build checks and are not counted.`, next: 'Level 3 needs most predictions inside their error bars, every nominal flight succeeding, and predictions that were not used to tune the model (no fitted pitch tables).' });
  }
  {
    const level = withSigma === allRows.length ? 2 : 1;
    F.push({ id: 'input', name: 'Input pedigree', level, why: `Every input and every compared number has a source link and an error bar (${withSigma} of ${allRows.length} rows). The sources are press kits, user guides and encyclopedic pages; several dry masses, fairing masses and Isp values are estimates${estimatedInputs != null ? ` (${estimatedInputs} listed)` : ''}.`, next: 'Level 3 needs manufacturer data (engine acceptance tests, mass reports) instead of encyclopedic values.' });
  }
  {
    const level = dispersedDone === 0 ? 0 : dispersedDone < vehicles.length ? 1 : 2;
    F.push({ id: 'uncertainty', name: 'Results uncertainty', level, why: `${dispersedDone} of ${vehicles.length} rockets flown ${vehicles[0]?.dispersed?.n ?? 0}+ times with ${SIM_DISPERSIONS.length} dispersed inputs (thrust, Isp, propellant, dry mass, air density). The model-form error is estimated from the misses (median ${H.medianModelForm == null ? '–' : `${(H.medianModelForm * 100).toFixed(1)} %`} of the published value).`, next: 'Level 3 needs dispersions of the aerodynamics, guidance and winds, and a model-form term carried into every prediction.' });
  }
  {
    const level = meanRate >= 0.9 ? 2 : meanRate >= 0.5 ? 1 : 0;
    const meanOrbit = vehicles.length ? vehicles.reduce((s, c) => s + (c.dispersed?.n ? c.dispersed.inOrbit / c.dispersed.n : 0), 0) / vehicles.length : 0;
    F.push({ id: 'robustness', name: 'Results robustness', level, why: `On average ${(meanRate * 100).toFixed(0)} % of dispersed flights still end in a clean orbit or reach their goal (${(meanOrbit * 100).toFixed(0)} % at least get into orbit). Fitted pitch tables and the end-of-mission logic fail when the vehicle is a little heavier or weaker than nominal, and every rocket flies its published maximum payload with no reserve.`, next: 'Level 2+ needs closed-loop guidance (Powered Explicit Guidance) instead of fitted pitch tables, so that small changes do not break the flight.' });
  }
  F.push({ id: 'history', name: 'Use history', level: 0, why: 'The simulator has not been used to make a real flight decision, and its predictions have not been checked against a flight that happened after them.', next: 'Predict a launch before it flies and compare afterwards.' });
  F.push({ id: 'management', name: 'M&S management', level: evidence.ci ? 2 : 1, why: `Version control on GitHub, changelogs for every release, ${evidence.ci ? 'automated tests on every change (GitHub Actions), ' : ''}generated validation results with dates.`, next: 'Level 3 needs configuration control of the input data and a written M&S plan.' });
  F.push({ id: 'people', name: 'People qualifications', level: 1, why: 'Built as a student project with AI help; the physics follows standard textbooks, but no independent expert review has been done.', next: 'An independent review by an aerospace engineer.' });
  const min = Math.min(...F.map((f) => f.level));
  return { factors: F, min, use: min <= 1
    ? 'Good for learning and for first concept studies (is a design roughly right?). NOT good enough for real flight decisions, mission design or safety analysis.'
    : 'Good for concept studies with stated margins. Not for flight decisions.' };
}

/** Full report from vehicle studies and mission results. */
export function buildReport({ studies = [], missions = [], evidence = {} }) {
  const cases = [...studies.map(assessVehicle), ...missions.map(assessMission)];
  const H = headline(cases);
  return { cases, headline: H, credibility: credibilityScores(cases, H, evidence) };
}

export const VEHICLE_IDS = VALIDATION_VEHICLES.map((v) => v.id);
