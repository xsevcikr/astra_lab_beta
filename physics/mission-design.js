// Mission-design calculators (impulsive, patched-conic level). Pure functions on top of orbital.js and the Keplerian ephemerides in bodies.js.
// Everything here is analytic or numeric maths on published formulas; nothing is tuned.
//
//   plane changes ........ planeChangeDv (pure), combinedBurnDv (plane change merged with a speed change)
//   circularisation ...... circularisationDv
//   Earth rotation ....... rotationBenefit
//   delta-v budget ....... deltaVBudget (turns the simulator's integrated losses into a table that must add up)
//   interplanetary ....... synodicPeriod, hohmannPhaseAngle, lambert, interplanetaryTransfer, findTransferWindows, hohmannWindows
//
// Documented simplifications: impulsive burns; patched conics (sphere-of-influence size ignored for the heliocentric leg);
// planets on fixed Keplerian ellipses (no perturbations); the Earth state is the Earth itself, not the Earth-Moon barycentre.
import { dot, cross, len, sub, scale } from './vec.js';
import { getBody, bodyStateAbs } from './bodies.js';
import { escapeBurnDv, circularSpeed, visViva, orbitalPeriod, hohmann, planeChangeDv, stumpC, stumpS } from './orbital.js';
import { DEG } from './constants.js';

export { planeChangeDv };

// ---------------------------------------------------------------------------------------------------------------
// Plane change, circularisation, rotation
// ---------------------------------------------------------------------------------------------------------------
/** Delta-v of ONE impulsive burn that changes speed from v1 to v2 and turns the velocity vector by dInc [rad] (law of cosines). */
export function combinedBurnDv(v1, v2, dInc) {
  return Math.sqrt(Math.max(v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(dInc), 0));
}
/**
 * Plane change comparison for a circular orbit of radius r1 that must reach a circular orbit of radius r2 with inclination change dInc.
 * Returns the plane change alone at r1 and at r2, the Hohmann alone, and three ways of combining them.
 */
export function planeChangeOptions(mu, r1, r2, dInc) {
  const H = hohmann(mu, r1, r2);
  const v1 = circularSpeed(mu, r1), v2 = circularSpeed(mu, r2);
  const a = (r1 + r2) / 2;
  const vt1 = visViva(mu, r1, a), vt2 = visViva(mu, r2, a);
  const separate = H.dvTotal + planeChangeDv(Math.min(v1, v2), dInc);       // plane change done at the slower (higher) circular orbit
  const atFirst = combinedBurnDv(v1, vt1, dInc) + Math.abs(v2 - vt2);       // all of the turn in the first burn
  const atSecond = Math.abs(vt1 - v1) + combinedBurnDv(vt2, v2, dInc);      // all of the turn in the second burn
  // best split of the turn between the two burns (golden-section search on x in [0, dInc])
  let lo = 0, hi = dInc;
  const f = (x) => combinedBurnDv(v1, vt1, x) + combinedBurnDv(vt2, v2, dInc - x);
  for (let i = 0; i < 80; i++) { const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (f(m1) < f(m2)) hi = m2; else lo = m1; }
  const x = 0.5 * (lo + hi);
  return { hohmannOnly: H.dvTotal, planeChangeOnly: planeChangeDv(v1, dInc), separate, atFirst, atSecond, bestSplit: f(x), bestSplitAngle: x, tof: H.tof };
}
/** Burn that raises the periapsis (or lowers the apoapsis) of an orbit with apsides rp, ra to a circular orbit at the apsis where the burn happens. */
export function circularisationDv(mu, rp, ra, where = 'apoapsis') {
  const a = (rp + ra) / 2;
  const r = where === 'apoapsis' ? ra : rp;
  const vNow = visViva(mu, r, a);
  const vCirc = circularSpeed(mu, r);
  return { dv: Math.abs(vCirc - vNow), signed: vCirc - vNow, vNow, vCirc, r };
}
/** Eastward surface speed the launch site gives to a launch toward azimuth `azDeg` (from north, clockwise) [m/s]. Positive helps. */
export function rotationBenefit(bodyId, latDeg, azDeg) {
  const B = getBody(bodyId);
  return B.omega * B.radius * Math.cos(latDeg * DEG) * Math.sin(azDeg * DEG);
}

/** Sun-synchronous inclination [deg] for a circular orbit around the Earth at `altitude`: J2 nodal precession equals the Earth's mean motion about the Sun. */
export function sunSynchronousInclination(altitude) {
  const B = getBody('earth');
  const a = B.radius + altitude;
  const wSun = (2 * Math.PI) / (365.2422 * 86400);
  const c = (-2 * wSun * Math.pow(a, 3.5)) / (3 * B.j2 * B.radius * B.radius * Math.sqrt(B.mu));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------------------------------------------
// Delta-v budget
// ---------------------------------------------------------------------------------------------------------------
/**
 * Delta-v budget of an ascent from the simulator's integrated quantities (summary.deltaV) and the initial / final inertial speed.
 * The simulator integrates   ideal = Int a_thrust dt,   gravity = Int g cos(...) dt,   drag = Int D/m dt,   steering = Int a_thrust (1 - cos misalignment) dt.
 * Closure: final speed - initial speed = ideal - gravity - drag - steering  (up to the integration error, reported in `residual`).
 */
export function deltaVBudget({ ideal, gravity, drag, steering }, vInitial, vFinal) {
  const useful = ideal - gravity - drag - steering;
  const gained = vFinal - vInitial;
  const rows = [
    { id: 'ideal', label: 'Rocket-equation delta-v delivered by the engines', value: ideal, sign: '+' },
    { id: 'gravity', label: 'Gravity loss (climbing against gravity)', value: gravity, sign: '-' },
    { id: 'drag', label: 'Drag loss (air resistance)', value: drag, sign: '-' },
    { id: 'steering', label: 'Steering loss (thrust not along the velocity)', value: steering, sign: '-' },
    { id: 'useful', label: 'Speed actually gained (sum)', value: useful, sign: '=' },
    { id: 'start', label: 'Starting speed (Earth rotation at the launch site)', value: vInitial, sign: ' ' },
    { id: 'final', label: 'Final orbital speed', value: vFinal, sign: ' ' },
  ];
  const lossTotal = gravity + drag + steering;
  return { rows, useful, gained, residual: useful - gained, lossTotal, lossFraction: ideal > 0 ? lossTotal / ideal : 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Dates (the ephemerides use t = 0 at the J2000 epoch: 2000-01-01 12:00)
// ---------------------------------------------------------------------------------------------------------------
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const epochToDate = (t) => new Date(J2000_MS + t * 1000);
export const dateToEpoch = (d) => ((d instanceof Date ? d.getTime() : Date.parse(d)) - J2000_MS) / 1000;
const DAY = 86400;

// ---------------------------------------------------------------------------------------------------------------
// Interplanetary transfers
// ---------------------------------------------------------------------------------------------------------------
export const synodicPeriod = (T1, T2) => (T1 * T2) / Math.abs(T1 - T2);
/** Angle [rad] by which the target planet must lead the origin planet at departure for a Hohmann transfer between circular coplanar orbits r1 -> r2. */
export function hohmannPhaseAngle(r1, r2) {
  const tof = Math.PI * Math.sqrt(Math.pow((r1 + r2) / 2, 3) / 1); // in units where mu = 1; only the ratio matters
  const n2 = Math.sqrt(1 / (r2 * r2 * r2));
  return Math.PI - n2 * tof;
}

/**
 * Lambert's problem (universal variables; Bate, Mueller & White / Curtis algorithm). Find the conic through r1 and r2 that takes `tof` seconds.
 * @returns {{v1:number[], v2:number[], z:number}|null}  null when no solution exists in the search range.
 */
export function lambert(mu, r1, r2, tof, { prograde = true, normal = [0, 0, 1] } = {}) {
  const r1m = len(r1), r2m = len(r2);
  const c12 = cross(r1, r2);
  let dTheta = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (r1m * r2m))));
  const s = dot(c12, normal) >= 0 ? 1 : -1;
  if (prograde ? s < 0 : s > 0) dTheta = 2 * Math.PI - dTheta;
  const A = Math.sin(dTheta) * Math.sqrt((r1m * r2m) / (1 - Math.cos(dTheta)));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-9) return null;
  const sqmu = Math.sqrt(mu);
  const yOf = (z) => r1m + r2m + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const F = (z) => { const y = yOf(z); if (y < 0) return NaN; return Math.pow(y / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(y) - sqmu * tof; };
  // bracket: F increases with z where y > 0; find the lowest z with y >= 0
  let lo = -4 * Math.PI * Math.PI + 1e-3, hi = 4 * Math.PI * Math.PI - 1e-3;
  while (yOf(lo) < 0 && lo < hi) lo += 0.1;
  const flo = F(lo), fhi = F(hi);
  if (!(flo < 0) || !(fhi > 0)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = F(mid);
    if (!Number.isFinite(fm) || fm > 0) hi = mid; else lo = mid;
    if (hi - lo < 1e-12) break;
  }
  const z = 0.5 * (lo + hi);
  const y = yOf(z);
  const f = 1 - y / r1m, g = A * Math.sqrt(y / mu), gdot = 1 - y / r2m;
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g);
  const v2 = scale(sub(scale(r2, gdot), r1), 1 / g);
  return { v1, v2, z };
}

const helio = (id, t) => bodyStateAbs(id, t);
const lonOf = (r) => Math.atan2(r[1], r[0]);
const wrapPi = (x) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/**
 * Patched-conic transfer between two planets (both orbiting the Sun) leaving at epoch t0 [s] and arriving at t0 + tof.
 * The heliocentric leg is the Lambert solution between the real (ephemeris) positions; the planetary legs are the burns from / into circular parking orbits.
 */
export function interplanetaryTransfer({ from = 'earth', to = 'mars', t0, tof, parkFrom = 200e3, parkTo = 300e3, prograde = true }) {
  const A = getBody(from), B = getBody(to), S = getBody('sun');
  const s1 = helio(from, t0), s2 = helio(to, t0 + tof);
  const sol = lambert(S.mu, s1.r, s2.r, tof, { prograde });
  if (!sol) return null;
  const vInfDep = len(sub(sol.v1, s1.v)), vInfArr = len(sub(sol.v2, s2.v));
  const rA = A.radius + parkFrom, rB = B.radius + parkTo;
  const dvDep = escapeBurnDv(A.mu, rA, vInfDep);
  const dvArr = escapeBurnDv(B.mu, rB, vInfArr);   // same expression: speed at periapsis of the hyperbola minus circular speed
  return {
    from, to, t0, tof, depart: epochToDate(t0), arrive: epochToDate(t0 + tof),
    vInfDep, vInfArr, c3: vInfDep * vInfDep, dvDeparture: dvDep, dvArrivalCircular: dvArr, dvTotal: dvDep + dvArr,
    helioV1: sol.v1, helioV2: sol.v2,
    note: 'Impulsive burns from/into circular parking orbits; arrival capture is into a circular orbit (an elliptical capture is cheaper).',
  };
}

/** Best (lowest departure C3) transfer for a given departure epoch, scanning flight times. */
export function bestTransferAt(from, to, t0, { tofMin = 120 * DAY, tofMax = 500 * DAY, step = 6 * DAY } = {}) {
  let best = null;
  for (let tof = tofMin; tof <= tofMax; tof += step) {
    const tr = interplanetaryTransfer({ from, to, t0, tof });
    if (tr && (!best || tr.c3 < best.c3)) best = tr;
  }
  return best;
}

/**
 * Launch windows: local minima of the best departure C3 over the departure date (a "porkchop plot" scan with Lambert solutions on the real ephemeris).
 * @returns array of {t0, date, tof, c3, vInfDep, vInfArr, dvDeparture, dvArrivalCircular, phaseAngleDeg, hohmannPhaseDeg}
 */
export function findTransferWindows({ from = 'earth', to = 'mars', startT, spanDays = 900, stepDays = 5, parkFrom = 200e3, parkTo = 300e3 } = {}) {
  const t0s = [], c3s = [], best = [];
  for (let d = 0; d <= spanDays; d += stepDays) {
    const t = startT + d * DAY;
    const b = bestTransferAt(from, to, t);
    t0s.push(t); best.push(b); c3s.push(b ? b.c3 : Infinity);
  }
  const out = [];
  for (let i = 1; i < c3s.length - 1; i++) {
    if (c3s[i] < c3s[i - 1] && c3s[i] <= c3s[i + 1] && Number.isFinite(c3s[i])) {
      // refine with a local fine scan
      let bt = null;
      for (let d = -stepDays; d <= stepDays; d += 0.5) {
        const t = t0s[i] + d * DAY;
        const b = bestTransferAt(from, to, t, { step: 2 * DAY, tofMin: Math.max(best[i].tof - 30 * DAY, 90 * DAY), tofMax: best[i].tof + 30 * DAY });
        if (b && (!bt || b.c3 < bt.c3)) bt = b;
      }
      const w = interplanetaryTransfer({ from, to, t0: bt.t0, tof: bt.tof, parkFrom, parkTo });
      const ph = phaseAngle(from, to, bt.t0);
      const A = getBody(from), B = getBody(to);
      const ra = len(helio(from, bt.t0).r), rb = len(helio(to, bt.t0).r);
      out.push({ ...w, phaseAngleDeg: ph / DEG, hohmannPhaseDeg: hohmannPhaseAngle(ra, rb) / DEG });
    }
  }
  // keep real windows only: short (type I/II) flights, and one window per synodic cycle (the lowest C3 within 200 days)
  const good = out.filter((w) => w.tof <= 450 * DAY && w.c3 <= 40e6).sort((a, b) => a.t0 - b.t0);
  const merged = [];
  for (const w of good) {
    const last = merged[merged.length - 1];
    if (last && w.t0 - last.t0 < 200 * DAY) { if (w.c3 < last.c3) merged[merged.length - 1] = w; } else merged.push(w);
  }
  return merged;
}
/** Heliocentric angle [rad] by which `to` leads `from` at epoch t. */
export function phaseAngle(from, to, t) {
  return wrapPi(lonOf(helio(to, t).r) - lonOf(helio(from, t).r));
}
/**
 * First-order windows from the phase-angle rule: dates when the destination leads the origin by the Hohmann phase angle computed from the
 * planets' CURRENT distances from the Sun (so the planets' orbit eccentricity is partly included).
 */
export function hohmannWindows({ from = 'earth', to = 'mars', startT, spanDays = 1600, stepDays = 2 } = {}) {
  const f = (t) => wrapPi(phaseAngle(from, to, t) - hohmannPhaseAngle(len(helio(from, t).r), len(helio(to, t).r)));
  const out = [];
  let tPrev = startT, fPrev = f(tPrev);
  for (let d = stepDays; d <= spanDays; d += stepDays) {
    const t = startT + d * DAY, ft = f(t);
    if (fPrev > 0 && ft <= 0 && Math.abs(ft - fPrev) < 1) { // the slower outer planet falls behind, so the phase angle decreases through the Hohmann value
      let a = tPrev, b = t;
      for (let i = 0; i < 50; i++) { const m = 0.5 * (a + b); if (f(m) > 0) a = m; else b = m; }
      const tw = 0.5 * (a + b);
      out.push({ t0: tw, date: epochToDate(tw), phaseAngleDeg: phaseAngle(from, to, tw) / DEG });
    }
    tPrev = t; fPrev = ft;
  }
  return out;
}
export { orbitalPeriod };
