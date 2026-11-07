// Atmosphere models. Earth: US Standard Atmosphere 1976 to 86 km (PHYSICS-based table model),
// exponential extension above (APPROXIMATION). Mars: NASA Glenn curve fit (APPROXIMATION).
import { MODEL } from './provenance.js';
import { Atmosphere as MainAtmosphere } from '../../../physics/atmosphere.js';   // 2.7: one source of truth for the Earth above 86 km (this file used a 7 km scale height there: 13 orders of magnitude too thin at 400 km)
const HIGH_EARTH = new MainAtmosphere({ model: 'us76', height: 1e9 });

const R_AIR = 287.053, GAMMA_AIR = 1.4, G0 = 9.80665, RE = 6356766;
// geopotential base heights (m), base temps (K), lapse rates (K/m)
const H = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
const L = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002, 0];
const T = [288.15];
const P = [101325];
for (let i = 1; i < H.length; i++) {
  const dh = H[i] - H[i - 1];
  T[i] = T[i - 1] + L[i - 1] * dh;
  P[i] = L[i - 1] === 0
    ? P[i - 1] * Math.exp(-G0 * dh / (R_AIR * T[i - 1]))
    : P[i - 1] * Math.pow(T[i] / T[i - 1], -G0 / (L[i - 1] * R_AIR));
}

function earth(alt) {
  const z = Math.max(alt, -500);
  const h = RE * z / (RE + z); // geopotential altitude
  if (h <= H[H.length - 1]) {
    let i = H.length - 2;
    while (i > 0 && h < H[i]) i--;
    const t = T[i] + L[i] * (h - H[i]);
    const p = L[i] === 0 ? P[i] * Math.exp(-G0 * (h - H[i]) / (R_AIR * T[i])) : P[i] * Math.pow(t / T[i], -G0 / (L[i] * R_AIR));
    return { temperature: t, pressure: p, density: p / (R_AIR * t), speedOfSound: Math.sqrt(GAMMA_AIR * R_AIR * t), gamma: GAMMA_AIR, gasConstant: R_AIR, model: MODEL.PHYSICS };
  }
  // above 86 km: the tabulated US76 values of the main simulator (physics/atmosphere.js), log-interpolated
  const q = HIGH_EARTH.query(z);
  return { temperature: q.T, pressure: q.p, density: q.rho, speedOfSound: q.a, gamma: q.gamma, gasConstant: q.R, model: MODEL.PHYSICS };
}

const R_MARS = 188.92, GAMMA_MARS = 1.29;
function mars(alt) {
  const h = Math.max(alt, -8000);
  const tc = h < 7000 ? -31 - 0.000998 * h : -23.4 - 0.00222 * h;
  const t = Math.max(tc + 273.15, 120);
  const p = 699 * Math.exp(-0.00009 * h);
  return { temperature: t, pressure: p, density: p / (R_MARS * t), speedOfSound: Math.sqrt(GAMMA_MARS * R_MARS * t), gamma: GAMMA_MARS, gasConstant: R_MARS, model: MODEL.APPROXIMATION };
}

const VACUUM = Object.freeze({ temperature: 0, pressure: 0, density: 0, speedOfSound: 0, gamma: 1, gasConstant: 0, model: MODEL.PHYSICS });
const MODELS = { earth, mars };
export function registerAtmosphere(id, fn) { MODELS[id] = fn; }

// env: optional { densityScale, temperatureOffset, wind:[east,north] or function(alt) }
export function atmosphere(id, alt, env = {}) {
  const fn = id && MODELS[id];
  if (!fn) return VACUUM;
  const a = { ...fn(alt) };
  if (env.temperatureOffset) a.temperature += env.temperatureOffset;
  if (env.densityScale) { a.density *= env.densityScale; a.pressure *= env.densityScale; }
  return a;
}

// Simple wind profile: power law below 12 km jet core, then decays. APPROXIMATION.
export function windAt(alt, { surface = 0, jet = 0, jetAlt = 12000 } = {}) {
  if (alt <= 0) return surface;
  if (alt < jetAlt) return surface + (jet - surface) * Math.pow(alt / jetAlt, 0.7);
  const u = (alt - jetAlt) / 10000;
  return jet * Math.exp(-u * u);
}

export const machNumber = (speed, a) => (a.speedOfSound > 0 ? speed / a.speedOfSound : 0);
export const dynamicPressure = (speed, a) => 0.5 * a.density * speed * speed;
// Sutherland viscosity (air); used for Reynolds number. Mars uses CO2 constants.
export function viscosity(a, gas = 'air') {
  const [mu0, t0, s] = gas === 'co2' ? [1.37e-5, 273, 222] : [1.716e-5, 273.15, 110.4];
  const t = Math.max(a.temperature, 1);
  return mu0 * Math.pow(t / t0, 1.5) * (t0 + s) / (t + s);
}
export const reynolds = (speed, length, a, gas) => (a.density > 0 ? a.density * speed * length / viscosity(a, gas) : 0);
