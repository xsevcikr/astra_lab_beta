// Experiment Lab: parameter sweeps. Every case is a complete, real simulation; nothing is interpolated or estimated.
//
// Parameter paths (strings) address a value in one of the four inputs of a simulation:
//   vehicle.components[<id>].<field>      e.g.  vehicle.components[fuel2].propellantMass
//   vehicle.group[<groupId>].propellantScale  (scale the propellant of a whole stage: value is a factor)
//   mission.events[<id>].action.dv        mission.guidance.params.schedule.hF   mission.objective.altitude
//   environment.site.lat                  environment.body            settings.dt
// A parameter is {path, values:[...]} or {path, from, to, steps} and an optional mode 'set' (default) | 'scale' | 'add'.
import { runSimulation } from './runner.js';
import { setMissionAltitude } from '../missions/generator.js';
import { runMetrics } from './run-analysis.js';
import { buildRunRecord } from './project.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const tick = () => new Promise((r) => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));

export function expandValues(p) {
  if (Array.isArray(p.values)) return p.values;
  const steps = Math.max(1, Math.floor(p.steps ?? 5));
  if (steps === 1) return [p.from];
  return Array.from({ length: steps }, (_, i) => p.from + ((p.to - p.from) * i) / (steps - 1));
}

function resolve(root, tokens) {
  let cur = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (t.id != null) { cur = (Array.isArray(cur) ? cur : cur[t.key]).find((x) => x.id === t.id); }
    else cur = cur[t.key];
    if (cur == null) throw new Error(`Parameter path not found near "${t.id ?? t.key}"`);
  }
  return [cur, tokens[tokens.length - 1]];
}
function tokenize(path) {
  const toks = [];
  for (const part of path.split('.')) {
    const m = /^([A-Za-z0-9_]+)\[([^\]]+)\]$/.exec(part);
    if (m) { toks.push({ key: m[1] }); toks.push({ id: m[2] }); } else toks.push({ key: part });
  }
  // fold {key: 'components'}, {id: 'x'} into one step that selects the element
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].id != null) out[out.length - 1] = { key: out[out.length - 1].key, id: toks[i].id }; else out.push(toks[i]);
  }
  return out;
}

/** Apply one parameter assignment to an inputs object {vehicle, mission, environment, settings}. */
export function applyParameter(inputs, path, value, mode = 'set') {
  if (path === 'mission.targetAltitude') { setMissionAltitude(inputs.mission, mode === 'scale' ? inputs.mission.objective.altitude * value : mode === 'add' ? inputs.mission.objective.altitude + value : value); return; }
  const km = /^vehicle\.kind\[([^\]]+)\]\.([A-Za-z0-9_]+)$/.exec(path);
  if (km) {   // every component of a kind ('*' = all components) that has a numeric field of that name
    let n = 0;
    for (const c of inputs.vehicle.components) {
      if ((km[1] !== '*' && c.kind !== km[1]) || typeof c[km[2]] !== 'number') continue;
      c[km[2]] = mode === 'scale' ? c[km[2]] * value : mode === 'add' ? c[km[2]] + value : value; n++;
    }
    if (!n) throw new Error(`No component of kind "${km[1]}" has a numeric field "${km[2]}"`);
    return;
  }
  const m = /^vehicle\.group\[([^\]]+)\]\.propellantScale$/.exec(path);
  if (m) {
    if (mode !== 'set') throw new Error('propellantScale is always a factor (mode set)');
    for (const c of inputs.vehicle.components) if (c.group === m[1] && c.propellantMass) c.propellantMass *= value;
    return;
  }
  const [head, ...rest] = path.split('.');
  if (!['vehicle', 'mission', 'environment', 'settings'].includes(head)) throw new Error(`Unknown parameter root "${head}"`);
  const toks = tokenize(rest.join('.'));
  if (!toks.length) throw new Error(`Bad parameter path: ${path}`);
  const [parent, last] = resolve(inputs[head], toks);
  const holder = last.id != null ? null : parent;
  if (!holder) throw new Error(`Parameter path must end in a field: ${path}`);
  const cur = holder[last.key];
  holder[last.key] = mode === 'scale' ? cur * value : mode === 'add' ? cur + value : value;
}

export function caseGrid(parameters, limit = 400) {
  let grid = [[]];
  for (const p of parameters) {
    const vals = expandValues(p);
    const next = [];
    for (const g of grid) for (const v of vals) next.push([...g, { path: p.path, mode: p.mode ?? 'set', value: v }]);
    grid = next;
    if (grid.length > limit) throw new Error(`The sweep has more than ${limit} cases; reduce the number of values.`);
  }
  return grid;
}

/**
 * Run an experiment. spec = {name, parameters:[...], objective?:{metric, goal:'min'|'max', requireSuccess?:true}}
 * inputs = {vehicle, mission, environment?, settings?}. Progress callback receives {done,total,case}.
 */
export async function runExperiment(spec, inputs, { onProgress, shouldStop, sliceMs = 10, limit = 400, maxWallMsPerCase = 120000 } = {}) {
  const grid = caseGrid(spec.parameters ?? [], limit);
  const cases = [];
  const t0 = Date.now();
  for (let i = 0; i < grid.length; i++) {
    if (shouldStop?.()) break;
    const inp = clone({ vehicle: inputs.vehicle, mission: inputs.mission, environment: inputs.environment ?? {}, settings: inputs.settings ?? {} });
    let error = null;
    try { for (const a of grid[i]) applyParameter(inp, a.path, a.value, a.mode); } catch (e) { error = e.message; }
    const row = { index: i, params: Object.fromEntries(grid[i].map((a) => [a.path, a.value])), status: 'ERROR', reason: error };
    if (!error) {
      try {
        const sim = await runSimulation(inp, { sliceMs, shouldStop, maxWallMs: maxWallMsPerCase });
        const rec = buildRunRecord(sim);
        const m = runMetrics(rec, sim.telemetry);
        row.status = sim.result.status; row.reason = sim.result.reason; row.metrics = m;
        row.failures = (sim.result.failures ?? []).map((f) => ({ code: f.code, confidence: f.confidence, cause: f.primaryCause }));
      } catch (e) { row.status = 'ERROR'; row.reason = e.message; }
    }
    cases.push(row);
    onProgress?.({ done: i + 1, total: grid.length, case: row });
    await tick();
  }
  const out = { schema: 'astra.experiment/1', name: spec.name ?? 'Experiment', created: new Date().toISOString(), parameters: spec.parameters, objective: spec.objective ?? null, cases, wallMs: Date.now() - t0 };
  out.best = pickBest(out);
  out.summary = summarize(out);
  return out;
}

export function pickBest(exp) {
  const o = exp.objective; if (!o?.metric) return null;
  let best = null;
  for (const c of exp.cases) {
    if (c.status === 'ERROR') continue;
    if ((o.requireSuccess ?? true) && c.status !== 'SUCCESS') continue;
    const v = c.metrics?.[o.metric]; if (!Number.isFinite(v)) continue;
    if (!best || (o.goal === 'max' ? v > best.value : v < best.value)) best = { index: c.index, value: v, params: c.params };
  }
  return best;
}
function summarize(exp) {
  const n = exp.cases.length, ok = exp.cases.filter((c) => c.status === 'SUCCESS').length;
  return { cases: n, success: ok, failed: exp.cases.filter((c) => c.status === 'FAILURE').length, errors: exp.cases.filter((c) => c.status === 'ERROR').length, successRate: n ? ok / n : 0 };
}

export function experimentToCSV(exp, extraMetrics = ['endTime', 'maxAlt', 'finalPeri', 'finalApo', 'maxQ', 'maxG', 'propellantUsed', 'finalMass', 'dvIdeal', 'touchdownVertical', 'distanceDriven']) {
  const paths = (exp.parameters ?? []).map((p) => p.path);
  const head = [...paths, 'status', 'reason', ...extraMetrics, 'failure_codes'];
  const q = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '');
  const lines = [head.map(q).join(',')];
  for (const c of exp.cases) lines.push([...paths.map((p) => c.params[p]), c.status, c.reason, ...extraMetrics.map((k) => c.metrics?.[k]), (c.failures ?? []).map((f) => f.code).join('|')].map(q).join(','));
  return lines.join('\n');
}
