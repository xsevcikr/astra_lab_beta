// Configurable atmosphere models. Every model exposes query(altitude_m) -> {T, p, rho, a, gamma, R}.
// Models:  'us76'   - U.S. Standard Atmosphere 1976 (layers to 86 km, tabulated density/temperature above)
//          'glenn-mars' - NASA Glenn Mars atmosphere model (simple curve fit)
//          'exponential' - isothermal-scale-height model: rho = rho0 * exp(-h/H)
//          'none'   - vacuum
import { R_GAS } from './constants.js';

const US76_LAYERS = [
  // base geopotential altitude [m], base T [K], lapse rate [K/m], base pressure [Pa]
  [0, 288.15, -0.0065, 101325.0],
  [11000, 216.65, 0.0, 22632.06],
  [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187],
  [47000, 270.65, 0.0, 110.9063],
  [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
];
// Above 86 km: [geometric altitude km, density kg/m3, temperature K] (US76 / standard tabulation, log-interpolated).
const US76_HIGH = [
  [86, 6.958e-6, 186.87], [90, 3.416e-6, 186.87], [100, 5.604e-7, 195.08], [110, 9.708e-8, 240.0], [120, 2.222e-8, 360.0],
  [130, 8.152e-9, 469.3], [140, 3.831e-9, 559.6], [150, 2.076e-9, 634.4], [180, 5.194e-10, 799.2], [200, 2.541e-10, 854.6],
  [250, 6.073e-11, 941.3], [300, 1.916e-11, 976.0], [350, 7.014e-12, 990.1], [400, 2.803e-12, 995.8], [450, 1.184e-12, 998.0],
  [500, 5.215e-13, 999.2], [600, 1.137e-13, 999.9], [700, 3.070e-14, 1000], [800, 1.136e-14, 1000], [900, 5.759e-15, 1000], [1000, 3.561e-15, 1000],
];
const R0_US76 = 6356766; // geopotential reference radius [m]

function us76(h) {
  const R = 287.053, gamma = 1.4;
  if (h < 0) h = 0;
  if (h <= 86000) {
    const H = (R0_US76 * h) / (R0_US76 + h);
    let i = US76_LAYERS.length - 1;
    while (i > 0 && H < US76_LAYERS[i][0]) i--;
    const [Hb, Tb, L, pb] = US76_LAYERS[i];
    const T = Tb + L * (H - Hb);
    const g0 = 9.80665;
    const p = L === 0 ? pb * Math.exp((-g0 * (H - Hb)) / (R * Tb)) : pb * Math.pow(Tb / T, g0 / (R * L));
    const rho = p / (R * T);
    return { T, p, rho, a: Math.sqrt(gamma * R * T), gamma, R };
  }
  const km = h / 1000;
  const tab = US76_HIGH;
  if (km >= tab[tab.length - 1][0]) {
    // beyond 1000 km: continue with last scale height (~ effectively vacuum)
    const [k1, r1, T1] = tab[tab.length - 1];
    const rho = r1 * Math.exp(-(km - k1) / 200);
    const p = rho * R * T1;
    return { T: T1, p, rho, a: Math.sqrt(gamma * R * T1), gamma, R };
  }
  let i = 0;
  while (tab[i + 1][0] < km) i++;
  const [k0, r0, T0] = tab[i], [k1, r1, T1] = tab[i + 1];
  const f = (km - k0) / (k1 - k0);
  const rho = Math.exp(Math.log(r0) + f * (Math.log(r1) - Math.log(r0)));
  const T = T0 + f * (T1 - T0);
  const p = rho * R * T;
  return { T, p, rho, a: Math.sqrt(gamma * R * T), gamma, R };
}

// 2.4: AFGL tropical atmosphere (Anderson et al. 1986, AFGL-TR-86-0110): a warm tropical day such as a Florida summer launch.
// 2.5: the same machinery builds a day from a weather-balloon sounding. A temperature table every km (K) is turned into pressure by hydrostatic
// balance; above the table the standard atmosphere is blended in over 20 km so there is no jump.
const TROPICAL_T = [299.7, 293.7, 287.7, 283.7, 277.0, 270.3, 263.6, 257.0, 250.3, 243.6, 237.0, 230.1, 223.6, 217.0, 210.3, 203.7, 197.0, 194.8, 198.8, 202.7, 206.7, 210.7, 214.6, 217.0, 219.2, 221.4];
function profileModel(Tkm, p0) {
  const R = 287.053, g0 = 9.80665, top = Tkm.length - 1;                                     // table covers 0..top km
  const Tat = (k) => { const i = Math.max(0, Math.min(top - 1, Math.floor(k))); return Tkm[i] + (Tkm[i + 1] - Tkm[i]) * (k - i); };
  const P = [p0]; for (let k = 1; k <= top * 10; k++) P.push(P[k - 1] * Math.exp((-g0 * 100) / (R * Tat((k - 0.5) / 10))));
  const stdTop = us76((R0_US76 * top * 1000) / (R0_US76 - top * 1000)), kTop = P[top * 10] / stdTop.p, fade = 20;
  return (h) => {
    const std = us76(h), H = Math.max(0, (R0_US76 * h) / (R0_US76 + h)), km = H / 1000;
    if (km >= top + fade) return std;
    let T, p;
    if (km <= top) { T = Tat(km); const f = H / 100, i = Math.min(top * 10 - 1, Math.floor(f)); p = P[i] * Math.pow(P[i + 1] / P[i], f - i); }
    else { p = std.p * (1 + (kTop - 1) * Math.max(0, 1 - (km - top) / fade)); T = std.T; }
    const rho = p / (R * T);
    return { T, p, rho, a: Math.sqrt(1.4 * R * T), gamma: 1.4, R };
  };
}
let TROPICAL_Q = null;
function tropical(h) { return (TROPICAL_Q ??= profileModel(TROPICAL_T, 101325))(h); }

/** A day from a sounding {points:[{h,T,pres}]} (parseSounding in src/core/sounding.js): temperature by height, ground pressure from the first level when given. */
export function soundingModel(sounding) {
  const pts = sounding.points, top = Math.min(30, Math.floor(pts[pts.length - 1].h / 1000));
  const Tkm = []; for (let k = 0; k <= top; k++) {
    const hm = k * 1000; let i = pts.findIndex((q) => q.h >= hm);
    if (i <= 0) Tkm.push(pts[0].T); else Tkm.push(pts[i - 1].T + ((pts[i].T - pts[i - 1].T) * (hm - pts[i - 1].h)) / Math.max(pts[i].h - pts[i - 1].h, 1));
  }
  const p0 = pts[0].pres && pts[0].pres > 50000 ? pts[0].pres : 101325;
  return profileModel(Tkm, p0);
}

function glennMars(h) {
  const R = 188.92, gamma = 1.29;
  if (h < 0) h = 0;
  let Tc = h < 7000 ? -31 - 0.000998 * h : -23.4 - 0.00222 * h; // deg C
  let T = Tc + 273.15;
  if (T < 130) T = 130; // mesosphere floor (model fit invalid below)
  const pKPa = 0.699 * Math.exp(-0.00009 * h);
  const p = pKPa * 1000;
  const rho = p / (R * T);
  return { T, p, rho, a: Math.sqrt(gamma * R * T), gamma, R };
}

export class Atmosphere {
  /** @param {object} cfg {model, height, ...params} */
  constructor(cfg) {
    this.cfg = cfg || { model: 'none' };
    this.model = this.cfg.model || 'none';
    if (this.cfg.profile === 'sounding' && this.cfg.sounding) this._snd = soundingModel(this.cfg.sounding);
    this.height = this.cfg.height ?? (this.model === 'none' ? 0 : 200000); // altitude above which density is treated as 0
    if (this.model === 'exponential') {
      const c = this.cfg;
      this.rho0 = c.rho0; this.H = c.scaleHeight; this.T0 = c.T0 ?? 250; this.gamma = c.gamma ?? 1.4; this.Rg = c.R ?? 287;
    }
  }
  get hasAtmosphere() { return this.model !== 'none'; }
  query(alt) {
    switch (this.model) {
      case 'us76': return this.cfg.profile === 'tropical' ? tropical(alt) : this.cfg.profile === 'sounding' && this._snd ? this._snd(alt) : us76(alt);
      case 'glenn-mars': return glennMars(alt);
      case 'exponential': {
        const rho = this.rho0 * Math.exp(-Math.max(alt, 0) / this.H);
        const T = this.T0;
        return { T, p: rho * this.Rg * T, rho, a: Math.sqrt(this.gamma * this.Rg * T), gamma: this.gamma, R: this.Rg };
      }
      default: return { T: 2.7, p: 0, rho: 0, a: 1e9, gamma: 1.4, R: 287 };
    }
  }
  density(alt) { return this.model === 'none' ? 0 : this.query(alt).rho; }
}
export const universalGas = R_GAS;
