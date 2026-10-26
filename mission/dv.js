// Delta-v and performance maths for multi-stage vehicles and patched-conic lunar/planetary transfers.
// All functions are pure and take plain numbers (SI units) so the UI, the AI tools and the tests share one implementation.
// These give BUDGETS (what a flight needs). The time-domain simulation is the final judge; see validate.js for how the two are compared.
import { G0 } from '../physics/constants.js';
import { getBody } from '../physics/bodies.js';
import { circularSpeed, visViva, escapeBurnDv, hohmann } from '../physics/orbital.js';
import { ascentDvRequired } from '../src/vehicles/analysis.js';

export const exhaustVelocity = (isp) => isp * G0;
export const dvOf = (isp, m0, mf) => (mf > 0 && m0 > mf ? isp * G0 * Math.log(m0 / mf) : 0);
export const propForDv = (isp, m0, dv) => m0 * (1 - Math.exp(-dv / (isp * G0)));

/**
 * One rocket stage. `payload` is everything above it. Stage = {name, dry, prop, thrustVac, ispVac}.
 * Returns mass, dv, burn time and thrust-to-weight at ignition and burnout (weight at gravity g).
 */
export function stageStats(stage, payload, g = G0) {
  const m0 = stage.dry + stage.prop + payload;
  const mf = stage.dry + payload;
  const ve = stage.ispVac * G0;
  const mdot = stage.thrustVac / ve;
  return {
    name: stage.name, m0, mf, dv: dvOf(stage.ispVac, m0, mf), burnTime: mdot > 0 ? stage.prop / mdot : Infinity,
    twrStart: stage.thrustVac / (m0 * g), twrEnd: stage.thrustVac / (mf * g), massFraction: stage.prop / (stage.dry + stage.prop),
  };
}

/** Serial stack, stages listed in firing order (first = bottom). Returns per-stage stats and the total dv. */
export function stackStats(stages, payload, g = G0) {
  const out = [];
  let above = payload;
  const aboveOf = [];
  for (let i = stages.length - 1; i >= 0; i--) { aboveOf[i] = above; above += stages[i].dry + stages[i].prop; }
  for (let i = 0; i < stages.length; i++) out.push(stageStats(stages[i], aboveOf[i], g));
  return { stages: out, totalMass: above, totalDv: out.reduce((s, x) => s + x.dv, 0) };
}

/**
 * Burn `dv` m/s from the bottom of a stack. Returns the stack afterwards: spent stages are gone, the current stage has
 * less propellant, plus the dv still available. `ok` = the dv was available.
 */
export function burnStack(stages, payload, dv) {
  const st = stackStats(stages, payload).stages;
  let left = dv; const remaining = stages.map((s) => ({ ...s }));
  let idx = 0;
  while (idx < remaining.length && left > 1e-9) {
    if (left >= st[idx].dv) { left -= st[idx].dv; idx++; continue; }
    const s = remaining[idx];
    const m0 = st[idx].m0, mf = m0 * Math.exp(-left / (s.ispVac * G0));
    s.prop -= (m0 - mf); left = 0;
  }
  const live = remaining.slice(idx);
  const stats = live.length ? stackStats(live, payload) : { totalDv: 0, totalMass: payload };
  return { ok: left <= 1e-6, shortfall: Math.max(left, 0), stages: live, dvRemaining: stats.totalDv, massNow: stats.totalMass };
}

// ---------------------------------------------------------------- transfers (patched conic, coplanar circular bodies)

/** Moon-bound transfer from a circular parking orbit: TLI dv, arrival v-infinity at the Moon, time of flight. */
export function transferToMoon({ parkAlt = 185e3, origin = 'earth', moon = 'moon' } = {}) {
  const E = getBody(origin), M = getBody(moon);
  const r1 = E.radius + parkAlt, aMoon = M.elements.a;
  const aT = (r1 + aMoon) / 2;
  const vPark = circularSpeed(E.mu, r1);
  const tli = visViva(E.mu, r1, aT) - vPark;
  const vMoon = circularSpeed(E.mu, aMoon);
  const vApo = visViva(E.mu, aMoon, aT);
  return { vPark, tli, tof: Math.PI * Math.sqrt((aT ** 3) / E.mu), vInfMoon: vMoon - vApo, vApoapsis: vApo, vMoon };
}

/** Capture (LOI) or departure (TEI) burn between a circular low orbit and a hyperbola with excess speed vInf. */
export const hyperbolicBurn = (mu, rOrbit, vInf) => escapeBurnDv(mu, rOrbit, vInf);

/** Speed at entry interface for a return transfer whose far end is the Moon's distance. */
export function earthEntrySpeed({ origin = 'earth', moon = 'moon', entryAlt = 121920 } = {}) {
  const E = getBody(origin), M = getBody(moon);
  const r = E.radius + entryAlt, a = (r + M.elements.a) / 2;
  return visViva(E.mu, r, a);
}

/**
 * Landing budget on an airless body from a circular orbit: deorbit + powered descent + hover reserve.
 * Gravity loss uses the burn time at the stated thrust-to-weight, so a weak engine needs more dv, as in real life.
 */
export function poweredDescentDv({ body = 'moon', orbitAlt = 100e3, periAlt = 15e3, twr = 2.5, hoverTime = 30 } = {}) {
  const B = getBody(body), g = B.gravity;
  const r0 = B.radius + orbitAlt, rp = B.radius + periAlt;
  const doi = hohmann(B.mu, r0, rp).dv1;
  const vPeri = visViva(B.mu, rp, (r0 + rp) / 2);
  const aT = twr * g;
  const tBrake = vPeri / Math.max(aT - 0.5 * g, 0.1 * g);
  const gravityLoss = g * tBrake * 0.25 + g * hoverTime;
  const steering = 0.02 * vPeri;
  return { deorbit: Math.abs(doi), vPeri, brakeTime: tBrake, gravityLoss, steering, total: Math.abs(doi) + vPeri + gravityLoss + steering };
}

/** Surface-to-orbit budget for an airless body, with gravity loss that depends on thrust-to-weight. */
export function poweredAscentDv({ body = 'moon', insertAlt = 15e3, twr = 2.0 } = {}) {
  const B = getBody(body), g = B.gravity;
  const vc = circularSpeed(B.mu, B.radius + insertAlt);
  const vRot = B.omega * B.radius;
  const t = vc / Math.max(twr * g - g * 0.5, 0.1 * g);
  const gravityLoss = g * t * 0.2;
  return { vCircular: vc, vRotation: vRot, gravityLoss, total: vc - vRot + gravityLoss };
}

/** Ascent from a body with an atmosphere (uses the app's existing estimate). */
export const atmosphericAscentDv = (body, altitude, latDeg) => ascentDvRequired(body, altitude, latDeg);

/** Change of orbital plane at speed v by angle dInc (rad). */
export const planeChange = (v, dInc) => 2 * v * Math.sin(dInc / 2);
