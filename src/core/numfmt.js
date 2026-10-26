// One number formatter for the whole app (HUD, replay, charts, telemetry, reports). Pure functions, no DOM.
// Rules: never "-0", never float noise (9.3e-10 m is 0 m), thousands get commas, and scientific notation (1.2e+9) appears only
// in Advanced mode, only for really tiny or really huge values. Beginner / Standard use plain words for huge numbers.
const GROUPS = [[1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion']];

/** Snap float noise to an exact 0 (and -0 to 0). eps is in the unit of x. */
export function snap(x, eps = 1e-6) { return Number.isFinite(x) && Math.abs(x) < eps ? 0 : x; }

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** Fixed decimals with thousands commas, no "-0". */
export function fixed(x, d = 1) {
  if (!Number.isFinite(x)) return '–';
  let s = Math.abs(x).toFixed(Math.max(0, d));
  const neg = x < 0 && Number(s) !== 0;
  const [i, f] = s.split('.');
  return `${neg ? '-' : ''}${group(i)}${f ? `.${f}` : ''}`;
}

/**
 * Human number. `digits` = decimals for small values; 100 and up gets at most 1, 1000 and up none.
 * mode: 'beginner' | 'standard' | 'advanced' (advanced may use scientific notation for tiny or huge values only).
 */
export function formatNumber(x, { digits = 1, mode = 'standard' } = {}) {
  if (!Number.isFinite(x)) return '–';
  const ax = Math.abs(x);
  if (ax === 0) return '0';
  if (mode === 'advanced' && (ax < 1e-4 || ax >= 1e12)) return x.toExponential(2).replace('e+', 'e');
  if (ax >= 1e9) { const [v, w] = GROUPS.find(([k]) => ax >= k) ?? GROUPS[2]; return `${fixed(x / v, ax / v < 10 ? 1 : 0)} ${w}`; }
  const d = ax >= 1000 ? 0 : ax >= 100 ? Math.min(digits, 1) : digits;
  const s = fixed(x, d);
  if (Number(s.replace(/,/g, '')) === 0) return ax < 0.001 || mode === 'advanced' ? '0' : fixed(x, Math.max(d, 3));
  return s;
}

/** Tiny amounts that are only floating point noise, per unit of the SI value (a millimetre, a mm/s ...). */
export const NOISE = { m: 1e-3, km: 1e-6, 'm/s': 1e-3, 'm/s2': 1e-3, kg: 1e-3, N: 1e-2, s: 1e-6, deg: 1e-6, g: 1e-3, Pa: 1e-6, K: 1e-6, '%': 1e-3 };

/** Height above the ground: "0 m", "850 m", "12.4 km", "200.1 km" (miles / feet when imperial). */
export function formatAltitude(m, { imperial = false, mode = 'standard' } = {}) {
  if (!Number.isFinite(m)) return '–';
  const v = snap(m, 0.01);
  if (imperial) { const mi = v / 1609.344; return Math.abs(mi) >= 2 ? `${fixed(mi, mi < 100 ? 1 : 0)} mi` : `${fixed(v * 3.28084, 0)} ft`; }
  const a = Math.abs(v);
  if (a < 1000) return `${fixed(v, a < 10 ? 1 : 0).replace(/\.0$/, '')} m`;
  const km = v / 1000; return `${formatNumber(km, { digits: a < 1e6 ? 1 : 0, mode })} km`;
}

/** Speed in m/s -> "0 km/h" (Beginner / Standard) or "0 m/s" (Advanced, or when kmh is false). */
export function formatSpeed(ms, { imperial = false, kmh = true, digits = 0, mode = 'standard' } = {}) {
  if (!Number.isFinite(ms)) return '–';
  const v = snap(ms, 0.005);
  if (imperial) return `${formatNumber(v * 2.23694, { digits, mode })} mph`;
  return kmh ? `${formatNumber(v * 3.6, { digits, mode })} km/h` : `${formatNumber(v, { digits, mode })} m/s`;
}

/** Copy of a telemetry column with float noise snapped to exact zeros (so chart legends never print 9.3e-13). */
export function cleanColumn(values, eps = 1e-6, scale = 1) {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) { const v = values[i]; out[i] = Number.isFinite(v) ? (Math.abs(v) < eps ? 0 : v * scale) : v; }
  return out;
}
