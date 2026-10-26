// Long-running engineering jobs. The same functions run inside a Web Worker (so the window stays responsive on
// an older laptop) or inline when workers are unavailable. Every result is converted to plain data first:
// numbers come straight from the engine, nothing here computes or adjusts a value.
import * as E from '../../src/engineering/index.js';

// Convert engine objects (recorders, timelines, twins, Maps, version stores) into structured-clone-safe data.
export function plain(x, depth = 0) {
  if (x === null || typeof x !== 'object') return typeof x === 'function' ? undefined : x;
  if (depth > 12) return undefined;
  if (x instanceof E.FlightRecorder) return { __recorder: x.toJSON() };
  if (x instanceof E.Timeline) return { __timeline: x.events.map((e) => plain(e, depth + 1)) };
  if (x instanceof E.DigitalTwin) return { __twin: plain(x.snapshot(), depth + 1) };
  if (x instanceof E.VersionStore) return { __versions: plain(x.versions, depth + 1) };
  if (x instanceof Map) return Object.fromEntries([...x].map(([k, v]) => [k, plain(v, depth + 1)]));
  if (ArrayBuffer.isView(x)) return Array.from(x);
  if (Array.isArray(x)) return x.map((v) => plain(v, depth + 1));
  const o = {};
  for (const [k, v] of Object.entries(x)) { const p = plain(v, depth + 1); if (p !== undefined) o[k] = p; }
  return o;
}

const vehicleOf = (a) => (a.vehicle ? a.vehicle : E.loadVehicle(a.vehicleId));

export const JOBS = {
  mission: ({ arch, failures, seed }) => {
    const a = arch || E.defaultLunarArchitecture(); if (seed !== undefined) a.seed = seed;
    const r = E.runLunarMission(a, { failures: failures || {} });
    return plain({ ...r, phases: r.phases.map(({ detail, ...p }) => ({ ...p, detail: detail && { outcome: detail.outcome, text: detail.text, model: detail.model, modelNote: detail.modelNote, losses: detail.losses, touchdown: detail.touchdown } })), arch: a });
  },
  loop: ({ mcRuns = 10, maxIterations = 2 }, progress) => {
    const r = E.runEngineeringLoop({ mcRuns, maxIterations, onStep: (s) => progress?.({ step: s.step }) });
    return plain({ log: r.log, versions: r.versions, arch: r.arch,
      iterations: r.iterations.map((it) => ({ iteration: it.iteration, verification: it.verification, risk: it.risk, review: it.review,
        mc: it.mc && { runs: it.mc.runs, successProbability: it.mc.successProbability, failureModes: it.mc.failureModes },
        mission: { success: it.mission.success, failedPhase: it.mission.failedPhase, metrics: it.mission.metrics, phases: it.mission.phases.map(({ detail, ...p }) => p) } })) });
  },
  mc: async ({ model, runs = 100, seed = 12345, vehicle, modelOpts }, progress) => {
    const m = vehicle ? E.MODELS[model](vehicle, modelOpts) : E.MODELS[model]();
    const r = await E.runMonteCarloAsync(m, { runs, seed, chunk: model === 'lunar-mission' ? 1 : 5, onProgress: (done, total) => progress?.({ done, total }) });
    return plain({ ...r, model: { id: m.id, name: m.name, params: m.params } });
  },
  tornado: ({ model, metric }) => { const m = E.MODELS[model](); return plain({ ...E.tornado(m, metric), model: { id: m.id, name: m.name } }); },
  sweep: ({ model, param, from, to, n }) => plain(E.sweepModel(E.MODELS[model](), param, from, to, n)),
  vv: () => plain(E.runVV()),
  lander: ({ payload = 2000, iterations = 30 }) => { const p = E.landerSizing({ payload }); const r = E.optimize(p, { iterations, initial: 16 }); return plain({ ...r, log: r.log.slice(-200), objectiveLabel: p.objectiveLabel }); },
  ascent: (a) => plain(E.simulateAscent(vehicleOf(a), a.options)),
  descent: (a) => plain(E.simulateDescent(vehicleOf(a), a.options)),
  entry: (a) => plain(E.simulateEntry(a.entryVehicle || 'crew-capsule', a.options)),
  rendezvous: (a) => plain(E.simulateRendezvous(a.options || {})),
  corridor: (a) => plain(E.entryCorridor(a.entryVehicle || 'crew-capsule', a.options || {})),
};
