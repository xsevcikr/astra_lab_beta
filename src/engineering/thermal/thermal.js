// Lumped-parameter thermal network (PHYSICS for the heat balance; heating correlations are APPROXIMATIONS).
// dT/dt = (Q_in - Q_out) / (m cp) per node, explicit sub-stepping limited by the smallest time constant.
import { SIGMA, SOLAR_CONSTANT, AU } from '../core/constants.js';
import { MODEL } from '../core/provenance.js';

export const THERMAL_STATUS = ['NORMAL', 'HOT', 'CRITICAL', 'FAILURE'];

export class ThermalNetwork {
  constructor(nodes = [], links = []) {
    this.nodes = nodes.map((n) => ({ T: 293, mass: 10, cp: 900, area: 0, emissivity: 0.8, absorptivity: 0.3, internalHeat: 0, sunFacing: 0.25, limits: { min: 233, hot: 333, critical: 373, failure: 423 }, ablated: 0, ...n }));
    this.links = links; // [{a, b, G}] conductance W/K
    this.index = new Map(this.nodes.map((n, i) => [n.id, i]));
    this.model = MODEL.PHYSICS;
  }
  node(id) { return this.nodes[this.index.get(id)]; }

  // env: { solarDistance (m), inEclipse, aeroHeatFlux: {nodeId: W/m^2}, extraHeat: {nodeId: W}, sinkTemp, planetIR (W/m^2) }
  step(dt, env = {}) {
    const flux = env.inEclipse ? 0 : SOLAR_CONSTANT * (AU / (env.solarDistance || AU)) ** 2;
    const sink = env.sinkTemp ?? 3;
    let tauMin = Infinity;
    for (const n of this.nodes) {
      const c = n.mass * n.cp;
      const gRad = 4 * n.emissivity * SIGMA * n.area * Math.max(n.T, 50) ** 3;
      const gCond = this.links.filter((l) => l.a === n.id || l.b === n.id).reduce((a, l) => a + l.G, 0);
      if (gRad + gCond > 0) tauMin = Math.min(tauMin, c / (gRad + gCond));
    }
    const sub = Math.max(1, Math.ceil(dt / Math.max(1e-3, 0.3 * tauMin)));
    const h = dt / Math.min(sub, 2000);
    for (let s = 0; s < Math.min(sub, 2000); s++) {
      const q = this.nodes.map((n) => {
        let Q = n.internalHeat + (env.extraHeat?.[n.id] || 0);
        Q += n.absorptivity * flux * n.area * n.sunFacing;
        Q += (env.planetIR || 0) * n.emissivity * n.area * 0.5;
        Q += (env.aeroHeatFlux?.[n.id] || 0) * n.area;
        Q -= n.emissivity * SIGMA * n.area * (n.T ** 4 - sink ** 4);
        return Q;
      });
      for (const l of this.links) {
        const ia = this.index.get(l.a), ib = this.index.get(l.b);
        const Q = l.G * (this.nodes[ia].T - this.nodes[ib].T);
        q[ia] -= Q; q[ib] += Q;
      }
      this.nodes.forEach((n, i) => {
        let dQ = q[i] * h;
        // ablator absorbs heat above its pyrolysis temperature by losing mass
        if (n.ablator && n.T >= n.ablator.pyrolysisTemp && dQ > 0) {
          const dm = Math.min(dQ / n.ablator.heatOfAblation, n.ablator.mass - n.ablated);
          if (dm > 0) { n.ablated += dm; dQ -= dm * n.ablator.heatOfAblation; }
        }
        n.T = Math.max(2.7, n.T + dQ / (n.mass * n.cp));
        n.peakT = Math.max(n.peakT ?? n.T, n.T);
      });
    }
    return this.status();
  }

  status() {
    return this.nodes.map((n) => {
      const L = n.limits;
      let status = 'NORMAL';
      if (n.T >= L.failure || n.T <= (L.minFailure ?? 0)) status = 'FAILURE';
      else if (n.T >= L.critical) status = 'CRITICAL';
      else if (n.T >= L.hot || n.T <= L.min) status = 'HOT';
      if (n.T <= L.min && status === 'HOT') status = 'COLD';
      return { id: n.id, name: n.name || n.id, T: n.T, peakT: n.peakT ?? n.T, status, margin: L.failure - (n.peakT ?? n.T), ablated: n.ablated };
    });
  }
}

// Stagnation-point convective heating, Sutton-Graves (APPROXIMATION). k = 1.7415e-4 (Earth), 1.9027e-4 (Mars).
export function stagnationHeatFlux(density, speed, noseRadius, body = 'earth') {
  const k = body === 'mars' ? 1.9027e-4 : 1.7415e-4;
  return k * Math.sqrt(Math.max(density, 0) / noseRadius) * speed ** 3;
}

// Spacecraft default network: structure, avionics, propellant tanks, battery, radiator, heat shield
export function defaultSpacecraftNetwork(sys = {}) {
  return new ThermalNetwork([
    { id: 'structure', name: 'Primary structure', mass: 1500, cp: 900, area: 30, emissivity: 0.3, absorptivity: 0.25, sunFacing: 0.25, limits: { min: 200, hot: 350, critical: 400, failure: 450 } },
    { id: 'avionics', name: 'Avionics bay', mass: 150, cp: 900, area: 0, internalHeat: 600, limits: { min: 253, hot: 318, critical: 333, failure: 358 } },
    { id: 'battery', name: 'Battery', mass: 120, cp: 1000, area: 0, internalHeat: 50, limits: { min: 263, hot: 313, critical: 323, failure: 333 } },
    { id: 'tanks', name: 'Propellant tanks', mass: 800, cp: 900, area: 0, limits: { min: 270, hot: 320, critical: 335, failure: 345 } },
    { id: 'radiator', name: 'Radiator', mass: 60, cp: 900, area: sys.radiatorArea ?? 8, emissivity: sys.emissivity ?? 0.85, absorptivity: sys.absorptivity ?? 0.2, sunFacing: 0.1, limits: { min: 150, hot: 330, critical: 360, failure: 400 } },
    { id: 'heatshield', name: 'Heat shield', mass: 850, cp: 1200, area: 12, emissivity: 0.85, absorptivity: 0.6, sunFacing: 0.1,
      ablator: { pyrolysisTemp: 700, heatOfAblation: 3e7, mass: 300 }, limits: { min: 120, hot: 1800, critical: (sys.heatShield?.maxTemp ?? 2900) - 300, failure: sys.heatShield?.maxTemp ?? 2900 } },
  ], [
    { a: 'avionics', b: 'radiator', G: 12 }, { a: 'battery', b: 'radiator', G: 3 }, { a: 'structure', b: 'tanks', G: 5 },
    { a: 'structure', b: 'avionics', G: 2 }, { a: 'structure', b: 'heatshield', G: 0.5 },
  ]);
}
