// Apollo-style Moon rocket (ASTRA LAB 1.9): a Saturn V-class three-stage stack with launch escape tower, Command/Service Module (CSM) and
// Lunar Module (LM) inside a conical adapter. Built only from catalog parts and the same component schema as every other vehicle.
// Masses, thrusts and Isp are rounded Apollo 11-era values (data label: "estimated"); the model is a lumped-parameter simulation, not a
// replica of the real hardware. Nothing here predicts an outcome: tests/apollo.test.js flies the finished stack in the real simulator.
import { byCatalogId, makeTank, makeStructure, makeEngineCluster } from '../../data/components.js';
import { PROPELLANTS } from '../../physics/propellants.js';
import { newVehicle, addComponent, cloneVehicle } from './vehicle.js';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const TANKS = new Set(['fuel_tank', 'oxidizer_tank', 'propellant_tank']);

/** Design numbers of the Apollo 11-era stack (kg, m). */
export const APOLLO = {
  name: 'Saturn V Moon rocket',
  D1: 10.1, D3: 6.6, Dcsm: 3.9,
  s1: { name: 'S-IC', engine: 'eng-f1', outer: 4, prop: 2050000, dry: 137000 },
  s2: { name: 'S-II', engine: 'eng-j2', count: 5, prop: 443000, dry: 36000 },
  s3: { name: 'S-IVB', engine: 'eng-j2', count: 1, prop: 111000, dry: 13500 },
  iu: { mass: 2000 },
  sla: { mass: 1800, length: 8.5 },
  csm: { smDry: 4200, smProp: 18400, cmMass: 5560 },
  les: { mass: 4160, length: 10.0 },
  lm: { descentDry: 2034, descentProp: 6900, ascentDry: 2300, ascentProp: 2500, cabinMass: 450 },
};
/** Friendly names of every group (the HUD and the fuel readouts use these). */
export const APOLLO_GROUPS = {
  stage1: 'S-IC (stage 1)', stage2: 'S-II (stage 2)', stage3: 'S-IVB (stage 3)', int12: 'S-IC/S-II interstage', les: 'Launch escape system',
  sla: 'Spacecraft adapter panels', sm: 'Service module', cm: 'Command module', lmd: 'Lunar module descent stage', lma: 'Lunar module ascent stage',
};

/** A tank with a compact length: common bulkheads, so the domes add only 0.1 D (the generic tank formula adds 0.4 D). */
function tank(propellant, mass, D, extra = {}) {
  const t = makeTank(propellant, mass, D, extra);
  const vol = (mass / PROPELLANTS[propellant].density) * 1.04;
  t.length = round(vol / (Math.PI * D * D / 4) + 0.1 * D, 2);
  return t;
}
const dryOf = (v, group) => v.components.filter((c) => c.group === group).reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0);
/** Make the dry mass (everything but propellant) of a group equal `target`: scale the tanks and structure that were sized by the generic
 *  formulas, never the engines. Returns the group's final dry mass. */
function fitDry(v, group, target, { skirt = true } = {}) {
  const cur = dryOf(v, group);
  if (cur < target && skirt) {
    const D = v.components.find((c) => c.group === group && c.kind === 'fuel_tank')?.diameter ?? 4;
    const idx = v.components.map((c, i) => (c.group === group ? i : -1)).filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), Infinity);
    const sk = addComponent(v, { ...makeStructure('structural_section', D, 1.2), group, name: `${v.stageNames?.[group] ?? group} thrust structure and skirt`, style: `skirt_${group}`, mass: round(target - cur, 1) }, { index: idx + 1 });
    return dryOf(v, group);
  }
  if (cur > target) {
    const movable = v.components.filter((c) => c.group === group && c.kind !== 'engine');
    const fixed = dryOf(v, group) - movable.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0);
    const f = Math.max(0.1, (target - fixed) / Math.max(movable.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0), 1));
    for (const c of movable) c.mass = round(c.mass * f, 1);
  }
  return dryOf(v, group);
}

/** Bring the dry mass of a group up to `target` by adding the structure, wiring and equipment that the catalog parts above do not list (added to the group's main structure part). */
function topUp(v, group, target, bus) {
  const deficit = target - dryOf(v, group);
  if (deficit > 0) bus.mass = round(bus.mass + deficit, 1);
  return dryOf(v, group);
}
/** One launch stage: engine cluster + tanks. `taper` = diameter at the top for a conical stage. Components are appended to the stack. */
function addStage(v, { order, name, engine, count, centerEngine = false, prop, D, dry, mixture }) {
  const e = byCatalogId(engine);
  const group = `stage${order}`;
  const mr = mixture ?? e.mixtureRatio;
  const fuelP = e.propellants.find((p) => ['RP-1', 'LH2', 'CH4', 'MMH'].includes(p)), oxP = e.propellants.find((p) => p !== fuelP);
  const fuel = prop / (1 + mr), ox = prop - fuel;
  const cl = makeEngineCluster(engine, count, group, { diameter: D * 0.85, name: `${name} ${e.name.split(' (')[0]} ×${count + (centerEngine ? 1 : 0)}` });
  const first = addComponent(v, cl);
  if (centerEngine) {
    const c = { ...JSON.parse(JSON.stringify(byCatalogId(engine))), count: 1, group, mount: 'internal', parent: first.id, name: `${name} centre engine`, diameter: byCatalogId(engine).diameter, length: round(first.length - 0.2, 2) };
    addComponent(v, c);
  }
  addComponent(v, { ...tank(fuelP, fuel, D), group, name: `${name} ${fuelP} tank` });
  addComponent(v, { ...tank(oxP, ox, D), group, name: `${name} ${oxP} tank` });
  v.stages = v.stages.filter((s) => s.id !== group); v.stages.push({ id: group, name, order }); v.stages.sort((a, b) => a.order - b.order);
  (v.stageNames ??= {})[group] = name;
  return group;
}

/** A cone-shaped (tapered) stack part: `diameter` = mean, `diameterBottom` / `diameterTop` tell the 3D drawing the real shape. */
const taper = (kind, bottom, top, length, extra = {}) => ({ ...makeStructure(kind === 'fairing' ? 'structural_section' : kind, (bottom + top) / 2, length), kind, diameterBottom: bottom, diameterTop: top, ...extra });

// ------------------------------------------------------------------------------------------------ spacecraft
function addCsm(v, G) {
  const D = G.Dcsm, S = G.csm;
  // ---- service module (group 'sm'): main engine, storable propellant, fuel cells, radios, radiators, attitude thrusters ----
  const e = byCatalogId('eng-sps');
  const mmh = round(S.smProp / (1 + e.mixtureRatio), 1), nto = round(S.smProp - mmh, 1);
  addComponent(v, makeEngineCluster('eng-sps', 1, 'sm', { diameter: 2.6, length: 2.4, name: 'SPS main engine' }));
  addComponent(v, { ...tank('MMH', mmh, D), group: 'sm', name: 'SM fuel tank (MMH)', style: 'sm_shell' });
  addComponent(v, { ...tank('NTO', nto, D), group: 'sm', name: 'SM oxidizer tank (NTO)', style: 'sm_shell' });
  const bus = addComponent(v, { ...makeStructure('structural_section', D, 3.2), group: 'sm', name: 'Service module bay', style: 'service_module' });
  const kid = (spec) => addComponent(v, { group: 'sm', parent: bus.id, ...spec });
  kid({ catalogId: 'fuel-cell', count: 3, name: 'Fuel cells ×3 (H2/O2)' });
  kid({ catalogId: 'computer-cdh', name: 'CSM computer' });
  kid({ catalogId: 'guidance-gnc', name: 'CSM guidance (IMU + star tracker)' });
  kid({ catalogId: 'thermal-heater' }); kid({ catalogId: 'thermal-mli', insulationFactor: 0.05, solarAbsorptivity: 0.15, name: 'Reflective thermal blankets' });
  kid({ catalogId: 'rcs-large', mount: 'radial', count: 4, name: 'SM RCS quads ×4', propellantMass: 110, torque: 1000, thrust: 450 });
  kid({ catalogId: 'ant-hga', mount: 'radial', name: 'S-band high-gain antenna', deployable: true });
  kid({ catalogId: 'ant-omni', mount: 'radial', name: 'Omni antenna' });
  kid({ catalogId: 'thermal-radiator', mount: 'radial', area: 6, count: 2, name: 'SM radiators (×2)', deployable: false, mass: 60 });
  fitDry(v, 'sm', S.smDry, { skirt: false }); topUp(v, 'sm', S.smDry, bus);
  // ---- command module (group 'cm'): crew compartment on its heat shield, batteries, computer, attitude thrusters ----
  addComponent(v, { catalogId: 'heat-shield', group: 'cm', name: 'CM heat shield', diameter: D, length: 0.5, mass: 850, tMax: 2800, noseRadius: 4.7, liftToDrag: 0.34, dataSource: 'estimated' });   // blunt Apollo shape: radius of curvature 4.7 m, trimmed at about 20 degrees so it flies with L/D 0.3
  const cm = addComponent(v, { kind: 'payload', mount: 'stack', group: 'cm', name: 'Command module crew compartment', diameter: D * 0.62, length: 3.0, mass: S.cmMass - 850 - 170, maxAccelG: 15, splashdown: true, impactTolerance: 12, tMin: 233, tMax: 343, style: 'command_module', diameterBottom: D, diameterTop: 0.9, dataSource: 'estimated' });
  const ckid = (spec) => addComponent(v, { group: 'cm', parent: cm.id, ...spec });
  ckid({ catalogId: 'computer-cdh', name: 'Apollo guidance computer' });
  ckid({ catalogId: 'battery-2000', count: 3, name: 'Entry batteries ×3' });
  ckid({ catalogId: 'rcs-large', mount: 'radial', count: 2, name: 'CM RCS', propellantMass: 25, torque: 700, thrust: 400 });
  ckid({ catalogId: 'thermal-heater' });
  // recovery parachutes (Apollo: two 5 m drogues at about 7 km, then three 25 m mains; total 170 kg taken out of the crew compartment's mass)
  ckid({ catalogId: 'chute-drogue-large', mount: 'radial', stage: 'drogue', name: 'Drogue parachutes (2 x 5 m)', dragArea: 20, deployTime: 3, mass: 30, maxDeployQ: 30000, maxLoad: 200000 });
  ckid({ catalogId: 'chute-huge', mount: 'radial', stage: 'main', name: 'Main parachutes (3 x 25 m)', dragArea: 1290, deployTime: 12, mass: 140, maxDeployQ: 9000, maxDeploySpeed: 140, maxLoad: 300000 });
  return cm;
}

function addLm(v, G, sla) {
  const L = G.lm;
  const exposedBus = (name, D, length, mass, group, style) => addComponent(v, { ...makeStructure('structural_section', D, length), group, name, mass, mount: 'internal', parent: sla.id, exposed: 'stack', style });
  // ---- descent stage (group 'lmd'): throttleable descent engine, propellant, landing legs, descent batteries ----
  const e = byCatalogId('eng-dps');
  const dbus = exposedBus('Descent stage structure', 4.2, 3.2, 600, 'lmd', 'lm_descent');
  const dk = (spec) => addComponent(v, { group: 'lmd', parent: dbus.id, ...spec });
  const dm = round(L.descentProp / (1 + e.mixtureRatio), 1), dn = round(L.descentProp - dm, 1);
  dk({ catalogId: 'eng-dps', mount: 'internal', name: 'Descent engine (DPS-class, throttleable)', diameter: 1.4 });
  dk({ ...tank('MMH', dm, 1.6), mount: 'internal', name: 'Descent fuel tank' });
  dk({ ...tank('NTO', dn, 1.6), mount: 'internal', name: 'Descent oxidizer tank' });
  dk({ catalogId: 'legs-4', name: 'Landing legs (4)', style: 'lm_legs', legLength: 1.6, footprintRadius: 4.7, mass: 180, maxImpactVelocity: 3.5, maxHorizontal: 1.5, deployable: true });
  dk({ catalogId: 'battery-2000', count: 16, name: 'Descent batteries' });
  dk({ catalogId: 'thermal-radiator', mount: 'radial', area: 3, count: 2, name: 'LM radiators', mass: 30 });
  fitDry(v, 'lmd', L.descentDry, { skirt: false }); topUp(v, 'lmd', L.descentDry, dbus);
  // ---- ascent stage (group 'lma'): crew cabin, small ascent engine, propellant, attitude thrusters, computer, antennas ----
  const abus = exposedBus('Ascent stage structure', 2.8, 3.0, 500, 'lma', 'lm_ascent');
  const ak = (spec) => addComponent(v, { group: 'lma', parent: abus.id, ...spec });
  const am = round(L.ascentProp / (1 + byCatalogId('eng-aps').mixtureRatio), 1), an = round(L.ascentProp - am, 1);
  ak({ catalogId: 'eng-aps', mount: 'internal', name: 'Ascent engine (APS-class)', diameter: 0.9 });
  ak({ ...tank('MMH', am, 1.0), mount: 'internal', name: 'Ascent fuel tank' });
  ak({ ...tank('NTO', an, 1.0), mount: 'internal', name: 'Ascent oxidizer tank' });
  ak({ kind: 'payload', mount: 'internal', name: 'Crew cabin (mass only: crew and life support are not simulated)', mass: L.cabinMass, length: 1.6, diameter: 2.3, maxAccelG: 12, tMin: 233, tMax: 343, style: 'lm_cabin', dataSource: 'estimated' });
  ak({ catalogId: 'computer-cdh', name: 'LM guidance computer' });
  ak({ catalogId: 'guidance-gnc', name: 'LM guidance (IMU + alignment optics)' });
  ak({ catalogId: 'battery-2000', count: 5, name: 'Ascent batteries' });
  ak({ catalogId: 'thermal-heater-large', name: 'Cabin and battery heaters (150 W)' }); ak({ catalogId: 'thermal-mli', insulationFactor: 0.05, solarAbsorptivity: 0.15, name: 'Gold-foil thermal blankets' });
  ak({ catalogId: 'rcs-large', mount: 'radial', count: 4, name: 'LM RCS quads ×4', propellantMass: 70, torque: 700, thrust: 450 });
  ak({ catalogId: 'ant-patch', mount: 'radial', name: 'S-band steerable antenna' });
  ak({ catalogId: 'ant-omni', mount: 'radial', name: 'VHF antenna' });
  fitDry(v, 'lma', L.ascentDry, { skirt: false }); topUp(v, 'lma', L.ascentDry, abus);
  return { dbus, abus };
}

/** Assemble the complete stack. `opts` may replace any number in APOLLO (deep merge by group). */
export function buildApolloStack(opts = {}) {
  const G = { ...APOLLO, ...opts };
  const v = newVehicle({ name: G.name, type: 'rocket', description: 'Saturn V-class Moon rocket: S-IC, S-II, S-IVB, launch escape tower, command/service module and lunar module in a conical adapter', dataSource: 'user' });
  v.stageNames = {};
  // ---------------- S-IC ----------------
  addStage(v, { order: 1, ...G.s1, count: G.s1.outer, centerEngine: true, D: G.D1 });
  fitDry(v, 'stage1', G.s1.dry);
  // interstage S-IC/S-II: stays with the S-II until it is jettisoned (group 'int12')
  addComponent(v, { ...makeStructure('interstage', G.D1, 5.0), group: 'int12', name: 'S-IC/S-II interstage', mass: 4500 });
  // ---------------- S-II ----------------
  addStage(v, { order: 2, ...G.s2, D: G.D1 });
  addComponent(v, { ...taper('interstage', G.D1, G.D3, 3.3), group: 'stage2', name: 'S-II/S-IVB interstage', style: 'taper_interstage', mass: 0 });
  fitDry(v, 'stage2', G.s2.dry);
  // ---------------- S-IVB + instrument unit ----------------
  addStage(v, { order: 3, ...G.s3, D: G.D3 });
  fitDry(v, 'stage3', G.s3.dry - 0);
  const iu = addComponent(v, { ...makeStructure('structural_section', G.D3, 0.9), group: 'stage3', name: 'Instrument unit', mass: G.iu.mass, style: 'instrument_unit' });
  for (const s of [{ catalogId: 'avionics-flight', name: 'Saturn guidance computer + IMU' }, { catalogId: 'guidance-gnc' }, { catalogId: 'battery-2000', count: 2, name: 'IU / S-IVB batteries' }, { catalogId: 'thermal-heater' }, { catalogId: 'thermal-mli' }]) addComponent(v, { ...s, group: 'stage3', parent: iu.id });
  addComponent(v, { catalogId: 'rcs-large', mount: 'radial', group: 'stage3', parent: iu.id, count: 2, name: 'S-IVB attitude control (APS-class ×2)', propellantMass: 120, torque: 3000, thrust: 650 });
  addComponent(v, { catalogId: 'ant-omni', mount: 'radial', group: 'stage3', parent: iu.id });
  // ---------------- spacecraft adapter (panels) with the lunar module inside ----------------
  const sla = addComponent(v, { ...taper('fairing', G.D3, G.Dcsm, G.sla.length), kind: 'fairing', group: 'sla', name: 'Spacecraft/LM adapter panels', mass: G.sla.mass, style: 'sla', jettison: true, maxQ: 65000 });
  addLm(v, G, sla);
  // ---------------- command/service module and launch escape system ----------------
  addCsm(v, G);
  addComponent(v, { kind: 'nose_cone', mount: 'stack', group: 'les', name: 'Launch escape tower', shape: 'cone', diameter: 1.0, length: G.les.length, mass: G.les.mass, style: 'les_tower', tMax: 900, tMin: 150, noseRadius: 0.05, maxQ: 80000, dataSource: 'estimated' });
  v.meta = { role: 'launcher', body: 'earth', cfg: { D: G.D1 }, targetAltitude: 185000, mission: 'apollo', apollo: true, thermalOuterSurface: true, thermalSink: { setpointK: 296, maxW: 4000, waterKg: 200 }, latitude: 28.573, groupNames: { ...APOLLO_GROUPS } };
  return v;
}

/** Total stack height [m] and liftoff mass [kg] (for the guide and the tests). */
export function stackFacts(v) {
  let H = 0, M = 0;
  for (const c of v.components) {
    if (c.mount === 'stack') H += c.length ?? 0;
    M += (c.mass ?? 0) * (c.count ?? 1) + ((TANKS.has(c.kind) || c.kind === 'rcs') ? (c.propellantMass ?? 0) : 0);
  }
  return { height: H, mass: M };
}

/** The Apollo command module on its own (2.3): crew compartment, heat shield, computer, batteries, thrusters and parachutes, for the trip back through the atmosphere. */
export function buildApolloCapsule() {
  const full = buildApolloStack();
  const v = cloneVehicle(full);
  v.name = 'Apollo command module'; v.type = 'spacecraft'; v.description = 'The part of Apollo that comes home: crew compartment, ablative heat shield, drogue and main parachutes.';
  v.components = v.components.filter((c) => c.group === 'cm');
  v.stageNames = {};
  v.meta = { role: 'capsule', body: 'earth', mission: 'apollo-return', apollo: true, cfg: { D: full.meta?.cfg?.D ?? 3.9 }, groupNames: { cm: 'Command module' } };
  return v;
}
