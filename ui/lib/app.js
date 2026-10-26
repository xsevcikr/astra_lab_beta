// Application state for ASTRA LAB: current project, AI session, storage, settings, autosave, live simulation controller.
// The screens are views on this object. Nothing here does physics: simulations run in physics/simulation.js.
import { Project, saveProject, loadProject, listProjects, deleteProject, exportBundle, importBundle, projectDir } from '../../src/core/project.js';
import { AiSession } from '../../ai/session.js';
import { LlmProvider } from '../../ai/llm.js';
import { Simulation } from '../../physics/simulation.js';
import { setSystem } from './units.js';
import { toast } from './dom.js';
import { readJson, writeJson } from '../../src/core/storage.js';
import { normalizeLevel } from '../../src/core/levels.js';
import { setLang } from '../../src/core/i18n.js';
import { syncMission } from '../../src/core/consistency.js';
import { launchChecklist } from '../../src/core/needs.js';
import { makeItFly, describeFlight, flightShortText, designSignature } from '../../src/core/makeitfly.js';

export const DEFAULT_APP_SETTINGS = {
  units: 'metric',                  // 'metric' | 'imperial'
  quality: 'medium',                // 3D quality: 'low' | 'medium' | 'high' (visual only, never changes physics)
  maxFps: 60,
  educational: false,
  mode: 'beginner',                 // 'beginner' | 'student' | 'engineer' | 'expert' — how much detail the screens show (presentation only)
  lang: 'en',                       // 'en' | 'cs' — interface language
  textScale: 1.15,                  // interface text size multiplier
  showAllTools: false,              // beginner mode: also list the expert tools in the sidebar
  academy: { done: {}, quiz: {}, seen: null },
  challenges: {},                   // student challenges: {id: {stars, best}}
  dataLabels: true,
  autosave: true,
  welcomed: false,
  sound: false,                     // small sound effects, engine rumble and countdown beeps (off by default)
  look: 'space',                    // 'space' (dark) | 'daylight' (light) | 'contrast' (high contrast)
  fx: true,                         // animations: screen glide, parallax stars, T-minus intro
  resultsSeen: false,               // opened 'What happened?' after a flight (Home checklist)
  tourDone: false,                  // first-run guided tour (Beginner) already shown
  lastProject: null,
  accuracy: 'standard',             // physics accuracy preset ('fast' | 'standard' | 'high': coast step cap only)
  ai: { enabled: false, format: 'anthropic', baseUrl: 'https://api.anthropic.com', model: '' },
};

export class Emitter {
  constructor() { this.h = new Map(); }
  on(evt, fn) { (this.h.get(evt) ?? this.h.set(evt, new Set()).get(evt)).add(fn); return () => this.h.get(evt)?.delete(fn); }
  emit(evt, data) { for (const fn of [...(this.h.get(evt) ?? [])]) { try { fn(data); } catch (e) { console.error(`handler for ${evt} failed`, e); } } }
}

/** Live (real-time) simulation, advanced from the animation loop. Uses exactly the same engine as the fast and headless runs. */
/** Highest time-warp offered. Above this a coast step costs more than a screen frame allows on an ordinary computer. */
export const MAX_WARP = 10000;
export class LiveRun {
  constructor(app, { vehicle, mission, name }) {
    this.app = app;
    const P = app.project;
    this.name = name ?? `${vehicle.name} — ${mission.name} (live)`;
    this.sim = new Simulation({ vehicle: JSON.parse(JSON.stringify(vehicle)), mission: JSON.parse(JSON.stringify(mission)), environment: { ...P.environment }, settings: { accuracy: P.settings.accuracy, dt: P.settings.dt, recordMax: P.settings.recordMax, j2: !!P.settings.j2, slosh: !!P.settings.slosh, flex: !!P.settings.flex } });
    this.speed = 1; this.paused = false; this.finished = false; this.runId = null; this.lag = 0; this.perfCap = Infinity; this.eff = 1; this.note = '';
    this.thrustRef = 0;
    app.api.ctx.running = true;
    this.sim.step(); // populate state
    this.thrustRef = Math.max(1, this.sim.now.thrust || this._ratedThrust());
  }
  _ratedThrust() { let t = 0; for (const c of this.sim.vehicleDef.components) if (c.kind === 'engine' && (c.group === 'stage1' || !c.group)) t += (c.thrustVac ?? 0) * (c.count ?? 1); return t || 1e5; }
  setSpeed(s) { this.speed = Math.min(MAX_WARP, Math.max(0.1, s)); }
  /** The speed actually used: the chosen one, slowed down for burns, separations, docking and landing, and for what this computer can keep up with. */
  get effectiveSpeed() { return this.eff ?? this.speed; }
  /** Advance by wallSeconds of real time (scaled by speed). Returns true when finished this call. */
  advance(wallSeconds) {
    if (this.finished || this.paused) return false;
    const att = this.sim.attention();
    const eff = Math.max(0.1, Math.min(this.speed, att.maxWarp, this.perfCap));
    this.eff = eff; this.note = eff < this.speed ? (att.maxWarp < this.speed ? `Slowed down for you: ${att.why}.` : 'Slowed down to keep up.') : '';
    const want = Math.min(wallSeconds, 0.1) * eff;
    const t0 = this.sim.t, target = t0 + want;
    this.sim.run({ untilT: target, budgetMs: 14 });
    this.lag = Math.max(0, target - this.sim.t);
    // this computer cannot keep up: slow down by itself (and speed up again, slowly, when it can)
    if (this.lag > 0.1 * want && want > 1) this.perfCap = Math.max(1, eff * 0.7);
    else if (this.perfCap < Infinity && this.lag === 0) this.perfCap = this.perfCap * 1.03 > this.speed ? Infinity : this.perfCap * 1.03;
    if (this.sim.finished) { this.finish(); return true; }
    return false;
  }
  /** Advance exactly `seconds` of simulated time (used by the Step button while paused). */
  step(seconds = 1) { if (this.finished) return; this.sim.run({ untilT: this.sim.t + seconds, budgetMs: 400 }); if (this.sim.finished) this.finish(); }
  command(action) { if (!this.finished) this.sim.command({ action }); }
  stop() { if (!this.finished) { this.sim._finish(null, 'Stopped by the user'); this.finish(); } }
  finish() {
    if (this.finished) return; this.finished = true;
    this.app.api.ctx.running = false;
    const rec = this.app.api.recordRun(this.sim, { name: this.name });
    this.runId = rec.id;
    this.app.session.lastRunId = rec.id;
    this.app.selectedRun = rec.id;
    if (rec.result?.status === 'SUCCESS') this.app._okSig = designSignature(this.app.project.vehicle, this.app.project.mission);
    this.app.emit('run-finished', rec);
    this.app.markDirty();
  }
  dispose() { if (!this.finished) this.app.api.ctx.running = false; }
}

export class App extends Emitter {
  constructor({ storage, bridge = null }) {
    super();
    this.storage = storage; this.bridge = bridge;
    this.settings = JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
    this.screenId = 'home'; this.screenParams = {};
    this.selectedRun = null; this.live = null;
    this.saveState = 'saved'; this.saveTimer = null;
    this.memKey = null;
    this.chat = [];                // rendered AI conversation (reply objects)
    this.selectedVehicleComponent = null;
    this.errors = [];
  }
  get project() { return this.session.project; }
  get api() { return this.session.api; }

  // ---------------------------------------------------------------- start-up
  async init() {
    try { const s = await readJson(this.storage, 'settings/app.json', null); if (s) this.settings = { ...this.settings, ...s, ai: { ...this.settings.ai, ...(s.ai ?? {}) } }; } catch { /* first start */ }
    this.settings.mode = normalizeLevel(this.settings.mode);
    if (this.settings.lang !== 'cs') this.settings.lang = 'en';
    setSystem(this.settings.units); setLang(this.settings.lang);
    let project = null;
    try {
      const list = await listProjects(this.storage);
      const last = list.find((p) => p.dir === this.settings.lastProject) ?? list[0];
      if (last) project = await loadProject(this.storage, last.dir);
    } catch (e) { console.warn('Could not open the last project:', e); }
    this.attach(project ?? this.freshProject('My first project'));
    return { firstRun: !this.settings.welcomed };
  }
  freshProject(name) { const p = new Project(name); p.settings.accuracy = this.settings.accuracy; p.settings.units = this.settings.units; return p; }
  makeSession(project) {
    const s = new AiSession({ project, storage: this.storage, emit: (e) => this.onAiEvent(e), llm: this.makeLlm(), settings: {} });
    s.onProjectReplaced = (p) => { this.chat = this.chatFromHistory(p); this.selectedRun = null; this.emit('project', p); this.emit('design', 'loaded'); };
    return s;
  }
  attach(project) {
    this.live?.dispose(); this.live = null;
    this.session = this.makeSession(project);
    this.session.ctx.aiHistory = project.aiHistory;
    this.session.rememberAliases();
    this.chat = this.chatFromHistory(project);
    this.selectedRun = project.runs.length ? project.runs[project.runs.length - 1].id : null;
    this.session.lastRunId = this.selectedRun;
    this.saveState = project.dir ? 'saved' : 'dirty';
    this._vehSeen = project.activeVehicle;
    this.emit('project', project);
  }
  chatFromHistory(p) {
    return p.aiHistory.filter((m) => m.role === 'user' || m.role === 'assistant').map((m, i) => ({ id: `h${i}`, role: m.role, text: m.text, ts: m.ts, plain: m.plain ?? null, short: m.short ?? null, understood: m.understood ?? null, question: m.question ?? null, plan: null, calls: (m.toolCalls ?? []).map((c) => ({ tool: c.tool, args: c.args, ok: c.ok })), suggestions: [], history: true }));
  }
  onAiEvent(e) {
    if (e.type === 'plan') this.emit('ai-plan', e);
    this.emit('sim-event', e);
  }

  // ---------------------------------------------------------------- settings
  async saveSettings() { try { await writeJson(this.storage, 'settings/app.json', this.settings); } catch (e) { console.warn('settings not saved', e); } }
  setSetting(key, value) {
    if (key === 'mode') value = normalizeLevel(value);       // legacy 'standard' / 'advanced' still accepted
    if (key === 'lang') { value = value === 'cs' ? 'cs' : 'en'; setLang(value); }
    this.settings[key] = value;
    if (key === 'units') { setSystem(value); this.project.settings.units = value; this.emit('units', value); }
    if (key === 'accuracy') this.project.settings.accuracy = value;
    this.saveSettings(); this.emit('settings', key);
    if (key === 'accuracy' || key === 'units') this.markDirty();
  }
  setAi(cfg) { this.settings.ai = { ...this.settings.ai, ...cfg }; this.session.llm = this.makeLlm(); this.saveSettings(); this.emit('settings', 'ai'); }
  async getApiKey() {
    if (this.memKey) return this.memKey;
    try { return (await this.bridge?.secrets?.get('ai-api-key')) ?? null; } catch { return null; }
  }
  async setApiKey(key) {
    this.memKey = null;
    if (this.bridge?.secrets) { await this.bridge.secrets.set('ai-api-key', key || ''); return { stored: 'os' }; }
    this.memKey = key || null; return { stored: 'session' };   // in a plain browser the key is kept in memory only, never written anywhere
  }
  async hasApiKey() { return !!(await this.getApiKey()); }
  makeLlm() {
    const a = this.settings.ai;
    if (!a?.enabled || !a.baseUrl || !a.model) return null;
    const bridge = this.bridge;
    const fetchFn = bridge?.aiFetch
      ? async (url, init) => { const r = await bridge.aiFetch({ url, method: init.method, headers: init.headers, body: init.body }); return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.text }; }
      : (url, init) => fetch(url, { ...init, headers: { ...init.headers, ...(a.format === 'anthropic' ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}) } });
    return new LlmProvider({ format: a.format, baseUrl: a.baseUrl, model: a.model, getKey: () => this.getApiKey(), fetch: fetchFn, enabled: true });
  }

  // ---------------------------------------------------------------- navigation
  navigate(id, params = {}) { this.screenId = id; this.screenParams = params; this.emit('navigate', { id, params }); }

  // ---------------------------------------------------------------- design changes, undo/redo, saving
  /** Call after any edit of the project's design (vehicle, mission, environment). One undo step. */
  commit(label, { silent = false } = {}) {
    this.project.commit(label);
    this.session.rememberAliases();
    this.markDirty();
    if (!silent) this.emit('design', label);
    this._syncAfterVehicleChange();
  }
  /** When another vehicle became the active one, make the active goal suit it (a goal that already exists is switched to; a new one is only made
   *  when the launch checklist does not already offer its own "Fix it" button for the mismatch). */
  _syncAfterVehicleChange() {
    const id = this.project.activeVehicle;
    if (id === this._vehSeen) return; this._vehSeen = id;
    if (this._syncing || !this.project.vehicle) return;
    this._syncing = true;
    (async () => {
      try {
        const flagged = launchChecklist(this.project, {}).blocking.some((n) => n.id === 'mission-mismatch');
        const r = await syncMission(this, { create: !flagged });
        if (r.changed) toast(r.message, r.ok ? 'ok' : 'warn', 5000);
      } catch { /* the launch checklist still explains it */ }
      this._syncing = false;
    })();
  }
  undo() { const l = this.session.undo(); if (l) { this.markDirty(); this.emit('design', 'undo'); this._syncAfterVehicleChange(); toast(`Undid: ${l}`); } else toast('Nothing to undo'); }
  redo() { const l = this.session.redo(); if (l) { this.markDirty(); this.emit('design', 'redo'); this._syncAfterVehicleChange(); toast(`Redid: ${l}`); } else toast('Nothing to redo'); }
  markDirty() {
    this.saveState = 'dirty'; this.emit('save-state', this.saveState);
    if (!this.settings.autosave) return;
    clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save({ quiet: true }), 2500);
  }
  async save({ quiet = false } = {}) {
    clearTimeout(this.saveTimer);
    if (this.api.ctx.running && !this.live) return { ok: false };
    this.saveState = 'saving'; this.emit('save-state', this.saveState);
    const r = await this.api.execute('SAVE_PROJECT', { name: this.project.name });
    this.saveState = r.ok ? 'saved' : 'error'; this.emit('save-state', this.saveState);
    if (r.ok) { this.settings.lastProject = this.project.dir; this.saveSettings(); if (!quiet) toast(`Saved “${this.project.name}”`, 'ok'); }
    else toast(`Could not save: ${r.message}`, 'bad', 8000);
    return r;
  }
  async newProject(name) {
    if (this.saveState === 'dirty') await this.save({ quiet: true });
    this.attach(this.freshProject(name)); this.markDirty(); return this.project;
  }
  async openProject(dir) {
    if (this.saveState === 'dirty') await this.save({ quiet: true });
    const p = await loadProject(this.storage, dir);
    this.attach(p); this.settings.lastProject = dir; this.saveSettings(); return p;
  }
  async listProjects() { return listProjects(this.storage); }
  async deleteProject(dir) { await deleteProject(this.storage, dir); if (this.project.dir === dir) { this.attach(this.freshProject('My first project')); } }
  exportBundle() { return exportBundle(this.project); }
  importBundleText(text) { const p = importBundle(text); this.attach(p); this.markDirty(); return p; }

  // ---------------------------------------------------------------- runs
  runList() { return [...this.project.runs].reverse(); }
  async getRun(id) { return this.api.getRun(id ?? this.selectedRun ?? 'last'); }
  /** Fast (non-real-time) simulation of the active vehicle + mission through the same tool the AI uses. */
  async runFast({ tune = false, name } = {}) {
    const args = { tune, saveSchedule: tune }; if (name) args.name = name;   // a tuned launch path that works is kept in the mission, so Live Flight and Replay fly the same one
    const r = await this.api.execute('RUN_SIMULATION', args);
    if (r.ok) { this.selectedRun = r.data.runId; this.session.lastRunId = r.data.runId; this.markDirty(); if (r.data.status === 'SUCCESS') this._okSig = designSignature(this.project.vehicle, this.project.mission); this.emit('run-finished', { id: r.data.runId }); }
    return r;
  }
  /**
   * "Fix it and fly again": test flights that change the design until the rocket reaches its goal (src/core/makeitfly.js).
   * opts: { maxRounds, onProgress, name }. Resolves with the result object ({ok, summary, cause, changes, runId, ...}); never throws.
   */
  async makeItFly(opts = {}) {
    if (this.api.ctx.running) return { ok: false, summary: 'A flight is running. Stop it first.', changes: [], rounds: [] };
    const flag = { stop: false }; this._fixStop = flag;
    let r;
    try { r = await makeItFly(this.api, { ...opts, shouldStop: () => flag.stop }); }
    catch (e) { r = { ok: false, summary: `Could not finish: ${e.message}`, changes: [], rounds: [] }; }
    this._fixStop = null;
    if (r.runId) { this.selectedRun = r.runId; this.session.lastRunId = r.runId; }
    if (r.ok) this._okSig = designSignature(this.project.vehicle, this.project.mission);
    this.session.rememberAliases(); this.markDirty();
    this.emit('design', 'fix-it'); if (r.runId) this.emit('run-finished', { id: r.runId });
    return r;
  }
  /** One real test flight (fast, tuned launch path when the goal is an orbit). Resolves {ok, runId, text, cause, info}; never throws. */
  async testFly({ maxCandidates = 6, name } = {}) {
    const v = this.project.vehicle, m = this.project.mission;
    if (!v) return { ok: false, cause: 'There is no rocket yet.' };
    if (!m) return { ok: false, cause: 'Pick a goal first.' };
    if (this.api.ctx.running) return { ok: false, cause: 'A flight is running. Stop it first.' };
    const tune = m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit';
    const args = { tune, maxCandidates, saveSchedule: tune }; if (name) args.name = name;
    let r; try { r = await this.api.execute('RUN_SIMULATION', args); } catch (e) { r = { ok: false, message: e.message }; }
    if (!r.ok) return { ok: false, cause: String(r.message ?? 'The flight could not start.').replace(/^The vehicle has design errors that make a simulation meaningless:\s*/i, '') };
    if (r.data.scheduleSaved) this.project.commit('Save the working launch path');
    this.selectedRun = r.data.runId; this.session.lastRunId = r.data.runId; this.markDirty(); this.emit('run-finished', { id: r.data.runId });
    const { record, telemetry } = await this.getRun(r.data.runId);
    const info = describeFlight(record, telemetry, v, m);
    if (info.status === 'SUCCESS') this._okSig = designSignature(this.project.vehicle, this.project.mission);
    return { ok: info.status === 'SUCCESS', runId: r.data.runId, info, text: info.status === 'SUCCESS' ? flightShortText(info) : '', cause: info.cause ?? '' };
  }
  /** Has the active rocket + goal flown successfully (with the launch path that is saved in the mission)? Live Flight uses this to decide whether to find the path first. */
  needsLaunchPath() {
    const v = this.project.vehicle, m = this.project.mission;
    if (!v || !m || !(m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit')) return false;
    return this._okSig !== designSignature(v, m);
  }
  stopFix() { if (this._fixStop) this._fixStop.stop = true; }
  get fixing() { return !!this._fixStop; }
  startLive() {
    const v = this.project.vehicle, m = this.project.mission;
    if (!v) throw new Error('There is no vehicle yet. Create one in the Vehicle Designer.');
    if (!m) throw new Error('There is no mission yet. Create one in the Mission Planner.');
    if (this.api.ctx.running) throw new Error('A simulation is already running.');
    this.live?.dispose();
    this.live = new LiveRun(this, { vehicle: v, mission: m });
    this.emit('live-start', this.live);
    return this.live;
  }
  stopLive() { if (this.live && !this.live.finished) this.live.stop(); }
  async deleteRun(id) {
    const P = this.project; P.runs = P.runs.filter((r) => r.id !== id);
    this.api.ctx.runs.delete(id); this.api.ctx.runOrder = this.api.ctx.runOrder.filter((x) => x !== id);
    try { await this.storage.remove(`${P.dir ?? projectDir(P.name)}/simulations/${id}`); } catch { /* not saved yet */ }
    if (this.selectedRun === id) this.selectedRun = P.runs.length ? P.runs[P.runs.length - 1].id : null;
    this.markDirty(); this.emit('run-deleted', id);
  }

  // ---------------------------------------------------------------- AI
  async ask(text) {
    const user = { id: `u${Date.now()}`, role: 'user', text, ts: new Date().toISOString() };
    this.chat.push(user); this.emit('chat', user);
    const reply = await this.session.send(text);
    this.chat.push(reply);
    if (reply.run?.id || this.session.lastRunId) { this.selectedRun = this.session.lastRunId ?? this.selectedRun; }
    this.markDirty(); this.session.rememberAliases();
    this.emit('chat', reply); this.emit('design', 'ai'); this._syncAfterVehicleChange();
    return reply;
  }
}
