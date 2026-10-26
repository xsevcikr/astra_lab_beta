// One-click fixes for every design problem that validateVehicle (src/vehicles/analysis.js) can report.
// fixForIssue(vehicle, issue) -> a "fix" ({label, kind:'tool', steps:[...]}) or null when no safe automatic fix exists.
// A step is either a tool call of the validated tool API ({tool, args}, the same one the AI uses) or a small local edit
// ({edit:'name', args}) that runs through EDITS below. Nothing here is random or faked: each fix is a real change to the design.
// applyNeedFix(api, fix) (src/core/needs.js) runs the steps; the UI commits ONE undo step afterwards and re-validates.
import { analyzeVehicle, stageOrder, validateVehicle } from '../vehicles/analysis.js';
import { addComponent, findComponent, nextId } from '../vehicles/vehicle.js';
import { byCatalogId, ENGINES, makeTank, makeFairing, makeNose } from '../../data/components.js';
import { PROPELLANTS } from '../../physics/propellants.js';
import { G0 } from '../../physics/constants.js';

const TANK_KINDS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
export const isTank = (c) => TANK_KINDS.includes(c.kind);
const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;

export function stageName(v, id) { return v.stages?.find((s) => s.id === id)?.name ?? (/^stage(\d+)$/.test(id) ? `Stage ${/^stage(\d+)$/.exec(id)[1]}` : String(id)); }
export const analyse = (v, body) => { try { return analyzeVehicle(v, { body }); } catch { return null; } };

export function toolFix(label, steps, extra = {}) {
  const list = Array.isArray(steps) ? steps : [steps];
  return { label, kind: 'tool', tool: list[0].tool ?? 'LOCAL_EDIT', args: list[0].args ?? {}, steps: list, ...extra };
}

// ------------------------------------------------------------------ helpers shared with needs.js
/** Engine count (of the first-stage engine) that gives a safe lift-off thrust-to-weight, or null when even 33 engines are not enough. */
export function thrustFix(v, body, stage1) {
  const eng = v.components.find((c) => c.kind === 'engine' && c.group === stage1 && !c.solid);
  if (!eng) return null;
  for (let n = (eng.count ?? 1) + 1; n <= 33; n++) {
    const c = clone(v); c.components.find((x) => x.id === eng.id).count = n;
    const a = analyse(c, body);
    if (a && a.liftoffTWR >= 1.3) return { engine: eng, count: n };
  }
  return null;
}

/** Choose a catalog engine (and how many) that can burn what the stage tanks hold and gives a sensible thrust-to-weight. */
export function engineFix(v, body, stage, idx) {
  const props = new Set(v.components.filter((c) => c.group === stage.id && isTank(c)).map((c) => c.propellant));
  const first = idx === 0;
  let best = null;
  for (const e of ENGINES) {
    if (e.solid || !e.propellants?.length || e.thrustVac < 5000) continue;
    if (props.size && !e.propellants.every((p) => props.has(p))) continue;
    if (first && e.vacuumOptimised) continue;
    for (let n = 1; n <= 9; n++) {
      const c = clone(v);
      c.components.push({ ...clone(e), id: 'tmp-eng', group: stage.id, count: n, kind: 'engine', mount: 'stack' });
      const a = analyse(c, body); const s = a?.stages?.find((x) => x.id === stage.id);
      if (!s) continue;
      const ok = first ? a.liftoffTWR >= 1.3 : s.twrVacStart >= 0.4;
      if (ok) { const cost = e.thrustVac * n; if (!best || cost < best.cost) best = { e, n, cost }; break; }
    }
  }
  return best;
}

/** Tank(s) that an engine is missing: one ADD_COMPONENT call per missing propellant, sized for about two minutes of burn. */
export function tankSteps(v, engine, group) {
  const steps = [];
  const D = engine.diameter ?? v.meta?.cfg?.D ?? 1;
  const n = engine.count ?? 1;
  const mdot = (engine.thrustVac * n) / ((engine.ispVac ?? 300) * G0);
  const total = Math.max(50, Math.round(mdot * 120));
  const props = engine.propellants ?? [];
  const mr = engine.mixtureRatio ?? 2.5;
  for (const p of props) {
    if (v.components.some((t) => isTank(t) && t.group === group && t.propellant === p && (t.propellantMass ?? 0) > 0)) continue;
    const role = PROPELLANTS[p]?.role;
    const share = props.length === 1 ? 1 : role === 'oxidizer' ? mr / (1 + mr) : 1 / (1 + mr);
    let t; try { t = makeTank(p, Math.max(10, Math.round(total * share)), D); } catch { continue; }
    const { kind, mount, ...rest } = t;
    const properties = {}; for (const [k, val] of Object.entries(rest)) if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') properties[k] = val;
    properties.name = `${stageName(v, group)} ${p} tank`;
    steps.push({ tool: 'ADD_COMPONENT', args: { kind, group, mount: 'stack', properties } });
  }
  return steps;
}

// ------------------------------------------------------------------ local edits (serialisable steps)
/** name -> (vehicle, args) => message. They only use the same vehicle functions as the tool API. */
export const EDITS = {
  renameDuplicate(v, { id }) {
    const hits = v.components.filter((c) => c.id === id);
    if (hits.length < 2) return 'No duplicate left.';
    for (const c of hits.slice(1)) { const old = c.id; c.id = nextId(v, old.replace(/\d+$/, '') || 'c'); }
    return `Gave every part its own id (${id}).`;
  },
  setPropellants(v, { id, propellants, mixtureRatio }) {
    const e = findComponent(v, id); if (!e) throw new Error(`No engine ${id}.`);
    e.propellants = [...propellants]; if (mixtureRatio) e.mixtureRatio = mixtureRatio;
    return `${e.name} now burns ${propellants.join(' + ')}.`;
  },
  reattach(v, { id }) {
    const c = findComponent(v, id); if (!c) throw new Error(`No part ${id}.`);
    delete c.parent; c.mount = 'stack';
    return `${c.name} is now part of the main stack.`;
  },
  /** Put a fairing (and a nose cone) on a rocket whose payload sits in the open; the payload moves inside it. */
  addFairing(v) {
    const pl = v.components.filter((c) => c.kind === 'payload' && c.mount === 'stack');
    if (!pl.length) throw new Error('No payload to cover.');
    const pD = Math.max(...pl.map((c) => c.diameter ?? 0));
    const pL = pl.reduce((s, c) => s + (c.length ?? 0), 0);
    const D = Math.max(v.meta?.cfg?.D ?? 0, ...v.components.filter((c) => c.mount === 'stack' && c.kind !== 'payload').map((c) => c.diameter ?? 0), pD + 0.1);
    const f = addComponent(v, { ...makeFairing(r2(D), r2(Math.max(pL, 0.5) + 0.5)), group: 'fairing', section: 'upper' });
    addComponent(v, { ...makeNose(r2(D), r2(1.6 * D)), group: 'fairing', section: 'upper' });
    for (const c of pl) { c.mount = 'internal'; c.parent = f.id; c.group = 'payload'; }
    return 'Added a nose cover.';
  },
};

// ------------------------------------------------------------------ fairing fit (shared by PAYLOAD_* issues)
function fairingFit(v, f) {
  const kids = v.components.filter((c) => c.parent === f.id && c.mount === 'internal');
  if (!kids.length) return null;
  const vol = (c) => (Math.PI / 4) * (c.diameter ?? 0) ** 2 * (c.length ?? 0) * (c.count ?? 1);
  const used = kids.reduce((s, c) => s + vol(c), 0);
  let D = Math.max(f.diameter ?? 0, ...kids.map((k) => (k.diameter ?? 0) + 0.06 + 0.1));
  let L = f.length ?? 0;
  if (kids.length === 1) L = Math.max(L, (kids[0].length ?? 0) + 0.06 + 0.1);
  for (let i = 0; i < 60; i++) {
    const free = (Math.PI / 4) * (D - 0.06) ** 2 * (L - 0.06);
    if (used <= 0.7 * free) break;
    D *= 1.05; L *= 1.05;
  }
  D = r2(D + 0.005); L = r2(L + 0.005);
  if (D > 12 || L > 40) return null;
  return { D, L };
}

const biggerFairing = (v, f) => {
  const fit = f && fairingFit(v, f);
  return fit ? toolFix(`Make the ${f.name.replace(/ Ø.*/, '').toLowerCase()} bigger`, { tool: 'MODIFY_COMPONENT', args: { id: f.id, changes: { diameter: fit.D, length: fit.L } } }) : null;
};

const topGroup = (v) => { const o = stageOrder(v); return o.length ? o[o.length - 1].id : (v.stages?.[0]?.id ?? v.components[0]?.group ?? 'main'); };
const firstGroup = (v) => { const o = stageOrder(v); return o.length ? o[0].id : (v.components[0]?.group ?? 'main'); };

/** Catalog decoupler/engine helpers used by needs.js too. */
export function decouplerFix(v, belowId) {
  const D = Math.max(0.6, ...v.components.filter((c) => c.group === belowId && c.mount === 'stack').map((c) => c.diameter ?? 0));
  const ids = ['decoupler-0.6', 'decoupler-1.0', 'decoupler-1.6', 'decoupler-2.4'];
  const dd = (id) => byCatalogId(id)?.diameter ?? 0;
  const pick = ids.find((id) => dd(id) >= D - 1e-6) ?? ids[ids.length - 1];
  return toolFix(`Add a separation ring to ${stageName(v, belowId)}`, { tool: 'ADD_COMPONENT', args: { catalogId: pick, group: belowId, mount: 'stack' } });
}

// ------------------------------------------------------------------ the table: validateVehicle code -> fix builder
/** Codes with no safe automatic fix and the honest reason (shown in the UI instead of a button). */
export const NO_FIX = {
  ATMOSPHERIC_ENTRY: 'Landing through air needs an entry plan. Make it in the editor.',
  PANELS_STOWED: 'Not a mistake. Panels open later.',
  DISH_POINTING: 'Not a mistake. Aim the dish in the mission.',
};

const FIXERS = {
  EMPTY: (v) => toolFix('Build me a starter rocket', { tool: 'CREATE_VEHICLE', args: { type: 'rocket', auto: true, payloadMass: 100, targetAltitude: 200000, name: 'Starter rocket' } }),
  DUP_ID: (v, i) => toolFix('Give each part its own id', { edit: 'renameDuplicate', args: { id: i.componentId } }),
  NO_ENGINE: (v, i, body) => {
    const group = firstGroup(v);
    if (v.type === 'rocket' && !v.stages?.length) return toolFix('Add a first stage with an engine', { tool: 'CREATE_STAGE', args: { engine: 'eng-al500', engineCount: 1, propellantMass: 40000, order: 1 } });
    const pick = engineFix(v, body, { id: group }, 0);
    if (!pick) return null;
    const steps = [{ tool: 'ADD_COMPONENT', args: { catalogId: pick.e.catalogId, group, mount: 'stack', count: pick.n } }, ...tankSteps(v, { ...pick.e, count: pick.n }, group)];
    return toolFix(`Add ${pick.n > 1 ? pick.n + ' × ' : 'an '}${pick.e.name.replace(/ \(.*\)/, '')}`, steps);
  },
  NO_FEED: (v, i) => {
    const e = findComponent(v, i.componentId); if (!e) return null;
    const steps = tankSteps(v, e, (e.feedGroups ?? [e.group])[0]);
    return steps.length ? toolFix('Add the missing tank', steps) : null;
  },
  NO_PROPELLANT_DEF: (v, i) => {
    const e = findComponent(v, i.componentId); if (!e) return null;
    const cat = byCatalogId(e.catalogId);
    const have = new Set(v.components.filter((t) => isTank(t) && t.group === e.group).map((t) => t.propellant));
    const props = cat?.propellants?.length ? cat.propellants : (['RP-1', 'LOX'].every((p) => have.has(p)) || !have.size ? ['RP-1', 'LOX'] : [...have].slice(0, 2));
    return toolFix(`Set the fuel: ${props.join(' + ')}`, { edit: 'setPropellants', args: { id: e.id, propellants: props, mixtureRatio: cat?.mixtureRatio ?? (props.length === 2 ? 2.5 : undefined) } });
  },
  BAD_PROPELLANT_PAIR: (v, i) => {
    const e = findComponent(v, i.componentId); if (!e) return null;
    const cat = byCatalogId(e.catalogId);
    const props = cat?.propellants?.length === 2 ? cat.propellants : ['RP-1', 'LOX'];
    return toolFix(`Use a real fuel pair: ${props.join(' + ')}`, { edit: 'setPropellants', args: { id: e.id, propellants: props, mixtureRatio: cat?.mixtureRatio ?? 2.5 } });
  },
  TANK_UNUSED: (v, i) => i.componentId ? toolFix('Remove the unused tank', { tool: 'REMOVE_COMPONENT', args: { id: i.componentId } }) : null,
  PAYLOAD_TOO_LONG: (v, i) => biggerFairing(v, findComponent(v, i.componentId)),
  PAYLOAD_TOO_BIG: (v, i) => biggerFairing(v, findComponent(v, i.componentId)),
  PAYLOAD_TOO_WIDE: (v, i) => { const k = findComponent(v, i.componentId); return biggerFairing(v, k && findComponent(v, k.parent)); },
  ORPHAN: (v, i) => toolFix('Attach it to the main stack', { edit: 'reattach', args: { id: i.componentId } }),
  EXPOSED_PAYLOAD: () => toolFix('Add a fairing', { edit: 'addFairing', args: {} }),
  DIAMETER_STEP: (v, i) => {
    const stack = v.components.filter((c) => c.mount === 'stack');
    const k = stack.findIndex((c) => c.id === i.componentId); if (k < 1) return null;
    const a = stack[k - 1], b = stack[k];
    const resizable = (c) => ['structural_section', 'interstage', 'decoupler', 'fairing', ...TANK_KINDS].includes(c.kind);
    const [mv, to] = resizable(b) ? [b, a] : resizable(a) ? [a, b] : [null, null];
    if (!mv) return null;
    return toolFix(`Make ${mv.name} the same width`, { tool: 'MODIFY_COMPONENT', args: { id: mv.id, changes: { diameter: to.diameter } } });
  },
  NO_GUIDANCE: (v) => {
    const group = topGroup(v);
    const steps = [{ tool: 'ADD_COMPONENT', args: { catalogId: 'avionics-flight', group, mount: 'stack' } }];
    if (!v.components.some((c) => c.kind === 'battery' || c.kind === 'solar_panel')) steps.push({ tool: 'ADD_COMPONENT', args: { catalogId: 'battery-500', group, mount: 'stack' } });
    return toolFix('Add a flight computer', steps);
  },
  NO_POWER: (v) => {
    const av = v.components.find((c) => ['avionics', 'guidance', 'computer'].includes(c.kind) && c.powerDraw);
    return toolFix('Add a battery', { tool: 'ADD_COMPONENT', args: { catalogId: 'battery-500', group: av?.group ?? topGroup(v), mount: 'stack' } });
  },
  LOW_TWR: (v, i, body) => thrustUp(v, body),
  MARGINAL_TWR: (v, i, body) => thrustUp(v, body),
  VAC_ENGINE_SL: (v, i, body) => {
    const s1 = stageOrder(v)[0]; if (!s1) return null;
    const pick = engineFix(v, body, s1, 0); if (!pick) return null;
    return toolFix(`Use a sea-level engine: ${pick.e.name.replace(/ \(.*\)/, '')}`, { tool: 'MODIFY_STAGE', args: { stage: s1.id, engine: pick.e.catalogId, engineCount: pick.n } });
  },
  STAGE_NO_ENGINE: (v, i, body) => {
    const a = analyse(v, body); const order = stageOrder(v);
    const s = a?.stages.find((x) => x.propellant > 0 && x.engines === 0); if (!s) return null;
    const pick = engineFix(v, body, s, order.findIndex((o) => o.id === s.id)); if (!pick) return null;
    return toolFix(`Add ${pick.n > 1 ? pick.n + ' × ' : 'an '}${pick.e.name.replace(/ \(.*\)/, '')}`, { tool: 'ADD_COMPONENT', args: { catalogId: pick.e.catalogId, group: s.id, mount: 'stack', count: pick.n } });
  },
  NO_LEGS: (v) => toolFix('Add landing legs', { tool: 'ADD_COMPONENT', args: { catalogId: 'legs-4', group: firstGroup(v), mount: 'radial' } }),
  ROVER_NO_ROVER_CHASSIS: (v) => roverPart(v, 'rover-chassis', 'a chassis'),
  ROVER_NO_WHEEL: (v) => roverPart(v, 'rover-wheel', 'wheels'),
  ROVER_NO_MOTOR: (v) => roverPart(v, 'rover-motor', 'drive motors'),
  ROVER_NO_BATTERY: (v) => roverPart(v, 'battery-100', 'a battery'),
};
function thrustUp(v, body) {
  const s1 = stageOrder(v)[0]; if (!s1) return null;
  const f = thrustFix(v, body, s1.id);
  if (f) return toolFix(`Use ${f.count} engines in ${stageName(v, s1.id)}`, { tool: 'MODIFY_STAGE', args: { stage: s1.id, engineCount: f.count } });
  const pick = engineFix(v, body, s1, 0);
  return pick ? toolFix(`Use ${pick.n} × ${pick.e.name.replace(/ \(.*\)/, '')}`, { tool: 'MODIFY_STAGE', args: { stage: s1.id, engine: pick.e.catalogId, engineCount: pick.n } }) : null;
}
function roverPart(v, catalogId, word) {
  return toolFix(`Add ${word}`, { tool: 'ADD_COMPONENT', args: { catalogId, group: firstGroup(v), mount: 'body' } });
}

/** All codes that fixForIssue knows about (the unit test checks this against validateVehicle's codes). */
export const FIXABLE_CODES = Object.keys(FIXERS);

/**
 * The one-click fix for a validateVehicle issue, or null.
 * @param vehicle the vehicle the issue was found in (not modified)
 * @param issue {code, componentId?}
 */
export function fixForIssue(vehicle, issue, { body = null } = {}) {
  const f = FIXERS[issue?.code]; if (!f) return null;
  const b = body ?? vehicle.meta?.body ?? 'earth';
  try { return f(vehicle, issue, b) ?? null; } catch { return null; }
}

/** Every current validator issue paired with its fix (or the reason there is none). Handy for lists. */
export function issuesWithFixes(vehicle, { body = null } = {}) {
  let issues = []; try { issues = validateVehicle(vehicle, { body: body ?? vehicle.meta?.body ?? 'earth' }); } catch { /* ignore */ }
  return issues.map((i) => ({ ...i, fix: fixForIssue(vehicle, i, { body }), noFix: NO_FIX[i.code] ?? null }));
}

/** Run one local edit step. */
export function runEdit(vehicle, step) {
  const fn = EDITS[step.edit]; if (!fn) throw new Error(`Unknown edit ${step.edit}.`);
  return fn(vehicle, step.args ?? {});
}

export { findComponent };
