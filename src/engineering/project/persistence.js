// Save everything: projects serialize vehicles, versions, requirements, mission results with full telemetry,
// Monte Carlo summaries, reports, experiments, AI conversations and audit, and test results. Live simulations
// can be snapshotted mid-flight and resumed bit-for-bit (including random-number generator state).
import { FlightRecorder } from '../flight/recorder.js';
import { Timeline } from '../flight/timeline.js';
import { configHash } from '../vehicle/twin.js';

export const SCHEMA_VERSION = 1;

function encode(v, seen = new WeakSet()) {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v;
  if (v instanceof Float64Array) return { $f64: Array.from(v) };
  if (v instanceof FlightRecorder) return { $recorder: v.toJSON() };
  if (v instanceof Timeline) return { $timeline: { epoch: v.epoch, events: v.events } };
  if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, encode(x, seen)]) };
  if (v._isRng) return { $rng: v.getState() };
  if (seen.has(v)) return undefined; // drop cycles
  seen.add(v);
  if (Array.isArray(v)) return v.map((x) => encode(x, seen));
  const out = {};
  for (const [k, x] of Object.entries(v)) { if (typeof x === 'function') continue; const e = encode(x, seen); if (e !== undefined) out[k] = e; }
  return out;
}
function decode(v, rngFactory) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decode(x, rngFactory));
  if ('$num' in v) return Number(v.$num);
  if ('$f64' in v) return Float64Array.from(v.$f64);
  if ('$recorder' in v) return FlightRecorder.fromJSON(v.$recorder);
  if ('$timeline' in v) { const t = new Timeline(v.$timeline.epoch); t.events = v.$timeline.events; return t; }
  if ('$map' in v) return new Map(v.$map.map(([k, x]) => [k, decode(x, rngFactory)]));
  if ('$rng' in v) { const r = rngFactory(1); r.setState(v.$rng); return r; }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x, rngFactory)]));
}

export function saveProject(project) {
  const body = encode({
    name: project.name, objective: project.objective, vehicles: project.vehicles, versions: project.versions?.toJSON?.() ?? project.versions,
    requirements: project.requirements, missions: project.missions || [], lastMission: project.lastMission ? { ...project.lastMission, twins: undefined } : null,
    monteCarlo: project.monteCarlo || [], reports: project.reports || [], experiments: project.experiments || [], aiConversations: project.aiConversations || [], aiAudit: project.aiAudit || [],
    testResults: project.testResults || [], liveSims: project.liveSims || {}, ui: project.ui || {},
  });
  const json = JSON.stringify(body);
  return JSON.stringify({ format: 'astra-lab-project', schema: SCHEMA_VERSION, saved: new Date().toISOString(), checksum: configHash(json), body: JSON.parse(json) });
}

export function loadProject(text, { rngFactory } = {}) {
  const doc = JSON.parse(text);
  if (doc.format !== 'astra-lab-project') throw new Error('not an ASTRA LAB project file');
  if (doc.schema > SCHEMA_VERSION) throw new Error(`project schema ${doc.schema} is newer than this ASTRA LAB (${SCHEMA_VERSION})`);
  if (configHash(JSON.stringify(doc.body)) !== doc.checksum) throw new Error('project file is corrupted (checksum mismatch)');
  return decode(doc.body, rngFactory);
}

// --- live simulation snapshots ---
const SKIP = new Set(['w', 'deriv', 'terrain', 'terr', 'body', 'v', 'L']);
export function snapshotSim(sim) {
  const state = {};
  for (const [k, x] of Object.entries(sim)) if (!SKIP.has(k) && typeof x !== 'function') state[k] = encode(x);
  return { kind: sim.constructor.name, state };
}
// Restore onto a freshly constructed simulation of the same class and options (rebuilds terrain, integrator).
export function restoreSim(fresh, snap, rngFactory) {
  if (fresh.constructor.name !== snap.kind) throw new Error(`snapshot is a ${snap.kind}, not a ${fresh.constructor.name}`);
  const s = decode(snap.state, rngFactory);
  for (const [k, x] of Object.entries(s)) {
    const cur = fresh[k];
    if (cur && typeof cur === 'object' && !Array.isArray(cur) && !(cur instanceof Float64Array) && !(cur instanceof FlightRecorder) && !(cur instanceof Timeline) && !cur._isRng && x && typeof x === 'object' && !Array.isArray(x)) Object.assign(cur, x); // keep class prototypes (e.g. KalmanPV)
    else fresh[k] = x;
  }
  return fresh;
}
