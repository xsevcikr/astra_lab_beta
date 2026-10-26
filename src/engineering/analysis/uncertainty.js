// Engineering uncertainty specification and sampling.
// A parameter: { id, label, unit, nominal, min, max, sd, distribution: 'normal'|'uniform'|'triangular'|'lognormal'|'fixed' }
export function sampleParam(p, rng) {
  const d = p.distribution || (p.sd ? 'normal' : p.min !== undefined ? 'uniform' : 'fixed');
  let x;
  switch (d) {
    case 'normal': x = rng.normal(p.nominal, p.sd); break;
    case 'uniform': x = rng.uniform(p.min, p.max); break;
    case 'triangular': x = rng.triangular(p.min, p.nominal, p.max); break;
    case 'lognormal': x = p.nominal * Math.exp(rng.normal(0, p.sd)); break;
    case 'bernoulli': x = rng.bernoulli(p.p) ? 1 : 0; break;
    default: x = p.nominal;
  }
  // truncate to physical bounds when given (e.g. a mass cannot be negative)
  if (p.min !== undefined && d !== 'uniform') x = Math.max(p.min, x);
  if (p.max !== undefined && d !== 'uniform') x = Math.min(p.max, x);
  return x;
}
export function sampleAll(params, rng) { return Object.fromEntries(params.map((p) => [p.id, sampleParam(p, rng)])); }
export const nominalOf = (params) => Object.fromEntries(params.map((p) => [p.id, p.nominal]));
// 3-sigma or bound span used for one-at-a-time sensitivity
export function lowHigh(p) {
  if (p.distribution === 'uniform' || (p.sd === undefined && p.min !== undefined)) return [p.min, p.max];
  if (p.distribution === 'bernoulli') return [0, 1];
  if (p.distribution === 'lognormal') return [p.nominal * Math.exp(-2 * p.sd), p.nominal * Math.exp(2 * p.sd)];
  const lo = p.nominal - 2 * p.sd, hi = p.nominal + 2 * p.sd;
  return [p.min !== undefined ? Math.max(p.min, lo) : lo, p.max !== undefined ? Math.min(p.max, hi) : hi];
}
