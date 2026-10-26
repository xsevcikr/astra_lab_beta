// Guidance laws. Each returns {dir, throttle, ignite, info}:
//   dir      - desired body +X axis direction (inertial unit vector) or null (hold/no command)
//   throttle - commanded throttle override (or null to leave engines alone)
//   ignite   - true if guidance requests the engines in `params.group` to be lit
import { add, sub, scale, dot, cross, len, norm, madd, clamp, projectOnPlane } from './vec.js';
import { localFrame } from './bodies.js';
import { DEG } from './constants.js';

/** Launch azimuth (rad from north, clockwise) for a target inclination, corrected for planetary rotation. */
export function launchAzimuth(latRad, incRad, vOrbit, vRot) {
  const c = Math.cos(incRad) / Math.max(Math.cos(latRad), 1e-9);
  if (Math.abs(c) > 1) return incRad < latRad ? Math.PI / 2 : Math.PI / 2; // unreachable inclination: due east
  const azInertial = Math.asin(c);
  const vx = vOrbit * Math.sin(azInertial) - vRot, vy = vOrbit * Math.cos(azInertial);
  return Math.atan2(vx, vy);
}

export function initGuidanceState(mode, params = {}) {
  return { mode, params: { ...params }, phase: null, tStart: null, captured: null, memo: {} };
}

function horizontalDir(fr, azRad) {
  const s = Math.sin(azRad), c = Math.cos(azRad);
  return norm([fr.north[0] * c + fr.east[0] * s, fr.north[1] * c + fr.east[1] * s, fr.north[2] * c + fr.east[2] * s]);
}

/**
 * @param g   guidance state {mode, params, phase, tStart, captured}
 * @param c   context: {t, r, v, vAir, alt, q, primary, mu, radius, dirBody (current +X), sunDir, earthDir, mass, thrustMax, thrustNow, minThrottle,
 *                     radarAlt, vRel (surface-relative velocity), gLocal, rho, qdyn, tPrimary}
 */
export function guidanceStep(g, c) {
  if (g.tStart == null) g.tStart = c.t;
  const p = g.params || {};
  const fr = localFrame(c.r);
  const up = fr.up;
  const tm = c.t - g.tStart;
  switch (g.mode) {
    case 'none': case 'free': return { dir: null, throttle: null };
    case 'hold': { if (!g.captured) g.captured = [...c.dirBody]; return { dir: g.captured, throttle: null }; }
    case 'inertial': { const d = p.vector ? norm(p.vector) : (g.captured ??= [...c.dirBody]); return { dir: d, throttle: null }; }
    case 'up': return { dir: up, throttle: null };
    case 'nadir': return { dir: scale(up, -1), throttle: null };
    case 'prograde': return { dir: norm(c.v), throttle: null };
    case 'retrograde': return { dir: scale(norm(c.v), -1), throttle: null };
    case 'normal': { const h = norm(cross(c.r, c.v)); return { dir: h, throttle: null }; }
    case 'antinormal': { const h = norm(cross(c.r, c.v)); return { dir: scale(h, -1), throttle: null }; }
    case 'radial_out': return { dir: norm(projectOnPlane(up, norm(c.v))), throttle: null };
    case 'radial_in': return { dir: scale(norm(projectOnPlane(up, norm(c.v))), -1), throttle: null };
    case 'surface_prograde': return { dir: len(c.vAir) > 1 ? norm(c.vAir) : up, throttle: null };
    case 'surface_retrograde': return { dir: len(c.vAir) > 1 ? scale(norm(c.vAir), -1) : up, throttle: null };
    case 'match_target': { // thrust along the velocity difference to the companion ship: removes the relative motion
      if (!c.target) return { dir: null, throttle: null };
      const dv = sub(c.target.v, c.v); return { dir: len(dv) > 1e-6 ? norm(dv) : (g.captured ??= [...c.dirBody]), throttle: null };
    }
    case 'sun_point': return { dir: c.sunDir, throttle: null };
    case 'earth_point': return { dir: c.earthDir ?? c.sunDir, throttle: null };
    case 'entry': { // heat shield (aft face) forward -> body +X points opposite to the airflow velocity
      return { dir: len(c.vAir) > 1 ? scale(norm(c.vAir), -1) : scale(up, -1), throttle: null };
    }
    case 'lifting_entry': return liftingEntry(g, c, up);
    case 'pitch_program': {
      const tbl = p.table || [[0, 90]];
      let pitch = tbl[tbl.length - 1][1];
      for (let i = 1; i < tbl.length; i++) if (tm <= tbl[i][0]) { const f = (tm - tbl[i - 1][0]) / Math.max(tbl[i][0] - tbl[i - 1][0], 1e-9); pitch = tbl[i - 1][1] + f * (tbl[i][1] - tbl[i - 1][1]); break; }
      const hz = horizontalDir(fr, (p.azimuth ?? 90) * DEG);
      const pr = pitch * DEG;
      return { dir: norm(add(scale(up, Math.sin(pr)), scale(hz, Math.cos(pr)))), throttle: null };
    }
    case 'ascent': return ascent(g, c, fr, tm);
    case 'insertion': return insertion(g, c, fr);
    case 'land': return landing(g, c, fr);
    default: return { dir: null, throttle: null };
  }
}

// ---------------- lifting entry (Apollo-style): heat shield forward, the capsule's lift steered by rolling about the airflow ----------------
// Bank 0 = lift pointing up (stretches the descent), 90 = sideways, 180 = lift pointing down (digs in). The law holds the deceleration near
// params.gTarget (default 4 g) with a feed-forward term that balances gravity against the centrifugal force, so the capsule neither skips back
// out nor dives into thick air. Below params.liftOffSpeed the lift is ignored (the chutes take over).
function liftingEntry(g, c, up) {
  const p = g.params || {};
  const m = g.memo;
  const vAirLen = len(c.vAir);
  const dir = vAirLen > 1 ? scale(c.vAir, -1 / vAirLen) : scale(up, -1);
  const speed = vAirLen;
  const gE = 9.80665, ld = c.liftToDrag > 0 ? c.liftToDrag : (p.liftToDrag ?? 0.34);
  const D = Math.max(c.dragAccel ?? 0, 0);
  const hdot = dot(c.v, up);
  const gTarget = (p.gTarget ?? 4) * gE;
  const sign = p.bankSign ?? 1;
  let cosB = 1;
  if (D > 0.5 * gTarget) m.captured = true;
  if (!m.captured) cosB = 1;                                                   // thin air and the first pull-out: lift up (this is what keeps the capsule from diving)
  else {
    const centrifugal = (speed * speed) / Math.max(c.radius + c.alt, 1) - c.gLocal;       // net upward acceleration needed to stop sinking... >0 means flying "light"
    const ff = -centrifugal / Math.max(ld * D, 1e-3);                                      // fraction of the lift that must point up to hold altitude
    const fb = (D - gTarget) / gE * 0.35 + (hdot < -(p.sinkLimit ?? 250) ? 0.5 : 0) + (hdot > 60 && speed > 3000 ? -0.5 : 0);
    cosB = clamp(Math.max(ff, 0) + fb, -1, 1);   // above orbital speed the capsule is already 'light': it never needs lift down just to hold altitude
  }
  if (speed < (p.liftOffSpeed ?? 600)) cosB = 1;
  const bank = Math.acos(cosB) * sign;
  return { dir, throttle: null, bank, info: { bank: bank / DEG, dragG: D / gE } };
}

// ---------------- ascent: vertical rise -> pitch kick -> gravity turn -> (optional) closed-loop insertion ----------------
function ascent(g, c, fr, tm) {
  const p = g.params;
  const az = (p.azimuth ?? 90) * DEG;
  const hz = horizontalDir(fr, az);
  const up = fr.up;
  g.phase ??= 'vertical';
  const kickAlt = p.kickAlt ?? 200, kickAngle = (p.kickAngle ?? 4) * DEG, kickTime = p.kickTime ?? 6, kickHold = p.kickHold ?? 2;
  const speedAir = len(c.vAir);
  if (g.phase === 'vertical' && c.alt >= kickAlt && speedAir >= (p.kickSpeed ?? 35)) { g.phase = 'kick'; g.memo.tKick = c.t; }
  if (g.phase === 'kick' && c.t - g.memo.tKick > kickTime + kickHold) g.phase = 'turn';
  if (g.phase === 'turn' && p.closedLoop && c.alt >= (p.insertionAlt ?? 60000) && c.qdyn < (p.qSwitch ?? 1500)) g.phase = 'insertion';
  // ---- flight-path-angle schedule (pitch programme against altitude with load relief) ----
  if (p.schedule) {
    if (g.phase === 'vertical' && c.alt >= kickAlt && speedAir >= (p.kickSpeed ?? 35)) g.phase = 'fpa';
    if (g.phase === 'kick' || g.phase === 'turn') g.phase = 'fpa';
    if (g.phase === 'vertical') return { dir: up, throttle: null, info: { phase: g.phase } };
    const S = p.schedule;
    const hF = S.hF ?? 150000, n = S.n ?? 0.45, gEnd = (S.gammaEnd ?? 2) * DEG;
    const x = clamp((c.alt - kickAlt) / Math.max(hF - kickAlt, 1), 0, 1);
    const gam = gEnd + (Math.PI / 2 - gEnd) * (1 - Math.pow(x, n));
    // reference velocity: relative wind in the atmosphere, orbital velocity above it
    const wI = clamp((c.qdyn - 100) / 1400, 0, 1); // 1 in the dense atmosphere
    const vA = len(c.vAir) > 5 ? norm(c.vAir) : up;
    const vO = len(c.v) > 5 ? norm(c.v) : up;
    const vref = norm(add(scale(vA, wI), scale(vO, 1 - wI)));
    const vr = dot(c.v, up), vh = sub(c.v, scale(up, vr));
    const hdir = len(vh) > 30 ? norm(vh) : hz;
    // keep the launch azimuth: horizontal direction is a blend, heavily biased to azimuth at low speed
    const hd = len(vh) > 200 ? hdir : hz;
    const desired = norm(add(scale(up, Math.sin(gam)), scale(hd, Math.cos(gam))));
    const alphaMax = clamp((S.qAlpha ?? 900) / Math.max(c.qdyn, 1), 0.5 * DEG, 60 * DEG);
    const ang = Math.acos(clamp(dot(desired, vref), -1, 1));
    let dir = desired;
    if (ang > alphaMax) {
      const k = alphaMax / ang;
      // spherical interpolation from vref toward desired by fraction k
      const sinA = Math.sin(ang);
      dir = norm(add(scale(vref, Math.sin((1 - k) * ang) / sinA), scale(desired, Math.sin(k * ang) / sinA)));
    }
    return { dir, throttle: null, info: { phase: g.phase, gamma: gam / DEG, alphaMax: alphaMax / DEG } };
  }
  if (g.phase === 'vertical') return { dir: up, throttle: null, info: { phase: g.phase } };
  if (g.phase === 'kick') {
    const f = clamp((c.t - g.memo.tKick) / kickTime, 0, 1);
    const tilt = kickAngle * f;
    return { dir: norm(add(scale(up, Math.cos(tilt)), scale(hz, Math.sin(tilt)))), throttle: null, info: { phase: g.phase, tilt } };
  }
  if (g.phase === 'turn') {
    // zero-lift gravity turn: follow surface-relative velocity in the atmosphere, orbit-relative velocity above it
    const useInertial = c.qdyn < (p.qInertial ?? 300) && c.alt > 40000;
    const vel = useInertial ? c.v : c.vAir;
    let dir = len(vel) > 5 ? norm(vel) : up;
    // optional pitch bias above the velocity vector (raises/lowers apoapsis without a separate program)
    if (p.pitchBias) {
      const side = norm(projectOnPlane(up, dir));
      const b = p.pitchBias * DEG;
      dir = norm(add(scale(dir, Math.cos(b)), scale(side, Math.sin(b))));
    }
    return { dir, throttle: null, info: { phase: g.phase } };
  }
  return insertion(g, c, fr);
}

// ---------------- closed-loop altitude-hold insertion steering ----------------
function insertion(g, c, fr) {
  const p = g.params;
  const rT = c.radius + (p.targetAlt ?? 200000);
  const r = len(c.r), up = fr.up;
  const vr = dot(c.v, up);
  const vh = sub(c.v, scale(up, vr));
  const vt = len(vh);
  const hdir = vt > 50 ? norm(vh) : horizontalDir(fr, (p.azimuth ?? 90) * DEG);
  const aT = Math.max(c.thrustAccel ?? 1, 0.1);
  const tauH = p.tauH ?? 60, tauV = p.tauV ?? 20;
  const vrDes = clamp((rT - r) / tauH, -50, p.vrMax ?? 400);
  const aRadial = (vrDes - vr) / tauV + c.mu / (r * r) - (vt * vt) / r;
  const sinPhi = clamp(aRadial / aT, p.minSinPitch ?? -0.12, 0.98);
  let phi = Math.asin(sinPhi);
  if (p.holdUntilAccel != null) {
    // opt-in (Apollo S-IVB restarts): while the engine is still spooling up the thrust estimate is meaningless, so hold the last pitch
    // (first time: the flight-path angle); afterwards the commanded pitch may change at most `pitchRate` deg/s, so a mode switch never asks for a sudden attitude step
    const lit = (c.thrustAccel ?? 0) > p.holdUntilAccel;
    const dt = g.lastT === undefined ? 0 : Math.max(0, c.t - g.lastT); g.lastT = c.t;
    if (g.lastPhi === undefined) g.lastPhi = Math.atan2(vr, Math.max(vt, 1));
    if (lit) { const lim = (p.pitchRate ?? 90) * DEG * dt; g.lastPhi += clamp(phi - g.lastPhi, -lim, lim); }
    phi = g.lastPhi;
  }
  return { dir: norm(add(scale(up, Math.sin(phi)), scale(hdir, Math.cos(phi)))), throttle: null, info: { phase: 'insertion', pitch: phi / DEG, vrDes } };
}

// ---------------- powered descent / landing ----------------
// Two-phase landing guidance.
//  1. Braking (explicit polynomial guidance, the structure used in Apollo-era "E-guidance"): the commanded acceleration is linear in
//     time, a(t) = a0 + a1 t, chosen so that position and velocity reach the descent gate (a point above the target, small
//     downward speed) at time-to-go T:      a0 = 6 (r_T - r)/T^2 - (4 v + 2 v_T)/T - g
//     T is re-solved every step so that |a0| stays at a fixed fraction of the available thrust acceleration. The target is
//     a surface point (from the terrain map) chosen at arming time in the orbit plane, downrange of periapsis.
//  2. Terminal descent: vertical velocity profile v_t(h) = -(v_f + sqrt(2 a_dec (h - h0))) with horizontal velocity cancelled.
// Ignition happens when the required thrust acceleration reaches the usable thrust. Every quantity comes from simulated state.
function poly(rT, vT, r, v, gVec, T) {
  const inv = 1 / T;
  return [
    (6 * (rT[0] - r[0])) * inv * inv - (4 * v[0] + 2 * vT[0]) * inv - gVec[0],
    (6 * (rT[1] - r[1])) * inv * inv - (4 * v[1] + 2 * vT[1]) * inv - gVec[1],
    (6 * (rT[2] - r[2])) * inv * inv - (4 * v[2] + 2 * vT[2]) * inv - gVec[2],
  ];
}
function targetAt(g, c, T) {
  const m = g.memo;
  const pos = c.surfacePoint(m.tLat, m.tLon, c.t + T, m.gateAlt + m.tTerrain);
  return pos;
}
function landing(g, c, fr) {
  const p = g.params;
  const up = fr.up;
  g.phase ??= 'coast';
  const m = g.memo;
  const vRel = c.vRel;
  const vUp = dot(vRel, up);
  const vH = sub(vRel, scale(up, vUp));
  const vHm = len(vH);
  const h = Math.max(c.radarAlt, 0);
  const gL = c.gLocal;
  const aMax = Math.max(c.thrustMax / Math.max(c.mass, 1), 1e-6);
  const fracUse = p.safetyMargin ?? 0.85;
  const aUse = aMax * fracUse;
  const vFinal = p.touchdownSpeed ?? 1.0, h0 = p.finalHeight ?? 1.5;
  // keep a thrust reserve (engine spool-up, throttle floor, attitude losses): plan deceleration with 60% of max thrust
  const aDec = Math.max(0.6 * aMax - gL, 0.05 + 0.1 * gL);
  const vTarget = -(vFinal + Math.sqrt(2 * aDec * Math.max(h - h0, 0)));
  const gateAlt = p.gateAlt ?? 120;
  // ---- choose the landing target once ----
  if (!m.init) {
    m.init = true;
    const rm = len(c.r), hVec = cross(c.r, c.v), hh = norm(hVec);
    // periapsis of the current orbit (eccentricity vector): the braking phase is centred just after it
    const eVec = sub(scale(c.r, dot(c.v, c.v) / c.mu - 1 / rm), scale(c.v, dot(c.r, c.v) / c.mu));
    const ecc = len(eVec);
    const aOrb = 1 / (2 / rm - dot(c.v, c.v) / c.mu);
    const rp = aOrb * (1 - ecc);
    const usePeri = ecc > 1e-4 && rp > c.radius + 500 && rp < rm * 1.001;
    const ePos = usePeri ? norm(eVec) : norm(c.r);
    const vPeri = usePeri ? len(hVec) / rp : len(c.vRel);
    const aEff = Math.max(aUse * 0.55 - gL * 0.15, 0.2 * aUse);
    const range = p.range ?? ((vPeri * vPeri) / (2 * aEff) * 1.08 + 20000);
    const th = range / c.radius;
    const fwd = norm(cross(hh, ePos));                 // in-plane direction of travel at periapsis
    const rDir = norm(add(scale(ePos, Math.cos(th)), scale(fwd, Math.sin(th))));
    const ll = c.latLon(scale(rDir, c.radius), c.t);
    m.tLat = p.lat != null ? p.lat * DEG : ll.lat;
    m.tLon = p.lon != null ? p.lon * DEG : ll.lon;
    m.tTerrain = c.terrainAt(m.tLat, m.tLon);
    m.gateAlt = gateAlt;
    m.rangePlanned = range;
  }
  let dir, throttle = null;
  if (g.phase === 'coast' || g.phase === 'brake') {
    const gAt = (rr) => { const d = len(rr); return scale(rr, -c.mu / (d * d * d)); };
    const gVec = (T) => scale(add(gAt(c.r), gAt(targetAt(g, c, T))), 0.5);   // mean of the gravity at the two ends of the arc
    const vT = (T) => add(corotationApprox(c, targetAt(g, c, T)), scale(norm(targetAt(g, c, T)), -(p.gateSpeed ?? 4)));
    // commanded acceleration at the start (a0) and at the end (aT) of the arc; |a(t)| is convex, so the peak is at one of the ends
    const accelPair = (T) => {
      const rT = targetAt(g, c, T), vTt = vT(T), gv = gVec(T);
      const a0 = poly(rT, vTt, c.r, c.v, gv, T);
      const net0 = add(a0, gv);
      const a1 = scale(sub(sub(vTt, c.v), scale(net0, T)), 2 / (T * T));
      const aT = add(a0, scale(a1, T));
      return [a0, aT];
    };
    const accelFor = (T) => accelPair(T)[0];
    const peakFor = (T) => { const [a0, aT] = accelPair(T); return Math.max(len(a0), len(aT)); };
    // scan time-to-go for the minimum required peak acceleration
    let bestT = 0, bestF = Infinity;
    const Ts = [];
    // plausible braking times only: up to ~1.6x the time needed to remove the current speed with the usable thrust
    const Tmax = Math.max(60, 1.6 * len(c.vRel) / Math.max(aUse - 0.5 * gL, 0.3 * aUse));
    for (let T = 8; T < Tmax; T *= 1.1) Ts.push(T);
    Ts.push(Tmax);
    for (const T of Ts) { const f = peakFor(T); if (f < bestF) { bestF = f; bestT = T; } }
    if (g.phase === 'coast') {
      // only consider ignition when the target is within ~70 degrees of arc (guidance model validity), and only after the target
      // has become reachable with the usable thrust (peak requirement below the limit); ignite when the requirement climbs back to it
      const arc = Math.acos(clamp(dot(norm(c.r), norm(targetAt(g, c, 0))), -1, 1));
      m.dbg = { bestF, bestT, arc: arc / DEG, aUse, armed: !!m.armed };
      if (arc < 70 * DEG && bestF < 0.92 * aUse) m.armed = true;
      // point the engine where the burn will start so that ignition needs no large slew
      const pre = accelFor(bestT);
      dir = m.armed && len(pre) > 1e-3 ? norm(pre) : scale(norm(vRel), -1);
      if (m.armed && bestF >= aUse) { g.phase = 'brake'; m.tIgn = c.t; }
      if (h < 3000 && vUp < 0) g.phase = 'brake';
    }
    if (g.phase === 'brake') {
      // T such that |a0| = aUse on the short-T branch of the curve (largest usable thrust), saturating at the minimum
      let T = bestT;
      if (bestF < aUse) {
        let lo = 4, hi = bestT;
        for (let it = 0; it < 30; it++) { const mid = 0.5 * (lo + hi); if (peakFor(mid) > aUse) lo = mid; else hi = mid; }
        T = hi;
      }
      const a = accelFor(T);
      m.Tgo = T;
      dir = norm(a);
      throttle = clamp((len(a) * c.mass) / Math.max(c.thrustMax, 1e-6), c.minThrottle ?? 0, 1);
      // gate reached: terminal descent
      const gateDist = len(sub(c.r, targetAt(g, c, 0)));
      if (T < 6 || (h < gateAlt + 60 && vUp < 5) || gateDist < 60) { g.phase = 'terminal'; m.tTerm = c.t; }
    }
  }
  if (g.phase === 'terminal') {
    const tauV = p.tauV ?? 1.0, tauH = p.tauH ?? 5;
    const A = aMax;
    // feedforward of the planned deceleration on the constant-decel velocity profile + proportional correction
    const ff = h > h0 ? aDec : 0;
    const az = clamp(gL + ff + (vTarget - vUp) / tauV, 0, A);
    const ahMax = Math.sqrt(Math.max(A * A - az * az, 0));
    const tgoV = h / Math.max(-vUp, 2);
    const ah = vHm > 1e-6 ? Math.min(vHm / Math.max(Math.min(tauH, 0.5 * tgoV), 0.8), ahMax) : 0;
    const aVec = add(scale(up, az), vHm > 1e-6 ? scale(vH, -ah / vHm) : [0, 0, 0]);
    let d = norm(aVec);
    if (h < (p.tiltLimitAlt ?? 150)) {
      const maxTilt = (p.maxTilt ?? 30) * DEG;
      const ang = Math.acos(clamp(dot(d, up), -1, 1));
      if (ang > maxTilt) d = norm(add(scale(up, Math.cos(maxTilt)), scale(norm(projectOnPlane(d, up)), Math.sin(maxTilt))));
    }
    dir = d;
    throttle = clamp((len(aVec) * c.mass) / Math.max(c.thrustMax, 1e-6), c.minThrottle ?? 0, 1);
  }
  // the commanded thrust direction may swing at most `slewRate` deg/s (a lander cannot flip from the braking attitude to upright in an instant)
  if (dir && g.phase !== 'coast') {
    const prev = m.slew;
    if (prev) {
      const dt = Math.max(0, c.t - prev.t), lim = (p.slewRate ?? 20) * DEG * dt;
      const ang = Math.acos(clamp(dot(prev.dir, dir), -1, 1));
      if (ang > lim && ang > 1e-9) { const f = lim / ang; dir = norm(add(scale(prev.dir, 1 - f), scale(dir, f))); }
    }
    m.slew = { dir, t: c.t };
  } else if (dir) m.slew = { dir, t: c.t };
  return { dir, throttle, ignite: g.phase !== 'coast', info: { phase: g.phase, vTarget, vUp, h, Tgo: m.Tgo, range: m.rangePlanned } };
}
/** Inertial velocity of the co-rotating surface at position rT (used as the velocity target). */
function corotationApprox(c, rT) { return [-c.omega * rT[1], c.omega * rT[0], 0]; }
