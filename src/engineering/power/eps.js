// Electrical power system: solar arrays, fuel cells, batteries, two buses, prioritized loads, faults, safe mode.
// Energy balance: PHYSICS. Cell efficiency, degradation and battery ageing curves: APPROXIMATION.
import { SOLAR_CONSTANT, AU } from '../core/constants.js';
import { MODEL } from '../core/provenance.js';

export class PowerSystem {
  constructor(cfg = {}) {
    this.cfg = { solarArea: 0, solarEfficiency: 0.28, degradationPerYear: 0.02, batteryWh: 5000, batteryMaxC: 0.5, chargeEfficiency: 0.95, cycleFade: 2e-4, fuelCellW: 0, busVoltage: 28, safeModeSoc: 0.3, shedLevels: [0.5, 0.4], ...cfg };
    this.loads = (cfg.loads || []).map((l) => ({ bus: l.priority === 1 ? 'A' : 'B', on: true, ...l }));
    this.soc = cfg.initialSoc ?? 1;
    this.capacityWh = this.cfg.batteryWh;
    this.age = 0; // s
    this.throughputWh = 0;
    this.buses = { A: { ok: true }, B: { ok: true } };
    this.panelHealth = 1;
    this.faults = [];
    this.events = [];
    this.safeModeRequested = false;
    this.model = MODEL.APPROXIMATION;
    this.last = null;
  }
  inject(fault, params = {}) {
    this.faults.push({ fault, ...params });
    if (fault === 'solar-panel-failure') this.panelHealth *= 1 - (params.fraction ?? 0.5);
    if (fault === 'battery-degradation') this.capacityWh *= 1 - (params.fraction ?? 0.3);
    if (fault === 'bus-failure') this.buses[params.bus || 'B'].ok = false;
    if (fault === 'short-circuit') this.shortW = params.power ?? 800;
    if (fault === 'excess-consumption') this.extraW = params.power ?? 500;
  }
  // env: { t, sunCos (0..1 projected-area factor), inEclipse, solarDistance }
  step(dt, env = {}) {
    this.age += dt;
    const flux = env.inEclipse ? 0 : SOLAR_CONSTANT * (AU / (env.solarDistance || AU)) ** 2;
    const degr = (1 - this.cfg.degradationPerYear) ** (this.age / 3.15576e7);
    const gen = flux * this.cfg.solarArea * this.cfg.solarEfficiency * Math.max(0, env.sunCos ?? 1) * this.panelHealth * degr + this.cfg.fuelCellW;
    // short circuit on bus B trips its breaker after 50 ms worth of overcurrent
    if (this.shortW && this.buses.B.ok) { this.buses.B.ok = false; this.events.push({ t: env.t, type: 'breaker-trip', text: 'Bus B breaker tripped on short circuit' }); }
    for (const l of this.loads) l.powered = l.on && this.buses[l.bus].ok;
    let demand = this.loads.reduce((a, l) => a + (l.powered ? l.power : 0), 0) + (this.extraW || 0);
    let net = gen - demand; // W, + charging
    const maxRate = this.cfg.batteryMaxC * this.capacityWh;
    let battW = Math.max(-maxRate, Math.min(maxRate, net));
    if (battW > 0) battW *= this.cfg.chargeEfficiency;
    let dE = (battW * dt) / 3600;
    if (this.soc >= 1 && dE > 0) dE = 0;
    this.soc = Math.max(0, Math.min(1, this.soc + dE / this.capacityWh));
    this.throughputWh += Math.abs(dE);
    this.capacityWh = Math.max(0, this.capacityWh - this.cfg.cycleFade * Math.abs(dE)); // fade per Wh cycled
    const unmet = net < -maxRate || (this.soc <= 0 && net < 0) ? -net - (this.soc > 0 ? maxRate : 0) : 0;
    // load shedding by priority as charge drops
    const [shed3, shed2] = this.cfg.shedLevels;
    for (const l of this.loads) {
      const want = l.priority === 1 || (l.priority === 2 && this.soc > shed2) || (l.priority >= 3 && this.soc > shed3);
      if (l.on !== want) { l.on = want; this.events.push({ t: env.t, type: want ? 'load-restore' : 'load-shed', text: `${want ? 'Restored' : 'Shed'} ${l.name} at ${(this.soc * 100).toFixed(0)}% charge` }); }
    }
    if (!this.safeModeRequested && (this.soc < this.cfg.safeModeSoc || unmet > 0)) {
      this.safeModeRequested = true;
      this.events.push({ t: env.t, type: 'safe-mode-request', text: unmet > 0 ? `Power deficit ${unmet.toFixed(0)} W cannot be met` : `Battery at ${(this.soc * 100).toFixed(0)}%` });
    }
    this.last = { generation: gen, demand, net, soc: this.soc, capacityWh: this.capacityWh, busA: this.buses.A.ok, busB: this.buses.B.ok, unmet, voltage: this.cfg.busVoltage * (0.9 + 0.1 * this.soc) };
    return this.last;
  }
  margin() { // power margin = generation / demand - 1 at last step
    const l = this.last; if (!l || l.demand === 0) return null;
    return l.generation / l.demand - 1;
  }
}
