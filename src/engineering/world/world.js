// Multi-vehicle world: every vehicle has its own physics state, integrated in an Earth-centred inertial frame
// with Earth and Moon gravity (Moon on a circular orbit: SIMPLIFICATION of the ephemeris). Rendering helpers
// implement a floating origin (subtract the camera's double-precision position before converting to float32)
// and level-of-detail selection by apparent size.
import { getBody } from '../core/bodies.js';
import { makeRk4, rk4Step } from '../core/integrator.js';

export class World {
  constructor({ moon = true } = {}) {
    this.t = 0; this.vehicles = new Map(); this.stations = [];
    this.E = getBody('earth'); this.M = getBody('moon'); this.moonOn = moon;
    this.nM = Math.sqrt((this.E.mu + this.M.mu) / this.M.sma ** 3);
    this.stats = { steps: 0, substeps: 0 };
  }
  moonPosition(t = this.t) { return [this.M.sma * Math.cos(this.nM * t), this.M.sma * Math.sin(this.nM * t), 0]; }
  add(id, { r, v, mass = 1000, kind = 'spacecraft' }) {
    if (this.vehicles.has(id)) throw new Error(`vehicle ${id} already exists`);
    this.vehicles.set(id, { id, kind, mass, y: new Float64Array([...r, ...v]), w: makeRk4(6) });
    return this;
  }
  remove(id) { this.vehicles.delete(id); }
  deriv = (t, y, out) => {
    const r = Math.hypot(y[0], y[1], y[2]), k = -this.E.mu / r ** 3;
    let ax = k * y[0], ay = k * y[1], az = k * y[2];
    if (this.moonOn) {
      const m = this.moonPosition(t), d = [y[0] - m[0], y[1] - m[1], y[2] - m[2]], dn = Math.hypot(...d), mn = Math.hypot(...m);
      // third-body perturbation: direct term minus indirect term (Earth's acceleration toward the Moon)
      ax += -this.M.mu * (d[0] / dn ** 3 + m[0] / mn ** 3); ay += -this.M.mu * (d[1] / dn ** 3 + m[1] / mn ** 3); az += -this.M.mu * (d[2] / dn ** 3 + m[2] / mn ** 3);
    }
    out[0] = y[3]; out[1] = y[4]; out[2] = y[5]; out[3] = ax; out[4] = ay; out[5] = az;
  };
  step(dt, maxSub = 10) {
    const n = Math.max(1, Math.ceil(dt / maxSub));
    for (let i = 0; i < n; i++) { for (const v of this.vehicles.values()) rk4Step(this.deriv, this.t, v.y, dt / n, v.w); this.t += dt / n; this.stats.substeps++; }
    this.stats.steps++;
  }
  relative(a, b) { const A = this.vehicles.get(a).y, B = this.vehicles.get(b).y; const dr = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], dv = [B[3] - A[3], B[4] - A[4], B[5] - A[5]]; return { range: Math.hypot(...dr), rangeRate: (dr[0] * dv[0] + dr[1] * dv[1] + dr[2] * dv[2]) / Math.hypot(...dr), dr, dv }; }
  energy(id) { const y = this.vehicles.get(id).y; return (y[3] ** 2 + y[4] ** 2 + y[5] ** 2) / 2 - this.E.mu / Math.hypot(y[0], y[1], y[2]); }
}

// Floating origin: keep world coordinates in float64; give the renderer float32 offsets from the camera.
export function toRenderSpace(posWorld, cameraWorld, metersPerUnit = 1) {
  return new Float32Array([(posWorld[0] - cameraWorld[0]) / metersPerUnit, (posWorld[1] - cameraWorld[1]) / metersPerUnit, (posWorld[2] - cameraWorld[2]) / metersPerUnit]);
}
// Level of detail from apparent angular size (radians) of an object of given radius at given distance.
export function levelOfDetail(radius, distance, fovRad = 1, screenPx = 1080) {
  const px = (2 * Math.atan(radius / Math.max(distance, radius)) / fovRad) * screenPx;
  return { pixels: px, level: px > 400 ? 'high' : px > 60 ? 'medium' : px > 4 ? 'low' : px > 0.5 ? 'impostor' : 'culled' };
}
