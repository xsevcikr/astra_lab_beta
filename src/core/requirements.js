// Mission requirements checklist. Every verdict compares a limit with a number MEASURED in the recorded run (telemetry + result)
// or with a number computed from the design that was flown (rocket equation, thrust-to-weight). Nothing is assumed.
//
// A requirement is {id, label, plain, metric, op: '<=' | '>=' | 'range' | 'is', limit, tol?, unit, enabled}.
// `metric` names a measurement below. The user can change limit / tolerance / enabled; the changes are kept per project
// (project.memory.requirements, see applyOverrides) and the same values are evaluated again for any other run.
import { analyzeVehicle } from '../vehicles/analysis.js';
import { G0 } from '../../physics/constants.js';

const fin = (v) => Number.isFinite(v);
const fmt = (v, d = 1) => (fin(v) ? Number(v).toFixed(d) : '-');
const grp = (v, d = 0) => (fin(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');

// ------------------------------------------------------------------------------------------------ design facts
function designOf(record) {
  try { return analyzeVehicle(record.vehicle, { body: record.environment?.body ?? record.mission?.objective?.body ?? 'earth' }); } catch { return null; }
}
/** Smallest rating of the flown vehicle's parts (exposed parts only for dynamic pressure, like the failure detector). */
export function designLimits(vehicle) {
  let q = Infinity, qName = null, g = Infinity, gName = null, qa = Infinity;
  for (const c of vehicle.components ?? []) {
    if (c.maxQ && c.mount !== 'internal' && c.maxQ < q) { q = c.maxQ; qName = c.name; }
    if (c.maxAccelG && c.maxAccelG < g) { g = c.maxAccelG; gName = c.name; }
    if (c.maxQAlpha && c.mount !== 'internal') qa = Math.min(qa, c.maxQAlpha);
  }
  return { qLimit: fin(q) ? q : null, qName, gLimit: fin(g) ? g : null, gName, qaLimit: fin(qa) ? qa : null };
}
const lastIsp = (design) => { const st = (design?.stages ?? []).filter((s) => s.ispVac > 0); return st.length ? st[st.length - 1].ispVac : null; };

// ------------------------------------------------------------------------------------------------ measurements
// Each returns {value, t?, channel?, text?, note?} or null when the run holds no such data.
function chanAt(tel, id, t) { try { const i = tel.indexAt(t); return tel.column(id)[i]; } catch { return null; } }
export const MEASURES = {
  status: ({ record, m }) => ({ value: m.status === 'SUCCESS' ? 1 : 0, text: m.status === 'SUCCESS' ? 'Mission goal reached' : `${m.status ?? 'unknown'}: ${m.reason ?? ''}`, t: m.endTime, channel: 'alt' }),
  orbit: ({ record, m }) => {
    const o = record.mission?.objective; if (o?.type !== 'orbit' || !fin(m.finalPeri) || !fin(m.finalApo)) return null;
    const dev = Math.max(Math.abs(m.finalPeri - o.altitude), Math.abs(m.finalApo - o.altitude)) / o.altitude;
    return { value: dev, text: `${fmt(m.finalPeri / 1000, 1)} x ${fmt(m.finalApo / 1000, 1)} km (target ${fmt(o.altitude / 1000, 0)} km)`, t: m.endTime, channel: 'peri', channel2: 'apo', target: o.altitude };
  },
  maxG: ({ m }) => (fin(m.maxG) ? { value: m.maxG, t: m.tMaxG, channel: 'gload', text: `${fmt(m.maxG, 2)} g at T+${fmt(m.tMaxG, 0)} s` } : null),
  maxQ: ({ m }) => (fin(m.maxQ) && m.maxQ > 200 ? { value: m.maxQ, t: m.tMaxQ, channel: 'q', text: `${fmt(m.maxQ / 1000, 1)} kPa at T+${fmt(m.tMaxQ, 0)} s (${fmt(m.altMaxQ / 1000, 1)} km, Mach ${fmt(m.machAtMaxQ, 2)})` } : null),
  structRatio: ({ m, tel }) => {
    if (!fin(m.maxStructRatio) || !tel?.count) return null;
    const col = tel.column('structRatio'); let bi = 0; for (let i = 0; i < col.length; i++) if (col[i] > col[bi]) bi = i;
    return { value: m.maxStructRatio, t: tel.column('t')[bi], channel: 'structRatio', text: `${fmt(100 * m.maxStructRatio, 0)} % of the limit` };
  },
  thermRatio: ({ m, tel }) => {
    if (!fin(m.maxThermRatio) || !tel?.count) return null;
    const col = tel.column('thermRatio'); let bi = 0; for (let i = 0; i < col.length; i++) if (col[i] > col[bi]) bi = i;
    return { value: m.maxThermRatio, t: tel.column('t')[bi], channel: 'thermRatio', text: `${fmt(m.maxThermRatio, 2)} of the temperature limit`, note: 'Ratio of absolute temperatures; below 1 means every part stayed inside its range.' };
  },
  payload: ({ m, design }) => {
    if (!design) return null;
    const delivered = m.objectiveMet ? m.finalMass : 0;
    return { value: delivered, t: m.endTime, channel: 'mass', text: m.objectiveMet ? `${fmt(delivered, 0)} kg arrived (final mass of the vehicle, design payload ${fmt(design.payloadMass, 0)} kg)` : 'goal not reached, so the payload was not delivered', note: 'Delivered payload = final mass in the recorded run, counted only when the mission goal was reached.' };
  },
  twr: ({ m, design }) => (fin(m.liftoffTWR) ? { value: m.liftoffTWR, t: (m.liftoffTime ?? 0) + 4, channel: 'twr', text: `${fmt(m.liftoffTWR, 2)} measured 4 s after liftoff${design ? ` (design value ${fmt(design.liftoffTWR, 2)})` : ''}` } : (design ? { value: design.liftoffTWR, t: 0, channel: 'twr', text: `${fmt(design.liftoffTWR, 2)} from the design (the rocket never lifted off)` } : null)),
  dvMargin: ({ m, design, record }) => {
    if (!fin(m.dvIdeal) || m.dvIdeal <= 0) return null;
    const short = (record.result?.failures ?? []).find((f) => fin(f.dvShortfall));
    if (short) return { value: -short.dvShortfall / m.dvIdeal, t: short.t, channel: 'dvIdeal', text: `${fmt(short.dvShortfall, 0)} m/s short (${fmt(100 * short.dvShortfall / m.dvIdeal, 1)} % of the ${fmt(m.dvIdeal, 0)} m/s the engines delivered)` };
    const isp = lastIsp(design); if (!isp || !(m.finalPropellant > 0) || !(m.finalMass > m.finalPropellant)) return { value: 0, t: m.endTime, channel: 'dvIdeal', text: 'no propellant left in the tanks', note: 'Margin = delta-v still available in the remaining propellant divided by the delta-v the engines delivered.' };
    const dvLeft = isp * G0 * Math.log(m.finalMass / (m.finalMass - m.finalPropellant));
    return { value: dvLeft / m.dvIdeal, t: m.endTime, channel: 'propMass', text: `${fmt(dvLeft, 0)} m/s left in the tanks after ${fmt(m.dvIdeal, 0)} m/s used`, note: 'Margin = delta-v still available in the remaining propellant (rocket equation, Isp of the last stage) divided by the delta-v the engines delivered.' };
  },
  landingV: ({ m }) => (fin(m.touchdownVertical) ? { value: m.touchdownVertical, t: m.endTime, channel: 'vSpeed', text: `${fmt(m.touchdownVertical, 2)} m/s down at touchdown` } : null),
  landingH: ({ m }) => (fin(m.touchdownHorizontal) ? { value: m.touchdownHorizontal, t: m.endTime, channel: 'hSpeed', text: `${fmt(m.touchdownHorizontal, 2)} m/s sideways at touchdown` } : null),
  battery: ({ m, tel }) => {
    if (!fin(m.minBatteryFrac) || m.minBatteryFrac >= 0.999 || !tel?.count) return null;
    const col = tel.column('batteryFrac'); let bi = 0; for (let i = 0; i < col.length; i++) if (col[i] < col[bi]) bi = i;
    return { value: m.minBatteryFrac, t: tel.column('t')[bi], channel: 'batteryFrac', text: `lowest charge ${fmt(100 * m.minBatteryFrac, 0)} %` };
  },
  slip: ({ m }) => (fin(m.maxSlip) ? { value: m.maxSlip, t: m.endTime, channel: 'slip', text: `peak wheel slip ${fmt(100 * m.maxSlip, 0)} %` } : null),
  distance: ({ m }) => (fin(m.distanceDriven) ? { value: m.distanceDriven, t: m.endTime, channel: 'odometer', text: `${fmt(m.distanceDriven, 0)} m driven` } : null),
  maxTemp: ({ m, tel }) => {
    if (!fin(m.maxTempNose) || !tel?.count) return null;
    const col = tel.column('tempLead'); let bi = 0; for (let i = 0; i < col.length; i++) if (col[i] > col[bi]) bi = i;
    return { value: m.maxTempNose, t: tel.column('t')[bi], channel: 'tempLead', text: `${fmt(m.maxTempNose, 0)} K (${fmt(m.maxTempNose - 273.15, 0)} deg C) at the nose` };
  },
};

/** Metrics the user may pick for a custom requirement: id -> label, unit, default operator. */
export const CUSTOM_METRICS = {
  maxG: { label: 'Peak acceleration', unit: 'g', op: '<=', scale: 1, d: 2 },
  maxQ: { label: 'Max dynamic pressure', unit: 'kPa', op: '<=', scale: 1e-3, d: 1 },
  twr: { label: 'Liftoff thrust-to-weight', unit: '', op: '>=', scale: 1, d: 2 },
  payload: { label: 'Payload delivered', unit: 'kg', op: '>=', scale: 1, d: 0 },
  maxTemp: { label: 'Peak nose temperature', unit: 'K', op: '<=', scale: 1, d: 0 },
  landingV: { label: 'Touchdown vertical speed', unit: 'm/s', op: '<=', scale: 1, d: 2 },
  distance: { label: 'Distance driven', unit: 'm', op: '>=', scale: 1, d: 0 },
  battery: { label: 'Lowest battery charge', unit: '%', op: '>=', scale: 100, d: 0 },
};

// ------------------------------------------------------------------------------------------------ the default list
/** Requirements that make sense for this run's mission and vehicle. `limit` is in the unit shown (see `unit`/`scale`). */
export function defaultRequirements(record, { m, design = designOf(record) } = {}) {
  const obj = record.mission?.objective ?? {}, lim = designLimits(record.vehicle);
  const out = [];
  const add = (r) => out.push({ enabled: true, auto: true, ...r });
  add({ id: 'goal', label: 'Mission goal reached', plain: 'Does the rocket do its job?', metric: 'status', op: 'is', limit: 1, unit: '', scale: 1 });
  if (obj.type === 'orbit') add({ id: 'orbit', label: 'Final orbit within tolerance of the target', plain: 'Orbit height is right', metric: 'orbit', op: 'range', limit: obj.altitude, tol: obj.tolerance ?? 0.1, unit: '%', scale: 100, why: 'Largest of the periapsis and apoapsis errors, relative to the target altitude. Tolerance is the one stored in the mission.' });
  if (record.mission?.initial?.type === 'pad' || record.vehicle?.type === 'rocket') {
    add({ id: 'twr', label: 'Liftoff thrust-to-weight', plain: 'Strong enough to lift off', metric: 'twr', op: '>=', limit: 1.2, unit: '', scale: 1, d: 2, why: 'Thrust divided by weight shortly after liftoff. Below about 1.2 the climb is too slow and gravity loss grows.' });
    add({ id: 'maxq', label: 'Max dynamic pressure below the structural rating', plain: 'Air pressure stays below what the rocket can take', metric: 'maxQ', op: '<=', limit: lim.qLimit ?? null, unit: 'kPa', scale: 1e-3, d: 1, why: lim.qName ? `Weakest exposed part: ${lim.qName}.` : 'No part declares a dynamic-pressure rating.' });
    add({ id: 'struct', label: 'Peak structural load below 100 % of the limit', plain: 'Nothing breaks', metric: 'structRatio', op: '<=', limit: 1, unit: '', scale: 1, d: 2 });
  }
  if (record.vehicle?.type === 'rocket' || obj.type === 'orbit') {
    add({ id: 'g', label: 'Peak acceleration below the part ratings', plain: 'Not too many g', metric: 'maxG', op: '<=', limit: lim.gLimit ?? 6, unit: 'g', scale: 1, d: 2, why: lim.gName ? `Weakest part: ${lim.gName}.` : 'No part declares a g rating, 6 g is used.' });
    add({ id: 'payload', label: 'Payload delivered at least', plain: 'The payload really arrives', metric: 'payload', op: '>=', limit: design?.payloadMass ? Math.floor(design.payloadMass * 0.95) : 0, unit: 'kg', scale: 1, d: 0, why: 'Default: 95 % of the designed payload. Change it to your mission requirement.' });
    add({ id: 'dv', label: 'Delta-v margin at least', plain: 'Some fuel speed to spare', metric: 'dvMargin', op: '>=', limit: 0.05, unit: '%', scale: 100, d: 1, why: 'Delta-v left in the propellant at the end, divided by the delta-v used.' });
    add({ id: 'therm', label: 'Temperatures inside every part range', plain: 'Nothing too hot or too cold', metric: 'thermRatio', op: '<=', limit: 1, unit: '', scale: 1, d: 2 });
  }
  if (obj.type === 'landing' || fin(m?.touchdownVertical)) {
    add({ id: 'land-v', label: 'Touchdown vertical speed below', plain: 'Soft landing', metric: 'landingV', op: '<=', limit: 3.5, unit: 'm/s', scale: 1, d: 2, why: 'Same limit the flight report uses (3.5 m/s).' });
    add({ id: 'land-h', label: 'Touchdown sideways speed below', plain: 'No sliding at touchdown', metric: 'landingH', op: '<=', limit: 1.5, unit: 'm/s', scale: 1, d: 2 });
  }
  if (fin(m?.distanceDriven)) {
    add({ id: 'slip', label: 'Wheel slip below', plain: 'Wheels keep their grip', metric: 'slip', op: '<=', limit: 0.35, unit: '%', scale: 100, d: 0 });
    if (obj.type === 'traverse' && fin(obj.distance)) add({ id: 'dist', label: 'Distance driven at least', plain: 'Drives far enough', metric: 'distance', op: '>=', limit: obj.distance, unit: 'm', scale: 1, d: 0 });
  }
  if (fin(m?.minBatteryFrac) && m.minBatteryFrac < 0.999) add({ id: 'batt', label: 'Battery charge never below', plain: 'Battery never runs empty', metric: 'battery', op: '>=', limit: 0.1, unit: '%', scale: 100, d: 0 });
  return out;
}

/** Apply the user's saved changes {id: {limit?, tol?, enabled?}} and custom requirements [{id, metric, op, limit, label}]. */
export function applyOverrides(list, overrides = {}, custom = []) {
  const out = list.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) }));
  for (const c of custom) { const def = CUSTOM_METRICS[c.metric]; if (def) out.push({ enabled: true, auto: false, plain: c.label, unit: def.unit, scale: def.scale, d: def.d, op: def.op, ...c }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ evaluation
/**
 * @returns rows [{id, label, plain, req (text), value (SI), valueText, margin (fraction, + is good), marginText, verdict: 'PASS'|'FAIL'|'N/A'|'OFF', evidence:{channel, t, text}, why}]
 */
export function evaluateRequirements(reqs, { record, tel, m, design = designOf(record) }) {
  const ctx = { record, tel, m, design };
  return reqs.map((r) => {
    const row = { id: r.id, label: r.label, plain: r.plain, why: r.why, metric: r.metric, op: r.op, limit: r.limit, tol: r.tol, unit: r.unit, scale: r.scale, d: r.d, enabled: r.enabled !== false, auto: r.auto };
    row.req = requirementText(r);
    if (!row.enabled) return { ...row, verdict: 'OFF', valueText: '-', marginText: '-' };
    const meas = MEASURES[r.metric]?.(ctx) ?? null;
    if (!meas || (r.op !== 'is' && !fin(r.limit))) return { ...row, verdict: 'N/A', valueText: meas?.text ?? 'no data in this run', marginText: '-', evidence: meas ? { channel: meas.channel, t: meas.t } : null };
    let pass, margin;
    const v = meas.value;
    if (r.op === 'is') { pass = v >= 1; margin = pass ? 1 : -1; }
    else if (r.op === 'range') { pass = v <= r.tol; margin = (r.tol - v) / r.tol; }
    else if (r.op === '<=') { pass = v <= r.limit; margin = (r.limit - v) / Math.abs(r.limit || 1); }
    else { pass = v >= r.limit; margin = r.limit !== 0 ? (v - r.limit) / Math.abs(r.limit) : v; }
    row.value = v; row.verdict = pass ? 'PASS' : 'FAIL'; row.margin = margin;
    row.valueText = meas.text;
    const pts = r.unit === '%' && r.op !== 'range' ? (r.op === '<=' ? r.limit - v : v - r.limit) * (r.scale ?? 100) : null;
    row.marginText = r.op === 'is' ? (pass ? 'met' : 'not met') : r.op === 'range' ? `${fmt(100 * v, 1)} % off target (allowed ${fmt(100 * r.tol, 0)} %)` : pts != null ? `${pts >= 0 ? '+' : ''}${fmt(pts, 1)} points` : `${margin >= 0 ? '+' : ''}${fmt(100 * margin, 0)} %`;
    row.evidence = { channel: meas.channel, channel2: meas.channel2, t: meas.t, target: meas.target, note: meas.note };
    return row;
  });
}
export function requirementText(r) {
  const u = r.unit ? ` ${r.unit}` : '', s = r.scale ?? 1, d = r.d ?? 1;
  if (r.op === 'is') return 'must be met';
  if (!fin(r.limit)) return 'no limit set';
  if (r.op === 'range') return `within +/- ${fmt(100 * r.tol, 1)} % of ${fmt(r.limit / 1000, 0)} km`;
  return `${r.op === '<=' ? 'at most' : 'at least'} ${grp(r.limit * s, d)}${u}`;
}
export function summarize(rows) {
  const on = rows.filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL');
  const pass = on.filter((r) => r.verdict === 'PASS').length;
  return { total: on.length, pass, fail: on.length - pass, na: rows.filter((r) => r.verdict === 'N/A').length, allPass: on.length > 0 && pass === on.length };
}
