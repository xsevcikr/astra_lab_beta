// Trade study: fly 2 to 4 design variants with the real simulator and compare payload, cost and risk side by side.
//
// DEFINITIONS (shown in the UI and in the PDF):
//  payload  = mass of the payload group of the design (kg), counted as delivered only when the flight reached its goal.
//  cost     = sum of  catalog cost x count  of every part that has a catalog cost (illustrative US$, NOT real prices).
//             Propellant, tanks and structure have no catalog cost and are not counted; the number of unpriced parts is shown.
//  risk     = one of two clearly defined numbers
//             "margin": the highest use of any limit seen in the flight (structure load, air pressure / rating, g / rating,
//                       temperature ratio). 100 % means a limit was reached; a flight that fails its goal counts as 100 %.
//             "monte-carlo": probability that the dispersed flight fails (Monte Carlo, seeded) with its 95 % Wilson interval.
//  dominated = another design that reached the goal is at least as good in payload, cost and risk and better in one of them.
import { runSimulation } from './runner.js';
import { runMetrics } from './run-analysis.js';
import { buildRunRecord } from './project.js';
import { runMonteCarlo, failureProbability, defaultFactors } from './montecarlo.js';
import { analyzeVehicle } from '../vehicles/analysis.js';
import { addComponent, removeComponent } from '../vehicles/vehicle.js';
import { addLauncherStage } from '../vehicles/builders.js';
import { makeEngineCluster, ALL_ENGINES } from '../../data/components.js';
import { launchMission } from '../missions/generator.js';
import { applyOps, stagePropellant } from './failure-analysis.js';
import { designLimits } from './requirements.js';
import { stageOrder } from '../vehicles/analysis.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const fin = (v) => Number.isFinite(v);

export const TRADE_DEFINITIONS = {
  payload: 'Payload = mass of the payload group of the design; counted as delivered only when the flight reached its goal.',
  cost: 'Cost = catalog cost x count of every part that has one (illustrative US$, not real prices). Propellant, tanks and structure have no catalog cost and are not counted.',
  riskMargin: 'Risk (margin) = highest use of any limit seen in the flight: structure load, air pressure against its rating, g-load against its rating (a temperature limit counts only once it is reached). 100 % means a limit was reached. A flight that fails its goal counts as 100 %.',
  riskMc: 'Risk (Monte Carlo) = share of dispersed flights that fail (engine thrust, Isp, propellant and mass vary randomly; seeded), with the 95 % Wilson interval.',
  dominated: 'Dominated = another design that reached the goal is at least as good in payload, cost and risk, and better in at least one.',
};

/** Hardware cost of a vehicle from catalog costs. */
export function designCost(vehicle) {
  let total = 0, priced = 0, unpriced = 0; const lines = [];
  for (const c of vehicle.components ?? []) {
    if (fin(c.cost) && c.cost > 0) { const n = c.count ?? 1; total += c.cost * n; priced++; lines.push({ id: c.id, name: c.name, cost: c.cost * n }); } else unpriced++;
  }
  return { total, priced, unpriced, lines: lines.sort((a, b) => b.cost - a.cost) };
}
export function designPayloadMass(vehicle) {
  try { const p = analyzeVehicle(vehicle, { body: vehicle.meta?.body ?? 'earth' }).payloadMass; if (p > 0) return p; } catch { /* fall back */ }
  return (vehicle.components ?? []).filter((c) => c.group === 'payload').reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0);
}
/** Pitch programmes tried when a design does not reach its goal with the mission's own programme (same list the RUN tool uses to tune). */
export const TUNE_SCHEDULES = [{ hF: 100e3, n: 0.45 }, { hF: 100e3, n: 0.65 }, { hF: 140e3, n: 0.3 }, { hF: 180e3, n: 0.3 }, { hF: 120e3, n: 0.5 }, { hF: 90e3, n: 0.55 }, { hF: 140e3, n: 0.4 }, { hF: 80e3, n: 0.7 }];
async function flyTuned(inp, { tune, shouldStop, onTry }) {
  let sim = await runSimulation(inp, { shouldStop, maxWallMs: 120000 });
  let tuned = null, tries = 0;
  if (tune && sim.result.status !== 'SUCCESS' && inp.mission.guidance?.mode === 'ascent' && inp.mission.objective?.type === 'orbit') {
    let best = sim, bestErr = orbitErr(sim, inp.mission);
    for (const schedule of TUNE_SCHEDULES) {
      if (shouldStop?.()) break;
      const m2 = clone(inp.mission); m2.guidance.params.schedule = schedule; tries++; onTry?.(tries);
      const s2 = await runSimulation({ ...inp, mission: m2 }, { shouldStop, maxWallMs: 120000 });
      const e2 = orbitErr(s2, m2);
      if (s2.result.status === 'SUCCESS' || e2 < bestErr) { best = s2; bestErr = e2; tuned = schedule; inp = { ...inp, mission: m2 }; }
      if (s2.result.status === 'SUCCESS') break;
    }
    sim = best;
  }
  return { sim, tuned, tries };
}
const orbitErr = (sim, mission) => { const fo = sim.result?.summary?.finalOrbit, t = mission.objective?.altitude ?? 0; return fo && Number.isFinite(fo.peri) ? Math.abs(fo.peri - t) + Math.abs(fo.apo - t) : Infinity; };

/** Highest use of any limit during the flight (fraction; >= 1 means a limit was reached). */
export function marginRisk(record, metrics) {
  const lim = designLimits(record.vehicle);
  const parts = [];
  if (fin(metrics.maxStructRatio)) parts.push(['structure load', metrics.maxStructRatio]);
  if (fin(metrics.maxQ) && lim.qLimit) parts.push(['air pressure', metrics.maxQ / lim.qLimit]);
  if (fin(metrics.maxG) && lim.gLimit) parts.push(['g-load', metrics.maxG / lim.gLimit]);
  if (fin(metrics.maxThermRatio) && metrics.maxThermRatio >= 1) parts.push(['temperature', metrics.maxThermRatio]);   // the ratio is of absolute temperatures (about 0.95 at rest), so it only counts once a limit is reached
  parts.sort((a, b) => b[1] - a[1]);
  const worst = parts[0] ?? ['none', 0];
  if (record.result?.status !== 'SUCCESS') return { value: 1, by: record.result?.reason ?? 'failed', parts };
  return { value: Math.min(1, worst[1]), by: worst[0], parts };
}

// ------------------------------------------------------------------------------------------------ variants
/** Mission for a vehicle whose stages differ from the base vehicle: regenerated with the same target and pitch programme. */
export function regenerateMission(vehicle, baseMission) {
  const o = baseMission.objective ?? {};
  const g = baseMission.guidance?.params ?? {};
  return launchMission(vehicle, { altitude: o.altitude, tolerance: o.tolerance, insertion: baseMission.meta?.insertion, kickAngle: g.kickAngle, guidance: g.schedule ? { schedule: g.schedule } : {}, name: baseMission.name });
}
const sameStages = (a, b) => JSON.stringify(stageOrder(a).map((s) => s.id)) === JSON.stringify(stageOrder(b).map((s) => s.id));

/**
 * Variants of a launch vehicle that can be generated (each uses the operations of the tool API; none is flown here).
 * @returns [{id, label, note, vehicle, mission?}]
 */
export function generateVariants(vehicle, mission) {
  const out = [];
  const stages = stageOrder(vehicle).filter((s) => (vehicle.stages ?? []).some((x) => x.id === s.id) && vehicle.components.some((c) => c.group === s.id && c.kind === 'engine'));
  if (!stages.length) return out;
  try {
    const v = clone(vehicle);
    applyOps(v, stages.map((s) => ({ op: 'stage-propellant', group: s.id, total: stagePropellant(vehicle, s.id) * 1.15 })));
    out.push({ id: 'more-fuel', label: '+15 % fuel', note: 'Every stage carries 15 % more propellant (tank mass follows).', vehicle: v });
  } catch { /* skip */ }
  try {
    const st = stages[0], cur = vehicle.components.find((c) => c.group === st.id && c.kind === 'engine');
    const props = [...cur.propellants].sort().join();
    const total = cur.thrustVac * (cur.count ?? 1);
    const cands = ALL_ENGINES.filter((e) => e.kind === 'engine' && !e.solid && !e.strapOn && [...e.propellants].sort().join() === props && e.catalogId !== cur.catalogId && e.ispVac >= cur.ispVac * 0.98 && e.ispSl >= cur.ispSl * 0.95);
    const pick = cands.map((e) => ({ e, n: Math.max(1, Math.round((total * 1.25) / e.thrustVac)) })).filter((x) => x.n <= 9).sort((a, b) => Math.abs(a.e.thrustVac * a.n - total * 1.25) - Math.abs(b.e.thrustVac * b.n - total * 1.25))[0];
    if (pick) {
      const v = clone(vehicle); const idx = v.components.findIndex((c) => c.id === cur.id);
      const ne = addComponent(v, makeEngineCluster(pick.e.catalogId, pick.n, st.id, { diameter: cur.diameter, name: `${pick.e.name}${pick.n > 1 ? ' ×' + pick.n : ''}` }), { index: idx });
      removeComponent(v, cur.id);
      void ne;
      out.push({ id: 'engine', label: `Engine: ${pick.n} x ${pick.e.name.replace(/ \(.*/, '')}`, note: `${stages[0].name} uses ${pick.n} x ${pick.e.name} instead of ${cur.name} (about 25 % more total thrust, same propellants).`, vehicle: v });
    }
  } catch { /* skip */ }
  try {
    if (vehicle.type === 'rocket' && stages.length >= 1) {
      const v = clone(vehicle); const last = stages[stages.length - 1]; const eng = vehicle.components.find((c) => c.group === last.id && c.kind === 'engine');
      const order = Math.max(...v.stages.map((s) => s.order)) + 1;
      if (eng?.catalogId) {
        addLauncherStage(v, { order, engine: eng.catalogId, engineCount: 1, propellantMass: Math.max(200, stagePropellant(vehicle, last.id) * 0.25), diameter: v.meta?.cfg?.D, name: 'Extra stage' });
        out.push({ id: 'extra-stage', label: 'Extra top stage', note: `A new top stage with the engine of ${last.name} and a quarter of its propellant. The mission is regenerated with the same target.`, vehicle: v, mission: regenerateMission(v, mission) });
      }
    }
  } catch { /* skip */ }
  try {
    const parts = vehicle.components.filter((c) => c.group === 'payload' && c.mass > 0);
    if (parts.length) { const v = clone(vehicle); for (const c of v.components) if (c.group === 'payload' && c.mass > 0) c.mass = Math.round(c.mass * 1.25 * 10) / 10; out.push({ id: 'payload-up', label: '+25 % payload mass', note: 'Every part of the payload group is 25 % heavier (propellant of the payload stays the same).', vehicle: v }); }
  } catch { /* skip */ }
  return out;
}

// ------------------------------------------------------------------------------------------------ running
/** Plain data of one flown candidate (no telemetry). */
export function summarizeCandidate(c, record, metrics, mc) {
  const cost = designCost(c.vehicle), risk = marginRisk(record, metrics);
  let an = null; try { an = analyzeVehicle(c.vehicle, { body: record.environment?.body ?? 'earth' }); } catch { /* none */ }
  const ok = record.result?.status === 'SUCCESS';
  const f = mc ? failureProbability(mc.analysis) : null;
  return {
    id: c.id, label: c.label, note: c.note, status: record.result?.status, reason: record.result?.reason, feasible: ok,
    payload: ok ? designPayloadMass(c.vehicle) : 0, designPayload: designPayloadMass(c.vehicle), cost: cost.total, unpriced: cost.unpriced, priced: cost.priced,
    riskMargin: risk.value, riskBy: risk.by, mc: f ? { ...f, runs: mc.rows.length, seed: mc.seed } : null,
    dvVac: an?.dvVacuum ?? null, liftoffMass: metrics.initialMass, liftoffTWR: metrics.liftoffTWR, maxQ: metrics.maxQ, maxG: metrics.maxG, finalPeri: metrics.finalPeri, finalApo: metrics.finalApo,
    propellantLeft: metrics.finalPropellant, endTime: metrics.endTime, failureCodes: metrics.failureCodes ?? [],
  };
}
/** Risk number used for ranking: Monte Carlo failure probability when available, otherwise the margin risk. */
export const riskOf = (e) => (e.mc ? e.mc.p : e.riskMargin);

export function markDominated(entries) {
  const good = entries.filter((e) => e.feasible);
  for (const e of entries) {
    e.dominated = false; e.dominatedBy = null;
    if (!e.feasible) continue;
    for (const o of good) {
      if (o === e) continue;
      const ge = o.payload >= e.payload && o.cost <= e.cost && riskOf(o) <= riskOf(e);
      const gt = o.payload > e.payload || o.cost < e.cost || riskOf(o) < riskOf(e);
      if (ge && gt) { e.dominated = true; e.dominatedBy = o.label; break; }
    }
  }
  return entries;
}

/**
 * @param candidates [{id,label,note?,vehicle,mission?}]  (2 to 4)
 * @param ctx {mission, environment, settings}
 * @param opts {mcRuns (0 = margin risk only), seed, onProgress({stage, index, total, label}), shouldStop}
 */
export async function runTrade(candidates, ctx, opts = {}) {
  const { mcRuns = 0, seed = 1, onProgress, shouldStop } = opts;
  if (candidates.length < 1 || candidates.length > 4) throw new Error('A trade study compares 1 to 4 designs.');
  const entries = []; const t0 = Date.now();
  for (let i = 0; i < candidates.length; i++) {
    if (shouldStop?.()) break;
    const c = candidates[i];
    let mission = c.mission ? clone(c.mission) : clone(ctx.mission);
    if (!c.mission && !sameStages(c.vehicle, ctx.baseVehicle ?? c.vehicle)) { try { mission = regenerateMission(c.vehicle, ctx.mission); c.regenerated = true; } catch { /* keep base mission */ } }
    const inp = { vehicle: clone(c.vehicle), mission, environment: clone(ctx.environment ?? {}), settings: clone(ctx.settings ?? {}) };
    onProgress?.({ stage: 'flight', index: i, total: candidates.length, label: c.label });
    let entry;
    try {
      const { sim, tuned, tries } = await flyTuned(inp, { tune: opts.tune !== false, shouldStop, onTry: (k) => onProgress?.({ stage: 'tune', index: i, total: candidates.length, label: c.label, tries: k }) });
      if (tuned) inp.mission.guidance.params.schedule = tuned;
      const rec = buildRunRecord(sim); const m = runMetrics(rec, sim.telemetry);
      let mc = null;
      if (mcRuns > 0 && !shouldStop?.()) {
        onProgress?.({ stage: 'montecarlo', index: i, total: candidates.length, label: c.label, runs: mcRuns });
        mc = await runMonteCarlo({ name: `Trade: ${c.label}`, runs: mcRuns, seed, factors: defaultFactors(c.vehicle) }, inp, { shouldStop, onProgress: (p) => onProgress?.({ stage: 'montecarlo', index: i, total: candidates.length, label: c.label, done: p.done, runs: mcRuns }) });
      }
      entry = summarizeCandidate({ ...c, vehicle: inp.vehicle }, rec, m, mc);
      entry.regenerated = !!c.regenerated; entry.tuned = tuned; entry.tuneFlights = tries;
    } catch (e) {
      entry = { id: c.id, label: c.label, note: c.note, status: 'ERROR', reason: e.message, feasible: false, payload: 0, designPayload: designPayloadMass(c.vehicle), cost: designCost(c.vehicle).total, riskMargin: 1, mc: null };
    }
    entries.push(entry);
  }
  markDominated(entries);
  return { schema: 'astra.trade/1', created: new Date().toISOString(), seed, mcRuns, entries, wallMs: Date.now() - t0, definitions: TRADE_DEFINITIONS };
}
