// Projects: vehicles, missions, environment, settings, simulation runs, experiments and the AI conversation.
// On disk a project is a folder of small JSON files (human readable, diff-able) plus one compressed binary file per run:
//
//   projects/<slug>/project.json                 manifest (ids, active selections, run index, AI memory)
//   projects/<slug>/vehicles/<id>.json           one vehicle definition each   (schema astra.vehicle/1)
//   projects/<slug>/missions/<id>.json           one mission each              (schema astra.mission/1)
//   projects/<slug>/environment.json             environment (body, site, epoch, terrain seed, ground station)
//   projects/<slug>/settings.json                simulation + display settings for this project
//   projects/<slug>/ai-history.json              AI conversation, tool calls and approvals
//   projects/<slug>/versions.json                undo/redo + version history (design snapshots)
//   projects/<slug>/simulations/<run>/run.json   run description, result, failure analysis, events, exact inputs
//   projects/<slug>/simulations/<run>/telemetry.bin.gz   columnar telemetry (Float64, gzip)
//   projects/<slug>/simulations/<run>/replay.json        replay metadata (bookmarks, camera)
//   projects/<slug>/reports/<run>.{json,html,csv,pdf}    engineering reports
import { safePath, slug, readJson, writeJson } from './storage.js';
import { gzip, gunzip, isGzip } from './compress.js';
import { History } from './history.js';
import { TelemetryRecorder } from '../../physics/telemetry.js';

export const PROJECT_FORMAT = 'astra.project/1';
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

export const DEFAULT_PROJECT_SETTINGS = {
  units: 'metric',              // 'metric' | 'imperial'
  accuracy: 'standard',         // 'high' | 'standard' | 'fast'   (changes only the coast step cap, never the model)
  dt: 0.02,
  j2: false,                    // 2.1: Earth's equatorial bulge in the gravity (off = point-mass gravity, as before)
  slosh: false,                 // 2.3: propellant slosh
  slosh2: false,                // 2.5: second slosh mode
  flex: false,                  // 2.3: structural bending
  recordMax: 20000,
  educationalMode: false,
  showDataLabels: true,
};

export class Project {
  constructor(name = 'Untitled project') {
    this.format = PROJECT_FORMAT;
    this.id = rid('prj');
    this.name = name;
    this.created = new Date().toISOString();
    this.modified = this.created;
    this.vehicles = {};
    this.missions = {};
    this.activeVehicle = null;
    this.activeMission = null;
    this.environment = { body: 'earth', epoch: 0, site: { lat: 28.573, lon: -80.649, name: 'Cape Canaveral' }, terrainSeed: 1, groundStation: { lat: 28.573, lon: -80.649, gainDbi: 45, noiseTempK: 100, minElevationDeg: 5 } };
    this.settings = { ...DEFAULT_PROJECT_SETTINGS };
    this.runs = [];              // index only; the data lives in simulations/<run>/
    this.experiments = [];       // finished experiments (tables)
    this.aiHistory = [];         // [{role, text, ts, toolCalls?, approval?}]
    this.memory = { aliases: {}, notes: [] };   // AI project memory: "the second stage" -> group id, free notes
    this.history = new History();
    this.description = '';
    this.commit('Project created');
  }

  // ---------- design state (what undo/redo restores) ----------
  designState() {
    return clone({ vehicles: this.vehicles, missions: this.missions, activeVehicle: this.activeVehicle, activeMission: this.activeMission, environment: this.environment });
  }
  applyDesignState(s) {
    this.vehicles = clone(s.vehicles); this.missions = clone(s.missions);
    this.activeVehicle = s.activeVehicle; this.activeMission = s.activeMission; this.environment = clone(s.environment);
    this.modified = new Date().toISOString();
  }
  commit(label, meta) { this.modified = new Date().toISOString(); return this.history.push(this.designState(), label, meta); }
  undo() { const s = this.history.undo(); if (s) this.applyDesignState(s.state); return s ? s.label : null; }
  redo() { const s = this.history.redo(); if (s) this.applyDesignState(s.state); return s ? s.label : null; }
  restoreVersion(n) { const s = this.history.restore(n); if (s) this.applyDesignState(s.state); return s ? s.label : null; }

  // ---------- vehicles / missions ----------
  setVehicle(v, { activate = true } = {}) {
    v.id ??= rid('veh');
    this.vehicles[v.id] = v;
    if (activate || !this.activeVehicle) this.activeVehicle = v.id;
    return v;
  }
  removeVehicle(id) { delete this.vehicles[id]; if (this.activeVehicle === id) this.activeVehicle = Object.keys(this.vehicles)[0] ?? null; }
  get vehicle() { return this.vehicles[this.activeVehicle] ?? null; }
  setMission(m, { activate = true } = {}) {
    m.schema ??= 'astra.mission/1';
    m.id ??= rid('mis');
    this.missions[m.id] = m;
    if (activate || !this.activeMission) this.activeMission = m.id;
    return m;
  }
  removeMission(id) { delete this.missions[id]; if (this.activeMission === id) this.activeMission = Object.keys(this.missions)[0] ?? null; }
  get mission() { return this.missions[this.activeMission] ?? null; }
  vehicleList() { return Object.values(this.vehicles).map((v) => ({ id: v.id, name: v.name, type: v.type, active: v.id === this.activeVehicle })); }
  missionList() { return Object.values(this.missions).map((m) => ({ id: m.id, name: m.name, objective: m.objective?.type, active: m.id === this.activeMission })); }

  // ---------- AI memory ----------
  remember(alias, ref) { this.memory.aliases[String(alias).toLowerCase()] = ref; }
  recall(alias) { return this.memory.aliases[String(alias).toLowerCase()] ?? null; }
  note(text) { this.memory.notes.push({ ts: new Date().toISOString(), text }); if (this.memory.notes.length > 200) this.memory.notes.shift(); }

  manifest() {
    return {
      format: PROJECT_FORMAT, id: this.id, name: this.name, description: this.description, created: this.created, modified: this.modified,
      activeVehicle: this.activeVehicle, activeMission: this.activeMission,
      vehicles: Object.keys(this.vehicles), missions: Object.keys(this.missions),
      runs: this.runs, experiments: this.experiments, memory: this.memory,
    };
  }
}

// -------------------------------------------------------------------------------------------------------------
// persistence
// -------------------------------------------------------------------------------------------------------------
export const projectDir = (name) => `projects/${slug(name)}`;

export async function saveProject(storage, project, dirName) {
  const dir = dirName ?? projectDir(project.name);
  project.dir = dir;
  await writeJson(storage, `${dir}/project.json`, project.manifest());
  // remove stale vehicle / mission files
  for (const [sub, ids] of [['vehicles', Object.keys(project.vehicles)], ['missions', Object.keys(project.missions)]]) {
    for (const ent of await storage.list(`${dir}/${sub}`)) if (!ent.dir && !ids.includes(ent.name.replace(/\.json$/, ''))) await storage.remove(`${dir}/${sub}/${ent.name}`);
  }
  for (const v of Object.values(project.vehicles)) await writeJson(storage, `${dir}/vehicles/${safeId(v.id)}.json`, v);
  for (const m of Object.values(project.missions)) await writeJson(storage, `${dir}/missions/${safeId(m.id)}.json`, m);
  await writeJson(storage, `${dir}/environment.json`, { schema: 'astra.environment/1', ...project.environment });
  await writeJson(storage, `${dir}/settings.json`, { schema: 'astra.settings/1', ...project.settings });
  await writeJson(storage, `${dir}/ai-history.json`, { schema: 'astra.ai-history/1', messages: project.aiHistory.slice(-500) });
  await writeJson(storage, `${dir}/versions.json`, project.history.toJSON(), false);
  return dir;
}
const safeId = (id) => String(id).replace(/[^A-Za-z0-9._-]/g, '_');

export async function loadProject(storage, dir) {
  dir = safePath(dir);
  const man = await readJson(storage, `${dir}/project.json`);
  if (man.format !== PROJECT_FORMAT) throw new Error(`Unsupported project format: ${man.format}`);
  const p = new Project(man.name);
  p.id = man.id; p.description = man.description ?? ''; p.created = man.created; p.modified = man.modified; p.dir = dir;
  p.vehicles = {}; p.missions = {};
  for (const id of man.vehicles ?? []) p.vehicles[id] = await readJson(storage, `${dir}/vehicles/${safeId(id)}.json`);
  for (const id of man.missions ?? []) p.missions[id] = await readJson(storage, `${dir}/missions/${safeId(id)}.json`);
  p.activeVehicle = man.activeVehicle; p.activeMission = man.activeMission;
  const env = await readJson(storage, `${dir}/environment.json`, null); if (env) { delete env.schema; p.environment = env; }
  const st = await readJson(storage, `${dir}/settings.json`, null); if (st) { delete st.schema; p.settings = { ...DEFAULT_PROJECT_SETTINGS, ...st }; }
  const ai = await readJson(storage, `${dir}/ai-history.json`, null); p.aiHistory = ai?.messages ?? [];
  p.runs = man.runs ?? []; p.experiments = man.experiments ?? []; p.memory = man.memory ?? { aliases: {}, notes: [] };
  const ver = await readJson(storage, `${dir}/versions.json`, null);
  p.history = ver ? History.fromJSON(ver) : new History();
  if (!p.history.stack.length) p.commit('Loaded');
  return p;
}

export async function listProjects(storage) {
  const out = [];
  for (const ent of await storage.list('projects')) {
    if (!ent.dir) continue;
    try { const m = await readJson(storage, `projects/${ent.name}/project.json`); out.push({ dir: `projects/${ent.name}`, name: m.name, modified: m.modified, vehicles: m.vehicles?.length ?? 0, runs: m.runs?.length ?? 0 }); } catch { /* not a project */ }
  }
  return out.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}
export async function deleteProject(storage, dir) { await storage.remove(safePath(dir)); }

/** Single-file bundle for sharing / backup (vehicles + missions + environment; runs are not included). */
export function exportBundle(project) { return JSON.stringify({ format: 'astra.bundle/1', project: project.manifest(), vehicles: project.vehicles, missions: project.missions, environment: project.environment, settings: project.settings }, null, 1); }
export function importBundle(text) {
  const b = JSON.parse(text);
  if (b.format !== 'astra.bundle/1') throw new Error('Not an ASTRA LAB project bundle');
  const p = new Project(b.project?.name ?? 'Imported project');
  p.vehicles = b.vehicles ?? {}; p.missions = b.missions ?? {}; p.environment = b.environment ?? p.environment; p.settings = { ...DEFAULT_PROJECT_SETTINGS, ...(b.settings ?? {}) };
  p.activeVehicle = b.project?.activeVehicle ?? Object.keys(p.vehicles)[0] ?? null; p.activeMission = b.project?.activeMission ?? Object.keys(p.missions)[0] ?? null;
  p.commit('Imported bundle');
  return p;
}

// -------------------------------------------------------------------------------------------------------------
// simulation runs (automatic recording)
// -------------------------------------------------------------------------------------------------------------
/** Stable text of any JSON value (keys sorted), so equal inputs always give the same text. */
const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`) : JSON.stringify(v) ?? 'null');
/** cyrb53: a small 53-bit hash, shown as 14 hex digits. It identifies the inputs of a run; it is not a security feature. */
function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export const APP_MODEL_VERSION = '2.3.0';
/** Fingerprint of everything that decides a flight: vehicle, mission, environment (weather), settings (gravity model, time step) and commands. */
export function inputFingerprint(rec) {
  return hash53(stable({ vehicle: rec.vehicle, mission: rec.mission, environment: rec.environment, settings: { ...rec.settings, recordMax: undefined, coastCap: undefined }, commands: rec.commands ?? [] }));
}
/** Fingerprint of the main results (status, end time, final state), to confirm that a re-run gave the same answer. */
export function resultFingerprint(rec) {
  const r = rec.result ?? {}; return hash53(stable({ status: r.status, endTime: r.endTime && +r.endTime.toFixed(3), summary: r.summary }));
}
/** Everything needed to display, replay, analyse and exactly re-run a finished simulation. */
export function buildRunRecord(sim, { name, runId } = {}) {
  const id = runId ?? rid('run');
  const r = sim.result;
  const rec = {
    schema: 'astra.run/1', id, name: name ?? `${sim.vehicleDef.name} — ${sim.mission.name}`, created: new Date().toISOString(),
    engine: { name: 'astra-physics', version: '1.0', integrator: 'RK4', deterministic: true, appVersion: APP_MODEL_VERSION, gravity: sim.settings?.j2 ? 'point mass + J2' : 'point mass', slosh: !!sim.settings?.slosh, flex: !!sim.settings?.flex, weather: !!(sim.env?.wind?.speed || (sim.env?.densityScale && sim.env.densityScale !== 1)) },
    vehicle: sim.vehicleDef, mission: sim.mission, environment: sim.env, settings: sim.settings,
    commands: sim.commands ?? [],
    result: r ? { status: r.status, reason: r.reason, endTime: r.endTime, objective: r.objective, failures: r.failures, warnings: r.warnings, summary: r.summary } : null,
    events: sim.events, telemetryInfo: { samples: sim.telemetry.count, decimation: sim.telemetry.decimation },
  };
  rec.fingerprint = { inputs: inputFingerprint(rec), results: resultFingerprint(rec) };
  return rec;
}
export const runIndexEntry = (rec) => ({ id: rec.id, name: rec.name, created: rec.created, vehicle: rec.vehicle.name, mission: rec.mission.name, status: rec.result?.status, reason: rec.result?.reason, endTime: rec.result?.endTime, failures: (rec.result?.failures ?? []).map((f) => f.code) });

/** Write the files of a run record (run.json, telemetry, replay.json). Does not touch the project's run index. */
export async function saveRunFiles(storage, project, rec, telemetry) {
  const dir = project.dir ?? projectDir(project.name);
  const base = `${dir}/simulations/${safeId(rec.id)}`;
  await writeJson(storage, `${base}/run.json`, rec, false);
  await storage.writeBinary(`${base}/telemetry.bin.gz`, await gzip(telemetry.toBinary()));
  await writeJson(storage, `${base}/replay.json`, { schema: 'astra.replay/1', run: rec.id, bookmarks: [], camera: 'chase', speed: 1 });
}
export async function saveRun(storage, project, sim, opts = {}) {
  const rec = buildRunRecord(sim, opts);
  await saveRunFiles(storage, project, rec, sim.telemetry);
  project.runs.push(runIndexEntry(rec));
  project.modified = new Date().toISOString();
  return rec;
}
export async function loadRun(storage, project, runId) {
  const dir = project.dir ?? projectDir(project.name);
  const base = `${dir}/simulations/${safeId(runId)}`;
  const rec = await readJson(storage, `${base}/run.json`);
  let bytes = await storage.readBinary(`${base}/telemetry.bin.gz`);
  if (isGzip(bytes)) bytes = await gunzip(bytes);
  return { record: rec, telemetry: TelemetryRecorder.fromBinary(bytes) };
}
export async function deleteRun(storage, project, runId) {
  const dir = project.dir ?? projectDir(project.name);
  await storage.remove(`${dir}/simulations/${safeId(runId)}`);
  await storage.remove(`${dir}/reports/${safeId(runId)}.json`);
  project.runs = project.runs.filter((r) => r.id !== runId);
}
