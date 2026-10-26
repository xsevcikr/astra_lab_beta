// Control system designer: PID family controllers, plant models, step-response metrics and linear analysis
// (closed-loop poles, gain/phase margin). Plant dynamics are integrated numerically: PHYSICS of the chosen
// linear plant. Real vehicles add nonlinearity, flexibility and sloshing that these plants omit.
import { makeRng } from '../core/rng.js';

export class PID {
  constructor({ kp = 1, ki = 0, kd = 0, outMin = -Infinity, outMax = Infinity, derivFilter = 0.01, antiWindup = true, rateMode = false } = {}) {
    Object.assign(this, { kp, ki, kd, outMin, outMax, derivFilter, antiWindup, rateMode });
    this.reset();
  }
  reset() { this.integral = 0; this.prevMeas = null; this.dTerm = 0; }
  get type() { return ['P', this.ki ? 'I' : '', this.kd ? 'D' : ''].join('') || 'P'; }
  // derivative on measurement avoids derivative kick on setpoint steps
  update(setpoint, measured, dt, measuredRate = null) {
    const e = setpoint - measured;
    let d = 0;
    if (this.kd) {
      const raw = measuredRate !== null ? -measuredRate : this.prevMeas === null ? 0 : -(measured - this.prevMeas) / dt;
      const a = dt / (this.derivFilter + dt);
      this.dTerm += a * (raw - this.dTerm);
      d = this.kd * this.dTerm;
    }
    this.prevMeas = measured;
    const unsat = this.kp * e + this.ki * this.integral + d;
    const out = Math.max(this.outMin, Math.min(this.outMax, unsat));
    // conditional integration anti-windup: stop integrating while saturated in the same direction
    if (!this.antiWindup || out === unsat || Math.sign(e) !== Math.sign(unsat)) this.integral += e * dt;
    return { out, p: this.kp * e, i: this.ki * this.integral, d, error: e, saturated: out !== unsat };
  }
}

// Plants as state-space-ish step functions plus a transfer function (num/den, descending powers of s).
export const PLANTS = {
  'first-order': (p = {}) => { const K = p.gain ?? 1, tau = p.tau ?? 1; return { name: 'First order (thermal, motor speed)', order: 1, num: [K], den: [tau, 1], x: [0], deriv: (x, u) => [(K * u - x[0]) / tau], y: (x) => x[0], rate: (x, u) => (K * u - x[0]) / tau }; },
  'second-order': (p = {}) => { const K = p.gain ?? 1, wn = p.wn ?? 2, z = p.zeta ?? 0.2; return { name: 'Damped oscillator (structural mode, servo)', order: 2, num: [K * wn * wn], den: [1, 2 * z * wn, wn * wn], x: [0, 0], deriv: (x, u) => [x[1], K * wn * wn * u - 2 * z * wn * x[1] - wn * wn * x[0]], y: (x) => x[0], rate: (x) => x[1] }; },
  'double-integrator': (p = {}) => { const I = p.inertia ?? 1; return { name: 'Rigid-body attitude (torque -> angle)', order: 2, num: [1 / I], den: [1, 0, 0], x: [0, 0], deriv: (x, u) => [x[1], u / I], y: (x) => x[0], rate: (x) => x[1] }; },
  'rate': (p = {}) => { const I = p.inertia ?? 1; return { name: 'Rigid-body rate (torque -> angular rate)', order: 1, num: [1 / I], den: [1, 0], x: [0], deriv: (x, u) => [u / I], y: (x) => x[0], rate: (x, u) => u / I }; },
  'position': (p = {}) => { const m = p.mass ?? 1000, c = p.damping ?? 0; return { name: 'Translational position (force -> position)', order: 2, num: [1 / m], den: [1, c / m, 0], x: [0, 0], deriv: (x, u) => [x[1], (u - c * x[1]) / m], y: (x) => x[0], rate: (x) => x[1] }; },
};

// Closed-loop step response with optional actuator limits, sensor noise, delay and disturbance.
export function stepResponse({ controller, plant, setpoint = 1, duration = 20, dt = 0.001, actuatorLimit = Infinity, noiseSd = 0, delay = 0, disturbance = 0, disturbanceAt = Infinity, seed = 3, sampleEvery = 0.02 }) {
  const pid = controller instanceof PID ? controller : new PID({ ...controller, outMin: -actuatorLimit, outMax: actuatorLimit });
  pid.reset();
  const rng = makeRng(seed);
  const x = [...plant.x];
  const n = Math.round(duration / dt);
  const delaySteps = Math.round(delay / dt);
  const uBuf = new Array(delaySteps + 1).fill(0);
  const out = { t: [], setpoint: [], actual: [], error: [], output: [], p: [], i: [], d: [] };
  let next = 0, saturatedTime = 0;
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    const yMeas = plant.y(x) + (noiseSd ? rng.normal(0, noiseSd) : 0);
    const c = pid.update(setpoint, yMeas, dt);
    if (c.saturated) saturatedTime += dt;
    uBuf.push(c.out); const u = uBuf.shift();
    const dist = t >= disturbanceAt ? disturbance : 0;
    // RK4 on the plant
    const f = (xx) => plant.deriv(xx, u + dist);
    const k1 = f(x), k2 = f(x.map((v, i) => v + 0.5 * dt * k1[i])), k3 = f(x.map((v, i) => v + 0.5 * dt * k2[i])), k4 = f(x.map((v, i) => v + dt * k3[i]));
    for (let i = 0; i < x.length; i++) x[i] += dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    if (t >= next - 1e-12) {
      next += sampleEvery;
      out.t.push(t); out.setpoint.push(setpoint); out.actual.push(plant.y(x)); out.error.push(setpoint - plant.y(x));
      out.output.push(c.out); out.p.push(c.p); out.i.push(c.i); out.d.push(c.d);
    }
    if (!Number.isFinite(x[0]) || Math.abs(x[0]) > 1e9 * Math.max(1, Math.abs(setpoint))) { out.diverged = true; break; }
  }
  return { series: out, metrics: responseMetrics(out, setpoint, saturatedTime) };
}

export function responseMetrics(s, sp, saturatedTime = 0) {
  const y = s.actual, t = s.t, n = y.length;
  if (s.diverged || !n) return { stable: false, classification: 'unstable (diverged)', overshootPct: Infinity, settlingTime: Infinity, riseTime: Infinity, steadyStateError: Infinity, oscillationHz: null, saturatedTime };
  const peak = Math.max(...y.map((v) => v * Math.sign(sp || 1)));
  const overshootPct = sp ? Math.max(0, (peak - Math.abs(sp)) / Math.abs(sp) * 100) : 0;
  const i10 = y.findIndex((v) => Math.abs(v) >= 0.1 * Math.abs(sp)), i90 = y.findIndex((v) => Math.abs(v) >= 0.9 * Math.abs(sp));
  const riseTime = i10 >= 0 && i90 >= 0 ? t[i90] - t[i10] : Infinity;
  const band = 0.02 * Math.abs(sp || 1);
  let settleIdx = n - 1;
  while (settleIdx > 0 && Math.abs(y[settleIdx - 1] - sp) <= band) settleIdx--;
  const settled = Math.abs(y[n - 1] - sp) <= band;
  const settlingTime = settled ? t[settleIdx] : Infinity;
  const tail = s.error.slice(Math.floor(n * 0.8));
  const steadyStateError = tail.reduce((a, b) => a + b, 0) / tail.length;
  // oscillation: zero crossings of error after the first rise
  let crossings = 0;
  for (let i = 1; i < n; i++) if (Math.sign(s.error[i]) !== Math.sign(s.error[i - 1]) && s.error[i] !== 0) crossings++;
  const oscillationHz = crossings > 2 ? crossings / 2 / (t[n - 1] - t[0]) : null;
  // growth: compare error envelope of first and last thirds
  const third = Math.floor(n / 3);
  const env = (a) => Math.max(...a.map(Math.abs));
  const early = env(s.error.slice(third, 2 * third)), late = env(s.error.slice(2 * third));
  let classification = 'stable';
  if (late > early * 1.2 && late > band) classification = 'unstable (growing oscillation)';
  else if (!settled && oscillationHz && late > band) classification = 'marginally stable (sustained oscillation)';
  else if (overshootPct > 25) classification = 'stable, underdamped';
  else if (settled && overshootPct < 1) classification = 'stable, well damped';
  return { stable: classification.startsWith('stable'), classification, overshootPct, riseTime, settlingTime, steadyStateError, oscillationHz, saturatedTime };
}

// --- linear analysis ---
const polyMul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => (r[i + j] += x * y))); return r; };
const polyAdd = (a, b) => { const n = Math.max(a.length, b.length); const r = new Array(n).fill(0); a.forEach((x, i) => (r[n - a.length + i] += x)); b.forEach((x, i) => (r[n - b.length + i] += x)); return r; };

// Durand-Kerner root finder for real-coefficient polynomials (descending powers).
export function polyRoots(p) {
  while (p.length > 1 && Math.abs(p[0]) < 1e-14) p = p.slice(1);
  const n = p.length - 1; if (n < 1) return [];
  const a = p.map((c) => c / p[0]);
  let roots = Array.from({ length: n }, (_, k) => ({ re: Math.cos(2 * Math.PI * k / n + 0.4) * 0.9, im: Math.sin(2 * Math.PI * k / n + 0.4) * 0.9 }));
  const evalP = (z) => { let re = 1, im = 0; for (let i = 1; i <= n; i++) { const r2 = re * z.re - im * z.im + a[i]; im = re * z.im + im * z.re; re = r2; } return { re, im }; };
  for (let it = 0; it < 500; it++) {
    let maxStep = 0;
    roots = roots.map((z, i) => {
      let den = { re: 1, im: 0 };
      roots.forEach((w, j) => { if (j !== i) { const dr = z.re - w.re, di = z.im - w.im; den = { re: den.re * dr - den.im * di, im: den.re * di + den.im * dr }; } });
      const f = evalP(z), m = den.re * den.re + den.im * den.im || 1e-30;
      const q = { re: (f.re * den.re + f.im * den.im) / m, im: (f.im * den.re - f.re * den.im) / m };
      maxStep = Math.max(maxStep, Math.hypot(q.re, q.im));
      return { re: z.re - q.re, im: z.im - q.im };
    });
    if (maxStep < 1e-12) break;
  }
  return roots.map((z) => ({ re: z.re, im: Math.abs(z.im) < 1e-9 ? 0 : z.im }));
}

// Controller TF: (kd s^2 + kp s + ki) / s with derivative filter ignored for analysis.
export function closedLoopAnalysis({ kp = 1, ki = 0, kd = 0 }, plant) {
  const cNum = ki ? [kd, kp, ki] : [kd, kp];
  const cDen = ki ? [1, 0] : [1];
  const olNum = polyMul(cNum, plant.num), olDen = polyMul(cDen, plant.den);
  const charPoly = polyAdd(olDen, olNum);
  const poles = polyRoots(charPoly);
  const stable = poles.every((p) => p.re < -1e-9);
  // frequency sweep of the loop transfer function L(jw)
  const evalC = (poly, w) => { let re = 0, im = 0; for (const c of poly) { const r2 = re * 0 - im * w + c; im = re * w + im * 0; re = r2; } return { re, im }; };
  const L = (w) => { const n = evalC(olNum, w), d = evalC(olDen, w); const m = d.re * d.re + d.im * d.im; return { re: (n.re * d.re + n.im * d.im) / m, im: (n.im * d.re - n.re * d.im) / m }; };
  let gainCross = null, phaseCross = null, prev = null;
  const bode = [];
  for (let e = -3; e <= 3; e += 0.01) {
    const w = 10 ** e, l = L(w), mag = Math.hypot(l.re, l.im), ph = Math.atan2(l.im, l.re) * 180 / Math.PI;
    bode.push({ w, magDb: 20 * Math.log10(mag), phaseDeg: ph });
    if (prev) {
      if (gainCross === null && prev.mag >= 1 && mag < 1) gainCross = { w, phase: ph };
      if (phaseCross === null && Math.sign(prev.l.im) !== Math.sign(l.im) && l.re < 0) phaseCross = { w, mag };
    }
    prev = { mag, l };
  }
  // unwrap phase so the margin is measured from -180
  const phaseMargin = gainCross ? ((gainCross.phase + 360) % 360) - 180 : Infinity;
  const gainMarginDb = phaseCross ? -20 * Math.log10(phaseCross.mag) : Infinity;
  return { characteristic: charPoly, poles, stable, phaseMarginDeg: phaseMargin, gainMarginDb, crossoverRadS: gainCross?.w ?? null, bode };
}

// Ziegler-Nichols-like starting gains for a double integrator from a desired bandwidth (rad/s) and damping.
export function suggestGains(plantId, { bandwidth = 1, zeta = 0.7, inertia = 1 } = {}) {
  if (plantId === 'double-integrator') return { kp: inertia * bandwidth * bandwidth, ki: 0, kd: 2 * zeta * bandwidth * inertia };
  if (plantId === 'first-order') return { kp: 2, ki: 1, kd: 0 };
  return { kp: 1, ki: 0.1, kd: 0.5 };
}
