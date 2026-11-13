// Optimisation methods shared by the trajectory and trade optimisers (src/optimize/*).
//
//   nelderMead / nelderMeadAsync .. bounded Nelder-Mead simplex search (derivative free, works on simulator outputs)
//   goldenSection ................. 1-D minimum of a unimodal function
//   bisect ........................ root of a monotone function
//   paretoFront ................... non-dominated set for several objectives
//
// The Nelder-Mead search is written once, as a generator that yields the points it wants evaluated, so the same
// algorithm drives fast analytic problems (synchronous) and slow simulated flights (asynchronous, yields to the UI).
// Variables are searched in a unit cube scaled to each variable's bounds, so a 3 deg kick angle and a 100 km
// altitude get the same step sizes. Points outside the bounds are clamped and charged a small penalty, so the
// simplex does not wander away from the feasible box.

/** @typedef {{id:string, label?:string, min:number, max:number, unit?:string}} Variable */

const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const toUnit = (vars, x) => vars.map((v, i) => (x[i] - v.min) / (v.max - v.min || 1));
export const fromUnit = (vars, u) => vars.map((v, i) => v.min + clamp01(u[i]) * (v.max - v.min));
const outside = (u) => u.reduce((s, ui) => s + Math.max(0, -ui) + Math.max(0, ui - 1), 0);

function* nmCore(vars, x0, { step = 0.15, maxEvaluations = 200, tolF = 1e-9, tolX = 1e-6 } = {}) {
  const n = vars.length;
  let evals = 0;
  const ask = function* (u) {
    evals++;
    const f = yield fromUnit(vars, u);
    const pen = outside(u);
    return { u: u.slice(), f: pen > 0 ? f + Math.abs(f || 1) * pen * 10 + pen : f };
  };
  const u0 = toUnit(vars, x0).map(clamp01);
  let S = [yield* ask(u0)];
  for (let i = 0; i < n; i++) {
    const u = u0.slice();
    u[i] = u[i] + step <= 1 ? u[i] + step : u[i] - step;   // step into the box
    S.push(yield* ask(u));
  }
  const α = 1, γ = 2, ρ = 0.5, σ = 0.5;
  while (evals < maxEvaluations) {
    S.sort((a, b) => a.f - b.f);
    const fSpread = Math.abs(S[n].f - S[0].f);
    const xSpread = Math.max(...S.slice(1).map((p) => Math.max(...p.u.map((ui, i) => Math.abs(ui - S[0].u[i])))));
    if (fSpread <= tolF * Math.max(1, Math.abs(S[0].f)) && xSpread <= tolX) break;
    if (xSpread <= tolX) break;
    const c = new Array(n).fill(0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) c[i] += S[j].u[i] / n;
    const w = S[n];
    const at = (k) => c.map((ci, i) => ci + k * (ci - w.u[i]));
    const r = yield* ask(at(α));
    if (r.f < S[0].f) {
      if (evals >= maxEvaluations) { S[n] = r; break; }
      const e = yield* ask(at(γ));
      S[n] = e.f < r.f ? e : r;
    } else if (r.f < S[n - 1].f) {
      S[n] = r;
    } else {
      if (evals >= maxEvaluations) break;
      const outsideC = r.f < w.f;
      const k = yield* ask(outsideC ? at(ρ) : at(-ρ));
      if (k.f < (outsideC ? r.f : w.f)) S[n] = k;
      else {
        for (let j = 1; j <= n && evals < maxEvaluations; j++) S[j] = yield* ask(S[j].u.map((ui, i) => S[0].u[i] + σ * (ui - S[0].u[i])));
      }
    }
  }
  S.sort((a, b) => a.f - b.f);
  return { x: fromUnit(vars, S[0].u), f: S[0].f, evaluations: evals };
}

/**
 * Bounded Nelder-Mead minimisation of f(x) (synchronous).
 * @param {(x:number[]) => number} f
 * @param {Variable[]} vars
 * @param {number[]} x0 start point (inside the bounds)
 * @returns {{x:number[], f:number, evaluations:number, history:{x:number[], f:number}[]}}
 */
export function nelderMead(f, vars, x0, opts = {}) {
  const history = [];
  const g = nmCore(vars, x0, opts);
  let r = g.next();
  while (!r.done) { const x = r.value; const fx = f(x); history.push({ x, f: fx }); r = g.next(fx); }
  return { ...r.value, history };
}

/** Same search for an expensive, asynchronous f (a simulated flight). shouldStop() ends it early with the best point so far. */
export async function nelderMeadAsync(f, vars, x0, { shouldStop, ...opts } = {}) {
  const history = [];
  const g = nmCore(vars, x0, opts);
  let r = g.next(), stopped = false;
  while (!r.done) {
    if (shouldStop?.()) { stopped = true; break; }
    const x = r.value; const fx = await f(x); history.push({ x, f: fx }); r = g.next(fx);
  }
  if (stopped || !r.value) {
    const best = history.reduce((a, b) => (b.f < a.f ? b : a), history[0] ?? { x: x0, f: Infinity });
    return { x: best.x, f: best.f, evaluations: history.length, history, stopped: true };
  }
  return { ...r.value, history, stopped: false };
}

/** Minimum of a unimodal f on [lo, hi] (golden-section search). */
export function goldenSection(f, lo, hi, { tol = 1e-9, maxIter = 200 } = {}) {
  const R = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - R * (b - a), d = a + R * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol * Math.max(1, Math.abs(a) + Math.abs(b)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - R * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + R * (b - a); fd = f(d); }
  }
  const x = 0.5 * (a + b);
  return { x, f: f(x) };
}

/** Root of f on [lo, hi] where f(lo) and f(hi) have opposite signs. Returns null if they do not. */
export function bisect(f, lo, hi, { tol = 1e-12, maxIter = 200 } = {}) {
  let flo = f(lo), fhi = f(hi);
  if (flo === 0) return lo; if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < maxIter; i++) {
    const m = 0.5 * (lo + hi), fm = f(m);
    if (fm === 0 || (hi - lo) / 2 < tol * Math.max(1, Math.abs(m))) return m;
    if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else { hi = m; fhi = fm; }
  }
  return 0.5 * (lo + hi);
}

/**
 * Non-dominated points. objectives: [{key, better:'lower'|'higher'}]. A point is dominated when another point is at
 * least as good in every objective and strictly better in one. Returns the input points annotated with
 * `dominated` (bool) and `dominatedBy` (index list); the front is points.filter(p => !p.dominated).
 */
export function paretoFront(points, objectives) {
  const val = (p, o) => (o.better === 'higher' ? -p[o.key] : p[o.key]);
  return points.map((p, i) => {
    const by = [];
    points.forEach((q, j) => {
      if (j === i) return;
      const geq = objectives.every((o) => val(q, o) <= val(p, o));
      const gt = objectives.some((o) => val(q, o) < val(p, o));
      if (geq && gt) by.push(j);
    });
    return { ...p, dominated: by.length > 0, dominatedBy: by };
  });
}
