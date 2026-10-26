// Validation against REAL MISSIONS (2.0). src/core/validation.js checks three launchers; this module checks the rest of the physics:
//   * orbital mechanics: the orbit, escape and transfer numbers every mission planner uses, against published values;
//   * Curiosity (Mars Science Laboratory) entry, descent and landing, flown in the entry simulator, against NASA's EDL timeline;
//   * Apollo 11, the whole mission flown in the main simulator (launch to splashdown), against the Apollo 11 Mission Report.
// Every published value carries its source. Inputs taken from the mission (entry speed, planned trip home ...) are listed as inputs and are
// never graded. A row that misses its band is reported as a miss; nothing here is tuned toward the answer.
import { getBody } from '../../physics/bodies.js';
import { orbitalPeriod, escapeSpeed, hohmann } from '../../physics/orbital.js';
import { Simulation } from '../../physics/simulation.js';
import { simulateEntry, ENTRY_VEHICLES } from '../engineering/flight/entry.js';
import { yieldToLoop } from './runner.js';

const H = 3600, DAY = 86400, FT = 0.3048;
const get = (hms) => { const [h, m, s] = hms.split(':').map(Number); return h * H + m * 60 + s; };

const SRC_ISS = 'https://www.nasa.gov/reference/international-space-station/';
const SRC_EARTH = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html';
const SRC_MARS = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html';
const SRC_MOON = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html';
const SRC_GEO = 'https://en.wikipedia.org/wiki/Geostationary_orbit';
const SRC_MSL = 'https://en.wikipedia.org/wiki/Mars_Science_Laboratory';
const SRC_MSL_EDL = 'https://science.nasa.gov/resource/final-minutes-of-curiositys-arrival-at-mars';
const SRC_A11 = 'https://www.nasa.gov/wp-content/uploads/static/history/afj/ap11fj/pdf/a11-postlaunch-rep.pdf';

const row = (id, label, metric, value, unit, tol, source, url, note) => ({ id, label, metric, value, unit, tol, kind: tol == null ? 'context' : 'graded', source, url, note });

// ---- orbital mechanics ----------------------------------------------------------------------------------------------
function runOrbits() {
  const E = getBody('earth'), M = getBody('mars'), L = getBody('moon'), S = getBody('sun');
  const rGeo = Math.cbrt(E.mu * (E.rotationPeriod / (2 * Math.PI)) ** 2);
  const rLeo = E.radius + 300e3;
  const leoGeo = hohmann(E.mu, rLeo, rGeo);
  const em = hohmann(S.mu, E.elements.a, M.elements.a);
  return {
    issPeriod: orbitalPeriod(E.mu, E.radius + 420e3),
    geoAlt: rGeo - E.radius,
    escEarth: escapeSpeed(E.mu, E.radius), escMars: escapeSpeed(M.mu, M.radius), escMoon: escapeSpeed(L.mu, L.radius),
    moonPeriod: orbitalPeriod(E.mu + L.mu, L.elements.a),
    leoGeoDv: leoGeo.dvTotal,
    marsTransfer: em.tof,
  };
}
const ORBIT_ROWS = [
  row('iss', 'Space station orbit time (circle 420 km up)', 'issPeriod', 92.9 * 60, 's', 0.02, 'NASA ISS facts and figures: about 92.9 minutes at about 420 km (the altitude varies by tens of km)', SRC_ISS),
  row('geo', 'Height of a geostationary orbit', 'geoAlt', 35786e3, 'm', 0.01, 'Geostationary orbit: 35,786 km above the equator', SRC_GEO),
  row('escE', 'Escape speed from the Earth', 'escEarth', 11186, 'm/s', 0.01, 'NASA Earth fact sheet: 11.186 km/s', SRC_EARTH),
  row('escM', 'Escape speed from Mars', 'escMars', 5027, 'm/s', 0.01, 'NASA Mars fact sheet: 5.027 km/s', SRC_MARS),
  row('escL', 'Escape speed from the Moon', 'escMoon', 2380, 'm/s', 0.01, 'NASA Moon fact sheet: 2.38 km/s', SRC_MOON),
  row('moonP', 'Time for the Moon to go round the Earth', 'moonPeriod', 27.3217 * DAY, 's', 0.01, 'NASA Moon fact sheet: sidereal orbit period 27.3217 days', SRC_MOON),
  row('leoGeo', 'Delta-v from a 300 km orbit to geostationary (Hohmann, no plane change)', 'leoGeoDv', 3890, 'm/s', 0.03, 'Textbook value (e.g. Curtis, Orbital Mechanics for Engineering Students): about 3.89 km/s', SRC_GEO),
  row('marsT', 'Earth to Mars trip (Hohmann) vs Curiosity\'s real cruise (26 Nov 2011 to 6 Aug 2012)', 'marsTransfer', 254 * DAY, 's', 0.10, 'Curiosity cruise: 254 days. A real trip is not an exact Hohmann transfer, so the band is 10%.', SRC_MSL),
];

// ---- Curiosity EDL --------------------------------------------------------------------------------------------------
// Inputs from the mission: entry interface 125 km, 5.8 km/s, flight-path angle -15.5 deg, 4.5 m aeroshell (vehicle 'mars-lander').
// The guided bank-angle history is not published in a usable form; a constant 45 deg bank is ASSUMED (not fitted).
export const MSL_INPUTS = { entryAlt: 125000, entrySpeed: 5800, gammaDeg: -15.5, bankDeg: 45 };
function runMsl() {
  const r = simulateEntry('mars-lander', { body: 'mars', ...MSL_INPUTS, record: false });
  const ev = r.timeline.events;
  const chute = ev.find((e) => e.type === 'parachute'), sep = ev.find((e) => e.type === 'separation');
  const num = (txt, re) => { const m = re.exec(txt ?? ''); return m ? Number(m[1]) : null; };
  return {
    outcome: r.outcome, text: r.text, success: r.success,
    chuteT: chute?.t ?? null, chuteAlt: chute ? num(chute.text, /at ([\d.]+) km/) * 1000 : null, chuteSpeed: chute ? num(chute.text, /km, (\d+) m\/s/) : null,
    touchdownT: r.success ? r.time : null, peakG: r.maxG, poweredT: sep?.t ?? null,
  };
}
const MSL_ROWS = [
  row('mslChuteT', 'Parachute opens (time after entry)', 'chuteT', 259.2, 's', 0.10, 'NASA timeline of the real landing: entry 10:10:45.7 PM PDT, parachute 10:15:04.9 PM', SRC_MSL_EDL),
  row('mslTouch', 'Touchdown (time after entry)', 'touchdownT', 431.6, 's', 0.10, 'NASA timeline of the real landing: touchdown 10:17:57.3 PM PDT ("seven minutes of terror")', SRC_MSL_EDL),
  row('mslChuteAlt', 'Height when the parachute opens', 'chuteAlt', 10000, 'm', null, 'NASA example case: about 10 km. Context only: the simulator measures height above the average Mars radius, Gale crater lies about 4.5 km lower.', SRC_MSL_EDL),
  row('mslChuteV', 'Speed when the parachute opens', 'chuteSpeed', 470, 'm/s', null, 'NASA example case: about 470 m/s. Context only (depends on the trigger rule).', SRC_MSL_EDL),
];

// ---- Apollo 11 ------------------------------------------------------------------------------------------------------
// Ground elapsed times from the Apollo 11 Mission Report (MSC-00171, Table 3-I / 7-I). Inputs: the stored launch plan and the planned
// 59.9 h trip home. Everything else is the flight.
const APOLLO_ROWS = [
  row('tli', 'Burn toward the Moon ends (TLI cutoff)', 'tliT', get('2:50:03'), 's', 0.10, 'Apollo 11 Mission Report: TLI cutoff 002:50:03', SRC_A11),
  row('loi', 'Captured by the Moon (LOI-1 cutoff)', 'loiT', get('75:55:48'), 's', 0.10, 'Apollo 11 Mission Report: LOI-1 ignition 075:49:50, 357.5 s burn', SRC_A11),
  row('loiDv', 'Size of the lunar orbit insertion burn', 'loiDv', 2917 * FT, 'm/s', 0.10, 'Apollo 11 Mission Report: LOI-1 2,917 ft/s', SRC_A11),
  row('land', 'Lunar landing', 'landT', get('102:45:40'), 's', 0.10, 'Apollo 11 Mission Report: landing 102:45:40', SRC_A11),
  row('dock', 'Docking after liftoff from the Moon', 'dockT', get('128:03:00'), 's', 0.10, 'Apollo 11 Mission Report: docking 128:03:00', SRC_A11),
  row('teiDv', 'Size of the burn home (TEI)', 'teiDv', 3283.6 * FT, 'm/s', 0.10, 'Apollo 11 Mission Report: TEI 3,283.6 ft/s. The simulator plans the published 59.9 h trip home and works out the burn itself.', SRC_A11),
  row('ei', 'Back at the top of Earth\'s atmosphere (entry interface)', 'entryT', get('195:03:06'), 's', 0.10, 'Apollo 11 Mission Report: entry interface 195:03:06', SRC_A11),
  row('splash', 'Entry interface to splashdown', 'entryToSplash', get('195:18:35') - get('195:03:06'), 's', 0.10, 'Apollo 11 Mission Report: splashdown 195:18:35, 15.5 minutes after entry interface. The simulator flies a lifting entry with parachutes (ASSUMED capsule lift-to-drag 0.34 and a simple bank law).', SRC_A11),
  row('entryG', 'Highest push on the crew during entry', 'entryPeakG', 6.5, 'g', 0.15, 'Apollo 11 entry: about 6.5 g (Apollo 11 Mission Report, entry flight data). The bank law here is a simple stand-in for the real guidance.', SRC_A11),
];
async function apolloModules() {
  const [{ buildApolloStack }, { apolloMissionFromPlan }, { APOLLO_PLANS }] = await Promise.all([import('../vehicles/apollo.js'), import('../missions/apollo.js'), import('../../data/apollo-plans.js')]);
  return { buildApolloStack, apolloMissionFromPlan, APOLLO_PLANS };
}
export function apolloMetrics(sim) {
  const done = (re) => sim.events.find((e) => e.kind === 'EVENT_DONE' && re.test(e.message));
  const dvOf = (e) => { const m = /delivered ([\d.]+) m\/s/.exec(e?.message ?? ''); return m ? Number(m[1]) : null; };
  const tli = done(/^Trans-lunar injection/), loi = done(/^Lunar orbit insertion 1/), tei = done(/^Trans-Earth injection/);
  const land = sim.events.find((e) => e.kind === 'LANDED');
  const dock = sim.events.find((e) => /Docked: command\/service module and lunar module/.test(e.message) && e.t > (land?.t ?? Infinity));
  const ei = sim.events.find((e) => /^Entry interface/.test(e.message));
  const splash = sim.events.find((e) => e.kind === 'LANDED' && ei && e.t > ei.t);
  let entryPeakG = null;
  if (ei) { const tel = sim.telemetry, tt = tel.column('t'), gg = tel.column('gload'); entryPeakG = 0; for (let i = 0; i < tel.count; i++) if (tt[i] >= ei.t && gg[i] > entryPeakG) entryPeakG = gg[i]; }
  return { status: sim.result?.status, message: sim.result?.message, entryToSplash: splash && ei ? splash.t - ei.t : null, entryPeakG, tliT: tli?.t ?? null, loiT: loi?.t ?? null, loiDv: dvOf(loi), landT: land?.t ?? null, dockT: dock?.t ?? null, teiT: tei?.t ?? null, teiDv: dvOf(tei), entryT: ei?.t ?? null };
}

// ---- orbit precession from the Earth's equatorial bulge (J2), flown in the main simulator -------------------------------
// A satellite is flown for one day with "precise gravity" on and the drift of its orbit plane (the node) is measured from the telemetry.
// A Sun-synchronous orbit is DEFINED by a node drift of one turn per year (0.9856 deg/day); the station's node regresses by about 5 deg/day.
async function runPrecession() {
  const { TEMPLATE_BY_ID } = await import('../../data/templates.js');
  const G = await import('../missions/generator.js');
  const { sunSynchronousInclination } = await import('../../physics/mission-design.js');
  const flyDay = (altitude, inclination) => {
    const { vehicle } = TEMPLATE_BY_ID.satellite.make();
    const m = G.probeOperationsMission(vehicle, { altitude, inclination, duration: DAY });
    m.events = []; m.objective = { type: 'survive', duration: DAY }; m.maxTime = 2 * DAY;
    const sim = new Simulation({ vehicle, mission: m, settings: { j2: true } });
    while (!sim.finished && sim.t < DAY + 1) sim.step();
    const tel = sim.telemetry, n = tel.count, c = (k) => tel.column(k);
    const node = (i) => { const r = [c('x')[i], c('y')[i], c('z')[i]], v = [c('vx')[i], c('vy')[i], c('vz')[i]]; return Math.atan2(r[1] * v[2] - r[2] * v[1], -(r[2] * v[0] - r[0] * v[2])) * 180 / Math.PI; };
    let d = node(n - 1) - node(0); d = ((d + 540) % 360) - 180;
    return d / ((c('t')[n - 1] - c('t')[0]) / DAY);
  };
  return { ssoDrift: flyDay(700e3, sunSynchronousInclination(700e3)), issDrift: flyDay(420e3, 51.6) };
}
const SRC_SSO = 'https://en.wikipedia.org/wiki/Sun-synchronous_orbit';
const SRC_PREC = 'https://en.wikipedia.org/wiki/Nodal_precession';
const PRECESSION_ROWS = [
  row('sso', 'Sun-synchronous orbit: the orbit plane turns with the Sun (700 km, 98.2 deg)', 'ssoDrift', 360 / 365.2422, 'deg/day', 0.02, 'By definition one turn per year: 360 / 365.2422 = 0.9856 deg/day (Sun-synchronous orbit, Wikipedia). The inclination is computed, not fitted.', SRC_SSO),
  row('issNode', 'Space station: the orbit plane turns backwards (420 km, 51.6 deg)', 'issDrift', -5.0, 'deg/day', 0.05, 'The station\'s ascending node regresses by about 5 deg/day (Nodal precession, Wikipedia; textbook J2 theory gives -5.0).', SRC_PREC),
];

export const MISSION_CASES = [
  { id: 'orbits', name: 'Orbits and escape speeds', summary: 'The orbit maths every mission is built on: space station, geostationary orbit, escape speeds, the Moon, a trip to Mars.', rows: ORBIT_ROWS, quick: true,
    inputs: ['Body masses (gravity constants), sizes, spin periods and orbits from NASA fact sheets (physics/bodies.js).'], model: 'Two-body Kepler orbits (physics/orbital.js).' },
  { id: 'precession', name: 'Orbit drift from the Earth\'s shape (J2)', summary: 'A satellite flown for one day with precise gravity: does its orbit plane turn at the rate a Sun-synchronous orbit needs, and like the space station\'s?', rows: PRECESSION_ROWS, quick: false,
    inputs: ['Earth gravity constant, radius and J2 = 1.08263e-3 (physics/bodies.js).', 'A 700 km orbit at the Sun-synchronous inclination computed from J2, and a 420 km, 51.6 deg station-like orbit.'], model: 'The main simulator with precise gravity on (point mass plus J2), flown for one day in the same code as a launch.' },
  { id: 'msl', name: 'Curiosity lands on Mars (2012)', summary: 'Entry at 5.8 km/s, heat shield, supersonic parachute, rocket descent to the ground, flown in the entry simulator.', rows: MSL_ROWS, quick: true,
    inputs: ['Entry interface 125 km, 5.8 km/s, flight-path angle -15.5 deg (NASA).', '4.5 m aeroshell, about 3,300 kg entry mass, lift-to-drag 0.24 (published, rounded).', 'ASSUMED: a constant 45 deg bank angle (the real guidance changed the bank during entry).'],
    model: 'Planar lifting entry with a Mars atmosphere, Mach-triggered parachute and throttled descent engines (src/engineering/flight/entry.js). Mars rotation and winds are not included.' },
  { id: 'apollo11', name: 'Apollo 11 (1969), the whole mission', summary: 'Launch, Earth orbit, three days to the Moon, landing, rendezvous and the trip home, flown in the main simulator.', rows: APOLLO_ROWS, quick: false,
    inputs: ['Saturn V, CSM and LM masses and engines (src/vehicles/apollo.js).', 'Launch time and TLI start from the stored plan (data/apollo-plans.js).', 'The planned trip home: 59.9 h (Apollo 11: TEI 135:24 to entry 195:03).'],
    model: 'Full 6-DOF-attitude point-mass flight with patched conics (Earth, then Moon), real burns and onboard course corrections. Takes about a minute.' },
];

function compare(C, m) {
  return C.rows.map((r) => {
    const sim = m[r.metric];
    const has = sim != null && Number.isFinite(sim);
    const err = has ? (sim - r.value) / r.value : null;
    const status = !has ? 'missing' : r.kind === 'context' ? 'context' : Math.abs(err) <= r.tol ? 'pass' : 'fail';
    return { ...r, sim: has ? sim : null, err, status };
  });
}
/** Rows for a case from metrics measured elsewhere (tests reuse one Apollo flight). */
export const missionRows = (id, metrics) => compare(MISSION_CASES.find((c) => c.id === id), metrics);
export function summarise(rows) {
  const g = rows.filter((r) => r.kind === 'graded');
  return { total: g.length, pass: g.filter((r) => r.status === 'pass').length, fail: g.filter((r) => r.status === 'fail').length, missing: g.filter((r) => r.status === 'missing').length };
}

/** Run one mission case. opts.onProgress({t, of}) for the long Apollo flight; async so the UI stays responsive. */
export async function runMissionCase(id, opts = {}) {
  const C = MISSION_CASES.find((c) => c.id === id);
  if (!C) throw new Error(`Unknown mission case ${id}`);
  let metrics;
  if (id === 'orbits') metrics = runOrbits();
  else if (id === 'msl') metrics = runMsl();
  else if (id === 'precession') metrics = await runPrecession();
  else {
    const A = await apolloModules();
    const v = A.buildApolloStack();
    const sim = new Simulation({ vehicle: v, mission: A.apolloMissionFromPlan(v, A.APOLLO_PLANS.default) });
    const sync = opts.sync ?? (typeof window === 'undefined');
    while (!sim.finished && sim.t < 14 * DAY) {
      if (sync) sim.run({ untilT: sim.t + H, budgetMs: 120000 });
      else { sim.run({ untilT: sim.t + 4 * H, budgetMs: 30 }); opts.onProgress?.({ t: sim.t, of: 196 * H }); await yieldToLoop(); if (opts.shouldStop?.()) break; }
    }
    metrics = apolloMetrics(sim);
  }
  const rows = compare(C, metrics);
  return { C, metrics, rows, summary: summarise(rows) };
}
export { ENTRY_VEHICLES };
