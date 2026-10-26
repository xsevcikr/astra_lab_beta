// Earth-Moon transfer maths (patched conics): where the Moon is, when a trajectory enters its sphere of influence, what a course
// correction costs, and which launch time and burn point send a parked ship to the Moon.
// Model: two-body Kepler arcs (Earth, then Moon after the sphere-of-influence crossing) with the SAME ephemeris and the SAME
// sphere-of-influence radius that the flight simulator uses. It is the planner's estimate; the simulator integrates the real flight.
import { getBody, bodyStateRelParent } from './bodies.js';
import { propagateKepler, elementsFromState } from './orbital.js';
import { add, sub, scale, dot, cross, len, norm } from './vec.js';

const EARTH = () => getBody('earth');
const MOON = () => getBody('moon');
const DAY = 86400;

/** Rotate a vector about the Earth's spin axis (z) by `angle` [rad]. */
export function rotateZ(a, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * a[0] - s * a[1], s * a[0] + c * a[1], a[2]];
}
/** Moon position and velocity relative to the Earth at absolute time t [s]. */
export const moonState = (t) => bodyStateRelParent('moon', t);

/**
 * First entry into the Moon's sphere of influence of a free (unpowered) Earth-centred trajectory.
 * (r, v) = state at absolute time t0. Returns null if the Moon's sphere is not entered within maxSpan, otherwise
 * {t, dt, rE, vE (Earth frame), rM, vM (Moon frame)} at the crossing.
 */
export function soiEntry(r, v, t0, { maxSpan = 8 * DAY, step = 1200 } = {}) {
  const mu = EARTH().mu, soi = MOON().soi;
  const rel = (dt) => {
    const s = propagateKepler(mu, r, v, dt), m = moonState(t0 + dt);
    return { s, m, d: len(sub(s.r, m.r)) };
  };
  let prev = 0;
  for (let dt = step; dt <= maxSpan; dt += step) {
    const x = rel(dt);
    if (x.d < soi) {
      let lo = prev, hi = dt;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (rel(mid).d < soi) hi = mid; else lo = mid; }
      const e = rel(hi);
      return { t: t0 + hi, dt: hi, rE: e.s.r, vE: e.s.v, rM: sub(e.s.r, e.m.r), vM: sub(e.s.v, e.m.v) };
    }
    prev = dt;
  }
  return null;
}

/** Smallest centre-to-centre distance to the Moon within `span`, and when. Used by the launch-window search for trajectories that miss the sphere. */
export function closestMoonApproach(r, v, t0, { span = 8 * DAY, step = 3600 } = {}) {
  const mu = EARTH().mu;
  const dist = (dt) => { const s = propagateKepler(mu, r, v, dt); return len(sub(s.r, moonState(t0 + dt).r)); };
  let best = Infinity, bt = 0;
  for (let dt = step; dt <= span; dt += step) { const d = dist(dt); if (d < best) { best = d; bt = dt; } }
  let lo = Math.max(bt - step, 0), hi = bt + step;
  for (let i = 0; i < 50; i++) { // golden-section refinement
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (dist(a) < dist(b)) hi = b; else lo = a;
  }
  const t = (lo + hi) / 2;
  return { distance: dist(t), dt: t };
}

/** Periapsis radius [m] (from the Moon's centre) and the Moon-frame orbit of a state inside the sphere of influence. */
export function moonOrbit(rM, vM) {
  const el = elementsFromState(MOON().mu, rM, vM);
  return { rp: el.rp, ecc: el.e, a: el.a, incl: el.i, energy: (len(vM) ** 2) / 2 - MOON().mu / len(rM) };
}

/**
 * Perilune altitude [m] of a free trajectory (state at absolute time t0), or null if it does not enter the Moon's sphere.
 * `extra` carries the crossing data for callers that want it.
 */
export function perilune(r, v, t0, opts) {
  const e = soiEntry(r, v, t0, opts);
  if (!e) return null;
  const o = moonOrbit(e.rM, e.vM);
  return { altitude: o.rp - MOON().radius, entry: e, orbit: o };
}

/**
 * Course correction: the smallest velocity change (inertial Earth-frame vector, applied now) that makes the free trajectory pass the Moon
 * at `targetAltitude`. Newton iteration with a finite-difference Jacobian and a minimum-norm step (one constraint, three unknowns).
 * Returns {dv: [x,y,z], dvMag, predicted: {altitude, tEntry}, iterations} or null if no solution within 20 iterations.
 */
export function solveCourseCorrection(r, v, t0, targetAltitude, { maxIter = 24, tolerance = 500, inclination = null, inclTolerance = 0.3 } = {}) {
  // unknowns: the three components of dv. Constraints: perilune altitude (and, when asked, the inclination of the lunar orbit to the lunar equator).
  const TO_DEG = 180 / Math.PI;
  const f = (d) => {
    const p = perilune(r, add(v, d), t0, { step: 2400 });
    if (!p) return null;
    return inclination == null ? [p.altitude - targetAltitude] : [p.altitude - targetAltitude, (p.orbit.incl * TO_DEG - inclination) * 1000];   // inclination residual in milli-degrees
  };
  const small = (fx) => Math.abs(fx[0]) < tolerance && (fx.length < 2 || Math.abs(fx[1]) < inclTolerance * 1000);
  const norm2 = (fx) => Math.hypot(fx[0] / 1000, fx.length > 1 ? fx[1] / 300 : 0);
  let dv = [0, 0, 0];
  let fx = f(dv);
  if (fx === null) return null;
  for (let it = 0; it < maxIter; it++) {
    if (small(fx)) break;
    const h = 0.5, J = [];   // J[k][i] = d f_k / d dv_i
    for (let k = 0; k < fx.length; k++) J.push([0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const d2 = [...dv]; d2[i] += h;
      const fi = f(d2);
      if (fi === null) return null;
      for (let k = 0; k < fx.length; k++) J[k][i] = (fi[k] - fx[k]) / h;
    }
    // minimum-norm Newton step: dv_step = -J^T (J J^T)^-1 fx
    let step;
    if (fx.length === 1) {
      const g2 = dot(J[0], J[0]); if (!(g2 > 0)) return null;
      step = scale(J[0], -fx[0] / g2);
    } else {
      const a11 = dot(J[0], J[0]), a12 = dot(J[0], J[1]), a22 = dot(J[1], J[1]);
      const det = a11 * a22 - a12 * a12; if (!(Math.abs(det) > 1e-18)) return null;
      const l1 = (a22 * -fx[0] - a12 * -fx[1]) / det, l2 = (-a12 * -fx[0] + a11 * -fx[1]) / det;
      step = add(scale(J[0], l1), scale(J[1], l2));
    }
    const sm = len(step); if (sm > 200) step = scale(step, 200 / sm);
    let trial = add(dv, step), ft = f(trial), damp = 1;
    while ((ft === null || norm2(ft) > norm2(fx)) && damp > 1e-3) { damp /= 2; trial = add(dv, scale(step, damp)); ft = f(trial); }
    if (ft === null) return null;
    dv = trial; fx = ft;
  }
  if (Math.abs(fx[0]) >= tolerance * 4 || (fx.length > 1 && Math.abs(fx[1]) >= inclTolerance * 4000)) return null;
  const p = perilune(r, add(v, dv), t0, { step: 600 });
  return { dv, dvMag: len(dv), predicted: { altitude: p?.altitude ?? NaN, tEntry: p?.entry.t ?? NaN, inclination: p ? p.orbit.incl * TO_DEG : NaN }, residual: fx[0] };
}

/** Burn-point state for an impulsive prograde burn of magnitude s [m/s]. */
const burnVelocity = (v, s) => add(v, scale(norm(v), s));
/** Prograde delta-v at (r, v) that gives an orbit with apoapsis radius ra. */
export function dvToApoapsis(r, v, ra) {
  const mu = EARTH().mu;
  let lo = 0, hi = 4500;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2, el = elementsFromState(mu, r, burnVelocity(v, mid));
    if (el.e < 1 && el.ra < ra) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Launch window and burn point for a trans-lunar injection.
 *   park  = {r, v, t}   state in the parking orbit after a launch at epoch 0 (t = flight time of that state)
 *   search = how far to look: launch epochs 0..days, burn points up to one orbit after `park.t` (+ `coastMin`)
 * The ascent trajectory only turns with the Earth, so a different launch epoch rotates the parking state about the Earth's axis.
 * Returns the candidate with the smallest distance to the Moon: {epoch, tBurn (flight time of the burn centre), dv, apogeeRadius, missKm, ...}
 */
export function planTransLunar(park, { days = 29, coastMin = 600, coastMax = null, burnDuration = 0, raFactor = 1.0, orbits = 1.2, aimAltitude = 110e3, fast = false } = {}) {
  const E = EARTH(), omega = E.omega, mu = E.mu;
  const period = 2 * Math.PI * Math.sqrt((len(park.r) ** 3) / mu);
  const cand = [];
  const timeToApo = (el) => el.tApo;
  const geometry = (epoch, tau) => {
    const phi = omega * epoch;
    const r0 = rotateZ(park.r, phi), v0 = rotateZ(park.v, phi);
    const s0 = propagateKepler(mu, r0, v0, tau);
    const tAbs = epoch + park.t + tau;
    let ra = len(moonState(tAbs + 4 * DAY).r) * raFactor, dv = 0, v1 = null, el = null;
    for (let k = 0; k < 3; k++) {
      dv = dvToApoapsis(s0.r, s0.v, ra);
      v1 = burnVelocity(s0.v, dv);
      el = elementsFromState(mu, s0.r, v1);
      ra = len(moonState(tAbs + timeToApo(el)).r) * raFactor;
    }
    dv = dvToApoapsis(s0.r, s0.v, ra); v1 = burnVelocity(s0.v, dv); el = elementsFromState(mu, s0.r, v1);
    return { s0, v1, tAbs, ra, dv, tApo: timeToApo(el) };
  };
  // cheap measure: distance between the apogee and the Moon at apogee time
  const apogeeMiss = (epoch, tau) => {
    const g = geometry(epoch, tau);
    // a fast (higher-energy) transfer meets the Moon before apogee: use the closest approach itself
    if (fast) return closestMoonApproach(g.s0.r, g.v1, g.tAbs, { span: 5 * DAY, step: 10800 }).distance;
    const a = propagateKepler(mu, g.s0.r, g.v1, g.tApo);
    return len(sub(a.r, moonState(g.tAbs + g.tApo).r));
  };
  // exact measure: closest approach of the whole trajectory
  const tryOne = (epoch, tau) => {
    const g = geometry(epoch, tau);
    const c = closestMoonApproach(g.s0.r, g.v1, g.tAbs, { span: 6.5 * DAY, step: 7200 });
    return { epoch, tau, dv: g.dv, ra: g.ra, miss: c.distance, tof: c.dt, rBurn: g.s0.r, vBurn: g.s0.v };
  };
  // coarse scan: launch epoch in 2-hour steps, burn point in 5-minute steps (cheap measure), keep the best few per launch day
  const coarse = [];
  for (let e = 0; e <= days * DAY; e += 7200) {
    let bestTau = null, bestM = Infinity;
    for (let tau = coastMin; tau <= (coastMax ?? coastMin + orbits * period); tau += 300) {
      const m = apogeeMiss(e, tau);
      if (m < bestM) { bestM = m; bestTau = tau; }
    }
    coarse.push({ epoch: e, tau: bestTau, miss: bestM });
  }
  coarse.sort((a, b) => a.miss - b.miss);
  // refine the best candidates (distinct launch days) with a local pattern search on the exact measure
  const refined = [];
  const seen = [];
  for (const c0 of coarse) {
    if (refined.length >= 5) break;
    if (seen.some((s) => Math.abs(s - c0.epoch) < 0.75 * DAY)) continue;
    seen.push(c0.epoch);
    let best = tryOne(c0.epoch, c0.tau), de = 3600, dt = 150;
    for (let it = 0; it < 40 && (de > 1 || dt > 0.5); it++) {
      let moved = false;
      for (const [ee, tt] of [[de, 0], [-de, 0], [0, dt], [0, -dt]]) {
        const tau = best.tau + tt; if (tau < coastMin || (coastMax != null && tau > coastMax)) continue;
        const x = tryOne(Math.max(best.epoch + ee, 0), tau);
        if (x.miss < best.miss) { best = x; moved = true; }
      }
      if (!moved) { de /= 2; dt /= 2; }
    }
    refined.push(best);
  }
  refined.sort((a, b) => a.epoch - b.epoch);
  const good = refined.filter((c) => c.miss < MOON().soi * 0.4);
  const pick = (good.length ? good : refined.slice().sort((a, b) => a.miss - b.miss)).slice().sort((a, b) => (good.length ? a.epoch - b.epoch : a.miss - b.miss))[0];
  return { ...pick, missKm: pick.miss / 1000, candidates: refined.map((c) => ({ epoch: c.epoch, tau: c.tau, dv: c.dv, ra: c.ra, tof: c.tof, rBurn: c.rBurn, vBurn: c.vBurn, missKm: c.miss / 1000 })), period, aimAltitude };
}

/**
 * Trans-Earth injection from lunar orbit. (r0, v0) = state in the Moon frame at absolute time tAbs0 (a bound orbit). Looks for the burn start
 * (up to `span` seconds ahead) and the prograde delta-v that make the Earth-frame trajectory after leaving the Moon's sphere of influence pass the
 * Earth at `targetAltitude`. Returns {dtBurn, dv, perigeeAltitude, tofSeconds} (impulsive estimate) or null.
 */
/** Seconds from the state (r, v) to the next perigee of its (bound) Earth orbit; a large number when the orbit is not closed or the ship is flying outbound. */
function timeToPerigee(mu, r, v) {
  const rm = len(r), en = dot(v, v) / 2 - mu / rm;
  if (!(en < 0)) return 1e7;
  const a = -mu / (2 * en), h = cross(r, v), e = Math.sqrt(Math.max(0, 1 - dot(h, h) / (mu * a)));
  if (e < 1e-6) return 1e7;
  const cosE = Math.max(-1, Math.min(1, (1 - rm / a) / e)); let E = Math.acos(cosE); if (dot(r, v) < 0) E = 2 * Math.PI - E;   // inbound: past apoapsis
  const M = E - e * Math.sin(E), n = Math.sqrt(mu / (a * a * a));
  return ((2 * Math.PI - M) / n) % (2 * Math.PI / n);
}
export function planTransEarth(r0, v0, tAbs0, { span = 7000, step = 30, dvMin = 700, dvMax = 1500, dvStep = 20, targetAltitude = 45e3, dvPrefer = 1000, dvTarget = null, tofTarget = null } = {}) {
  const muM = MOON().mu, soi = MOON().soi, E = EARTH();
  let best = null;
  const exitState = (rb, vb, tb) => {
    // bisection on the time at which the outgoing hyperbola reaches the sphere of influence
    let lo = 0, hi = 4 * DAY;
    if (len(propagateKepler(muM, rb, vb, hi).r) < soi) return null;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (len(propagateKepler(muM, rb, vb, mid).r) < soi) lo = mid; else hi = mid; }
    const s = propagateKepler(muM, rb, vb, hi), m = moonState(tb + hi);
    return { r: add(s.r, m.r), v: add(s.v, m.v), tx: hi };
  };
  for (let dtb = 120; dtb <= span; dtb += step) {
    const s = propagateKepler(muM, r0, v0, dtb), dir = norm(s.v);
    // perigee altitude of the Earth orbit that follows a burn of `dv` at this moment (null when the ship does not leave the Moon)
    const trial = (dv) => {
      const vb = add(s.v, scale(dir, dv));
      if (!(elementsFromState(muM, s.r, vb).e > 1)) return null;
      const ex = exitState(s.r, vb, tAbs0 + dtb); if (!ex) return null;
      const el = elementsFromState(E.mu, ex.r, ex.v);
      return { alt: el.rp - E.radius, tof: ex.tx + timeToPerigee(E.mu, ex.r, ex.v) };
    };
    let prev = null;
    for (let dv = dvMin; dv <= dvMax; dv += dvStep) {
      const cur = trial(dv);
      if (cur && prev && (prev.t.alt - targetAltitude) * (cur.alt - targetAltitude) <= 0) {
        // the wanted perigee lies between two burns: bisect to it, then keep the best trade between the burn size and the trip home (150 s of trip per m/s)
        let lo = prev.dv, hi = dv, tlo = prev.t;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2, tm = trial(mid); if (!tm) break; if ((tlo.alt - targetAltitude) * (tm.alt - targetAltitude) <= 0) hi = mid; else { lo = mid; tlo = tm; } }
        const fin = trial(hi);
        // tofTarget (a planned trip time home) or dvTarget (a planned burn size): the closest solution wins; otherwise the trade above
        const score = !fin ? 0 : tofTarget != null ? Math.abs(fin.tof - tofTarget) : dvTarget != null ? Math.abs(hi - dvTarget) : fin.tof + 150 * hi;
        if (fin && Math.abs(fin.alt - targetAltitude) < 5e3 && (!best || score < best.score)) best = { score, dtBurn: dtb, dv: hi, perigeeAltitude: fin.alt, tofSeconds: fin.tof };
      }
      prev = cur ? { dv, t: cur } : null;
    }
  }
  return best;
}

/**
 * Smallest course correction (Earth frame, applied now) that gives the free trajectory (r, v) a perigee at `targetAltitude` above the Earth.
 * Returns {dv: [x,y,z], dvMag, predicted: {altitude}} or null.
 */
export function solveReturnCorrection(r, v, targetAltitude, { maxIter = 25, tolerance = 500 } = {}) {
  const E = EARTH();
  const f = (d) => { const el = elementsFromState(E.mu, r, add(v, d)); return el.rp - E.radius - targetAltitude; };
  let dv = [0, 0, 0], fx = f(dv);
  for (let it = 0; it < maxIter && Math.abs(fx) >= tolerance; it++) {
    const h = 0.05, g = [0, 0, 0];
    for (let i = 0; i < 3; i++) { const d2 = [...dv]; d2[i] += h; g[i] = (f(d2) - fx) / h; }
    const g2 = dot(g, g); if (!(g2 > 0)) return null;
    let step = scale(g, -fx / g2); const sm = len(step); if (sm > 200) step = scale(step, 200 / sm);
    let trial = add(dv, step), ft = f(trial), damp = 1;
    while (Math.abs(ft) > Math.abs(fx) && damp > 1e-3) { damp /= 2; trial = add(dv, scale(step, damp)); ft = f(trial); }
    dv = trial; fx = ft;
  }
  if (Math.abs(fx) >= tolerance * 4) return null;
  return { dv, dvMag: len(dv), predicted: { altitude: targetAltitude + fx } };
}
