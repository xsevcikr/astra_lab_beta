// Design trade studies: evaluate several designs with the same physics, then compare on weighted, normalized
// criteria. The Pareto set is reported alongside the weighted ranking so weights cannot hide a dominated design.
import { performance, massBudget } from '../vehicle/model.js';
import { vehicleReliability } from '../reliability/reliability.js';
import { costEstimate } from './cost.js';

export const DEFAULT_CRITERIA = [
  { id: 'gross', label: 'Gross mass', unit: 'kg', better: 'lower', weight: 1 },
  { id: 'totalDv', label: 'Ideal delta-v', unit: 'm/s', better: 'higher', weight: 1 },
  { id: 'payload', label: 'Payload', unit: 'kg', better: 'higher', weight: 1 },
  { id: 'reliability', label: 'Mission reliability', unit: '-', better: 'higher', weight: 1.5 },
  { id: 'cost', label: 'Unit cost estimate', unit: '$M', better: 'lower', weight: 1 },
  { id: 'complexity', label: 'Complexity (engines + stages)', unit: '-', better: 'lower', weight: 0.5 },
  { id: 'successProbability', label: 'Simulated success probability', unit: '-', better: 'higher', weight: 2 },
];

// evaluate(vehicle) optional: run a simulation / Monte Carlo and return { successProbability, metrics }
export function evaluateDesign(vehicle, { evaluate, missionHours = 100 } = {}) {
  const perf = performance(vehicle), mb = massBudget(vehicle), rel = vehicleReliability(vehicle, { missionHours }), cost = costEstimate(vehicle);
  const engines = vehicle.stages.reduce((a, s) => a + s.engines.reduce((b, e) => b + (e.count ?? 1), 0), 0);
  const sim = evaluate ? evaluate(vehicle) : null;
  return { id: vehicle.id, name: `${vehicle.name} v${vehicle.version}`, gross: mb.gross, totalDv: perf.totalDv, payload: vehicle.payload.mass, liftoffTwr: perf.liftoffTwr, maxAccelG: perf.maxAccelG,
    reliability: rel.missionReliability, singlePointFailures: rel.singlePointFailures.length, cost: cost.unit, complexity: engines + vehicle.stages.length,
    successProbability: sim?.successProbability ?? null, sim };
}

export function tradeStudy(designs, { criteria = DEFAULT_CRITERIA, evaluate, missionHours } = {}) {
  const rows = designs.map((v) => evaluateDesign(v, { evaluate, missionHours }));
  const active = criteria.filter((c) => rows.every((r) => r[c.id] !== null && r[c.id] !== undefined));
  for (const r of rows) {
    r.scores = {};
    let sum = 0, wsum = 0;
    for (const c of active) {
      const vals = rows.map((x) => x[c.id]), lo = Math.min(...vals), hi = Math.max(...vals);
      const s = hi === lo ? 1 : c.better === 'higher' ? (r[c.id] - lo) / (hi - lo) : (hi - r[c.id]) / (hi - lo);
      r.scores[c.id] = s; sum += s * c.weight; wsum += c.weight;
    }
    r.weightedScore = wsum ? sum / wsum : 0;
  }
  // Pareto: no other design is at least as good on every criterion and better on one
  for (const r of rows) r.dominatedBy = rows.filter((o) => o !== r && active.every((c) => (c.better === 'higher' ? o[c.id] >= r[c.id] : o[c.id] <= r[c.id])) && active.some((c) => (c.better === 'higher' ? o[c.id] > r[c.id] : o[c.id] < r[c.id]))).map((o) => o.name);
  rows.sort((a, b) => b.weightedScore - a.weightedScore);
  return { criteria: active, rows, pareto: rows.filter((r) => !r.dominatedBy.length).map((r) => r.name), note: 'Weighted score depends on the chosen weights; check the Pareto set and the raw values.' };
}
