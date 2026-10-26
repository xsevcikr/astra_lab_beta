// Two-body orbital mechanics: state <-> elements, universal-variable Kepler propagation, orbit sampling, transfer maths.
import { dot, cross, len, norm } from './vec.js';

const TWO_PI = 2 * Math.PI;
const mod2pi = (x) => ((x % TWO_PI) + TWO_PI) % TWO_PI;

export const circularSpeed = (mu, r) => Math.sqrt(mu / r);
export const escapeSpeed = (mu, r) => Math.sqrt((2 * mu) / r);
export const orbitalPeriod = (mu, a) => TWO_PI * Math.sqrt((a * a * a) / mu);
export const visViva = (mu, r, a) => Math.sqrt(mu * (2 / r - 1 / a));
export const specificEnergy = (mu, r, v) => (v * v) / 2 - mu / r;

/**
 * Classical orbital elements from an inertial state vector.
 * Returns apsis *radii* (rp, ra) - subtract the body radius for altitudes. ra = Infinity for e >= 1.
 */
export function elementsFromState(mu, r, v) {
  const rm = len(r), vm = len(v);
  const h = cross(r, v), hm = len(h);
  const rv = dot(r, v);
  const eVec = [
    ((vm * vm - mu / rm) * r[0] - rv * v[0]) / mu,
    ((vm * vm - mu / rm) * r[1] - rv * v[1]) / mu,
    ((vm * vm - mu / rm) * r[2] - rv * v[2]) / mu,
  ];
  const e = len(eVec);
  const energy = (vm * vm) / 2 - mu / rm;
  const p = (hm * hm) / mu;
  const parabolic = Math.abs(e - 1) < 1e-10;
  const a = parabolic ? Infinity : -mu / (2 * energy);
  const inc = hm > 0 ? Math.acos(Math.max(-1, Math.min(1, h[2] / hm))) : 0;
  const nVec = [-h[1], h[0], 0];
  const nm = Math.hypot(nVec[0], nVec[1]);
  let raan = nm > 1e-9 * hm ? Math.atan2(nVec[1], nVec[0]) : 0;
  raan = mod2pi(raan);
  let argp, nu;
  const circular = e < 1e-9, equatorial = nm <= 1e-9 * hm;
  if (!circular) {
    if (!equatorial) {
      argp = Math.acos(Math.max(-1, Math.min(1, dot(nVec, eVec) / (nm * e))));
      if (eVec[2] < 0) argp = TWO_PI - argp;
    } else {
      argp = Math.atan2(eVec[1], eVec[0]);
      if (h[2] < 0) argp = TWO_PI - argp;
      argp = mod2pi(argp);
    }
    nu = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / (e * rm))));
    if (rv < 0) nu = TWO_PI - nu;
  } else {
    argp = 0;
    if (!equatorial) {
      nu = Math.acos(Math.max(-1, Math.min(1, dot(nVec, r) / (nm * rm))));
      if (r[2] < 0) nu = TWO_PI - nu;
    } else {
      nu = Math.atan2(r[1], r[0]); if (h[2] < 0) nu = -nu; nu = mod2pi(nu);
    }
  }
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const type = e < 1e-6 ? 'circular' : e < 1 - 1e-9 ? 'elliptic' : parabolic ? 'parabolic' : 'hyperbolic';
  let period = NaN, n = NaN, tPeri = NaN, tApo = NaN, M = NaN;
  if (e < 1 - 1e-9) {
    period = orbitalPeriod(mu, a); n = TWO_PI / period;
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M = mod2pi(E - e * Math.sin(E));
    tPeri = mod2pi(TWO_PI - M) / n; // time until next periapsis passage
    tApo = mod2pi(Math.PI - M) / n; // time until next apoapsis passage
  } else if (e > 1 + 1e-9) {
    n = Math.sqrt(mu / Math.pow(-a, 3));
    const nuS = nu > Math.PI ? nu - TWO_PI : nu;
    const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nuS / 2));
    M = e * Math.sinh(F) - F;
    tPeri = -M / n; // negative after periapsis
  }
  return {
    a, e, i: inc, raan, argp, nu, p, rp, ra, energy, hVec: h, h: hm, eVec, type, period, n, M, tPeri, tApo,
    vInf: energy > 0 ? Math.sqrt(2 * energy) : 0,
  };
}

// Stumpff functions
export const stumpC = (z) => (z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24 + (z * z) / 720);
export const stumpS = (z) => (z > 1e-8 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / Math.pow(z, 1.5) : z < -1e-8 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / Math.pow(-z, 1.5) : 1 / 6 - z / 120 + (z * z) / 5040);

/** Universal-variable Kepler propagation (valid for elliptic, parabolic and hyperbolic orbits). */
export function propagateKepler(mu, r0, v0, dt) {
  if (dt === 0) return { r: [...r0], v: [...v0] };
  const rm0 = len(r0), vm0 = len(v0);
  const sqmu = Math.sqrt(mu);
  const alpha = 2 / rm0 - (vm0 * vm0) / mu;
  const rv0 = dot(r0, v0);
  if (alpha > 1e-12) { // reduce whole periods for accuracy
    const T = TWO_PI / (Math.sqrt(mu) * Math.pow(alpha, 1.5));
    dt = dt % T;
    if (dt === 0) return { r: [...r0], v: [...v0] };
  }
  let chi;
  if (alpha > 1e-12) chi = sqmu * dt * alpha;
  else if (alpha < -1e-12) {
    const a = 1 / alpha;
    chi = Math.sign(dt) * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (rv0 + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - rm0 * alpha)));
  } else chi = (sqmu * dt) / rm0;
  if (!Number.isFinite(chi)) chi = sqmu * dt / rm0;
  let z, C, S;
  for (let it = 0; it < 100; it++) {
    z = alpha * chi * chi; C = stumpC(z); S = stumpS(z);
    const F = ((rv0 / sqmu) * chi * chi * C) + (1 - alpha * rm0) * chi * chi * chi * S + rm0 * chi - sqmu * dt;
    const dF = ((rv0 / sqmu) * chi * (1 - z * S)) + (1 - alpha * rm0) * chi * chi * C + rm0;
    const d = F / dF;
    chi -= d;
    if (Math.abs(d) < 1e-10 * Math.max(1, Math.abs(chi))) break;
  }
  z = alpha * chi * chi; C = stumpC(z); S = stumpS(z);
  const f = 1 - (chi * chi * C) / rm0;
  const g = dt - (chi * chi * chi * S) / sqmu;
  const r = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]];
  const rm = len(r);
  const fd = (sqmu / (rm * rm0)) * chi * (z * S - 1);
  const gd = 1 - (chi * chi * C) / rm;
  return { r, v: [fd * r0[0] + gd * v0[0], fd * r0[1] + gd * v0[1], fd * r0[2] + gd * v0[2]] };
}

/** Sample points along the osculating orbit in the inertial frame (for 3D path display). */
export function sampleOrbit(mu, r, v, count = 180, maxRadius = Infinity) {
  const el = elementsFromState(mu, r, v);
  const pts = [];
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan), ci = Math.cos(el.i), si = Math.sin(el.i), cw = Math.cos(el.argp), sw = Math.sin(el.argp);
  const rot = (x, y) => [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y,
  ];
  if (el.e < 1 - 1e-9) {
    const b = el.a * Math.sqrt(1 - el.e * el.e);
    for (let k = 0; k <= count; k++) {
      const E = (k / count) * TWO_PI;
      pts.push(rot(el.a * (Math.cos(E) - el.e), b * Math.sin(E)));
    }
  } else {
    let nuMax = Math.acos(-1 / el.e) * 0.995;
    if (Number.isFinite(maxRadius)) { const c = (el.p / maxRadius - 1) / el.e; if (c > -1 && c < 1) nuMax = Math.min(nuMax, Math.acos(c)); }
    for (let k = 0; k <= count; k++) {
      const nu = -nuMax + (2 * nuMax * k) / count;
      const rr = el.p / (1 + el.e * Math.cos(nu));
      pts.push(rot(rr * Math.cos(nu), rr * Math.sin(nu)));
    }
  }
  return pts;
}

/** Hohmann transfer between two coplanar circular orbits of radius r1 -> r2. */
export function hohmann(mu, r1, r2) {
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const vt1 = Math.sqrt(mu * (2 / r1 - 1 / a)), vt2 = Math.sqrt(mu * (2 / r2 - 1 / a));
  const dv1 = vt1 - v1, dv2 = v2 - vt2;
  return { dv1, dv2, dvTotal: Math.abs(dv1) + Math.abs(dv2), tof: Math.PI * Math.sqrt((a * a * a) / mu), a };
}
/** Delta-v to inject from a circular orbit of radius r onto an escape hyperbola with excess speed vInf. */
export function escapeBurnDv(mu, r, vInf) {
  return Math.sqrt(vInf * vInf + (2 * mu) / r) - Math.sqrt(mu / r);
}
export function planeChangeDv(v, dInc) { return 2 * v * Math.sin(dInc / 2); }

/** Initial state vector for a circular equatorial-or-inclined orbit at true latitude argument u=0. */
export function circularOrbitState(mu, radius, inc = 0, raan = 0, u = 0) {
  const v = Math.sqrt(mu / radius);
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(inc), si = Math.sin(inc), cu = Math.cos(u), su = Math.sin(u);
  const r = [radius * (cO * cu - sO * su * ci), radius * (sO * cu + cO * su * ci), radius * su * si];
  const vv = [v * (-cO * su - sO * cu * ci), v * (-sO * su + cO * cu * ci), v * cu * si];
  return { r, v: vv };
}
export const unit = norm;
