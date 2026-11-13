// Aerodynamic heating (2.9): entry heating (convective + radiative), heat-shield ablation and fin leading-edge heating.
//
// CONVECTIVE (stagnation point): Sutton-Graves, q_c = k sqrt(rho / Rn) V^3 (physics/aero.js). This already existed; it is kept.
//
// RADIATIVE (hot shock layer, matters above about 9 km/s at Earth and 6 km/s at Mars): Tauber & Sutton (1991) correlation,
//   q_r = C Rn^a rho^b f(V)   [W/cm^2, rho in kg/m^3, Rn in m]
//   Earth: C = 4.736e4, b = 1.22, a = 1.072e6 V^-1.88 rho^-0.325 (capped at 1.0 for Rn <= 1 m, 0.6 for Rn <= 2 m, 0.5 above)
//   Mars:  C = 2.35e4,  b = 1.19, a = 0.526
//   f(V) is the tabulated velocity function of the paper (Earth 9-16 km/s, Mars 6-9 km/s). Outside the table: 0 below, end value above.
//   Engineering accuracy (factor of about 2), the same class as Sutton-Graves.
//
// ABLATION: a heat shield with shieldType 'ablative' (or no type: the plain catalog shield) loses mass where the incoming heat is not
//   radiated away by the hot surface: m_dot'' = max(0, q_c + q_r - eps sigma Ts^4) / Q*, Ts = min(radiative-equilibrium temperature,
//   char surface limit). Q* (effective heat of ablation) about 30 MJ/kg and density 512 kg/m^3 (AVCOAT-class). The shield burns through when
//   the recession reaches 80% of the ablator thickness (the last layer must still insulate). Tiles and carbon are reusable: they do not
//   ablate; their temperature is checked by the existing nose thermal node.
//
// FIN LEADING EDGES: a swept cylinder. Unswept stagnation line of a cylinder = sphere value / sqrt(2) (Fay-Riddell / Beckwith);
//   sweep reduces it by cos(Lambda)^1.2 (Tauber's engineering fit). One lumped leading-edge node per fin set (a 5 cm wide strip of the
//   fin skin), heated through a hot-wall factor (1 - T/T_aw) and cooled by radiation from both sides. Defaults when the fin does not say:
//   4 fins, leading-edge radius 5 mm, sweep 45 deg, skin 4 mm aluminium-class (cp 900 J/kg/K), span 0.6 x vehicle diameter, limit 700 K
//   (titanium-class edge; set fin.tMax for aluminium, about 420 K).
//
// Everything here is diagnostic unless settings.heating is on: then radiative heating also heats the nose node, and ablation burn-through
// and fin over-temperature become failures. Off by default so earlier results do not change.
import { SIGMA } from './constants.js';
import { heatingConstant, stagnationHeatFlux } from './aero.js';

const DEG = Math.PI / 180;
const TS = {
  earth: { C: 4.736e4, b: 1.22, f: [[9000, 1.5], [9250, 4.3], [9500, 9.7], [9750, 19.5], [10000, 35], [10250, 55], [10500, 81], [10750, 115], [11000, 151], [11500, 238], [12000, 359], [12500, 495], [13000, 660], [13500, 850], [14000, 1065], [14500, 1313], [15000, 1550], [15500, 1780], [16000, 2040]] },
  mars: { C: 2.35e4, a: 0.526, b: 1.19, f: [[6000, 0.2], [6150, 1.0], [6300, 1.95], [6500, 3.42], [6700, 5.1], [6900, 7.1], [7000, 8.1], [7200, 10.2], [7400, 12.5], [7600, 14.8], [7800, 17.1], [8000, 19.2], [8200, 21.4], [8400, 24.1], [8600, 26.0], [8800, 28.9], [9000, 32.8]] },
};
function tableF(tab, v) {
  if (v < tab[0][0]) return 0;
  for (let i = 1; i < tab.length; i++) if (v <= tab[i][0]) { const f = (v - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[i - 1][1] + f * (tab[i][1] - tab[i - 1][1]); }
  return tab[tab.length - 1][1];
}

/** Radiative stagnation-point heat flux [W/m^2] (Tauber-Sutton). Only Earth and Mars air have a correlation; other bodies return 0. */
export function radiativeHeatFlux(bodyId, rho, noseRadius, v) {
  const T = TS[bodyId];
  if (!T || !(rho > 0) || !(v > 0)) return 0;
  const f = tableF(T.f, v);
  if (f <= 0) return 0;
  const Rn = Math.min(Math.max(noseRadius, 0.05), 3);
  let a = T.a;
  if (a == null) a = Math.min(1.072e6 * Math.pow(v, -1.88) * Math.pow(rho, -0.325), Rn <= 1 ? 1 : Rn <= 2 ? 0.6 : 0.5);
  return T.C * Math.pow(Rn, a) * Math.pow(rho, T.b) * f * 1e4;
}

/** Stagnation-line heat flux on a swept cylindrical leading edge [W/m^2]. */
export function leadingEdgeHeatFlux(bodyId, rho, edgeRadius, v, sweepDeg = 45) {
  const qs = stagnationHeatFlux(heatingConstant(bodyId), rho, Math.max(edgeRadius, 0.0005), v);
  return qs * Math.SQRT1_2 * Math.pow(Math.max(Math.cos(sweepDeg * DEG), 0), 1.2);
}

/** Adiabatic-wall (recovery) temperature [K] with a turbulent recovery factor 0.9. */
export const recoveryTemperature = (Tamb, v) => Tamb + 0.9 * (v * v) / (2 * 1005);

export const ABLATOR = { density: 512, heatOfAblation: 30e6, surfaceLimitK: 2200, emissivity: 0.85, burnThroughFraction: 0.8 };
const ablative = (c) => c.kind === 'heat_shield' && (c.shieldType == null || c.shieldType === 'ablative');

export class HeatingModel {
  constructor(sim) {
    this.sim = sim;
    this.fins = new Map();      // fin component id -> { T, m, C, Aheat, Arad, span, n, rle, sweep, tMax, name }
    this.shields = new Map();   // heat-shield id -> { thickness, recession, massLost, area }
    this.out = { qConv: 0, qRad: 0, qTotal: 0, heatLoad: 0, wallEqT: 0, finT: 0, finRatio: 0, finFlux: 0, recession: 0, shieldLeft: 1, ablatedKg: 0 };
    this.max = { qConv: 0, qRad: 0, qTotal: 0, finT: 0, finFlux: 0, recession: 0, wallEqT: 0 };
    this.failed = new Set();
  }

  _finState(c, D) {
    let st = this.fins.get(c.id);
    if (st) return st;
    const n = c.finCount ?? (c.gridFin ? 4 : 4), span = c.span ?? Math.max(0.15, 0.6 * D), t = c.skinThickness ?? 0.004;
    const strip = 0.05, rle = c.leadingEdgeRadius ?? (c.gridFin ? 0.002 : 0.005), sweep = c.sweepDeg ?? (c.gridFin ? 0 : 45);
    const m = Math.max(n * span * strip * t * 2700, 0.05);
    st = { T: this.sim.fv.thermal?.body?.T ?? 293, m, C: m * 900, Aheat: n * span * Math.PI * rle * (c.gridFin ? 6 : 1), Arad: 2 * n * span * strip, n, span, rle, sweep,
      tMax: c.tMax ?? 700, name: c.name ?? 'Fin set' };
    this.fins.set(c.id, st);
    return st;
  }

  _shieldState(c) {
    let st = this.shields.get(c.id);
    if (st) return st;
    const area = Math.PI * ((c.diameter ?? 1) / 2) ** 2;
    const thickness = c.ablatorThickness ?? Math.min(Math.max((0.8 * (c.mass ?? 20)) / (ABLATOR.density * area), 0.005), c.length ?? 0.15);
    st = { thickness, recession: 0, massLost: 0, area, name: c.name ?? 'Heat shield' };
    this.shields.set(c.id, st);
    return st;
  }

  /** Called once per step after the forces of the step end are known (sim.tmpOut). */
  update(dt) {
    const sim = this.sim, o = sim.tmpOut, fv = sim.fv, P = sim.primary, out = this.out;
    const rho = o.rho ?? 0, v = o.speedAir ?? 0, Tamb = o.Tamb || 200;
    const Rn = fv.thermal?.lead?.noseRadius || 0.2;
    out.qConv = rho > 0 ? stagnationHeatFlux(heatingConstant(P.id), rho, Rn, v) : 0;
    out.qRad = rho > 0 ? radiativeHeatFlux(P.id, rho, Rn, v) : 0;
    out.qTotal = out.qConv + out.qRad;
    out.heatLoad += out.qTotal * dt;
    out.wallEqT = out.qTotal > 0 ? Math.pow(out.qTotal / (0.85 * SIGMA), 0.25) : 0;
    const M = this.max;
    M.qConv = Math.max(M.qConv, out.qConv); M.qRad = Math.max(M.qRad, out.qRad); M.qTotal = Math.max(M.qTotal, out.qTotal); M.wallEqT = Math.max(M.wallEqT, out.wallEqT);

    // ---- ablation of the heat shield that faces the flow ----
    const shield = fv.shieldForward ? fv.presentComponents('heat_shield')[0] : null;
    if (shield && ablative(shield) && out.qTotal > 0) {
      const st = this._shieldState(shield);
      const Ts = Math.min(out.wallEqT, ABLATOR.surfaceLimitK);
      const qNet = Math.max(0, out.qTotal - ABLATOR.emissivity * SIGMA * Ts ** 4);
      const mdot = qNet / ABLATOR.heatOfAblation;                    // kg/m^2/s at the stagnation point
      st.recession += (mdot / ABLATOR.density) * dt;
      st.massLost += mdot * st.area * 0.6 * dt;                       // the flank sees about 60% of the stagnation value
      out.recession = st.recession; out.shieldLeft = Math.max(0, 1 - st.recession / st.thickness); out.ablatedKg = st.massLost;
      M.recession = Math.max(M.recession, st.recession);
    }

    // ---- fin leading edges ----
    out.finT = 0; out.finRatio = 0; out.finFlux = 0;
    const fins = fv.presentComponents('fin');
    if (fins.length) {
      const D = fv._layout?.maxDiameter ?? 1, Taw = recoveryTemperature(Tamb, v);
      for (const c of fins) {
        const st = this._finState(c, D);
        const qle = rho > 0 && v > 1 ? leadingEdgeHeatFlux(P.id, rho, st.rle, v, st.sweep) : 0;
        const Tenv = rho > 1e-3 ? Tamb : 3;
        const n = Math.max(1, Math.ceil(dt / 0.5)), h = dt / n;
        for (let i = 0; i < n; i++) {
          const qin = qle * 0.6 * st.Aheat * Math.max(0, 1 - st.T / Math.max(Taw, 1));   // the strip sees about 60% of the stagnation-line value
          const qout = 0.8 * SIGMA * st.Arad * (st.T ** 4 - Tenv ** 4);
          st.T = Math.max(3, st.T + ((qin - qout) * h) / st.C);
        }
        if (st.T > out.finT) { out.finT = st.T; out.finRatio = st.T / st.tMax; out.finName = st.name; out.finLimit = st.tMax; }
        out.finFlux = Math.max(out.finFlux, qle);
      }
      M.finT = Math.max(M.finT, out.finT); M.finFlux = Math.max(M.finFlux, out.finFlux);
    }
    return out;
  }

  /** Failures (settings.heating only). Returns a reason string if the vehicle is lost. */
  check() {
    const sim = this.sim, out = this.out;
    if (!sim.settings.heating) return null;
    let destroyed = null;
    if (out.finRatio >= 1 && !this.failed.has('fin')) {
      this.failed.add('fin');
      sim.monitor.add({ code: 'FIN_OVERHEAT', title: 'Fin leading edge overheated', severity: 'major', confidence: 'CONFIRMED',
        primaryCause: `${out.finName} leading edge passed ${out.finT.toFixed(0)} K, its ${out.finLimit.toFixed(0)} K limit.`,
        contributing: [`Leading-edge heat flux ${(out.finFlux / 1e4).toFixed(1)} W/cm²`, `Mach ${(sim.now.mach ?? 0).toFixed(1)} at ${((sim.now.alt ?? 0) / 1000).toFixed(1)} km`],
        evidence: [{ label: 'Fin edge temperature', value: out.finT, unit: 'K', t: sim.t }, { label: 'Limit', value: out.finLimit, unit: 'K' }, { label: 'Edge heat flux', value: out.finFlux, unit: 'W/m2' }],
        consequences: 'The fin edge softens; the fins can lose shape and stability margin.',
        solutions: ['Use a titanium or steel leading edge (higher tMax)', 'Give the fins more sweep or a blunter edge (bigger radius)', 'Fly a lofted ascent so the vehicle is fast only in thin air'],
        equation: { name: 'Swept-cylinder heating', formula: 'q = k √(ρ/r_LE) v³ · cos(Λ)^1.2 / √2', values: `peak ${(out.finFlux / 1e4).toFixed(1)} W/cm²` } });
    }
    for (const st of this.shields.values()) {
      if (st.recession >= ABLATOR.burnThroughFraction * st.thickness && !this.failed.has('shield')) {
        this.failed.add('shield');
        sim.monitor.add({ code: 'HEAT_SHIELD_BURNTHROUGH', title: 'Heat shield burned through', severity: 'catastrophic', confidence: 'CONFIRMED',
          primaryCause: `${st.name} receded ${(st.recession * 100).toFixed(1)} cm of its ${(st.thickness * 100).toFixed(1)} cm ablator.`,
          contributing: [`Heat load ${(out.heatLoad / 1e7).toFixed(1)} kJ/cm²`, `Peak heat flux ${(this.max.qTotal / 1e4).toFixed(0)} W/cm² (radiative ${(this.max.qRad / 1e4).toFixed(0)} W/cm²)`],
          evidence: [{ label: 'Recession', value: st.recession, unit: 'm', t: sim.t }, { label: 'Ablator thickness', value: st.thickness, unit: 'm' }, { label: 'Heat load', value: out.heatLoad, unit: 'J/m2' }],
          consequences: 'Hot gas reached the structure; the vehicle was lost.',
          solutions: ['Use a thicker or heavier heat shield', 'Enter at a shallower angle (lower peak flux) or a steeper one (lower total heat load)', 'Use lift to stretch the entry'],
          equation: { name: 'Ablation', formula: 'ṁ = (q_c + q_r − εσT⁴) / Q*', values: `Q* = ${(ABLATOR.heatOfAblation / 1e6).toFixed(0)} MJ/kg` } });
        destroyed = 'heat shield burn-through';
      }
    }
    return destroyed;
  }

  summary() {
    const M = this.max, o = this.out;
    return { peakConvective: M.qConv, peakRadiative: M.qRad, peakTotal: M.qTotal, heatLoad: o.heatLoad, peakWallEqT: M.wallEqT, peakFinT: M.finT, peakFinFlux: M.finFlux,
      recession: M.recession, ablatedKg: o.ablatedKg, shieldLeft: o.shieldLeft };
  }
}
