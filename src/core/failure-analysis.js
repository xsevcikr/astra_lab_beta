// Failure analysis: WHY a flight failed, on a timeline, with fixes whose size is computed (rocket equation, static vehicle analysis or
// test flights of the real simulator) and which can be applied through the tool API as ONE undo step.
//
// Inputs are always a recorded run (record + telemetry + runMetrics). Nothing here is invented: each number comes from the
// failure records written by physics/failures.js, from the telemetry, from vehicles/analysis.js or from an extra simulation.
import { stageOrder, analyzeVehicle } from '../vehicles/analysis.js';
import { modifyComponent } from '../vehicles/vehicle.js';
import { runSimulation } from './runner.js';
import { runMetrics } from './run-analysis.js';
import { buildRunRecord } from './project.js';
import { designLimits } from './requirements.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const fin = (v) => Number.isFinite(v);
const fmt = (v, d = 1) => (fin(v) ? Number(v).toFixed(d) : '-');
const grp = (v, d = 0) => (fin(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');
const TANKS = new Set(['fuel_tank', 'oxidizer_tank', 'propellant_tank']);
const ev = (f, label) => f.evidence?.find((e) => e.label === label)?.value;

// ------------------------------------------------------------------------------------------------ operations on a vehicle
// The same operations are (a) tried on a copy of the flown vehicle for the test flights and (b) turned into tool-API calls
// for the real change, so what was tested is what gets applied. They use modifyComponent(), the function the tools use.
export function stagePropellant(vehicle, group) { return vehicle.components.filter((c) => c.group === group && TANKS.has(c.kind)).reduce((s, c) => s + (c.propellantMass ?? 0), 0); }
export function applyOps(vehicle, ops) {
  for (const o of ops) {
    if (o.op === 'stage-propellant') {
      const tanks = vehicle.components.filter((c) => c.group === o.group && TANKS.has(c.kind));
      const cur = tanks.reduce((s, c) => s + c.propellantMass, 0); const factor = o.total / Math.max(cur, 1e-9);
      for (const t of tanks) modifyComponent(vehicle, t.id, { propellantMass: Math.max(1, Math.round(t.propellantMass * factor * 10) / 10) });
    } else if (o.op === 'stage-engines') {
      const eng = vehicle.components.find((c) => c.group === o.group && c.kind === 'engine'); if (!eng) throw new Error(`No engine in ${o.group}`);
      eng.count = o.count; eng.name = eng.name.replace(/ ×\d+$/, '') + (o.count > 1 ? ` ×${o.count}` : '');
    } else if (o.op === 'stage-thrust') {
      for (const e of vehicle.components.filter((c) => c.group === o.group && c.kind === 'engine')) modifyComponent(vehicle, e.id, { thrustVac: Math.round(e.thrustVac * o.scale) });
    } else throw new Error(`Unknown operation ${o.op}`);
  }
  return vehicle;
}
/** The tool calls that make the same change in the project. */
export function opsToToolCalls(ops, vehicle) {
  const calls = [];
  for (const o of ops) {
    if (o.op === 'stage-propellant') calls.push({ tool: 'MODIFY_STAGE', args: { vehicle: vehicle.id, stage: o.group, propellantMass: Math.round(o.total * 10) / 10 } });
    else if (o.op === 'stage-engines') calls.push({ tool: 'MODIFY_STAGE', args: { vehicle: vehicle.id, stage: o.group, engineCount: o.count } });
    else if (o.op === 'stage-thrust') for (const e of vehicle.components.filter((c) => c.group === o.group && c.kind === 'engine')) calls.push({ tool: 'MODIFY_COMPONENT', args: { vehicle: vehicle.id, id: e.id, changes: { thrustVac: Math.round(e.thrustVac * o.scale) } } });
  }
  return calls;
}
export function opsText(ops) {
  return ops.map((o) => o.op === 'stage-propellant' ? `${o.group}: propellant ${grp(o.from)} -> ${grp(o.total)} kg` : o.op === 'stage-engines' ? `${o.group}: ${o.from} -> ${o.count} engine(s)` : `${o.group}: engine thrust x ${fmt(o.scale, 2)}`).join('; ');
}

// ------------------------------------------------------------------------------------------------ stage helpers
function launcherStages(vehicle) { return stageOrder(vehicle).filter((s) => (vehicle.stages ?? []).some((x) => x.id === s.id) && vehicle.components.some((c) => c.group === s.id && c.kind === 'engine')); }
/** Stage that is firing at time t (number of separations in the telemetry at that time = index in firing order). */
function stageAt(record, tel, t) {
  const order = launcherStages(record.vehicle); if (!order.length) return null;
  let sep = 0; try { sep = Math.round(tel.column('stage')[tel.indexAt(t)] ?? 0); } catch { /* no telemetry */ }
  return order[Math.min(order.length - 1, Math.max(0, sep))];
}
const withStaticAnalysis = (record, fn) => { try { return fn(analyzeVehicle(record.vehicle, { body: record.environment?.body ?? 'earth' })); } catch { return null; } };

// ------------------------------------------------------------------------------------------------ timeline
/** Everything that happened, in order, with plain text. level: info | ok | warn | bad. `ch` names the telemetry channel that shows it. */
export function failureTimeline(record, tel, m) {
  const out = []; const res = record.result ?? {};
  const add = (t, level, title, detail, ch, code) => out.push({ t, level, title, detail, ch, code });
  for (const e of record.events ?? []) {
    if (['MISSION_START', 'EVENT_DONE', 'FAILURE', 'WARNING'].includes(e.kind)) continue;
    if (e.kind === 'MISSION_END') continue;
    if (e.kind === 'ENGINE_SPENT') add(e.t, 'bad', 'Engine out of propellant', e.message, 'propMass');
    else if (e.kind === 'LIFTOFF') add(e.t, 'info', 'Liftoff', e.message, 'alt');
    else add(e.t, 'info', e.message.split(' — ')[0], e.message.includes(' — ') ? e.message.split(' — ').slice(1).join(' - ') : '', 'alt');
  }
  if (fin(m.tMaxQ) && m.maxQ > 5000) add(m.tMaxQ, 'info', 'Max-Q (highest air pressure)', `${fmt(m.maxQ / 1000, 1)} kPa at ${fmt(m.altMaxQ / 1000, 1)} km, Mach ${fmt(m.machAtMaxQ, 2)}`, 'q');
  if (fin(m.tMaxG) && m.maxG > 3) add(m.tMaxG, 'info', 'Peak acceleration', `${fmt(m.maxG, 2)} g`, 'gload');
  if (fin(m.liftoffTWR) && fin(m.liftoffTime)) add(m.liftoffTime + 4, m.liftoffTWR < 1.2 ? 'warn' : 'info', 'Thrust-to-weight after liftoff', `${fmt(m.liftoffTWR, 2)} (needs at least 1.2)`, 'twr');
  for (const f of res.failures ?? []) add(f.t, f.severity === 'warning' ? 'warn' : 'bad', f.title, plainWhy(f, m), chOf(f.code), f.code);
  for (const w of res.warnings ?? []) if (!(res.failures ?? []).some((f) => f.code === w.code)) add(w.t, 'warn', 'Warning', w.message, null);
  add(m.endTime ?? 0, res.status === 'SUCCESS' ? 'ok' : 'bad', res.status === 'SUCCESS' ? 'Mission goal reached' : 'Flight ended', res.reason ?? '', 'alt', 'END');
  return out.sort((a, b) => a.t - b.t);
}
const CH = { MAX_Q_EXCEEDED: 'q', EXCESSIVE_ACCELERATION: 'gload', STRUCTURAL_OVERLOAD: 'structRatio', OVERTEMPERATURE: 'tempLead', UNDERTEMPERATURE: 'tempBody', LOSS_OF_CONTROL: 'attErr', POWER_FAILURE: 'batteryFrac', INSUFFICIENT_DELTA_V: 'dvIdeal', INCORRECT_ORBIT: 'peri', UPPER_STAGE_TWR: 'twr', LOW_TWR: 'twr', PROPELLANT_DEPLETION: 'propMass', ROVER_ROLLOVER: 'tipMargin', ROVER_IMMOBILISED: 'slip' };
const chOf = (code) => CH[code] ?? 'alt';

/** One or two short sentences with the numbers of this flight. */
export function plainWhy(f, m = {}) {
  const q = ev(f, 'Dynamic pressure'), lim = ev(f, 'Limit');
  switch (f.code) {
    case 'MAX_Q_EXCEEDED': return `The air pressure on the rocket reached ${fmt((q ?? m.maxQ) / 1000, 1)} kPa at T+${fmt(f.t, 0)} s. The weakest part is rated for ${fmt(lim / 1000, 1)} kPa.`;
    case 'EXCESSIVE_ACCELERATION': return `The payload felt ${fmt(ev(f, 'G-load'), 2)} g at T+${fmt(f.t, 0)} s. A part is rated for ${fmt(lim, 1)} g.`;
    case 'STRUCTURAL_OVERLOAD': return `The load on the structure reached ${fmt(100 * (ev(f, 'Load ratio') ?? 1), 0)} % of what it can carry at T+${fmt(f.t, 0)} s, with the rocket tilted ${fmt(ev(f, 'Angle of attack'), 1)} degrees into the wind.`;
    case 'INSUFFICIENT_DELTA_V': return `The rocket ran out of speed-change (delta-v) at T+${fmt(f.t, 0)} s. It was ${fmt(f.dvShortfall ?? ev(f, 'Δv still required'), 0)} m/s short of the orbit.`;
    case 'LOW_TWR': return `The engines push with ${fmt(ev(f, 'Thrust (sea level)') / 1000, 0)} kN but the rocket weighs ${fmt(ev(f, 'Weight') / 1000, 0)} kN. It cannot lift off (thrust-to-weight ${fmt(ev(f, 'TWR'), 2)}).`;
    case 'UPPER_STAGE_TWR': return `After separation the upper stage pushed with only ${fmt(f.minTwr, 2)} times its weight, so it kept falling while burning.`;
    case 'LOSS_OF_CONTROL': return `The rocket turned out of control at T+${fmt(f.t, 0)} s (steering error ${fmt(ev(f, 'Attitude error'), 0)} degrees).`;
    case 'OVERTEMPERATURE': return f.primaryCause;
    case 'PROPELLANT_DEPLETION': return 'The lander used all its propellant before it touched down.';
    default: return f.primaryCause ?? f.title;
  }
}

// ------------------------------------------------------------------------------------------------ fixes
/**
 * Fixes for the failures of a run. Each fix has a number that is computed:
 *   how: 'rocket equation' (static analysis of the vehicle with the real mass model), 'test flights' (found by flying the simulator)
 *   ops:   operations to apply (empty for 'test flights' fixes until resolveSearchFix() has run)
 *   ideas: more suggestions from the failure detector (NOT computed, not applied)
 */
export function proposeFixes(record, tel, m) {
  const res = record.result ?? {}, failures = (res.failures ?? []).filter((f) => f.severity !== 'warning');
  if (res.status === 'SUCCESS' || !failures.length) return [];
  const v = record.vehicle; const fixes = []; const seen = new Set();
  const order = [...failures].sort((a, b) => a.t - b.t);     // earliest first: later failures are often a consequence of earlier ones
  const root = order[0];
  for (const f of order) {
    if (seen.has(f.code) || fixes.length >= 4) continue; seen.add(f.code);
    const fx = fixFor(f, record, tel, m, v);
    if (fx) { fx.fromRoot = f === root; fixes.push(fx); }
  }
  return fixes;
}

function fixFor(f, record, tel, m, v) {
  const base = { id: `fix-${f.code}`, code: f.code, failure: f.title, t: f.t, ideas: f.solutions ?? [], ops: [], canApply: false };
  const stages = launcherStages(v);
  switch (f.code) {
    case 'LOW_TWR': {
      const st = stages[0]; if (!st) return { ...base, title: 'Add engine thrust', how: 'none', detail: f.primaryCause };
      const eng = v.components.find((c) => c.group === st.id && c.kind === 'engine'); const n0 = eng.count ?? 1;
      for (let n = n0 + 1; n <= n0 + 40; n++) {
        const vv = applyOps(clone(v), [{ op: 'stage-engines', group: st.id, count: n }]);
        const an = analyzeVehicle(vv, { body: record.environment?.body ?? 'earth' });
        if (an.liftoffTWR >= 1.3) {
          return { ...base, title: `Use ${n} engines on ${st.name} (now ${n0})`, plain: `More engines. Thrust-to-weight goes from ${fmt(m.liftoffTWR ?? ev(f, 'TWR'), 2)} to ${fmt(an.liftoffTWR, 2)}.`, how: 'static analysis',
            number: { label: 'Liftoff thrust-to-weight after the change', value: an.liftoffTWR, unit: '', text: `${fmt(an.liftoffTWR, 2)} (target 1.3)` }, detail: `Adding engines also adds their mass; the vehicle was re-analysed with the extra engine mass. Target thrust-to-weight 1.3.`, ops: [{ op: 'stage-engines', group: st.id, count: n, from: n0 }], canApply: true };
        }
      }
      return { ...base, title: 'Thrust is far too low', how: 'none', detail: 'Even 40 more engines of this type do not reach thrust-to-weight 1.3. Choose a stronger engine.' };
    }
    case 'INSUFFICIENT_DELTA_V': case 'INCORRECT_ORBIT': {
      const need = f.dvShortfall; if (!fin(need) || !(need > 0)) return { ...base, title: 'Check the burn sequence', how: 'none', detail: f.primaryCause };
      const st = stages[stages.length - 1]; if (!st) return null;
      const body = record.environment?.body ?? 'earth';
      const cur = stagePropellant(v, st.id);
      const dvWith = (x) => analyzeVehicle(applyOps(clone(v), [{ op: 'stage-propellant', group: st.id, total: cur + x }]), { body }).dvVacuum;
      const dv0 = dvWith(0), target = dv0 + need * 1.05;
      let lo = 0, hi = cur * 4 + 1000;
      if (dvWith(hi) < target) return { ...base, title: 'More propellant alone is not enough', how: 'rocket equation', detail: `Even ${grp(hi)} kg more propellant in ${st.name} does not close the ${fmt(need, 0)} m/s gap, because the extra propellant is also extra mass. Reduce payload or use a stronger upper stage.` };
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (dvWith(mid) < target) lo = mid; else hi = mid; }
      const add = Math.max(1, Math.ceil(hi));
      // alternative: lighter payload
      const pay = v.components.find((c) => c.group === 'payload' && c.mass > 5);
      let payCut = null;
      if (pay) { const dvLess = (x) => analyzeVehicle(applyOps0(clone(v), pay.id, pay.mass - x), { body }).dvVacuum; let a = 0, b = pay.mass * 0.9; if (dvLess(b) >= target) { for (let i = 0; i < 50; i++) { const mid = (a + b) / 2; if (dvLess(mid) < target) a = mid; else b = mid; } payCut = Math.ceil(b); } }
      return { ...base, title: `Add about ${grp(add)} kg of propellant to ${st.name}`, plain: `Carry about ${grp(add)} kg more fuel in ${st.name} (${grp(cur)} -> ${grp(cur + add)} kg).`, how: 'rocket equation',
        number: { label: 'Extra propellant', value: add, unit: 'kg', text: `+${grp(add)} kg` },
        detail: `Gap: ${fmt(need, 0)} m/s of delta-v (from the failure analysis). The rocket-equation delta-v of the whole vehicle (${fmt(dv0, 0)} m/s) must rise by that gap plus 5 % margin. The vehicle was re-analysed with the new tank mass, so the extra stage mass is included. Real flights also have losses that change a little with mass, so the fix is checked with test flights before it is applied.${payCut ? ` Alternative: remove ${grp(payCut)} kg of payload instead.` : ''}`,
        search: { kind: 'prop-add', group: st.id, groupName: st.name, from: cur, add, candidates: [1, 1.5, 2.5, 4], accept: (codes, r) => r.status === 'SUCCESS' || !codes.some((c) => c === 'INSUFFICIENT_DELTA_V' || c === 'INCORRECT_ORBIT') },
        ops: [{ op: 'stage-propellant', group: st.id, total: cur + add, from: cur }], canApply: true, alt: payCut ? { label: 'Or remove payload', value: payCut, unit: 'kg' } : null };
    }
    case 'UPPER_STAGE_TWR': {
      const an = withStaticAnalysis(record, (a) => a); if (!an) return null;
      let idx = 1; let worst = Infinity; an.stages.forEach((s, i) => { if (i > 0 && s.twrVacStart < worst) { worst = s.twrVacStart; idx = i; } });
      const st = stages[idx] ?? stages[stages.length - 1]; const eng = v.components.find((c) => c.group === st.id && c.kind === 'engine'); const n0 = eng.count ?? 1;
      for (let n = n0 + 1; n <= n0 + 30; n++) {
        const an2 = analyzeVehicle(applyOps(clone(v), [{ op: 'stage-engines', group: st.id, count: n }]), { body: record.environment?.body ?? 'earth' });
        if (an2.stages[idx].twrVacStart >= 1) return { ...base, title: `Use ${n} engines on ${st.name} (now ${n0})`, plain: `A stronger upper stage. Its thrust-to-weight at ignition goes from ${fmt(worst, 2)} to ${fmt(an2.stages[idx].twrVacStart, 2)}.`, how: 'static analysis',
          number: { label: 'Upper-stage thrust-to-weight at ignition', value: an2.stages[idx].twrVacStart, unit: '', text: `${fmt(an2.stages[idx].twrVacStart, 2)} (target at least 1.0)` }, detail: 'Computed from the vehicle mass model with the extra engine mass. Target: thrust at least equal to weight at ignition.', ops: [{ op: 'stage-engines', group: st.id, count: n, from: n0 }], canApply: true };
      }
      return { ...base, title: 'Upper stage is far too weak', how: 'none', detail: 'Even 30 more engines of this type do not give thrust-to-weight 1.0 at ignition. Pick a stronger engine.' };
    }
    case 'MAX_Q_EXCEEDED': case 'STRUCTURAL_OVERLOAD': case 'EXCESSIVE_ACCELERATION': {
      const st = stageAt(record, tel, f.t); if (!st) return null;
      const lim = designLimits(v);
      const q = ev(f, 'Dynamic pressure') ?? m.maxQ;
      const info = f.code === 'MAX_Q_EXCEEDED' ? `A part rated for at least ${fmt(q * 1.1 / 1000, 1)} kPa would also hold (+10 % margin; now ${fmt((lim.qLimit ?? 0) / 1000, 1)} kPa).` : f.code === 'EXCESSIVE_ACCELERATION' ? `A payload rated for at least ${fmt(m.maxG * 1.1, 1)} g would also hold (now ${fmt(lim.gLimit, 1)} g).` : '';
      return { ...base, title: `Lower the thrust of ${st.name}`, plain: `Push a bit less hard in ${st.name} so the load stays under the limit.`, how: 'test flights',
        search: { kind: 'thrust', group: st.id, groupName: st.name, candidates: thrustCandidates(f.code === 'MAX_Q_EXCEEDED' ? m.maxQ / (lim.qLimit ?? m.maxQ) : f.code === 'EXCESSIVE_ACCELERATION' ? m.maxG / (lim.gLimit ?? m.maxG) : 1.2), accept: (codes) => !codes.includes(f.code) },
        number: { label: 'Thrust scale', value: null, unit: '', text: 'found by test flights' }, detail: `Each candidate thrust level is flown with the real simulator; the first one where "${f.title}" no longer happens is chosen. ${info}`, ops: [] };
    }
    case 'PROPELLANT_DEPLETION': {
      const st = stages.length ? stages.reduce((a, b) => (stagePropellant(v, b.id) > stagePropellant(v, a.id) ? b : a)) : null; if (!st) return null;
      const cur = stagePropellant(v, st.id);
      return { ...base, title: `Carry more propellant in ${st.name}`, plain: 'More fuel for the landing.', how: 'test flights', search: { kind: 'propellant', group: st.id, groupName: st.name, from: cur, candidates: [1.1, 1.2, 1.35, 1.5, 1.75, 2], accept: (codes) => !codes.includes(f.code) },
        number: { label: 'Propellant', value: null, unit: 'kg', text: 'found by test flights' }, detail: 'Candidates +10 % ... +100 % propellant are flown with the real simulator; the first one that avoids running dry is chosen.', ops: [] };
    }
    default: return { ...base, title: f.title, how: 'none', detail: f.primaryCause, plain: plainWhy(f, m) };
  }
}
/** Thrust scales to try, starting near the ratio needed (load/limit) and going lower. */
function thrustCandidates(ratio) {
  const base = Math.min(0.95, Math.max(0.3, 1 / Math.max(ratio, 1.01)));
  const set = [(1 + base) / 2, base, base * 0.9, base * 0.8, base * 0.65].map((x) => Math.round(Math.max(0.25, Math.min(0.97, x)) * 100) / 100);
  return [...new Set(set)].sort((a, b) => b - a);
}
function applyOps0(v, payloadId, mass) { modifyComponent(v, payloadId, { mass }); return v; }

/** Fly a vehicle with the mission, environment and settings of a recorded run. Returns {status, reason, codes, metrics, record, telemetry}. */
export async function flyRecordWith(record, vehicle, { shouldStop, onProgress } = {}) {
  const sim = await runSimulation({ vehicle: clone(vehicle), mission: clone(record.mission), environment: clone(record.environment ?? {}), settings: clone(record.settings ?? {}) }, { shouldStop, onProgress, maxWallMs: 120000 });
  const rec = buildRunRecord(sim); const metrics = runMetrics(rec, sim.telemetry);
  return { status: sim.result.status, reason: sim.result.reason, codes: (sim.result.failures ?? []).map((x) => x.code), metrics, record: rec, telemetry: sim.telemetry };
}
/**
 * Find the size of a 'test flights' fix. Flies candidates in turn (at most search.candidates.length flights) and keeps the first that
 * removes the failure. Returns {ok, fix, tried:[{value, status, codes}]}. `fly(vehicle)` defaults to flyRecordWith.
 */
export async function resolveSearchFix(fix, record, { fly = (veh) => flyRecordWith(record, veh), onTry, shouldStop } = {}) {
  const s = fix.search; if (!s) return { ok: fix.canApply, fix, tried: [] };
  const tried = [];
  for (const c of s.candidates) {
    if (shouldStop?.()) break;
    const op = s.kind === 'thrust' ? { op: 'stage-thrust', group: s.group, scale: c } : s.kind === 'prop-add' ? { op: 'stage-propellant', group: s.group, total: s.from + Math.ceil(s.add * c), from: s.from } : { op: 'stage-propellant', group: s.group, total: Math.round(s.from * c), from: s.from };
    let r; try { r = await fly(applyOps(clone(record.vehicle), [op])); } catch (e) { tried.push({ value: c, status: 'ERROR', codes: [], reason: e.message }); continue; }
    tried.push({ value: c, status: r.status, codes: r.codes, reason: r.reason, metrics: r.metrics }); onTry?.(tried[tried.length - 1]);
    if (s.accept(r.codes, r)) {
      const value = s.kind === 'thrust' ? `${Math.round(c * 100)} % thrust` : `+${grp(op.total - s.from)} kg`;
      const outcome = r.status === 'SUCCESS' ? 'and the mission succeeded' : `but the mission still ends with ${r.status}: ${r.reason}`;
      const tried1 = `Test flight ${tried.length} of ${s.candidates.length}`;
      return { ok: true, tried, fix: { ...fix, ops: [op], canApply: true, resolved: true, title: s.kind === 'thrust' ? `Set ${s.groupName} thrust to ${Math.round(c * 100)} %` : `Add ${grp(op.total - s.from)} kg of propellant to ${s.groupName}`,
        number: { label: s.kind === 'thrust' ? 'Thrust scale' : 'Extra propellant', value: s.kind === 'thrust' ? c : op.total - s.from, unit: s.kind === 'thrust' ? '' : 'kg', text: value },
        detail: `${fix.detail} ${tried1}: the failure is gone ${outcome}.` } };
    }
  }
  return { ok: false, tried, fix: { ...fix, canApply: false, resolved: true, detail: `${fix.detail} None of the ${tried.length} test flights removed the failure. This change alone is not enough.` } };
}

// ------------------------------------------------------------------------------------------------ headline and diagnosis
export function diagnose(record, tel, m) {
  const res = record.result ?? {}, failures = (res.failures ?? []).filter((f) => f.severity !== 'warning');
  const sorted = [...failures].sort((a, b) => a.t - b.t);
  const root = sorted[0] ?? null;      // first thing that went wrong (later failures are usually consequences)
  const timeline = failureTimeline(record, tel, m);
  const status = res.status === 'SUCCESS' ? (res.warnings?.length ? 'PARTIAL' : 'OK') : (m.objectiveMet || (fin(m.finalPeri) && m.finalPeri > 0 && record.mission?.objective?.type === 'orbit' && m.finalPeri > 100000) ? 'PARTIAL' : 'FAILED');
  const causes = sorted.map((f) => ({ code: f.code, t: f.t, title: f.title, root: f === root, causedBy: f.causedBy ?? null, confidence: f.confidence, plain: plainWhy(f, m), cause: f.primaryCause, contributing: f.contributing ?? [], evidence: f.evidence ?? [], equation: f.equation ?? null, consequences: f.consequences }));
  const headline = !root ? (res.status === 'SUCCESS' ? 'The flight met its goal.' : `The flight ended early: ${res.reason}`) : `First problem at T+${fmt(root.t, 0)} s: ${root.title}. ${plainWhy(root, m)}${sorted.length > 1 ? ` ${sorted.length - 1} more problem${sorted.length > 2 ? 's' : ''} followed.` : ''}`;
  return { status, headline, root: root?.code ?? null, causes, timeline, fixes: proposeFixes(record, tel, m) };
}

// ------------------------------------------------------------------------------------------------ before / after
const SHOW = [['status', 'Result', ''], ['finalPeri', 'Final periapsis', 'km'], ['finalApo', 'Final apoapsis', 'km'], ['maxQ', 'Max dynamic pressure', 'kPa'], ['maxG', 'Peak acceleration', 'g'], ['liftoffTWR', 'Liftoff thrust-to-weight', ''], ['propellantUsed', 'Propellant used', 'kg'], ['initialMass', 'Liftoff mass', 'kg'], ['touchdownVertical', 'Touchdown speed', 'm/s']];
const SCALE = { km: 1e-3, kPa: 1e-3 };
/** Honest before / after table and verdict. */
export function beforeAfter(recA, mA, recB, mB) {
  const rows = [];
  for (const [k, label, unit] of SHOW) {
    const a = mA[k], b = mB[k]; if (a === undefined && b === undefined) continue;
    rows.push({ key: k, label, unit, a: typeof a === 'number' ? a * (SCALE[unit] ?? 1) : a, b: typeof b === 'number' ? b * (SCALE[unit] ?? 1) : b });
  }
  const fa = new Set(mA.failureCodes ?? []), fb = new Set(mB.failureCodes ?? []);
  const fixed = [...fa].filter((c) => !fb.has(c)), still = [...fa].filter((c) => fb.has(c)), added = [...fb].filter((c) => !fa.has(c));
  const okA = recA.result?.status === 'SUCCESS', okB = recB.result?.status === 'SUCCESS';
  const verdict = okB && !okA ? 'FIXED' : okB && okA ? 'STILL_OK' : !okB && fixed.length && !added.length ? 'IMPROVED' : !okB && added.length > fixed.length ? 'WORSE' : 'STILL_FAILING';
  const text = { FIXED: 'Fixed. The new flight reached its goal.', STILL_OK: 'The flight already succeeded.', IMPROVED: `Better, but it still fails: ${recB.result?.reason}. Fixed: ${fixed.join(', ')}.`, WORSE: `Worse. New problems: ${added.join(', ')}.`, STILL_FAILING: `Still failing: ${recB.result?.reason}. This fix alone was not enough.` }[verdict];
  return { verdict, text, rows, fixed, still, added };
}

// ------------------------------------------------------------------------------------------------ applying a fix
/**
 * Apply a resolved fix to the project's vehicle through the tool API and make exactly ONE undo step.
 * @param api ToolAPI, fix (with ops), vehicleId (the project vehicle that was flown), commit(label) called once at the end (default: project.commit)
 * @returns {ok, calls, message}
 */
export async function applyFix(api, fix, vehicleId, { commit } = {}) {
  const veh = api.project.vehicles[vehicleId];
  if (!veh) return { ok: false, message: 'The vehicle that was flown is no longer in the project, so the fix cannot be applied.' };
  if (!fix.ops?.length) return { ok: false, message: 'This fix has no size yet. Run the test flights first.' };
  const calls = opsToToolCalls(fix.ops, veh);
  const before = JSON.stringify(api.project.designState());
  for (const c of calls) {
    const r = await api.execute(c.tool, c.args);
    if (!r.ok) { api.project.applyDesignState(JSON.parse(before)); return { ok: false, calls, message: `The change was refused: ${r.message}. Nothing was changed.` }; }
  }
  const label = `Fix: ${fix.title}`;
  if (commit) commit(label); else api.project.commit(label);
  return { ok: true, calls, message: `${label} (${opsText(fix.ops)}).` };
}
