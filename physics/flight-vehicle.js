// Runtime (mutable) state of a vehicle during simulation. The vehicle *definition* (JSON) is never mutated.
import { tumblingArea } from './debris.js';
import { computeLayout, computeMassProperties, initialPropellant, isPresent, indexById, capacityOf } from './vehicle-model.js';
import { G0 } from './constants.js';
import { propRole } from './propellants.js';
import { ispAtPressure } from './propulsion.js';

const CP_SPECIFIC_HEAT = 900; // J/(kg K), aluminium-like structure

export class FlightVehicle {
  constructor(def, opts = {}) {
    this.def = def;
    this.byId = indexById(def);
    this.removedGroups = new Set();
    this.propMass = initialPropellant(def);
    this.reactant = {}; // fuel-cell reactants [kg] by component id
    for (const c of def.components) if (c.kind === 'fuel_cell') this.reactant[c.id] = (c.reactantMass ?? 100) * (c.count ?? 1);
    this.deployed = new Set(); // ids of deployable components that have been deployed
    for (const c of def.components) if (c.deployed) this.deployed.add(c.id);
    this.time = 0;
    this.flags = { fairingJettisoned: false, payloadDeployed: false };
    this.activeInstruments = new Map(); // id -> remaining seconds (Infinity = until stopped)
    this.dataStored = 0; this.dataDownlinked = 0; // bits
    this.engineCmd = new Map(); // engine id -> commanded throttle
    this._build();
    this.batteryWh = this.batteryCapacityWh() * (opts.batteryFill ?? 1);
    const capInit = this.batteryCapacityWh();
    this.powerState = { generation: 0, consumption: 0, net: 0, blackout: false, sunlit: true, batteryFraction: capInit > 0 ? this.batteryWh / capInit : 0 };
    this.commState = { link: false, margin: -99, range: 0, dataRate: 0, elevation: 0, pointingLoss: 0 };
    this.thermal = this._initThermal(opts.initialTemperature ?? 293);
    this.parachutes = def.components.filter((c) => c.kind === 'parachute').map((c) => ({ id: c.id, state: 'stowed', inflation: 0, tDeploy: 0 }));
    this.gimbal = [0, 0]; // commanded gimbal (rad) pitch/yaw for telemetry
    this.attitudeTorqueUse = { gimbal: 0, rcs: 0, wheels: 0 };
    this.refreshMass();
  }

  // ---------- structure ----------
  _build() {
    this.engines = [];
    for (const c of this.def.components) {
      if (c.kind !== 'engine') continue;
      this.engines.push({
        id: c.id, comp: c, group: c.group, state: 'off', throttle: 0, cmd: 0,
        ignitionsLeft: c.ignitions ?? 1, thrust: 0, mdot: 0, failed: false, burned: 0, ignitionTime: null,
      });
    }
    this.layoutDirty = true;
  }
  present(c) { return isPresent(c, this.removedGroups, this.byId); }
  presentComponents(kind) { return this.def.components.filter((c) => (!kind || c.kind === kind) && this.present(c)); }
  activeEngines() { return this.engines.filter((e) => this.present(e.comp)); }
  refreshMass() {
    if (this.layoutDirty || !this._layout) { this._layout = computeLayout(this.def, this.removedGroups); this.layoutDirty = false; }
    this.mp = computeMassProperties(this.def, { removedGroups: this.removedGroups, propMass: this.propMass, layout: this._layout });
    return this.mp;
  }
  get mass() { return this.mp.mass; }

  // ---------- commands ----------
  selectEngines(sel) {
    const act = this.activeEngines();
    if (!sel) return act;
    if (typeof sel === 'string') return act.filter((e) => e.group === sel || e.id === sel);
    if (sel.engine) return act.filter((e) => e.id === sel.engine);
    if (sel.group) return act.filter((e) => e.group === sel.group);
    return act;
  }
  ignite(sel, throttle = 1) {
    const res = { ignited: 0, failed: 0, reasons: [] };
    for (const e of this.selectEngines(sel)) {
      if (e.failed) { res.failed++; res.reasons.push(`${e.comp.name} has failed`); continue; }
      if (e.state === 'spent') { res.failed++; res.reasons.push(`${e.comp.name}: no propellant`); continue; }
      if (e.state === 'on') { e.cmd = throttle; res.ignited++; continue; }
      if (e.ignitionsLeft <= 0) { res.failed++; res.reasons.push(`${e.comp.name}: no ignitions remaining`); continue; }
      e.ignitionsLeft--; e.state = 'on'; e.cmd = throttle; e.ignitionTime = this.time; res.ignited++;
    }
    return res;
  }
  shutdown(sel) {
    let n = 0;
    for (const e of this.selectEngines(sel)) { if (e.state === 'on') { e.state = 'off'; e.cmd = 0; n++; } }
    return n;
  }
  setThrottle(sel, v) {
    for (const e of this.selectEngines(sel)) {
      if (e.state === 'on' && !e.comp.solid) e.cmd = Math.max(e.comp.minThrottle ?? 0, Math.min(1, v));
    }
  }
  /** Docked configuration: the groups sit in this order along the axis and some are upside down (see computeLayout). null = as built. */
  setDock(dock) {
    if (dock) this.removedGroups.dock = dock; else delete this.removedGroups.dock;
    this.layoutDirty = true; this.refreshMass();
  }
  /** Bring a separated group back (the command/service module docks again). */
  reattach(groups) {
    for (const g of groups) this.removedGroups.delete(g);
    this.layoutDirty = true; this.refreshMass();
  }
  /** Discard all components of a group (stage separation, fairing jettison). */
  /** Propellant [kg] currently held / originally loaded in the tanks of one group (for stage reserve reporting). */
  groupPropellant(group) {
    let left = 0, initial = 0;
    for (const c of this.def.components) if ((c.group ?? '__none__') === group && c.propellantMass != null && !this.removedGroups.has(group)) { left += this.propMass[c.id] ?? 0; initial += c.propellantMass * (c.count ?? 1); }
    return { left, initial };
  }
  /**
   * Snapshot of the hardware that is about to be discarded (call BEFORE separate / deployPayload) so that it can keep flying as debris.
   * Returns null when nothing would be discarded.
   */
  debrisSpec(groups) {
    const all = new Set(this.def.components.map((c) => c.group ?? '__none__'));
    const others = new Set([...all].filter((g) => !groups.has(g)));
    for (const g of this.removedGroups) others.add(g);
    const before = this.refreshMass();
    const mpDeb = computeMassProperties(this.def, { removedGroups: others, propMass: this.propMass, layout: before.layout });
    if (!(mpDeb.mass > 0)) return null;
    const solo = computeLayout(this.def, others);
    const mpSolo = computeMassProperties(this.def, { removedGroups: others, propMass: this.propMass, layout: solo });
    return {
      groups: [...groups], mass: mpDeb.mass, cgSolo: mpSolo.cg, offset: mpDeb.cg - before.cg,
      length: solo.length, diameter: solo.maxDiameter, area: tumblingArea(solo.length, solo.maxDiameter),
    };
  }
  separate(group) {
    (this.discardLog ??= []).push({ group, ...this.groupPropellant(group) });
    const before = this.presentComponents().length;
    this.removedGroups.add(group);
    this.layoutDirty = true;
    if (group === 'fairing') this.flags.fairingJettisoned = true;
    this.refreshMass();
    return before - this.presentComponents().length;
  }
  /** Keep only the given group (e.g. deploy the payload/spacecraft from the launcher). */
  deployPayload(group) {
    for (const g of new Set(this.def.components.map((c) => c.group ?? '__none__'))) if (g !== group && /^stage\d+$/.test(g) && !this.removedGroups.has(g)) (this.discardLog ??= []).push({ group: g, ...this.groupPropellant(g) });
    for (const c of this.def.components) {
      const g = c.group ?? '__none__';
      if (g !== group) this.removedGroups.add(g);
    }
    this.layoutDirty = true; this.flags.payloadDeployed = true;
    this.refreshMass();
  }
  deploy(sel) {
    let n = 0;
    for (const c of this.presentComponents()) {
      if (sel && !(c.id === sel || c.group === sel || c.kind === sel)) continue;
      if (['solar_panel', 'antenna', 'landing_legs', 'radiator'].includes(c.kind) && c.deployable !== false && !this.deployed.has(c.id)) { this.deployed.add(c.id); n++; }
    }
    return n;
  }
  deployParachute(id) {
    let n = 0;
    for (const p of this.parachutes) {
      const c = this.byId.get(p.id);
      if (!this.present(c) || p.state !== 'stowed') continue;
      if (id && id !== p.id && id !== c.group && id !== c.stage) continue;
      p.state = 'deploying'; p.tDeploy = this.time; n++;
    }
    return n;
  }

  // ---------- capabilities ----------
  hasGuidance(powered = true) {
    if (this.guidanceFailed) return false;
    if (powered && this.powerState.blackout) return false;
    return this.presentComponents().some((c) => c.guidance === true);
  }
  attitudeAuthority() {
    let rcs = 0, wheels = 0;
    for (const c of this.presentComponents()) {
      if (c.kind === 'rcs' && (this.propMass[c.id] ?? 0) > 0) rcs += c.torque ?? 0;
      if (c.kind === 'reaction_wheel') wheels += (c.torque ?? 0) * (c.count ?? 1);
    }
    return { rcs, wheels: this.powerState.blackout ? 0 : wheels };
  }
  batteryCapacityWh() { return this.presentComponents('battery').reduce((s, c) => s + (c.capacityWh ?? 0) * (c.count ?? 1), 0); }

  // ---------- propulsion ----------
  /** Per-engine thrust [N] and mass flow [kg/s] at ambient pressure p for a full step duty fraction of 1. */
  engineOutput(e, pAmb) {
    const c = e.comp;
    const n = c.count ?? 1;
    const isp = ispAtPressure(c.ispVac, c.ispSl ?? c.ispVac, pAmb);
    const mdot = (e.throttle * n * c.thrustVac) / (c.ispVac * G0); // mass flow set by *vacuum* thrust rating
    return { thrust: mdot * G0 * isp, mdot, isp };
  }
  /** Propellant availability fraction for the engine: 0..1 of the requested flow that feed system can supply over dt. */
  feedTanks(e) {
    const c = e.comp;
    if (c.solid) return { own: true };
    const groups = c.feedGroups ?? [c.group];
    const tanks = this.presentComponents().filter((t) => (t.kind === 'fuel_tank' || t.kind === 'oxidizer_tank' || t.kind === 'propellant_tank') && groups.includes(t.group));
    const by = {};
    for (const p of c.propellants ?? []) by[p] = tanks.filter((t) => t.propellant === p);
    return by;
  }
  /** Removes propellant for engine e for duration dt; returns actual duty fraction delivered [0..1]. */
  consume(e, mdot, dt) {
    const c = e.comp;
    if (mdot <= 0) return 1;
    const want = mdot * dt;
    if (c.solid) {
      const have = this.propMass[c.id] ?? 0;
      const take = Math.min(have, want);
      this.propMass[c.id] = have - take;
      return want > 0 ? take / want : 1;
    }
    const props = c.propellants ?? [];
    if (props.length === 0) return 0; // an engine with no declared propellant cannot run
    const feeds = this.feedTanks(e);
    // split mass flow among propellants
    let shares;
    if (props.length === 2) {
      const mr = c.mixtureRatio ?? 2.3; // oxidizer/fuel
      const roles = props.map(propRole);
      const oxIdx = roles.indexOf('oxidizer');
      shares = props.map((p, i) => (i === oxIdx ? mr / (1 + mr) : 1 / (1 + mr)));
    } else shares = props.map(() => 1 / Math.max(props.length, 1));
    let duty = 1;
    const avail = props.map((p) => (feeds[p] ?? []).reduce((s, t) => s + (this.propMass[t.id] ?? 0), 0));
    props.forEach((p, i) => { const need = want * shares[i]; if (need > 0) duty = Math.min(duty, avail[i] / need); });
    if (duty < 0) duty = 0;
    props.forEach((p, i) => {
      const take = want * shares[i] * duty;
      const tanks = feeds[p] ?? [];
      const tot = avail[i];
      if (tot <= 0) return;
      for (const t of tanks) this.propMass[t.id] = Math.max(0, (this.propMass[t.id] ?? 0) - take * ((this.propMass[t.id] ?? 0) / tot));
    });
    return duty;
  }
  propellantInGroup(group) {
    let m = 0, cap = 0;
    for (const c of this.presentComponents()) {
      if (group && c.group !== group) continue;
      const k = capacityOf(c);
      if (k > 0 && c.kind !== 'rcs') { m += this.propMass[c.id] ?? 0; cap += k; }
    }
    return { mass: m, capacity: cap, fraction: cap > 0 ? m / cap : 0 };
  }
  totalPropellant() { return this.propellantInGroup(null); }

  // ---------- thermal ----------
  _initThermal(T0) {
    const comps = this.presentComponents();
    const massTot = comps.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0);
    return {
      body: { T: T0, C: Math.max(massTot * CP_SPECIFIC_HEAT, 1) },
      lead: { T: T0, id: null, C: 1, area: 0, noseRadius: 0.3, tMax: 700, absorbed: 0 },
      maxRatio: 0,
    };
  }
  /** Re-select the leading (nose) thermal node after jettison events. */
  updateLeadNode() {
    const layout = this._layout;
    let top = null;
    for (let i = layout.stackIds.length - 1; i >= 0; i--) {
      const c = this.byId.get(layout.stackIds[i]);
      if (c) { top = c; break; }
    }
    if (this.shieldForward) { const sh = this.presentComponents('heat_shield')[0]; if (sh) top = sh; }   // flying heat shield first: the shield takes the heat, not the crew compartment
    if (!top) return;
    const l = this.thermal.lead;
    if (l.id === top.id) return;
    const wet = (top.length ?? 0.5) * Math.PI * (top.diameter ?? 0.5) * 0.5;
    const hadLead = l.id != null;
    l.id = top.id; l.C = Math.max((top.mass ?? 1) * CP_SPECIFIC_HEAT, 500);
    l.area = wet; l.tMax = top.tMax ?? 600;
    l.noseRadius = top.noseRadius ?? ((top.diameter ?? 0.5) * (top.kind === 'nose_cone' ? 0.08 : 0.5));
    // a component that was shielded (inside the fairing, behind a jettisoned stage) starts at the temperature of the vehicle body,
    // not at the skin temperature of the part that was just thrown away
    if (l.T < 1 || hadLead) l.T = this.thermal.body.T;
  }
}
