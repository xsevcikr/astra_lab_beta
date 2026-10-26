// Experiment mode optimizer. Generates candidate designs, simulates each one, rejects designs that fail the
// physics or the constraints, and refines the best with a Nelder-Mead search. Every candidate and the reason
// it was rejected are kept so the result can be explained and audited.
import { makeRng } from '../core/rng.js';

// problem: { variables: [{id, label, min, max}], build(x) -> design, evaluate(design) -> { feasible, objective, metrics, reason } }
export function optimize(problem, { seed = 3, initial = 24, iterations = 60, minimize = true } = {}) {
  const rng = makeRng(seed);
  const log = [];
  const sign = minimize ? 1 : -1;
  const V = problem.variables;
  const clamp = (x) => x.map((v, i) => Math.max(V[i].min, Math.min(V[i].max, v)));
  const evalX = (x, stage) => {
    x = clamp(x);
    const design = problem.build(Object.fromEntries(V.map((v, i) => [v.id, x[i]])));
    const r = problem.evaluate(design);
    const entry = { n: log.length + 1, stage, x: Object.fromEntries(V.map((v, i) => [v.id, x[i]])), feasible: r.feasible, objective: r.objective, metrics: r.metrics, reason: r.reason || null };
    log.push(entry);
    return { x, f: r.feasible ? sign * r.objective : 1e15 + (r.violation ?? 1) * 1e9, entry };
  };
  // 1) candidate generation: Latin-hypercube-like stratified sampling
  let pts = [];
  for (let i = 0; i < initial; i++) pts.push(evalX(V.map((v) => v.min + (v.max - v.min) * ((i + rng.next()) / initial + rng.next() * 0) % 1), 'candidate'));
  pts = pts.map((p, i) => (i % 2 ? p : evalX(V.map((v) => rng.uniform(v.min, v.max)), 'candidate')));
  pts.sort((a, b) => a.f - b.f);
  // 2) Nelder-Mead around the best feasible candidates
  const n = V.length;
  let simplex = pts.slice(0, n + 1);
  for (let it = 0; it < iterations; it++) {
    simplex.sort((a, b) => a.f - b.f);
    const c = simplex.slice(0, n).reduce((acc, p) => acc.map((v, i) => v + p.x[i] / n), new Array(n).fill(0));
    const w = simplex[n];
    const refl = evalX(c.map((v, i) => v + (v - w.x[i])), 'refine');
    if (refl.f < simplex[0].f) { const exp = evalX(c.map((v, i) => v + 2 * (v - w.x[i])), 'refine'); simplex[n] = exp.f < refl.f ? exp : refl; }
    else if (refl.f < simplex[n - 1].f) simplex[n] = refl;
    else {
      const con = evalX(c.map((v, i) => v + 0.5 * (w.x[i] - v)), 'refine');
      if (con.f < w.f) simplex[n] = con;
      else simplex = simplex.map((p, j) => (j === 0 ? p : evalX(p.x.map((v, i) => simplex[0].x[i] + 0.5 * (v - simplex[0].x[i])), 'shrink')));
    }
    const spread = Math.max(...simplex.map((p) => Math.abs(p.f - simplex[0].f)));
    if (spread < 1e-6 * Math.max(1, Math.abs(simplex[0].f)) && it > 10) break;
  }
  simplex.sort((a, b) => a.f - b.f);
  const best = log.filter((e) => e.feasible).sort((a, b) => sign * (a.objective - b.objective))[0] || null;
  const rejected = log.filter((e) => !e.feasible);
  const reasons = {};
  for (const r of rejected) { const k = (r.reason || 'infeasible').split(';')[0].replace(/[-+]?\d+(\.\d+)?/g, '#'); reasons[k] = (reasons[k] || 0) + 1; }
  return { best, evaluated: log.length, feasible: log.length - rejected.length, rejectedReasons: reasons, log, explanation: best ? explain(problem, best, log) : 'No feasible design was found inside the variable bounds. Widen the bounds or relax the constraints.' };
}

function explain(problem, best, log) {
  const feas = log.filter((e) => e.feasible);
  const lines = [`Best of ${log.length} simulated candidates (${feas.length} feasible): ${problem.objectiveLabel || 'objective'} = ${best.objective.toFixed(1)}.`];
  for (const v of problem.variables) {
    const x = best.x[v.id];
    const atBound = Math.abs(x - v.min) < 1e-6 * Math.max(1, Math.abs(v.min)) + (v.max - v.min) * 0.01 ? 'lower bound' : Math.abs(x - v.max) < (v.max - v.min) * 0.01 ? 'upper bound' : null;
    lines.push(`${v.label}: ${x.toFixed(1)}${atBound ? ` (at its ${atBound}; the optimum may lie outside the search range)` : ''}.`);
  }
  // which constraint is active: the nearest infeasible neighbour tells what limits further improvement
  const near = log.filter((e) => !e.feasible).sort((a, b) => dist(a.x, best.x) - dist(b.x, best.x))[0];
  if (near) lines.push(`Pushing further fails because: ${near.reason}.`);
  return lines.join(' ');
}
const dist = (a, b) => Math.hypot(...Object.keys(a).map((k) => (a[k] - b[k]) / (Math.abs(b[k]) || 1)));
