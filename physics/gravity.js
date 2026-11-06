// Gravity beyond the point mass (2.7). Everything here is OFF unless the project asks for "precise gravity" (settings.j2), so older results do not change.
//
//  * zonalAccel():   the oblateness terms J2, J3, J4 of the planet's field (acceleration formulas of Vallado, Fundamentals of Astrodynamics, 4th ed.,
//                    section 8.6.2, z axis = spin axis). J2 alone was the only term before 2.7.
//  * thirdBodies() / thirdBodyAccel(): the pull of the Sun and of the Moon (Earth primary) or of the Sun and Earth (Moon primary) on a spacecraft, as the
//                    DIFFERENCE between their pull on the craft and on the primary body (the primary is not an inertial centre):
//                    a = mu_b ((rb - r)/|rb - r|^3 - rb/|rb|^3). Other primaries have no third body here.
import { getBody, bodyStateRelParent, bodyStateAbs, fromRoot, convertFrame } from './bodies.js';

/** Add the J2, J3, J4 acceleration at (x, y, z) [m] around primary P to out = [ax, ay, az]. */
export function zonalAccel(P, x, y, z, out) {
  const j2 = P.j2 ?? 0, j3 = P.j3 ?? 0, j4 = P.j4 ?? 0;
  if (!j2 && !j3 && !j4) return out;
  const r2 = x * x + y * y + z * z, r = Math.sqrt(r2), mu = P.mu, R = P.radius, z2 = (z * z) / r2, z4 = z2 * z2;
  if (j2) {
    const k = (1.5 * j2 * mu * R * R) / (r2 * r2);
    out[0] += -k * (x / r) * (1 - 5 * z2); out[1] += -k * (y / r) * (1 - 5 * z2); out[2] += -k * (z / r) * (3 - 5 * z2);
  }
  if (j3) {
    const k = (2.5 * j3 * mu * R * R * R) / (r2 * r2 * r);                                   // (5/2) J3 mu R^3 / r^5
    out[0] += -k * (x / r) * (3 - 7 * z2) * (z / r); out[1] += -k * (y / r) * (3 - 7 * z2) * (z / r);
    out[2] += -k * (6 * z2 - 7 * z4 - 0.6);
  }
  if (j4) {
    const k = (15 / 8) * j4 * mu * R * R * R * R / (r2 * r2 * r2);                           // (15/8) J4 mu R^4 / r^6
    out[0] += k * (x / r) * (1 - 14 * z2 + 21 * z4); out[1] += k * (y / r) * (1 - 14 * z2 + 21 * z4);
    out[2] += k * (z / r) * (5 - (70 / 3) * z2 + 21 * z4);
  }
  return out;
}

/** Third bodies of primary `id` at absolute time t [s after J2000], positions written in the primary's own axes: [{mu, r:[x,y,z]}]. */
export function thirdBodies(id, t) {
  const list = [];
  if (id === 'earth') {
    list.push({ mu: getBody('moon').mu, r: bodyStateRelParent('moon', t).r });
    const e = bodyStateAbs('earth', t).r; list.push({ mu: getBody('sun').mu, r: fromRoot('earth', [-e[0], -e[1], -e[2]]) });
  } else if (id === 'moon') {
    const m = bodyStateRelParent('moon', t).r;
    list.push({ mu: getBody('earth').mu, r: convertFrame('earth', 'moon', [-m[0], -m[1], -m[2]]) });
    const e = bodyStateAbs('moon', t).r; list.push({ mu: getBody('sun').mu, r: fromRoot('moon', [-e[0], -e[1], -e[2]]) });
  }
  return list;
}

/** Add the third-body acceleration at (x, y, z) to out. */
export function thirdBodyAccel(bodies, x, y, z, out) {
  for (const b of bodies) {
    const bx = b.r[0], by = b.r[1], bz = b.r[2];
    const dx = bx - x, dy = by - y, dz = bz - z;
    const d2 = dx * dx + dy * dy + dz * dz, d3 = d2 * Math.sqrt(d2), b2 = bx * bx + by * by + bz * bz, b3 = b2 * Math.sqrt(b2);
    out[0] += b.mu * (dx / d3 - bx / b3); out[1] += b.mu * (dy / d3 - by / b3); out[2] += b.mu * (dz / d3 - bz / b3);
  }
  return out;
}
