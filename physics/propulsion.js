// Rocket-equation utilities (Tsiolkovsky) and simple engine performance helpers.
import { G0 } from './constants.js';
export const deltaV = (isp, m0, mf) => isp * G0 * Math.log(m0 / mf);
export const massRatioForDv = (isp, dv) => Math.exp(dv / (isp * G0));
export const propellantForDv = (isp, m0, dv) => m0 * (1 - Math.exp(-dv / (isp * G0)));
export const massFlow = (thrust, isp) => thrust / (isp * G0);
/** Isp as a function of ambient pressure (linear in p/p0 between sea-level and vacuum values). */
export function ispAtPressure(ispVac, ispSl, p, p0 = 101325) {
  const f = Math.min(Math.max(p / p0, 0), 1);
  return ispVac - (ispVac - ispSl) * f;
}
export function burnTime(dv, isp, thrust, m0) {
  const mdot = thrust / (isp * G0);
  const mf = m0 * Math.exp(-dv / (isp * G0));
  return (m0 - mf) / mdot;
}
