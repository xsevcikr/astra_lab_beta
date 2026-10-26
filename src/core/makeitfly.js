// "Fix it and fly again": really flies the current vehicle on the current mission and, when the flight fails, reads the REAL result,
// changes the design through the same tool API as the AI engineer, and flies again. It never claims success without a recorded
// SUCCESS flight, and it says plainly (in everyday words) what it changed or exactly why it could not make the rocket work.
//
//   const r = await makeItFly(api, { maxRounds: 4, onProgress, shouldStop });
//   r = { ok, status, reason, runId, changes:[...], rounds:[...], summary, cause, stopped, reverted, scheduleSaved }
//
// A flight that succeeds with a tuned pitch programme saves that programme into the active mission, so Live Flight, Replay and
// "Launch it" all fly the same schedule (the run record is marked meta.scheduleSaved).
import { analyzeVehicle, validateVehicle } from '../vehicles/analysis.js';
import { runMetrics } from './run-analysis.js';
import { ascentDvNeeded, suborbitalDvNeeded } from './readiness.js';
import { ENGINES } from '../../data/components.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const TANKS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
const LOAD_CODES = ['MAX_Q_EXCEEDED', 'STRUCTURAL_OVERLOAD', 'EXCESSIVE_ACCELERATION'];
const n0 = (x) => Math.round(x).toLocaleString('en-US');
const cleanCount = (x) => Math.max(1, Math.min(19, Math.round(x)));

const stageList = (v) => (v.stages ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((s) => v.components.some((c) => c.group === s.id && c.kind === 'engine'));
const stageName = (v, id) => v.stages?.find((s) => s.id === id)?.name ?? id;
const propOf = (v, id) => v.components.filter((c) => c.group === id && TANKS.includes(c.kind)).reduce((s, c) => s + (c.propellantMass ?? 0), 0);
const engineOf = (v, id) => v.components.find((c) => c.group === id && c.kind === 'engine');
const analyse = (v, body) => { try { return analyzeVehicle(v, { body }); } catch { return null; } };
const errorCodes = (v, body) => { try { return new Set(validateVehicle(v, { body }).filter((i) => i.severity === 'error').map((i) => `${i.code}:${i.message}`)); } catch { return new Set(); } };

function withEdit(v, fn) { const c = clone(v); fn(c); return c; }
function setCount(v, id, n) { const e = engineOf(v, id); if (e) { e.count = n; } return v; }
function setProp(v, id, total) { const cur = propOf(v, id), f = total / Math.max(cur, 1e-9); for (const t of v.components) if (t.group === id && TANKS.includes(t.kind)) t.propellantMass = Math.max(1, t.propellantMass * f); return v; }

/** Smaller engine of the same propellants as `eng` (by thrust), or null. */
const smallerEngines = (eng) => ENGINES.filter((e) => !e.solid && e.thrustVac > 3000 && e.thrustVac < eng.thrustVac * 0.9 && [...e.propellants].sort().join() === [...(eng.propellants ?? [])].sort().join()).sort((a, b) => b.thrustVac - a.thrustVac);

/** Plain, 12-year-old words for why a flight failed. `info` comes from describeFlight(). */
export function plainCause(info) {
  switch (info.kind) {
    case 'dv': return info.orbit ? 'It ran out of speed before it reached orbit. It needs more fuel.' : 'It ran out of push before it got high enough. It needs more fuel.';
    case 'twr-low': return 'The engines are too weak to lift it.';
    case 'twr-high': return 'The engines push so hard that the rocket breaks apart.';
    case 'upper': return 'The top stage is too weak. It cannot push the rocket up.';
    case 'load': return 'The air squeezed the rocket too hard in fast flight.';
    case 'thermal': return 'Part of the rocket got too hot.';
    case 'control': return 'The rocket lost control and tumbled.';
    case 'fuel': return 'It ran out of fuel before it landed.';
    case 'power': return 'The batteries ran out of electricity.';
    default: return info.reason ? `It ended with: ${String(info.reason).replace(/\.$/, '')}.` : 'The flight did not reach its goal.';
  }
}

/** Reads a finished run and says what went wrong, in numbers and in a class (`kind`). Pure: used by the UI and by makeItFly. */
export function describeFlight(record, tel, vehicle, mission) {
  const res = record.result ?? {};
  const fails = (res.failures ?? []).filter((f) => f.severity !== 'warning');
  const codes = new Set(fails.map((f) => f.code));
  let m = {}; try { m = runMetrics(record, tel); } catch { /* keep empty */ }
  const body = vehicle?.meta?.body ?? record.environment?.body ?? 'earth';
  const an = vehicle && vehicle.components?.some((c) => c.kind === 'engine') ? analyse(vehicle, body) : null;
  const obj = mission?.objective ?? record.mission?.objective ?? {};
  const orbit = obj.type === 'orbit', launcher = (mission?.guidance?.mode ?? record.mission?.guidance?.mode) === 'ascent';
  const short = fails.find((f) => Number.isFinite(f.dvShortfall) && f.dvShortfall > 0);
  const reason = String(res.reason ?? '');
  const info = { status: res.status, launcherFlag: launcher, reason, codes: [...codes], metrics: m, orbit, launcher, objective: obj, liftoffTWR: an?.liftoffTWR ?? null, analysis: an, dvShortfall: short?.dvShortfall ?? null, kind: 'other' };
  if (res.status === 'SUCCESS') { info.kind = 'ok'; return info; }
  const upper = an?.stages?.slice(1).map((s, i) => ({ i: i + 1, twr: s.twrVacStart })).filter((s) => s.twr < 0.55) ?? [];
  const reached = obj.altitude && Number.isFinite(m.maxAlt) ? m.maxAlt >= obj.altitude : false;
  const loads = LOAD_CODES.some((c) => codes.has(c)) || /structural/i.test(reason);
  info.loads = loads;
  if (codes.has('LOW_TWR') || (an && an.liftoffTWR < 1.1 && !(m.maxAlt > 500))) info.kind = 'twr-low';
  else if (loads && (an?.liftoffTWR ?? 0) > 2.4) info.kind = 'twr-high';
  else if (an && an.liftoffTWR > 3.5) info.kind = 'twr-high';
  else if (codes.has('UPPER_STAGE_TWR') || (launcher && upper.length && (codes.has('INSUFFICIENT_DELTA_V') || codes.has('INCORRECT_ORBIT') || /time limit/i.test(reason)))) info.kind = 'upper';
  else if (codes.has('INSUFFICIENT_DELTA_V') || codes.has('INCORRECT_ORBIT') || (launcher && orbit && /time limit|surface impact|thermal/i.test(reason)) || (launcher && !orbit && obj.altitude && !reached && /impact|time limit/i.test(reason))) info.kind = 'dv';
  else if (loads) info.kind = 'load';
  else if (codes.has('OVERTEMPERATURE')) info.kind = 'thermal';
  else if (codes.has('LOSS_OF_CONTROL')) info.kind = 'control';
  else if (codes.has('PROPELLANT_DEPLETION')) info.kind = 'fuel';
  else if (codes.has('POWER_FAILURE')) info.kind = 'power';
  info.upperWeak = upper[0]?.i ?? null;
  info.cause = plainCause(info);
  return info;
}

/**
 * Changes that follow from the diagnosis, in the order they are applied. They are computed one after the other on a working copy, so a later
 * change (more fuel) already counts the effect of an earlier one (more engines). Each part: {id, text, calls:[{tool,args}]}.
 */
function planChanges(v, info, mission, round = 0) {
  const body = v.meta?.body ?? 'earth';
  const parts = [];
  const stages = stageList(v);
  if (!stages.length) return parts;
  const w = clone(v);
  const A = () => analyse(w, body);
  const idxOf = (id) => stages.findIndex((s) => s.id === id);
  const addEngines = (st, target, text, field = 'lift') => {
    const cur = engineOf(w, st.id)?.count ?? 1;
    for (let n = cur + 1; n <= 19; n++) {
      const x = analyse(setCount(clone(w), st.id, n), body); if (!x) return false;
      const t = field === 'lift' ? x.liftoffTWR : x.stages?.[idxOf(st.id)]?.twrVacStart;
      if (t >= target) { setCount(w, st.id, n); parts.push({ id: `eng+${st.id}`, text: `${stageName(v, st.id)}: ${n} engines instead of ${cur}, ${text}`, calls: [{ tool: 'MODIFY_STAGE', args: { stage: st.id, engineCount: n } }] }); return true; }
    }
    return false;
  };
  const s1 = stages[0];
  const a0 = A(); if (!a0) return parts;
  const launcher = info.launcher;
  // ---- 1. thrust at liftoff: too low
  if (info.kind === 'twr-low' || a0.liftoffTWR < 1.3) addEngines(s1, 1.4, 'so it can lift off');
  // ---- 2. thrust at liftoff: so strong that the rocket breaks
  if (info.kind === 'twr-high' || (info.loads && a0.liftoffTWR > 2.4) || a0.liftoffTWR > 3.5) {
    const eng = engineOf(w, s1.id), cur = eng?.count ?? 1; let done = false;
    if (cur > 1) {
      let best = null;
      for (let n = cur - 1; n >= 1; n--) { const t = analyse(setCount(clone(w), s1.id, n), body)?.liftoffTWR ?? 0; if (t >= 1.3) best = { n, t }; if (t <= 2.3 && t >= 1.3) { best = { n, t }; break; } }
      if (best) { setCount(w, s1.id, best.n); parts.push({ id: `eng-${s1.id}`, text: `${stageName(v, s1.id)}: ${best.n} engines instead of ${cur}, so it pushes less hard`, calls: [{ tool: 'MODIFY_STAGE', args: { stage: s1.id, engineCount: best.n } }] }); done = true; }
    }
    if (!done && eng && propOf(w, s1.id) > 0) {   // one engine only: a heavier rocket (more fuel) pushes less hard for its weight
      const cur2 = propOf(w, s1.id); let lo = cur2, hi = cur2 * 3;
      const t = (p) => analyse(setProp(clone(w), s1.id, p), body)?.liftoffTWR ?? 0;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (t(mid) > 2.0) lo = mid; else hi = mid; }
      if (hi > cur2 * 1.03) { setProp(w, s1.id, hi); parts.push({ id: `more-${s1.id}`, text: `${stageName(v, s1.id)}: ${n0(hi - cur2)} kg more fuel, so it is heavier and pushes less hard`, calls: [{ tool: 'MODIFY_STAGE', args: { stage: s1.id, propellantMass: Math.round(hi) } }] }); done = true; }
    }
  }
  // ---- 3. upper stages that are too weak to climb
  const fixUpper = () => { const an = A(); stages.forEach((st, i) => { if (i > 0 && launcher && (an.stages?.[i]?.twrVacStart ?? 9) < 0.95) addEngines(st, 1.0, 'so it can keep pushing', 'upper'); }); };
  if (launcher && info.kind !== 'twr-low') fixUpper();
  // ---- 4. not enough speed: more fuel in every stage (keeps the balance between the stages), sized from the REAL shortfall and from the goal
  const orbitGoal = info.orbit, goalH = info.objective?.altitude ?? 200000;
  const needDv = launcher ? (orbitGoal ? ascentDvNeeded(body, goalH, Math.abs(mission?.initial?.lat ?? 28.5)) : suborbitalDvNeeded(body, goalH)) : 0;
  const dvLow = launcher && needDv > 0 && A().dvEstimate < needDv * 1.10;       // the rocket is also short of fuel on paper
  if (info.kind === 'dv' || info.kind === 'upper' || dvLow) {
    const need = needDv;
    const dv0 = A().dvEstimate;
    const real = info.dvShortfall != null && (info.kind === 'dv' || info.kind === 'upper') ? Math.min(info.dvShortfall * 1.25 + 60, need) : 0;
    const gap = Math.max(real, need * (1.10 + 0.05 * round) - dv0, dv0 * 0.05);
    const target = dv0 + gap;
    const withStages = stages.filter((st) => propOf(w, st.id) > 0);
    if (withStages.length) {
      const dvAt = (f) => analyse(withEdit(w, (c) => { for (const st of withStages) setProp(c, st.id, propOf(w, st.id) * f); }), body)?.dvEstimate ?? 0;
      let lo = 1, hi = 3;
      if (dvAt(hi) < target) lo = hi; else for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (dvAt(mid) < target) lo = mid; else hi = mid; }
      const f = Math.max(1.06, Math.min(hi, 2.2));
      const pct = Math.round((f - 1) * 100);
      const calls = withStages.map((st) => ({ tool: 'MODIFY_STAGE', args: { stage: st.id, propellantMass: Math.round(propOf(w, st.id) * f) } }));
      const txt = withStages.length > 1 ? `${pct} % more fuel in ${withStages.map((st) => stageName(v, st.id)).join(' and ')}` : `${stageName(v, withStages[0].id)}: ${pct} % more fuel (${n0(propOf(w, withStages[0].id) * (f - 1))} kg)`;
      for (const st of withStages) setProp(w, st.id, propOf(w, st.id) * f);
      parts.push({ id: 'fuel-all', text: txt, calls });
      // more fuel makes the rocket heavier: check that it still lifts off and that the upper stages still push
      if (A().liftoffTWR < 1.3) addEngines(s1, 1.4, 'to carry the extra fuel');
      if (launcher) fixUpper();
    }
  }
  // ---- 5. a lander / other craft that ran dry
  if (info.kind === 'fuel') {
    const st = stages.reduce((a, b) => (propOf(w, b.id) > propOf(w, a.id) ? b : a), stages[0]); const cur = propOf(w, st.id);
    if (cur > 0) parts.push({ id: `fuel-${st.id}`, text: `${stageName(v, st.id)}: ${n0(cur * 0.2)} kg more fuel`, calls: [{ tool: 'MODIFY_STAGE', args: { stage: st.id, propellantMass: Math.round(cur * 1.2) } }] });
  }
  return parts;
}

/**
 * @param api         the ToolAPI of the project (session.api)
 * @param opts        { maxRounds = 4, onProgress(p), shouldStop(), tuneCandidates = 3, name }
 *   onProgress gets { phase:'fly'|'fix'|'done', round, rounds, text, pct }
 */
export async function makeItFly(api, { maxRounds = 4, onProgress = () => {}, shouldStop = () => false, tuneCandidates = 3, name = null } = {}) {
  const P = api.project;
  const backup = P.designState();
  const before0 = clone(P.vehicle ?? {});
  const rounds = [], changes = [], tried = new Set();
  const say = (phase, round, text, pct) => { try { onProgress({ phase, round, rounds: maxRounds + 1, text, pct }); } catch { /* UI only */ } };
  const stopper = setInterval(() => { if (shouldStop() && api.ctx.running) api.ctx.stopRequested = true; }, 60);
  const finish = (r) => { clearInterval(stopper); say('done', rounds.length, r.summary, 1); return r; };
  let last = null;
  try {
    for (let round = 0; round <= maxRounds; round++) {
      if (shouldStop()) break;
      const v = P.vehicle, m = P.mission;
      if (!v) return finish({ ok: false, summary: 'There is no rocket to fly yet.', cause: '', changes, rounds, reverted: false });
      if (!m) return finish({ ok: false, summary: 'There is no goal to fly to yet. Pick a goal first.', cause: '', changes, rounds, reverted: false });
      say('fly', round, round === 0 ? 'Test flight 1' : `Test flight ${round + 1}`, (round + 0.1) / (maxRounds + 1));
      const canTune = m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit';
      const args = { tune: canTune, maxCandidates: round === 0 ? tuneCandidates : Math.max(2, tuneCandidates - 1), saveSchedule: true };
      if (round > 0) args.name = `${v.name} — ${m.name} (fixed ${round})`; else if (name) args.name = name;
      const r = await api.execute('RUN_SIMULATION', args);
      if (!r.ok) { // a design error that makes a flight meaningless: say what it is
        const msg = String(r.message ?? 'The flight could not start.').replace(/^The vehicle has design errors that make a simulation meaningless:\s*/i, '');
        rounds.push({ round, status: 'ERROR', reason: msg });
        return finish({ ok: false, status: 'ERROR', summary: `I could not fly it: ${msg}`, cause: msg, changes, rounds, reverted: false });
      }
      if (shouldStop()) { last = { runId: r.data.runId, status: r.data.status, reason: r.data.reason }; break; }
      const { record, telemetry } = await api.getRun(r.data.runId);
      const info = describeFlight(record, telemetry, v, m);
      last = { runId: r.data.runId, status: info.status, reason: info.reason, info };
      rounds.push({ round, runId: r.data.runId, status: info.status, reason: info.reason, kind: info.kind, twr: info.liftoffTWR, shortfall: info.dvShortfall, codes: info.codes, peri: info.metrics?.finalPeri, apo: info.metrics?.finalApo, maxAlt: info.metrics?.maxAlt });
      if (info.status === 'SUCCESS') {
        const net = describeDiff(before0, P.vehicle);
        const note = net.length ? `It flew! I changed: ${net.join('; ')}.` : changes.length ? 'It flew!' : 'It flew! Nothing had to be changed.';
        const goal = flightWinText(info);
        if (changes.length || r.data.scheduleSaved) P.commit(changes.length ? 'Fix it and fly again' : 'Save the working launch path');
        return finish({ ok: true, status: 'SUCCESS', reason: info.reason, runId: r.data.runId, changes, rounds, scheduleSaved: !!r.data.scheduleSaved, summary: `${note} ${goal}`.trim(), cause: '', reverted: false });
      }
      if (round === maxRounds) break;
      // ---- diagnose from this REAL result and change the design
      say('fix', round, 'Making it better...', (round + 0.6) / (maxRounds + 1));
      const parts = planChanges(v, info, m, round);
      // the best launch path of this round is where the next round starts (it is only kept in the project if a flight succeeds)
      if (r.data.schedule && m.guidance?.params) m.guidance.params.schedule = JSON.parse(JSON.stringify(r.data.schedule));
      const applied = [];
      for (const c of parts) {
        const snap = P.designState(); const before = errorCodes(P.vehicle, P.vehicle.meta?.body ?? 'earth');
        let good = true;
        for (const call of c.calls) { const res = await api.execute(call.tool, call.args); if (!res.ok) { good = false; break; } }
        if (good) { const after = errorCodes(P.vehicle, P.vehicle.meta?.body ?? 'earth'); for (const e of after) if (!before.has(e)) good = false; }
        if (good) applied.push(c); else P.applyDesignState(snap);
      }
      if (!applied.length) break;
      for (const c of applied) changes.push(c.text);
      if (shouldStop()) break;
    }
    // ---- it did not work (or the user stopped it): put the rocket back as it was and say why
    const stopped = shouldStop();
    const afterVehicle = clone(P.vehicle ?? before0);
    P.applyDesignState(backup);
    const info = last?.info;
    const why = info ? plainCause(info) : '';
    const net = changes.length ? describeDiff(before0, afterVehicle) : [];
    const tryText = net.length ? ` I tried: ${net.join('; ')}.` : '';
    const summary = stopped ? 'Stopped. Your rocket is as it was.'
      : `It still does not work. ${why}${tryText} Your rocket is unchanged. ${hint(info)}`.replace(/\s+/g, ' ').trim();
    return finish({ ok: false, status: last?.status ?? 'FAILURE', reason: last?.reason, runId: last?.runId, changes, rounds, stopped, reverted: true, cause: why, summary });
  } finally { clearInterval(stopper); }
}

/** What really changed between two versions of a design, as short plain phrases (net result, so a change that was undone does not show). */
export function describeDiff(before, after) {
  const out = [];
  for (const st of stageList(after)) {
    const b = before.components.find((c) => c.group === st.id && c.kind === 'engine'), a = engineOf(after, st.id);
    const nm = stageName(after, st.id);
    if (b && a && b.catalogId !== a.catalogId) out.push(`a different engine on ${nm}`);
    const nb = b?.count ?? 1, na = a?.count ?? 1;
    if (b && a && nb !== na) out.push(`${na > nb ? 'more' : 'fewer'} engines on ${nm} (${na} instead of ${nb})`);
    const pb = propOf(before, st.id), pa = propOf(after, st.id);
    if (pb > 0 && Math.abs(pa - pb) / pb > 0.01) out.push(`${pa > pb ? 'more' : 'less'} fuel in ${nm} (${pa > pb ? '+' : '-'}${Math.round(100 * Math.abs(pa - pb) / pb)} %)`);
  }
  return out;
}

function hint(info) {
  if (!info) return '';
  switch (info.kind) {
    case 'thermal': return 'Try a smaller payload or a gentler goal.';
    case 'control': return 'Check that it has a computer and something to steer with.';
    case 'dv': return 'Try a smaller payload or a lower orbit.';
    case 'twr-high': case 'load': return 'Try a smaller engine or more fuel.';
    default: return '';
  }
}

/** One plain sentence about a flight that worked. */
export function flightWinText(info) {
  const m = info.metrics ?? {}, o = info.objective ?? {};
  if (o.type === 'orbit' && Number.isFinite(m.finalPeri)) return `It reached an orbit ${n0(m.finalPeri / 1000)} by ${n0(m.finalApo / 1000)} km high.`;
  if (Number.isFinite(m.maxAlt)) return `It flew to ${n0(m.maxAlt / 1000)} km.`;
  return 'The goal was reached.';
}

/** Short text for the Rocket Builder: "Flew to 137 km: it works". */
export function flightShortText(info) {
  const m = info.metrics ?? {}, o = info.objective ?? {};
  if (o.type === 'orbit' && Number.isFinite(m.finalPeri)) return `Flew into a ${n0(m.finalPeri / 1000)} by ${n0(m.finalApo / 1000)} km orbit: it works`;
  if (Number.isFinite(m.maxAlt)) return `Flew to ${n0(m.maxAlt / 1000)} km: it works`;
  return 'It flew: it works';
}

/** A short text that changes whenever the design changes in a way that matters for a flight (the saved launch path is left out on purpose). */
export function designSignature(vehicle, mission) {
  if (!vehicle) return '';
  const g = mission?.guidance ? { ...mission.guidance, params: { ...(mission.guidance.params ?? {}), schedule: undefined } } : null;
  const str = JSON.stringify([vehicle.components, vehicle.stages, mission ? [mission.id, mission.objective, g, mission.initial, mission.events] : null]);
  let hsh = 5381; for (let i = 0; i < str.length; i++) hsh = ((hsh << 5) + hsh + str.charCodeAt(i)) | 0;
  return `${vehicle.id}:${str.length}:${hsh}`;
}
