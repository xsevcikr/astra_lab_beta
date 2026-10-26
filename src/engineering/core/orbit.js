// Two-body orbital mechanics (PHYSICS). Positions in m, velocities in m/s.
import { add, sub, scale, dot, cross, norm } from './vec.js';

export const circularSpeed = (mu, r) => Math.sqrt(mu / r);
export const escapeSpeed = (mu, r) => Math.sqrt(2 * mu / r);
export const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
export const period = (mu, a) => 2 * Math.PI * Math.sqrt(a * a * a / mu);

export function hohmann(mu, r1, r2) {
  const a = (r1 + r2) / 2;
  const dv1 = Math.abs(visViva(mu, r1, a) - circularSpeed(mu, r1));
  const dv2 = Math.abs(circularSpeed(mu, r2) - visViva(mu, r2, a));
  return { dv1, dv2, total: dv1 + dv2, transferTime: period(mu, a) / 2, a };
}

export function stateToElements(mu, r, v) {
  const rm = norm(r), vm = norm(v);
  const h = cross(r, v), hm = norm(h);
  const energy = vm * vm / 2 - mu / rm;
  const a = -mu / (2 * energy);
  const evec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rm));
  const e = norm(evec);
  const inc = Math.acos(Math.max(-1, Math.min(1, h[2] / hm)));
  return { a, e, inc, energy, h: hm, periapsis: a * (1 - e), apoapsis: e < 1 ? a * (1 + e) : Infinity, evec };
}

// Kepler propagation for elliptical orbits using f and g functions.
export function propagateKepler(mu, r0, v0, dt) {
  const el = stateToElements(mu, r0, v0);
  if (el.e >= 1) throw new Error('propagateKepler supports elliptical orbits only');
  const r0m = norm(r0), a = el.a, n = Math.sqrt(mu / (a * a * a));
  const sigma0 = dot(r0, v0) / Math.sqrt(mu);
  // solve Kepler in terms of delta eccentric anomaly
  const M = n * dt;
  let dE = M;
  for (let i = 0; i < 50; i++) {
    const f = dE - (1 - r0m / a) * Math.sin(dE) + sigma0 / Math.sqrt(a) * (1 - Math.cos(dE)) - M;
    const fp = 1 - (1 - r0m / a) * Math.cos(dE) + sigma0 / Math.sqrt(a) * Math.sin(dE);
    const step = f / fp;
    dE -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  const r = a + (r0m - a) * Math.cos(dE) + sigma0 * Math.sqrt(a) * Math.sin(dE);
  const f = 1 - a / r0m * (1 - Math.cos(dE));
  const g = dt + Math.sqrt(a * a * a / mu) * (Math.sin(dE) - dE);
  const fd = -Math.sqrt(mu * a) / (r * r0m) * Math.sin(dE);
  const gd = 1 - a / r * (1 - Math.cos(dE));
  return { r: add(scale(r0, f), scale(v0, g)), v: add(scale(r0, fd), scale(v0, gd)) };
}

// Clohessy-Wiltshire relative motion (target in circular orbit, mean motion n). x radial, y along-track, z cross-track.
export function cwPropagate(n, s0, t) {
  const [x, y, z, vx, vy, vz] = s0;
  const c = Math.cos(n * t), s = Math.sin(n * t);
  return [
    (4 - 3 * c) * x + s / n * vx + 2 / n * (1 - c) * vy,
    6 * (s - n * t) * x + y + 2 / n * (c - 1) * vx + (4 * s - 3 * n * t) / n * vy,
    c * z + s / n * vz,
    3 * n * s * x + c * vx + 2 * s * vy,
    6 * n * (c - 1) * x - 2 * s * vx + (4 * c - 3) * vy,
    -n * s * z + c * vz,
  ];
}

// Two-impulse CW targeting: velocity needed now to reach origin (target) after time T.
export function cwTarget(n, s0, T) {
  const [x, y, z] = s0;
  const c = Math.cos(n * T), s = Math.sin(n * T);
  // Phi_rr * r0 + Phi_rv * v0 = 0  -> solve 2x2 in-plane + 1 out-of-plane
  const rr = [[4 - 3 * c, 0], [6 * (s - n * T), 1]];
  const rv = [[s / n, 2 / n * (1 - c)], [2 / n * (c - 1), (4 * s - 3 * n * T) / n]];
  const bx = -(rr[0][0] * x + rr[0][1] * y), by = -(rr[1][0] * x + rr[1][1] * y);
  const det = rv[0][0] * rv[1][1] - rv[0][1] * rv[1][0];
  const vx = (bx * rv[1][1] - rv[0][1] * by) / det;
  const vy = (rv[0][0] * by - rv[1][0] * bx) / det;
  const vz = Math.abs(s) > 1e-9 ? -z * c * n / s : 0;
  return [vx, vy, vz];
}
