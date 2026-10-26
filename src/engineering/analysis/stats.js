// Descriptive statistics for analysis results.
export function describe(values) {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  return { n, mean, sd, min: v[0], max: v[n - 1], p01: q(0.01), p05: q(0.05), p50: q(0.5), p95: q(0.95), p99: q(0.99) };
}
export function histogram(values, bins = 30, range) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { edges: [], counts: [] };
  const lo = range?.[0] ?? Math.min(...v), hi = range?.[1] ?? Math.max(...v);
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w)))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts };
}
// Wilson score interval for a success probability.
export function wilson(successes, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null };
  const p = successes / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}
function ranks(a) { const idx = a.map((x, i) => [x, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => (r[i] = k)); return r; }
export function pearson(x, y) {
  const n = x.length; if (n < 3) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
export const spearman = (x, y) => pearson(ranks(x), ranks(y));
// 2-D dispersion ellipse (covariance, 3-sigma) for landing/orbit scatter
export function ellipse(xs, ys, k = 3) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) ** 2; b += (xs[i] - mx) * (ys[i] - my); c += (ys[i] - my) ** 2; }
  a /= n - 1; b /= n - 1; c /= n - 1;
  const tr = a + c, det = a * c - b * b, l1 = tr / 2 + Math.sqrt(tr * tr / 4 - det), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
  return { cx: mx, cy: my, rx: k * Math.sqrt(l1), ry: k * Math.sqrt(Math.max(0, l2)), angle: 0.5 * Math.atan2(2 * b, a - c) };
}
