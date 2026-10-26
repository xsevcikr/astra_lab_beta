// Vehicle definition editing. Vehicle definitions are plain JSON documents (schema "astra.vehicle/1").
// Every editing function mutates the vehicle passed in; callers that need undo take a snapshot first (see src/core/history.js).
import { byCatalogId, resizeTank } from '../../data/components.js';

export const VEHICLE_TYPES = ['rocket', 'spacecraft', 'satellite', 'probe', 'lander', 'rover'];

export function newVehicle({ name = 'New vehicle', type = 'rocket', description = '', dataSource = 'user' } = {}) {
  return {
    schema: 'astra.vehicle/1', id: `veh_${Math.random().toString(36).slice(2, 8)}`, name, type, description, dataSource,
    stages: [], components: [],
  };
}
export const cloneVehicle = (v) => JSON.parse(JSON.stringify(v));

export function nextId(vehicle, prefix) {
  const used = new Set(vehicle.components.map((c) => c.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
const ID_PREFIX = {
  engine: 'eng', fuel_tank: 'fuel', oxidizer_tank: 'ox', propellant_tank: 'tank', rcs: 'rcs', nose_cone: 'nose', fairing: 'fairing', interstage: 'inter', structural_section: 'struct',
  fin: 'fin', heat_shield: 'shield', avionics: 'avn', guidance: 'gnc', computer: 'cpu', reaction_wheel: 'rw', battery: 'bat', solar_panel: 'sol', antenna: 'ant', instrument: 'ins',
  payload: 'pl', sensor: 'sens', radiator: 'rad', heater: 'heat', mli: 'mli', landing_legs: 'legs', parachute: 'chute', rover_chassis: 'chassis', wheel: 'wheel', motor: 'motor',
};

/** Build a full component from a spec {catalogId?, kind?, ...overrides}. */
export function hydrate(vehicle, spec) {
  let base = {};
  if (spec.catalogId) {
    const cat = byCatalogId(spec.catalogId);
    if (!cat) throw new Error(`Unknown catalog component: ${spec.catalogId}`);
    base = JSON.parse(JSON.stringify(cat));
  }
  const c = { ...base, ...JSON.parse(JSON.stringify(spec)) };
  if (!c.kind) throw new Error('Component needs a kind or a catalogId');
  c.mount ??= 'stack';
  c.id = c.id && !vehicle.components.some((x) => x.id === c.id) ? c.id : nextId(vehicle, ID_PREFIX[c.kind] ?? 'c');
  c.name ??= c.kind;
  c.dataSource ??= 'user';
  return c;
}

/**
 * Add a component. Placement: options.index (position in components array), options.after / options.before (component id),
 * otherwise appended (stack components go on top of the stack).
 */
export function addComponent(vehicle, spec, options = {}) {
  const c = hydrate(vehicle, spec);
  if (options.group) c.group = options.group;
  if (options.parent) c.parent = options.parent;
  let idx = vehicle.components.length;
  if (options.index != null) idx = options.index;
  else if (options.after) { const i = vehicle.components.findIndex((x) => x.id === options.after); if (i < 0) throw new Error(`No component ${options.after}`); idx = i + 1; }
  else if (options.before) { const i = vehicle.components.findIndex((x) => x.id === options.before); if (i < 0) throw new Error(`No component ${options.before}`); idx = i; }
  vehicle.components.splice(idx, 0, c);
  if (c.group && !vehicle.stages.some((s) => s.id === c.group) && /^stage\d+$/.test(c.group)) {
    const n = Number(c.group.slice(5));
    vehicle.stages.push({ id: c.group, name: `Stage ${n}`, order: n });
    vehicle.stages.sort((a, b) => a.order - b.order);
  }
  return c;
}

export function findComponent(vehicle, id) { return vehicle.components.find((c) => c.id === id) ?? null; }

export function removeComponent(vehicle, id) {
  const idx = vehicle.components.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error(`No component ${id}`);
  const removed = [vehicle.components[idx]];
  vehicle.components.splice(idx, 1);
  // cascade to children that depend on it
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = vehicle.components.length - 1; i >= 0; i--) {
      const c = vehicle.components[i];
      if (c.parent && !vehicle.components.some((x) => x.id === c.parent)) { removed.push(c); vehicle.components.splice(i, 1); changed = true; }
    }
  }
  return removed;
}

const TANK_KINDS = new Set(['fuel_tank', 'oxidizer_tank', 'propellant_tank']);
export function modifyComponent(vehicle, id, changes) {
  const c = findComponent(vehicle, id);
  if (!c) throw new Error(`No component ${id}`);
  const applied = {};
  for (const [k, v] of Object.entries(changes)) {
    if (['id', 'kind'].includes(k)) continue;
    c[k] = v; applied[k] = v;
  }
  if (TANK_KINDS.has(c.kind) && ('propellantMass' in changes || 'diameter' in changes || 'propellant' in changes)) resizeTank(c);
  if (c.kind === 'nose_cone' || c.kind === 'fairing') {
    if ('diameter' in changes || 'length' in changes) {
      const area = Math.PI * c.diameter * c.length * (c.kind === 'nose_cone' ? 0.6 : 1);
      if (!('mass' in changes)) c.mass = Math.max(1, Math.round(area * (c.kind === 'nose_cone' ? 6 : 5.5) * 10) / 10);
    }
  }
  if ((c.kind === 'structural_section' || c.kind === 'interstage') && ('diameter' in changes || 'length' in changes)) {
    if (!('mass' in changes)) c.mass = Math.max(2, Math.round(Math.PI * c.diameter * c.length * 21 * 10) / 10);
    if (!('strength' in changes)) c.strength = 1.4e6 * c.diameter ** 2;
    if (!('maxQAlpha' in changes)) c.maxQAlpha = 3400 * c.diameter ** 2;
  }
  c.dataSource = c.dataSource === 'real' ? 'user' : c.dataSource; // edited data is no longer the catalog value
  return { component: c, applied };
}

export function moveComponent(vehicle, id, newIndex) {
  const i = vehicle.components.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`No component ${id}`);
  const [c] = vehicle.components.splice(i, 1);
  vehicle.components.splice(Math.max(0, Math.min(newIndex, vehicle.components.length)), 0, c);
}

// ---------------- stages ----------------
export function addStage(vehicle, { name, order } = {}) {
  const n = order ?? (Math.max(0, ...vehicle.stages.map((s) => s.order)) + 1);
  const st = { id: `stage${n}`, name: name ?? `Stage ${n}`, order: n };
  if (vehicle.stages.some((s) => s.id === st.id)) throw new Error(`${st.id} already exists`);
  vehicle.stages.push(st); vehicle.stages.sort((a, b) => a.order - b.order);
  return st;
}
export function modifyStage(vehicle, id, changes) {
  const st = vehicle.stages.find((s) => s.id === id);
  if (!st) throw new Error(`No stage ${id}`);
  Object.assign(st, changes);
  vehicle.stages.sort((a, b) => a.order - b.order);
  return st;
}
export const componentsOfGroup = (vehicle, group) => vehicle.components.filter((c) => c.group === group);
export function findStage(vehicle, ref) {
  if (typeof ref === 'number') return vehicle.stages.find((s) => s.order === ref) ?? null;
  return vehicle.stages.find((s) => s.id === ref || s.name.toLowerCase() === String(ref).toLowerCase()) ?? null;
}

/** Scale the propellant of every tank in a group by `factor`, resizing tanks (used by "make the second stage bigger"). */
export function scaleStagePropellant(vehicle, group, factor) {
  const changed = [];
  for (const c of vehicle.components) {
    if (c.group === group && TANK_KINDS.has(c.kind)) {
      modifyComponent(vehicle, c.id, { propellantMass: Math.round(c.propellantMass * factor) });
      changed.push(c.id);
    }
  }
  return changed;
}
export function totalMass(vehicle) {
  return vehicle.components.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1) + ((['fuel_tank', 'oxidizer_tank', 'propellant_tank', 'rcs'].includes(c.kind) || c.solid) ? (c.propellantMass ?? 0) * (c.fill ?? 1) * (c.solid ? (c.count ?? 1) : 1) : 0), 0);
}
