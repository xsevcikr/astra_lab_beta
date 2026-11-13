// JPL DE440 planetary and lunar ephemeris, offline.
// The data (physics/ephemeris-data.js) is a compact Chebyshev fit of the official JPL kernel de440s.bsp made by
// scripts/build-ephemeris.py: 1950-01-01 to 2100-01-01, J2000 mean ecliptic axes (the app's root frame), metres.
// Fit error against DE440: Moon <= 40 m, Earth/EMB <= 100 m, Mars <= 0.6 km, Venus <= 2.6 km, Jupiter/Saturn <= 5 km
// (each series records its own measured maxErrorM). Time argument t = TDB seconds after J2000.0 (physics/time.js).
//
//   ephemerisState('moon', t)  -> {r, v} geocentric Moon
//   ephemerisState('earth', t) -> {r, v} heliocentric Earth (EMB - Moon/(1+EMRAT), exactly as in DE440)
//   ephemerisState('mars' | 'venus' | 'jupiter' | 'saturn' | 'emb', t) -> heliocentric barycentre of that system
// Returns null outside the covered span or for a body without data, so the caller can fall back to its own model.
import { EPHEMERIS_META, EPHEMERIS_SERIES } from './ephemeris-data.js';

export const EPHEMERIS_INFO = Object.freeze({ ...EPHEMERIS_META, bodies: ['earth', ...Object.keys(EPHEMERIS_SERIES)], maxErrorM: Object.fromEntries(Object.entries(EPHEMERIS_SERIES).map(([k, s]) => [k, s.maxErrorM])) });

const decoded = new Map();
function b64ToBytes(s) {
  if (typeof atob === 'function') { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  return new Uint8Array(Buffer.from(s, 'base64'));   // Node without atob (very old versions)
}
/** Coefficients of one series as a Float64Array laid out [interval][axis][k], decoded on first use. */
function series(name) {
  let s = decoded.get(name);
  if (s) return s;
  const def = EPHEMERIS_SERIES[name];
  if (!def) return null;
  const bytes = b64ToBytes(def.data), dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = def.count * 3 * (def.degree + 1), c = new Float64Array(n);
  if (def.type === 'i32') for (let i = 0; i < n; i++) c[i] = dv.getInt32(i * 4, true);
  else for (let i = 0; i < n; i++) c[i] = dv.getFloat64(i * 8, true);
  s = { ...def, c, data: undefined };
  decoded.set(name, s);
  return s;
}

/** Position [m] and velocity [m/s] of series `name` at TDB seconds t, or null outside its span. */
function evalSeries(name, t) {
  const s = series(name);
  if (!s) return null;
  const rel = (t - s.t0) / s.interval;
  if (!(rel >= 0 && rel <= s.count)) return null;
  const j = Math.min(Math.floor(rel), s.count - 1), x = 2 * (rel - j) - 1, N = s.degree + 1, base = j * 3 * N;
  const r = [0, 0, 0], v = [0, 0, 0], scale = 2 / s.interval;
  for (let ax = 0; ax < 3; ax++) {
    // Clenshaw for the value, and the T'_k recurrence for the derivative
    let T0 = 1, T1 = x, D0 = 0, D1 = 1;
    const o = base + ax * N;
    let p = s.c[o] + (N > 1 ? s.c[o + 1] * x : 0), d = N > 1 ? s.c[o + 1] : 0;
    for (let k = 2; k < N; k++) {
      const T2 = 2 * x * T1 - T0, D2 = 2 * T1 + 2 * x * D1 - D0;
      p += s.c[o + k] * T2; d += s.c[o + k] * D2;
      T0 = T1; T1 = T2; D0 = D1; D1 = D2;
    }
    r[ax] = p; v[ax] = d * scale;
  }
  return { r, v };
}

/** True when t [TDB s after J2000] lies inside the bundled span (1950-2100). */
export const ephemerisCovers = (t) => t >= EPHEMERIS_META.start && t <= EPHEMERIS_META.stop;

/** State of a body from DE440 (see header), or null. */
export function ephemerisState(id, t) {
  if (id === 'earth') {
    const emb = evalSeries('emb', t), m = evalSeries('moon', t);
    if (!emb || !m) return null;
    const f = 1 / (1 + EPHEMERIS_META.emrat);
    return { r: emb.r.map((x, i) => x - f * m.r[i]), v: emb.v.map((x, i) => x - f * m.v[i]) };
  }
  return EPHEMERIS_SERIES[id] ? evalSeries(id, t) : null;
}
