// Time scales: UTC, TAI, TT, TDB, GPS and UT1, offline, no dependencies.
//
// THE SIMULATOR EPOCH is TDB seconds after J2000.0 (2000-01-01 12:00:00 TDB = JD 2451545.0 TDB). It is the time argument of the
// JPL ephemeris (physics/ephemeris.js) and of every body position. Older projects stored the same number with no scale named;
// it is read unchanged, so a saved epoch of 0 is still J2000.0.
//
// Every scale here is counted as "seconds after 2000-01-01T12:00:00 on that scale's own clock". For UTC this count has no
// leap seconds inside it, like Unix time: utcSeconds = (Date.getTime() - Date.UTC(2000, 0, 1, 12)) / 1000. A leap second
// (23:59:60) therefore has no own UTC count; utcIsoToEpoch() and epochToUtcIso() handle it explicitly.
//
//   TAI - UTC   leap-second table of IERS Bulletin C (1972-2017: 10 s .. 37 s) and the 1961-1971 "rubber second" formulas of
//               USNO tai-utc.dat. Before 1961 UTC did not exist: UTC is taken as UT1. No leap second has been announced after
//               2017-01-01 as of this release; add later ones with addLeapSecond().
//   TT  = TAI + 32.184 s (exact).
//   TDB - TT    periodic terms of Fairhead & Bretagnon (USNO Circular 179, eq. 2.6), good to about 10 microseconds.
//   GPS = TAI - 19 s.
//   UT1         Earth rotation time. UT1 = TT - DeltaT, with DeltaT = TT - UT1 from a yearly table (IERS EOP C04 values, rounded
//               to 0.01 s; within 0.1 s of the truth 1950-2026, so about 0.0004 deg of Earth rotation). Beyond the table DeltaT is
//               held constant (the Earth is not predictable to better than seconds a decade ahead). setDut1(seconds) replaces
//               the table with a measured UT1 - UTC from IERS Bulletin A when an exact value is needed.
//   ERA / GMST  IAU 2000 Earth rotation angle from UT1 and IAU 2006 Greenwich mean sidereal time.

export const SCALES = ['UTC', 'TAI', 'TT', 'TDB', 'GPS', 'UT1'];
export const J2000_JD = 2451545.0;
export const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const DAY = 86400;
const TT_TAI = 32.184, TAI_GPS = 19;
const MJD_J2000 = 51544.5;   // MJD of 2000-01-01 12:00

// ---------- TAI - UTC ----------
// [MJD of the UTC day it starts, TAI-UTC at that MJD, reference MJD, rate s/day] (USNO tai-utc.dat, 1961-1971)
const RUBBER = [
  [37300, 1.4228180, 37300, 0.001296], [37512, 1.3728180, 37300, 0.001296], [37665, 1.8458580, 37665, 0.0011232],
  [38334, 1.9458580, 37665, 0.0011232], [38395, 3.2401300, 38761, 0.001296], [38486, 3.3401300, 38761, 0.001296],
  [38639, 3.4401300, 38761, 0.001296], [38761, 3.5401300, 38761, 0.001296], [38820, 3.6401300, 38761, 0.001296],
  [38942, 3.7401300, 38761, 0.001296], [39004, 3.8401300, 38761, 0.001296], [39126, 4.3131700, 39126, 0.002592],
  [39887, 4.2131700, 39126, 0.002592],
];
// [MJD the new value starts (00:00 UTC), TAI-UTC] (IERS Bulletin C)
const LEAPS = [
  [41317, 10], [41499, 11], [41683, 12], [42048, 13], [42413, 14], [42778, 15], [43144, 16], [43509, 17], [43874, 18], [44239, 19],
  [44786, 20], [45151, 21], [45516, 22], [46247, 23], [47161, 24], [47892, 25], [48257, 26], [48804, 27], [49169, 28], [49534, 29],
  [50083, 30], [50630, 31], [51179, 32], [53736, 33], [54832, 34], [56109, 35], [57204, 36], [57754, 37],
];
/** Add a leap second announced after this release: the UTC date (YYYY-MM-DD) from whose midnight TAI-UTC is `taiMinusUtc`. */
export function addLeapSecond(dateIso, taiMinusUtc) {
  const mjd = Date.parse(dateIso.slice(0, 10) + 'T00:00:00Z') / 864e5 + 40587;
  if (!Number.isInteger(mjd) || !(taiMinusUtc > LEAPS[LEAPS.length - 1][1])) throw new Error('addLeapSecond: date and a TAI-UTC larger than the last one are needed');
  LEAPS.push([mjd, taiMinusUtc]);
}
export const leapSecondTable = () => LEAPS.map(([mjd, s]) => ({ date: new Date((mjd - 40587) * 864e5).toISOString().slice(0, 10), taiMinusUtc: s }));

// ---------- DeltaT = TT - UT1 [s] ----------
// [year (decimal, at Jan 1), DeltaT]
const DELTA_T = [
  [1900, -2.79], [1910, 10.38], [1920, 21.16], [1930, 24.02], [1940, 24.35], [1950, 29.15], [1955, 31.07], [1960, 33.15], [1961, 33.59], [1962, 34.00],
  [1963, 34.47], [1964, 35.03], [1965, 35.73], [1966, 36.54], [1967, 37.43], [1968, 38.29], [1969, 39.20], [1970, 40.18], [1971, 41.17], [1972, 42.23],
  [1973, 43.37], [1974, 44.49], [1975, 45.48], [1976, 46.46], [1977, 47.52], [1978, 48.53], [1979, 49.59], [1980, 50.54], [1981, 51.38], [1982, 52.17],
  [1983, 52.96], [1984, 53.79], [1985, 54.34], [1986, 54.87], [1987, 55.32], [1988, 55.82], [1989, 56.30], [1990, 56.86], [1991, 57.57], [1992, 58.31],
  [1993, 59.12], [1994, 59.98], [1995, 60.78], [1996, 61.63], [1997, 62.29], [1998, 62.97], [1999, 63.47], [2000, 63.83], [2001, 64.09], [2002, 64.30],
  [2003, 64.47], [2004, 64.57], [2005, 64.69], [2006, 64.85], [2007, 65.15], [2008, 65.46], [2009, 65.78], [2010, 66.07], [2011, 66.32], [2012, 66.60],
  [2013, 66.91], [2014, 67.28], [2015, 67.64], [2016, 68.10], [2017, 68.59], [2018, 68.97], [2019, 69.22], [2020, 69.36], [2021, 69.36], [2022, 69.29],
  [2023, 69.20], [2024, 69.18], [2025, 69.14], [2026, 69.10],
];
let dut1Override = null;
/** Use a measured UT1 - UTC [s] (IERS Bulletin A, |DUT1| < 0.9 s) instead of the DeltaT table; null goes back to the table. */
export function setDut1(seconds) { dut1Override = seconds == null ? null : Number(seconds); }

/** TT - UT1 [s] at a time given as seconds after J2000 (any scale; DeltaT changes by milliseconds per day). */
export function deltaT(t) {
  const y = 2000 + t / (365.25 * DAY);
  if (y < DELTA_T[0][0]) { const u = (y - 1820) / 100; return -20 + 32 * u * u; }   // Morrison & Stephenson (2004) long-term parabola
  const last = DELTA_T[DELTA_T.length - 1];
  if (y >= last[0]) return last[1];
  let i = 1; while (DELTA_T[i][0] <= y) i++;
  const [y0, d0] = DELTA_T[i - 1], [y1, d1] = DELTA_T[i];
  return d0 + ((y - y0) / (y1 - y0)) * (d1 - d0);
}

/** TAI - UTC [s] at UTC seconds after J2000 (no leap seconds counted, see header). */
export function taiMinusUtc(utc) {
  const mjd = MJD_J2000 + utc / DAY;
  if (mjd >= LEAPS[0][0]) {
    let s = LEAPS[0][1];
    for (const [m, v] of LEAPS) { if (mjd >= m) s = v; else break; }
    return s;
  }
  if (mjd >= RUBBER[0][0]) {
    let row = RUBBER[0];
    for (const r of RUBBER) { if (mjd >= r[0]) row = r; else break; }
    return row[1] + (mjd - row[2]) * row[3];
  }
  return deltaT(utc) - TT_TAI;   // before 1961: UTC = UT1
}

/** TDB - TT [s] (USNO Circular 179 eq. 2.6), t = TT (or TDB) seconds after J2000. */
export function tdbMinusTt(t) {
  const T = t / (36525 * DAY);
  return 0.001657 * Math.sin(628.3076 * T + 6.2401) + 0.000022 * Math.sin(575.3385 * T + 4.2970) + 0.000014 * Math.sin(1256.6152 * T + 6.1969)
    + 0.000005 * Math.sin(606.9777 * T + 4.0212) + 0.000005 * Math.sin(52.9691 * T + 0.4444) + 0.000002 * Math.sin(21.3299 * T + 5.5431)
    + 0.000010 * T * Math.sin(628.3076 * T + 4.2490);
}

// ---------- conversions through TAI ----------
/** UTC count of a TAI time: {utc, leap}. Inside a leap second the count repeats 23:59:59.x (POSIX style) and leap = seconds into it. */
function utcFromTai(tai) {
  const start0 = (LEAPS[0][0] - MJD_J2000) * DAY + LEAPS[0][1];
  if (tai >= start0) {
    let v = LEAPS[0][1];
    for (const [m, val] of LEAPS) {
      const midnight = (m - MJD_J2000) * DAY, start = midnight + val;
      if (tai >= start) { v = val; continue; }
      if (tai >= start - 1) return { utc: midnight - 1 + (tai - (start - 1)), leap: tai - (start - 1) };
      break;
    }
    return { utc: tai - v, leap: null };
  }
  let u = tai - taiMinusUtc(tai);
  for (let k = 0; k < 4; k++) u = tai - taiMinusUtc(u);
  return { utc: u, leap: null };
}
function toTai(t, scale) {
  switch (scale) {
    case 'TAI': return t;
    case 'UTC': return t + taiMinusUtc(t);
    case 'GPS': return t + TAI_GPS;
    case 'TT': return t - TT_TAI;
    case 'TDB': return t - tdbMinusTt(t) - TT_TAI;
    case 'UT1': {
      if (dut1Override != null) { const utc = t - dut1Override; return utc + taiMinusUtc(utc); }
      let tt = t + deltaT(t); tt = t + deltaT(tt); return tt - TT_TAI;
    }
    default: throw new Error(`Unknown time scale: ${scale}`);
  }
}
function fromTai(tai, scale) {
  switch (scale) {
    case 'TAI': return tai;
    case 'UTC': return utcFromTai(tai).utc;
    case 'GPS': return tai - TAI_GPS;
    case 'TT': return tai + TT_TAI;
    case 'TDB': { const tt = tai + TT_TAI; return tt + tdbMinusTt(tt); }
    case 'UT1': {
      if (dut1Override != null) return fromTai(tai, 'UTC') + dut1Override;
      const tt = tai + TT_TAI; return tt - deltaT(tt);
    }
    default: throw new Error(`Unknown time scale: ${scale}`);
  }
}
/** Convert seconds after J2000 from one time scale to another ('UTC' | 'TAI' | 'TT' | 'TDB' | 'GPS' | 'UT1'). */
export function convertTime(t, from, to) {
  from = String(from).toUpperCase(); to = String(to).toUpperCase();
  return from === to ? t : fromTai(toTai(t, from), to);
}

// ---------- calendar strings <-> simulator epoch ----------
/** UTC seconds after J2000 of a Date (or anything Date.parse reads; a bare date-time without zone is taken as UTC). */
function utcSecondsOf(d) {
  if (d instanceof Date) return (d.getTime() - J2000_UNIX_MS) / 1000;
  if (typeof d === 'number') return d;
  let s = String(d).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s)) s += s.length === 10 ? 'T00:00:00Z' : 'Z';
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) throw new Error(`Not a date: ${d}`);
  return (ms - J2000_UNIX_MS) / 1000;
}
/**
 * Simulator epoch (TDB s after J2000) of a calendar date and time in `scale` (default UTC).
 * Accepts a Date, or an ISO string such as '2026-11-13T14:00:00Z', '1969-07-16 13:32:00' or '2016-12-31T23:59:60.5Z' (a leap second).
 */
export function dateToEpoch(d, scale = 'UTC') {
  let extra = 0;
  if (typeof d === 'string') {
    const m = d.match(/^(.*[T ]\d{2}:\d{2}):60(\.\d+)?(.*)$/);   // 23:59:60.x -> 23:59:59 + 1.x s (only inside the leap second itself)
    if (m) { d = `${m[1]}:59${m[3]}`; extra = 1 + Number(m[2] ?? 0); }
  }
  const s = utcSecondsOf(d);
  if (extra && scale.toUpperCase() === 'UTC') return fromTai(toTai(s, 'UTC') + extra, 'TDB');
  return convertTime(s + extra, scale, 'TDB');
}
export const utcToEpoch = (d) => dateToEpoch(d, 'UTC');

/** Calendar string 'YYYY-MM-DDTHH:MM:SS.sss' of a simulator epoch on `scale` (default UTC; shows :60 during a leap second). */
export function epochToIso(t, scale = 'UTC', digits = 3) {
  scale = scale.toUpperCase();
  let sec = convertTime(t, 'TDB', scale), leapFrac = null;
  if (scale === 'UTC') { const u = utcFromTai(convertTime(t, 'TDB', 'TAI')); if (u.leap != null) { leapFrac = Math.min(u.leap, 0.9995); sec = Math.floor(u.utc + 1e-9); } }
  let iso = new Date(Math.round((J2000_UNIX_MS / 1000 + sec) * 1000)).toISOString().slice(0, 23);
  if (leapFrac != null) iso = iso.slice(0, 17) + '60' + (leapFrac.toFixed(3)).slice(1);
  return digits >= 3 ? iso : digits <= 0 ? iso.slice(0, 19) : iso.slice(0, 20 + digits);
}
export const epochToUtcIso = (t, digits = 3) => epochToIso(t, 'UTC', digits);
/** JS Date (UTC) of a simulator epoch. A leap second maps onto 23:59:59. */
export const epochToDate = (t) => new Date(J2000_UNIX_MS + convertTime(t, 'TDB', 'UTC') * 1000);

/** Julian date on `scale` of a simulator epoch. */
export const epochToJd = (t, scale = 'TDB') => J2000_JD + convertTime(t, 'TDB', scale) / DAY;
/** Simulator epoch of a Julian date on `scale`. */
export const jdToEpoch = (jd, scale = 'TDB') => convertTime((jd - J2000_JD) * DAY, scale, 'TDB');

// ---------- Earth rotation ----------
const TWO_PI = 2 * Math.PI;
/** IAU 2000 Earth rotation angle [rad, 0..2pi] at simulator epoch t (TDB s). */
export function earthRotationAngle(t) {
  const du = convertTime(t, 'TDB', 'UT1') / DAY;
  const f = (0.7790572732640 + 0.00273781191135448 * du + (du % 1)) % 1;   // split to keep precision: 1.0027... * du = du + 0.0027... * du
  return ((f < 0 ? f + 1 : f) * TWO_PI);
}
/** IAU 2006 Greenwich mean sidereal time [rad, 0..2pi] at simulator epoch t. */
export function gmst(t) {
  const T = convertTime(t, 'TDB', 'TT') / (36525 * DAY);
  const arcsec = 0.014506 + T * (4612.156534 + T * (1.3915817 + T * (-0.00000044 + T * (-0.000029956 + T * -0.0000000368))));
  const a = (earthRotationAngle(t) + (arcsec / 3600) * (Math.PI / 180)) % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}
