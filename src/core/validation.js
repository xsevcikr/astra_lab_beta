// Validation of the simulator against PUBLISHED launch-vehicle data.
// The vehicles and the published numbers (each with its source URL) are in data/validation-vehicles.js. This module
//   1. builds each vehicle and flies it with the real simulator (nothing is scripted or tuned toward the answer),
//   2. measures the same quantities that were published (times, altitudes, speeds, orbit ...) from the recorded telemetry,
//   3. compares them and grades each row against a tolerance (error %, pass / fail / context-only).
// Rows without a published number are simply absent. A row that fails is reported as a failure.
import { launchMission } from '../missions/generator.js';
import { Simulation } from '../../physics/simulation.js';
import { analyzeVehicle } from '../vehicles/analysis.js';
import { yieldToLoop } from './runner.js';
export { sunSynchronousInclination } from '../../physics/mission-design.js';

export { VALIDATION_VEHICLES, TOLERANCE_NOTE } from '../../data/validation-vehicles.js';
import { VALIDATION_VEHICLES } from '../../data/validation-vehicles.js';

export const getValidationVehicle = (id) => VALIDATION_VEHICLES.find((v) => v.id === id) ?? null;

/** Build the vehicle and mission for a validation case. opts: {payloadKg, pitchTable, maxTime}. */
export function buildFlight(id, opts = {}) {
  const V = getValidationVehicle(id);
  if (!V) throw new Error(`Unknown validation vehicle ${id}`);
  const vehicle = V.build();
  if (opts.payloadKg != null) vehicle.components.find((c) => c.kind === 'payload').mass = opts.payloadKg;
  const F = V.flight;
  const mission = launchMission(vehicle, {
    altitude: F.altitude, inclination: F.inclination, insertion: F.insertion, kickAngle: F.kickAngle, insertionAlt: F.insertionAlt,
    site: F.site, deploy: false, maxTime: opts.maxTime ?? F.maxTime, guidance: { kickAlt: F.kickAlt, ...(opts.guidance ?? {}) },
    name: `${V.name} validation flight`,
  });
  // published stage-to-stage gaps
  for (const e of mission.events) {
    if (e.action?.type === 'IGNITE' && e.condition?.type === 'event' && F.stageDelays?.[e.action.group] != null) e.condition.delay = F.stageDelays[e.action.group];
  }
  if (F.suborbital) {   // a vertical flight to apogee instead of an orbit: engine shuts down when the propellant is gone, the flight runs on to apogee
    mission.events = mission.events.filter((e) => !['cutoff', 'circ', 'deploy', 'appendages', 'sunpoint', 'fairing'].includes(e.id));
    mission.events.push({ id: 'cutoff', name: 'Main engine cutoff (propellant gone)', condition: { type: 'propellant', group: 'stage1', op: '<=', value: 0.004 }, action: { type: 'SHUTDOWN', group: 'stage1' }, status: 'pending' });
    mission.objective = { type: 'suborbital', altitude: 1e9 };
  }
  if (F.atmosphereProfile) mission.environment = { ...(mission.environment ?? {}), atmosphereProfile: F.atmosphereProfile };   // the day's atmosphere, where the source says it was not the standard one
  F.extraEvents?.(mission, vehicle);   // published events the generator does not make (an engine cut early, booster separation ...)
  const table = opts.pitchTable ?? F.pitch;
  if (table) mission.guidance = { mode: 'pitch_program', params: { azimuth: mission.meta.azimuth, table: table.map((r) => [...r]) } };
  return { V, vehicle, mission };
}

const evT = (sim, id) => sim.executor.events.find((e) => e.id === id)?.tDone ?? null;

/** Measure every quantity that has a published counterpart. All SI. Missing values are null. */
export function measure(sim, vehicle, V) {
  const tel = sim.telemetry, n = tel.count;
  const col = (k) => tel.column(k);
  const t = col('t');
  const at = (time, key) => { if (time == null || !n) return null; const i = tel.indexAt(time); return col(key)[i]; };
  const t0 = sim.result?.summary?.liftoffTime ?? sim.tLiftoff ?? 0;
  const stages = vehicle.stages.map((s) => s.id);
  const N = stages.length;
  const m = {};
  m.liftoffMass = n ? col('mass')[0] : null;
  const pay = vehicle.components.filter((c) => c.group === 'payload').reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0);
  m.liftoffMassNoPayload = m.liftoffMass != null ? m.liftoffMass - pay : null;
  let thrust = 0; for (let i = 0; i < n && t[i] < t0 + 6; i++) thrust = Math.max(thrust, col('thrust')[i]); m.liftoffThrust = thrust;
  try { m.height = analyzeVehicle(vehicle).length; } catch { m.height = null; }
  // max-Q
  let qi = 0; for (let i = 0; i < n; i++) if (col('q')[i] > col('q')[qi]) qi = i;
  m.maxQ = n ? col('q')[qi] : null; m.maxQT = n ? t[qi] - t0 : null; m.maxQAlt = n ? col('alt')[qi] : null; m.maxQSpeed = n ? col('speed')[qi] : null;
  // stage events: cutoff of stage k = separation event k (k < N) or the final cutoff event
  const cutT = []; // absolute times
  for (let k = 1; k < N; k++) cutT.push(evT(sim, `sep${k}`));
  cutT.push(evT(sim, 'cutoff'));
  const ignT = [evT(sim, 'ign1') ?? 0];
  for (let k = 2; k <= N; k++) ignT.push(evT(sim, `ign${k}`));
  const names = ['s1', 's2', 's3'];
  for (let k = 0; k < N; k++) {
    const nm = names[k];
    m[`${nm}CutoffT`] = cutT[k] != null ? cutT[k] - t0 : null;
    m[`${nm}CutoffAlt`] = at(cutT[k], 'alt'); m[`${nm}CutoffSpeed`] = at(cutT[k], 'speed'); m[`${nm}CutoffMach`] = at(cutT[k], 'mach');
    m[`${nm}IgnitionT`] = ignT[k] != null ? ignT[k] - t0 : null;
    m[`${nm}IgnitionAlt`] = at(ignT[k], 'alt');
    m[`${nm}Burn`] = cutT[k] != null && ignT[k] != null ? cutT[k] - ignT[k] : null;
  }
  m.finalCutoffT = m[`${names[N - 1]}CutoffT`]; m.finalCutoffSpeed = m[`${names[N - 1]}CutoffSpeed`]; m.finalCutoffAlt = m[`${names[N - 1]}CutoffAlt`];
  const o = sim.result?.summary?.finalOrbit;
  m.orbitPeri = o?.peri ?? null; m.orbitApo = o?.apo ?? null; m.orbitIncl = o?.incl ?? null;
  m.endTime = sim.result?.endTime ?? null;
  // "reaches orbit": the lowest point of the orbit gets above 95% of the target altitude at some time (the payload then really can be carried that far)
  { const pe = col('peri'); let best = -Infinity; for (let i = 0; i < n; i++) if (Number.isFinite(pe[i]) && t[i] > 60 && pe[i] > best) best = pe[i]; m.peakPeriapsis = best; m.reachedOrbit = best >= 0.95 * (V.flight?.altitude ?? Infinity) ? 1 : 0; }
  m.boosterBurn = evT(sim, 'bsep') != null ? evT(sim, 'bsep') - (evT(sim, 'bign') ?? t0) : null;
  { let hi = 0, sp = 0; const alt = col('alt'), air = col('surfSpeed'); for (let i = 0; i < n; i++) { if (alt[i] > hi) hi = alt[i]; if (air[i] > sp) sp = air[i]; } m.maxAlt = n ? hi : null; m.maxSpeed = n ? sp : null; }
  const dv = sim.result?.summary?.deltaV ?? {};
  m.dvIdeal = dv.ideal; m.dvGravity = dv.gravity; m.dvDrag = dv.drag; m.dvSteering = dv.steering;
  return m;
}

/**
 * Orbit error [km] used by the pitch-programme fit: the smallest |periapsis - target| + |apoapsis - target| over the whole flight
 * (after the first minute). A flight that reaches the orbit scores ~0; one that crashes still scores by how close it came, which gives
 * the fit a slope to follow.
 */
export function orbitErrorKm(sim, target) {
  const tel = sim.telemetry, n = tel.count;
  if (!n) return 1e5;
  const t = tel.column('t'), pe = tel.column('peri'), ap = tel.column('apo');
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    if (t[i] < 60 || !Number.isFinite(ap[i])) continue;
    const e = Math.abs(pe[i] - target) + Math.abs(ap[i] - target);
    if (e < best) best = e;
  }
  return Number.isFinite(best) ? best / 1000 : 1e5;
}

/** Compare measured values with the published rows. */
export function compareRows(V, m) {
  return V.rows.map((r) => {
    const sim = m[r.metric];
    const has = sim != null && Number.isFinite(sim);
    const err = has ? (sim - r.value) / r.value : null;
    let status = 'missing';
    if (has) status = r.kind === 'context' ? 'context' : Math.abs(err) <= r.tol ? 'pass' : 'fail';
    return { ...r, sim: has ? sim : null, err, status };
  });
}

export function summariseRows(rows) {
  const graded = rows.filter((r) => r.kind === 'graded' && r.status !== 'missing');
  return { total: graded.length, pass: graded.filter((r) => r.status === 'pass').length, fail: graded.filter((r) => r.status === 'fail').length, missing: rows.filter((r) => r.status === 'missing').length, context: rows.filter((r) => r.kind === 'context').length };
}

/** Synchronous flight (node tests, fitting). */
export function runValidationFlight(id, opts = {}) {
  const { V, vehicle, mission } = buildFlight(id, opts);
  const sim = new Simulation({ vehicle, mission });
  sim.run({ budgetMs: opts.wallMs ?? (opts.quick ? 40000 : 120000) });
  if (!sim.finished) sim._finish(null, 'Wall-clock budget exhausted');
  const metrics = measure(sim, vehicle, V);
  return { V, vehicle, mission, sim, metrics, rows: compareRows(V, metrics), reached: sim.result.status === 'SUCCESS', fitError: orbitErrorKm(sim, V.flight.altitude) };
}

/** Asynchronous flight for the UI: yields to the browser between slices. opts.onProgress({t}) */
export async function runValidationFlightAsync(id, opts = {}) {
  const { V, vehicle, mission } = buildFlight(id, opts);
  const sim = new Simulation({ vehicle, mission });
  const t0 = Date.now();
  while (!sim.finished && Date.now() - t0 < (opts.maxWallMs ?? 240000)) {
    sim.run({ budgetMs: 14 });
    opts.onProgress?.({ t: sim.t, maxTime: mission.maxTime });
    await yieldToLoop();
    if (opts.shouldStop?.()) break;
  }
  if (!sim.finished) sim._finish(null, 'Stopped');
  const metrics = measure(sim, vehicle, V);
  return { V, vehicle, mission, sim, metrics, rows: compareRows(V, metrics), reached: sim.result.status === 'SUCCESS', fitError: orbitErrorKm(sim, V.flight.altitude) };
}

/**
 * Largest payload that still reaches the target orbit, found by repeated simulation (bisection). Several ascent settings are tried per
 * payload (the best ascent depends on the payload); the payload counts as "reaches orbit" if ANY of them works.
 */
export async function findMaxPayload(id, { lo = 100, hi = null, iterations = 7, onProgress, shouldStop } = {}) {
  const V = getValidationVehicle(id);
  const base = V.build();
  const nominal = base.components.find((c) => c.kind === 'payload').mass;
  hi ??= nominal * 1.6;
  const settings = V.payloadSearch ?? [{}];
  let best = null, tests = 0;
  const tryPay = async (kg) => {
    for (const g of settings) {
      const r = await runValidationFlightAsync(id, { payloadKg: kg, ...g, maxWallMs: 120000, shouldStop });
      tests++;
      onProgress?.({ tests, payload: kg });
      if (r.reached) return r;
    }
    return null;
  };
  const ok0 = await tryPay(lo);
  if (!ok0) return { maxPayload: null, tests, note: `Even ${lo} kg did not reach the orbit.` };
  best = lo;
  let a = lo, b = hi;
  for (let i = 0; i < iterations; i++) {
    if (shouldStop?.()) break;
    const mid = (a + b) / 2;
    const r = await tryPay(mid);
    if (r) { a = mid; best = mid; } else b = mid;
  }
  return { maxPayload: best, tests, upperBound: b };
}
