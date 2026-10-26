// Physical model of a vehicle definition: stack layout, presence after jettison, mass / CG / inertia.
// Vehicle coordinates: +X runs from the aft end (x=0, engines) toward the nose. Y, Z are lateral. Units: m, kg.
import { PROPELLANTS } from './propellants.js';

const INTERNAL_WALL = 0.03; // clearance between fairing wall and payload (m)

export function isPresent(comp, removedGroups, byId) {
  if (removedGroups.has(comp.group ?? '__none__')) return false;
  if (comp.parent) {
    const p = byId.get(comp.parent);
    // a component only disappears with its parent when they belong to the same group; a child of another group (a payload,
    // a rover) stays behind as a free-standing vehicle when that parent is separated
    if (p && (p.group ?? '__none__') === (comp.group ?? '__none__') && !isPresent(p, removedGroups, byId)) return false;
  }
  return true;
}
export const indexById = (vehicle) => new Map(vehicle.components.map((c) => [c.id, c]));

/**
 * Position every component along the vehicle axis.
 * Returns {placements: Map(id -> {x0,x1,xc,r,mount}), length, maxDiameter, stackIds}
 */
export function computeLayout(vehicle, removedGroups = new Set()) {
  const byId = indexById(vehicle);
  const placements = new Map();
  let cursor = 0, maxD = 0;
  const stack = [];
  // Docked configurations: `removedGroups.dock = {order:[group,...], flip:[group,...]}` lists the groups in the order they sit along the axis (aft
  // first) and the ones that sit upside down (the lunar module docked nose-to-nose with the command module). Other groups keep their place.
  const dock = removedGroups.dock ?? null;
  const rank = (c) => { const i = dock?.order ? dock.order.indexOf(c.group ?? '__none__') : -1; return i < 0 ? -1 : i; };
  const ordered = dock?.order ? vehicle.components.map((c, i) => [c, i]).sort((a, b) => (rank(a[0]) - rank(b[0])) || (a[1] - b[1])).map((x) => x[0]) : vehicle.components;
  const flipped = (c) => !!dock?.flip && dock.flip.includes(c.group ?? '__none__');
  // A part that rides INSIDE a container (the lunar module inside its launch adapter) joins the stack at its own place in the list
  // once the container has been jettisoned (`exposed: 'stack'`).
  const exposed = (c) => c.mount === 'internal' && c.exposed === 'stack' && !!c.parent && byId.has(c.parent) && !isPresent(byId.get(c.parent), removedGroups, byId);
  for (const c of ordered) {
    if (c.mount !== 'stack' && !exposed(c)) continue;
    if (!isPresent(c, removedGroups, byId)) continue;
    const L = c.length ?? 0, D = c.diameter ?? 0;
    placements.set(c.id, { x0: cursor, x1: cursor + L, xc: cursor + L / 2, r: D / 2, mount: 'stack', ...(flipped(c) ? { flip: true } : {}) });
    stack.push(c.id);
    cursor += L;
    if (D > maxD) maxD = D;
  }
  // internal components (payload inside fairing, subsystems inside a bus): stacked from the floor of the container.
  // If their summed lengths exceed the container's interior they are packed side by side (positions compressed, volume
  // fit is checked separately by validateVehicle), so nested equipment never sticks out of its bus.
  const fill = new Map();
  const sumLen = new Map();
  for (const c of ordered) {
    if (c.mount !== 'internal' || !c.parent || !isPresent(c, removedGroups, byId) || exposed(c)) continue;
    sumLen.set(c.parent, (sumLen.get(c.parent) ?? 0) + (c.length ?? 0));
  }
  for (const c of ordered) {
    if (c.mount !== 'internal') continue;
    if (!isPresent(c, removedGroups, byId) || exposed(c)) continue;
    const parent = c.parent && placements.get(c.parent);
    const L = c.length ?? 0;
    if (parent) {
      const interior = Math.max(parent.x1 - parent.x0 - 2 * INTERNAL_WALL, 1e-3);
      const tot = sumLen.get(c.parent) ?? L;
      const k = tot > interior ? interior / tot : 1;
      const start = fill.get(c.parent) ?? parent.x0 + INTERNAL_WALL;
      placements.set(c.id, { x0: start, x1: start + L * k, xc: start + (L * k) / 2, r: (c.diameter ?? 0) / 2, mount: 'internal', ...(flipped(c) ? { flip: true } : {}) });
      fill.set(c.parent, start + L * k);
    } else {
      // no live container: exposed on top of the stack
      placements.set(c.id, { x0: cursor, x1: cursor + L, xc: cursor + L / 2, r: (c.diameter ?? 0) / 2, mount: 'stack' });
      cursor += L; if ((c.diameter ?? 0) > maxD) maxD = c.diameter;
      stack.push(c.id);
    }
  }
  // radial components
  for (const c of vehicle.components) {
    if (c.mount !== 'radial') continue;
    if (!isPresent(c, removedGroups, byId)) continue;
    let par = c.parent && placements.get(c.parent);
    if (!par) {
      const sameGroup = vehicle.components.find((s) => s.mount === 'stack' && s.group === c.group && placements.has(s.id));
      par = sameGroup ? placements.get(sameGroup.id) : (stack.length ? placements.get(stack[0]) : { x0: 0, x1: 0, xc: 0, r: 0.5 });
    }
    const xc = c.attachX != null ? c.attachX : par.xc;
    placements.set(c.id, { x0: xc, x1: xc, xc, r: par.r + (c.radialOffset ?? 0.05), mount: 'radial', ...(flipped(c) ? { flip: true } : {}) });
  }
  return { placements, length: cursor, maxDiameter: maxD, stackIds: stack };
}

/** Propellant mass currently held by a component (tanks, RCS pods, solid motors). */
export function capacityOf(c) {
  if (c.kind === 'fuel_tank' || c.kind === 'oxidizer_tank' || c.kind === 'propellant_tank') return c.propellantMass ?? 0;
  if (c.kind === 'engine' && c.solid) return (c.propellantMass ?? 0) * (c.count ?? 1);
  if (c.kind === 'rcs') return c.propellantMass ?? 0;
  return 0;
}
export const isPropellantHolder = (c) => capacityOf(c) > 0 || c.kind === 'fuel_tank' || c.kind === 'oxidizer_tank' || c.kind === 'propellant_tank';

export function initialPropellant(vehicle) {
  const m = {};
  for (const c of vehicle.components) {
    const cap = capacityOf(c);
    if (cap > 0) m[c.id] = cap * (c.fill ?? 1);
  }
  return m;
}

/**
 * Mass, centre of gravity and inertia of the present vehicle.
 * @param opts.propMass  map componentId -> propellant kg (defaults to full)
 */
export function computeMassProperties(vehicle, opts = {}) {
  const removed = opts.removedGroups ?? new Set();
  const propMass = opts.propMass ?? initialPropellant(vehicle);
  const layout = opts.layout ?? computeLayout(vehicle, removed);
  const byId = indexById(vehicle);
  const elems = []; // {m, xc, L, r, kind:'cyl'|'shell'|'pt', rPt}
  let dry = 0, prop = 0;
  for (const c of vehicle.components) {
    if (!isPresent(c, removed, byId)) continue;
    const pl = layout.placements.get(c.id);
    const count = c.count ?? 1;
    const dm = (c.mass ?? 0) * count;
    dry += dm;
    const capacity = capacityOf(c);
    const pm = capacity > 0 ? Math.min(propMass[c.id] ?? 0, capacity) : 0;
    prop += pm;
    if (c.mount === 'body') { elems.push({ m: dm + pm, xc: 0, L: 0, r: 0, kind: 'pt', rPt: 0 }); continue; }
    if (!pl) continue;
    if (pl.mount === 'radial') {
      elems.push({ m: dm + pm, xc: pl.xc, L: 0, r: 0, kind: 'pt', rPt: pl.r });
    } else {
      const L = Math.max(c.length ?? 0, 1e-3), r = Math.max(pl.r, 1e-3);
      elems.push({ m: dm, xc: pl.xc, L, r, kind: 'shell' });
      if (pm > 0) {
        // propellant settles toward the aft end of its container (thrust acceleration assumed)
        const frac = capacity > 0 ? pm / capacity : 0;
        const fl = Math.max(L * frac, 1e-3);
        elems.push({ m: pm, xc: pl.x0 + fl / 2, L: fl, r: Math.max(r * 0.95, 1e-3), kind: 'cyl' });
      }
    }
  }
  const mass = dry + prop;
  let cg = 0;
  for (const e of elems) cg += e.m * e.xc;
  cg = mass > 0 ? cg / mass : 0;
  let Ilat = 0, Iax = 0;
  for (const e of elems) {
    const d = e.xc - cg;
    if (e.kind === 'pt') { Ilat += e.m * (d * d + (e.rPt * e.rPt) / 2); Iax += e.m * e.rPt * e.rPt; }
    else {
      const k = e.kind === 'shell' ? 1 : 0.5; // shell: m r^2, solid cylinder: m r^2 / 2
      Iax += k * e.m * e.r * e.r;
      Ilat += e.m * ((3 * e.r * e.r * (e.kind === 'shell' ? 2 : 1) + e.L * e.L) / 12 + d * d);
    }
  }
  return { mass, dryMass: dry, propellantMass: prop, cg, Ilat: Math.max(Ilat, 1e-3), Iax: Math.max(Iax, 1e-3), length: layout.length, maxDiameter: layout.maxDiameter, layout };
}

/** Tank geometry helper: length required to hold `mass` kg of `propellant` in a tank of `diameter` m. */
export function tankLengthFor(propellant, mass, diameter) {
  const rho = PROPELLANTS[propellant]?.density ?? 1000;
  const vol = (mass / rho) * 1.04; // 4% ullage
  const area = (Math.PI * diameter * diameter) / 4;
  return vol / area + 0.4 * diameter; // domes / bulkheads
}
