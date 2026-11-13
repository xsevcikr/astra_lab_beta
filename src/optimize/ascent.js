// Ascent trajectory optimiser: tunes the launch path (the "ascent" guidance law's pitch-over and flight-path schedule) of the
// user's own rocket by flying it in the full simulator, and keeps the path that reaches the target orbit with the most
// propellant left in the last stage. Left-over propellant is the margin: it can be traded for payload or kept as a reserve.
//
// Variables (all in mission.guidance.params):
//   kickAngle          pitch-over angle right after the vertical rise [deg]
//   schedule.hF        altitude where the flight path reaches its final angle [m]
//   schedule.n         shape exponent of the flight-path schedule (small = turns early, large = stays steep longer)
//   schedule.gammaEnd  final flight-path angle [deg]
// Constraints: the flight must reach the mission's orbit objective; optional caps on maximum dynamic pressure and on
// peak acceleration. Infeasible flights are ranked by how far they fell short (periapsis below the target), so the
// search can climb out of a failing region instead of seeing a flat wall.
//
// The search is a bounded Nelder-Mead simplex started from the mission's current settings, so the result is never worse
// than what the mission already flies. Every flight is kept in the history for auditing.
import { Simulation } from '../../physics/simulation.js';
import { getBody } from '../../physics/bodies.js';
import { G0 } from '../../physics/constants.js';
import { yieldToLoop } from '../core/runner.js';
import { analyzeVehicle } from '../vehicles/analysis.js';
import { nelderMeadAsync } from './methods.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export const ASCENT_VARIABLES = [
  { id: 'kickAngle', label: 'Pitch-over angle', unit: 'deg', min: 0.5, max: 10, get: (p) => p.kickAngle ?? 4, set: (p, v) => { p.kickAngle = v; } },
  { id: 'hF', label: 'Altitude where the turn ends', unit: 'km', scale: 1000, min: 40e3, max: 260e3, get: (p) => p.schedule?.hF ?? 150000, set: (p, v) => { p.schedule.hF = v; } },
  { id: 'n', label: 'Turn shape exponent', unit: '-', min: 0.2, max: 1.2, get: (p) => p.schedule?.n ?? 0.45, set: (p, v) => { p.schedule.n = v; } },
  { id: 'gammaEnd', label: 'Final flight-path angle', unit: 'deg', min: 0, max: 10, get: (p) => p.schedule?.gammaEnd ?? 2, set: (p, v) => { p.schedule.gammaEnd = v; } },
];

/** Can this mission be optimised? Returns null if yes, or a plain reason if not. */
export function ascentOptimisable(vehicle, mission) {
  if (!vehicle || vehicle.type !== 'rocket') return 'The ascent optimiser works on rockets. Build or load a rocket first.';
  if (!mission) return 'There is no mission yet.';
  if (mission.guidance?.mode !== 'ascent') return 'The mission does not use the "ascent" guidance law, so there is no launch path to tune.';
  if (mission.objective?.type !== 'orbit') return 'The mission goal is not an orbit. The optimiser needs an orbit target to aim for.';
  return null;
}

/** Writes the variable values x into a copy of the mission's guidance params. */
export function missionWith(mission, x, vars = ASCENT_VARIABLES) {
  const m = clone(mission);
  const p = m.guidance.params ??= {};
  p.schedule = { ...(p.schedule ?? { hF: 150000, n: 0.45 }) };
  vars.forEach((v, i) => v.set(p, x[i]));
  return m;
}

/** The last stage that fires: its group id, vacuum exhaust speed and burnout mass (with the payload still on). */
export function upperStageInfo(vehicle) {
  const A = analyzeVehicle(vehicle);
  const st = A.stages.filter((s) => s.thrustVac > 0 && s.propellant > 0);
  const last = st[st.length - 1];
  return last ? { group: last.id, ve: last.ispVac * G0, burnoutMass: last.burnoutMass, propellant: last.propellant } : null;
}

/** Propellant still in the last stage at the end of the flight (or when the payload left it). */
function upperStageLeft(sim, info) {
  if (!info) return Math.max(0, sim.result.summary.propellantLeft ?? 0);
  const rec = [...(sim.result.summary.stageReserves ?? [])].reverse().find((r) => r.group === info.group);
  if (rec) return Math.max(0, rec.left);
  try { return Math.max(0, sim.fv.groupPropellant(info.group).left); } catch { return 0; }
}

/** One flight: returns {feasible, propLeft, dvMargin, maxQ, maxG, apo, peri, status, reason, score}. Lower score is better. */
export async function flyAscent({ vehicle, mission, environment, settings, limits = {}, sliceMs = 15, maxWallMs = 60000, upperStage = null }) {
  const sim = new Simulation({ vehicle: clone(vehicle), mission, environment: environment ? clone(environment) : undefined, settings: { ...(settings ?? {}), accuracy: settings?.accuracy ?? 'standard' } });
  const t0 = Date.now();
  while (!sim.finished) {
    sim.run({ budgetMs: sliceMs });
    if (sim.finished) break;
    if (Date.now() - t0 > maxWallMs) { sim._finish(null, 'Wall-clock budget exhausted'); break; }
    await yieldToLoop();
  }
  const R = sim.result, S = R.summary, o = S.finalOrbit;
  const body = getBody(mission.objective.body ?? 'earth');
  const target = mission.objective.altitude;
  const tol = mission.objective.tolerance ?? 0.1;
  const reached = R.status === 'SUCCESS' && R.objective?.success;
  const violations = [];
  if (limits.maxQ && S.maxQ > limits.maxQ) violations.push(`max dynamic pressure ${(S.maxQ / 1000).toFixed(1)} kPa is above the ${(limits.maxQ / 1000).toFixed(1)} kPa cap`);
  if (limits.maxG && S.maxG > limits.maxG) violations.push(`peak acceleration ${S.maxG.toFixed(1)} g is above the ${limits.maxG.toFixed(1)} g cap`);
  const feasible = reached && !violations.length;
  const info = upperStage ?? upperStageInfo(vehicle);
  const propLeft = upperStageLeft(sim, info);
  const dvMargin = info ? info.ve * Math.log((info.burnoutMass + propLeft) / info.burnoutMass) : null;
  // score: feasible -> minus the propellant left; infeasible -> a large constant plus how far it fell short
  let score;
  if (feasible) score = -propLeft;
  else {
    const peri = o.primary === body.id && Number.isFinite(o.peri) ? o.peri : -body.radius;
    const apo = o.primary === body.id && Number.isFinite(o.apo) ? o.apo : -body.radius;
    const shortfall = Math.max(0, target * (1 - tol) - peri) + 0.3 * Math.max(0, Math.abs(apo - target) - target * tol);
    const over = (limits.maxQ ? Math.max(0, S.maxQ - limits.maxQ) / limits.maxQ : 0) + (limits.maxG ? Math.max(0, S.maxG - limits.maxG) / limits.maxG : 0);
    score = 1e7 + shortfall / 10 + over * 1e5 - propLeft * 1e-3;
  }
  return { feasible, reached, violations, propLeft, dvMargin, maxQ: S.maxQ, maxG: S.maxG, apo: o.apo, peri: o.peri, status: R.status, reason: reached && violations.length ? violations.join('; ') : R.reason, endTime: R.endTime, score };
}

/**
 * Optimise the ascent of `vehicle` on `mission`.
 * @param opts { environment, settings, limits:{maxQ [Pa], maxG}, maxFlights (default 30), variables (ids to tune, default all),
 *               loadMargin (default 1.1: max Q cap relative to the first flight when limits.maxQ is not given; 0 = no cap),
 *               robustChecks / robustStep (re-fly the best path nudged by +/- robustStep of each range),
 *               onProgress({flight, maxFlights, best, last}), shouldStop() }
 * @returns { baseline, best, bestX, improved, mission (optimised copy), params, history, explanation, variables }
 */
export async function optimiseAscent(vehicle, mission, { environment, settings, limits = {}, maxFlights = 30, variables = null, onProgress, shouldStop, maxWallMsPerFlight = 60000, robustChecks = 2, robustStep = 0.02, loadMargin = 1.1 } = {}) {
  const why = ascentOptimisable(vehicle, mission);
  if (why) throw new Error(why);
  const vars = variables ? ASCENT_VARIABLES.filter((v) => variables.includes(v.id)) : ASCENT_VARIABLES;
  const p0 = mission.guidance.params ?? {};
  const x0 = vars.map((v) => Math.max(v.min, Math.min(v.max, v.get(p0))));
  const history = [];
  let best = null;
  const upperStage = upperStageInfo(vehicle);
  limits = { ...limits };
  let autoCap = null;
  const fly = async (x) => {
    const r = await flyAscent({ vehicle, mission: missionWith(mission, x, vars), environment, settings, limits, maxWallMs: maxWallMsPerFlight, upperStage });
    // by default the optimised path may not load the structure much harder than the mission's own path: max Q is capped at
    // loadMargin x the first flight's max Q (a lofted path that saves propellant by flying into thicker air is not "better")
    if (!history.length && r.feasible && loadMargin && !limits.maxQ) { limits.maxQ = r.maxQ * loadMargin; autoCap = limits.maxQ; }
    const entry = { n: history.length + 1, x: Object.fromEntries(vars.map((v, i) => [v.id, x[i]])), ...r };
    history.push(entry);
    if (!best || entry.score < best.score) best = entry;
    onProgress?.({ flight: history.length, maxFlights, best, last: entry });
    return r.score;
  };
  const res = await nelderMeadAsync(fly, vars, x0, { maxEvaluations: maxFlights, step: 0.18, tolX: 0.004, shouldStop });
  const baseline = history[0];
  const bestX = vars.map((v) => best.x[v.id]);
  // robustness: an optimum right next to a cliff (a slightly different path crashes) is fragile. Fly the best path with every
  // variable nudged by +/- robustStep of its range and report whether those flights still reach orbit.
  let robustness = null;
  if (best.feasible && robustChecks > 0 && !shouldStop?.()) {
    const checks = [];
    for (const sgn of [1, -1].slice(0, robustChecks)) {
      const x = vars.map((v, i) => Math.max(v.min, Math.min(v.max, bestX[i] + sgn * robustStep * (v.max - v.min))));
      const r = await flyAscent({ vehicle, mission: missionWith(mission, x, vars), environment, settings, limits, maxWallMs: maxWallMsPerFlight, upperStage });
      checks.push({ sign: sgn, x: Object.fromEntries(vars.map((v, i) => [v.id, x[i]])), reached: r.reached, feasible: r.feasible, propLeft: r.propLeft, maxQ: r.maxQ, reason: r.reached ? null : r.reason });
      onProgress?.({ flight: history.length + checks.length, maxFlights, best, last: { ...r, robustness: true } });
    }
    // robust = the nudged paths still reach orbit (a nudged path may sit just above the max-Q cap: that is reported, not a failure)
    robustness = { step: robustStep, checks, robust: checks.every((c) => c.reached) };
  }
  // knife edge: offer a safer path halfway between the mission's own settings and the optimum (one more flight)
  let safer = null;
  if (robustness && !robustness.robust && baseline.feasible && !shouldStop?.()) {
    const x = vars.map((v, i) => 0.5 * (x0[i] + bestX[i]));
    const r = await flyAscent({ vehicle, mission: missionWith(mission, x, vars), environment, settings, limits, maxWallMs: maxWallMsPerFlight, upperStage });
    if (r.feasible && r.propLeft > baseline.propLeft) safer = { x: Object.fromEntries(vars.map((v, i) => [v.id, x[i]])), ...r, mission: missionWith(mission, x, vars) };
    robustness.checks.push({ sign: 0, halfway: true, x: Object.fromEntries(vars.map((v, i) => [v.id, x[i]])), reached: r.reached, feasible: r.feasible, propLeft: r.propLeft, maxQ: r.maxQ, reason: r.reached ? null : r.reason });
  }
  const optimised = missionWith(mission, bestX, vars);
  const improved = best !== baseline && (best.feasible && (!baseline.feasible || best.propLeft > baseline.propLeft + 0.05));
  return { baseline, best, bestX, improved, mission: optimised, params: optimised.guidance.params, history, variables: vars.map(({ id, label, unit, min, max, scale }) => ({ id, label, unit, min, max, scale })),
    flights: history.length + (robustness?.checks.length ?? 0), stopped: res.stopped, robustness, safer, limits, autoCap, explanation: explainAscent(baseline, best, vars, limits, robustness, autoCap, safer) };
}

function explainAscent(base, best, vars, limits, robustness, autoCap, safer) {
  const kg = (v) => `${v.toFixed(v < 10 ? 1 : 0)} kg`;
  const lines = [];
  if (!best.feasible) {
    lines.push(`None of the flights reached the target orbit${limits.maxQ || limits.maxG ? ' within the limits' : ''}. The closest one ended with: ${best.reason}.`);
    lines.push('The rocket probably needs more delta-v or thrust; a better launch path alone cannot fix it. Try Make it fly or the staging trade.');
    return lines.join(' ');
  }
  if (!base.feasible) lines.push(`The mission's own launch path did not reach orbit (${base.reason}). The optimiser found one that does, with ${kg(best.propLeft)} of propellant left.`);
  else if (best === base || best.propLeft <= base.propLeft + 0.05) lines.push(`The current launch path is already close to the best one found: ${kg(base.propLeft)} of propellant left.`);
  else lines.push(`The optimised launch path reaches the same orbit with ${kg(best.propLeft)} of propellant left instead of ${kg(base.propLeft)} (${kg(best.propLeft - base.propLeft)} more).`);
  if (best.dvMargin != null) lines.push(`That is a delta-v reserve of about ${best.dvMargin.toFixed(0)} m/s in the last stage.`);
  for (const v of vars) {
    const x = best.x[v.id], s = v.scale ?? 1;
    const atLo = x - v.min < (v.max - v.min) * 0.01, atHi = v.max - x < (v.max - v.min) * 0.01;
    if (atLo || atHi) lines.push(`${v.label} ended at its ${atLo ? 'lower' : 'upper'} limit (${(x / s).toFixed(2)} ${v.unit}); the true optimum may lie beyond the search range.`);
  }
  lines.push(`Max dynamic pressure ${(best.maxQ / 1000).toFixed(1)} kPa, peak acceleration ${best.maxG.toFixed(1)} g.`);
  if (autoCap) lines.push(`Max dynamic pressure was capped at ${(autoCap / 1000).toFixed(1)} kPa (10 % above the mission's own path) so the structure is not loaded harder.`);
  if (robustness) lines.push(robustness.robust
    ? `Robustness check passed: nudging every setting by ${(robustness.step * 100).toFixed(0)} % of its range still reaches orbit.${robustness.checks.some((c) => !c.feasible) ? ' One nudged path goes slightly over the max-Q cap, so the cap is the active limit.' : ''}`
    : `Warning: this path is on a knife edge. Nudging the settings by ${(robustness.step * 100).toFixed(0)} % of their range failed (${robustness.checks.find((c) => !c.reached).reason}). ${safer ? `A safer path halfway back toward the mission's own settings still gains ${kg(safer.propLeft - base.propLeft)} (${kg(safer.propLeft)} left); it is offered as the safer choice.` : 'Keep some margin: fly the mission\'s own path, or rerun with a lower max-Q cap.'}`);
  return lines.join(' ');
}
