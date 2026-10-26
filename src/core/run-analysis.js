// Facts extracted from a finished run (stored record + telemetry). Everything the report, the Engineering Analysis screen and the AI
// engineer say about a simulation comes from here, and everything here is computed from recorded telemetry / result data.
import { CHANNEL_META } from '../../physics/telemetry.js';
import { DebrisTrack } from '../../physics/debris.js';
import { getBody, latLonFromInertial } from '../../physics/bodies.js';
import { elementsFromState } from '../../physics/orbital.js';
import { orbitResultText } from './orbit-goal.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d) : '–');
const km = (m) => `${fmt(m / 1000, 1)} km`;

function argMax(col) { let bi = 0, bv = -Infinity; for (let i = 0; i < col.length; i++) if (col[i] > bv) { bv = col[i]; bi = i; } return { i: bi, v: bv }; }
function argMin(col) { let bi = 0, bv = Infinity; for (let i = 0; i < col.length; i++) if (col[i] < bv) { bv = col[i]; bi = i; } return { i: bi, v: bv }; }

/** Numeric metrics (SI units) keyed by name + a list of display rows. */
export function runMetrics(record, tel) {
  const res = record.result ?? {};
  const s = res.summary ?? {};
  const n = tel.count;
  const col = (id) => tel.column(id);
  const t = n ? col('t') : [];
  const m = {
    status: res.status, reason: res.reason, endTime: res.endTime ?? (n ? t[n - 1] : 0),
    objectiveMet: !!res.objective?.success,
    samples: n,
  };
  if (!n) return m;
  const q = argMax(col('q')), g = argMax(col('gload')), alt = argMax(col('alt')), sp = argMax(col('speed')), mach = argMax(col('mach'));
  m.maxQ = q.v; m.tMaxQ = t[q.i]; m.altMaxQ = col('alt')[q.i]; m.machAtMaxQ = col('mach')[q.i];
  m.maxG = g.v; m.tMaxG = t[g.i];
  m.maxAlt = alt.v; m.tMaxAlt = t[alt.i];
  m.maxSpeed = sp.v; m.maxMach = mach.v;
  m.initialMass = col('mass')[0]; m.finalMass = col('mass')[n - 1];
  m.initialPropellant = col('propMass')[0]; m.finalPropellant = col('propMass')[n - 1];
  m.propellantUsed = m.initialPropellant - m.finalPropellant;
  m.maxAoA = Math.max(...Array.from(col('aoa'), Math.abs));
  m.maxThrust = argMax(col('thrust')).v;
  m.maxTempNose = argMax(col('tempLead')).v; m.maxTempBody = argMax(col('tempBody')).v; m.maxHeatFlux = argMax(col('heatFlux')).v;
  m.minBattery = argMin(col('battery')).v; m.minBatteryFrac = argMin(col('batteryFrac')).v;
  m.maxStructRatio = argMax(col('structRatio')).v;
  m.maxThermRatio = argMax(col('thermRatio')).v;
  const dv = s.deltaV ?? {};
  m.dvIdeal = dv.ideal; m.dvGravity = dv.gravity; m.dvDrag = dv.drag; m.dvSteering = dv.steering;
  m.finalApo = s.finalOrbit?.apo; m.finalPeri = s.finalOrbit?.peri; m.finalEcc = s.finalOrbit?.ecc; m.finalIncl = s.finalOrbit?.incl; m.finalPeriod = s.finalOrbit?.period;
  m.liftoffTime = s.liftoffTime;
  // thrust-to-weight once the engines are fully spooled (4 s after liftoff); at the instant of liftoff it is 1 by definition
  if (s.liftoffTime != null) { const i = tel.indexAt(s.liftoffTime + 4); m.liftoffTWR = col('twr')[i]; }
  m.stagesSeparated = (s.separations ?? []).length;
  const res2 = (s.stageReserves ?? []).filter((x) => /^stage\d+$/.test(x.group) && x.initial > 0);
  if (res2.length) { const lastStage = res2[res2.length - 1]; m.lastStageReserve = lastStage.left; m.lastStageReserveFrac = lastStage.left / lastStage.initial; m.lastStageGroup = lastStage.group; }
  m.linkTime = s.linkTimeS ?? 0; m.dataDownlinkedBits = s.dataDownlinkedBits ?? 0;
  if (s.touchdown) { m.touchdownVertical = s.touchdown.vVert; m.touchdownHorizontal = s.touchdown.vHoriz; m.touchdownTilt = s.touchdown.tilt; }
  const od = col('odometer'); if (od[n - 1] > 0) { m.distanceDriven = od[n - 1]; m.maxSlip = argMax(col('slip')).v; m.maxTerrainSlope = argMax(col('terrainSlope')).v; }
  m.failureCodes = (res.failures ?? []).map((f) => f.code);
  return m;
}

/** Ordered mission timeline (events + separations + failures) with human readable text. */
export function timeline(record) {
  return (record.events ?? []).filter((e) => e.kind !== 'EVENT_DONE' || /complete|reached/i.test(e.message)).map((e) => ({ t: e.t, kind: e.kind, text: e.message }));
}

/** Plain-language findings, each carrying the numbers it is based on. */
export function findings(record, tel, m = runMetrics(record, tel)) {
  const out = [];
  const res = record.result ?? {};
  const obj = record.mission?.objective ?? {};
  const add = (level, text) => out.push({ level, text });
  if (!tel.count) return out;
  if (m.maxQ != null && m.maxQ > 200) add('info', `Peak dynamic pressure ${fmt(m.maxQ / 1000, 1)} kPa at T+${fmt(m.tMaxQ, 0)} s (altitude ${km(m.altMaxQ)}, Mach ${fmt(m.machAtMaxQ, 2)}).`);
  if (m.maxG != null) add('info', `Peak acceleration ${fmt(m.maxG, 2)} g at T+${fmt(m.tMaxG, 0)} s.`);
  if (m.maxAlt != null && m.maxAlt > 1000 && record.mission?.initial?.type !== 'surface') add('info', `Maximum altitude ${km(m.maxAlt)} at T+${fmt(m.tMaxAlt, 0)} s.`);
  if (m.dvIdeal > 0 && record.mission?.initial?.type === 'pad') {
    const loss = (m.dvGravity ?? 0) + (m.dvDrag ?? 0) + (m.dvSteering ?? 0);
    add('info', `Engines delivered ${fmt(m.dvIdeal, 0)} m/s of ideal delta-v; ${fmt(loss, 0)} m/s (${fmt((100 * loss) / m.dvIdeal, 0)}%) was lost to gravity (${fmt(m.dvGravity, 0)}), drag (${fmt(m.dvDrag, 0)}) and steering (${fmt(m.dvSteering, 0)}).`);
  }
  if (m.liftoffTWR != null) add(m.liftoffTWR < 1.2 ? 'warn' : 'info', `Liftoff thrust-to-weight ${fmt(m.liftoffTWR, 2)}.`);
  if (m.initialPropellant > 0) add('info', `Propellant used ${fmt(m.propellantUsed, 0)} kg of ${fmt(m.initialPropellant, 0)} kg (${fmt((100 * m.propellantUsed) / m.initialPropellant, 0)}%); ${fmt(m.finalPropellant, 0)} kg remained.`);
  if (obj.type === 'orbit' && m.finalPeri != null) add(res.status === 'SUCCESS' ? 'ok' : 'bad', `Final orbit ${km(m.finalPeri)} × ${km(m.finalApo)} (eccentricity ${fmt(m.finalEcc, 4)}, inclination ${fmt(m.finalIncl, 1)}°). ${orbitResultText(obj, m.finalPeri, m.finalApo).replace(/^t/, 'T')}.`);
  if (m.touchdownVertical != null) add(m.touchdownVertical > 3.5 || m.touchdownHorizontal > 1.5 ? 'bad' : 'ok', `Touchdown at ${fmt(m.touchdownVertical, 2)} m/s vertical and ${fmt(m.touchdownHorizontal, 2)} m/s horizontal, tilt ${fmt(m.touchdownTilt, 1)}°.`);
  if (m.distanceDriven != null) add('info', `Rover drove ${fmt(m.distanceDriven, 1)} m; peak wheel slip ${fmt(100 * m.maxSlip, 0)}%, steepest terrain slope ${fmt(m.maxTerrainSlope, 1)}°.`);
  if (m.minBatteryFrac != null && m.minBatteryFrac < 0.2) add('warn', `Battery fell to ${fmt(100 * m.minBatteryFrac, 0)}% of capacity.`);
  if (m.maxStructRatio > 0.7) add('warn', `Structural load reached ${fmt(100 * m.maxStructRatio, 0)}% of the limit.`);
  for (const w of res.warnings ?? []) add('warn', `T+${fmt(w.t, 0)} s: ${w.message}`);
  return out;
}

/** Downsampled chart data for reports. */
export function chartSeries(tel, channels, points = 240) {
  const n = tel.count; if (!n) return { t: [], series: {} };
  const step = Math.max(1, Math.floor(n / points));
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const t = idx.map((i) => tel.column('t')[i]);
  const series = {};
  for (const id of channels) { const c = tel.column(id); series[id] = idx.map((i) => c[i]); }
  return { t, series };
}
export const REPORT_CHARTS = [
  { title: 'Altitude', channels: ['alt'], scale: 1e-3, unit: 'km' },
  { title: 'Speed', channels: ['speed', 'surfSpeed'], scale: 1, unit: 'm/s' },
  { title: 'Acceleration', channels: ['gload'], scale: 1, unit: 'g' },
  { title: 'Dynamic pressure', channels: ['q'], scale: 1e-3, unit: 'kPa' },
  { title: 'Mass', channels: ['mass'], scale: 1, unit: 'kg' },
  { title: 'Thrust', channels: ['thrust'], scale: 1e-3, unit: 'kN' },
  { title: 'Temperature', channels: ['tempLead', 'tempBody'], scale: 1, unit: 'K' },
  { title: 'Angle of attack', channels: ['aoa'], scale: 1, unit: 'deg' },
];

/** Compare two runs (e.g. before / after a design change). Returns rows {key, label, a, b, delta, better?}. */
const COMPARE_KEYS = [
  ['status', 'Result', null], ['endTime', 'Mission duration', 's'], ['maxAlt', 'Max altitude', 'm'], ['finalPeri', 'Final periapsis', 'm'], ['finalApo', 'Final apoapsis', 'm'],
  ['dvIdeal', 'Delta-v delivered', 'm/s'], ['dvGravity', 'Gravity loss', 'm/s'], ['dvDrag', 'Drag loss', 'm/s'], ['dvSteering', 'Steering loss', 'm/s'],
  ['initialMass', 'Liftoff mass', 'kg'], ['finalMass', 'Final mass', 'kg'], ['propellantUsed', 'Propellant used', 'kg'], ['finalPropellant', 'Propellant left', 'kg'], ['lastStageReserve', 'Last-stage propellant reserve', 'kg'],
  ['maxQ', 'Max dynamic pressure', 'Pa'], ['maxG', 'Peak acceleration', 'g'], ['maxTempNose', 'Peak nose temperature', 'K'], ['maxStructRatio', 'Peak structural load ratio', ''],
  ['liftoffTWR', 'Liftoff T/W', ''], ['touchdownVertical', 'Touchdown vertical speed', 'm/s'], ['touchdownHorizontal', 'Touchdown horizontal speed', 'm/s'], ['distanceDriven', 'Distance driven', 'm'],
];
export function compareMetrics(ma, mb) {
  const rows = [];
  for (const [key, label, unit] of COMPARE_KEYS) {
    const a = ma[key], b = mb[key];
    if (a === undefined && b === undefined) continue;
    const row = { key, label, unit, a, b };
    if (typeof a === 'number' && typeof b === 'number') { row.delta = b - a; row.rel = a !== 0 ? (b - a) / Math.abs(a) : null; }
    rows.push(row);
  }
  const fa = new Set(ma.failureCodes ?? []), fb = new Set(mb.failureCodes ?? []);
  return { rows, failuresFixed: [...fa].filter((c) => !fb.has(c)), failuresIntroduced: [...fb].filter((c) => !fa.has(c)), failuresRemaining: [...fa].filter((c) => fb.has(c)) };
}
export { CHANNEL_META };

/**
 * Where do the jettisoned stages and fairings go? Each piece is flown on with gravity and drag (physics/debris.js) from the state
 * recorded at separation. Pieces that reach the ground get an impact time, position (lat / lon) and speed; pieces still in flight
 * after the horizon are reported with their orbit. Nominal separation velocity and tumbling drag are assumed (see documentation/PHYSICS.md).
 * @returns [{group, mass, tSep, altSep, impact:{after, lat, lon, downrangeKm, speed}|null, orbit:{periAlt, apoAlt, period}|null}]
 */
export function debrisReport(record, { horizon = 10800 } = {}) {
  const seps = record.result?.summary?.separations ?? [];
  const out = [];
  const site = record.environment?.site ?? record.mission?.initial ?? null;
  const epoch = record.environment?.epoch ?? 0;
  for (const s of seps) {
    const d = s.debris; if (!d) continue;
    const body = getBody(d.body);
    const tr = new DebrisTrack(d);
    const st0 = tr.stateAt(s.t);
    const st = tr.stateAt(s.t + horizon);
    const row = { group: s.group, label: d.label, mass: d.mass, tSep: s.t, altSep: st0?.alt ?? null, impact: null, orbit: null };
    if (tr.impact) {
      const ll = latLonFromInertial(d.body, tr.impact.r, epoch + tr.impact.t);
      const lat = (ll.lat * 180) / Math.PI, lon = (ll.lon * 180) / Math.PI;
      let downrange = null;
      if (site && Number.isFinite(site.lat) && Number.isFinite(site.lon)) {
        const p1 = (site.lat * Math.PI) / 180, p2 = ll.lat, dl = ll.lon - (site.lon * Math.PI) / 180;
        const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
        downrange = (body.radius * Math.acos(Math.max(-1, Math.min(1, c)))) / 1000;
      }
      row.impact = { after: tr.impact.t - s.t, tMission: tr.impact.t, lat, lon, downrangeKm: downrange, speed: tr.impact.speed };
    } else {
      const el = elementsFromState(body.mu, st.r, st.v);
      row.orbit = { periAlt: el.rp - body.radius, apoAlt: Number.isFinite(el.ra) ? el.ra - body.radius : Infinity, horizon };
    }
    out.push(row);
  }
  return out;
}
