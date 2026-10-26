// Modular space station builder: modules connect through docking ports; totals for mass, power, thermal
// rejection, crew capacity and consumables come from the module data (APPROXIMATION of real module budgets).
export const MODULE_TYPES = {
  habitation: { mass: 15000, powerUse: 3000, powerGen: 0, heatReject: 0, crew: 3, o2GenKgDay: 0, storageKg: 2000, ports: 3 },
  laboratory: { mass: 14500, powerUse: 6000, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 500, ports: 2 },
  power: { mass: 16000, powerUse: 200, powerGen: 30000, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 0, ports: 2 },
  communication: { mass: 3000, powerUse: 800, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 0, ports: 2 },
  'docking-node': { mass: 8000, powerUse: 300, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 300, ports: 6 },
  propulsion: { mass: 12000, powerUse: 400, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 0, ports: 2, propellantKg: 3000 },
  cargo: { mass: 9000, powerUse: 200, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 9000, ports: 1 },
  radiator: { mass: 3500, powerUse: 100, powerGen: 0, heatReject: 14000, crew: 0, o2GenKgDay: 0, storageKg: 0, ports: 1 },
  'solar-array': { mass: 4000, powerUse: 0, powerGen: 25000, heatReject: 0, crew: 0, o2GenKgDay: 0, storageKg: 0, ports: 1 },
  'life-support': { mass: 11000, powerUse: 4000, powerGen: 0, heatReject: 0, crew: 0, o2GenKgDay: 5.4, storageKg: 1000, ports: 2 },
};

export class Station {
  constructor(name = 'Station') { this.name = name; this.modules = []; this.links = []; this.docked = []; }
  add(type, id = `${type}-${this.modules.length + 1}`, attachTo = null) {
    const t = MODULE_TYPES[type]; if (!t) throw new Error(`unknown module type ${type}`);
    if (this.modules.some((m) => m.id === id)) throw new Error(`module ${id} exists`);
    if (attachTo) { const p = this.module(attachTo); if (this.freePorts(p.id) <= 0) throw new Error(`${attachTo} has no free docking port`); }
    else if (this.modules.length) throw new Error('every module after the first must attach to an existing module');
    this.modules.push({ id, type, ...t });
    if (attachTo) this.links.push([attachTo, id]);
    return this;
  }
  module(id) { const m = this.modules.find((x) => x.id === id); if (!m) throw new Error(`no module ${id}`); return m; }
  freePorts(id) { const m = this.module(id); return m.ports - this.links.filter((l) => l.includes(id)).length - this.docked.filter((d) => d.port === id).length; }
  dock(vehicle, portModule) {
    if (this.freePorts(portModule) <= 0) return { ok: false, reason: `no free port on ${portModule}` };
    this.docked.push({ vehicle: vehicle.name, mass: vehicle.mass, port: portModule, crew: vehicle.crew || 0, cargoKg: vehicle.cargoKg || 0 });
    return { ok: true };
  }
  budget({ crewAboard, sunlitFraction = 0.62 } = {}) {
    const sum = (k) => this.modules.reduce((a, m) => a + (m[k] || 0), 0);
    const crew = crewAboard ?? Math.min(sum('crew'), sum('crew') + this.docked.reduce((a, d) => a + d.crew, 0));
    const genAvg = sum('powerGen') * sunlitFraction, use = sum('powerUse');
    const heat = use + 120 * crew, reject = sum('heatReject') + 2000; // 2 kW passive rejection through the hull
    const o2Need = 0.84 * crew, o2Gen = sum('o2GenKgDay');
    return {
      mass: sum('mass') + this.docked.reduce((a, d) => a + d.mass, 0), modules: this.modules.length, crewCapacity: sum('crew'), crew,
      powerGenerationAvg: genAvg, powerUse: use, powerMargin: genAvg / Math.max(1, use) - 1,
      heatLoad: heat, heatRejection: reject, thermalMargin: reject / Math.max(1, heat) - 1,
      o2BalanceKgDay: o2Gen - o2Need, consumablesDays: o2Gen >= o2Need ? Infinity : (sum('storageKg') * 0.05) / Math.max(1e-9, o2Need - o2Gen),
      freePorts: this.modules.reduce((a, m) => a + this.freePorts(m.id), 0), docked: this.docked.map((d) => `${d.vehicle} at ${d.port}`),
      warnings: [genAvg < use ? 'Power deficit: average generation below use' : null, reject < heat ? 'Thermal: heat load exceeds rejection capacity' : null, crew > sum('crew') ? 'Crew exceeds habitation capacity' : null, o2Gen < o2Need ? 'Oxygen generation below crew need: resupply required' : null].filter(Boolean),
    };
  }
}
