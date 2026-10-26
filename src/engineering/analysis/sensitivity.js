// Sensitivity analysis. Tornado: one-at-a-time low/high excursions with common random numbers, ranked by swing.
// Global: rank correlation of Monte Carlo inputs with outcomes (captures interactions the tornado misses).
import { nominalOf, lowHigh } from './uncertainty.js';

export function tornado(model, metric, { seed = 777, successWeight = true } = {}) {
  const base = nominalOf(model.params);
  const evalAt = (x) => { const r = model.run(x, seed); return { value: r.metrics?.[metric], success: r.success }; };
  const nominal = evalAt(base);
  const rows = model.params.filter((p) => p.distribution !== 'fixed' && p.id !== 'terrainSeed').map((p) => {
    const [lo, hi] = lowHigh(p);
    const a = evalAt({ ...base, [p.id]: lo }), b = evalAt({ ...base, [p.id]: hi });
    return { id: p.id, label: p.label, unit: p.unit, low: lo, high: hi, valueLow: a.value, valueHigh: b.value, successLow: a.success, successHigh: b.success,
      swing: Math.abs((b.value ?? 0) - (a.value ?? 0)), flipsOutcome: successWeight && (a.success !== nominal.success || b.success !== nominal.success) };
  });
  rows.sort((x, y) => (y.flipsOutcome - x.flipsOutcome) || (y.swing - x.swing));
  return { metric, nominal: nominal.value, nominalSuccess: nominal.success, rows };
}

// Rank parameters by influence on mission success using Monte Carlo drivers (Spearman with the success flag).
export function successDrivers(mcResult) {
  return Object.entries(mcResult.drivers).map(([id, d]) => ({ id, label: mcResult.params.find((p) => p.id === id)?.label || id, correlation: d.success }))
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}
