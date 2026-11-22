// Time scales (UTC/TAI/TT/TDB/GPS/UT1) and the bundled JPL DE440 ephemeris.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../physics/time.js';
import { ephemerisState, ephemerisCovers, EPHEMERIS_INFO } from '../physics/ephemeris.js';
import { bodyStateRelParent, bodyStateAbs, rotationAngle, setEphemerisModel, getEphemerisModel, ephemerisSource, sunDirection, toRoot } from '../physics/bodies.js';
import { epochToDate as mdEpochToDate, dateToEpoch as mdDateToEpoch } from '../physics/mission-design.js';

const DEG = Math.PI / 180, DAY = 86400;
const FIX = JSON.parse(readFileSync(new URL('./fixtures/de440-checkpoints.json', import.meta.url)));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const utcCount = (iso) => (Date.parse(iso) - T.J2000_UNIX_MS) / 1000;

// ---------- time scales ----------
test('TAI-UTC follows the IERS leap-second table: 10 s in 1972, 32 s in 2000, 37 s since 2017', () => {
  assert.equal(T.taiMinusUtc(utcCount('1972-01-01T00:00:00Z')), 10);
  assert.equal(T.taiMinusUtc(utcCount('1972-06-30T23:59:59Z')), 10);
  assert.equal(T.taiMinusUtc(utcCount('1972-07-01T00:00:00Z')), 11);
  assert.equal(T.taiMinusUtc(utcCount('2000-01-01T12:00:00Z')), 32);
  assert.equal(T.taiMinusUtc(utcCount('2016-12-31T23:59:59Z')), 36);
  assert.equal(T.taiMinusUtc(utcCount('2017-01-01T00:00:00Z')), 37);
  assert.equal(T.taiMinusUtc(utcCount('2026-11-13T00:00:00Z')), 37);
  assert.equal(T.leapSecondTable().length, 28);
});

test('before 1972 UTC used rubber seconds: TAI-UTC was 7.56 s at the Apollo 11 launch (USNO tai-utc.dat)', () => {
  const d = T.taiMinusUtc(utcCount('1969-07-16T13:32:00Z'));
  assert.ok(Math.abs(d - (4.21317 + (40418.5639 - 39126) * 0.002592)) < 1e-4, String(d));
});

test('J2000.0: 2000-01-01 12:00:00 UTC is 64.184 s before J2000.0 TDB; TT = TAI + 32.184 s; GPS = TAI - 19 s', () => {
  const e = T.utcToEpoch('2000-01-01T12:00:00Z');
  assert.ok(Math.abs(e - 64.184) < 2e-4, String(e));   // 32 leap s + 32.184 s, TDB-TT is -0.1 ms
  assert.ok(Math.abs(T.convertTime(100, 'TAI', 'TT') - 132.184) < 1e-12);
  assert.ok(Math.abs(T.convertTime(100, 'TAI', 'GPS') - 81) < 1e-12);
  assert.ok(Math.abs(T.convertTime(T.utcToEpoch('2026-01-01T00:00:00Z'), 'TDB', 'GPS') - utcCount('2026-01-01T00:00:00Z') - 18) < 1e-6);
});

test('TDB-TT stays within 1.7 ms and has a yearly period', () => {
  let lo = 1, hi = -1;
  for (let d = 0; d < 366; d += 2) { const x = T.tdbMinusTt(d * DAY); lo = Math.min(lo, x); hi = Math.max(hi, x); }
  assert.ok(hi < 0.0017 && lo > -0.0017 && hi > 0.0015 && lo < -0.0015, `${lo} ${hi}`);
});

test('every scale converts to every other and back to within a microsecond (1965-2090)', () => {
  for (const iso of ['1965-03-01T00:00:00Z', '1969-07-16T13:32:00Z', '1999-12-31T23:00:00Z', '2026-11-13T14:00:00Z', '2090-06-01T00:00:00Z']) {
    const t = T.utcToEpoch(iso);
    for (const s of T.SCALES) assert.ok(Math.abs(T.convertTime(T.convertTime(t, 'TDB', s), s, 'TDB') - t) < 1e-6, `${iso} ${s}`);
    assert.equal(T.epochToUtcIso(t), new Date(iso).toISOString().slice(0, 23));
  }
});

test('a leap second (2016-12-31T23:59:60) is its own second: parsed, printed and counted', () => {
  const a = T.utcToEpoch('2016-12-31T23:59:59.5Z'), b = T.utcToEpoch('2016-12-31T23:59:60.5Z'), c = T.utcToEpoch('2017-01-01T00:00:00.5Z');
  assert.ok(Math.abs(b - a - 1) < 1e-6 && Math.abs(c - b - 1) < 1e-6);
  assert.equal(T.epochToUtcIso(a), '2016-12-31T23:59:59.500');
  assert.equal(T.epochToUtcIso(b), '2016-12-31T23:59:60.500');
  assert.equal(T.epochToUtcIso(c), '2017-01-01T00:00:00.500');
});

test('UT1 from the DeltaT table stays within 0.9 s of UTC from 1972 on (the IERS bound on DUT1); setDut1 overrides it', () => {
  for (let y = 1972; y <= 2026; y += 0.25) {
    const u = (y - 2000) * 365.25 * DAY, t = T.convertTime(u, 'UTC', 'TDB');
    assert.ok(Math.abs(T.convertTime(t, 'TDB', 'UT1') - u) < 0.9, String(y));
  }
  const t = T.utcToEpoch('2026-11-13T00:00:00Z');
  T.setDut1(0.0421);
  try { assert.ok(Math.abs(T.convertTime(t, 'TDB', 'UT1') - (utcCount('2026-11-13T00:00:00Z') + 0.0421)) < 1e-9); } finally { T.setDut1(null); }
});

test('Earth rotation angle: 280.46 deg at J2000.0 UT1, one turn per sidereal day; GMST matches the IAU 2006 value', () => {
  const t0 = T.convertTime(0, 'UT1', 'TDB');
  assert.ok(Math.abs(T.earthRotationAngle(t0) / DEG - 280.46061837504) < 1e-7);
  const sidereal = 86400 / 1.00273781191135448;
  const d = (T.earthRotationAngle(t0 + sidereal) - T.earthRotationAngle(t0) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(d < 1e-6 || 2 * Math.PI - d < 1e-6);   // DeltaT drifts by ~1 ms/day
  // GMST at 2026-11-13 00:00 UT1: ERA 51.7815 deg + accumulated precession 0.344 deg (IAU 2006 polynomial)
  const g = T.gmst(T.convertTime(utcCount('2026-11-13T00:00:00Z'), 'UT1', 'TDB')) / DEG;
  assert.ok(Math.abs(g - 52.1258) < 0.002, String(g));
});

test('mission-design dates use the UTC clock: epoch 0 is 2000-01-01 11:58:55.816 UTC', () => {
  assert.equal(mdEpochToDate(0).toISOString(), '2000-01-01T11:58:55.816Z');
  assert.ok(Math.abs(mdDateToEpoch('2026-11-13T14:00:00Z') - T.utcToEpoch('2026-11-13T14:00:00Z')) < 1e-9);
});

// ---------- ephemeris ----------
test('the bundled DE440 fit reproduces the JPL kernel: Moon < 60 m, Earth < 150 m, Mars < 1 km, Venus/Jupiter/Saturn < 5 km', () => {
  const tol = { moon: 60, earth: 150, emb: 150, mars: 1000, venus: 5000, jupiter: 5000, saturn: 5000 };
  const vtol = { moon: 0.005, earth: 0.005, emb: 0.005, mars: 0.01, venus: 0.02, jupiter: 0.02, saturn: 0.02 };
  assert.ok(FIX.points.length >= 40);
  for (const p of FIX.points) for (const k of Object.keys(tol)) {
    const s = ephemerisState(k, p.tdb);
    assert.ok(dist(s.r, p[k].r) < tol[k], `${k} at ${p.tdb}: ${dist(s.r, p[k].r)} m`);
    assert.ok(dist(s.v, p[k].v) < vtol[k], `${k} velocity at ${p.tdb}: ${dist(s.v, p[k].v)} m/s`);
  }
});

test('the ephemeris covers 1950-2100 and returns null outside it', () => {
  assert.ok(ephemerisCovers(T.utcToEpoch('1950-06-01')) && ephemerisCovers(T.utcToEpoch('2099-06-01')));
  assert.equal(ephemerisState('moon', T.utcToEpoch('1949-06-01')), null);
  assert.equal(ephemerisState('mars', T.utcToEpoch('2100-06-01')), null);
  assert.equal(ephemerisState('pluto', 0), null);
  assert.match(EPHEMERIS_INFO.source, /DE440/);
});

test('ephemeris velocity is the derivative of position (also across interval boundaries)', () => {
  for (const k of ['moon', 'earth', 'mars']) for (const t of [0, 16 * DAY * 3 + 0.5, T.utcToEpoch('1969-07-20T20:17:00Z')]) {
    const h = 30, a = ephemerisState(k, t - h), b = ephemerisState(k, t + h), s = ephemerisState(k, t);
    const fd = a.r.map((x, i) => (b.r[i] - x) / (2 * h));
    assert.ok(dist(fd, s.v) < 1e-3, `${k} ${t}: ${dist(fd, s.v)}`);
  }
});

test('the Moon at the Apollo 11 launch is the DE440 Moon; the old mean Kepler orbit had drifted far away from it by 2026', () => {
  const p = FIX.points.find((q) => Math.abs(q.tdb / DAY + 2451545 - 2440419.0639) < 1e-6);   // JD 2440419.0639 TDB = 1969-07-16 13:32 UTC
  assert.ok(Math.abs(p.tdb - T.utcToEpoch('1969-07-16T13:32:00Z')) < 120);
  const de = toRoot('earth', bodyStateRelParent('moon', p.tdb).r);
  assert.ok(dist(de, p.moon.r) < 60, String(dist(de, p.moon.r)));
  const t26 = T.utcToEpoch('2026-11-13T00:00:00Z'), now = bodyStateRelParent('moon', t26).r;
  setEphemerisModel('kepler');
  try { assert.ok(dist(bodyStateRelParent('moon', t26).r, now) > 1e8); } finally { setEphemerisModel('de440'); }   // > 100,000 km
});

test('bodies.js uses DE440 by default inside 1950-2100 and Kepler elements outside or on request', () => {
  assert.equal(getEphemerisModel(), 'de440');
  assert.equal(ephemerisSource('moon', 0), 'de440');
  assert.equal(ephemerisSource('earth', 0), 'de440');
  assert.equal(ephemerisSource('mars', 0), 'de440');
  assert.equal(ephemerisSource('sun', 0), 'fixed');
  assert.equal(ephemerisSource('moon', T.utcToEpoch('2150-01-01')), 'kepler');
  // the Moon from bodies.js (Earth equatorial axes) is the DE440 geocentric Moon (ecliptic) rotated
  const t = 1.23e8, a = toRoot('earth', bodyStateRelParent('moon', t).r), b = ephemerisState('moon', t).r;
  assert.ok(dist(a, b) < 1e-3);
  // heliocentric Earth: about 1 AU, closest in early January
  const jan = Math.hypot(...bodyStateAbs('earth', T.utcToEpoch('2026-01-03T17:00:00Z')).r), jul = Math.hypot(...bodyStateAbs('earth', T.utcToEpoch('2026-07-06T17:00:00Z')).r);
  assert.ok(Math.abs(jan / 1.471e11 - 1) < 2e-4 && Math.abs(jul / 1.521e11 - 1) < 2e-4, `${jan} ${jul}`);
});

test('Earth rotation in bodies.js is the IAU ERA of UT1: noon sun over Greenwich within the equation of time', () => {
  const t = T.utcToEpoch('2026-11-13T00:00:00Z');
  assert.ok(Math.abs(rotationAngle('earth', t) - T.earthRotationAngle(t)) < 1e-12);
  // on 2026-11-03 the equation of time is +16.4 min, so the Sun crosses Greenwich at about 11:43:35 UTC
  const s = sunDirection('earth', T.utcToEpoch('2026-11-03T11:43:35Z')), th = rotationAngle('earth', T.utcToEpoch('2026-11-03T11:43:35Z'));
  const hourAngle = Math.atan2(s[1], s[0]) - th, ha = ((hourAngle / DEG) % 360 + 540) % 360 - 180;
  assert.ok(Math.abs(ha) < 0.25, String(ha));   // 0.25 deg = 1 min of time
});

test('Mars opposition of 2025-01-16 is reproduced: Sun, Earth and Mars in line within a day', () => {
  let best = { ang: 9, d: 0 };
  for (let d = 10; d <= 22; d += 0.25) {
    const t = T.utcToEpoch(`2025-01-${String(Math.floor(d)).padStart(2, '0')}T00:00:00Z`) + (d % 1) * DAY;
    const e = bodyStateAbs('earth', t).r, m = bodyStateAbs('mars', t).r;
    const ang = Math.abs(Math.atan2(e[1], e[0]) - Math.atan2(m[1], m[0])) / DEG;
    if (ang < best.ang) best = { ang, d };
  }
  assert.ok(Math.abs(best.d - 16.1) < 1, JSON.stringify(best));
});
