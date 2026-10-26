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
//  * Binary SPICE kernels (SPK .bsp) are not read or written; only the text form above is.

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const MAX_EPHEMERIS_LINES = 200000;

export const isoOf = (epochSeconds) => new Date(J2000_MS + epochSeconds * 1000).toISOString().replace('Z', '').replace(/\.000$/, '');
/** Seconds after J2000 from an ISO-like time ("2026-10-24T12:00:00.000", "2026-297T..." day-of-year form too); null when it is not a time. */
export function parseTime(text) {
  const s = String(text).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(s);
  if (m) return (Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) + parseFloat(m[6]) * 1000 - J2000_MS) / 1000;
  m = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(s);
  if (m) return (Date.UTC(+m[1], 0, +m[2], +m[3], +m[4], 0) + parseFloat(m[5]) * 1000 - J2000_MS) / 1000;
  return null;
}

const CENTER = { earth: 'EARTH', moon: 'MOON', mars: 'MARS', sun: 'SUN' };
const fmt = (x) => (Number.isFinite(x) ? x.toExponential(9).replace(/e\+?(-?)0*(\d)/, 'e$1$2') : 'nan');
const fix = (x, d = 6) => (Number.isFinite(x) ? x.toFixed(d) : 'nan');

/** Samples of a flight: [{t, r:[m], v:[m/s]}] taken from a telemetry recorder, at most `maxSamples`, always including the last one. */
export function samplesOf(tel, { maxSamples = 5000, from = 0 } = {}) {
  const n = tel?.count ?? 0; if (!n) return [];
  const T = tel.column('t'), X = tel.column('x'), Y = tel.column('y'), Z = tel.column('z'), VX = tel.column('vx'), VY = tel.column('vy'), VZ = tel.column('vz');
  const stride = Math.max(1, Math.ceil(n / maxSamples)), out = [];
  for (let i = from; i < n; i += stride) out.push({ t: T[i], r: [X[i], Y[i], Z[i]], v: [VX[i], VY[i], VZ[i]] });
  const last = n - 1; if ((last - from) % stride !== 0) out.push({ t: T[last], r: [X[last], Y[last], Z[last]], v: [VX[last], VY[last], VZ[last]] });
  return out;
}

/**
 * CCSDS OEM 2.0 text of a flight. rec = the run record (name, environment.epoch, environment.body), tel = its telemetry recorder.
 * The ephemeris lists the vehicle in the inertial frame of the planet it started at; flights that change the central body (a Moon trip)
 * are written in the Earth frame throughout, which is how the simulator stores the state.
 */
export function exportOEM(rec, tel, { originator = 'ASTRA LAB', maxSamples = 5000 } = {}) {
  const S = samplesOf(tel, { maxSamples }); if (S.length < 2) throw new Error('This flight has no recorded path to export.');
  const epoch = rec?.environment?.epoch ?? 0, body = rec?.environment?.body ?? 'earth';
  const name = String(rec?.vehicleName ?? rec?.vehicle?.name ?? rec?.name ?? 'ASTRA-LAB-VEHICLE').replace(/[^\w .-]/g, '_').slice(0, 60);
  const L = [];
  L.push('CCSDS_OEM_VERS = 2.0');
  L.push('COMMENT Written by ASTRA LAB. Positions in km, velocities in km/s, planet-centred inertial frame with z along the spin axis.');
  L.push('COMMENT The frame is a simplified EME2000 (no precession or nutation); the epoch is counted from 2000-01-01 12:00:00 and written as UTC.');
  L.push(`CREATION_DATE = ${new Date().toISOString().replace('Z', '').replace(/\.\d+$/, '')}`);
  L.push(`ORIGINATOR = ${originator}`);
  L.push('');
  L.push('META_START');
  L.push(`OBJECT_NAME = ${name}`);
  L.push(`OBJECT_ID = ${String(rec?.id ?? 'ASTRA-1').slice(0, 40)}`);
  L.push(`CENTER_NAME = ${CENTER[body] ?? 'EARTH'}`);
  L.push('REF_FRAME = EME2000');
  L.push('TIME_SYSTEM = UTC');
  L.push(`START_TIME = ${isoOf(epoch + S[0].t)}`);
  L.push(`STOP_TIME = ${isoOf(epoch + S[S.length - 1].t)}`);
  L.push('META_STOP');
  L.push('');
  for (const s of S) L.push(`${isoOf(epoch + s.t)} ${fix(s.r[0] / 1000)} ${fix(s.r[1] / 1000)} ${fix(s.r[2] / 1000)} ${fix(s.v[0] / 1000, 9)} ${fix(s.v[1] / 1000, 9)} ${fix(s.v[2] / 1000, 9)}`);
  return `${L.join('\n')}\n`;
}

/** SPICE-style text ephemeris: "ET x y z vx vy vz" per line with ET in seconds past J2000, km and km/s (MKSPK "text" input, 6 elements). */
export function exportSpiceText(rec, tel, { maxSamples = 5000 } = {}) {
  const S = samplesOf(tel, { maxSamples }); if (S.length < 2) throw new Error('This flight has no recorded path to export.');
  const epoch = rec?.environment?.epoch ?? 0;
  const L = ['# ASTRA LAB trajectory in SPICE text form: ET[s past J2000]  x y z [km]  vx vy vz [km/s]. Planet-centred inertial frame (simplified EME2000).'];
  for (const s of S) L.push(`${fix(epoch + s.t, 3)} ${fix(s.r[0] / 1000)} ${fix(s.r[1] / 1000)} ${fix(s.r[2] / 1000)} ${fix(s.v[0] / 1000, 9)} ${fix(s.v[1] / 1000, 9)} ${fix(s.v[2] / 1000, 9)}`);
  return `${L.join('\n')}\n`;
}

const num = (s) => { const x = Number(s); return Number.isFinite(x) ? x : null; };
function keyValues(lines) {
  const kv = {};
  for (const ln of lines) { const m = /^([A-Z_0-9]+)\s*=\s*(.*)$/.exec(ln.trim()); if (m) kv[m[1]] = m[2].trim(); }
  return kv;
}

/** Parse an OEM (KVN text). Returns {kind:'oem', object, center, frame, timeSystem, samples:[{t (s after J2000), r [m], v [m/s]}]}. Throws a plain Error on bad input. */
export function parseOEM(text) {
  const raw = String(text ?? '').replace(/\r/g, '').split('\n');
  if (raw.length > MAX_EPHEMERIS_LINES + 200) throw new Error(`The ephemeris is too long (more than ${MAX_EPHEMERIS_LINES} lines).`);
  const lines = raw.map((l) => l.trim()).filter((l) => l && !l.startsWith('COMMENT'));
  if (!lines.some((l) => /^CCSDS_OEM_VERS\s*=/.test(l))) throw new Error('This does not look like a CCSDS OEM file (the line CCSDS_OEM_VERS = ... is missing).');
  const meta = keyValues(lines.slice(0, lines.findIndex((l) => l === 'META_STOP') + 1 || lines.length));
  const mStop = lines.indexOf('META_STOP'); if (mStop < 0) throw new Error('The OEM file has no META_STOP line.');
  const samples = []; let prev = -Infinity;
  for (let i = mStop + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (/^(META_START|COVARIANCE_START|COVARIANCE_STOP)/.test(ln)) { if (/^META_START/.test(ln)) throw new Error('This reader handles one ephemeris segment per file.'); break; }
    const p = ln.split(/\s+/);
    if (p.length < 7) { if (/=/.test(ln)) continue; throw new Error(`Line ${i + 1} is not an ephemeris line (time x y z vx vy vz).`); }
    const t = parseTime(p[0]); const v = p.slice(1, 7).map(num);
    if (t == null || v.some((x) => x == null)) throw new Error(`Line ${i + 1} could not be read: ${ln.slice(0, 60)}`);
    if (t <= prev) throw new Error(`The times must increase (line ${i + 1}).`);
    prev = t; samples.push({ t, r: [v[0] * 1000, v[1] * 1000, v[2] * 1000], v: [v[3] * 1000, v[4] * 1000, v[5] * 1000] });
  }
  if (samples.length < 2) throw new Error('The ephemeris needs at least two lines of data.');
  return { kind: 'oem', object: meta.OBJECT_NAME ?? 'object', center: (meta.CENTER_NAME ?? 'EARTH').toUpperCase(), frame: meta.REF_FRAME ?? 'EME2000', timeSystem: meta.TIME_SYSTEM ?? 'UTC', samples };
}

/** Parse SPICE-style text: "ET x y z vx vy vz" lines (km, km/s), '#' or ';' comments. */
export function parseSpiceText(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  if (lines.length > MAX_EPHEMERIS_LINES) throw new Error(`The ephemeris is too long (more than ${MAX_EPHEMERIS_LINES} lines).`);
  const samples = []; let prev = -Infinity;
  lines.forEach((ln, i) => {
    const s = ln.trim(); if (!s || s.startsWith('#') || s.startsWith(';')) return;
    const p = s.split(/[\s,]+/).map(num);
    if (p.length < 7 || p.slice(0, 7).some((x) => x == null)) throw new Error(`Line ${i + 1} is not "ET x y z vx vy vz": ${s.slice(0, 60)}`);
    if (p[0] <= prev) throw new Error(`The times must increase (line ${i + 1}).`);
    prev = p[0]; samples.push({ t: p[0], r: [p[1] * 1000, p[2] * 1000, p[3] * 1000], v: [p[4] * 1000, p[5] * 1000, p[6] * 1000] });
  });
  if (samples.length < 2) throw new Error('The ephemeris needs at least two lines of data.');
  return { kind: 'spice-text', object: 'object', center: 'EARTH', frame: 'EME2000', timeSystem: 'UTC', samples };
}

/** Read either form (decided by the content). */
export function parseEphemeris(text) { return /CCSDS_OEM_VERS/.test(String(text)) ? parseOEM(text) : parseSpiceText(text); }

/**
 * CCSDS OPM (one state vector): returns {epoch (s after J2000), r [m], v [m/s], center, frame, object}. Used to start a flight from a published orbit state.
 */
export function parseOPM(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('COMMENT'));
  if (!lines.some((l) => /^CCSDS_OPM_VERS\s*=/.test(l))) throw new Error('This does not look like a CCSDS OPM file (the line CCSDS_OPM_VERS = ... is missing).');
  const kv = keyValues(lines);
  const t = parseTime(kv.EPOCH ?? ''); if (t == null) throw new Error('The OPM has no readable EPOCH.');
  const need = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => num((kv[k] ?? '').split(/\s+/)[0]));
  if (need.some((x) => x == null)) throw new Error('The OPM state vector (X, Y, Z, X_DOT, Y_DOT, Z_DOT) is incomplete.');
  return { kind: 'opm', object: kv.OBJECT_NAME ?? 'object', center: (kv.CENTER_NAME ?? 'EARTH').toUpperCase(), frame: kv.REF_FRAME ?? 'EME2000', epoch: t, r: need.slice(0, 3).map((x) => x * 1000), v: need.slice(3).map((x) => x * 1000) };
}
export function exportOPM(rec, state, { originator = 'ASTRA LAB' } = {}) {
  const body = rec?.environment?.body ?? 'earth';
  return ['CCSDS_OPM_VERS = 2.0', `CREATION_DATE = ${new Date().toISOString().replace('Z', '').replace(/\.\d+$/, '')}`, `ORIGINATOR = ${originator}`, '',
    `OBJECT_NAME = ${String(rec?.vehicleName ?? 'ASTRA-LAB-VEHICLE').replace(/[^\w .-]/g, '_').slice(0, 60)}`, `OBJECT_ID = ${String(rec?.id ?? 'ASTRA-1').slice(0, 40)}`, `CENTER_NAME = ${CENTER[body] ?? 'EARTH'}`, 'REF_FRAME = EME2000', 'TIME_SYSTEM = UTC',
    `EPOCH = ${isoOf(state.epoch)}`, `X = ${fix(state.r[0] / 1000)} [km]`, `Y = ${fix(state.r[1] / 1000)} [km]`, `Z = ${fix(state.r[2] / 1000)} [km]`,
    `X_DOT = ${fix(state.v[0] / 1000, 9)} [km/s]`, `Y_DOT = ${fix(state.v[1] / 1000, 9)} [km/s]`, `Z_DOT = ${fix(state.v[2] / 1000, 9)} [km/s]`, ''].join('\n');
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
