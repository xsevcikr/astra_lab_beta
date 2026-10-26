// Monte Carlo engine: every run draws its parameters from the uncertainty specs with its own seed, calls the
// physics model, and keeps the inputs next to the outputs so any run can be replayed exactly.
import { makeRng } from '../core/rng.js';
import { sampleAll } from './uncertainty.js';
import { describe, histogram, wilson, spearman } from './stats.js';

// model: { params: [...], run(values, seed) -> { success, metrics: {...}, failureMode } }
export function runMonteCarlo(model, { runs = 100, seed = 12345, onProgress, keepRuns = true } = {}) {
  const rng = makeRng(seed);
  const results = [];
  for (let i = 0; i < runs; i++) {
    const runSeed = Math.floor(rng.next() * 2 ** 31);
    const inputs = sampleAll(model.params, makeRng(runSeed));
    const out = model.run(inputs, runSeed);
    results.push({ i, seed: runSeed, inputs, ...out });
    onProgress?.(i + 1, runs);
  }
  return summarize(model, results, keepRuns);
}

// Async version for the UI: yields to the event loop between chunks so the window stays responsive.
export async function runMonteCarloAsync(model, { runs = 100, seed = 12345, chunk = 10, onProgress, signal } = {}) {
  const rng = makeRng(seed);
  const results = [];
  for (let i = 0; i < runs; i++) {
    if (signal?.aborted) break;
    const runSeed = Math.floor(rng.next() * 2 ** 31);
    const inputs = sampleAll(model.params, makeRng(runSeed));
    results.push({ i, seed: runSeed, inputs, ...model.run(inputs, runSeed) });
    if ((i + 1) % chunk === 0) { onProgress?.(i + 1, runs); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress?.(results.length, runs);
  return summarize(model, results, true);
}

export function summarize(model, results, keepRuns = true) {
  const n = results.length, succ = results.filter((r) => r.success).length;
  const metricNames = [...new Set(results.flatMap((r) => Object.keys(r.metrics || {})))];
  const metrics = {};
  for (const m of metricNames) {
    const vals = results.map((r) => r.metrics?.[m]).filter((x) => Number.isFinite(x));
    metrics[m] = { ...describe(vals), histogram: histogram(vals, 30) };
  }
  const failureModes = {};
  for (const r of results) if (!r.success) failureModes[r.failureMode || 'unspecified'] = (failureModes[r.failureMode || 'unspecified'] || 0) + 1;
  // which inputs drive success and each metric (Spearman rank correlation)
  const drivers = {};
  for (const p of model.params) {
    const x = results.map((r) => r.inputs[p.id]);
    drivers[p.id] = { success: spearman(x, results.map((r) => (r.success ? 1 : 0))) };
    for (const m of metricNames) { const pairs = results.filter((r) => Number.isFinite(r.metrics?.[m])); drivers[p.id][m] = spearman(pairs.map((r) => r.inputs[p.id]), pairs.map((r) => r.metrics[m])); }
  }
  return { runs: n, successes: succ, successProbability: wilson(succ, n), failureProbability: n ? 1 - succ / n : null, failureModes, metrics, drivers, params: model.params, results: keepRuns ? results : undefined };
}
