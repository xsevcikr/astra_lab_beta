// Celestial body registry + analytic (Keplerian) ephemeris.
// New bodies can be added at runtime with registerBody(); every field below is a plain data value.
// Reference frame convention (documented simplification): each body's inertial frame has +Z along its spin axis;
// the Earth-Sun orbital plane is the reference plane (obliquity ignored). Body orbits use two-body Kepler elements.
import { DEG, AU, SOLAR_CONSTANT } from './constants.js';
import { Atmosphere } from './atmosphere.js';

/** dataSource: 'real' | 'estimated' | 'user' | 'fictional' (see documentation/DATA-LABELS.md) */
const BODY_DEFS = [
  {
    id: 'sun', name: 'Sun', type: 'star', parent: null, dataSource: 'real',
    mu: 1.32712440018e20, radius: 6.957e8, rotationPeriod: 2.19e6, atmosphere: { model: 'none' },
    surface: { temperature: 5772, albedo: 0, irFlux: 0, friction: 0.5, terrainAmplitude: 0 },
  },
  {
    id: 'earth', name: 'Earth', type: 'planet', parent: 'sun', dataSource: 'real',
    mu: 3.986004418e14, radius: 6378137, j2: 1.08263e-3, rotationPeriod: 86164.0905,
    orbit: { a: 1.495978707e11, e: 0.0167086, i: 0, raan: 0, argp: 102.94719, M0: 357.51716 },
    atmosphere: { model: 'us76', height: 150000 },
    surface: { temperature: 288, tDay: 305, tNight: 275, albedo: 0.30, irFlux: 237, friction: 0.7, terrainAmplitude: 150, terrainWavelength: 30000 },
  },
  {
    id: 'moon', name: 'Moon', type: 'moon', parent: 'earth', dataSource: 'real',
    mu: 4.9028e12, radius: 1737400, rotationPeriod: 2360591.5, atmosphere: { model: 'none' },
    orbit: { a: 3.84399e8, e: 0.0549, i: 5.145, raan: 125.08, argp: 318.15, M0: 115.37 },
    surface: { temperature: 250, tDay: 390, tNight: 100, albedo: 0.12, irFlux: 1.3, friction: 0.55, rollingResistance: 0.16, roughness: 0.5, terrainAmplitude: 400, terrainWavelength: 20000, regolithCohesion: 500 },
  },
  {
    id: 'mars', name: 'Mars', type: 'planet', parent: 'sun', dataSource: 'real',
    mu: 4.2828372e13, radius: 3389500, j2: 1.96045e-3, rotationPeriod: 88642.66,
    orbit: { a: 2.279392e11, e: 0.0934, i: 1.85, raan: 49.558, argp: 286.483, M0: 19.4125 },
    atmosphere: { model: 'glenn-mars', height: 120000 },
    surface: { temperature: 210, tDay: 280, tNight: 150, albedo: 0.25, irFlux: 55, friction: 0.6, rollingResistance: 0.13, roughness: 0.4, terrainAmplitude: 500, terrainWavelength: 15000, regolithCohesion: 800 },
  },
];

const registry = new Map();

export function registerBody(def) {
  const b = { ...def };
  b.atmosphereModel = new Atmosphere(def.atmosphere);
  b.omega = def.rotationPeriod ? (2 * Math.PI) / def.rotationPeriod : 0;
  b.gravity = def.mu / (def.radius * def.radius);
  if (def.orbit) {
    const o = def.orbit;
    b.elements = { a: o.a, e: o.e, i: o.i * DEG, raan: o.raan * DEG, argp: o.argp * DEG, M0: o.M0 * DEG };
  }
  b.children = [];
  registry.set(def.id, b);
  for (const other of registry.values()) other.children = [...registry.values()].filter((c) => c.parent === other.id).map((c) => c.id);
  // sphere of influence radius (Laplace): a (m/M)^(2/5)
  for (const x of registry.values()) {
    if (x.parent && registry.has(x.parent) && x.elements) x.soi = x.elements.a * Math.pow(x.mu / registry.get(x.parent).mu, 0.4);
    else x.soi = Infinity;
  }
  return b;
}
BODY_DEFS.forEach(registerBody);

export function getBody(id) {
  const b = registry.get(id);
  if (!b) throw new Error(`Unknown celestial body: ${id}`);
  return b;
}
export const listBodies = () => [...registry.values()];

/** Solve Kepler's equation M = E - e sin E for elliptic orbits (Newton iterations). */
export function solveKepler(M, e) {
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** Rotate perifocal vector into the reference frame using (raan, inc, argp). */
function perifocalToInertial(x, y, i, raan, argp) {
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(argp), sw = Math.sin(argp);
  const r11 = cO * cw - sO * sw * ci, r12 = -cO * sw - sO * cw * ci;
  const r21 = sO * cw + cO * sw * ci, r22 = -sO * sw + cO * cw * ci;
  const r31 = sw * si, r32 = cw * si;
  return [r11 * x + r12 * y, r21 * x + r22 * y, r31 * x + r32 * y];
}

/** Position & velocity of a body relative to its parent at time t [s since epoch]. */
export function bodyStateRelParent(id, t) {
  const b = getBody(id);
  if (!b.parent || !b.elements) return { r: [0, 0, 0], v: [0, 0, 0] };
  const p = getBody(b.parent);
  const { a, e, i, raan, argp, M0 } = b.elements;
  const n = Math.sqrt(p.mu / (a * a * a));
  const E = solveKepler(M0 + n * t, e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const rr = a * (1 - e * cE);
  const xp = a * (cE - e), yp = a * Math.sqrt(1 - e * e) * sE;
  const f = (Math.sqrt(p.mu * a) / rr);
  const vxp = -f * sE, vyp = f * Math.sqrt(1 - e * e) * cE;
  return { r: perifocalToInertial(xp, yp, i, raan, argp), v: perifocalToInertial(vxp, vyp, i, raan, argp) };
}

/** Heliocentric (root frame) state of a body. */
export function bodyStateAbs(id, t) {
  let r = [0, 0, 0], v = [0, 0, 0];
  let cur = getBody(id);
  while (cur.parent) {
    const s = bodyStateRelParent(cur.id, t);
    r = [r[0] + s.r[0], r[1] + s.r[1], r[2] + s.r[2]];
    v = [v[0] + s.v[0], v[1] + s.v[1], v[2] + s.v[2]];
    cur = getBody(cur.parent);
  }
  return { r, v };
}

/** Distance from the Sun [m] for the body (used for insolation). */
export function solarDistance(id, t) {
  let cur = getBody(id);
  while (cur.parent && cur.parent !== 'sun') cur = getBody(cur.parent);
  const s = bodyStateAbs(cur.id, t).r;
  return Math.hypot(s[0], s[1], s[2]);
}
export function solarFlux(id, t) {
  const d = solarDistance(id, t);
  return d > 0 ? SOLAR_CONSTANT * (AU / d) ** 2 : SOLAR_CONSTANT;
}
/** Unit vector from body-centred inertial origin toward the Sun (parent-frame approximation). */
export function sunDirection(id, t) {
  const b = getBody(id);
  if (id === 'sun') return [1, 0, 0];
  const s = bodyStateAbs(id, t).r; // heliocentric position of the body (root frame)
  const l = Math.hypot(s[0], s[1], s[2]) || 1;
  return [-s[0] / l, -s[1] / l, -s[2] / l];
}

// ---------- body-fixed <-> inertial ----------
export function rotationAngle(id, t, theta0 = 0) { return theta0 + getBody(id).omega * t; }

/** Inertial position of a surface point (lat, lon in radians, radius r). */
export function surfacePointInertial(id, lat, lon, t, radius) {
  const b = getBody(id);
  const R = radius ?? b.radius;
  const th = lon + rotationAngle(id, t);
  return [R * Math.cos(lat) * Math.cos(th), R * Math.cos(lat) * Math.sin(th), R * Math.sin(lat)];
}
/** Velocity of the co-rotating surface (atmosphere) at inertial position r. */
export function corotationVelocity(id, r) {
  const w = getBody(id).omega; // omega x r with omega = (0,0,w)
  return [-w * r[1], w * r[0], 0];
}
/** Latitude, longitude (body fixed), radius from inertial position. */
export function latLonFromInertial(id, r, t) {
  const rr = Math.hypot(r[0], r[1], r[2]);
  const lat = Math.asin(Math.max(-1, Math.min(1, r[2] / rr)));
  let lon = Math.atan2(r[1], r[0]) - rotationAngle(id, t);
  lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return { lat, lon, r: rr };
}
/** Local east/north/up unit vectors at inertial position r. */
export function localFrame(r) {
  const rr = Math.hypot(r[0], r[1], r[2]);
  const up = [r[0] / rr, r[1] / rr, r[2] / rr];
  let east = [-up[1], up[0], 0];
  const el = Math.hypot(east[0], east[1]);
  if (el < 1e-9) east = [0, 1, 0]; else east = [east[0] / el, east[1] / el, 0];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  return { up, east, north };
}

export const LAUNCH_SITES = [
  { id: 'cape', name: 'Cape Canaveral (28.57°N, 80.65°W)', body: 'earth', lat: 28.573, lon: -80.649, dataSource: 'real' },
  { id: 'kourou', name: 'Kourou (5.24°N, 52.77°W)', body: 'earth', lat: 5.236, lon: -52.775, dataSource: 'real' },
  { id: 'equator', name: 'Generic equatorial site (0°N, 0°E)', body: 'earth', lat: 0, lon: 0, dataSource: 'fictional' },
  { id: 'polar', name: 'Generic high-latitude site (65°N)', body: 'earth', lat: 65, lon: 20, dataSource: 'fictional' },
  { id: 'moon-site', name: 'Generic lunar site (0°N, 0°E)', body: 'moon', lat: 0, lon: 0, dataSource: 'fictional' },
  { id: 'mars-site', name: 'Generic Mars site (18°N, 77°E)', body: 'mars', lat: 18, lon: 77, dataSource: 'fictional' },
];

/** Sun elevation above the local horizon [deg] at a surface point and time. */
export function sunElevationDeg(id, latRad, lonRad, t) {
  const p = surfacePointInertial(id, latRad, lonRad, t, 1);
  const sd = sunDirection(id, t);
  return (Math.asin(Math.max(-1, Math.min(1, p[0] * sd[0] + p[1] * sd[1] + p[2] * sd[2]))) * 180) / Math.PI;
}
/** First time (s) at or after `from` at which the Sun is between [lo, hi] degrees above the horizon and rising (morning). */
export function findMorningEpoch(id, latRad, lonRad, { lo = 35, hi = 45, from = 0, span = null } = {}) {
  const b = getBody(id);
  const T = span ?? Math.max(2 * Math.PI / Math.max(b.omega, 1e-12), 1) * 1.05;
  const dt = Math.max(T / 6000, 20);
  let prev = sunElevationDeg(id, latRad, lonRad, from);
  for (let t = from + dt; t < from + T; t += dt) {
    const e = sunElevationDeg(id, latRad, lonRad, t);
    if (e >= lo && e <= hi && e > prev) return t;
    prev = e;
  }
  return from;
}
