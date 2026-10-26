// Student-friendly facts about a finished run: flight score, story timeline, speed budget, dashboard readouts, answers to simple
// questions and expanded derived data (energy, g-force per stage, burn times, mass breakdown, ground track, orbit, laps per day).
// Everything is computed from the recorded telemetry columns and the stored result (SI units). No value is invented.
import { runMetrics } from './run-analysis.js';
import { getBody } from '../../physics/bodies.js';

const fin = Number.isFinite;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const round = (x, d = 0) => (fin(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const STAGE_RE = /^stage(\d+)$/;

// ---------------------------------------------------------------- low-level telemetry helpers
/** Linear interpolation of channel `id` at time `t`. */
export function valueAt(tel, id, t) {
  const n = tel.count; if (!n) return NaN;
  const tt = tel.column('t'), v = tel.column(id);
  const i = tel.indexAt(t);
  if (i >= n - 1) return v[n - 1];
  const f = (t - tt[i]) / Math.max(tt[i + 1] - tt[i], 1e-12);
  return v[i] + (v[i + 1] - v[i]) * Math.min(1, Math.max(0, f));
}
/** First time the channel rises through `level` (linear interpolation), or null. */
export function firstCrossing(tel, id, level) {
  const n = tel.count; if (!n) return null;
  const t = tel.column('t'), v = tel.column(id);
  if (v[0] >= level) return null;   // already above at the start: not a crossing
  for (let i = 1; i < n; i++) if (v[i - 1] < level && v[i] >= level) { const f = (level - v[i - 1]) / (v[i] - v[i - 1]); return t[i - 1] + f * (t[i] - t[i - 1]); }
  return null;
}
/** Total time the channel is at or above `level` (linear interpolation inside straddling intervals). */
export function timeAbove(tel, id, level) {
  const n = tel.count; if (n < 2) return 0;
  const t = tel.column('t'), v = tel.column(id); let sum = 0;
  for (let i = 1; i < n; i++) {
    const a = v[i - 1], b = v[i], dt = t[i] - t[i - 1];
    if (a >= level && b >= level) sum += dt;
    else if (a >= level || b >= level) { const f = (level - a) / (b - a); sum += dt * (a >= level ? f : 1 - f); }
  }
  return sum;
}
/** At most `points` evenly spread samples of channels (always including the first and the last sample). */
export function downsample(tel, ids, points = 100) {
  const n = tel.count; const out = { t: [] }; for (const id of ids) out[id] = [];
  if (!n) return out;
  const step = Math.max(1, Math.ceil(n / points)); const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const t = tel.column('t');
  for (const i of idx) out.t.push(t[i]);
  for (const id of ids) { const c = tel.column(id); for (const i of idx) out[id].push(c[i]); }
  return out;
}
const argMax = (c) => { let bi = 0, bv = -Infinity; for (let i = 0; i < c.length; i++) if (c[i] > bv) { bv = c[i]; bi = i; } return { i: bi, v: bv }; };

const separationsOf = (record) => (record.result?.summary?.separations ?? []).slice().sort((a, b) => a.t - b.t);
const bodyOf = (record) => {
  for (const id of [record.environment?.body, record.mission?.objective?.body, record.vehicle?.meta?.body, 'earth']) { if (!id) continue; try { return getBody(id); } catch { /* try the next */ } }
  return null;
};
/** Which stage is burning at time t: 1 + number of stage-N separations before t. */
export function stageNumberAt(record, t) {
  let n = 1; for (const s of separationsOf(record)) if (STAGE_RE.test(s.group ?? '') && s.t <= t + 1e-9) n++;
  return n;
}
const ordinal = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`;

// ---------------------------------------------------------------- stages, burns, g-force
/** Stage segments (split at every separation of a "stageN" group): peak / mean g-force, burn time. */
export function stageSegments(record, tel) {
  const n = tel.count; if (!n) return [];
  const t = tel.column('t'), g = tel.column('gload'), th = tel.column('thrust');
  const cuts = separationsOf(record).filter((s) => STAGE_RE.test(s.group ?? '')).map((s) => s.t);
  const bounds = [t[0], ...cuts, t[n - 1]];
  const segs = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const t0 = bounds[k], t1 = bounds[k + 1];
    const i0 = k === 0 ? 0 : tel.indexAt(t0) + 1, i1 = k === bounds.length - 2 ? n - 1 : tel.indexAt(t1);
    if (i1 < i0) continue;
    let maxTh = 0, maxG = 0; for (let i = i0; i <= i1; i++) { if (th[i] > maxTh) maxTh = th[i]; if (g[i] > maxG) maxG = g[i]; }
    const lim = 0.02 * maxTh; let burn = 0, gw = 0;
    for (let i = i0; i < i1; i++) if (th[i] > lim && maxTh > 0) { const dt = t[i + 1] - t[i]; burn += dt; gw += g[i] * dt; }
    segs.push({ stage: k + 1, label: `Stage ${k + 1}`, t0: t[i0], t1: t[i1], peakG: maxG, meanG: burn > 0 ? gw / burn : 0, burnTime: burn, maxThrust: maxTh });
  }
  return segs;
}
/** Every engine burn: contiguous stretches where thrust is above 2 % of the stage's peak thrust (gaps under 2 s are merged). */
export function burnList(record, tel) {
  const n = tel.count; if (!n) return [];
  const t = tel.column('t'), th = tel.column('thrust'), g = tel.column('gload');
  const out = [];
  for (const seg of stageSegments(record, tel)) {
    if (!(seg.maxThrust > 0)) continue;
    const lim = 0.02 * seg.maxThrust; const i0 = tel.indexAt(seg.t0), i1 = tel.indexAt(seg.t1);
    let cur = null;
    for (let i = i0; i <= i1; i++) {
      if (th[i] > lim) { if (cur && t[i] - cur.t1 < 2) { cur.t1 = t[i]; cur.j = i; } else { if (cur) out.push(cur); cur = { stage: seg.stage, t0: t[i], t1: t[i], j: i, i: i }; } }
    }
    if (cur) out.push(cur);
  }
  const per = {};
  return out.map((b) => { let pk = 0; for (let i = b.i; i <= b.j; i++) if (g[i] > pk) pk = g[i]; per[b.stage] = (per[b.stage] ?? 0) + 1; return { stage: b.stage, label: `Stage ${b.stage} burn${per[b.stage] > 1 ? ` ${per[b.stage]}` : ''}`, t0: b.t0, t1: b.t1, dur: b.t1 - b.t0, peakG: pk }; });
}
export const gForceByStage = (record, tel) => stageSegments(record, tel).map(({ stage, label, peakG, meanG, t0, t1 }) => ({ stage, label, peakG, meanG, t0, t1 }));
export const burnTimesByStage = (record, tel) => {
  const burns = burnList(record, tel), out = [];
  for (const s of stageSegments(record, tel)) out.push({ stage: s.stage, label: s.label, burnTime: burns.filter((b) => b.stage === s.stage).reduce((a, b) => a + b.dur, 0), burns: burns.filter((b) => b.stage === s.stage).length });
  return out;
};

// ---------------------------------------------------------------- single facts
export function soundBarrier(tel) {
  const t = firstCrossing(tel, 'mach', 1); if (t == null) return null;
  return { t, alt: valueAt(tel, 'alt', t), speed: valueAt(tel, 'surfSpeed', t) || valueAt(tel, 'speed', t) };
}
export function spaceCrossing(tel, level = 100000) {
  const t = firstCrossing(tel, 'alt', level); if (t == null) return null;
  return { t, alt: level, speed: valueAt(tel, 'speed', t) };
}
export function maxQMoment(tel) {
  const n = tel.count; if (!n) return null;
  const q = tel.column('q'), mx = argMax(q); if (!(mx.v > 0)) return null;
  const t = tel.column('t')[mx.i];
  return { t, q: mx.v, alt: tel.column('alt')[mx.i], mach: tel.column('mach')[mx.i], speed: tel.column('speed')[mx.i] };
}
export function peakGMoment(tel) {
  const n = tel.count; if (!n) return null;
  const g = tel.column('gload'), mx = argMax(g); const t = tel.column('t')[mx.i];
  return { t, g: mx.v, alt: tel.column('alt')[mx.i], speed: tel.column('speed')[mx.i] };
}
export function apogeeMoment(tel) {
  const n = tel.count; if (!n) return null;
  const a = tel.column('alt'), mx = argMax(a); const t = tel.column('t')[mx.i];
  return { t, alt: mx.v, speed: tel.column('speed')[mx.i] };
}
export function fastestMoment(tel) {
  const n = tel.count; if (!n) return null;
  const s = tel.column('speed'), mx = argMax(s); const t = tel.column('t')[mx.i];
  return { t, speed: mx.v, alt: tel.column('alt')[mx.i] };
}

/** Apoapsis / periapsis altitude over time (clamped at 0 when the orbit would hit the ground) and the moment the orbit clears the ground for good. */
export function orbitEvolution(tel, points = 80) {
  const n = tel.count; if (!n) return { series: [], tOrbit: null };
  const ds = downsample(tel, ['apo', 'peri', 'ecc'], points);
  const series = ds.t.map((t, i) => ({ t, apo: fin(ds.apo[i]) && ds.ecc[i] < 1 ? Math.max(0, ds.apo[i]) : null, peri: fin(ds.peri[i]) ? Math.max(0, ds.peri[i]) : null }));
  const t = tel.column('t'), peri = tel.column('peri'), ecc = tel.column('ecc');
  let tOrbit = null;
  if (peri[n - 1] > 0 && ecc[n - 1] < 1) { let k = n - 1; while (k > 0 && peri[k - 1] > 0 && ecc[k - 1] < 1) k--; tOrbit = t[k]; }
  return { series, tOrbit };
}

/** Orbit at the end of the flight. `inOrbit` is true when the lowest point is above the ground and the path is closed. */
export function orbitAtEnd(record, tel) {
  const n = tel.count; if (!n) return null;
  const fo = record.result?.summary?.finalOrbit;
  const o = fo ?? { apo: tel.column('apo')[n - 1], peri: tel.column('peri')[n - 1], ecc: tel.column('ecc')[n - 1], incl: tel.column('incl')[n - 1], period: tel.column('period')[n - 1] };
  const inOrbit = fin(o.peri) && o.peri > 0 && fin(o.ecc) && o.ecc < 1 && fin(o.period) && o.period > 0;
  const body = bodyOf(record);
  return {
    inOrbit, apo: o.apo, peri: o.peri, ecc: o.ecc, incl: o.incl, period: o.period,
    periodMin: inOrbit ? o.period / 60 : null,
    sma: fin(tel.column('sma')[n - 1]) && tel.column('sma')[n - 1] > 0 ? tel.column('sma')[n - 1] : (body && fin(o.apo) && fin(o.peri) ? body.radius + (o.apo + o.peri) / 2 : null),
    lapsPerDay: inOrbit ? 86400 / o.period : null,
    body: body?.id ?? null, bodyName: body?.name ?? null,
  };
}
export const lapsPerDay = (periodSeconds) => (fin(periodSeconds) && periodSeconds > 0 ? 86400 / periodSeconds : null);

/** Specific energy (per kilogram): movement energy, height energy (relative to the ground) and their sum. */
export function energyBudget(record, tel, points = 100) {
  const body = bodyOf(record); const n = tel.count; if (!body || !n) return null;
  const { mu, radius: R } = body;
  const ds = downsample(tel, ['speed', 'alt', 'energy'], points);
  const series = ds.t.map((t, i) => { const ke = 0.5 * ds.speed[i] ** 2, pe = mu / R - mu / (R + ds.alt[i]); return { t, kinetic: ke, potential: pe, total: ke + pe, orbital: ds.energy[i] }; });
  const last = series[series.length - 1];
  return { series, final: last, movementShare: last.total > 0 ? last.kinetic / last.total : null, mu, radius: R, groundEnergy: -mu / R };
}
/** Fuel / structure split over time, what was dropped on the way. */
export function massBreakdown(record, tel, points = 80) {
  const n = tel.count; if (!n) return null;
  const ds = downsample(tel, ['mass', 'propMass'], points);
  const series = ds.t.map((t, i) => ({ t, prop: ds.propMass[i], dry: Math.max(0, ds.mass[i] - ds.propMass[i]), mass: ds.mass[i] }));
  const m0 = tel.column('mass')[0], p0 = tel.column('propMass')[0];
  const dropped = separationsOf(record).filter((s) => s.debris?.mass > 0 && !String(s.group).startsWith('deploy:')).map((s) => ({ t: s.t, group: s.group, mass: s.debris.mass }));
  return { series, liftoffMass: m0, fuelAtStart: p0, fuelShare: m0 > 0 ? p0 / m0 : null, endMass: tel.column('mass')[n - 1], dropped };
}
/** How far from the launch site (great-circle, the recorded 'downrange' channel). */
export function rangeInfo(tel) {
  const n = tel.count; if (!n) return null;
  const d = tel.column('downrange'); const mx = argMax(d);
  return { maxDownrange: mx.v, endDownrange: d[n - 1], tMax: tel.column('t')[mx.i] };
}
/** Ground track (lat / lon in degrees) when the run has a moving position, else null. */
export function groundTrack(tel, points = 240) {
  const n = tel.count; if (n < 2) return null;
  const la = tel.column('lat'), lo = tel.column('lon');
  let lmin = Infinity, lmax = -Infinity, omin = Infinity, omax = -Infinity;
  for (let i = 0; i < n; i++) { lmin = Math.min(lmin, la[i]); lmax = Math.max(lmax, la[i]); omin = Math.min(omin, lo[i]); omax = Math.max(omax, lo[i]); }
  if (!(lmax - lmin > 1e-3 || omax - omin > 1e-3)) return null;
  const ds = downsample(tel, ['lat', 'lon', 'alt'], points);
  return { points: ds.t.map((t, i) => ({ t, lat: ds.lat[i], lon: ds.lon[i], alt: ds.alt[i] })), start: { lat: la[0], lon: lo[0] }, end: { lat: la[n - 1], lon: lo[n - 1] } };
}

/** The instantaneous readouts of the flight dashboard at mission time `t` (SI units). */
export function readoutsAt(record, tel, t) {
  const n = tel.count; if (!n) return null;
  const v = (id) => valueAt(tel, id, t);
  const p0 = tel.column('propMass')[0];
  return {
    t, alt: v('alt'), speed: v('speed'), airSpeed: v('surfSpeed'), vSpeed: v('vSpeed'), gload: v('gload'), q: v('q'), mach: v('mach'), noseTemp: v('tempLead'), bodyTemp: v('tempBody'),
    mass: v('mass'), propMass: v('propMass'), fuelPct: p0 > 0 ? clamp01(v('propMass') / p0) * 100 : null, thrust: v('thrust'), twr: v('twr'),
    stage: stageNumberAt(record, t), downrange: v('downrange'), apo: v('apo'), peri: v('peri'), ecc: v('ecc'), airDensity: v('rho'),
  };
}
/** Small series for sparklines: { t[], v[] } of a channel (optionally transformed). */
export function sparkSeries(tel, id, points = 60, f = (x) => x) {
  const ds = downsample(tel, [id], points); return { t: ds.t, v: ds[id].map(f) };
}

// ---------------------------------------------------------------- speed budget
/** Where did the speed go? Shares of the engines' total delta-v. `null` when the run has no delta-v record (rovers, landers). */
export function speedBudget(m) {
  if (!(m?.dvIdeal > 0)) return null;
  const grav = Math.max(0, m.dvGravity ?? 0), drag = Math.max(0, m.dvDrag ?? 0), steer = Math.max(0, m.dvSteering ?? 0);
  const useful = Math.max(0, m.dvIdeal - grav - drag - steer);
  const pct = (x) => (100 * x) / m.dvIdeal;
  return {
    total: m.dvIdeal, useful, usefulPct: pct(useful), efficiency: useful / m.dvIdeal,
    items: [
      { id: 'useful', label: 'Useful speed', value: useful, pct: pct(useful), caption: 'Speed that really counted for the orbit.' },
      { id: 'gravity', label: 'Gravity loss', value: grav, pct: pct(grav), caption: 'Gravity pulls back while you climb.' },
      { id: 'drag', label: 'Air loss', value: drag, pct: pct(drag), caption: 'Thick air slows the rocket down.' },
      { id: 'steering', label: 'Steering loss', value: steer, pct: pct(steer), caption: 'Turning sideways wastes some push.' },
    ],
  };
}

// ---------------------------------------------------------------- score
/** Flight score 0..100. Every part has a maximum; parts that do not apply to the vehicle are left out and the rest is rescaled. */
export function flightScore(record, tel, m = runMetrics(record, tel)) {
  const res = record.result ?? {}, ok = res.status === 'SUCCESS';
  const obj = record.mission?.objective ?? {};
  const parts = [];
  // 1. mission goal
  { const max = 50; let pts = 0, detail;
    if (ok) { pts = max; detail = 'Goal reached'; }
    else { const target = obj.type === 'orbit' ? (obj.altitude ?? 0) : 0; const peri = m.finalPeri; const prog = target > 0 ? clamp01(fin(peri) && peri > 0 ? peri / target : (0.5 * (m.maxAlt ?? 0)) / target) : 0; pts = 15 * prog; detail = target > 0 ? `Goal missed. Got ${Math.round(100 * prog)} % of the way` : 'Goal missed'; }
    parts.push({ id: 'goal', label: 'Reached the goal', icon: '', max, points: pts, detail, recipe: '50 points for reaching the goal. If missed: up to 15 for getting close.' }); }
  // 2. gentle ride
  if (fin(m.maxG)) { const max = 15, pts = max * clamp01(1 - (m.maxG - 4) / 5);
    parts.push({ id: 'gforce', label: 'Gentle ride', icon: '', max, points: pts, detail: `Peak ${m.maxG.toFixed(1)} g`, recipe: 'Full points up to 4 g. Zero points at 9 g.' }); }
  // 3. safety margin on air pressure / structure
  if (fin(m.maxStructRatio)) { const max = 15, pts = max * clamp01((1 - m.maxStructRatio) / 0.5);
    parts.push({ id: 'margin', label: 'Safety margin', icon: '', max, points: pts, detail: `Used ${Math.round(100 * m.maxStructRatio)} % of the rocket's strength`, recipe: 'Full points if the rocket used under half its strength. Zero at the limit.' }); }
  // 4. fuel left (only when there was fuel)
  if (m.initialPropellant > 0) { const max = 10, frac = m.finalPropellant / m.initialPropellant, pts = max * clamp01(frac / 0.05);
    parts.push({ id: 'fuel', label: 'Fuel to spare', icon: '', max, points: pts, detail: `${frac < 0.1 ? (100 * frac).toFixed(1) : Math.round(100 * frac)} % of the fuel left`, recipe: 'Full points with 5 % of the fuel left. Zero with none.' }); }
  // 5. efficiency (launches only)
  const sb = speedBudget(m);
  if (sb) { const max = 10, pts = max * clamp01((sb.efficiency - 0.6) / 0.3);
    parts.push({ id: 'efficiency', label: 'No wasted push', icon: '', max, points: pts, detail: `${Math.round(sb.usefulPct)} % of the push was useful`, recipe: 'Full points if 90 % of the push was useful. Zero at 60 %.' }); }
  const maxSum = parts.reduce((a, p) => a + p.max, 0), got = parts.reduce((a, p) => a + p.points, 0);
  const total = maxSum > 0 ? Math.round((100 * got) / maxSum) : 0;
  for (const p of parts) { p.share = maxSum > 0 ? (100 * p.max) / maxSum : 0; p.pointsOn100 = maxSum > 0 ? (100 * p.points) / maxSum : 0; }
  const grade = total >= 90 ? 'Amazing' : total >= 75 ? 'Great' : total >= 55 ? 'Good' : total >= 35 ? 'Keep trying' : 'Needs work';
  return { total, grade, parts, maxSum };
}

// ---------------------------------------------------------------- story
const plainCause = {
  INSUFFICIENT_DELTA_V: 'Not enough fuel to reach the needed speed.', INCORRECT_ORBIT: 'It ended up in the wrong orbit.', UPPER_STAGE_TWR: 'The top stage was too weak to keep climbing.',
  PROPELLANT_DEPLETION: 'The fuel ran out too early.', MAX_Q_EXCEEDED: 'The air pushed too hard on the rocket.', EXCESSIVE_ACCELERATION: 'The squeeze (g-force) was too strong.',
  STRUCTURAL_OVERLOAD: 'The rocket was not strong enough and broke.', OVERTEMPERATURE: 'Parts got too hot.', UNDERTEMPERATURE: 'Parts got too cold.',
  LOSS_OF_CONTROL: 'The rocket tumbled out of control.', POWER_FAILURE: 'The batteries ran out of power.', ENGINE_FAILURE: 'An engine did not work.', IGNITION_FAILURE: 'An engine did not light.',
  COMM_FAILURE: 'The radio link to Earth was lost.', ROVER_ROLLOVER: 'The rover tipped over.', ROVER_IMMOBILISED: 'The wheels slipped and the rover got stuck.',
};
export const plainFailure = (f) => plainCause[f?.code] ?? f?.title ?? 'Something went wrong.';


/** Plain icon / title / caption of a recorded mission event, or null for bookkeeping events. */
export function describeEvent(e) {
  const a = e.data?.action, msg = `${e.message ?? ''} ${e.data?.event ?? ''}`;
  if (e.kind === 'LIFTOFF') return { id: 'liftoff', icon: '', title: 'Liftoff!', caption: 'Engines push harder than gravity pulls.' };
  if (e.kind === 'MISSION_SUCCESS') return { id: 'success', icon: '', title: 'Mission complete', caption: 'The goal was reached.' };
  if (e.kind === 'FAILURE') return { id: 'failure', icon: '', title: 'Problem!', caption: 'Something went wrong.', bad: true };
  if (e.kind !== 'EVENT') return null;
  if (a === 'IGNITE') { const g = /Stage (\d+)/.exec(e.message ?? '')?.[1]; return { id: 'ignite', icon: '', title: g ? `Stage ${g} lights` : 'Engine lights', caption: 'An engine starts pushing.' }; }
  if (a === 'SEPARATE') {
    const grp = /Separated (\S+)/.exec(e.message ?? '')?.[1] ?? '';
    if (grp === 'fairing') return { id: 'fairing', icon: '', title: 'Nose shell off', caption: 'Not needed in thin air.' };
    const k = STAGE_RE.exec(grp)?.[1]; return { id: 'separate', icon: '', title: k ? `Stage ${k} dropped` : 'Part dropped', caption: 'Empty parts fall away. Lighter is faster.' };
  }
  if (a === 'SHUTDOWN') return { id: 'cutoff', icon: '', title: 'Engine stops', caption: 'Now it coasts on its speed.' };
  if (a === 'BURN') { const c = /circular/i.test(msg); return { id: 'burn', icon: '', title: c ? 'Making the orbit round' : 'Engine burn', caption: c ? 'A sideways push lifts the low point.' : 'A planned push changes the speed.' }; }
  if (a === 'DEPLOY_PAYLOAD') return { id: 'deploy', icon: '', title: 'Payload released', caption: 'The satellite leaves the rocket.' };
  if (a === 'DEPLOY') return { id: 'panels', icon: '', title: 'Panels out', caption: 'Solar panels and antennas open.' };
  if (a === 'LAND') return { id: 'land', icon: '', title: 'Landing burn', caption: 'The engine slows the fall.' };
  return null;
}

/** Key moments of the flight with plain captions and the real time / altitude / speed at that moment. */
export function missionStory(record, tel, m = runMetrics(record, tel)) {
  const n = tel.count; if (!n) return [];
  const res = record.result ?? {}, out = [];
  const at = (t, o) => out.push({ t, alt: valueAt(tel, 'alt', t), speed: valueAt(tel, 'speed', t), g: valueAt(tel, 'gload', t), ...o });
  const pad = record.mission?.initial?.type === 'pad';
  let firstIgnite = true;
  for (const e of record.events ?? []) {
    if (e.kind === 'EVENT' && e.data?.action === 'IGNITE' && firstIgnite && pad) { firstIgnite = false; continue; }
    if (e.kind === 'EVENT' && e.data?.action === 'IGNITE') firstIgnite = false;
    const d = describeEvent(e); if (d) at(e.t, { id: e.data?.event ?? d.id, ...d });
  }
  const mq = maxQMoment(tel);
  if (mq && pad && mq.q > 2000) at(mq.t, { id: 'maxq', icon: '', title: 'Strongest air push', caption: 'Fast and still thick air: biggest squeeze on the rocket.' });
  const sb = soundBarrier(tel);
  if (sb && pad) at(sb.t, { id: 'mach1', icon: '', title: 'Sound barrier', caption: 'Faster than the speed of sound.' });
  const sp = spaceCrossing(tel);
  if (sp) at(sp.t, { id: 'space', icon: '', title: 'Space!', caption: 'Above 100 km the sky turns black.' });
  const oe = orbitEvolution(tel);
  if (oe.tOrbit != null && res.status === 'SUCCESS') at(oe.tOrbit, { id: 'orbit', icon: '', title: 'In orbit', caption: 'Falling around the Earth, never landing.' });
  for (const f of res.failures ?? []) if (f.rootCause || res.failures.length === 1) at(f.t, { id: `fail-${f.code}`, icon: '', title: 'Problem!', caption: plainFailure(f), bad: true });
  const endT = tel.column('t')[n - 1];
  at(endT, { id: 'end', icon: '', title: res.status === 'SUCCESS' ? 'Mission complete' : 'Flight over', caption: res.status === 'SUCCESS' ? 'The goal was reached.' : 'The goal was not reached.', bad: res.status !== 'SUCCESS' });
  out.sort((a, b) => a.t - b.t);
  // drop near-duplicates: same id, or two items closer than 0.3 s with the same title
  const seen = new Set(); return out.filter((x) => { const k = `${x.id}|${x.title}`; if (seen.has(k)) return false; seen.add(k); return true; });
}


/** One short plain sentence about what the vehicle is doing right now (live HUD). Input: {alt, vSpeed, thrust, peri, ecc, stageNo, finished, bodyName, onPad}. */
export function nowStatus({ alt = 0, vSpeed = 0, thrust = 0, peri = -1, ecc = 2, stageNo = 1, finished = false, bodyName = 'Earth', onPad = false } = {}) {
  if (finished) return 'The flight is over.';
  const on = thrust > 1;
  if (on && onPad) return 'Engines are on. Lifting off!';
  if (!on && onPad) return 'Waiting on the pad.';
  if (on) return `Stage ${stageNo} is burning - ${vSpeed > 300 ? 'going up fast' : vSpeed > 20 ? 'climbing' : vSpeed > -20 ? 'holding height' : 'slowing the fall'}.`;
  if (peri > 0 && ecc < 1) return `In orbit - circling ${bodyName}.`;
  if (alt > 100000) return 'Coasting in space. Engines off.';
  if (vSpeed > 5) return 'Coasting upward. Engines off.';
  if (vSpeed < -5) return 'Falling. Engines off.';
  return 'Engines off.';
}

// ---------------------------------------------------------------- suggestions
/** At most three "What to try next" buttons derived from the run. {label, icon, prompt?} asks the AI, {label, icon, go} opens a screen. */
export function nextSteps(record, tel, m = runMetrics(record, tel)) {
  const res = record.result ?? {}, ok = res.status === 'SUCCESS', fails = res.failures ?? [], codes = new Set(fails.map((f) => f.code));
  const stages = record.vehicle?.stages ?? [], lastName = ordinal(Math.max(1, stages.length));
  const out = [];
  const add = (label, icon, extra) => { if (out.length < 3 && !out.some((o) => o.label === label)) out.push({ label, icon, ...extra }); };
  if (!ok) {
    add('Fix it for me', '', { prompt: 'Fix it.' });
    if (codes.has('INSUFFICIENT_DELTA_V') || codes.has('PROPELLANT_DEPLETION') || codes.has('INCORRECT_ORBIT')) add('Add more fuel', '', { prompt: `Add 20% more propellant to the ${lastName} stage.` });
    if (codes.has('EXCESSIVE_ACCELERATION')) add('Gentler ride', '', { prompt: 'How can I reduce the peak g-force?' });
    if (codes.has('MAX_Q_EXCEEDED') || codes.has('STRUCTURAL_OVERLOAD')) add('Make it stronger', '', { prompt: 'How can I make the rocket stronger?' });
    add('Why did it fail?', '', { prompt: 'Why did it fail?' });
  } else {
    if (m.lastStageReserveFrac > 0.15) add('Make it lighter', '', { prompt: `Reduce the ${lastName} stage propellant by ${Math.min(30, Math.floor(50 * m.lastStageReserveFrac))}%.` });
    if (m.maxG > 6) add('Gentler ride', '', { prompt: 'How can I reduce the peak g-force?' });
    const sb = speedBudget(m);
    if (sb && sb.efficiency < 0.85) add('Waste less push', '', { prompt: 'How can I lose less speed to gravity and air?' });
    add('Improve the design', '', { prompt: 'How can I improve this design?' });
  }
  add('Open the builder', '', { go: 'designer' });
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- tiles (big friendly numbers)
export function studentTiles(record, tel, m = runMetrics(record, tel)) {
  const n = tel.count;
  const surface = record.mission?.initial?.type === 'surface' || (m.distanceDriven != null && !(m.maxAlt > 1000));
  const tiles = [];
  if (surface && m.distanceDriven != null) tiles.push({ id: 'height', icon: '', name: 'How far did it drive?', value: m.distanceDriven, unit: 'm', kind: 'distance', meaning: 'Distance rolled over the ground.' });
  else tiles.push({ id: 'height', icon: '', name: 'How high?', value: m.maxAlt, unit: 'm', kind: 'altitude', meaning: m.maxAlt >= 100000 ? 'Above 100 km counts as space.' : 'Height above the ground.' });
  tiles.push({ id: 'speed', icon: '', name: 'How fast?', value: m.maxSpeed, unit: 'm/s', kind: 'speed', meaning: m.maxSpeed >= 7000 ? 'Fast enough to circle the Earth.' : 'The top speed of the flight.' });
  tiles.push({ id: 'squeeze', icon: '', name: 'How hard was the squeeze?', value: m.maxG, unit: 'g', kind: 'g', meaning: `${(m.maxG ?? 0).toFixed(1)}x your own weight.` });
  tiles.push({ id: 'time', icon: '', name: 'Time in flight', value: m.endTime, unit: 's', kind: 'time', meaning: 'From start to the end of the mission.' });
  if (m.initialPropellant > 0) tiles.push({ id: 'fuel', icon: '', name: 'Fuel left', value: (100 * m.finalPropellant) / m.initialPropellant, unit: '%', kind: 'percent', meaning: 'Fuel still in the tanks at the end.' });
  else tiles.push({ id: 'fuel', icon: '', name: 'Battery left', value: m.minBatteryFrac != null ? 100 * m.minBatteryFrac : null, unit: '%', kind: 'percent', meaning: 'The lowest battery level.' });
  const twr = m.liftoffTWR ?? (n ? argMax(tel.column('twr')).v : null);
  tiles.push({ id: 'twr', icon: '', name: 'Engine push vs weight', value: twr, unit: 'x', kind: 'ratio', meaning: twr >= 1 ? 'Above 1 means it can lift off.' : 'Below 1 means it cannot lift off.' });
  return tiles;
}

// ---------------------------------------------------------------- question presets for the flight explorer
/** Answers to the typical questions. Each answer has the real moment `t` the scrubber jumps to. `null` answer when it does not apply. */
export function questionPresets(record, tel, m = runMetrics(record, tel)) {
  const out = [];
  const top = apogeeMoment(tel);
  if (top) out.push({ id: 'high', q: 'How high did it go?', t: top.t, kind: 'high', data: top });
  const pg = peakGMoment(tel);
  if (pg && pg.g > 0.5) out.push({ id: 'squeeze', q: 'When was the squeeze strongest?', t: pg.t, kind: 'squeeze', data: pg });
  const mq = maxQMoment(tel);
  if (mq && mq.q > 500) out.push({ id: 'maxq', q: 'When was the air push strongest?', t: mq.t, kind: 'maxq', data: mq });
  const sb = soundBarrier(tel);
  out.push({ id: 'mach1', q: 'When did it break the sound barrier?', t: sb?.t ?? null, kind: 'mach1', data: sb });
  const sp = spaceCrossing(tel);
  if (sp || (top && top.alt > 50000)) out.push({ id: 'space', q: 'When did it reach space?', t: sp?.t ?? null, kind: 'space', data: sp });
  const burns = burnList(record, tel);
  if (burns.length) out.push({ id: 'engines', q: 'When did each engine stop?', t: burns[0].t1, kind: 'engines', data: burns.map((b) => ({ label: b.label, t: b.t1, dur: b.dur })) });
  return out;
}

// ---------------------------------------------------------------- everything at once
/** The complete student report of a run (used by the report card; the explorer calls the parts it needs). */
export function studentReport(record, tel, m = runMetrics(record, tel)) {
  const res = record.result ?? {};
  const fails = res.failures ?? [], top = fails.find((f) => f.rootCause) ?? fails[0] ?? null;
  return {
    ok: res.status === 'SUCCESS', status: res.status, metrics: m,
    headline: res.status === 'SUCCESS' ? 'Mission complete!' : 'The mission did not succeed.',
    why: top ? { title: top.title, plain: plainFailure(top), code: top.code, t: top.t } : null,
    score: flightScore(record, tel, m), tiles: studentTiles(record, tel, m), story: missionStory(record, tel, m), budget: speedBudget(m), next: nextSteps(record, tel, m),
    extras: studentExtras(record, tel, m),
  };
}
/** Expanded derived data. */
export function studentExtras(record, tel, m = runMetrics(record, tel)) {
  return {
    energy: energyBudget(record, tel), gByStage: gForceByStage(record, tel), burns: burnList(record, tel), burnTimes: burnTimesByStage(record, tel),
    timeAbove100km: timeAbove(tel, 'alt', 100000), orbitEvolution: orbitEvolution(tel), soundBarrier: soundBarrier(tel), maxQ: maxQMoment(tel), peakG: peakGMoment(tel),
    mass: massBreakdown(record, tel), range: rangeInfo(tel), track: groundTrack(tel), orbit: orbitAtEnd(record, tel),
  };
}
