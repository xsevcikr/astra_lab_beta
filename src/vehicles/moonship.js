// Apollo-style Moon rocket (ASTRA LAB 1.8): a three-stage launcher, a service module and a lander (a cargo lander that carries a
// rover, or a lunar module with a crew-cabin mass), all assembled from the same parts and builders as every other vehicle.
// Nothing here predicts an outcome. The numbers in MOON_ROCKET were found by flying candidates in the real simulator
// (tests/moonrocket.test.js flies the finished design to the surface again).
import { byCatalogId, makeTank, makeEngineCluster, makeStructure, resizeTank } from '../../data/components.js';
import { newVehicle, addComponent, totalMass, nextId } from './vehicle.js';
import { addLauncherStage, addUpperSection, buildLander, buildRover } from './builders.js';
import { G0 } from '../../physics/constants.js';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** The design numbers of the ready-made Moon rocket (guide steps use the same numbers). */
export const MOON_ROCKET = {
  name: 'Moon rocket',
  D: 5.0,
  stage1: { engine: 'eng-al2000', engineCount: 4, propellantMass: 330000 },
  stage2: { engine: 'eng-al500v', engineCount: 3, propellantMass: 75000 },
  stage3: { engine: 'eng-al110h', engineCount: 3, propellantMass: 26000 },
  serviceModule: { name: 'Service module', dryMass: 900, dv: 1150 },
  lander: { name: 'Moon lander', cargo: 'rover', roverMass: 120, cabinMass: 1200 },
};

/** The two ready-made variants of the Moon rocket: same launcher, different cargo. */
export const MOON_VARIANTS = {
  'moon-rocket-rover': { name: 'Moon rocket (rover)', lander: { name: 'Moon lander', cargo: 'rover', roverMass: 120 } },
  'moon-rocket-module': { name: 'Moon rocket (lunar module)', lander: { name: 'Lunar module', cargo: 'cabin', cabinMass: 1200 } },
};

const bus = (v, G, name, D, mass) => addComponent(v, { kind: 'structural_section', mount: 'stack', group: G, name, diameter: D, length: 1.0, mass: round(mass, 1), strength: 1.4e6 * D * D, maxQAlpha: 3400 * D * D, tMax: 450, tMin: 150 });

/**
 * The service module: a main engine with storable propellant, solar arrays, batteries, a flight computer and radios. It rides on top of the
 * third stage, corrects the course on the way to the Moon and brakes the whole ship into lunar orbit.
 * `carry` = mass [kg] that sits on top of it (the lander): the propellant is sized so that this ship has `dv` m/s.
 */
export function buildServiceModule({ name = 'Service module', dryMass = 900, dv = 1150, carry = 4000, engine = 'eng-desc60', diameter = 2.0 } = {}) {
  const e = byCatalogId(engine);
  const G = 'orbiter', D = diameter;
  const assemble = (prop) => {
    const v = newVehicle({ name, type: 'spacecraft', description: 'Service module: course corrections and braking into lunar orbit' });
    v.stages = [{ id: G, name: 'Service module', order: 1 }];
    const mmh = round(prop / (1 + e.mixtureRatio), 1), nto = round(prop - mmh, 1);
    addComponent(v, makeEngineCluster(engine, 1, G, { diameter: 0.9 }));
    addComponent(v, { ...makeTank('MMH', mmh, D), group: G, name: 'MMH tank' });
    addComponent(v, { ...makeTank('NTO', nto, D), group: G, name: 'NTO tank' });
    const b = bus(v, G, 'Service module bus', D, dryMass * 0.45);
    for (const s of [{ catalogId: 'computer-cdh' }, { catalogId: 'guidance-gnc' }, { catalogId: 'battery-2000' }, { catalogId: 'reaction-wheel', count: 3, name: 'Reaction wheels ×3' }, { catalogId: 'thermal-heater' }, { catalogId: 'thermal-mli' }]) addComponent(v, { ...s, group: G, parent: b.id });
    addComponent(v, { catalogId: 'rcs-large', group: G, parent: b.id, propellantMass: 40 });
    addComponent(v, { catalogId: 'solar-4', group: G, parent: b.id, area: 5, count: 2, name: 'Solar arrays (×2)', mass: 30 });
    addComponent(v, { catalogId: 'ant-omni', group: G, parent: b.id });
    addComponent(v, { catalogId: 'ant-hga', group: G, parent: b.id });
    addComponent(v, { catalogId: 'thermal-radiator-dep10', group: G, parent: b.id, count: 3, name: 'Deployable radiators (×3)' });   // a big ship in sunlight for days must shed ~10 kW of absorbed sunlight
    return v;
  };
  const dvOf = (p) => {
    const v = assemble(p); const m0 = totalMass(v) + carry;
    return e.ispVac * G0 * Math.log(m0 / (m0 - p));
  };
  let lo = 5, hi = 40000;
  for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (dvOf(mid) < dv) lo = mid; else hi = mid; }
  const v = assemble(round(hi, 1));
  v.meta = { role: 'service-module', dv, carry };
  return v;
}

/** The Moon landers turn the whole ship around before the burn: three RCS modules instead of one give the torque for that. */
function strongRcs(v) {
  const r = v.components.find((c) => c.kind === 'rcs');
  if (r) { r.count = 3; r.name = 'RCS large modules (×3)'; r.propellantMass = 30; }
}

/** A lunar module: the lander with a crew-cabin mass (crew and life support are not simulated, only the mass and the cabin parts). */
export function buildLunarModule({ name = 'Lunar module', cabinMass = 1200, engine = 'eng-desc15' } = {}) {
  const v = buildLander({ name, body: 'moon', payloadMass: cabinMass, dryStructure: cabinMass * 0.6, engine, cabinName: 'Crew cabin (mass only)' });
  strongRcs(v);
  v.meta = { ...(v.meta ?? {}), role: 'lander', cargo: 'cabin' };
  return v;
}
/** A cargo lander that carries a rover to the surface. */
export function buildCargoLander({ name = 'Moon lander', rover = null, roverMass = 120, engine = null } = {}) {
  rover ??= buildRover({ name: 'Rover', mass: roverMass });
  const v = buildLander({ name, body: 'moon', carryRover: rover, engine });
  strongRcs(v);
  v.meta = { ...(v.meta ?? {}), role: 'lander', cargo: 'rover' };
  return v;
}

/**
 * Put the service module and the lander under the fairing of a rocket. Both keep their own groups ('orbiter', 'lander', 'rover'), so the
 * mission can fire, drop and land them one after the other. The service module sits below the lander.
 */
export function embedMoonShip(rocket, serviceModule, lander) {
  const fairing = rocket.components.find((c) => c.kind === 'fairing');
  if (!fairing) throw new Error('The rocket has no payload fairing to hold the Moon ship.');
  // drop an earlier ship
  for (const g of ['orbiter', 'lander', 'rover', 'payload']) rocket.components = rocket.components.filter((c) => c.group !== g);
  rocket.stages = rocket.stages.filter((s) => /^stage\d+$/.test(s.id));
  const added = [];
  let length = 0;
  for (const part of [serviceModule, lander]) {
    const map = new Map();
    for (const pc of part.components) {
      const spec = JSON.parse(JSON.stringify(pc));
      const oldId = spec.id; delete spec.id;
      if (spec.mount === 'stack') { if (spec.kind !== 'engine') length += spec.length ?? 0; spec.mount = 'internal'; spec.parent = fairing.id; }
      else if (spec.parent && map.has(spec.parent)) spec.parent = map.get(spec.parent);
      else if (!spec.parent || spec.mount === 'internal') spec.parent = spec.parent && map.has(spec.parent) ? map.get(spec.parent) : fairing.id;
      const c = addComponent(rocket, spec, { index: rocket.components.length });
      map.set(oldId, c.id); added.push(c);
    }
    for (const st of part.stages) if (!rocket.stages.some((s) => s.id === st.id)) rocket.stages.push({ id: st.id, name: st.name, order: 100 + rocket.stages.length });
  }
  fairing.length = Math.max(fairing.length ?? 0, round(length + 0.8, 2));
  rocket.payload = { name: `${serviceModule.name} + ${lander.name}`, mass: totalMass(serviceModule) + totalMass(lander), sourceVehicle: lander.id };
  return added;
}

/** Assemble a complete Moon rocket from the design numbers (defaults: MOON_ROCKET). */
export function buildMoonRocket(spec = {}) {
  const S = { ...MOON_ROCKET, ...spec };
  const lander = S.lander.cargo === 'cabin' ? buildLunarModule({ name: S.lander.name ?? 'Lunar module', cabinMass: S.lander.cabinMass }) : buildCargoLander({ name: S.lander.name ?? 'Moon lander', roverMass: S.lander.roverMass });
  const sm = buildServiceModule({ ...S.serviceModule, carry: totalMass(lander) });
  const v = newVehicle({ name: S.name, type: 'rocket', description: 'Three-stage Moon rocket with service module and lander', dataSource: 'user' });
  v.meta = { role: 'launcher', body: 'earth', cfg: { D: S.D }, targetAltitude: 185000, mission: 'moon' };
  for (const [i, k] of ['stage1', 'stage2', 'stage3'].entries()) addLauncherStage(v, { order: i + 1, ...S[k], diameter: S.D });
  addUpperSection(v, { diameter: S.D, payloadLength: 6 });
  embedMoonShip(v, sm, lander);
  v.meta.payloadMass = round(totalMass(sm) + totalMass(lander), 1);
  return v;
}
