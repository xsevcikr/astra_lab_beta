// Unit presentation. The simulation is always SI; the UI converts for display only (metric default, imperial optional).
// All numbers go through src/core/numfmt.js (no scientific notation outside Advanced, no float noise, thousands commas).
import { normalizeLevel, atLeast } from '../../src/core/levels.js';
import { formatNumber, formatAltitude, formatSpeed, snap, NOISE, fixed } from '../../src/core/numfmt.js';
const IMP = {
  m: (x) => (Math.abs(x) >= 1609.344 ? [x / 1609.344, 'mi'] : [x * 3.28084, 'ft']),
  km: (x) => [x * 0.621371, 'mi'],
  'm/s': (x) => [x * 3.28084, 'ft/s'],
  kg: (x) => [x * 2.20462, 'lb'],
  N: (x) => [x * 0.224809, 'lbf'],
  kN: (x) => [x * 0.224809, 'klbf'],
  Pa: (x) => [x * 0.000145038, 'psi'],
  kPa: (x) => [x * 0.145038, 'psi'],
  K: (x) => [(x - 273.15) * 1.8 + 32, '°F'],
  'm/s2': (x) => [x * 3.28084, 'ft/s²'],
  'km/h': (x) => [x * 0.621371, 'mph'],
  'km/s': (x) => [x * 0.621371, 'mi/s'],
  t: (x) => [x * 2204.62, 'lb'],
  Ns: (x) => [x * 0.224809, 'lbf·s'],
  'kg/m3': (x) => [x * 0.062428, 'lb/ft³'],
  'm2': (x) => [x * 10.7639, 'ft²'],
};
export const state = { system: 'metric' };
export function setSystem(s) { state.system = s === 'imperial' ? 'imperial' : 'metric'; }
/** Convert an SI value in `unit` for display: returns {v, unit}. */
export function conv(x, unit) {
  if (!Number.isFinite(x)) return { v: NaN, unit };
  if (state.system === 'imperial' && IMP[unit]) { const [v, u] = IMP[unit](x); return { v, unit: u }; }
  if (unit === 'm/s2') return { v: x, unit: 'm/s²' };
  if (unit === 'm2') return { v: x, unit: 'm²' };
  return { v: x, unit };
}
/** Detail level of the page for the number formatter: 'beginner' | 'standard' | 'advanced'. Scientific notation (advanced) is allowed only at the Expert level. */
export function detailMode() { try { const m = document.body?.dataset?.mode; return m === 'beginner' ? 'beginner' : m === 'expert' ? 'advanced' : 'standard'; } catch { return 'standard'; } }
/** The current detail level: 'beginner' | 'student' | 'engineer' | 'expert'. */
export function level() { try { return normalizeLevel(document.body?.dataset?.mode); } catch { return 'beginner'; } }
export const atLeastLevel = (min) => atLeast(level(), min);
/** Is the display system imperial? */
export const isImperial = () => state.system === 'imperial';
export function show(x, unit, d = 1) {
  if (!Number.isFinite(x)) return '–';
  const x0 = snap(x, NOISE[unit] ?? 0);
  const c = conv(x0, unit);
  return `${formatNumber(c.v, { digits: d, mode: detailMode() })} ${c.unit}`.trim();
}
export const showKm = (m, d = 1) => show(state.system === 'imperial' ? m : snap(m, 1) / 1000, state.system === 'imperial' ? 'm' : 'km', d);
/** Height above the ground: "0 m" on the pad, "850 m", "12.4 km". */
export const showAlt = (m) => formatAltitude(m, { imperial: state.system === 'imperial', mode: detailMode() });
/** Speed as km/h (or mph); pass kmh=false in Advanced for m/s. */
export const showSpeed = (ms, kmh = true) => formatSpeed(ms, { imperial: state.system === 'imperial', kmh, mode: detailMode() });
export { formatNumber, fixed };
export const tempC = (K) => (state.system === 'imperial' ? show(K, 'K', 0) : `${(K - 273.15).toFixed(0)} °C`);
/** Linear display factor for editable design values: {f, unit} so that shown = SI * f. (Non-linear units such as K are left as they are.) */
export function editFactor(unit) {
  if (state.system !== 'imperial') return { f: 1, unit };
  switch (unit) {
    case 'kg': return { f: 2.20462, unit: 'lb' };
    case 'm': return { f: 3.28084, unit: 'ft' };
    case 'N': return { f: 0.224809, unit: 'lbf' };
    case 'm²': return { f: 10.7639, unit: 'ft²' };
    case 'm/s': return { f: 3.28084, unit: 'ft/s' };
    case 'Pa': return { f: 0.000145038, unit: 'psi' };
    default: return { f: 1, unit };
  }
}
