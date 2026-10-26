// ToolAPI: executes the structured tools on a project. Every result is {ok, message, data?}; tools never throw across this boundary.
// Truthfulness rule: numbers in results come from the vehicle model or from a finished simulation, never from the AI.
import { TOOL_BY_NAME, validateArgs } from './toolspec.js';
import { Project, saveProject, loadProject, listProjects, saveRunFiles, loadRun, buildRunRecord, projectDir } from '../src/core/project.js';
import { slug } from '../src/core/storage.js';
import { runSimulation } from '../src/core/runner.js';
import { runMetrics, findings, timeline, compareMetrics } from '../src/core/run-analysis.js';
import { runExperiment, experimentToCSV } from '../src/core/experiments.js';
import { runMonteCarlo, monteCarloToCSV } from '../src/core/montecarlo.js';
import { CHANNEL_META, CHANNEL_INDEX } from '../physics/telemetry.js';
import { newVehicle, addComponent, removeComponent, modifyComponent, addStage, findStage, findComponent, cloneVehicle, totalMass } from '../src/vehicles/vehicle.js';
import { buildProbe, buildRover, buildLander, buildSpacecraft, designLauncher, embedPayload, addLauncherStage, addUpperSection } from '../src/vehicles/builders.js';
import { analyzeVehicle, validateVehicle } from '../src/vehicles/analysis.js';
import { buildServiceModule, buildLunarModule, buildCargoLander, embedMoonShip } from '../src/vehicles/moonship.js';
import { moonMission } from '../src/missions/moon.js';
import { buildApolloStack, stackFacts } from '../src/vehicles/apollo.js';
import { planApolloMission, apolloMissionFromPlan } from '../src/missions/apollo.js';
import { launchMission, landerMission, roverMission, orbitRaiseMission, probeOperationsMission, setMissionAltitude } from '../src/missions/generator.js';
import { CATALOG, byCatalogId, makeEngineCluster, makeTank } from '../data/components.js';
import { LAUNCH_SITES } from '../physics/bodies.js';
import { PROPELLANTS } from '../physics/propellants.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const round = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);
const MAX_COMPONENTS = 500, MAX_VEHICLES = 80, MAX_RUNS_IN_MEMORY = 40;
export const TUNE_CANDIDATES = [
  { hF: 100e3, n: 0.45 }, { hF: 100e3, n: 0.65 }, { hF: 140e3, n: 0.3 }, { hF: 180e3, n: 0.3 }, { hF: 120e3, n: 0.5 }, { hF: 90e3, n: 0.55 },
  { hF: 140e3, n: 0.4 }, { hF: 80e3, n: 0.7 }, { hF: 240e3, n: 0.25 }, { hF: 110e3, n: 0.35 }, { hF: 160e3, n: 0.35 }, { hF: 70e3, n: 0.8 },
];

const ok = (message, data = {}) => ({ ok: true, message, data });
const fail = (message, data = {}) => ({ ok: false, message, error: message, data });

function sanitizeProps(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (['__proto__', 'constructor', 'prototype', 'id', 'kind'].includes(k)) continue;
    if (typeof v === 'number') { if (!Number.isFinite(v) || Math.abs(v) > 1e12) throw new Error(`Value for "${k}" is out of range`); out[k] = v; }
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v) && v.length < 20 && v.every((x) => typeof x === 'string' || typeof x === 'number')) out[k] = v;
    else throw new Error(`Property "${k}" has an unsupported value type`);
  }
  return out;
}

/** Static design summary from the vehicle model (mass, Δv, T/W). */
export function vehicleSummary(v, body) {
  const b = body ?? v.meta?.body ?? (v.type === 'lander' ? (v.meta?.body ?? 'moon') : 'earth');
  const an = analyzeVehicle(v, { body: b });
  return {
    name: v.name, type: v.type, body: b, totalMass: round(an.totalMass, 1), dryMass: round(an.dryMass, 1), propellantMass: round(an.propellantMass, 1), payloadMass: round(an.payloadMass, 1),
    length: round(an.length, 2), diameter: round(an.diameter, 2), liftoffTWR: round(an.liftoffTWR, 2), dvVacuum: round(an.dvVacuum, 0), dvSeaLevel: round(an.dvSeaLevel, 0), dvEstimate: round(an.dvEstimate, 0),
    components: v.components.length,
    stages: an.stages.map((s) => ({ id: s.id, name: s.name, engines: s.engines, ignitionMass: round(s.ignitionMass, 0), propellant: round(s.propellant, 0), thrustVac: round(s.thrustVac, 0), dvVac: round(s.dvVac, 0), burnTime: round(s.burnTime, 0), twrStart: round(s.twrStart, 2) })),
  };
}

export class ToolContext {
  constructor({ project, storage = null, emit = () => {}, onProjectReplaced = () => {}, settings = {} } = {}) {
    this.project = project ?? new Project('AI project');
    this.storage = storage;
    this.emit = emit;
    this.onProjectReplaced = onProjectReplaced;
    this.runs = new Map();       // id -> {record, telemetry}
    this.runOrder = [];
    this.stopRequested = false;
    this.running = false;
    this.settings = settings;
  }
  registerRun(record, telemetry) {
    this.runs.set(record.id, { record, telemetry });
    this.runOrder.push(record.id);
    while (this.runOrder.length > MAX_RUNS_IN_MEMORY) this.runs.delete(this.runOrder.shift());
  }
}

export class ToolAPI {
  constructor(ctx) { this.ctx = ctx; this.log = []; }
  get project() { return this.ctx.project; }

  /** Validate and run one tool. Never throws. */
  async execute(name, args = {}) {
    const spec = TOOL_BY_NAME[name];
    if (!spec) return fail(`Unknown tool "${name}". Only the ASTRA LAB tools can be called.`);
    const errs = validateArgs(spec.parameters, args ?? {});
    if (errs.length) return fail(`Invalid arguments for ${name}: ${errs.join('; ')}`);
    let res;
    try {
      const fn = Object.hasOwn(TOOL_BY_NAME, name) ? this[`t_${name}`] : null;
      if (typeof fn !== 'function') return fail(`Unknown tool "${name}".`);
      res = await fn.call(this, args ?? {});
    } catch (e) { res = fail(`${name} failed: ${e.message}`); }
    this.log.push({ tool: name, args, ok: res.ok, message: res.message, ts: new Date().toISOString() });
    return res;
  }

  // ---------------------------------------------------------------- resolution helpers
  vehicle(ref, { required = true } = {}) {
    const P = this.project;
    let v = null;
    if (!ref || ref === 'active') v = P.vehicle;
    else v = P.vehicles[ref] ?? Object.values(P.vehicles).reverse().find((x) => x.name.toLowerCase() === String(ref).toLowerCase())
      ?? Object.values(P.vehicles).reverse().find((x) => x.name.toLowerCase().includes(String(ref).toLowerCase()));
    if (!v && required) throw new Error(ref ? `No vehicle "${ref}" in this project.` : 'There is no active vehicle yet. Create one first.');
    return v;
  }
  mission(ref) {
    const P = this.project;
    const m = !ref || ref === 'active' ? P.mission : (P.missions[ref] ?? Object.values(P.missions).find((x) => x.name.toLowerCase() === String(ref).toLowerCase()));
    if (!m) throw new Error(ref ? `No mission "${ref}".` : 'There is no active mission yet. Create one first.');
    return m;
  }
  async getRun(ref) {
    const ctx = this.ctx, P = this.project;
    const ids = [...ctx.runOrder];
    let id = ref;
    if (!ref || ref === 'last') id = ids[ids.length - 1] ?? P.runs[P.runs.length - 1]?.id;
    else if (ref === 'previous') id = ids.length > 1 ? ids[ids.length - 2] : P.runs[P.runs.length - 2]?.id;
    if (!id) throw new Error('There is no simulation run yet. Run a simulation first.');
    if (ctx.runs.has(id)) return { id, ...ctx.runs.get(id) };
    if (ctx.storage && P.runs.some((r) => r.id === id)) { const r = await loadRun(ctx.storage, P, id); ctx.registerRun(r.record, r.telemetry); return { id, ...r }; }
    throw new Error(`Run "${ref}" was not found.`);
  }
  vehicleReport(v, body) { try { return vehicleSummary(v, body); } catch (e) { return { name: v.name, error: e.message }; } }
  issues(v) { try { return validateVehicle(v, { body: v.meta?.body ?? 'earth' }).filter((i) => i.severity !== 'info'); } catch { return []; } }
  checkLimits(v) { if (v.components.length > MAX_COMPONENTS) throw new Error(`A vehicle can have at most ${MAX_COMPONENTS} components.`); }
  activate(v) { this.project.setVehicle(v, { activate: true }); }

  // ---------------------------------------------------------------- vehicle tools
  async t_CREATE_VEHICLE(a) {
    const P = this.project;
    if (Object.keys(P.vehicles).length >= MAX_VEHICLES) return fail('The project has too many vehicles; remove some first.');
    let v;
    switch (a.type) {
      case 'rocket': {
        if (a.auto) {
          const payload = a.payloadMass ?? 100;
          v = designLauncher({ name: a.name ?? 'Launch vehicle', payloadMass: payload, targetAltitude: a.targetAltitude ?? 200000, diameter: a.diameter, dvMargin: a.dvMargin ?? 1.0, body: a.body ?? 'earth' });
        } else {
          v = newVehicle({ name: a.name ?? 'Launch vehicle', type: 'rocket', description: 'Multi-stage launch vehicle', dataSource: 'user' });
          v.meta = { role: 'launcher', body: a.body ?? 'earth', cfg: { D: a.diameter ?? 1.2 }, targetAltitude: a.targetAltitude ?? 200000 };
        }
        break;
      }
      case 'probe': v = buildProbe({ name: a.name ?? 'Space probe', mass: a.mass ?? a.payloadMass ?? 100 }); break;
      case 'rover': v = buildRover({ name: a.name ?? 'Rover', mass: a.mass ?? 150 }); break;
      case 'lander': v = buildLander({ name: a.name ?? 'Lander', body: a.body ?? 'moon', payloadMass: a.payloadMass ?? 150 }); break;
      case 'spacecraft': case 'satellite':
        v = buildSpacecraft({ name: a.name ?? (a.type === 'satellite' ? 'Satellite' : 'Spacecraft'), dryMass: a.mass ?? (a.type === 'satellite' ? 250 : 400), dv: a.dv ?? (a.type === 'satellite' ? 300 : 1800), panelArea: a.type === 'satellite' ? 4 : 6 });
        v.type = a.type; break;
      default: return fail(`Unsupported vehicle type ${a.type}`);
    }
    this.activate(v);
    return ok(`Created ${v.type} "${v.name}".`, { vehicleId: v.id, summary: this.vehicleReport(v) });
  }

  async t_ADD_COMPONENT(a) {
    const v = this.vehicle(a.vehicle);
    const spec = {};
    if (a.catalogId) { if (!byCatalogId(a.catalogId)) return fail(`Unknown catalog component "${a.catalogId}". Use LIST_CATALOG to see the available parts.`); spec.catalogId = a.catalogId; }
    else if (a.kind) spec.kind = a.kind; else return fail('Give a catalogId or a kind.');
    if (a.group) spec.group = a.group;
    if (a.parent) { if (!findComponent(v, a.parent)) return fail(`Parent component "${a.parent}" does not exist.`); spec.parent = a.parent; }
    if (a.mount) spec.mount = a.mount;
    if (a.count) spec.count = a.count;
    Object.assign(spec, sanitizeProps(a.properties));
    const c = addComponent(v, spec);
    this.checkLimits(v);
    return ok(`Added ${c.name} (${c.id}) to ${v.name}.`, { componentId: c.id, summary: this.vehicleReport(v) });
  }

  async t_REMOVE_COMPONENT(a) {
    const v = this.vehicle(a.vehicle);
    const c = findComponent(v, a.id); if (!c) return fail(`No component "${a.id}" in ${v.name}.`);
    const removed = removeComponent(v, a.id);
    return ok(`Removed ${removed.map((r) => r.name).join(', ')} from ${v.name}.`, { removed: removed.map((r) => r.id), summary: this.vehicleReport(v) });
  }

  async t_MODIFY_COMPONENT(a) {
    const v = this.vehicle(a.vehicle);
    const c = findComponent(v, a.id); if (!c) return fail(`No component "${a.id}" in ${v.name}.`);
    const before = {}; const changes = sanitizeProps(a.changes);
    for (const k of Object.keys(changes)) before[k] = c[k];
    const r = modifyComponent(v, a.id, changes);
    return ok(`Changed ${r.component.name}: ${Object.entries(r.applied).map(([k, x]) => `${k} ${before[k] ?? '–'} → ${x}`).join(', ')}.`, { componentId: a.id, before, after: r.applied, summary: this.vehicleReport(v) });
  }

  async t_CREATE_STAGE(a) {
    const v = this.vehicle(a.vehicle);
    if (v.type !== 'rocket') return fail('Stages can only be created on a rocket. Create a rocket first (CREATE_VEHICLE type rocket).');
    const orders = v.stages.map((s) => s.order);
    const order = a.order ?? (orders.length ? Math.max(...orders) + 1 : 1);
    v.meta ??= {}; v.meta.cfg ??= {};
    if (a.diameter) v.meta.cfg.D = a.diameter;
    const added = addLauncherStage(v, { order, engine: a.engine, engineCount: a.engineCount ?? 1, propellantMass: a.propellantMass, diameter: a.diameter ?? v.meta.cfg.D, name: a.name });
    this.checkLimits(v);
    return ok(`Created ${a.name ?? 'Stage ' + order}: ${a.engineCount ?? 1} × ${byCatalogId(a.engine).name}, ${round(a.propellantMass, 0)} kg propellant.`, { stage: `stage${order}`, added: added.map((c) => c.id), summary: this.vehicleReport(v) });
  }

  async t_MODIFY_STAGE(a) {
    const v = this.vehicle(a.vehicle);
    const ref = /^\d+$/.test(String(a.stage)) ? Number(a.stage) : a.stage;
    const st = findStage(v, ref) ?? findStage(v, `stage${a.stage}`);
    if (!st) return fail(`No stage "${a.stage}" in ${v.name}. Stages: ${v.stages.map((s) => s.id).join(', ')}.`);
    const notes = [];
    const tanks = v.components.filter((c) => c.group === st.id && ['fuel_tank', 'oxidizer_tank', 'propellant_tank'].includes(c.kind));
    const cur = tanks.reduce((s, c) => s + c.propellantMass, 0);
    let factor = null;
    if (a.propellantMass != null) factor = a.propellantMass / Math.max(cur, 1e-9);
    if (a.propellantScale != null) factor = a.propellantScale;
    if (factor != null) {
      if (!tanks.length) return fail(`${st.name} has no propellant tanks.`);
      for (const t of tanks) modifyComponent(v, t.id, { propellantMass: Math.max(1, round(t.propellantMass * factor, 1)) });
      notes.push(`propellant ${round(cur, 0)} → ${round(tanks.reduce((s, c) => s + c.propellantMass, 0), 0)} kg`);
    }
    if (a.engine || a.engineCount) {
      const engs = v.components.filter((c) => c.group === st.id && c.kind === 'engine');
      if (!engs.length) return fail(`${st.name} has no engine to modify.`);
      const old = engs[0];
      if (a.engine && a.engine !== old.catalogId) {
        const ne = byCatalogId(a.engine); if (!ne) return fail(`Unknown engine "${a.engine}".`);
        if (ne.propellants.join() !== old.propellants.join() && ne.propellants.slice().sort().join() !== old.propellants.slice().sort().join()) return fail(`${ne.name} burns ${ne.propellants.join('+')} but the stage tanks hold ${old.propellants.join('+')}. Create a new stage instead.`);
        const idx = v.components.indexOf(old);
        const repl = addComponent(v, makeEngineCluster(a.engine, a.engineCount ?? old.count ?? 1, st.id, { diameter: old.diameter, name: `${ne.name}${(a.engineCount ?? old.count ?? 1) > 1 ? ' ×' + (a.engineCount ?? old.count) : ''}` }), { index: idx });
        removeComponent(v, old.id);
        notes.push(`engine ${old.name} → ${repl.name}`);
      } else if (a.engineCount) {
        old.count = a.engineCount; old.name = old.name.replace(/ ×\d+$/, '') + (a.engineCount > 1 ? ` ×${a.engineCount}` : '');
        notes.push(`engine count → ${a.engineCount}`);
      }
    }
    if (a.name) { st.name = a.name; notes.push(`renamed "${a.name}"`); }
    return ok(`Modified ${st.name}: ${notes.join('; ') || 'no change'}.`, { stage: st.id, summary: this.vehicleReport(v) });
  }

  async t_ADD_PAYLOAD(a) {
    // without a vehicle: the active one if it can carry a payload, otherwise the newest rocket (CREATE_PROBE / CREATE_ROVER make the payload active)
    let v = this.vehicle(a.vehicle);
    if (!a.vehicle && !['rocket', 'lander'].includes(v.type)) v = Object.values(this.project.vehicles).reverse().find((x) => x.type === 'rocket') ?? v;
    if (v.type === 'lander') {
      const pl = v.components.find((c) => c.kind === 'payload');
      if (!pl || a.mass == null) return fail('For a lander give a payload mass (the lander has a science payload bay).');
      modifyComponent(v, pl.id, { mass: a.mass });
      return ok(`Set the lander payload to ${a.mass} kg.`, { summary: this.vehicleReport(v) });
    }
    if (v.type !== 'rocket') return fail('Payloads can be added to rockets and landers.');
    if (a.serviceModule || a.lander) {
      if (!(a.serviceModule && a.lander)) return fail('A Moon ship needs both: serviceModule and lander.');
      const sm = this.vehicle(a.serviceModule), lm = this.vehicle(a.lander);
      if (sm.id === v.id || lm.id === v.id) return fail('A vehicle cannot be its own payload.');
      v.meta ??= {}; v.meta.cfg ??= {};
      let fairing = v.components.find((c) => c.kind === 'fairing');
      if (!fairing) { addUpperSection(v, { diameter: v.meta.cfg.D, payloadLength: 6 }); }
      embedMoonShip(v, sm, lm);
      v.meta.payloadMass = round(totalMass(sm) + totalMass(lm), 3); v.meta.mission = 'moon'; v.meta.targetAltitude = 185000;
      this.activate(v);
      const issues = this.issues(v).filter((i) => i.severity === 'error');
      return ok(`Placed ${sm.name} + ${lm.name} (${round(totalMass(sm) + totalMass(lm), 0)} kg) under the fairing of ${v.name}.${issues.length ? ' Warning: ' + issues.map((i) => i.message).join(' ') : ''}`, { payloadMass: round(totalMass(sm) + totalMass(lm), 1), issues, summary: this.vehicleReport(v) });
    }
    let payloadVehicle = null;
    if (a.payloadVehicle) { payloadVehicle = this.vehicle(a.payloadVehicle); if (payloadVehicle.id === v.id) return fail('A vehicle cannot be its own payload.'); }
    else if (a.mass) payloadVehicle = buildProbe({ name: a.name ?? 'Payload', mass: a.mass });
    else return fail('Give a payloadVehicle or a payload mass.');
    const pBus = payloadVehicle.components.find((c) => c.kind === 'payload' && c.mount === 'stack') ?? payloadVehicle.components[0];
    const pL = pBus.length ?? 0.8;
    v.meta ??= {}; v.meta.cfg ??= {};
    let fairing = v.components.find((c) => c.kind === 'fairing');
    if (!fairing) { addUpperSection(v, { diameter: v.meta.cfg.D, payloadLength: pL }); fairing = v.components.find((c) => c.kind === 'fairing'); }
    else if ((fairing.length ?? 0) < pL + 0.3) modifyComponent(v, fairing.id, { length: round(pL + 0.4, 2) });
    // replace an earlier payload
    // (removing a component can remove its children too, so look for the next payload part again after every removal)
    for (let c = v.components.find((x) => x.group === 'payload'); c; c = v.components.find((x) => x.group === 'payload')) removeComponent(v, c.id);
    embedPayload(v, payloadVehicle, { fairingId: fairing.id });
    v.meta.payloadMass = round(totalMass(payloadVehicle), 3);
    this.activate(v);   // the rocket (not the payload vehicle that CREATE_PROBE made active) stays the active vehicle
    const issues = this.issues(v).filter((i) => /PAYLOAD/.test(i.code));
    return ok(`Placed ${payloadVehicle.name} (${round(totalMass(payloadVehicle), 1)} kg) in the fairing of ${v.name}.${issues.length ? ' Warning: ' + issues.map((i) => i.message).join(' ') : ''}`, { payloadMass: round(totalMass(payloadVehicle), 1), issues, summary: this.vehicleReport(v) });
  }

  async t_CREATE_PROBE(a) {
    const v = buildProbe({ name: a.name ?? 'Space probe', mass: a.mass, destination: a.destination ?? 'mars' });
    this.activate(v);
    let extra = '';
    if (a.intoVehicle) { const r = await this.t_ADD_PAYLOAD({ vehicle: a.intoVehicle, payloadVehicle: v.id }); if (!r.ok) return r; extra = ' ' + r.message; }
    return ok(`Created probe "${v.name}" of ${round(totalMass(v), 1)} kg (${v.components.length} components).${extra}`, { vehicleId: v.id, summary: this.vehicleReport(v) });
  }
  async t_CREATE_ROVER(a) {
    const v = buildRover({ name: a.name ?? 'Rover', mass: a.mass ?? 150, wheels: a.wheels ?? 6, batteryWh: a.batteryWh ?? 800, panelArea: a.panelArea ?? 1.5 });
    this.activate(v);
    return ok(`Created rover "${v.name}" of ${round(totalMass(v), 1)} kg with ${a.wheels ?? 6} wheels.`, { vehicleId: v.id, summary: this.vehicleReport(v) });
  }
  async t_CREATE_LANDER(a) {
    const rover = a.carryRover ? this.vehicle(a.carryRover) : null;
    const body = a.body ?? 'moon';
    let v;
    if (a.forMoonRocket) {
      if (body !== 'moon') return fail('The Moon rocket carries landers for the Moon only.');
      v = rover ? buildCargoLander({ name: a.name ?? 'Moon lander', rover }) : buildLunarModule({ name: a.name ?? 'Lunar module', cabinMass: a.cabinMass ?? 1200 });
    } else v = buildLander({ name: a.name ?? 'Lander', body, payloadMass: a.payloadMass ?? 150, descentDv: a.descentDv ?? null, carryRover: rover });
    this.activate(v);
    const warn = this.issues(v).filter((i) => i.code === 'ATMOSPHERIC_ENTRY').map((i) => i.message);
    return ok(`Created ${body} lander "${v.name}" (${round(totalMass(v), 0)} kg${rover ? `, carrying rover "${rover.name}"` : ''}).${warn.length ? ' ' + warn[0] : ''}`, { vehicleId: v.id, warnings: warn, summary: this.vehicleReport(v, body) });
  }

  async t_CREATE_SERVICE_MODULE(a) {
    const lander = a.lander ? this.vehicle(a.lander) : null;
    const carry = lander ? totalMass(lander) : (a.carryMass ?? 2000);
    const v = buildServiceModule({ name: a.name ?? 'Service module', carry, dv: a.dv ?? 1150 });
    this.activate(v);
    return ok(`Created service module "${v.name}" of ${round(totalMass(v), 0)} kg (${round(v.components.reduce((s, c) => s + (c.propellantMass ?? 0), 0), 0)} kg propellant for ${a.dv ?? 1150} m/s with ${round(carry, 0)} kg on top).`, { vehicleId: v.id, summary: this.vehicleReport(v) });
  }

  async t_CREATE_APOLLO_ROCKET(a) {
    const v = buildApolloStack({ name: a.name ?? 'Saturn V' });
    this.activate(v);
    const f = stackFacts(v);
    return ok(`Created ${v.name}: three stages (S-IC, S-II, S-IVB), escape tower, command/service module and a lunar module in its adapter. ${round(f.height, 0)} m tall, ${round(totalMass(v) / 1000, 0)} t at liftoff.`, { vehicleId: v.id, summary: this.vehicleReport(v) });
  }

  // ---------------------------------------------------------------- mission tools
  async t_CREATE_MISSION(a) {
    const v = this.vehicle(a.vehicle);
    const o = { ...(a.options ?? {}) };
    if (a.name) o.name = a.name;
    if (a.altitude != null) o.altitude = a.altitude;
    if (a.inclination != null) o.inclination = a.inclination;
    if (a.body) o.body = a.body;
    if (a.site) { const s = LAUNCH_SITES.find((x) => x.id === a.site); if (!s) return fail(`Unknown launch site "${a.site}". Options: ${LAUNCH_SITES.map((x) => x.id).join(', ')}.`); o.site = s; }
    if (a.distance != null) o.distance = a.distance;
    let m;
    switch (a.kind) {
      case 'moon': {
        try { m = moonMission(v, { ...o, name: a.name }); } catch (e) { return fail(e.message); }
        break;
      }
      case 'apollo': {
        if (!v.meta?.apollo) return fail('The Apollo mission needs the Apollo-style rocket (CREATE_APOLLO_ROCKET).');
        try {
          m = apolloMissionFromPlan(v, planApolloMission(v), { name: a.name });   // flies the real ascent once (a few seconds) and searches the launch window
        } catch (e) { return fail(e.message); }
        break;
      }
      case 'launch': o.altitude ??= v.meta?.targetAltitude ?? 200000; m = launchMission(v, o); break;
      case 'landing': o.body ??= v.meta?.body ?? 'moon'; m = landerMission(v, o); break;
      case 'rover': o.body ??= this.project.environment.body !== 'earth' ? this.project.environment.body : 'moon'; m = roverMission(v, o); break;
      case 'orbit_raise': m = orbitRaiseMission(v, o); break;
      case 'probe_operations': m = probeOperationsMission(v, o); break;
      default: return fail(`Unknown mission kind ${a.kind}`);
    }
    m.vehicleName = v.name;
    this.project.setMission(m, { activate: true });
    return ok(`Created mission "${m.name}" with ${m.events.length} timeline events (objective: ${m.objective.type}).`, { missionId: m.id, objective: m.objective, events: m.events.map((e) => ({ id: e.id, name: e.name })) });
  }

  async t_MODIFY_MISSION(a) {
    const m = this.mission(a.mission);
    const notes = [];
    if (a.name) { m.name = a.name; notes.push('renamed'); }
    if (a.altitude != null) { setMissionAltitude(m, a.altitude); notes.push(`target altitude ${round(a.altitude / 1000, 0)} km`); }
    if (a.maxTime != null) { m.maxTime = a.maxTime; notes.push(`max time ${a.maxTime} s`); }
    if (a.schedule) { m.guidance ??= { mode: 'ascent', params: {} }; m.guidance.params ??= {}; m.guidance.params.schedule = sanitizeProps(a.schedule); notes.push(`pitch programme ${JSON.stringify(a.schedule)}`); }
    for (const op of a.operations ?? []) {
      if (op.op === 'add_event') { if (!op.event?.condition || !op.event?.action) return fail('add_event needs event.condition and event.action.'); const id = op.event.id ?? `ev${m.events.length + 1}`; m.events.push({ id, name: op.event.name ?? id, condition: clone(op.event.condition), action: clone(op.event.action), status: 'pending' }); notes.push(`added event ${id}`); }
      else if (op.op === 'remove_event') { const i = m.events.findIndex((e) => e.id === op.id); if (i < 0) return fail(`No event "${op.id}".`); m.events.splice(i, 1); notes.push(`removed event ${op.id}`); }
      else if (op.op === 'edit_event') { const e = m.events.find((x) => x.id === op.id); if (!e) return fail(`No event "${op.id}".`); for (const [k, val] of Object.entries(op.changes ?? {})) { if (['condition', 'action'].includes(k)) e[k] = { ...e[k], ...clone(val) }; else if (k === 'name') e.name = String(val).slice(0, 120); } notes.push(`edited event ${op.id}`); }
      else return fail(`Unknown operation ${op.op}`);
    }
    return ok(`Mission "${m.name}" updated: ${notes.join('; ') || 'no change'}.`, { missionId: m.id });
  }

  // ---------------------------------------------------------------- simulation tools
  simInputs(v, m) {
    const P = this.project;
    const env = { ...P.environment };
    const s = P.settings;
    return { vehicle: clone(v), mission: clone(m), environment: env, settings: { accuracy: s.accuracy, dt: s.dt, recordMax: s.recordMax, j2: !!s.j2, slosh: !!s.slosh, flex: !!s.flex, coastCap: undefined } };
  }
  async flyOnce(v, m, opts = {}) {
    const inp = this.simInputs(v, m);
    delete inp.settings.coastCap;
    return runSimulation(inp, { shouldStop: () => this.ctx.stopRequested, maxWallMs: (opts.maxWallSeconds ?? 300) * 1000, onProgress: (p) => this.ctx.emit({ type: 'sim-progress', t: p.t, wallMs: p.wallMs, alt: p.state.alt, speed: p.state.speed, mass: p.state.mass }) });
  }
  async t_RUN_SIMULATION(a) {
    const v = this.vehicle(a.vehicle), m0 = this.mission(a.mission);
    if (this.ctx.running) return fail('A simulation is already running. Use STOP_SIMULATION first.');
    const issues = this.issues(v).filter((i) => i.severity === 'error');
    if (issues.length) return fail(`The vehicle has design errors that make a simulation meaningless: ${issues.map((i) => i.message).join(' ')}`, { issues });
    this.ctx.running = true; this.ctx.stopRequested = false;
    try {
      let m = clone(m0), sim = null; const tried = [];
      const canTune = a.tune && m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit';
      if (canTune) {
        let best = null;
        // the schedule already saved in the mission is tried first (a design that was tuned before flies the same way again); `maxCandidates` limits the search
        const own = m.guidance?.params?.schedule;
        let list = own ? [own, ...TUNE_CANDIDATES.filter((c) => !(c.hF === own.hF && c.n === own.n))] : TUNE_CANDIDATES;
        if (a.maxCandidates > 0) list = list.slice(0, a.maxCandidates);
        for (const schedule of list) {
          const cand = clone(m); cand.guidance.params.schedule = schedule;
          const s = await this.flyOnce(v, cand, a);
          const good = s.result.status === 'SUCCESS';
          const fo = s.result.summary.finalOrbit, tgt = m.objective.altitude ?? 0;
          const err = Math.abs(fo.peri - tgt) + Math.abs(fo.apo - tgt);
          tried.push({ schedule, status: s.result.status, periKm: round(fo.peri / 1000, 0), apoKm: round(fo.apo / 1000, 0) });
          if (!best || (good && !best.good) || (good === best.good && err < best.err)) best = { sim: s, mission: cand, good, err };
          this.ctx.emit({ type: 'tuning', tried: tried.length, of: list.length, schedule, status: s.result.status });
          if (good || this.ctx.stopRequested) break;
        }
        sim = best.sim; m = best.mission;
      } else sim = await this.flyOnce(v, m, a);
      // Live Flight and Replay fly the saved schedule: a tuned schedule that reached the goal becomes the mission's own
      let scheduleSaved = false;
      if (a.saveSchedule && tried.length && sim.result.status === 'SUCCESS' && m0.guidance?.params) { m0.guidance.params.schedule = clone(m.guidance.params.schedule); scheduleSaved = true; }
      const rec = this.recordRun(sim, { name: a.name ?? `${v.name} — ${m.name}`, tried, scheduleSaved });
      const r = rec.result;
      const fo = r.summary.finalOrbit;
      const head = `${r.status}: ${r.reason}` + (m.objective.type === 'orbit' ? ` — final orbit ${round(fo.peri / 1000, 0)} × ${round(fo.apo / 1000, 0)} km` : '');
      return ok(`Simulation finished (T+${round(r.endTime, 0)} s, ${sim.stepCount} steps). ${head}.${tried.length ? ` Flew ${tried.length} candidate pitch programme(s).` : ''}`, { runId: rec.id, schedule: tried.length ? m.guidance.params.schedule : undefined, scheduleSaved, status: r.status, reason: r.reason, endTime: r.endTime, failureCodes: r.failures.map((f) => f.code), tuned: tried.length ? tried : undefined });
    } finally { this.ctx.running = false; this.ctx.stopRequested = false; }
  }
  /** Register a finished simulation as a run of the project (record + telemetry in memory, index entry in the project). Used by the AI tool and by the live UI. */
  recordRun(sim, { name, tried = [], scheduleSaved = false } = {}) {
    const rec = buildRunRecord(sim, { name });
    rec.meta = { tunedCandidates: tried.length ? tried : undefined, ...(scheduleSaved ? { scheduleSaved: true } : {}), ...(sim.mission?.guidance?.params?.schedule ? { schedule: clone(sim.mission.guidance.params.schedule) } : {}) };
    this.ctx.registerRun(rec, sim.telemetry);
    this.project.runs.push({ id: rec.id, name: rec.name, created: rec.created, vehicle: rec.vehicle.name, mission: rec.mission.name, status: rec.result.status, reason: rec.result.reason, endTime: rec.result.endTime, failures: rec.result.failures.map((f) => f.code), unsaved: true });
    return rec;
  }
  async t_STOP_SIMULATION() {
    if (!this.ctx.running) return fail('No simulation is running.');
    this.ctx.stopRequested = true; return ok('Stop requested; the simulation will end at the next step boundary.');
  }

  async t_READ_TELEMETRY(a) {
    const run = await this.getRun(a.run);
    const tel = run.telemetry;
    const bad = a.channels.filter((c) => CHANNEL_INDEX[c] === undefined);
    if (bad.length) return fail(`Unknown telemetry channel(s): ${bad.join(', ')}. Valid channels: ${Object.keys(CHANNEL_META).join(', ')}.`);
    const unit = (c) => CHANNEL_META[c].unit;
    const stat = a.stat ?? (a.at != null ? 'at' : 'series');
    const t0 = a.from ?? tel.column('t')[0], t1 = a.to ?? tel.column('t')[tel.count - 1];
    const i0 = tel.indexAt(t0), i1 = tel.indexAt(t1);
    const out = {};
    if (stat === 'at') { const s = tel.sample(a.at ?? t1); for (const c of a.channels) out[c] = { value: s[c], unit: unit(c), t: a.at ?? t1 }; }
    else if (stat === 'series') {
      const n = Math.min(a.points ?? 20, Math.max(2, i1 - i0 + 1)); const ts = []; for (let k = 0; k < n; k++) ts.push(t0 + ((t1 - t0) * k) / (n - 1));
      out.t = { values: ts, unit: 's' };
      for (const c of a.channels) out[c] = { values: ts.map((t) => tel.sample(t)[c]), unit: unit(c) };
    } else {
      for (const c of a.channels) {
        const col = tel.column(c); let best = null, bi = i0, sum = 0;
        for (let i = i0; i <= i1; i++) { const x = col[i]; sum += x; if (best === null || (stat === 'max' ? x > best : stat === 'min' ? x < best : false)) { best = x; bi = i; } }
        const v = stat === 'final' ? col[i1] : stat === 'mean' ? sum / (i1 - i0 + 1) : best;
        out[c] = { value: v, unit: unit(c), t: stat === 'max' || stat === 'min' ? tel.column('t')[bi] : stat === 'final' ? tel.column('t')[i1] : undefined };
      }
    }
    return ok(`Read ${a.channels.join(', ')} (${stat}) from run ${run.record.name}.`, { runId: run.id, stat, values: out });
  }

  async analysis(runRef) {
    const run = await this.getRun(runRef);
    const m = runMetrics(run.record, run.telemetry);
    return { run, metrics: m, findings: findings(run.record, run.telemetry, m), timeline: timeline(run.record), failures: run.record.result?.failures ?? [] };
  }
  async t_ANALYZE_RESULTS(a) {
    const r = await this.analysis(a.run);
    const res = r.run.record.result;
    const fs = r.failures.map((f) => ({ code: f.code, title: f.title, confidence: f.confidence, severity: f.severity, t: f.t, cause: f.primaryCause, contributing: f.contributing, evidence: f.evidence, consequences: f.consequences, solutions: f.solutions, equation: f.equation, causedBy: f.causedBy, rootCause: f.rootCause, propellantSuggested: f.propellantSuggested, dvShortfall: f.dvShortfall }));
    return ok(`Run "${r.run.record.name}": ${res.status} — ${res.reason}. ${fs.length} failure record(s).`, { runId: r.run.id, status: res.status, reason: res.reason, objective: res.objective, metrics: r.metrics, findings: r.findings, failures: fs, timeline: r.timeline.slice(0, 80) });
  }
  async t_COMPARE_SIMULATIONS(a) {
    const A = await this.getRun(a.a ?? 'previous'), B = await this.getRun(a.b ?? 'last');
    if (A.id === B.id) return fail('Need two different runs to compare.');
    const ma = runMetrics(A.record, A.telemetry), mb = runMetrics(B.record, B.telemetry);
    const cmp = compareMetrics(ma, mb);
    const design = diffVehicles(A.record.vehicle, B.record.vehicle);
    return ok(`Compared "${A.record.name}" (${ma.status}) with "${B.record.name}" (${mb.status}).`, { a: A.id, b: B.id, statusA: ma.status, statusB: mb.status, rows: cmp.rows, failuresFixed: cmp.failuresFixed, failuresIntroduced: cmp.failuresIntroduced, failuresRemaining: cmp.failuresRemaining, designChanges: design });
  }

  // ---------------------------------------------------------------- project tools
  async t_SAVE_PROJECT(a) {
    const { storage } = this.ctx; if (!storage) return fail('No storage is available in this session.');
    const P = this.project;
    if (a.name && a.name !== P.name) P.name = a.name;
    P.aiHistory = this.ctx.aiHistory ?? P.aiHistory;
    P.dir = P.dir ?? projectDir(P.name);
    for (const meta of P.runs) {
      if (!meta.unsaved) continue;
      const run = this.ctx.runs.get(meta.id);
      if (run) { await saveRunFiles(storage, P, run.record, run.telemetry); delete meta.unsaved; }
    }
    const dir = await saveProject(storage, P);
    return ok(`Saved project "${P.name}" to ${dir}.`, { dir });
  }
  async t_LOAD_PROJECT(a) {
    const { storage } = this.ctx; if (!storage) return fail('No storage is available in this session.');
    const list = await listProjects(storage);
    const hit = list.find((p) => p.name.toLowerCase() === a.name.toLowerCase() || p.dir === `projects/${slug(a.name)}`);
    if (!hit) return fail(`No saved project called "${a.name}". Saved projects: ${list.map((p) => p.name).join(', ') || 'none'}.`);
    const p = await loadProject(storage, hit.dir);
    this.ctx.project = p; this.ctx.runs.clear(); this.ctx.runOrder.length = 0;
    this.ctx.onProjectReplaced(p);
    return ok(`Loaded project "${p.name}" (${Object.keys(p.vehicles).length} vehicles, ${p.runs.length} runs).`, { name: p.name });
  }

  async t_CREATE_EXPERIMENT(a) {
    const v = this.vehicle(a.vehicle), m = this.mission(a.mission);
    if (this.ctx.running) return fail('A simulation is already running.');
    this.ctx.running = true; this.ctx.stopRequested = false;
    try {
      const inp = this.simInputs(v, m); delete inp.settings.coastCap;
      const exp = await runExperiment({ name: a.name ?? 'Experiment', parameters: a.parameters, objective: a.objective }, inp, { limit: 120, shouldStop: () => this.ctx.stopRequested, onProgress: (p) => this.ctx.emit({ type: 'experiment-progress', done: p.done, total: p.total }) });
      const stored = { ...exp, vehicle: v.name, mission: m.name };
      this.project.experiments.push({ name: exp.name, created: exp.created, cases: exp.cases.length, summary: exp.summary, best: exp.best, csv: experimentToCSV(exp) });
      this.ctx.lastExperiment = stored;
      const s = exp.summary;
      const bestTxt = exp.best ? ` Best case (${exp.objective.goal} ${exp.objective.metric} = ${round(exp.best.value, 3)}): ${Object.entries(exp.best.params).map(([k, x]) => `${k}=${round(x, 3)}`).join(', ')}.` : '';
      return ok(`Experiment "${exp.name}": ${s.cases} real simulations, ${s.success} succeeded, ${s.failed} failed${s.errors ? `, ${s.errors} errors` : ''}.${bestTxt}`, { summary: s, best: exp.best, cases: exp.cases.map((c) => ({ params: c.params, status: c.status, reason: c.reason, failures: (c.failures ?? []).map((f) => f.code), metrics: pick(c.metrics, ['endTime', 'maxAlt', 'finalPeri', 'finalApo', 'maxQ', 'maxG', 'propellantUsed', 'finalMass', 'touchdownVertical', 'distanceDriven']) })) });
    } finally { this.ctx.running = false; this.ctx.stopRequested = false; }
  }

  async t_RUN_MONTE_CARLO(a) {
    const v = this.vehicle(a.vehicle), m = this.mission(a.mission);
    if (this.ctx.running) return fail('A simulation is already running.');
    const issues = this.issues(v).filter((i) => i.severity === 'error');
    if (issues.length) return fail(`The vehicle has design errors that make a simulation meaningless: ${issues.map((i) => i.message).join(' ')}`);
    this.ctx.running = true; this.ctx.stopRequested = false;
    try {
      const inp = this.simInputs(v, m); delete inp.settings.coastCap;
      const mc = await runMonteCarlo({ name: a.name ?? 'Monte Carlo', runs: a.runs ?? 30, seed: a.seed ?? 1, factors: a.factors, correlations: a.correlations }, inp, { shouldStop: () => this.ctx.stopRequested, onProgress: (p) => this.ctx.emit({ type: 'experiment-progress', done: p.done, total: p.total }) });
      const an = mc.analysis;
      this.project.experiments.push({ name: mc.name, kind: 'montecarlo', created: mc.created, cases: mc.rows.length, summary: { cases: an.runs, success: an.success, failed: an.failed, errors: an.errors, successRate: an.successRate }, best: null, csv: monteCarloToCSV(mc) });
      this.ctx.lastMonteCarlo = { ...mc, vehicle: v.name, mission: m.name };
      const top = an.sensitivity[0];
      return ok(`${mc.name}: ${an.verdict}${an.errors ? ` (${an.errors} runs could not be simulated)` : ''}${top && top.rSuccess != null && Math.abs(top.rSuccess) > 0.3 ? ` The outcome depends most on "${top.factor}" (correlation ${top.rSuccess.toFixed(2)}).` : ''}`, { analysis: an, factors: mc.factors, seed: mc.seed });
    } finally { this.ctx.running = false; this.ctx.stopRequested = false; }
  }

  // ---------------------------------------------------------------- read-only helpers
  async t_DESCRIBE_VEHICLE(a) {
    const v = this.vehicle(a.vehicle);
    const s = this.vehicleReport(v);
    const issues = this.issues(v).map((i) => ({ severity: i.severity, code: i.code, message: i.message }));
    return ok(`${v.name}: ${s.totalMass} kg total, Δv (vacuum) ${s.dvVacuum} m/s${v.type === 'rocket' ? `, liftoff T/W ${s.liftoffTWR}` : ''}.${issues.length ? ` ${issues.length} design warning(s).` : ''}`, { summary: s, issues });
  }
  async t_LIST_CATALOG(a) {
    const items = CATALOG.filter((c) => !a.kind || c.kind === a.kind).slice(0, 120).map((c) => ({ catalogId: c.catalogId, kind: c.kind, name: c.name, mass: c.mass, thrustVac: c.thrustVac, ispVac: c.ispVac, propellants: c.propellants, dataSource: c.dataSource }));
    return ok(`${items.length} catalog component(s).`, { items });
  }
  async t_UNDO() { const l = this.project.undo(); return l ? ok(`Undid: ${l}.`) : fail('Nothing to undo.'); }
  async t_REDO() { const l = this.project.redo(); return l ? ok(`Redid: ${l}.`) : fail('Nothing to redo.'); }
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

/** What differs between two vehicle definitions (numeric fields of components with the same id, added / removed parts). */
export function diffVehicles(a, b) {
  const out = [];
  const ma = new Map(a.components.map((c) => [c.id, c])), mb = new Map(b.components.map((c) => [c.id, c]));
  for (const [id, cb] of mb) {
    const ca = ma.get(id);
    if (!ca) { out.push({ change: 'added', id, name: cb.name }); continue; }
    for (const k of ['propellantMass', 'count', 'mass', 'thrustVac', 'length', 'diameter', 'area']) if (ca[k] !== cb[k] && (ca[k] !== undefined || cb[k] !== undefined)) out.push({ change: 'modified', id, name: cb.name, field: k, from: ca[k], to: cb[k] });
  }
  for (const [id, ca] of ma) if (!mb.has(id)) out.push({ change: 'removed', id, name: ca.name });
  return out;
}
export { round };
