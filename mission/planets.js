// PlanetDefinition: one data record per world (planet or moon). Everything the mission engine needs about a world comes from here,
// so Venus, Titan or a fictional planet can be added with definePlanet() and no other code change.
// Orbit/gravity/atmosphere fields feed the existing physics registry (physics/bodies.js); the extra fields below
// (composition, hazards, landing sites, entry-heating constants) are used by the mission engine.
import { getBody, registerBody, listBodies } from '../physics/bodies.js';
import { G0 } from '../physics/constants.js';
import { circularSpeed, escapeSpeed, orbitalPeriod } from '../physics/orbital.js';

/** Fields the mission engine adds on top of the physics body record. dataSource labels follow documentation/DATA-LABELS.md. */
const EXTRAS = {
  earth: {
    composition: { N2: 0.781, O2: 0.209, Ar: 0.0093, CO2: 0.0004 },
    // Sutton-Graves convective heating constant, q = k * sqrt(rho / noseRadius) * v^3  [W/m^2]
    heatingK: 1.7415e-4,
    entryInterface: 121920, // m, altitude where entry is considered to begin
    hazards: { craterDensity: 0, boulderFraction: 0, seaOnly: false },
    sites: [
      { id: 'pacific-recovery', name: 'Pacific recovery zone', lat: 13, lon: -170, ocean: true, slopeDeg: 0, roughness: 0, dataSource: 'estimated' },
    ],
    notes: 'Standard atmosphere US76. Ocean landing for capsules.',
  },
  moon: {
    composition: {},
    hazards: { craterDensity: 0.35, boulderFraction: 0.06, dustKickup: true, maxSafeSlopeDeg: 12 },
    // Landing sites are generic and labelled as such; slope/roughness drive the landing evaluation.
    sites: [
      { id: 'mare-tranquil', name: 'Flat mare plain', lat: 0.7, lon: 23.5, slopeDeg: 2, roughness: 0.15, dataSource: 'estimated' },
      { id: 'mare-rough', name: 'Rough mare with craters', lat: 26, lon: 3.6, slopeDeg: 6, roughness: 0.5, dataSource: 'estimated' },
      { id: 'highland', name: 'Highland slopes', lat: -9, lon: 15.5, slopeDeg: 10, roughness: 0.7, dataSource: 'estimated' },
      { id: 'south-pole', name: 'Polar region (low sun)', lat: -85, lon: 31, slopeDeg: 9, roughness: 0.8, dataSource: 'estimated' },
    ],
    notes: 'Airless. Surface day is about 29.5 Earth days. No GPS-like infrastructure, navigation uses landing radar and star/IMU.',
  },
  mars: {
    composition: { CO2: 0.953, N2: 0.027, Ar: 0.016, O2: 0.0013 },
    heatingK: 1.9027e-4,
    entryInterface: 125000,
    hazards: { craterDensity: 0.3, boulderFraction: 0.1, dustStorms: true, maxSafeSlopeDeg: 10 },
    sites: [
      { id: 'plain', name: 'Smooth plain', lat: 18, lon: 77, slopeDeg: 2, roughness: 0.2, dataSource: 'estimated' },
      { id: 'crater-floor', name: 'Crater floor', lat: -4.6, lon: 137.4, slopeDeg: 5, roughness: 0.5, dataSource: 'estimated' },
    ],
    notes: 'Thin CO2 atmosphere: parachutes alone cannot land heavy vehicles, so propulsive descent is required.',
  },
};

const REQUIRED = ['id', 'name', 'mu', 'radius'];

/**
 * Register (or extend) a world. `def` is a physics body definition plus the optional mission fields.
 * Returns the derived summary (planetInfo).
 */
export function definePlanet(def) {
  for (const k of REQUIRED) if (def[k] == null) throw new Error(`PlanetDefinition needs "${k}"`);
  if (!(def.mu > 0) || !(def.radius > 0)) throw new Error('PlanetDefinition mu and radius must be positive');
  const full = {
    type: 'planet', parent: null, dataSource: 'user', rotationPeriod: 0, atmosphere: { model: 'none' }, surface: { terrainAmplitude: 0 },
    composition: {}, hazards: {}, sites: [], heatingK: 1.7e-4, entryInterface: 120000,
    ...def,
  };
  // strip the fields registerBody derives so re-registering an existing body is idempotent
  for (const k of ['atmosphereModel', 'omega', 'gravity', 'elements', 'children', 'soi']) delete full[k];
  registerBody(full);
  return planetInfo(def.id);
}

function loadBuiltins() {
  for (const [id, extra] of Object.entries(EXTRAS)) {
    const b = getBody(id);
    definePlanet({ ...b, ...extra });
  }
}
loadBuiltins();

/** Derived quantities every phase of every mission needs. */
export function planetInfo(id) {
  const b = getBody(id);
  const atm = b.atmosphereModel;
  const sl = atm.hasAtmosphere ? atm.query(0) : { p: 0, rho: 0, T: 0 };
  const scaleHeight = atm.hasAtmosphere ? scaleHeightOf(atm) : 0;
  let sync = b.omega > 0 ? Math.cbrt(b.mu / (b.omega * b.omega)) - b.radius : null;
  if (sync != null && sync + b.radius > b.soi) sync = null; // outside the sphere of influence: no stable synchronous orbit
  return {
    id: b.id, name: b.name, type: b.type, parent: b.parent, dataSource: b.dataSource,
    mu: b.mu, radius: b.radius, surfaceGravity: b.gravity, surfaceGravityG: b.gravity / G0,
    escapeSpeedSurface: escapeSpeed(b.mu, b.radius),
    lowOrbitSpeed: (alt) => circularSpeed(b.mu, b.radius + alt),
    lowOrbitPeriod: (alt) => orbitalPeriod(b.mu, b.radius + alt),
    rotationPeriod: b.rotationPeriod, equatorialSpeed: b.omega * b.radius,
    dayLength: b.rotationPeriod, // sidereal; solar day differs, shown as an approximation
    synchronousAltitude: sync, soi: b.soi,
    hasAtmosphere: atm.hasAtmosphere, surfacePressure: sl.p, surfaceDensity: sl.rho, surfaceTemperature: b.surface?.temperature ?? sl.T,
    scaleHeight, atmosphereTop: atm.height, composition: b.composition ?? {},
    heatingK: b.heatingK, entryInterface: b.entryInterface ?? atm.height,
    terrain: { amplitude: b.surface?.terrainAmplitude ?? 0, wavelength: b.surface?.terrainWavelength ?? 0, friction: b.surface?.friction ?? 0.6, roughness: b.surface?.roughness ?? 0 },
    hazards: b.hazards ?? {}, sites: b.sites ?? [],
    temperature: { mean: b.surface?.temperature, day: b.surface?.tDay, night: b.surface?.tNight },
    orbitalElements: b.orbit ?? null,
  };
}

function scaleHeightOf(atm) {
  // density e-folding height measured between 0 and a few km (or the first km for thin atmospheres)
  const h1 = 5000;
  const r0 = atm.query(0).rho, r1 = atm.query(h1).rho;
  return r1 > 0 && r0 > r1 ? h1 / Math.log(r0 / r1) : 0;
}

export const listPlanets = () => listBodies().map((b) => b.id);
export function landingSite(bodyId, siteId) {
  const s = (getBody(bodyId).sites ?? []).find((x) => x.id === siteId);
  if (!s) throw new Error(`Unknown landing site ${siteId} on ${bodyId}`);
  return s;
}
