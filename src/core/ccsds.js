// Trajectory exchange with other space software (2.3): CCSDS Orbit Ephemeris Message (OEM 2.0, text "KVN" form), CCSDS Orbit Parameter
// Message (OPM, one state vector) and a plain SPICE-style text ephemeris ("epoch x y z vx vy vz", km and km/s: the input format of
// NAIF's MKSPK "text" type). Export writes a flight's path; import reads someone else's path so it can be compared with a flight (or an OPM
// can set the starting orbit).
//
// What is exact and what is not (also in documentation/KNOWN-LIMITATIONS.md):
//  * ASTRA LAB's inertial frame is centred on the planet with its z axis along the planet's spin axis. Files are written with
//    REF_FRAME = EME2000 for Earth and are READ as EME2000; the small difference between the real frame and this simplified one
//    (precession, nutation, polar motion) is not modelled.
//  * The mission's "epoch" is seconds after 2000-01-01 12:00:00 (J2000). TIME_SYSTEM = UTC is written; the UTC-TDB difference
//    (about 69 s in 2026) is ignored.
//  * 2.9: binary SPICE kernels (SPK .bsp) are read and written by src/core/spk.js; OEM files may hold several segments, covariance
//    blocks and accelerations, and come as KVN text or NDM/XML; OPM may give Keplerian elements; OMM (KVN, XML or CelesTrak JSON) gives
//    mean elements. File time tags in UTC, TAI, TT, TDB, GPS and UT1 are converted to the mission epoch's time scale (fileTimeToEpoch).

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const MAX_EPHEMERIS_LINES = 200000;

/** "YYYY-MM-DDTHH:MM:SS[.ffffff]" of seconds after J2000 (microsecond resolution, trailing zeros dropped). */
export function isoOf(epochSeconds) {
  let whole = Math.floor(epochSeconds), us = Math.round((epochSeconds - whole) * 1e6);
  if (us >= 1e6) { whole += 1; us -= 1e6; }
  const base = new Date(J2000_MS + whole * 1000).toISOString().slice(0, 19);
  return us ? `${base}.${String(us).padStart(6, '0').replace(/0+$/, '')}` : base;
}
/** Seconds after J2000 from an ISO-like time ("2026-10-24T12:00:00.000", "2026-297T..." day-of-year form too); null when it is not a time. */
export function parseTime(text) {
  const s = String(text).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(s);
  if (m) return (Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) - J2000_MS) / 1000 + parseFloat(m[6]);
  m = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(s);
  if (m) return (Date.UTC(+m[1], 0, +m[2], +m[3], +m[4], 0) - J2000_MS) / 1000 + parseFloat(m[5]);
  return null;
}

// ------------------------------------------------------------------------------------------------ time systems
// A time tag "in scale X" is read as seconds after 2000-01-01 12:00:00 counted on scale X's clock (parseTime of the printed time).
// UTC is counted like Unix time (no leap second inside the count). The simulator counts mission epochs on EPOCH_TIME_SYSTEM.
// physics/time.js (a parallel change) will own these conversions; until then this table is the single place they happen.
export const EPOCH_TIME_SYSTEM = 'UTC';
export const TIME_SYSTEMS = ['UTC', 'TAI', 'TT', 'TDB', 'GPS', 'UT1'];
const TIME_ALIASES = { TDT: 'TT', ET: 'TDB', TCB: null, TCG: null, GMST: null, MET: null, MRT: null, SCLK: null, TCG_: null };
// [UTC seconds after J2000 when it starts, TAI-UTC]: the IERS leap-second table 1972-2017 (no leap second since 2017-01-01)
const LEAPS = [[1972, 1, 10], [1972, 7, 11], [1973, 1, 12], [1974, 1, 13], [1975, 1, 14], [1976, 1, 15], [1977, 1, 16], [1978, 1, 17], [1979, 1, 18], [1980, 1, 19], [1981, 7, 20], [1982, 7, 21], [1983, 7, 22], [1985, 7, 23], [1988, 1, 24], [1990, 1, 25], [1991, 1, 26], [1992, 7, 27], [1993, 7, 28], [1994, 7, 29], [1996, 1, 30], [1997, 7, 31], [1999, 1, 32], [2006, 1, 33], [2009, 1, 34], [2012, 7, 35], [2015, 7, 36], [2017, 1, 37]]
  .map(([y, mo, d]) => [(Date.UTC(y, mo - 1, 1) - J2000_MS) / 1000, d]);
/** TAI - UTC in seconds at a UTC time (seconds after J2000). Before 1972 the 1972 value is used. */
export function taiMinusUtc(utc) { let d = 10; for (const [t, v] of LEAPS) if (utc >= t) d = v; return d; }
/** TDB - TT in seconds (Fairhead-Bretagnon leading terms, good to ~30 microseconds). */
const tdbMinusTt = (tt) => { const g = (357.53 + 0.98560028 * (tt / 86400)) * Math.PI / 180; return 0.001657 * Math.sin(g) + 0.000014 * Math.sin(2 * g); };
export function normaliseTimeSystem(name) {
  const k = String(name ?? 'UTC').trim().toUpperCase();
  const a = k in TIME_ALIASES ? TIME_ALIASES[k] : k;
  if (!a || !TIME_SYSTEMS.includes(a)) throw new Error(`The time system "${name}" is not supported (use ${TIME_SYSTEMS.join(', ')}).`);
  return a;
}
const toTai = (t, ts) => {
  switch (ts) {
    case 'TAI': return t;
    case 'TT': return t - 32.184;
    case 'TDB': { const tt = t - tdbMinusTt(t); return tt - 32.184; }
    case 'GPS': return t + 19;
    case 'UT1': // UT1 - UTC is below 0.9 s and is not modelled: UT1 is read as UTC
    case 'UTC': return t + taiMinusUtc(t);
    default: throw new Error(`Unknown time system ${ts}`);
  }
};
const fromTai = (tai, ts) => {
  switch (ts) {
    case 'TAI': return tai;
    case 'TT': return tai + 32.184;
    case 'TDB': { const tt = tai + 32.184; return tt + tdbMinusTt(tt); }
    case 'GPS': return tai - 19;
    case 'UT1': case 'UTC': { let u = tai - 37; for (let i = 0; i < 3; i++) u = tai - taiMinusUtc(u); return u; }
    default: throw new Error(`Unknown time system ${ts}`);
  }
};
/** Convert a time tag between scales (seconds after J2000 on each scale's clock). */
export function convertTime(t, from, to) { const f = normaliseTimeSystem(from), g = normaliseTimeSystem(to); return f === g ? t : fromTai(toTai(t, f), g); }
export const fileTimeToEpoch = (t, timeSystem) => convertTime(t, timeSystem, EPOCH_TIME_SYSTEM);
export const epochToFileTime = (t, timeSystem) => convertTime(t, EPOCH_TIME_SYSTEM, timeSystem);

// ------------------------------------------------------------------------------------------------ orbital elements
export const GM_KM3S2 = { EARTH: 398600.4418, MOON: 4902.800066, MARS: 42828.37, SUN: 132712440041.9394 };
const D2R = Math.PI / 180;
/** Keplerian elements (km, deg; `nu` true anomaly or `M` mean anomaly) -> {r [km], v [km/s]}. */
export function elementsToState({ a, e, i, raan, argp, nu, M }, gm) {
  if (!(a > 0) || !(e >= 0 && e < 1)) throw new Error('Only closed orbits (a > 0, 0 <= e < 1) can be converted from elements.');
  if (nu == null) {
    let E = M * D2R; for (let k = 0; k < 50; k++) { const dE = (E - e * Math.sin(E) - M * D2R) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-14) break; }
    nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)) / D2R;
  }
  const p = a * (1 - e * e), th = nu * D2R, rr = p / (1 + e * Math.cos(th));
  const rp = [rr * Math.cos(th), rr * Math.sin(th), 0], vp = [-Math.sqrt(gm / p) * Math.sin(th), Math.sqrt(gm / p) * (e + Math.cos(th)), 0];
  const cO = Math.cos(raan * D2R), sO = Math.sin(raan * D2R), cw = Math.cos(argp * D2R), sw = Math.sin(argp * D2R), ci = Math.cos(i * D2R), si = Math.sin(i * D2R);
  const R = [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci], [sw * si, cw * si]];
  const rot = (x) => R.map((row) => row[0] * x[0] + row[1] * x[1]);
  return { r: rot(rp), v: rot(vp) };
}
/** {r [km], v [km/s]} -> Keplerian elements (km, deg). */
export function stateToElements(r, v, gm) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rn = Math.hypot(...r), v2 = dot(v, v), hv = cross(r, v), hn = Math.hypot(...hv);
  const ev = r.map((x, k) => ((v2 - gm / rn) * x - dot(r, v) * v[k]) / gm), e = Math.hypot(...ev);
  const a = 1 / (2 / rn - v2 / gm), i = Math.acos(Math.max(-1, Math.min(1, hv[2] / hn)));
  const nv = [-hv[1], hv[0], 0], nn = Math.hypot(...nv);
  const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, dot(x, y) / (Math.hypot(...x) * Math.hypot(...y)))));
  let raan = nn > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, nv[0] / nn))) : 0; if (nv[1] < 0) raan = 2 * Math.PI - raan;
  let argp = nn > 1e-12 && e > 1e-12 ? ang(nv, ev) : 0; if (ev[2] < 0) argp = 2 * Math.PI - argp;
  let nu = e > 1e-12 ? ang(ev, r) : (nn > 1e-12 ? ang(nv, r) : Math.atan2(r[1], r[0])); if (dot(r, v) < 0 && e > 1e-12) nu = 2 * Math.PI - nu;
  return { a, e, i: i / D2R, raan: raan / D2R, argp: argp / D2R, nu: ((nu / D2R) % 360 + 360) % 360 };
}

const CENTER = { earth: 'EARTH', moon: 'MOON', mars: 'MARS', sun: 'SUN' };
const fix = (x, d = 6) => (Number.isFinite(x) ? x.toFixed(d) : 'nan');
const isoIn = (epoch, ts) => isoOf(epochToFileTime(epoch, ts));
const nowIso = () => new Date().toISOString().replace('Z', '').replace(/\.\d+$/, '');
const objName = (rec) => String(rec?.vehicleName ?? rec?.vehicle?.name ?? rec?.name ?? 'ASTRA-LAB-VEHICLE').replace(/[^\w .-]/g, '_').slice(0, 60);
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Samples of a flight: [{t, r:[m], v:[m/s]}] taken from a telemetry recorder, at most `maxSamples`, always including the last one. */
export function samplesOf(tel, { maxSamples = 5000, from = 0 } = {}) {
  const n = tel?.count ?? 0; if (!n) return [];
  const T = tel.column('t'), X = tel.column('x'), Y = tel.column('y'), Z = tel.column('z'), VX = tel.column('vx'), VY = tel.column('vy'), VZ = tel.column('vz');
  const stride = Math.max(1, Math.ceil(n / maxSamples)), out = [];
  let prevT = -Infinity;
  const push = (i) => { if (T[i] > prevT) { out.push({ t: T[i], r: [X[i], Y[i], Z[i]], v: [VX[i], VY[i], VZ[i]] }); prevT = T[i]; } };
  for (let i = from; i < n; i += stride) push(i);
  const last = n - 1; if ((last - from) % stride !== 0) push(last);
  return out;
}

/**
 * CCSDS OEM 2.0 text of a flight. rec = the run record (name, environment.epoch, environment.body), tel = its telemetry recorder.
 * The ephemeris lists the vehicle in the inertial frame of the planet it started at; flights that change the central body (a Moon trip)
 * are written in the Earth frame throughout, which is how the simulator stores the state. timeSystem: 'UTC' (default), 'TDB', 'TT', 'TAI', 'GPS'.
 */
export function exportOEM(rec, tel, { originator = 'ASTRA LAB', maxSamples = 5000, timeSystem = 'UTC', format = 'kvn' } = {}) {
  const S = samplesOf(tel, { maxSamples }); if (S.length < 2) throw new Error('This flight has no recorded path to export.');
  const ts = normaliseTimeSystem(timeSystem);
  const epoch = rec?.environment?.epoch ?? 0, body = rec?.environment?.body ?? 'earth';
  const seg = { object: objName(rec), id: String(rec?.id ?? 'ASTRA-1').slice(0, 40), center: CENTER[body] ?? 'EARTH', frame: 'EME2000', timeSystem: ts, samples: S.map((s) => ({ ...s, t: epoch + s.t })) };
  return format === 'xml' ? writeOEMXml([seg], { originator }) : writeOEM([seg], { originator });
}

/**
 * Write segments [{object, id, center, frame, timeSystem, samples:[{t (epoch s), r [m], v [m/s], a? [m/s2]}], covariance?:[{t, frame?, cov: 21 values km^2..}]}] as OEM KVN.
 */
export function writeOEM(segments, { originator = 'ASTRA LAB', comments = [] } = {}) {
  const L = ['CCSDS_OEM_VERS = 2.0',
    'COMMENT Written by ASTRA LAB. Positions in km, velocities in km/s, planet-centred inertial frame with z along the spin axis.',
    'COMMENT The frame is a simplified EME2000 (no precession or nutation); the epoch is counted from 2000-01-01 12:00:00.',
    ...comments.map((c) => `COMMENT ${c}`), `CREATION_DATE = ${nowIso()}`, `ORIGINATOR = ${originator}`];
  for (const g of segments) {
    const ts = normaliseTimeSystem(g.timeSystem ?? 'UTC'), S = g.samples;
    L.push('', 'META_START', `OBJECT_NAME = ${g.object ?? 'ASTRA-LAB-VEHICLE'}`, `OBJECT_ID = ${g.id ?? 'ASTRA-1'}`, `CENTER_NAME = ${g.center ?? 'EARTH'}`, `REF_FRAME = ${g.frame ?? 'EME2000'}`, `TIME_SYSTEM = ${ts}`,
      `START_TIME = ${isoIn(S[0].t, ts)}`, `STOP_TIME = ${isoIn(S[S.length - 1].t, ts)}`, 'INTERPOLATION = HERMITE', 'INTERPOLATION_DEGREE = 3', 'META_STOP', '');
    for (const s of S) L.push(`${isoIn(s.t, ts)} ${fix(s.r[0] / 1000)} ${fix(s.r[1] / 1000)} ${fix(s.r[2] / 1000)} ${fix(s.v[0] / 1000, 9)} ${fix(s.v[1] / 1000, 9)} ${fix(s.v[2] / 1000, 9)}${s.a ? ` ${fix(s.a[0] / 1000, 12)} ${fix(s.a[1] / 1000, 12)} ${fix(s.a[2] / 1000, 12)}` : ''}`);
    if (g.covariance?.length) {
      L.push('', 'COVARIANCE_START');
      for (const c of g.covariance) {
        L.push(`EPOCH = ${isoIn(c.t, ts)}`); if (c.frame) L.push(`COV_REF_FRAME = ${c.frame}`);
        let k = 0; for (let row = 0; row < 6; row++) { const vals = []; for (let col = 0; col <= row; col++) vals.push(c.cov[k++].toExponential(7)); L.push(vals.join(' ')); }
      }
      L.push('COVARIANCE_STOP');
    }
  }
  return `${L.join('\n')}\n`;
}

/** OEM in NDM/XML form (CCSDS 505.0-B), same content as writeOEM. */
export function writeOEMXml(segments, { originator = 'ASTRA LAB' } = {}) {
  const L = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<oem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sanaregistry.org/r/ndmxml_unqualified/ndmxml-2.0.0-master-2.0.xsd" id="CCSDS_OEM_VERS" version="2.0">',
    '  <header>', '    <COMMENT>Written by ASTRA LAB. km and km/s, simplified EME2000.</COMMENT>', `    <CREATION_DATE>${nowIso()}</CREATION_DATE>`, `    <ORIGINATOR>${xmlEsc(originator)}</ORIGINATOR>`, '  </header>', '  <body>'];
  for (const g of segments) {
    const ts = normaliseTimeSystem(g.timeSystem ?? 'UTC'), S = g.samples;
    L.push('    <segment>', '      <metadata>', `        <OBJECT_NAME>${xmlEsc(g.object ?? 'ASTRA-LAB-VEHICLE')}</OBJECT_NAME>`, `        <OBJECT_ID>${xmlEsc(g.id ?? 'ASTRA-1')}</OBJECT_ID>`, `        <CENTER_NAME>${xmlEsc(g.center ?? 'EARTH')}</CENTER_NAME>`,
      `        <REF_FRAME>${xmlEsc(g.frame ?? 'EME2000')}</REF_FRAME>`, `        <TIME_SYSTEM>${ts}</TIME_SYSTEM>`, `        <START_TIME>${isoIn(S[0].t, ts)}</START_TIME>`, `        <STOP_TIME>${isoIn(S[S.length - 1].t, ts)}</STOP_TIME>`, '      </metadata>', '      <data>');
    for (const s of S) L.push(`        <stateVector><EPOCH>${isoIn(s.t, ts)}</EPOCH><X>${fix(s.r[0] / 1000)}</X><Y>${fix(s.r[1] / 1000)}</Y><Z>${fix(s.r[2] / 1000)}</Z><X_DOT>${fix(s.v[0] / 1000, 9)}</X_DOT><Y_DOT>${fix(s.v[1] / 1000, 9)}</Y_DOT><Z_DOT>${fix(s.v[2] / 1000, 9)}</Z_DOT></stateVector>`);
    for (const c of g.covariance ?? []) {
      const names = []; const ax = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT']; for (let row = 0; row < 6; row++) for (let col = 0; col <= row; col++) names.push(`C${ax[row]}_${ax[col]}`);
      L.push(`        <covarianceMatrix><EPOCH>${isoIn(c.t, ts)}</EPOCH>${c.frame ? `<COV_REF_FRAME>${xmlEsc(c.frame)}</COV_REF_FRAME>` : ''}${names.map((n, k) => `<${n}>${c.cov[k].toExponential(7)}</${n}>`).join('')}</covarianceMatrix>`);
    }
    L.push('      </data>', '    </segment>');
  }
  L.push('  </body>', '</oem>');
  return `${L.join('\n')}\n`;
}

/** SPICE-style text ephemeris: "ET x y z vx vy vz" per line with ET in TDB seconds past J2000, km and km/s (MKSPK "text" input, 6 elements). */
export function exportSpiceText(rec, tel, { maxSamples = 5000 } = {}) {
  const S = samplesOf(tel, { maxSamples }); if (S.length < 2) throw new Error('This flight has no recorded path to export.');
  const epoch = rec?.environment?.epoch ?? 0;
  const L = ['# ASTRA LAB trajectory in SPICE text form: ET[TDB s past J2000]  x y z [km]  vx vy vz [km/s]. Planet-centred inertial frame (simplified EME2000).'];
  for (const s of S) L.push(`${fix(epochToFileTime(epoch + s.t, 'TDB'), 3)} ${fix(s.r[0] / 1000)} ${fix(s.r[1] / 1000)} ${fix(s.r[2] / 1000)} ${fix(s.v[0] / 1000, 9)} ${fix(s.v[1] / 1000, 9)} ${fix(s.v[2] / 1000, 9)}`);
  return `${L.join('\n')}\n`;
}

const num = (s) => { if (s == null || String(s).trim() === '') return null; const x = Number(s); return Number.isFinite(x) ? x : null; };
const numU = (s) => num(String(s ?? '').replace(/\[[^\]]*\]/g, '').trim().split(/\s+/)[0]);
function keyValues(lines) {
  const kv = {};
  for (const ln of lines) { const m = /^([A-Z_0-9]+)\s*=\s*(.*)$/.exec(ln.trim()); if (m && !(m[1] in kv)) kv[m[1]] = m[2].trim(); }
  return kv;
}
function mergeSegments(segments) {
  // samples of the first segment's object and centre, segments in time order; a repeated boundary time is kept once
  const first = segments[0]; const same = segments.filter((g) => g.center === first.center);
  const out = []; for (const g of same) for (const s of g.samples) { if (out.length && s.t <= out[out.length - 1].t) { if (s.t === out[out.length - 1].t) continue; throw new Error('The segments overlap in time; this reader needs them in order.'); } out.push(s); }
  return out;
}
const ephemerisResult = (kind, segments, header = {}) => {
  if (!segments.length) throw new Error('The file has no ephemeris segment.');
  const g = segments[0];
  return { kind, object: g.object, center: g.center, frame: g.frame, timeSystem: g.timeSystem, originator: header.originator ?? null, segments, samples: mergeSegments(segments), covariance: segments.flatMap((s) => s.covariance) };
};

/**
 * Parse an OEM (KVN text). Returns {kind:'oem', object, center, frame, timeSystem, segments:[...], samples:[{t (mission-epoch s), r [m], v [m/s], a?}], covariance:[...]}.
 * Several segments are allowed; `samples` joins those with the first segment's centre. Throws a plain Error on bad input.
 */
export function parseOEM(text) {
  const raw = String(text ?? '').replace(/\r/g, '').split('\n');
  if (raw.length > MAX_EPHEMERIS_LINES + 2000) throw new Error(`The ephemeris is too long (more than ${MAX_EPHEMERIS_LINES} lines).`);
  const lines = raw.map((l) => l.trim());
  if (!lines.some((l) => /^CCSDS_OEM_VERS\s*=/.test(l))) throw new Error('This does not look like a CCSDS OEM file (the line CCSDS_OEM_VERS = ... is missing).');
  const header = keyValues(lines.slice(0, Math.max(0, lines.indexOf('META_START'))));
  const segments = []; let i = 0;
  while (i < lines.length) {
    if (lines[i] !== 'META_START') { i++; continue; }
    const stop = lines.indexOf('META_STOP', i); if (stop < 0) throw new Error('The OEM file has a META_START without META_STOP.');
    const meta = keyValues(lines.slice(i + 1, stop).filter((l) => !l.startsWith('COMMENT')));
    for (const k of ['OBJECT_NAME', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM']) if (!meta[k]) throw new Error(`The OEM metadata has no ${k}.`);
    const ts = normaliseTimeSystem(meta.TIME_SYSTEM);
    const seg = { object: meta.OBJECT_NAME, id: meta.OBJECT_ID ?? null, center: meta.CENTER_NAME.toUpperCase(), frame: meta.REF_FRAME, timeSystem: ts, interpolation: meta.INTERPOLATION ?? null, samples: [], covariance: [] };
    let prev = -Infinity; i = stop + 1;
    for (; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln || ln.startsWith('COMMENT')) continue;
      if (ln === 'META_START') break;
      if (ln === 'COVARIANCE_START') {
        i++; let cur = null;
        for (; i < lines.length && lines[i] !== 'COVARIANCE_STOP'; i++) {
          const c = lines[i]; if (!c || c.startsWith('COMMENT')) continue;
          const kv = /^([A-Z_]+)\s*=\s*(.*)$/.exec(c);
          if (kv) { if (kv[1] === 'EPOCH') { const t = parseTime(kv[2]); if (t == null) throw new Error(`Line ${i + 1}: unreadable covariance EPOCH.`); cur = { t: fileTimeToEpoch(t, ts), frame: null, cov: [] }; seg.covariance.push(cur); } else if (kv[1] === 'COV_REF_FRAME' && cur) cur.frame = kv[2]; continue; }
          if (!cur) throw new Error(`Line ${i + 1}: covariance values before an EPOCH line.`);
          const vals = c.split(/\s+/).map(num); if (vals.some((x) => x == null)) throw new Error(`Line ${i + 1}: unreadable covariance row.`);
          cur.cov.push(...vals);
        }
        for (const c of seg.covariance) if (c.cov.length !== 21) throw new Error('Each covariance block needs the 21 numbers of a 6x6 lower triangle.');
        continue;
      }
      if (/=/.test(ln)) continue;
      const p = ln.split(/\s+/);
      if (p.length !== 7 && p.length !== 10) throw new Error(`Line ${i + 1} is not an ephemeris line (time x y z vx vy vz [ax ay az]).`);
      const t0 = parseTime(p[0]); const v = p.slice(1).map(num);
      if (t0 == null || v.some((x) => x == null)) throw new Error(`Line ${i + 1} could not be read: ${ln.slice(0, 60)}`);
      const t = fileTimeToEpoch(t0, ts);
      if (t <= prev) throw new Error(`The times must increase (line ${i + 1}).`);
      prev = t; const s = { t, r: [v[0] * 1000, v[1] * 1000, v[2] * 1000], v: [v[3] * 1000, v[4] * 1000, v[5] * 1000] };
      if (v.length === 9) s.a = [v[6] * 1000, v[7] * 1000, v[8] * 1000];
      seg.samples.push(s);
    }
    if (seg.samples.length < 2) throw new Error('Each ephemeris segment needs at least two lines of data.');
    segments.push(seg);
  }
  return ephemerisResult('oem', segments, { originator: header.ORIGINATOR });
}

// a tiny XML reader for NDM files: enough for flat elements inside known containers (no DTDs, no entities beyond the five standard ones)
const xmlUnesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const xmlBlocks = (xml, tag) => { const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'); const out = []; let m; while ((m = re.exec(xml))) out.push(m[1]); return out; };
const xmlFields = (xml) => { const kv = {}; const re = /<([A-Za-z_][\w]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g; let m; while ((m = re.exec(xml))) if (!(m[1] in kv)) kv[m[1]] = xmlUnesc(m[2].trim()); return kv; };

/** Parse an OEM in NDM/XML form. Same result as parseOEM. */
export function parseOEMXml(text) {
  const xml = String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<oem[\s>]/.test(xml)) throw new Error('This is not an OEM XML file (no <oem> element).');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML files with a DOCTYPE are not read.');
  const header = xmlFields(xmlBlocks(xml, 'header')[0] ?? '');
  const ax = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'];
  const covNames = []; for (let row = 0; row < 6; row++) for (let col = 0; col <= row; col++) covNames.push(`C${ax[row]}_${ax[col]}`);
  const segments = xmlBlocks(xml, 'segment').map((sx) => {
    const meta = xmlFields(xmlBlocks(sx, 'metadata')[0] ?? '');
    for (const k of ['OBJECT_NAME', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM']) if (!meta[k]) throw new Error(`The OEM metadata has no ${k}.`);
    const ts = normaliseTimeSystem(meta.TIME_SYSTEM);
    const seg = { object: meta.OBJECT_NAME, id: meta.OBJECT_ID ?? null, center: meta.CENTER_NAME.toUpperCase(), frame: meta.REF_FRAME, timeSystem: ts, interpolation: meta.INTERPOLATION ?? null, samples: [], covariance: [] };
    let prev = -Infinity;
    for (const sv of xmlBlocks(sx, 'stateVector')) {
      const f = xmlFields(sv); const t0 = parseTime(f.EPOCH ?? ''); const v = ax.map((k) => num(f[k]));
      if (t0 == null || v.some((x) => x == null)) throw new Error(`A stateVector could not be read (EPOCH ${f.EPOCH ?? '?'}).`);
      const t = fileTimeToEpoch(t0, ts); if (t <= prev) throw new Error(`The times must increase (at ${f.EPOCH}).`); prev = t;
      const s = { t, r: v.slice(0, 3).map((x) => x * 1000), v: v.slice(3).map((x) => x * 1000) };
      if (f.X_DDOT != null) s.a = ['X_DDOT', 'Y_DDOT', 'Z_DDOT'].map((k) => (num(f[k]) ?? 0) * 1000);
      seg.samples.push(s);
    }
    for (const cx of xmlBlocks(sx, 'covarianceMatrix')) {
      const f = xmlFields(cx); const t0 = parseTime(f.EPOCH ?? ''); const cov = covNames.map((k) => num(f[k]));
      if (t0 == null || cov.some((x) => x == null)) throw new Error('A covarianceMatrix is incomplete (it needs EPOCH and the 21 lower-triangle terms).');
      seg.covariance.push({ t: fileTimeToEpoch(t0, ts), frame: f.COV_REF_FRAME ?? null, cov });
    }
    if (seg.samples.length < 2) throw new Error('Each ephemeris segment needs at least two state vectors.');
    return seg;
  });
  return ephemerisResult('oem-xml', segments, { originator: header.ORIGINATOR });
}

/** Parse SPICE-style text: "ET x y z vx vy vz" lines (ET = TDB seconds past J2000, km, km/s), '#' or ';' comments. */
export function parseSpiceText(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  if (lines.length > MAX_EPHEMERIS_LINES) throw new Error(`The ephemeris is too long (more than ${MAX_EPHEMERIS_LINES} lines).`);
  const samples = []; let prev = -Infinity;
  lines.forEach((ln, i) => {
    const s = ln.trim(); if (!s || s.startsWith('#') || s.startsWith(';')) return;
    const p = s.split(/[\s,]+/).map(num);
    if (p.length < 7 || p.slice(0, 7).some((x) => x == null)) throw new Error(`Line ${i + 1} is not "ET x y z vx vy vz": ${s.slice(0, 60)}`);
    if (p[0] <= prev) throw new Error(`The times must increase (line ${i + 1}).`);
    prev = p[0]; samples.push({ t: fileTimeToEpoch(p[0], 'TDB'), r: [p[1] * 1000, p[2] * 1000, p[3] * 1000], v: [p[4] * 1000, p[5] * 1000, p[6] * 1000] });
  });
  if (samples.length < 2) throw new Error('The ephemeris needs at least two lines of data.');
  return ephemerisResult('spice-text', [{ object: 'object', id: null, center: 'EARTH', frame: 'EME2000', timeSystem: 'TDB', samples, covariance: [] }]);
}

/** Read any text form (decided by the content): OEM KVN, OEM XML or SPICE text. Binary SPK kernels go through parseEphemerisBytes. */
export function parseEphemeris(text) {
  const s = String(text ?? '');
  if (/<oem[\s>]/.test(s.slice(0, 4000))) return parseOEMXml(s);
  return /CCSDS_OEM_VERS/.test(s) ? parseOEM(s) : parseSpiceText(s);
}

/**
 * CCSDS OPM (one state vector, or Keplerian elements when the state vector is absent): returns {epoch (mission-epoch s), r [m], v [m/s],
 * center, frame, object, elements?, mass?}. Used to start a flight from a published orbit state.
 */
export function parseOPM(text) {
  const s = String(text ?? '');
  let kv;
  if (/<opm[\s>]/.test(s)) { if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new Error('XML files with a DOCTYPE are not read.'); kv = xmlFields(s.replace(/<!--[\s\S]*?-->/g, '')); }
  else {
    const lines = s.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('COMMENT'));
    if (!lines.some((l) => /^CCSDS_OPM_VERS\s*=/.test(l))) throw new Error('This does not look like a CCSDS OPM file (the line CCSDS_OPM_VERS = ... is missing).');
    kv = keyValues(lines);
  }
  const ts = normaliseTimeSystem(kv.TIME_SYSTEM ?? 'UTC');
  const t = parseTime(kv.EPOCH ?? ''); if (t == null) throw new Error('The OPM has no readable EPOCH.');
  const center = (kv.CENTER_NAME ?? 'EARTH').toUpperCase();
  const sv = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => numU(kv[k]));
  let r, v, elements = null;
  if (sv.every((x) => x != null)) { r = sv.slice(0, 3); v = sv.slice(3); }
  else if (numU(kv.SEMI_MAJOR_AXIS) != null) {
    const gm = numU(kv.GM) ?? GM_KM3S2[center]; if (!gm) throw new Error(`The OPM gives elements but no GM, and ${center} has no default GM here.`);
    elements = { a: numU(kv.SEMI_MAJOR_AXIS), e: numU(kv.ECCENTRICITY), i: numU(kv.INCLINATION), raan: numU(kv.RA_OF_ASC_NODE), argp: numU(kv.ARG_OF_PERICENTER), nu: numU(kv.TRUE_ANOMALY), M: numU(kv.MEAN_ANOMALY) };
    if ([elements.e, elements.i, elements.raan, elements.argp].some((x) => x == null) || (elements.nu == null && elements.M == null)) throw new Error('The OPM Keplerian elements are incomplete.');
    ({ r, v } = elementsToState(elements, gm));
  } else throw new Error('The OPM state vector (X, Y, Z, X_DOT, Y_DOT, Z_DOT) is incomplete and there are no Keplerian elements.');
  return { kind: 'opm', object: kv.OBJECT_NAME ?? 'object', center, frame: kv.REF_FRAME ?? 'EME2000', timeSystem: ts, epoch: fileTimeToEpoch(t, ts), r: r.map((x) => x * 1000), v: v.map((x) => x * 1000), elements, mass: numU(kv.MASS) };
}
export function exportOPM(rec, state, { originator = 'ASTRA LAB', timeSystem = 'UTC', elements = true } = {}) {
  const body = rec?.environment?.body ?? 'earth', center = CENTER[body] ?? 'EARTH', ts = normaliseTimeSystem(timeSystem);
  const L = ['CCSDS_OPM_VERS = 2.0', `CREATION_DATE = ${nowIso()}`, `ORIGINATOR = ${originator}`, '',
    `OBJECT_NAME = ${objName({ vehicleName: rec?.vehicleName })}`, `OBJECT_ID = ${String(rec?.id ?? 'ASTRA-1').slice(0, 40)}`, `CENTER_NAME = ${center}`, 'REF_FRAME = EME2000', `TIME_SYSTEM = ${ts}`, '',
    `EPOCH = ${isoIn(state.epoch, ts)}`, `X = ${fix(state.r[0] / 1000)} [km]`, `Y = ${fix(state.r[1] / 1000)} [km]`, `Z = ${fix(state.r[2] / 1000)} [km]`,
    `X_DOT = ${fix(state.v[0] / 1000, 9)} [km/s]`, `Y_DOT = ${fix(state.v[1] / 1000, 9)} [km/s]`, `Z_DOT = ${fix(state.v[2] / 1000, 9)} [km/s]`];
  const gm = GM_KM3S2[center];
  if (elements && gm) {
    const el = stateToElements(state.r.map((x) => x / 1000), state.v.map((x) => x / 1000), gm);
    if (el.a > 0 && el.e < 1) L.push('', `SEMI_MAJOR_AXIS = ${fix(el.a)} [km]`, `ECCENTRICITY = ${fix(el.e, 9)}`, `INCLINATION = ${fix(el.i, 6)} [deg]`, `RA_OF_ASC_NODE = ${fix(el.raan, 6)} [deg]`, `ARG_OF_PERICENTER = ${fix(el.argp, 6)} [deg]`, `TRUE_ANOMALY = ${fix(el.nu, 6)} [deg]`, `GM = ${gm} [km**3/s**2]`);
  }
  if (Number.isFinite(state.mass)) L.push('', `MASS = ${fix(state.mass, 3)} [kg]`);
  return `${L.join('\n')}\n`;
}

/**
 * CCSDS OMM (mean elements, the format CelesTrak and Space-Track publish): KVN, XML or JSON (one object or the first of an array).
 * Returns the same shape as parseOPM plus {meanElements, noradId, warning}. The state is the osculating two-body state built from the
 * mean elements: SGP4 mean elements differ from osculating ones (tens of km for low orbits) and TEME is read as EME2000, so this is a
 * starting point for a flight, not a precise orbit determination.
 */
export function parseOMM(text) {
  const s = String(text ?? '').trim();
  let kv;
  if (s.startsWith('{') || s.startsWith('[')) { let j; try { j = JSON.parse(s); } catch { throw new Error('The OMM JSON could not be read.'); } kv = Array.isArray(j) ? j[0] : j; if (!kv || typeof kv !== 'object') throw new Error('The OMM JSON is empty.'); kv = Object.fromEntries(Object.entries(kv).map(([k, v]) => [k, String(v)])); }
  else if (/<omm[\s>]/.test(s)) { if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new Error('XML files with a DOCTYPE are not read.'); kv = xmlFields(s.replace(/<!--[\s\S]*?-->/g, '')); }
  else { const lines = s.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('COMMENT')); if (!lines.some((l) => /^CCSDS_OMM_VERS\s*=/.test(l))) throw new Error('This does not look like a CCSDS OMM (CCSDS_OMM_VERS is missing).'); kv = keyValues(lines); }
  const ts = normaliseTimeSystem(kv.TIME_SYSTEM ?? 'UTC');
  const t = parseTime(String(kv.EPOCH ?? '').replace(/(\.\d{3})\d+/, '$1')); if (t == null) throw new Error('The OMM has no readable EPOCH.');
  const center = (kv.CENTER_NAME ?? 'EARTH').toUpperCase(), gm = numU(kv.GM) ?? GM_KM3S2[center];
  if (!gm) throw new Error(`No GM is known for ${center}.`);
  const nRevDay = numU(kv.MEAN_MOTION); let a = numU(kv.SEMI_MAJOR_AXIS);
  if (a == null && nRevDay != null) { const n = nRevDay * 2 * Math.PI / 86400; a = Math.cbrt(gm / (n * n)); }
  const el = { a, e: numU(kv.ECCENTRICITY), i: numU(kv.INCLINATION), raan: numU(kv.RA_OF_ASC_NODE), argp: numU(kv.ARG_OF_PERICENTER), M: numU(kv.MEAN_ANOMALY) };
  if (Object.values(el).some((x) => x == null)) throw new Error('The OMM mean elements are incomplete (MEAN_MOTION or SEMI_MAJOR_AXIS, ECCENTRICITY, INCLINATION, RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY).');
  const { r, v } = elementsToState(el, gm);
  return { kind: 'omm', object: kv.OBJECT_NAME ?? 'object', noradId: kv.NORAD_CAT_ID ?? null, center, frame: kv.REF_FRAME ?? 'TEME', timeSystem: ts, epoch: fileTimeToEpoch(t, ts), r: r.map((x) => x * 1000), v: v.map((x) => x * 1000), meanElements: el,
    warning: 'Built from mean (SGP4) elements with two-body motion and TEME read as EME2000: expect an error of up to tens of km against SGP4.' };
}

/** Read any single-state orbit file: OPM or OMM (KVN, XML, JSON). */
export function parseOrbitState(text) {
  const s = String(text ?? '');
  if (/CCSDS_OMM_VERS|<omm[\s>]|"MEAN_MOTION"/.test(s)) return parseOMM(s);
  return parseOPM(s);
}

/** Ephemeris from bytes: a binary SPK kernel (via spk.js) or any of the text forms. opts for SPK: {target, center} NAIF ids. */
export async function parseEphemerisBytes(bytes, opts = {}) {
  const { isSpk, readSpk, sampleSpk, NAIF_BODY } = await import('./spk.js');
  if (isSpk(bytes)) {
    const spk = readSpk(bytes), smp = sampleSpk(spk, opts);
    const name = (id) => (NAIF_BODY[id] ?? `NAIF ${id}`);
    const samples = smp.samples.map((s) => ({ ...s, t: fileTimeToEpoch(s.t, 'TDB') }));
    return ephemerisResult('spk', [{ object: name(smp.target), id: String(smp.target), center: name(smp.center).replace(' BARYCENTER', '_BARYCENTER'), frame: 'EME2000', timeSystem: 'TDB', samples, covariance: [] }]);
  }
  return parseEphemeris(new TextDecoder().decode(bytes));
}
/** Binary SPK (type 13) of a flight. */
export async function exportSpk(rec, tel, { maxSamples = 5000, target = -999 } = {}) {
  const { writeSpk13, NAIF_ID } = await import('./spk.js');
  const S = samplesOf(tel, { maxSamples }); if (S.length < 2) throw new Error('This flight has no recorded path to export.');
  const epoch = rec?.environment?.epoch ?? 0, body = rec?.environment?.body ?? 'earth';
  return writeSpk13(S.map((s) => ({ ...s, t: epochToFileTime(epoch + s.t, 'TDB') })), {
    target, center: NAIF_ID[body] ?? 399, frame: 1, name: objName(rec).slice(0, 40),
    comment: `ASTRA LAB trajectory of ${objName(rec)}\nrun ${rec?.id ?? '-'}\nNAIF id ${target} (not registered), centre ${NAIF_ID[body] ?? 399}, frame J2000 (simplified: planet spin axis = z)\nWritten ${nowIso()} UTC`,
  });
}

/** Hermite-interpolated position/velocity of an ephemeris at time t (s); null outside its span. */
export function stateAt(samples, t) {
  const n = samples.length; if (!n || t < samples[0].t || t > samples[n - 1].t) return null;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], h = b.t - a.t; if (h <= 0) return { r: a.r, v: a.v };
  const u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const r = [0, 1, 2].map((k) => h00 * a.r[k] + h10 * h * a.v[k] + h01 * b.r[k] + h11 * h * b.v[k]);
  const d00 = (6 * u2 - 6 * u) / h, d10 = 3 * u2 - 4 * u + 1, d01 = (-6 * u2 + 6 * u) / h, d11 = 3 * u2 - 2 * u;
  const v = [0, 1, 2].map((k) => d00 * a.r[k] + d10 * a.v[k] + d01 * b.r[k] + d11 * b.v[k]);
  return { r, v };
}

/**
 * Compare a flight with an imported ephemeris over the time both cover. `flight` = samplesOf(tel) (t = flight seconds), `epoch` = the flight's
 * epoch (s after J2000), `ref` = parseEphemeris(...). Returns {n, spanS, maxPosErrM, rmsPosErrM, maxVelErrMs, atMaxPosS, rows:[{t, posErr, velErr}]} or null when the spans do not overlap.
 */
export function compareEphemeris(flight, epoch, ref, { rows = 40 } = {}) {
  const pts = [];
  for (const s of flight) { const st = stateAt(ref.samples, epoch + s.t); if (!st) continue; pts.push({ t: s.t, posErr: Math.hypot(s.r[0] - st.r[0], s.r[1] - st.r[1], s.r[2] - st.r[2]), velErr: Math.hypot(s.v[0] - st.v[0], s.v[1] - st.v[1], s.v[2] - st.v[2]) }); }
  if (pts.length < 2) return null;
  let mx = pts[0], ss = 0, mv = 0; for (const p of pts) { if (p.posErr > mx.posErr) mx = p; ss += p.posErr * p.posErr; mv = Math.max(mv, p.velErr); }
  const stride = Math.max(1, Math.floor(pts.length / rows));
  return { n: pts.length, spanS: pts[pts.length - 1].t - pts[0].t, from: pts[0].t, to: pts[pts.length - 1].t, maxPosErrM: mx.posErr, atMaxPosS: mx.t, rmsPosErrM: Math.sqrt(ss / pts.length), maxVelErrMs: mv, rows: pts.filter((_, i) => i % stride === 0) };
}
