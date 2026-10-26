// Monte Carlo dispersion analysis: fly the same design many times with randomly perturbed inputs (engine thrust, Isp,
// propellant loading, structural mass ...) and report the PROBABILITY of success with a confidence interval, the spread of
// the key results and which input the outcome depends on most. Every run is a complete, real simulation; the random draws come
// from a seeded generator, so the same seed always reproduces the same analysis.
import { runSimulation } from './runner.js';
import { applyParameter } from './experiments.js';
import { runMetrics } from './run-analysis.js';
import { buildRunRecord } from './project.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const tick = () => new Promise((r) => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));

/** mulberry32: small, fast, well distributed 32-bit generator. */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Standard normal by Box-Muller, truncated at ±limit sigma. */
export function normal(rng, limit = 3) {
  for (;;) {
    const u = Math.max(rng(), 1e-12), v = rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    if (Math.abs(z) <= limit) return z;
  }
}

/** Typical manufacturing / performance dispersions (1 sigma, relative) used when the user does not specify any. */
export function defaultFactors(vehicle) {
  const has = (k) => vehicle.components.some((c) => c.kind === k);
  const f = [];
  if (has('engine')) {
    f.push({ name: 'Engine thrust', sigma: 0.015, targets: [{ path: 'vehicle.kind[engine].thrustVac' }] });
    f.push({ name: 'Engine Isp', sigma: 0.01, targets: [{ path: 'vehicle.kind[engine].ispVac' }, { path: 'vehicle.kind[engine].ispSl' }] });
  }
  const tanks = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'].filter(has);
  if (tanks.length) f.push({ name: 'Propellant loaded', sigma: 0.005, targets: tanks.map((k) => ({ path: `vehicle.kind[${k}].propellantMass` })) });
  f.push({ name: 'Dry mass of all parts', sigma: 0.03, targets: [{ path: 'vehicle.kind[*].mass' }] });
  return f;
}

/**
 * Weather dispersions (2.1), opt-in. Air density is scaled by 1 + sigma x normal (5 % = a typical day-to-day change); the wind is a random
 * speed |normal| with this sigma in m/s from a random compass direction, with the jet-stream profile and gusts of physics/simulation.js.
 */
export function environmentFactors() {
  return [
    { name: 'Air density', sigma: 0.05, targets: [{ path: 'environment.densityScale', mode: 'set' }] },
    { name: 'Wind speed (random direction)', sigma: 12, unit: 'm/s', wind: true, targets: [{ path: 'environment.wind.speed', mode: 'set' }] },
  ];
}

/**
 * Linked (correlated) inputs (2.3). Real dispersions are not independent: a hot engine tends to have both more thrust and more Isp; a heavier
 * tank structure comes with more propellant volume. `pairs` = [{a, b, rho}] with factor names and a correlation rho in (-1, 1). The draws of
 * the linked factors are mixed with the Cholesky factor of the correlation matrix, so every factor keeps its own sigma and normal shape and
 * the pair correlation comes out as rho. Throws a plain-language Error when the pairs contradict each other (matrix not positive definite).
 */
export function correlationFactor(names, pairs) {
  const n = names.length, R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (const p of pairs ?? []) {
    const i = names.indexOf(p.a), j = names.indexOf(p.b);
    if (i < 0 || j < 0 || i === j) throw new Error(`Linked inputs: "${p.a}" and "${p.b}" must be two different inputs that are switched on.`);
    const rho = Number(p.rho);
    if (!Number.isFinite(rho) || Math.abs(rho) >= 1) throw new Error('Linked inputs: a correlation must be between -0.99 and +0.99.');
    R[i][j] = R[j][i] = rho;
  }
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let sum = R[i][j]; for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
    if (i === j) { if (sum <= 1e-9) throw new Error('Linked inputs contradict each other (for example A follows B, B follows C, but A opposes C). Lower one of the correlations.'); L[i][j] = Math.sqrt(sum); }
    else L[i][j] = sum / L[j][j];
  }
  return L;
}

// ---------------------------------------------------------------------------------------------- statistics
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
}
export function describe(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b); const n = v.length;
  if (!n) return null;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  return { n, mean, sd, min: v[0], p5: q(0.05), p50: q(0.5), p95: q(0.95), max: v[n - 1] };
}
export function pearson(x, y) {
  const n = Math.min(x.length, y.length); if (n < 3) return null;
  const mx = x.reduce((s, a) => s + a, 0) / n, my = y.reduce((s, a) => s + a, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

export const MC_MAX_RUNS = 500;
const METRICS = ['endTime', 'maxAlt', 'finalPeri', 'finalApo', 'maxQ', 'maxG', 'propellantUsed', 'finalMass', 'touchdownVertical', 'distanceDriven', 'periError', 'apoError', 'orbitError'];
export const MC_METRICS = METRICS;

/** Orbit errors against the mission's target altitude (m): signed periapsis / apoapsis error and the larger of the two magnitudes. */
export function orbitErrors(metrics, mission) {
  const tgt = mission?.objective?.type === 'orbit' ? mission.objective.altitude : null;
  if (!Number.isFinite(tgt) || !Number.isFinite(metrics?.finalPeri) || !Number.isFinite(metrics?.finalApo)) return {};
  const periError = metrics.finalPeri - tgt, apoError = metrics.finalApo - tgt;
  return { periError, apoError, orbitError: Math.max(Math.abs(periError), Math.abs(apoError)) };
}

/**
 * @param spec   {name?, runs (1..500), seed?, factors?: [{name, sigma, dist?:'normal'|'uniform', targets:[{path, mode?}]}], metric?}
 * @param inputs {vehicle, mission, environment?, settings?}
 */
export async function runMonteCarlo(spec, inputs, { onProgress, shouldStop, sliceMs = 10, maxWallMsPerRun = 120000 } = {}) {
  const runs = Math.max(1, Math.min(MC_MAX_RUNS, Math.floor(spec.runs ?? 30)));
  const factors = (spec.factors?.length ? spec.factors : defaultFactors(inputs.vehicle)).map((f) => ({ dist: 'normal', ...f }));
  const seed = spec.seed ?? 1;
  const rng = makeRng(seed);
  const pairs = (spec.correlations ?? []).filter((p) => p && p.a && p.b && Number(p.rho) !== 0);
  let link = null;   // indices of the linked factors and the Cholesky factor of their correlation matrix
  if (pairs.length) {
    const names = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
    const bad = names.find((nm) => { const f = factors.find((x) => x.name === nm); return !f || f.wind || f.dist !== 'normal'; });
    if (bad) throw new Error(`Linked inputs: "${bad}" is not a switched-on input with a normal spread.`);
    link = { idx: names.map((nm) => factors.findIndex((x) => x.name === nm)), L: correlationFactor(names, pairs) };
  }
  const rows = []; const t0 = Date.now();
  for (let i = 0; i < runs; i++) {
    if (shouldStop?.()) break;
    // draws first (so that stopping early never changes the values of the runs that were made)
    const windDir = {};   // weather: wind direction and gust phase are drawn with the other numbers
    const draw = factors.map((f) => {
      if (f.wind) { const v = Math.abs(f.sigma * normal(rng, f.limit ?? 3)); windDir[f.name] = { fromDeg: 360 * rng(), seed: 1 + Math.floor(rng() * 1e6) }; return v; }   // wind speed [m/s]: |normal|, any direction
      return f.dist === 'uniform' ? 1 + f.sigma * Math.sqrt(3) * (2 * rng() - 1) : 1 + f.sigma * normal(rng, f.limit ?? 3);
    });
    if (link) {   // mix the independent draws: z = L e, every factor keeps its own 1 sigma
      const e = link.idx.map((k) => (draw[k] - 1) / (factors[k].sigma || 1));
      link.idx.forEach((k, a) => { let z = 0; for (let b = 0; b <= a; b++) z += link.L[a][b] * e[b]; const lim = factors[k].limit ?? 3; draw[k] = 1 + factors[k].sigma * Math.max(-lim, Math.min(lim, z)); });
    }
    const inp = clone({ vehicle: inputs.vehicle, mission: inputs.mission, environment: inputs.environment ?? {}, settings: inputs.settings ?? {} });
    const row = { index: i, factors: Object.fromEntries(factors.map((f, k) => [f.name, draw[k]])), status: 'ERROR', reason: null };
    try {
      factors.forEach((f, k) => {
        if (f.wind) { inp.environment = { ...(inp.environment ?? {}) }; inp.environment.wind = { gustFraction: 0.25, ...(inp.environment.wind ?? {}), speed: draw[k], ...windDir[f.name] }; return; }
        for (const t of f.targets) applyParameter(inp, t.path, draw[k], t.mode ?? 'scale');
      });
      const sim = await runSimulation(inp, { sliceMs, shouldStop, maxWallMs: maxWallMsPerRun });
      const m = runMetrics(buildRunRecord(sim), sim.telemetry);
      row.status = sim.result.status; row.reason = sim.result.reason;
      Object.assign(m, orbitErrors(m, inputs.mission));
      row.metrics = Object.fromEntries(METRICS.map((k) => [k, m[k]]).filter(([, v]) => Number.isFinite(v)));
      row.failures = (sim.result.failures ?? []).map((x) => x.code);
    } catch (e) { row.reason = e.message; }
    rows.push(row);
    onProgress?.({ done: i + 1, total: runs, row });
    await tick();
  }
  return { schema: 'astra.montecarlo/1', name: spec.name ?? 'Monte Carlo', created: new Date().toISOString(), seed, requestedRuns: runs, targetAltitude: inputs.mission?.objective?.type === 'orbit' ? inputs.mission.objective.altitude : null, factors: factors.map(({ name, sigma, dist, targets, wind, unit }) => ({ name, sigma, dist, targets, wind, unit })), correlations: pairs.map(({ a, b, rho }) => ({ a, b, rho: Number(rho) })), rows, wallMs: Date.now() - t0, analysis: analyzeMonteCarlo(rows, factors, spec.metric) };
}

export function analyzeMonteCarlo(rows, factors, metric) {
  const valid = rows.filter((r) => r.status !== 'ERROR');
  const n = valid.length, k = valid.filter((r) => r.status === 'SUCCESS').length;
  const [lo, hi] = wilson(k, n);
  const stats = {};
  for (const m of METRICS) { const d = describe(valid.map((r) => r.metrics?.[m])); if (d) stats[m] = d; }
  const codes = {};
  for (const r of valid) for (const c of new Set(r.failures ?? [])) codes[c] = (codes[c] ?? 0) + 1;
  const main = metric ?? (stats.orbitError && stats.orbitError.sd > 0 ? 'orbitError' : stats.finalPeri && stats.finalPeri.sd > 0 ? 'finalPeri' : stats.touchdownVertical ? 'touchdownVertical' : 'maxAlt');
  const y = valid.map((r) => (r.status === 'SUCCESS' ? 1 : 0));
  const sens = factors.map((f) => {
    const x = valid.map((r) => r.factors[f.name]);
    return { factor: f.name, sigma: f.sigma, rSuccess: pearson(x, y), rMetric: pearson(x, valid.map((r) => r.metrics?.[main] ?? NaN).map((v) => (Number.isFinite(v) ? v : 0))) };
  }).sort((a, b) => Math.abs(b.rSuccess ?? b.rMetric ?? 0) - Math.abs(a.rSuccess ?? a.rMetric ?? 0));
  return {
    runs: rows.length, valid: n, errors: rows.length - n, success: k, failed: valid.filter((r) => r.status === 'FAILURE').length,
    successRate: n ? k / n : 0, ci95: [lo, hi], metric: main, stats, failureCodes: codes, sensitivity: sens,
    verdict: n === 0 ? 'No valid runs.' : k === n ? `All ${n} dispersed flights succeeded. With 95 % confidence the true success probability is at least ${(100 * lo).toFixed(0)} % (${n} runs).` : k === 0 ? `None of the ${n} dispersed flights succeeded (success probability below ${(100 * hi).toFixed(0)} % with 95 % confidence).` : `${k} of ${n} dispersed flights succeeded: success probability ${(100 * k / n).toFixed(0)} % (95 % interval ${(100 * lo).toFixed(0)} to ${(100 * hi).toFixed(0)} %).`,
  };
}

export function monteCarloToCSV(mc) {
  const fnames = mc.factors.map((f) => f.name);
  const q = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '');
  const lines = [[...fnames.map((f) => `factor: ${f}`), 'status', 'reason', ...METRICS, 'failure_codes'].map(q).join(',')];
  for (const r of mc.rows) lines.push([...fnames.map((f) => r.factors[f]), r.status, r.reason, ...METRICS.map((m) => r.metrics?.[m]), (r.failures ?? []).join('|')].map(q).join(','));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------- views of the result
/** Histogram of one metric over the runs; every bin counts successful and failed flights separately. */
export function histogramBins(rows, metric, bins) {
  const pts = rows.filter((r) => r.status !== 'ERROR' && Number.isFinite(r.metrics?.[metric]));
  if (!pts.length) return null;
  const vals = pts.map((r) => r.metrics[metric]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
  const nb = bins ?? Math.max(5, Math.min(20, Math.round(Math.sqrt(pts.length) * 1.6)));
  const ok = new Array(nb).fill(0), bad = new Array(nb).fill(0);
  for (const r of pts) { const b = Math.min(nb - 1, Math.floor(((r.metrics[metric] - lo) / (hi - lo)) * nb)); (r.status === 'SUCCESS' ? ok : bad)[b]++; }
  return { metric, lo, hi, bins: nb, ok, bad, n: pts.length };
}
/**
 * Tornado data: for each varied input, a straight line is fitted through (input draw, result) and the result is read off at -1 and +1
 * sigma of that input. The bar is the swing of the result caused by that input alone, so inputs are comparable in the units of the result.
 * Also returns the success probability of the runs with a low and a high draw of that input (split at the median draw).
 */
export function tornado(rows, factors, metric) {
  const valid = rows.filter((r) => r.status !== 'ERROR' && Number.isFinite(r.metrics?.[metric]));
  const ys = valid.map((r) => r.metrics[metric]);
  const my = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
  const out = factors.map((f) => {
    const xs = valid.map((r) => r.factors[f.name]);
    const n = xs.length; if (n < 3) return { factor: f.name, sigma: f.sigma, low: null, high: null, swing: 0, r: null };
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const sorted = [...xs].sort((a, b) => a - b), med = sorted[Math.floor(n / 2)];
    const lowRows = valid.filter((r) => r.factors[f.name] < med), highRows = valid.filter((r) => r.factors[f.name] >= med);
    const rate = (a) => (a.length ? a.filter((r) => r.status === 'SUCCESS').length / a.length : null);
    return { factor: f.name, sigma: f.sigma, low: my - slope * f.sigma, high: my + slope * f.sigma, swing: Math.abs(2 * slope * f.sigma), slope, r: pearson(xs, ys), pSuccessLow: rate(lowRows), pSuccessHigh: rate(highRows) };
  });
  return out.sort((a, b) => b.swing - a.swing);
}
/** Plain description of what was varied (used by the screen and the PDF). */
export function describeFactors(factors) {
  return factors.map((f) => f.wind ? { name: f.name, text: `${f.name}: every flight gets a wind of |normal| speed (1 sigma ${f.sigma} m/s) from a random direction, strongest at 12 km, with gusts`, targets: f.targets.map((t) => t.path) } : ({ name: f.name, text: `${f.name}: every flight multiplies it by 1 + ${(100 * f.sigma).toFixed(1)} % x a ${f.dist === 'uniform' ? 'uniform' : 'normal (cut at 3 sigma)'} random number`, targets: f.targets.map((t) => t.path) }));
}
/** Rough time for n flights, from a measured seconds-per-flight (or null when nothing was measured yet). */
export const estimateSeconds = (n, secPerRun) => (Number.isFinite(secPerRun) && secPerRun > 0 ? n * secPerRun : null);
export function formatDuration(sec) {
  if (!Number.isFinite(sec)) return 'unknown';
  if (sec < 90) return `about ${Math.max(1, Math.round(sec))} s`;
  return `about ${Math.round(sec / 60)} min`;
}
/** Failure probability with its 95 % Wilson interval, taken from analyzeMonteCarlo()'s output. */
export function failureProbability(analysis) {
  const n = analysis.valid, k = n - analysis.success;
  const [lo, hi] = wilson(k, n);
  return { p: n ? k / n : null, lo, hi, n };
}
