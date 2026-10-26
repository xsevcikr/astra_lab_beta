// Jettisoned stages, fairings and spent hardware keep flying after separation. They do not influence the vehicle any more,
// so they are propagated on their own (RK4, point-mass gravity of the primary body + aerodynamic drag in the rotating
// atmosphere) from the state recorded at the separation event. Deterministic: the same event always gives the same track.
import { getBody, corotationVelocity } from './bodies.js';
import { qMul, qFromAxisAngle, qNormalize } from './vec.js';

const DRAG_COEFF = 1.0;          // tumbling bluff body (nominal)
const PUSH_STAGE = 0.6;          // m/s, nominal separation-spring velocity along -X (aft) for stages
const PUSH_FAIRING = 1.5;        // m/s, nominal lateral push for fairing halves
const TUMBLE = [0.03, 0.10, 0.06]; // rad/s about body X, Y, Z (nominal residual rates after separation)

/** Mean projected area of a randomly tumbling convex body = surface area / 4 (Cauchy). */
export const tumblingArea = (length, diameter) => Math.max(0.05, (Math.PI * diameter * Math.max(length, 0) + (Math.PI * diameter * diameter) / 2) / 4);

/**
 * Build the initial debris state from the vehicle state at separation.
 * @param spec  from FlightVehicle.debrisSpec(): {groups, mass, cgSolo, offset, length, diameter, area}
 * @param state {t, body, r, v, q}
 */
export function makeDebris(spec, state, groupLabel, opts = {}) {
  const q = state.q;
  const ax = rot(q, [1, 0, 0]), ay = rot(q, [0, 1, 0]);
  const fairing = spec.groups.length === 1 && spec.groups[0] === 'fairing';
  const r = [0, 1, 2].map((i) => state.r[i] + ax[i] * spec.offset);
  const push = opts.push ?? PUSH_STAGE;
  const v = [0, 1, 2].map((i) => state.v[i] + (fairing ? ay[i] * PUSH_FAIRING : -ax[i] * push));
  // a companion spacecraft (the command/service module after undocking) keeps its attitude: no tumbling, and it can be docked with again
  return {
    ...(opts.companion ? { companion: true } : {}),
    id: `debris:${groupLabel}`, label: groupLabel, groups: spec.groups, t0: state.t, body: state.body, r, v, q: [...q],
    mass: spec.mass, area: spec.area, cd: DRAG_COEFF, cgSolo: spec.cgSolo, tumble: opts.companion ? [0, 0, 0] : TUMBLE,
  };
}
function rot(q, v) {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/** Lazily propagated track of one debris object. stateAt(t) is valid for any t >= t0 (mission time). */
export class DebrisTrack {
  constructor(d) {
    this.d = d; this.body = getBody(d.body);
    this.T = [d.t0]; this.P = [[...d.r]]; this.V = [[...d.v]];
    this.impact = null;       // {t, r} once the object has hit the surface
    this.beta = d.mass > 0 ? (d.cd * d.area) / d.mass : 0;   // m2/kg
  }
  _acc(r, v) {
    const b = this.body, rr = Math.hypot(r[0], r[1], r[2]), g = -b.mu / (rr * rr * rr);
    let a = [g * r[0], g * r[1], g * r[2]];
    const atm = b.atmosphereModel;
    const alt = rr - b.radius;
    if (atm?.hasAtmosphere && alt < atm.height && this.beta > 0) {
      const rho = atm.density(Math.max(alt, 0));
      const cv = corotationVelocity(b.id, r);
      const vr = [v[0] - cv[0], v[1] - cv[1], v[2] - cv[2]];
      const sp = Math.hypot(vr[0], vr[1], vr[2]);
      const k = -0.5 * rho * this.beta * sp;
      a = [a[0] + k * vr[0], a[1] + k * vr[1], a[2] + k * vr[2]];
    }
    return a;
  }
  _step(r, v, dt) {
    const a1 = this._acc(r, v);
    const r2 = r.map((x, i) => x + v[i] * dt / 2), v2 = v.map((x, i) => x + a1[i] * dt / 2);
    const a2 = this._acc(r2, v2);
    const r3 = r.map((x, i) => x + v2[i] * dt / 2), v3 = v.map((x, i) => x + a2[i] * dt / 2);
    const a3 = this._acc(r3, v3);
    const r4 = r.map((x, i) => x + v3[i] * dt), v4 = v.map((x, i) => x + a3[i] * dt);
    const a4 = this._acc(r4, v4);
    return [r.map((x, i) => x + (dt / 6) * (v[i] + 2 * v2[i] + 2 * v3[i] + v4[i])), v.map((x, i) => x + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]))];
  }
  _dt(r) {
    const b = this.body, rr = Math.hypot(r[0], r[1], r[2]), alt = rr - b.radius;
    if (b.atmosphereModel?.hasAtmosphere && alt < b.atmosphereModel.height) return 0.1;
    return Math.min(10, Math.max(0.25, Math.sqrt((rr * rr * rr) / b.mu) * 0.003));
  }
  _extend(t) {
    while (!this.impact && this.T[this.T.length - 1] < t) {
      const n = this.T.length - 1, r = this.P[n], v = this.V[n];
      const dt = this._dt(r);
      const [r1, v1] = this._step(r, v, dt);
      const R = this.body.radius;
      const a0 = Math.hypot(r[0], r[1], r[2]) - R, a1 = Math.hypot(r1[0], r1[1], r1[2]) - R;
      if (a1 <= 0) {
        const f = a0 > 0 ? a0 / (a0 - a1) : 0;
        const ti = this.T[n] + f * dt;
        const ri = r.map((x, i) => x + f * (r1[i] - x)), cv = corotationVelocity(this.body.id, ri);
        // speed relative to the (rotating) ground at the impact point
        this.impact = { t: ti, r: ri, speed: Math.hypot(v[0] - cv[0], v[1] - cv[1], v[2] - cv[2]) };
        this.T.push(ti); this.P.push(this.impact.r); this.V.push([0, 0, 0]);
        break;
      }
      this.T.push(this.T[n] + dt); this.P.push(r1); this.V.push(v1);
      if (this.T.length > 600000) break;   // safety: ~ 60 h at the coarsest step
    }
  }
  /** State at mission time t: {r, v, q, alive, impact}. Before t0 returns null. */
  stateAt(t) {
    if (t < this.d.t0) return null;
    this._extend(t);
    const te = this.impact ? Math.min(t, this.impact.t) : t;
    // locate the sample interval (binary search)
    let lo = 0, hi = this.T.length - 1;
    if (te >= this.T[hi]) lo = hi; else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.T[m] <= te) lo = m; else hi = m; } }
    let r, v;
    if (lo === this.T.length - 1) { r = this.P[lo]; v = this.V[lo]; }
    else {
      const h = this.T[lo + 1] - this.T[lo], s = (te - this.T[lo]) / h;
      const p0 = this.P[lo], p1 = this.P[lo + 1], v0 = this.V[lo], v1 = this.V[lo + 1];
      const h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s;
      r = p0.map((x, i) => h00 * x + h10 * h * v0[i] + h01 * p1[i] + h11 * h * v1[i]);
      const d00 = 6 * s * s - 6 * s, d10 = 3 * s * s - 4 * s + 1, d01 = -6 * s * s + 6 * s, d11 = 3 * s * s - 2 * s;
      v = p0.map((x, i) => (d00 * x + d10 * h * v0[i] + d01 * p1[i] + d11 * h * v1[i]) / h);
    }
    const tt = te - this.d.t0, w = this.d.tumble;
    const q = qNormalize(qMul(qMul(qMul(this.d.q, qFromAxisAngle([1, 0, 0], w[0] * tt)), qFromAxisAngle([0, 1, 0], w[1] * tt)), qFromAxisAngle([0, 0, 1], w[2] * tt)));
    const rr = Math.hypot(r[0], r[1], r[2]);
    return { r, v, q, alt: rr - this.body.radius, alive: !this.impact || t < this.impact.t, impact: this.impact && t >= this.impact.t ? this.impact : null };
  }
}
