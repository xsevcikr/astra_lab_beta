// AI Mission Director tool layer. The language model only calls these tools; the tools call the physics.
// Permission levels gate what the AI may do, every call is audited, and major or dangerous changes wait for
// explicit human confirmation. The AI is never a source of physical values: tool results come from the engine.
import { performance, setPath, getPath, cloneVehicle } from '../vehicle/model.js';
import { simulateAscent } from '../flight/ascent.js';
import { simulateDescent } from '../flight/descent.js';
import { simulateEntry } from '../flight/entry.js';
import { runLunarMission } from '../workflow/lunarMission.js';
import { runMonteCarlo } from '../analysis/montecarlo.js';
import { MODELS } from '../analysis/models.js';
import { tornado } from '../analysis/sensitivity.js';
import { tradeStudy } from '../analysis/trade.js';
import { designReview } from '../review/designReview.js';
import { verifyAll, changeImpact } from '../requirements/requirements.js';
import { buildMissionReport } from '../reports/report.js';
import { hohmann } from '../core/orbit.js';
import { getBody } from '../core/bodies.js';
import { diagnoseSensor } from '../sensors/sensor.js';
import { LESSONS } from '../learning/academy.js';
import { optimize } from '../analysis/optimize.js';
import { landerSizing } from '../analysis/experiments.js';

export const LEVELS = ['observe', 'suggest', 'simulate', 'modify', 'execute'];
const rank = (l) => LEVELS.indexOf(l);

// ctx: { project } where project holds vehicles, requirements, mission results, recorders and a version store
export function buildTools(ctx) {
  const P = ctx.project;
  const vehicle = (id) => { const v = P.vehicles[id]; if (!v) throw new Error(`no vehicle ${id}; known: ${Object.keys(P.vehicles).join(', ')}`); return v; };
  return {
    read_vehicle: { level: 'observe', description: 'Read a vehicle configuration and its ideal performance.', params: { vehicleId: 'string' }, run: ({ vehicleId }) => ({ vehicle: vehicle(vehicleId), performance: performance(vehicle(vehicleId)) }) },
    read_requirements: { level: 'observe', description: 'Read requirements and their latest verification status.', params: {}, run: () => verifyAll(P.requirements, P.lastMission?.metrics || {}, P.lastMC) },
    read_mission_objectives: { level: 'observe', description: 'Read the mission objective text and phases.', params: {}, run: () => ({ objective: P.objective, phases: P.lastMission?.phases.map((p) => ({ name: p.name, success: p.success, text: p.text })) ?? null }) },
    read_telemetry: { level: 'observe', description: 'Read statistics of a telemetry channel from the last mission recorder, optionally between two times (s).', params: { channel: 'string', t0: 'number?', t1: 'number?' },
      run: ({ channel, t0 = -Infinity, t1 = Infinity }) => { const r = P.lastMission?.recorder; if (!r) throw new Error('no mission has been flown yet'); return { channel, unit: r.channels.get(channel)?.unit, ...r.stats(channel, t0, t1) }; } },
    analyze_failures: { level: 'observe', description: 'List anomalies and failures from the last mission timeline with the telemetry just before each.', params: {},
      run: () => { const m = P.lastMission; if (!m) throw new Error('no mission has been flown yet'); return m.timeline.events.filter((e) => ['critical', 'warning'].includes(e.severity)).map((e) => ({ met: e.t, text: e.text, before: m.recorder.frameAt(Math.max(0, e.t - 5)) })); } },
    diagnose_sensor: { level: 'observe', description: 'Diagnose a sensor from its telemetry samples (optionally against a reference channel).', params: { samples: 'array', spec: 'object', reference: 'array?' }, run: ({ samples, spec, reference }) => diagnoseSensor(samples, spec, reference) },
    explain_concept: { level: 'observe', description: 'Explain an engineering concept from the Academy, with the experiment that demonstrates it.', params: { topic: 'string' },
      run: ({ topic }) => { const l = LESSONS.find((x) => x.id === topic || x.title.toLowerCase().includes(topic.toLowerCase())); if (!l) throw new Error(`no lesson on ${topic}`); return { title: l.title, summary: l.summary, equations: l.equations, experiment: l.experiment }; } },
    suggest_maneuver: { level: 'suggest', description: 'Compute a two-impulse Hohmann transfer between circular orbits (altitudes in m) around a body.', params: { body: 'string', fromAlt: 'number', toAlt: 'number' },
      run: ({ body, fromAlt, toAlt }) => { const b = getBody(body); const h = hohmann(b.mu, b.radius + fromAlt, b.radius + toAlt); return { ...h, note: 'Impulsive two-body estimate; finite burns cost slightly more.' }; } },
    design_review: { level: 'suggest', description: 'Run the automated design review on a vehicle.', params: { vehicleId: 'string', dvRequired: 'number?' }, run: ({ vehicleId, dvRequired }) => designReview(vehicle(vehicleId), { dvRequired }) },
    compare_designs: { level: 'suggest', description: 'Trade study between vehicles.', params: { vehicleIds: 'array' }, run: ({ vehicleIds }) => tradeStudy(vehicleIds.map(vehicle)) },
    run_simulation: { level: 'simulate', description: 'Run a time-domain simulation: ascent, descent, entry or lunar-mission.', params: { kind: 'string', vehicleId: 'string?', options: 'object?' },
      run: ({ kind, vehicleId, options = {} }) => {
        let r;
        if (kind === 'ascent') r = simulateAscent(vehicle(vehicleId), options);
        else if (kind === 'descent') r = simulateDescent(vehicle(vehicleId), options);
        else if (kind === 'entry') r = simulateEntry(options.vehicle || 'crew-capsule', options);
        else if (kind === 'lunar-mission') { r = runLunarMission(P.architecture?.() , options); P.lastMission = r; return { success: r.success, failedPhase: r.failedPhase, phases: r.phases.map((p) => ({ name: p.name, success: p.success, text: p.text })), metrics: r.metrics }; }
        else throw new Error(`unknown simulation ${kind}`);
        const { recorder, timeline, detail, ...rest } = r;
        return { ...rest, events: timeline.events.map((e) => `${e.t.toFixed(1)} s ${e.text}`) };
      } },
    run_monte_carlo: { level: 'simulate', description: 'Run a Monte Carlo analysis on a model (lunar-landing, ascent, entry, rendezvous, lunar-mission).', params: { model: 'string', runs: 'number' },
      run: ({ model, runs }) => { if (!MODELS[model]) throw new Error(`unknown model ${model}`); if (runs > 2000) throw new Error('AI tool runs are capped at 2000; use the Monte Carlo workspace for more'); const r = runMonteCarlo(MODELS[model](), { runs, keepRuns: false }); if (model === 'lunar-mission') P.lastMC = r; return { runs: r.runs, successProbability: r.successProbability, failureModes: r.failureModes, metrics: Object.fromEntries(Object.entries(r.metrics).map(([k, v]) => [k, { mean: v.mean, p05: v.p05, p95: v.p95 }])) }; } },
    sensitivity: { level: 'simulate', description: 'Tornado sensitivity of a model metric.', params: { model: 'string', metric: 'string' }, run: ({ model, metric }) => tornado(MODELS[model](), metric) },
    experiment_lightest_lander: { level: 'simulate', description: 'Experiment mode: find the lightest lander that lands a payload (kg) on the Moon, using landing simulations.', params: { payload: 'number' },
      run: ({ payload }) => { const r = optimize(landerSizing({ payload }), { iterations: 30, initial: 16 }); return { best: r.best, evaluated: r.evaluated, rejectedReasons: r.rejectedReasons, explanation: r.explanation }; } },
    create_report: { level: 'simulate', description: 'Generate an engineering report from the last mission and verification.', params: {},
      run: () => { if (!P.lastMission) throw new Error('fly a mission first'); const ver = verifyAll(P.requirements, P.lastMission.metrics, P.lastMC); P.lastReport = buildMissionReport({ objective: P.objective, vehicles: Object.values(P.vehicles), mission: P.lastMission, verification: ver, mc: P.lastMC }); return { title: P.lastReport.title, sections: P.lastReport.sections.map((s) => s.title) }; } },
    modify_vehicle: { level: 'modify', confirm: 'major', description: 'Change one vehicle parameter by path (for example stages.0.propMass). Creates a new version; requires human confirmation.', params: { vehicleId: 'string', path: 'string', value: 'number', reason: 'string' },
      preview: ({ vehicleId, path, value }) => ({ path, from: getPath(vehicle(vehicleId), path), to: value }),
      run: ({ vehicleId, path, value, reason }) => {
        const before = vehicle(vehicleId), v = setPath(cloneVehicle(before), path, value);
        const retest = P.requirements ? changeImpact(before, v, P.requirements).retest.map((r) => r.id) : [];
        const entry = P.versions.commit(v, `AI: ${reason}`, { author: 'ai-director' });
        P.vehicles[vehicleId] = cloneVehicle(entry.vehicle);
        return { newVersion: entry.version, change: { path, from: getPath(before, path), to: value }, retest };
      } },
    execute_command: { level: 'execute', confirm: 'dangerous', description: 'Send a command to a live vehicle flight computer (mode change, burn). Requires human confirmation and is light-time delayed.', params: { command: 'string', args: 'object?' },
      run: ({ command, args }) => { if (!P.live?.flightComputer) throw new Error('no live vehicle is connected'); P.live.flightComputer.enqueue({ name: command, ...args }); return { queued: command, note: 'Command queued; it executes when it reaches the vehicle and passes onboard validation.' }; } },
  };
}

export class MissionDirector {
  constructor(project, { level = 'simulate' } = {}) {
    this.project = project; this.level = level; this.tools = buildTools({ project }); this.audit = []; this.pending = new Map(); this.seq = 0;
  }
  setLevel(level) { if (!LEVELS.includes(level)) throw new Error(`unknown level ${level}`); this.audit.push({ t: Date.now(), action: 'level-change', from: this.level, to: level, by: 'user' }); this.level = level; }
  // JSON-schema style definitions for a language model's tool-use interface
  toolDefinitions() {
    return Object.entries(this.tools).map(([name, t]) => ({ name, description: `${t.description} [permission: ${t.level}${t.confirm ? ', needs confirmation' : ''}]`,
      input_schema: { type: 'object', properties: Object.fromEntries(Object.entries(t.params).map(([k, v]) => [k, { type: v.replace('?', '') }])), required: Object.entries(t.params).filter(([, v]) => !v.endsWith('?')).map(([k]) => k) } }));
  }
  call(name, args = {}) {
    const t = this.tools[name];
    const rec = { id: ++this.seq, t: Date.now(), tool: name, args, level: t?.level };
    if (!t) { rec.status = 'error'; rec.error = `unknown tool ${name}`; this.audit.push(rec); return rec; }
    if (rank(t.level) > rank(this.level)) { rec.status = 'denied'; rec.error = `"${name}" needs permission level ${t.level}; the AI currently has ${this.level}.`; this.audit.push(rec); return rec; }
    if (t.confirm) {
      rec.status = 'needs-confirmation'; rec.preview = t.preview?.(args) ?? args; rec.severity = t.confirm;
      this.pending.set(rec.id, { name, args }); this.audit.push(rec);
      return rec;
    }
    return this._exec(rec, t, args);
  }
  confirm(id, approvedBy = 'user') {
    const p = this.pending.get(id);
    if (!p) throw new Error(`no pending request ${id}`);
    this.pending.delete(id);
    const t = this.tools[p.name];
    if (rank(t.level) > rank(this.level)) return { id, status: 'denied', error: 'permission level was lowered before confirmation' };
    return this._exec({ id, t: Date.now(), tool: p.name, args: p.args, level: t.level, approvedBy }, t, p.args);
  }
  reject(id, by = 'user') { const p = this.pending.get(id); this.pending.delete(id); const rec = { id, t: Date.now(), tool: p?.name, status: 'rejected', by }; this.audit.push(rec); return rec; }
  _exec(rec, t, args) {
    try { rec.result = t.run(args); rec.status = 'ok'; } catch (e) { rec.status = 'error'; rec.error = e.message; }
    this.audit.push({ ...rec, result: undefined, resultSummary: rec.status === 'ok' ? summarize(rec.result) : undefined });
    return rec;
  }
}
const summarize = (r) => { const s = JSON.stringify(r); return s.length > 300 ? s.slice(0, 300) + '…' : s; };
