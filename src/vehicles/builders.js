// Parametric vehicle builders. They size propellant with the rocket equation and assemble complete, physically consistent
// vehicle definitions from the component catalog. The AI engineer and the "new vehicle" buttons use these.
import { ENGINES, byCatalogId, makeTank, makeStructure, makeNose, makeFairing, makeEngineCluster, resizeTank } from '../../data/components.js';
import { newVehicle, addComponent, hydrate, cloneVehicle, totalMass, nextId } from './vehicle.js';
import { analyzeVehicle, ascentDvRequired } from './analysis.js';
import { getBody } from '../../physics/bodies.js';
import { G0 } from '../../physics/constants.js';
import { PROPELLANTS } from '../../physics/propellants.js';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------------------------------------------
/** A self-contained space probe of (approximately) the requested total mass. All components are in group "payload". */
export function buildProbe({ name = 'Space probe', mass = 100, destination = 'mars', propellantFraction = 0.2, instruments = ['ins-camera', 'ins-spectrometer'], withHga = true } = {}) {
  const v = newVehicle({ name, type: 'probe', description: `${mass} kg probe (${destination})`, dataSource: 'user' });
  const D = round(Math.max(0.35, Math.cbrt(mass / 250 / (Math.PI / 4 * 0.9))), 2);
  const L = round(D * 0.9, 2);
  const panelArea = Math.max(0.6, round(0.02 * mass, 1));
  const propMass = round(mass * propellantFraction, 1);
  const mmh = round(propMass / 2.65, 1), nto = round(propMass - mmh, 1);
  const internals = [];
  const G = 'payload';
  // bus (mass is set last so the total matches)
  const bus = addComponent(v, { kind: 'payload', name: `${name} bus`, mount: 'stack', group: G, length: L, diameter: D, mass: 1, maxAccelG: 20, tMin: 233, tMax: 343, description: 'Probe primary structure.' });
  const child = (spec) => addComponent(v, { ...spec, mount: spec.mount ?? 'internal', group: G, parent: bus.id });
  child({ catalogId: 'computer-cdh' });
  child({ catalogId: mass >= 60 ? 'battery-500' : 'battery-100', name: 'Probe battery' });
  child({ catalogId: 'reaction-wheel' });
  if (propMass > 4) {
    child({ catalogId: 'eng-hyp05', mount: 'internal' });
    child({ ...makeTank('NTO', nto, Math.min(D * 0.8, 0.45)), name: 'Probe NTO tank', length: Math.min(0.2, L * 0.25), mount: 'internal' });
    child({ ...makeTank('MMH', mmh, Math.min(D * 0.8, 0.45)), name: 'Probe MMH tank', length: Math.min(0.2, L * 0.25), mount: 'internal' });
    // keep the fuel tanks' propellant mass correct even though their length was capped for packaging
  }
  for (const id of instruments) child({ catalogId: id });
  child({ catalogId: 'thermal-heater' });
  child({ catalogId: 'thermal-mli' });
  addComponent(v, { catalogId: 'rcs-mono', group: G, parent: bus.id, propellantMass: Math.max(1, round(mass * 0.02, 1)) });
  addComponent(v, { catalogId: panelArea >= 3 ? 'solar-4' : 'solar-1', group: G, parent: bus.id, area: round(panelArea / 2, 2), count: 2, name: 'Solar array (×2)', mass: round(panelArea * 3, 1) / 2 });
  addComponent(v, { catalogId: 'ant-omni', group: G, parent: bus.id });
  addComponent(v, { catalogId: 'ant-patch', group: G, parent: bus.id });
  if (withHga) addComponent(v, { catalogId: 'ant-hga', group: G, parent: bus.id });
  // fix bus mass so that total == requested mass
  const others = totalMass(v) - 1;
  bus.mass = Math.max(round(mass - others, 1), round(0.18 * mass, 1));
  v.stages = [{ id: G, name: 'Probe', order: 1 }];
  v.meta = { role: 'payload', destination, requestedMass: mass };
  return v;
}

/** Embed a payload vehicle (e.g. a probe) inside a fairing of `rocket`. Physically places its bus inside the payload volume. */
export function embedPayload(rocket, payloadVehicle, { fairingId } = {}) {
  const fairing = fairingId ? rocket.components.find((c) => c.id === fairingId) : rocket.components.find((c) => c.kind === 'fairing');
  if (!fairing) throw new Error('The rocket has no payload fairing to hold the payload.');
  const map = new Map();
  const added = [];
  for (const pc of payloadVehicle.components) {
    const spec = cloneVehicle({ components: [pc] }).components[0];
    const newId = nextId(rocket, spec.id.replace(/\d+$/, '') || 'pl');
    map.set(spec.id, newId);
    spec.id = newId;
    spec.group = 'payload';
    if (spec.mount === 'stack') { spec.mount = 'internal'; spec.parent = fairing.id; }
    else if (spec.parent && map.has(spec.parent)) spec.parent = map.get(spec.parent);
    rocket.components.push(spec);
    added.push(spec);
  }
  rocket.payload = { name: payloadVehicle.name, mass: totalMass(payloadVehicle), sourceVehicle: payloadVehicle.id };
  return added;
}

/** Remove all components of the payload group from a rocket and return them as a standalone vehicle (or null). */
export function extractPayload(rocket) {
  const comps = rocket.components.filter((c) => c.group === 'payload');
  return comps;
}

// ---------------------------------------------------------------------------------------------------------------
// Launch vehicle sizing
// ---------------------------------------------------------------------------------------------------------------
const S1_CANDIDATES = ENGINES.filter((e) => e.propellants?.length === 2 && e.propellants.includes('RP-1') && !e.vacuumOptimised && e.ispSl > 250);
const S2_CANDIDATES = ENGINES.filter((e) => e.propellants?.length === 2 && e.propellants.includes('RP-1') && e.vacuumOptimised);
const clusterDiameter = (d, n) => (n <= 1 ? d : n === 2 ? 2 * d : n <= 4 ? 2.1 * d : n <= 7 ? 2.7 * d : 3.2 * d);

/**
 * Add one launch-vehicle stage (engine cluster + fuel/oxidizer tanks) to a rocket. Stages are stacked from the bottom (stage 1)
 * upwards; a new stage is inserted below the upper section (avionics adapter, fairing, nose) when that exists.
 * A stage below the new one gets an interstage. Returns the created components.
 */
export function addLauncherStage(v, { order, engine, engineCount = 1, propellantMass, diameter, name } = {}) {
  const e = byCatalogId(engine);
  if (!e || e.kind !== 'engine') throw new Error(`Unknown engine "${engine}".`);
  if (!(propellantMass > 0)) throw new Error('A stage needs a propellant mass greater than zero.');
  const D = diameter ?? v.meta?.cfg?.D ?? 1.0;
  const group = `stage${order}`;
  if (v.components.some((c) => c.group === group)) throw new Error(`Stage ${order} already exists; use MODIFY_STAGE to change it.`);
  const stageName = name ?? `Stage ${order}`;
  const [pA, pB] = e.propellants;
  const roleOf = (p) => PROPELLANTS[p]?.role;
  const fuelP = roleOf(pA) === 'fuel' ? pA : pB, oxP = fuelP === pA ? pB : pA;
  const mr = e.mixtureRatio;
  const fuel = propellantMass / (1 + mr), ox = propellantMass - fuel;
  // insertion point: below the first upper-section component
  let idx = v.components.findIndex((c) => c.section === 'upper');
  if (idx < 0) idx = v.components.length;
  const ins = [];
  const put = (spec) => { const c = addComponent(v, spec, { index: idx }); idx = v.components.indexOf(c) + 1; ins.push(c); return c; };
  // interstage on the stage below (once)
  const below = v.stages.filter((s) => s.order < order).sort((a, b) => b.order - a.order)[0];
  if (below && !v.components.some((c) => c.group === below.id && c.kind === 'interstage')) {
    const lastBelow = Math.max(...v.components.map((c, k) => (c.group === below.id && c.mount === 'stack' ? k : -1)));
    const c = addComponent(v, { ...makeStructure('interstage', D, Math.max(0.5, 0.35 * D)), group: below.id, name: 'Interstage' }, { index: lastBelow + 1 });
    ins.push(c); idx = v.components.indexOf(c) + 1 > idx ? v.components.indexOf(c) + 1 : idx + 1;
    idx = v.components.findIndex((k) => k.section === 'upper'); if (idx < 0) idx = v.components.length;
  }
  put(makeEngineCluster(engine, engineCount, group, { diameter: D, name: `${e.name}${engineCount > 1 ? ' ×' + engineCount : ''}` }));
  put({ ...makeTank(fuelP, fuel, D), group, name: `${stageName} ${fuelP} tank` });
  put({ ...makeTank(oxP, ox, D), group, name: `${stageName} ${oxP} tank` });
  if (!v.stages.some((st) => st.id === group)) { v.stages.push({ id: group, name: stageName, order }); v.stages.sort((a, b) => a.order - b.order); }
  else v.stages.find((st) => st.id === group).name = stageName;
  // the avionics section always rides on the top stage
  const top = v.stages.filter((st) => /^stage\d+$/.test(st.id)).sort((a, b) => b.order - a.order)[0];
  for (const c of v.components) if (c.section === 'upper' && /^stage\d+$/.test(c.group ?? '')) c.group = top.id;
  return ins;
}

/** Avionics adapter + battery + RCS on the top stage, payload fairing and nose cone. */
export function addUpperSection(v, { diameter, payloadLength = 1.0 } = {}) {
  if (v.components.some((c) => c.section === 'upper')) return [];
  const D = diameter ?? v.meta?.cfg?.D ?? 1.0;
  const top = v.stages.filter((st) => /^stage\d+$/.test(st.id)).sort((a, b) => b.order - a.order)[0];
  if (!top) throw new Error('Create at least one stage before adding the payload section.');
  const G = top.id;
  const out = [];
  const adapter = addComponent(v, { ...makeStructure('structural_section', D, 0.6), group: G, name: 'Avionics bay / payload adapter', section: 'upper' }); out.push(adapter);
  out.push(addComponent(v, { catalogId: 'avionics-flight', group: G, parent: adapter.id, section: 'upper' }));
  out.push(addComponent(v, { catalogId: 'battery-500', group: G, parent: adapter.id, section: 'upper' }));
  out.push(addComponent(v, { catalogId: 'rcs-large', group: G, parent: adapter.id, mount: 'radial', section: 'upper' }));
  out.push(addComponent(v, { ...makeFairing(D, payloadLength + 0.4), group: 'fairing', section: 'upper' }));
  out.push(addComponent(v, { ...makeNose(D, 1.6 * D), group: 'fairing', section: 'upper' }));
  return out;
}

function launcherAssemble(cfg, p1, p2) {
  const v = newVehicle({ name: cfg.name, type: 'rocket', description: cfg.description ?? '', dataSource: 'user' });
  v.meta = { cfg: { D: cfg.D, payloadLength: cfg.payloadLength } };
  addLauncherStage(v, { order: 1, engine: cfg.e1, engineCount: cfg.n1, propellantMass: p1, diameter: cfg.D });
  addLauncherStage(v, { order: 2, engine: cfg.e2, engineCount: cfg.n2, propellantMass: p2, diameter: cfg.D });
  const up = addUpperSection(v, { diameter: cfg.D, payloadLength: cfg.payloadLength });
  const fairing = up.find((c) => c.kind === 'fairing');
  if (cfg.payloadVehicle) embedPayload(v, cfg.payloadVehicle, { fairingId: fairing.id });
  return v;
}

/**
 * Design a two-stage kerolox launch vehicle for the given payload and orbit.
 * Sizing = rocket equation with a loss budget, then verified by the real simulator (the caller should run a simulation).
 */
export function designLauncher(spec = {}) {
  const body = spec.body ?? 'earth';
  const payloadVehicle = spec.payloadVehicle ?? buildProbe({ mass: spec.payloadMass ?? 100 });
  const pMass = totalMass(payloadVehicle);
  const pBus = payloadVehicle.components.find((c) => c.kind === 'payload' && c.mount === 'stack') ?? payloadVehicle.components[0];
  const pL = pBus.length ?? 0.8, pD = pBus.diameter ?? 0.8;
  const targetAlt = spec.targetAltitude ?? 200000;
  const latitude = spec.latitude ?? 28.573;
  const req = ascentDvRequired(body, targetAlt, latitude, spec.losses ?? 1500);
  const dvReq = req.total * (spec.dvMargin ?? 1.045);
  const g = getBody(body).gravity;
  const restartable = spec.restartable !== false;
  let best = null;
  const D0 = spec.diameter ?? Math.max(pD + 0.22, 0.75);
  for (const f1 of (spec.stage1DvFractions ?? [0.40, 0.43, 0.46])) {
    let D = D0, cfg = null, plan = null;
    for (let iter = 0; iter < 8; iter++) {
      cfg = { name: spec.name ?? 'Launch vehicle', payloadVehicle, payloadLength: pL, D, e1: S1_CANDIDATES[0].catalogId, n1: 5, e2: S2_CANDIDATES[0].catalogId, n2: 1, upperMass: 1500, description: spec.description };
      plan = planStages(cfg, dvReq, f1, g, spec);
      if (!plan) break;
      const need = Math.max(D0, clusterDiameter(byCatalogId(plan.cfg.e1).diameter, plan.cfg.n1) * 1.05, clusterDiameter(byCatalogId(plan.cfg.e2).diameter, plan.cfg.n2) * 1.02);
      if (need > D + 1e-6) { D = round(need, 2); continue; }
      // slenderness: keep L/D below ~12
      const L = plan.vehicle.components.filter((c) => c.mount === 'stack').reduce((s, c) => s + c.length, 0);
      if (L / D > 13 && !spec.diameter) { D = round(D * 1.12, 2); continue; }
      break;
    }
    if (!plan) continue;
    const glow = totalMass(plan.vehicle);
    if (!best || glow < best.glow) best = { glow, plan };
  }
  if (!best) throw new Error('Could not size a launch vehicle for this payload and orbit.');
  const v = best.plan.vehicle;
  v.meta = { role: 'launcher', cfg: { D: best.plan.cfg.D, payloadLength: pL, e1: best.plan.cfg.e1, n1: best.plan.cfg.n1, e2: best.plan.cfg.e2, n2: best.plan.cfg.n2, p1: best.plan.info.p1, p2: best.plan.info.p2 }, targetAltitude: targetAlt, latitude, dvRequired: dvReq, restartableUpper: restartable, body, payloadMass: pMass, sizing: best.plan.info };
  v.name = spec.name ?? v.name;
  return v;
}

function planStages(cfg, dvReq, f1, g, spec) {
  // ----- stage 2 (upper) -----
  let bestPlan = null;
  const restartable = spec.restartable !== false;
  const cands = S2_CANDIDATES.filter((e) => (restartable ? e.ignitions > 1 : true));
  for (const e2 of cands) {
    for (const n2 of [1, 2, 3, 4]) {
      const c2 = { ...cfg, e2: e2.catalogId, n2, e1: cfg.e1, n1: cfg.n1 };
      // solve p2 for dv2
      const dv2Target = dvReq * (1 - f1);
      const p2 = bisect((p) => stageDv(launcherAssemble(c2, 1000, p), 1) - dv2Target, 20, 40000);
      if (p2 == null) continue;
      const v2 = launcherAssemble(c2, 1000, p2);
      const an = analyzeVehicle(v2, { body: spec.body ?? 'earth' });
      const s2 = an.stages[1];
      const twr = s2.twrVacStart;
      if (twr < (spec.upperTwr ?? 0.8)) continue;
      if (twr > 2.5 && n2 > 1) continue;
      const cost = n2 * e2.mass + 0.001 * p2;
      if (!bestPlan || cost < bestPlan.cost) bestPlan = { c2, p2, cost, e2 };
    }
    if (bestPlan) break; // smallest sufficient engine family
  }
  if (!bestPlan) return null;
  // ----- stage 1 -----
  let c1 = { ...bestPlan.c2 };
  let p1 = 3 * dvReq; // initial guess kg
  let vehicle = null;
  for (let iter = 0; iter < 6; iter++) {
    // choose engine cluster for liftoff TWR from previous estimate of total mass
    const Mtot = vehicle ? totalMass(vehicle) : 8000;
    const target = spec.twr ?? 1.4;
    let bestE = null;
    for (const e of S1_CANDIDATES) {
      const n = Math.ceil((target * Mtot * g) / (e.thrustVac * (e.ispSl / e.ispVac)));
      if (n < 1 || n > 9) continue;
      const twrN = (n * e.thrustVac * (e.ispSl / e.ispVac)) / (Mtot * g);
      const cost = n * e.mass + (n > 1 ? 0.5 * n : 0) + (twrN > target * 1.35 ? 1e6 * (twrN - target * 1.35) : 0);   // an oversized engine gives an excessive liftoff acceleration and Max-Q
      if (!bestE || cost < bestE.cost) bestE = { e, n, cost };
    }
    if (!bestE) return null;
    c1.e1 = bestE.e.catalogId; c1.n1 = bestE.n;
    const dv1Target = dvReq * f1;
    const sol = bisect((p) => stageDv(launcherAssemble(c1, p, bestPlan.p2), 0) - dv1Target, 100, 3e6);
    if (sol == null) return null;
    p1 = sol;
    vehicle = launcherAssemble(c1, p1, bestPlan.p2);
  }
  const an = analyzeVehicle(vehicle, { body: spec.body ?? 'earth' });
  if (an.liftoffTWR < 1.15) return null;
  return { vehicle, cfg: c1, info: { p1: round(p1, 0), p2: round(bestPlan.p2, 0), f1, dvRequired: dvReq, dvStage1: an.stages[0].dvSl, dvStage2: an.stages[1].dvVac, liftoffTWR: an.liftoffTWR } };
}

function stageDv(vehicle, index) {
  const an = analyzeVehicle(vehicle);
  const s = an.stages[index];
  return index === 0 ? 0.6 * s.dvSl + 0.4 * s.dvVac : s.dvVac;
}
function bisect(f, lo, hi) {
  let flo = f(lo), fhi = f(hi);
  if (flo > 0) return lo;
  if (fhi < 0) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm < 0) lo = mid; else hi = mid;
    if (hi - lo < 0.05) break;
  }
  return hi;
}

// ---------------------------------------------------------------------------------------------------------------
// Spacecraft / lander / rover
// ---------------------------------------------------------------------------------------------------------------
/** Find the propellant mass at which a vehicle produced by `assemble(prop)` reaches `targetDv` (vacuum, first stage) in the real mass model. */
function solvePropellant(assemble, targetDv, lo = 5, hi = 60000) {
  const dvOf = (p) => analyzeVehicle(assemble(p)).stages[0].dvVac;
  if (dvOf(hi) < targetDv) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dvOf(mid) < targetDv) lo = mid; else hi = mid;
    if (hi - lo < 0.05) break;
  }
  return hi;
}

export function buildSpacecraft({ name = 'Spacecraft', dryMass = 400, dv = 1800, panelArea = 6, engine = 'eng-hyp5' } = {}) {
  const e = byCatalogId(engine);
  const G = 'main';
  const D = 1.2;
  const assemble = (prop) => {
    const v = newVehicle({ name, type: 'spacecraft', description: `Orbital spacecraft with ${dv} m/s delta-v` });
    v.stages = [{ id: G, name: 'Spacecraft', order: 1 }];
    const mmh = round(prop / (1 + e.mixtureRatio), 1), nto = round(prop - mmh, 1);
    addComponent(v, { ...makeEngineCluster(engine, 1, G, { diameter: 0.5 }) });
    addComponent(v, { ...makeTank('MMH', mmh, D), group: G, name: 'MMH tank' });
    addComponent(v, { ...makeTank('NTO', nto, D), group: G, name: 'NTO tank' });
    const bus = addComponent(v, { kind: 'structural_section', mount: 'stack', group: G, name: 'Spacecraft bus', diameter: D, length: 1.0, mass: round(dryMass * 0.30, 1), strength: 1.4e6 * D * D, maxQAlpha: 3400 * D * D, tMax: 450, tMin: 150 });
    for (const s2 of [{ catalogId: 'computer-cdh' }, { catalogId: 'battery-500' }, { catalogId: 'reaction-wheel', count: 3, name: 'Reaction wheels ×3' }, { catalogId: 'thermal-heater' }, { catalogId: 'thermal-mli' }]) addComponent(v, { ...s2, group: G, parent: bus.id });
    addComponent(v, { catalogId: 'ins-camera', group: G, parent: bus.id });
    addComponent(v, { catalogId: 'rcs-mono', group: G, parent: bus.id, propellantMass: 12 });
    addComponent(v, { catalogId: 'solar-4', group: G, parent: bus.id, area: panelArea / 2, count: 2, name: 'Solar arrays (×2)', mass: round(panelArea * 2.6, 1) / 2 });
    addComponent(v, { catalogId: 'ant-omni', group: G, parent: bus.id });
    addComponent(v, { catalogId: 'ant-hga', group: G, parent: bus.id });
    addComponent(v, { catalogId: 'thermal-radiator', group: G, parent: bus.id, area: 1.5 });
    return v;
  };
  const prop = solvePropellant(assemble, dv);
  const v = assemble(round(prop, 1));
  v.meta = { role: 'spacecraft', dv };
  return v;
}

export function buildLander({ name = 'Lander', body = 'moon', payloadMass = 150, dryStructure = null, descentDv = null, landingLegs = true, extraGroups = null, carryRover = null, engine = null, diameter = 1.6, cabinName = 'Science payload' } = {}) {
  const B = getBody(body);
  const g = B.gravity;
  const G = 'lander';
  const D = diameter;
  const dv = descentDv ?? (body === 'moon' ? 2150 : body === 'mars' ? 1300 : 1500);
  const carriedMass = carryRover ? totalMass(carryRover) : payloadMass;
  const structure = dryStructure ?? Math.max(120, carriedMass * 1.0);
  const assemble = (prop, engId) => {
    const v = newVehicle({ name, type: 'lander', description: `Powered lander for ${B.name}` });
    v.stages = [{ id: G, name: 'Lander', order: 1 }];
    const mmh = round(prop / (1 + byCatalogId(engId).mixtureRatio), 1), nto = round(prop - mmh, 1);
    addComponent(v, makeEngineCluster(engId, 1, G, { diameter: 0.6 }));
    addComponent(v, { ...makeTank('MMH', mmh, D), group: G, name: 'MMH tank' });
    addComponent(v, { ...makeTank('NTO', nto, D), group: G, name: 'NTO tank' });
    const cabin = addComponent(v, { kind: 'structural_section', mount: 'stack', group: G, name: 'Lander deck', diameter: D, length: 0.9, mass: round(structure, 1), strength: 1.4e6 * D * D, maxQAlpha: 3400 * D * D, tMax: 450, tMin: 150 });
    addComponent(v, { catalogId: 'computer-cdh', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'guidance-gnc', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'battery-500', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'thermal-heater', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'thermal-mli', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'rcs-large', group: G, parent: cabin.id, propellantMass: 20 });
    addComponent(v, { catalogId: 'solar-1', group: G, parent: cabin.id, area: 2, count: 2, name: 'Solar panels (×2)', mass: 6, tracking: false });
    addComponent(v, { catalogId: 'ant-patch', group: G, parent: cabin.id });
    addComponent(v, { catalogId: 'ant-hga', group: G, parent: cabin.id });
    if (carryRover) {
      // the rover rides on the deck in its own group so that it can be deployed with DEPLOY_ROVER
      const map = new Map();
      for (const rc of carryRover.components) {
        const spec = JSON.parse(JSON.stringify(rc));
        const oldId = spec.id; delete spec.id;
        spec.group = 'rover'; spec.mount = 'body'; spec.parent = spec.parent && map.has(spec.parent) ? map.get(spec.parent) : cabin.id;
        map.set(oldId, addComponent(v, spec).id);
      }
      v.stages.push({ id: 'rover', name: carryRover.name ?? 'Rover', order: 2 });
    }
    else addComponent(v, { kind: 'payload', mount: 'internal', group: G, parent: cabin.id, name: cabinName, mass: payloadMass, length: 0.5, diameter: 0.9, maxAccelG: 15, tMin: 233, tMax: 343 });
    addComponent(v, { catalogId: 'ins-camera', group: G, parent: cabin.id });
    if (landingLegs) addComponent(v, { catalogId: 'legs-4', group: G, parent: cabin.id, footprintRadius: 1.9, legLength: 0.9, maxImpactVelocity: 3.5 });
    return v;
  };
  // choose the smallest descent engine that gives full-throttle TWR >= 1.8 (local gravity) and can throttle below the landing weight
  let choice = null;
  for (const id of (engine ? [engine] : ['eng-desc4', 'eng-desc15', 'eng-desc60'])) {
    const e = byCatalogId(id);
    const prop = solvePropellant((p) => assemble(p, id), dv);
    const v = assemble(prop, id);
    const m0 = totalMass(v), mLand = m0 - prop;
    const twr = e.thrustVac / (m0 * g);
    const tminOk = e.thrustVac * (e.minThrottle ?? 0.2) < 0.9 * mLand * g;
    if (twr >= 1.8 && tminOk) { choice = { id, prop }; break; }
    if (!choice) choice = { id, prop };
  }
  const v = assemble(round(choice.prop, 1), choice.id);
  v.meta = { role: 'lander', body, descentDv: dv };
  return v;
}

export function buildRover({ name = 'Rover', mass = 150, wheels = 6, batteryWh = 800, panelArea = 1.5 } = {}) {
  const v = newVehicle({ name, type: 'rover', description: `${mass} kg wheeled rover` });
  const G = 'rover';
  v.stages = [{ id: G, name: 'Rover', order: 1 }];
  const chassisMass = round(mass * 0.34, 1);
  addComponent(v, { catalogId: 'rover-chassis', group: G, mass: chassisMass, length: round(0.8 + mass / 300, 2), width: round(0.6 + mass / 400, 2), wheelbase: round(0.6 + mass / 400, 2), groundClearance: round(0.18 + mass / 2000, 2) });
  const wr = round(0.12 + mass / 1800, 2), wm = round(mass * 0.018, 1);
  addComponent(v, { catalogId: 'rover-wheel', group: G, count: wheels, radius: wr, mass: wm, width: round(wr * 0.85, 2) });
  addComponent(v, { catalogId: 'rover-motor', group: G, count: wheels, stallTorque: round(mass / wheels * 0.35, 1), mass: round(mass * 0.011, 1), maxPower: 90 });
  addComponent(v, { catalogId: batteryWh <= 500 ? 'battery-500' : 'battery-2000', group: G, mount: 'body', capacityWh: batteryWh, mass: round(batteryWh / 130, 1), name: 'Rover battery' });
  addComponent(v, { catalogId: 'solar-1', group: G, mount: 'body', area: panelArea, mass: round(panelArea * 3.2, 1), deployable: false, tracking: false, name: 'Rover solar panel' });
  addComponent(v, { catalogId: 'computer-cdh', group: G, mount: 'body', powerDraw: 18 });
  addComponent(v, { catalogId: 'ant-patch', group: G, mount: 'body', deployable: false });
  addComponent(v, { catalogId: 'rover-sensor', group: G });
  addComponent(v, { catalogId: 'ins-spectrometer', group: G, mount: 'body' });
  addComponent(v, { catalogId: 'thermal-heater', group: G, mount: 'body' });
  // no MLI blanket on the default rover: it is designed for daytime operation, where insulation would trap solar and motor heat
  addComponent(v, { catalogId: 'thermal-radiator', group: G, mount: 'body', area: round(0.25 + mass / 500, 2), mass: round(1.5 + mass / 100, 1), name: 'Rover radiator' });
  // scale the structure so that total mass is the requested mass
  const chassis = v.components.find((c) => c.kind === 'rover_chassis');
  chassis.mass = Math.max(round(chassis.mass + (mass - totalMass(v)), 1), 5);
  v.meta = { role: 'rover' };
  return v;
}

export const TEMPLATES = {
  rocket: () => designLauncher({ name: 'Small launcher', payloadMass: 100, targetAltitude: 200000 }),
  spacecraft: () => buildSpacecraft({ name: 'Orbital spacecraft' }),
  probe: () => buildProbe({ name: 'Mars probe', mass: 100 }),
  rover: () => buildRover({ name: 'Rover' }),
  lander: () => buildLander({ name: 'Lunar lander', body: 'moon' }),
};
