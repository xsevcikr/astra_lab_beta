// Flight control and navigation loop (2.9, settings.gnc).
//
// Without this switch the attitude controller is an ideal continuous PD law evaluated inside the integrator with perfect knowledge of
// the attitude and an engine that swivels instantly. With settings.gnc the loop is closer to a real flight computer:
//   NAVIGATION  the IMU attitude estimate drifts with a gyro bias (deterministic from the seed, size from the avionics' pointing
//               accuracy, capped at that accuracy as if a star tracker / alignment update held it), plus white rate noise.
//   CONTROL     discrete PID at settings.gncRate Hz (zero-order hold between samples): proportional + derivative gains are the
//               simulator's gain-scheduled ones (attitude bandwidth, q-scheduled against the aerodynamic instability); an integral term
//               (Ki = 0.1 bw Kp) removes steady offsets (thrust misalignment, a steady aerodynamic moment, slosh); anti-windup clamps
//               the integrator and freezes it while the engine is on its gimbal stop.
//   ACTUATOR    the engine gimbal is a first-order servo (time constant settings.gncActuatorTau) with a rate limit
//               (settings.gncGimbalRate deg/s) and the engine's position limit. RCS/reaction wheels make up the rest within their authority.
//   MARGINS     classical gain and phase margins of the pitch loop (rigid body + aerodynamics + actuator lag + sample delay),
//               computed through the flight; NASA practice asks for at least 6 dB and 30 deg.
// Not modelled: navigation of position and velocity (guidance still reads the true state), bending filters, sensor failures.
import { clamp, qRotate, qConj } from './vec.js';

const DEG = Math.PI / 180;
function makeRng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export const GNC_DEFAULTS = { gncRate: 50, gncActuatorTau: 0.04, gncGimbalRate: 20, gncSeed: 3 };

// ---- complex helpers for the frequency response ----
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

/**
 * Open-loop frequency response of the pitch loop at w [rad/s].
 * Plant:   theta / u = 1 / (s^2 + c s - mA)       (u = control torque per unit inertia; mA = M_alpha / I, > 0 unstable; c = pitch damping / I)
 * PID:     Kp + Kd s + Ki / s;  actuator 1 / (tau s + 1);  delay e^(-s Td) (sample-and-hold = half a sample + one sample of computation)
 */
export function pitchLoopResponse(w, { Kp, Kd, Ki = 0, mA = 0, c = 0, tau = 0, Td = 0 }) {
  const C = [Kp, Kd * w - (Ki ? Ki / w : 0)];
  const A = cdiv([1, 0], [1, tau * w]);
  const D = [Math.cos(-w * Td), Math.sin(-w * Td)];
  const P = cdiv([1, 0], [-w * w - mA, c * w]);
  return cmul(cmul(C, A), cmul(D, P));
}

/** Gain margin (dB, upper), low-frequency gain margin (dB, negative: how much the gain may DROP), phase margin (deg), crossover (rad/s). */
export function pitchLoopMargins(p) {
  const N = 1500, w0 = 0.01, w1 = 300;
  let prev = null, pm = null, wc = null, gmUp = Infinity, gmLow = -Infinity;
  let phaseOff = 0, lastRaw = null;
  for (let i = 0; i <= N; i++) {
    const w = w0 * Math.pow(w1 / w0, i / N);
    const L = pitchLoopResponse(w, p);
    const mag = Math.hypot(L[0], L[1]);
    let raw = Math.atan2(L[1], L[0]);
    if (lastRaw != null) { const d = raw - lastRaw; if (d > Math.PI) phaseOff -= 2 * Math.PI; else if (d < -Math.PI) phaseOff += 2 * Math.PI; }
    lastRaw = raw;
    const ph = raw + phaseOff;
    if (prev) {
      // gain crossover: |L| passes 1 going down
      if (prev.mag >= 1 && mag < 1 && pm == null) {
        const f = (prev.mag - 1) / (prev.mag - mag), phc = prev.ph + f * (ph - prev.ph);
        let m = (phc / DEG + 180) % 360; if (m > 180) m -= 360; if (m < -180) m += 360;
        pm = m; wc = prev.w + f * (w - prev.w);
      }
      // phase crossover: phase passes -180 (mod 360)
      const k0 = Math.floor((prev.ph + Math.PI) / (2 * Math.PI)), k1 = Math.floor((ph + Math.PI) / (2 * Math.PI));
      if (k0 !== k1) {
        const gm = -20 * Math.log10(Math.max((prev.mag + mag) / 2, 1e-12));
        if (gm >= 0) gmUp = Math.min(gmUp, gm); else gmLow = Math.max(gmLow, gm);
      }
    }
    prev = { w, mag, ph };
  }
  return { phaseMarginDeg: pm, gainMarginDb: gmUp, lowGainMarginDb: gmLow, crossoverRad: wc };
}

export class FlightController {
  constructor(sim) {
    this.sim = sim;
    const S = { ...GNC_DEFAULTS, ...sim.settings };
    this.S = S;
    this.rng = makeRng(S.gncSeed);
    this.iy = 0; this.iz = 0; this.dy = 0; this.dz = 0;
    this.tNext = -Infinity; this.cmd = { tcy: 0, tcz: 0, tcx: 0 };
    // gyro bias direction and size from the best guidance unit on board (pointing accuracy in degrees)
    const acc = Math.max(0.005, Math.min(...sim.fv.presentComponents().filter((c) => c.guidance).map((c) => c.pointingAccuracyDeg ?? 0.5), 0.5)) * DEG;
    this.navCap = acc;
    const ang = this.rng() * 2 * Math.PI;
    this.bias = [Math.cos(ang) * acc / 1800, Math.sin(ang) * acc / 1800];   // rad/s: the estimate drifts to the accuracy limit in about 30 minutes
    this.rateNoise = 0.01 * DEG;
    this.nav = [0, 0];
    this.stats = { minPM: null, minPMt: null, minGM: null, satTime: 0, maxNavErrDeg: 0, rateLimited: 0, samples: 0 };
    this.out = { dy: 0, dz: 0, auxY: 0, auxZ: 0, tx: 0, attErr: 0, sat: false };
    this._marginT = -Infinity;
  }

  /** One flight-computer step at the start of a physics step. Writes ctx.gnc. */
  update(ctx, dt) {
    const sim = this.sim, S = this.S, y = sim.y, out = this.out;
    const q = [y[6], y[7], y[8], y[9]], w = [y[10], y[11], y[12]];
    // navigation error: drifts with the gyro bias while flying, capped at the unit's accuracy
    if (!sim.onGround) {
      this.nav[0] = clamp(this.nav[0] + this.bias[0] * dt, -this.navCap, this.navCap);
      this.nav[1] = clamp(this.nav[1] + this.bias[1] * dt, -this.navCap, this.navCap);
    }
    this.stats.maxNavErrDeg = Math.max(this.stats.maxNavErrDeg, Math.hypot(this.nav[0], this.nav[1]) / DEG);
    const Tg = Math.max(ctx.TgVac - (sim.tmpOut?.pAmb ?? 0) / 101325 * ctx.TgLoss, 0);
    const gimbalMax = Math.asin(clamp(ctx.sinGimbal, 0, 1));
    const canGimbal = Tg > 1 && ctx.dxg < -1e-3 && !!ctx.controlDir;
    if (!ctx.controlDir) {
      this.iy = this.iz = 0; this.cmd = { tcy: 0, tcz: 0, tcx: 0 };
    } else if (sim.t >= this.tNext - 1e-9) {
      this.tNext = sim.t + 1 / S.gncRate; this.stats.samples++;
      const cb = qRotate(qConj(q), ctx.controlDir);
      cb[1] += (ctx.sensY ?? 0) + this.nav[1]; cb[2] += (ctx.sensZ ?? 0) - this.nav[0];   // bent structure + IMU drift: the measured direction is a little wrong
      const cx = clamp(cb[0], -1, 1), th = Math.acos(cx), sn = Math.hypot(cb[1], cb[2]);
      let ey = 0, ez = 0;
      if (sn > 1e-9) { const k = Math.min(th, 0.9) / sn; ey = -cb[2] * k; ez = cb[1] * k; } else if (cx < 0) ey = 0.9;
      out.attErr = th;
      const wm = [w[0] + gauss(this.rng) * this.rateNoise, w[1] + gauss(this.rng) * this.rateNoise, w[2] + gauss(this.rng) * this.rateNoise];
      const Kp = ctx.Kp, Kd = ctx.Kd, Ki = 0.1 * S.attitudeBandwidth * Kp, Ts = 1 / S.gncRate;
      if (!out.sat) { this.iy = clamp(this.iy + ey * Ts, -0.2, 0.2); this.iz = clamp(this.iz + ez * Ts, -0.2, 0.2); }   // anti-windup
      this.cmd = {
        tcy: ctx.Ilat * (Kp * ey + Ki * this.iy - Kd * wm[1]),
        tcz: ctx.Ilat * (Kp * ez + Ki * this.iz - Kd * wm[2]),
        tcx: -ctx.Iax * Kd * 0.5 * wm[0],
      };
    }
    // gimbal servo: first-order lag with a rate limit and the position stop
    let dyc = 0, dzc = 0;
    if (canGimbal) {
      const Ty = this.cmd.tcz / ctx.dxg, Tz = -this.cmd.tcy / ctx.dxg;
      dyc = Math.asin(clamp(Ty / Tg, -1, 1)); dzc = Math.asin(clamp(Tz / Tg, -1, 1));
      const mag = Math.hypot(dyc, dzc);
      out.sat = mag > gimbalMax;
      if (out.sat) { dyc *= gimbalMax / mag; dzc *= gimbalMax / mag; this.stats.satTime += dt; }
    } else out.sat = false;
    const tau = Math.max(S.gncActuatorTau, 1e-4), k = 1 - Math.exp(-dt / tau), rl = S.gncGimbalRate * DEG * dt;
    let sy = (dyc - this.dy) * k, sz = (dzc - this.dz) * k;
    if (Math.abs(sy) > rl || Math.abs(sz) > rl) this.stats.rateLimited += dt;
    sy = clamp(sy, -rl, rl); sz = clamp(sz, -rl, rl);
    this.dy += sy; this.dz += sz;
    // what the gimbal delivers; RCS / wheels add the rest within their authority
    const tgY = canGimbal ? -ctx.dxg * Tg * Math.sin(this.dz) : 0, tgZ = canGimbal ? ctx.dxg * Tg * Math.sin(this.dy) : 0;
    let remY = this.cmd.tcy - tgY, remZ = this.cmd.tcz - tgZ;
    const auth = ctx.auxAuthority, mg = Math.hypot(remY, remZ);
    if (mg > auth) { const s = auth / Math.max(mg, 1e-12); remY *= s; remZ *= s; }
    if (!ctx.controlDir) { remY = 0; remZ = 0; }
    out.lag = Math.hypot(dyc - this.dy, dzc - this.dz);
    out.dy = this.dy; out.dz = this.dz; out.auxY = remY; out.auxZ = remZ; out.tx = this.cmd.tcx;
    ctx.gnc = out;
    // margins of the pitch loop about once a second in the air
    if (ctx.controlDir && sim.t - this._marginT >= 1 && (sim.now?.q ?? 0) > 100) { this._marginT = sim.t; this.margins(ctx); }
    return out;
  }

  /** linear pitch-loop margins for the vehicle as it flies now */
  margins(ctx) {
    const sim = this.sim, g = sim.geom, n = sim.now;
    const arm = g ? g.xcp - ctx.cg : 0, rho = n.rho ?? 0, V = n.surfSpeed ?? 0;
    const mA = g ? (n.q * g.Sref * g.cnAlpha * arm) / Math.max(ctx.Ilat, 1e-3) : 0;
    const c = g ? (0.5 * rho * V * g.Sref * g.cnAlpha * arm * arm) / Math.max(ctx.Ilat, 1e-3) : 0;
    const Ki = 0.1 * this.S.attitudeBandwidth * ctx.Kp, Ts = 1 / this.S.gncRate;
    const m = pitchLoopMargins({ Kp: ctx.Kp, Kd: ctx.Kd, Ki, mA, c, tau: this.S.gncActuatorTau, Td: 1.5 * Ts });
    const st = this.stats;
    if (m.phaseMarginDeg != null && (st.minPM == null || m.phaseMarginDeg < st.minPM)) { st.minPM = m.phaseMarginDeg; st.minPMt = sim.t; st.minPMq = n.q; }
    if (Number.isFinite(m.gainMarginDb) && (st.minGM == null || m.gainMarginDb < st.minGM)) st.minGM = m.gainMarginDb;
    if (m.phaseMarginDeg != null && m.phaseMarginDeg < 30 && !this._warnedPM) { this._warnedPM = true; sim.warn('GNC_MARGIN', `Pitch-loop phase margin ${m.phaseMarginDeg.toFixed(0)}° at T+${sim.t.toFixed(0)} s (q ${(n.q / 1000).toFixed(1)} kPa) is below the usual 30° requirement.`, { t: sim.t }); }
    this.lastMargins = m;
    return m;
  }

  summary() { const s = this.stats; return { minPhaseMarginDeg: s.minPM, minPhaseMarginT: s.minPMt, minGainMarginDb: s.minGM, gimbalSaturatedS: s.satTime, rateLimitedS: s.rateLimited, maxNavErrorDeg: s.maxNavErrDeg, samples: s.samples }; }
}
