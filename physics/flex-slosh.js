// Propellant slosh and the first bending mode of the structure (2.3). Both are OFF by default (settings.slosh / settings.flex) so every older
// result stays the same; the Planner's "Slosh and flex" switches turn them on.
//
// SLOSH. Every partly filled liquid tank gets the classic spring-mass model: a slosh mass ms, held by a spring with the frequency of the first
// slosh mode of a cylindrical tank, w^2 = (1.841 g / R) tanh(1.841 h / R) (g = the push along the rocket; h = liquid depth; R = tank radius),
// moves sideways in the tank. The spring and damper push the rocket sideways at the tank, which turns the rocket about its centre of mass.
// ms = 0.45 m_liquid sqrt(4 f (1 - f)): nothing sloshes in a full or an empty tank. Damping 5% of critical with baffles (the default).
// Not modelled: the swirling second mode, the fuel that lifts off the floor in free fall, the fluid pressing on the walls in a burn.
//
// FLEX. One free-free bending mode of a thin-walled beam: w = 22.373 sqrt(EI / (m' L^4)), EI = E pi R^3 t (aluminium-lithium, wall about 1.2 mm per metre
// of diameter unless the vehicle says otherwise: meta.wallThickness or meta.bendingEI). It is driven by the sideways engine force at the tail and the aerodynamic normal force, and it bends the
// rocket's "sensor": the attitude the guidance reads is off by (slope at the sensor) x (modal displacement). That is how a real rocket's
// control system can fight its own bending. Not modelled: higher modes, damping from joints, pogo.
import { clamp } from './vec.js';

const TANKS = new Set(['fuel_tank', 'oxidizer_tank', 'propellant_tank']);
const E_MOD = 72e9;

export class SloshFlex {
  constructor(sim) {
    this.sim = sim; this.tanks = new Map();
    this.f = { y: 0, z: 0, vy: 0, vz: 0 };   // bending mode: displacement and rate at the tail [m, m/s], body axes y and z
    this.out = { Fy: 0, Fz: 0, Ty: 0, Tz: 0, sensY: 0, sensZ: 0, sloshN: 0, sloshMass: 0, sloshHz: 0, flexHz: 0, flexAmp: 0 };
    this.omegaB = 0; this.mGen = 1; this.L = 1; this.tanks2 = new Map();
  }
  /** bending frequency [rad/s] of the vehicle as it is now */
  _flexParams() {
    const fv = this.sim.fv, lay = fv._layout, L = Math.max(lay.length, 1), R = Math.max(lay.maxDiameter / 2, 0.1);
    const wall = fv.def.meta?.wallThickness ?? clamp(0.0012 * 2 * R, 0.0006, 0.008);   // wall grows with the diameter: about 1.2 mm per metre, 6 mm on a 5 m rocket
    const EI = fv.def.meta?.bendingEI ?? E_MOD * Math.PI * R * R * R * wall;
    const mPer = fv.mass / L;
    this.omegaB = 22.373 * Math.sqrt(EI / (mPer * L ** 4));
    this.mGen = 0.25 * fv.mass; this.L = L;
  }
  /**
   * Advance by dt. `prev` = the vehicle's last body-frame accelerations {aAxial, aLatY, aLatZ, alphaY, alphaZ, thrustY, thrustZ, aeroY, aeroZ}.
   * Returns the body-frame sideways force and the torque about the centre of mass that act during the next step, and the sensor error.
   */
  update(dt, prev) {
    const sim = this.sim, S = sim.settings, fv = sim.fv, lay = fv._layout, cg = fv.mp.cg;
    const o = this.out; o.Fy = o.Fz = o.Ty = o.Tz = 0; o.sloshN = 0; o.sloshMass = 0; o.sloshHz = 0; o.slosh2Hz = 0; o.sensY = o.sensZ = 0;
    if (!prev || dt <= 0) return o;
    const aAx = Math.max(prev.aAxial, 0);                 // m/s^2 along the rocket: what holds the liquid against the tank floor
    if (S.slosh && aAx > 0.25) {
      const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
      let minW = Infinity;
      for (const c of fv.presentComponents()) {
        if (!TANKS.has(c.kind)) continue;
        const cap = c.propellantMass ?? 0, m = fv.propMass[c.id] ?? 0, f = cap > 0 ? clamp(m / cap, 0, 1) : 0;
        if (f < 0.02 || f > 0.985) { this.tanks.delete(c.id); this.tanks2.delete(c.id); continue; }
        const pl = lay.placements.get(c.id); if (!pl) continue;
        const R = Math.max((c.diameter ?? 1) / 2, 0.05), len = Math.max(c.length ?? 1, 0.1), depth = f * len;
        const ms = 0.45 * m * Math.sqrt(4 * f * (1 - f));
        const w2 = (1.841 * aAx / R) * Math.tanh(1.841 * depth / R), w = Math.sqrt(Math.max(w2, 1e-6));
        const zeta = c.slosh?.damping ?? (c.baffles === false ? 0.005 : 0.05);
        let st = this.tanks.get(c.id); if (!st) { st = { y: 0, z: 0, vy: 0, vz: 0 }; this.tanks.set(c.id, st); }
        const x = (pl.x0 + pl.x1) / 2 - cg;                 // distance of the tank from the centre of mass (x is along the rocket)
        // sideways acceleration of the tank wall: the vehicle's own plus the turning about the centre of mass
        const ay = prev.aLatY + x * prev.alphaZ, az = prev.aLatZ - x * prev.alphaY;
        for (let i = 0; i < n; i++) {
          // the slosh mass lags the wall: y'' = -2 zeta w y' - w^2 y - a_wall (relative to the tank)
          st.vy += (-2 * zeta * w * st.vy - w2 * st.y - ay) * h; st.y += st.vy * h;
          st.vz += (-2 * zeta * w * st.vz - w2 * st.z - az) * h; st.z += st.vz * h;
          const lim = R * 0.9;
          if (Math.abs(st.y) > lim) { st.y = Math.sign(st.y) * lim; st.vy *= 0.5; }
          if (Math.abs(st.z) > lim) { st.z = Math.sign(st.z) * lim; st.vz *= 0.5; }
        }
        let Fy = ms * (w2 * st.y + 2 * zeta * w * st.vy), Fz = ms * (w2 * st.z + 2 * zeta * w * st.vz);
        if (S.slosh2) {                                          // 2.5: the second slosh mode (Abramson: xi_2 = 5.331; its mass is the first mode's times the ratio of the modal-mass formulas)
          const d = depth / R, m1 = Math.tanh(1.841 * d) / (1.841 * (1.841 ** 2 - 1)), m2 = Math.tanh(5.331 * d) / (5.331 * (5.331 ** 2 - 1)), ms2 = ms * (m2 / m1);
          const w22 = (5.331 * aAx / R) * Math.tanh(5.331 * d), w2n = Math.sqrt(Math.max(w22, 1e-6)), z2 = zeta * 1.2;
          let s2 = this.tanks2.get(c.id); if (!s2) { s2 = { y: 0, z: 0, vy: 0, vz: 0 }; this.tanks2.set(c.id, s2); }
          for (let i = 0; i < n; i++) {
            s2.vy += (-2 * z2 * w2n * s2.vy - w22 * s2.y - ay) * h; s2.y += s2.vy * h;
            s2.vz += (-2 * z2 * w2n * s2.vz - w22 * s2.z - az) * h; s2.z += s2.vz * h;
            const lim2 = R * 0.5;
            if (Math.abs(s2.y) > lim2) { s2.y = Math.sign(s2.y) * lim2; s2.vy *= 0.5; }
            if (Math.abs(s2.z) > lim2) { s2.z = Math.sign(s2.z) * lim2; s2.vz *= 0.5; }
          }
          Fy += ms2 * (w22 * s2.y + 2 * z2 * w2n * s2.vy); Fz += ms2 * (w22 * s2.z + 2 * z2 * w2n * s2.vz);
          o.slosh2Hz = Math.min(o.slosh2Hz || Infinity, w2n / (2 * Math.PI)); o.sloshMass += ms2;
        }
        o.Fy += Fy; o.Fz += Fz; o.Ty += -x * Fz; o.Tz += x * Fy;
        o.sloshMass += ms; minW = Math.min(minW, w);
      }
      o.sloshN = Math.hypot(o.Fy, o.Fz); o.sloshHz = Number.isFinite(minW) ? minW / (2 * Math.PI) : 0;
    } else { this.tanks.clear(); this.tanks2.clear(); }
    if (S.flex) {
      this._flexParams();
      const w = this.omegaB, zeta = 0.005, M = this.mGen;
      const steps = Math.min(40, Math.max(1, Math.ceil(dt * w / 0.3))), h = dt / steps;
      // driving force on the mode: engine side force at the tail (mode shape +1 there) and the aerodynamic normal force (shape about +0.3)
      const QY = (prev.thrustY + prev.aeroY * 0.3) / M, QZ = (prev.thrustZ + prev.aeroZ * 0.3) / M;
      if (h * w > 0.6) { this.f.y = QY / (w * w); this.f.z = QZ / (w * w); this.f.vy = this.f.vz = 0; }   // a stiff structure follows the load at once
      else for (let i = 0; i < steps; i++) {
        this.f.vy += (QY - 2 * zeta * w * this.f.vy - w * w * this.f.y) * h; this.f.y += this.f.vy * h;
        this.f.vz += (QZ - 2 * zeta * w * this.f.vz - w * w * this.f.z) * h; this.f.z += this.f.vz * h;
      }
      const slope = 3.0 / this.L;                            // slope of the mode at the sensor (rad per metre of tail displacement)
      o.sensY = slope * this.f.z; o.sensZ = -slope * this.f.y;   // pitch / yaw error the sensor reports because the structure is bent
      o.flexHz = w / (2 * Math.PI); o.flexAmp = Math.hypot(this.f.y, this.f.z);
    } else { this.f.y = this.f.z = this.f.vy = this.f.vz = 0; o.flexHz = 0; o.flexAmp = 0; }
    return o;
  }
}
