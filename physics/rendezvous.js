// Rendezvous planning in a central-force field (two-body maths; the simulator integrates the real flight):
//   planLiftoff    - when to leave the surface so that the ascent ends a chosen phase angle behind the orbiting ship
//   planRendezvous - two impulses (a Lambert transfer and a braking burn) that bring a spacecraft to a point near the target
// Everything here only PROPOSES burns; the simulator flies them with finite thrust and reports what actually happened.
import { lambert } from './mission-design.js';
import { propagateKepler, elementsFromState } from './orbital.js';
import { add, sub, scale, dot, cross, len, norm } from './vec.js';

const wrapPi = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Liftoff time and ascent plane.
 *   siteAt(t)  inertial position of the launch site; csmAt(t) -> {r, v} of the target ship; tMin earliest liftoff; period of the target orbit.
 *   ascentTime / downrange: duration of the ascent [s] and the angle it covers [rad]; phaseLead: angle the ship should be AHEAD of the lander at insertion [rad].
 * Returns {t, normal (unit normal of the ascent plane, through the site), heading (unit horizontal direction of travel at the site), phaseError}.
 */
export function planLiftoff({ siteAt, csmAt, tMin, period, ascentTime = 450, downrange = 0.13, phaseLead = 0.3, step = 5 }) {
  let best = null;
  for (let t = tMin; t <= tMin + 1.15 * period; t += step) {
    const c0 = csmAt(t), nC = norm(cross(c0.r, c0.v));
    const e1 = norm(c0.r), e2 = cross(nC, e1);
    const ang = (x) => Math.atan2(dot(x, e2), dot(x, e1));
    const thC = ang(csmAt(t + ascentTime).r), thS = ang(siteAt(t));
    const err = Math.abs(wrapPi(thC - (thS + downrange) - phaseLead));
    if (!best || err < best.err) best = { t, err };
  }
  const t = best.t, c0 = csmAt(t), nC = norm(cross(c0.r, c0.v)), s = siteAt(t), sh = norm(s);
  // the plane that contains the site and is as close as possible to the ship's plane
  const normal = norm(sub(nC, scale(sh, dot(nC, sh))));
  const heading = norm(cross(normal, sh));
  return { t, normal, heading, phaseError: best.err, planeAngle: Math.asin(Math.min(1, Math.abs(dot(nC, sh)))) };
}

/**
 * Two-impulse rendezvous. The lander (r, v at time t0) coasts, burns once at t1 onto a Lambert arc that reaches `aim(t2)` at t2 = t1 + T, where
 * a second (braking) burn removes the relative velocity. Searches t1 and T for the smallest total delta-v whose arc stays above the surface.
 *   mu, radius: central body. csmAt(t) -> {r, v}. aim(t) -> the point to reach (target position plus an offset). Returns null if nothing works.
 */
export function planRendezvous({ mu, radius, r, v, t0, csmAt, aim = null, tMin = 600, tMax = 3600, durMin = 1500, durMax = 6300, minPeriAlt = 4000, step = 120 }) {
  const aimAt = aim ?? ((t) => csmAt(t).r);
  const hC = cross(csmAt(t0).r, csmAt(t0).v);
  let best = null;
  for (let dt1 = tMin; dt1 <= tMax; dt1 += step) {
    const s1 = propagateKepler(mu, r, v, dt1);
    for (let T = durMin; T <= durMax; T += step) {
      const t2 = t0 + dt1 + T, tgt = aimAt(t2), c2 = csmAt(t2);
      const sol = lambert(mu, s1.r, tgt, T, { prograde: true, normal: hC });
      if (!sol) continue;
      const dv1 = sub(sol.v1, s1.v), dv2 = sub(c2.v, sol.v2);
      const cost = len(dv1) + len(dv2);
      if (best && cost >= best.cost) continue;
      // the arc must clear the surface
      const el = elementsFromState(mu, s1.r, sol.v1);
      if (!(el.e < 1) || el.rp - radius < minPeriAlt) continue;
      best = { cost, t1: t0 + dt1, T, t2, dv1, dv2, rBurn: s1.r, vBurn: s1.v, periAlt: el.rp - radius, apoAlt: el.ra - radius };
    }
  }
  return best;
}

/** A correction burn that keeps the arrival time and point (a fresh Lambert arc from the true state); returns {dv: vector, v2: arrival velocity} or null. */
export function planIntercept({ mu, r, v, t0, t2, target, normal }) {
  const T = t2 - t0;
  if (!(T > 30)) return null;
  const sol = lambert(mu, r, target, T, { prograde: true, normal });
  if (!sol) return null;
  return { dv: sub(sol.v1, v), v2: sol.v2 };
}
