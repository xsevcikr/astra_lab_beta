// Pure editing rules behind the mouse handles of the Vehicle Designer (no DOM here, so they are unit-tested).
// Every function changes the vehicle definition in place and returns what happened. Physics is never touched.
import { KIND_FIELDS } from '../../data/components.js';
import { PROPELLANTS } from '../../physics/propellants.js';
import { modifyComponent, moveComponent, findComponent } from '../../src/vehicles/vehicle.js';

const TANKS = new Set(['fuel_tank', 'oxidizer_tank', 'propellant_tank']);
const MAX_TANK_LENGTH = 60;
const snap = (x, step) => Math.round(x / step) * step;
const fieldRange = (c, key) => { const f = (KIND_FIELDS[c.kind] ?? []).find((f) => f[0] === key); return f ? [f[3], f[4]] : null; };

/** What the mouse may do with a component. */
export function editCaps(vehicle, c) {
  if (!c || vehicle.type === 'rover') return { length: false, diameter: false, move: null };
  const hasField = (k) => (KIND_FIELDS[c.kind] ?? []).some((f) => f[0] === k);
  const length = c.mount === 'stack' && (TANKS.has(c.kind) || (hasField('length') && c.kind !== 'payload' && c.kind !== 'rover_chassis') || (c.kind === 'payload' && hasField('length')));
  const diameter = c.mount === 'stack' && hasField('diameter');
  const move = c.mount === 'stack' ? 'stack' : c.mount === 'radial' ? 'radial' : null;
  return { length, diameter, move };
}

/** Set the length of a component (tanks: through their propellant capacity, keeping the diameter). Returns the value applied. */
export function setLength(vehicle, id, length) {
  const c = findComponent(vehicle, id); if (!c) throw new Error(`No component ${id}`);
  if (TANKS.has(c.kind)) {
    const P = PROPELLANTS[c.propellant]; const D = c.diameter;
    const minL = 0.4 * D + 0.1;
    const L = Math.max(minL, snap(length, 0.05));
    const area = (Math.PI * D * D) / 4;
    const mass = Math.max(1, Math.round(((L - 0.4 * D) * area * (P?.density ?? 1000)) / 1.04));
    modifyComponent(vehicle, id, { propellantMass: mass });
    return c.length;
  }
  const r = fieldRange(c, 'length') ?? [0.05, 30];
  const L = Math.min(r[1], Math.max(r[0], snap(length, 0.05)));
  modifyComponent(vehicle, id, { length: L });
  return L;
}

/** Set the diameter (tank length follows because the propellant volume stays the same). */
export function setDiameter(vehicle, id, diameter) {
  const c = findComponent(vehicle, id); if (!c) throw new Error(`No component ${id}`);
  const r = fieldRange(c, 'diameter') ?? [0.1, 20];
  const D = Math.min(r[1], Math.max(r[0], snap(diameter, 0.05)));
  modifyComponent(vehicle, id, { diameter: D });
  if (TANKS.has(c.kind)) {
    // a tank keeps its propellant volume, so a very thin tank would become absurdly long: stop at 60 m
    let d = D;
    while (c.length > MAX_TANK_LENGTH && d < r[1]) { d = Math.round((d + 0.05) * 100) / 100; modifyComponent(vehicle, id, { diameter: d }); }
    return d;
  }
  return D;
}

/**
 * Slide a component along the vehicle axis by `dx` metres (positive = towards the nose).
 * Stack parts swap places with their neighbour inside the same stage once they have moved past the neighbour's centre.
 * Radial parts (fins, legs, ...) slide along their parent. Returns {applied, remainder, blocked?}.
 */
export function slide(vehicle, id, dx, layout) {
  const c = findComponent(vehicle, id); if (!c) throw new Error(`No component ${id}`);
  if (c.mount === 'radial') {
    const par = layout?.placements.get(c.parent) ?? [...(layout?.placements.values() ?? [])].find((p) => p.mount === 'stack');
    const cur = layout?.placements.get(c.id)?.xc ?? 0;
    const lo = par ? par.x0 : 0, hi = par ? par.x1 : cur + dx;
    c.attachX = Math.min(hi, Math.max(lo, snap(cur + dx, 0.05)));
    return { applied: true, remainder: 0 };
  }
  if (c.mount !== 'stack') return { applied: false, remainder: 0, blocked: 'This part is mounted inside another part; move the container instead.' };
  let rest = dx, swapped = 0, blocked = null;
  for (let guard = 0; guard < 20 && Math.abs(rest) > 1e-9; guard++) {
    const list = vehicle.components; const i = list.findIndex((x) => x.id === id);
    const dir = rest > 0 ? 1 : -1;
    let j = i + dir; while (j >= 0 && j < list.length && list[j].mount !== 'stack') j += dir;
    if (j < 0 || j >= list.length) { rest = 0; break; }
    const nb = list[j];
    const need = ((c.length ?? 0) + (nb.length ?? 0)) / 2;
    if (Math.abs(rest) < need) break;
    if ((nb.group ?? null) !== (c.group ?? null)) { blocked = 'Parts stay inside their own stage. Use the stage list to change the stage order.'; rest = 0; break; }
    moveComponent(vehicle, id, dir > 0 ? j : j);   // the index of the neighbour after removal of this part
    swapped++; rest -= dir * (nb.length ?? 0);
  }
  return { applied: swapped > 0, swapped, remainder: rest, blocked };
}
