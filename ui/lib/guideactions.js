// Helpers for the Academy build guides. No DOM here, so the node tests can use them too.
// CHECKS tell from app.project whether a guide step is already done. The actions change the project only through the same
// tool API as the AI Helper (app.api.execute), so every change is recorded in the project history and can be undone.
import { launchMission } from '../../src/missions/generator.js';
import { addComponent } from '../../src/vehicles/vehicle.js';
import { addUpperSection } from '../../src/vehicles/builders.js';
import { TEMPLATE_BY_ID } from '../../data/templates.js';

const TANKS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
const vehicles = (P) => Object.values(P.vehicles ?? {});
const byName = (P, name) => vehicles(P).find((v) => v.name === name) ?? null;
const lastRunOfActive = (P) => { const v = P.vehicle; if (!v) return null; return [...P.runs].reverse().find((r) => r.vehicle === v.name) ?? null; };
const rockets = (P) => vehicles(P).filter((v) => v.type === 'rocket');

/** Step conditions. A check is a name, optionally with an argument: 'vehicle:Rover', 'stage:2', 'kind:radiator'. */
export const CHECKS = {
  vehicle: (P, arg) => (arg ? !!byName(P, arg) : !!P.vehicle),
  engine: (P) => !!P.vehicle?.components?.some((c) => c.kind === 'engine'),
  tanks: (P) => !!P.vehicle?.components?.some((c) => TANKS.includes(c.kind)),
  stage: (P, arg) => rockets(P).some((v) => v.components.some((c) => c.kind === 'engine' && c.group === `stage${arg}`)),
  payload: (P) => rockets(P).some((v) => v.components.some((c) => c.kind === 'payload')),
  kind: (P, arg) => !!P.vehicle?.components?.some((c) => c.kind === arg && /^(Extra|Guide)/.test(c.name ?? '')),
  moonship: (P) => rockets(P).some((v) => v.components.some((c) => c.group === 'orbiter') && v.components.some((c) => c.group === 'lander')),
  mission: (P) => !!P.vehicle && !!P.mission && P.mission.vehicleName === P.vehicle.name,
  run: (P) => !!lastRunOfActive(P),
  success: (P) => lastRunOfActive(P)?.status === 'SUCCESS',
};
export function checkStep(P, step) {
  if (!step.check) return false;
  const [name, ...rest] = String(step.check).split(':');
  const f = CHECKS[name]; if (!f) return false;
  try { return !!f(P, rest.join(':') || null); } catch { return false; }
}

const afterChange = (app) => { app.markDirty?.(); app.emit?.('design', 'created'); app.emit?.('guide-progress'); };
/** One undo step in the project history (the tool API itself does not commit; its callers do). */
const commit = (app, label) => (app.commit ? app.commit(label, { silent: true }) : app.project.commit(label));

/** Put a finished template (vehicle + mission) into the project. The caller has already confirmed with the student. */
export async function loadExample(app, id) {
  const t = TEMPLATE_BY_ID[id]; if (!t) throw new Error(`No example called ${id}`);
  const v = await t.build(app); commit(app, `Example: ${t.title}`); afterChange(app); return v;
}

/** Run one editing tool (the same tool the AI Helper uses). Rejects with the tool's own message when it refuses. */
export async function runTool(app, tool, args = {}, label = null) {
  const r = await app.api.execute(tool, args);
  if (!r.ok) throw new Error(r.message || `${tool} failed`);
  // the guide talks about a named vehicle: make it the active one, so the next screen shows it
  const P = app.project;
  if (args.vehicle) { const v = byName(P, args.vehicle); if (v) P.activeVehicle = v.id; }
  if (tool === 'CREATE_MISSION' || tool === 'MODIFY_MISSION') { const v = P.vehicle; if (v && P.mission && !P.mission.vehicleName) P.mission.vehicleName = v.name; }
  commit(app, label || `Guide: ${tool.toLowerCase().replace(/_/g, ' ')}`); afterChange(app); return r;
}
/** Undo the last change (any tool step, example or helper). */
export async function undoLast(app) { const r = await app.api.execute('UNDO', {}); app.markDirty?.(); app.emit?.('design', 'undo'); app.emit?.('guide-progress'); return r; }

/** The "fly above 100 km" mission for the current (sounding) rocket: same recipe as the ready-made example. */
export function soundingMission(app) {
  const P = app.project; const v = P.vehicle; if (!v) throw new Error('Build a rocket first.');
  const m = launchMission(v, { altitude: 100000, kickAngle: 1, name: 'Fly above 100 km' });
  m.description = 'Lift off, burn the engine and climb above 100 km (the edge of space). The flight ends once the altitude goal is met.';
  m.objective = { type: 'suborbital', altitude: 100000 };
  m.events = m.events.filter((e) => !['cutoff', 'circ', 'deploy', 'appendages', 'sunpoint'].includes(e.id));
  m.vehicleName = v.name; P.setMission(m, { activate: true }); commit(app, 'Mission: fly above 100 km'); afterChange(app); return m;
}

/** Nose, fairing, avionics and a 300 kg experiment for the sounding rocket (the same parts as the ready-made example). */
export function soundingPayload(app) {
  const P = app.project; const v = byName(P, 'Sounding rocket') ?? P.vehicle; if (!v) throw new Error('Build a rocket first.');
  if (v.components.some((c) => c.kind === 'payload')) throw new Error('This rocket already has a payload.');
  const D = v.meta?.cfg?.D ?? 0.6;
  const up = addUpperSection(v, { diameter: D, payloadLength: 0.7 });
  const fairing = up.find((c) => c.kind === 'fairing');
  addComponent(v, { catalogId: 'payload-dummy', name: 'Science experiment', group: 'payload', parent: fairing.id, mount: 'internal', mass: 300, length: 0.6, diameter: 0.4 });
  v.meta = { ...(v.meta ?? {}), role: 'launcher', body: 'earth', targetAltitude: 100000, payloadMass: 300 };
  P.activeVehicle = v.id; commit(app, 'Add the experiment'); afterChange(app); return v;
}

/** A two-stage launcher whose second stage has only half its fuel: it fails on purpose, so a student can practise diagnosing it. */
export async function brokenRocket(app) {
  await loadExample(app, 'small-launcher');
  const r = await app.api.execute('MODIFY_STAGE', { stage: 'stage2', propellantScale: 0.5 });
  if (!r.ok) throw new Error(r.message);
  app.project.vehicle.name = 'Launcher with half a tank'; commit(app, 'Broken rocket for the repair guide');
  afterChange(app); return app.project.vehicle;
}

/** Run one guide action object. `deps` = {app, openLesson(id)}. */
export async function runAction(a, deps) {
  const { app } = deps;
  if (a.tool) return runTool(app, a.tool, a.args, a.label);
  if (a.ai) return app.navigate('ai', { prefill: a.ai, send: true });
  if (a.go) return app.navigate(a.go, a.params);
  if (a.lesson) return deps.openLesson(a.lesson);
  if (a.example) return loadExample(app, a.example);
  if (a.fn === 'soundingPayload') return soundingPayload(app);
  if (a.fn === 'soundingMission') return soundingMission(app);
  if (a.fn === 'brokenRocket') return brokenRocket(app);
  throw new Error('Unknown guide action');
}

// ------------------------------------------------------------------------------------------------ Academy "Try this now"
/**
 * Set up a lesson preset (data/academy/tryit.js): make the named example the active vehicle + mission (re-use it when the project already has it,
 * otherwise add it as one undoable step), then open the target screen. Returns {example, reused}.
 */
export async function tryThisNow(app, preset) {
  if (!preset) throw new Error('No setup for this lesson');
  let reused = false;
  if (preset.example) {
    const def = TEMPLATE_BY_ID[preset.example];
    const name = def?.make?.().vehicle?.name;
    const P = app.project; const have = name ? vehicles(P).find((v) => v.name === name) : null;
    if (have) {
      P.activeVehicle = have.id; reused = true;
      const m = Object.values(P.missions ?? {}).find((x) => x.vehicleName === have.name);
      if (m) P.activeMission = m.id; else if (def) { const mm = def.make().mission; if (mm) { mm.vehicleName = have.name; P.setMission(mm, { activate: true }); } }
      commit(app, `Lesson example: ${def?.title ?? preset.example}`); afterChange(app);
    } else await loadExample(app, preset.example);
  }
  app.navigate(preset.go, preset.params ?? {});
  return { example: preset.example, reused };
}
