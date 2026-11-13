// Design-trade optimisers for launch vehicle staging.
//
//   optimalStaging ....... the classic optimum split of a delta-v budget between N stages (Lagrange multiplier solution:
//                          maximum payload fraction for given exhaust speeds and structural coefficients)
//   stagingTrade ......... sweeps the number of stages and the propellant family, optimally stages every combination and
//                          reports the Pareto set (gross mass, dry mass, number of stages)
//   stagesFromVehicle .... reads Isp, structural coefficient and delta-v per stage from a real ASTRA LAB vehicle
//   compareWithOptimum ... the vehicle's own split against the optimum split for the same total delta-v
//
// Assumptions (stated on the page): ideal rocket equation per stage, constant Isp per stage, structural coefficient
// eps = structure / (structure + propellant) constant with stage size. Losses (gravity, drag, steering) are part of the
// delta-v budget the user enters; they are not modelled here. Reference: Curtis, Orbital Mechanics for Engineering
// Students, section 11.6 (optimal staging).
import { G0 } from '../../physics/constants.js';
import { bisect, nelderMead, paretoFront } from './methods.js';
import { analyzeVehicle } from '../vehicles/analysis.js';

/**
 * Optimal staging. stages: [{isp [s], eps [-]}] in firing order (first stage first). dv [m/s], payload [kg].
 * Returns null fields and feasible:false if the delta-v is out of reach even with infinitely large stages.
 */
export function optimalStaging({ dv, payload = 1000, stages }) {
  const c = stages.map((s) => s.isp * G0), eps = stages.map((s) => s.eps);
  const dvMax = c.reduce((s, ci, i) => s + ci * Math.log(1 / eps[i]), 0);
  if (!(dv > 0) || dv >= dvMax * 0.999999) return { feasible: false, dv, dvMax, payload, stages: [], reason: `Even infinitely large stages give at most ${Math.round(dvMax)} m/s with these Isp and structure values.` };
  // n_i = (lambda c_i - 1) / (lambda c_i eps_i) and sum c_i ln n_i = dv; n_i > 1 needs lambda > 1 / (c_i (1 - eps_i)).
  const lamMin = Math.max(...c.map((ci, i) => 1 / (ci * (1 - eps[i])))) * (1 + 1e-12);
  const nOf = (lam) => c.map((ci, i) => (lam * ci - 1) / (lam * ci * eps[i]));
  const dvOf = (lam) => nOf(lam).reduce((s, n, i) => s + c[i] * Math.log(n), 0);
  let hi = lamMin * 2;
  while (dvOf(hi) < dv && hi < lamMin * 1e12) hi *= 2;
  const lam = bisect((l) => dvOf(l) - dv, lamMin, hi, { tol: 1e-15 });
  return { ...stackFromRatios({ ratios: nOf(lam), payload, stages }), dvMax, lambda: lam };
}

/** Stage masses for given mass ratios n_i = m0_i / mf_i (firing order), built from the payload downward. */
export function stackFromRatios({ ratios, payload, stages }) {
  const out = new Array(stages.length);
  let above = payload;
  for (let i = stages.length - 1; i >= 0; i--) {
    const n = ratios[i], e = stages[i].eps;
    if (!(n > 1) || n * e >= 1) return { feasible: false, payload, stages: [], reason: `Stage ${i + 1} cannot reach a mass ratio of ${n.toFixed(2)} with a structural coefficient of ${e}.` };
    const stageMass = (above * (n - 1)) / (1 - n * e);           // structure + propellant of this stage
    const structure = e * stageMass, propellant = stageMass - structure;
    const m0 = above + stageMass;
    out[i] = { index: i + 1, isp: stages[i].isp, eps: e, massRatio: n, dv: stages[i].isp * G0 * Math.log(n), propellant, structure, ignitionMass: m0, massAbove: above };
    above = m0;
  }
  const gross = above;
  const dv = out.reduce((s, x) => s + x.dv, 0);
  return { feasible: true, payload, gross, payloadFraction: payload / gross, dryMass: out.reduce((s, x) => s + x.structure, 0), propellant: out.reduce((s, x) => s + x.propellant, 0), dv, stages: out };
}

/** Same optimum found numerically (Nelder-Mead over the delta-v split): used by the tests to check the closed-form solution. */
export function numericStaging({ dv, payload = 1000, stages }) {
  const N = stages.length;
  if (N === 1) return stackFromRatios({ ratios: [Math.exp(dv / (stages[0].isp * G0))], payload, stages });
  const vars = Array.from({ length: N - 1 }, (_, i) => ({ id: `s${i}`, min: 0, max: 1 }));
  const split = (x) => { // x in [0,1]^(N-1) -> fractions summing to 1 (stick breaking)
    let rest = 1; const f = [];
    for (let i = 0; i < N - 1; i++) { f.push(rest * x[i]); rest -= rest * x[i]; }
    f.push(rest); return f;
  };
  const gross = (x) => {
    const r = stackFromRatios({ ratios: split(x).map((fi, i) => Math.exp((fi * dv) / (stages[i].isp * G0))), payload, stages });
    return r.feasible ? r.gross : 1e30;
  };
  const x0 = Array.from({ length: N - 1 }, (_, i) => 1 / (N - i));
  const best = nelderMead(gross, vars, x0, { maxEvaluations: 4000, tolX: 1e-10, step: 0.1 });
  return stackFromRatios({ ratios: split(best.x).map((fi, i) => Math.exp((fi * dv) / (stages[i].isp * G0))), payload, stages });
}

/** Typical vacuum-average Isp and structural coefficients per propellant family (first stage, upper stages). Illustrative, not a specific engine. */
export const PROPELLANT_FAMILIES = {
  kerolox: { label: 'Kerosene / LOX', first: { isp: 300, eps: 0.07 }, upper: { isp: 345, eps: 0.09 } },
  methalox: { label: 'Methane / LOX', first: { isp: 320, eps: 0.08 }, upper: { isp: 365, eps: 0.10 } },
  hydrolox: { label: 'Hydrogen / LOX', first: { isp: 400, eps: 0.12 }, upper: { isp: 455, eps: 0.13 } },
  'kerolox-hydrolox': { label: 'Kerosene / LOX first stage, hydrogen upper stages', first: { isp: 300, eps: 0.07 }, upper: { isp: 455, eps: 0.13 } },
  solid: { label: 'Solid motors', first: { isp: 265, eps: 0.11 }, upper: { isp: 290, eps: 0.12 } },
};
export const familyStages = (family, count) => {
  const F = PROPELLANT_FAMILIES[family];
  return Array.from({ length: count }, (_, i) => ({ ...(i === 0 ? F.first : F.upper) }));
};

/**
 * Sweep stage count x propellant family, optimally staging each combination for the same payload and delta-v.
 * Pareto objectives: gross mass (lower), dry mass (lower, a stand-in for hardware cost), number of stages (lower, complexity).
 */
export function stagingTrade({ dv, payload = 1000, counts = [1, 2, 3, 4], families = Object.keys(PROPELLANT_FAMILIES), custom = null } = {}) {
  const rows = [];
  for (const fam of families) for (const n of counts) {
    if (fam === 'kerolox-hydrolox' && n === 1) continue;
    const r = optimalStaging({ dv, payload, stages: familyStages(fam, n) });
    rows.push({ id: `${fam}-${n}`, family: fam, familyLabel: PROPELLANT_FAMILIES[fam].label, count: n, ...r });
  }
  if (custom) rows.push({ id: 'custom', family: 'custom', familyLabel: custom.label ?? 'Your stages', count: custom.stages.length, ...optimalStaging({ dv, payload, stages: custom.stages }) });
  const feasible = rows.filter((r) => r.feasible);
  const marked = paretoFront(feasible, [{ key: 'gross', better: 'lower' }, { key: 'dryMass', better: 'lower' }, { key: 'count', better: 'lower' }]);
  for (const m of marked) { const r = rows.find((x) => x.id === m.id); r.dominated = m.dominated; r.dominatedBy = m.dominatedBy.map((j) => marked[j].id); }
  rows.sort((a, b) => (a.feasible === b.feasible ? (a.gross ?? Infinity) - (b.gross ?? Infinity) : a.feasible ? -1 : 1));
  const best = feasible.length ? feasible.reduce((a, b) => (b.gross < a.gross ? b : a)) : null;
  return { dv, payload, rows, pareto: rows.filter((r) => r.feasible && !r.dominated).map((r) => r.id), best: best?.id ?? null,
    note: 'Each row is optimally staged (best delta-v split). Dry mass stands in for cost; fewer stages means fewer separations and engines to qualify.' };
}

/** Stage data of an ASTRA LAB vehicle: [{id, name, isp, eps, dv, propellant, structure}] in firing order, plus the payload. */
export function stagesFromVehicle(vehicle, { body = 'earth' } = {}) {
  const A = analyzeVehicle(vehicle, { body });
  const st = A.stages.filter((s) => s.propellant > 0 && s.ispVac > 0);
  if (!st.length) return null;
  const out = st.map((s) => {
    const idx = A.stages.indexOf(s);
    const next = A.stages[idx + 1];
    // structure that leaves with this stage: what is lost between this ignition and the next ignition, minus the propellant
    const structure = next ? Math.max(s.ignitionMass - s.propellant - next.ignitionMass, 1e-6) : Math.max(s.burnoutMass - A.payloadMass, 1e-6);
    return { id: s.id, name: s.name, isp: s.ispVac, eps: structure / (structure + s.propellant), dv: s.dvVac, propellant: s.propellant, structure, ignitionMass: s.ignitionMass };
  });
  return { stages: out, payload: Math.max(A.payloadMass, 1), gross: A.totalMass, dv: out.reduce((s, x) => s + x.dv, 0) };
}

/**
 * The vehicle's split against the optimum for the same total delta-v, Isp and structure: gross mass the optimum needs for the
 * same payload, and the payload the optimum could carry at the vehicle's own gross mass.
 */
export function compareWithOptimum(vehicle, opts = {}) {
  const V = stagesFromVehicle(vehicle, opts);
  if (!V || V.stages.length < 1) return null;
  const opt = optimalStaging({ dv: V.dv, payload: V.payload, stages: V.stages });
  if (!opt.feasible) return { vehicle: V, optimum: opt };
  // the optimum scales linearly with payload, so the payload at equal gross mass is payload * gross_vehicle / gross_optimum
  const payloadAtSameGross = V.payload * (V.gross / opt.gross);
  return { vehicle: V, optimum: opt, grossSaving: V.gross - opt.gross, payloadAtSameGross, payloadGain: payloadAtSameGross - V.payload,
    note: 'Same engines (Isp), same structural coefficients and the same total vacuum delta-v; only the split between stages changes.' };
}
