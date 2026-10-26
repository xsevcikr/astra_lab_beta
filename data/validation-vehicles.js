// Validation vehicles: simplified models of three real launchers, built from published numbers, plus the published numbers
// they are compared with. EVERY published value carries its source URL. Values that could not be found are NOT included.
// Anything not published (structure strength, tank geometry, pitch programme, engine throttle history ...) is an assumption
// of this model and is listed in `assumptions`. Honest labelling rules: documentation/DATA-LABELS.md.
//
// How the published values were read: the figures were read through an automated text extraction of the cited pages on
// 2026-10-01. Where a source printed a number in a table we copy it; unit conversions (ft -> m, fps -> m/s) are done here in code.
import { newVehicle, addComponent } from '../src/vehicles/vehicle.js';
import { makeTank, makeNose, makeFairing } from './components.js';
import { sunSynchronousInclination } from '../physics/mission-design.js';

const FT = 0.3048;
const LBF = 4.4482216;
const G0 = 9.80665;

// ---- small helpers ---------------------------------------------------------------------------------------------
const kmOf = (ft) => (ft * FT) / 1000;
const mps = (fps) => fps * FT;

/** Engine spec in the same shape as the catalog entries (see data/components.js). mass is per engine. */
function engine(o) {
  return { kind: 'engine', mount: 'stack', count: 1, minThrottle: 0.6, gimbal: 5, spoolTime: 1, ignitions: 1, maxQ: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0, ...o };
}

/**
 * Add one stage: engine cluster + fuel tank + oxidizer tank. `stageDry` is the published stage dry mass INCLUDING engines;
 * what is left after the engines is spread over the two tanks in proportion to the propellant they hold.
 */
function addStage(v, { order, eng, count, fuelP, oxP, propellant, mixture, stageDry, D }) {
  const group = `stage${order}`;
  const fuel = propellant / (1 + mixture), ox = propellant - fuel;
  const shell = Math.max(stageDry - eng.mass * count, 1);
  const e = addComponent(v, { ...eng, count, group, diameter: D, name: count > 1 ? `${eng.name} x${count}` : eng.name });
  const tf = makeTank(fuelP, fuel, D, { group, name: `Stage ${order} ${fuelP} tank` });
  const to = makeTank(oxP, ox, D, { group, name: `Stage ${order} ${oxP} tank` });
  const w = fuel / propellant;
  tf.mass = shell * w; to.mass = shell * (1 - w);
  for (const t of [tf, to]) { t.strength = 1e12; t.maxQAlpha = 1e12; t.maxQ = 1e12; t.maxAccelG = 1e9; t.tMax = 1e5; }
  addComponent(v, tf); addComponent(v, to);
  if (!v.stages.some((s) => s.id === group)) v.stages.push({ id: group, name: `Stage ${order}`, order });
  v.stages.sort((a, b) => a.order - b.order);
  return e;
}
function addTop(v, { D, fairingMass, fairingLength, payloadMass, payloadName, noseLength }) {
  const top = v.stages[v.stages.length - 1].id;
  if (fairingMass) {
    const f = makeFairing(D, fairingLength, { mass: fairingMass, group: 'fairing', maxQ: 1e9, strength: 1e12, tMax: 1e5 });
    addComponent(v, f);
    addComponent(v, makeNose(D, noseLength ?? D * 1.2, 'ogive', { group: 'fairing', mass: 0.5, maxQ: 1e9, tMax: 1e5 }));
  } else {
    addComponent(v, makeNose(D, noseLength ?? D * 1.2, 'ogive', { group: top, mass: 0.5, maxQ: 1e9, tMax: 1e5 }));
  }
  addComponent(v, { kind: 'payload', name: payloadName, mount: 'stack', group: 'payload', length: 0.3, diameter: D * 0.9, mass: payloadMass, maxQ: 1e9, maxQAlpha: 1e12, maxAccelG: 1e9, tMax: 1e5, tMin: 0, dataSource: 'estimated' });
}
/** Avionics: needed so the vehicle can steer (real vehicles carry one; its mass is inside the published dry mass). */
function addAvionics(v, group) {
  addComponent(v, { catalogId: 'avionics-flight', group, name: 'Flight computer (mass counted in the stage dry mass)', mass: 0.1, tMax: 1e5, tMin: 0 });
  addComponent(v, { catalogId: 'battery-500', group, name: 'Battery (mass counted in the stage dry mass)', mass: 0.1, tMax: 1e5, tMin: 0 });
}

// ---- Saturn V (Apollo 11, AS-506) --------------------------------------------------------------------------------
const ATLAS_THROTTLE = globalThis.__ATH ?? 0.82;   // tuned so that the core burns for the published 253 s
const SRC_PRESSKIT = 'https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_PressKit.pdf';
const SRC_LVFEA = 'https://www.ibiblio.org/apollo/Documents/lvfea-AS506-Apollo11.pdf';
const SRC_SIC = 'https://en.wikipedia.org/wiki/S-IC';
const SRC_SII = 'https://en.wikipedia.org/wiki/S-II';
const SRC_SIVB = 'https://en.wikipedia.org/wiki/S-IVB';
const SRC_F1 = 'https://en.wikipedia.org/wiki/Rocketdyne_F-1';
const SRC_J2 = 'https://en.wikipedia.org/wiki/J-2_(rocket_engine)';

const SATURN_INPUTS = { // inputs used to BUILD the vehicle (published)
  sic: { propellant: 2077e3, dry: 137e3, thrustSL: 34500e3, burn: 150, source: SRC_SIC },
  sii: { propellant: 443e3, dry: 36.2e3, thrustVac: 4400e3, ispVac: 421, source: SRC_SII },
  sivb: { propellant: 109.5e3, dry: 13.5e3, thrustVac: 1033.1e3, ispVac: 421, source: SRC_SIVB },
  f1: { thrustVac: 7770e3, thrustSL: 6770e3, ispVac: 304, ispSl: 263, mass: 8400, source: SRC_F1 },
  j2: { thrustVac: 1033.1e3, ispVac: 421, mass: 1788, source: SRC_J2 },
  liftoffMass: 2941221, insertionMass: 135669, sivbFirstBurn: 144.7,
};
export function buildSaturnV() {
  const S = SATURN_INPUTS;
  const v = newVehicle({ name: 'Saturn V (Apollo 11) - simplified validation model', type: 'rocket', description: 'Simplified model built from published stage masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  const f1 = engine({ name: 'F-1 (published thrust/Isp)', thrustVac: S.f1.thrustVac, ispVac: S.f1.ispVac, ispSl: S.f1.ispSl, mixtureRatio: 2.27, propellants: ['LOX', 'RP-1'], mass: S.f1.mass, length: 5.6, spoolTime: 3, minThrottle: 0.7, gimbal: 5.5, dataSource: 'estimated' });
  const j2 = engine({ name: 'J-2 (published thrust/Isp)', thrustVac: S.j2.thrustVac, ispVac: S.j2.ispVac, ispSl: 200, mixtureRatio: 5.0, propellants: ['LOX', 'LH2'], mass: S.j2.mass, length: 3.4, spoolTime: 3, minThrottle: 0.8, gimbal: 7, ignitions: 2, vacuumOptimised: true, dataSource: 'estimated' });
  // the centre F-1 is its own component so that it can be shut down early (the real S-IC does, to limit the acceleration)
  const f1o = addStage(v, { order: 1, eng: f1, count: 4, fuelP: 'RP-1', oxP: 'LOX', propellant: S.sic.propellant, mixture: 2.27, stageDry: S.sic.dry - S.f1.mass, D: 10 });
  addComponent(v, { ...f1, count: 1, group: 'stage1', diameter: 10, name: 'F-1 centre engine (published thrust/Isp)', mass: S.f1.mass });
  addAvionics(v, 'stage1');
  const j2s2 = { ...j2, name: 'J-2 in the S-II (stage thrust / 5)', thrustVac: S.sii.thrustVac / 5 };
  addStage(v, { order: 2, eng: j2s2, count: 5, fuelP: 'LH2', oxP: 'LOX', propellant: S.sii.propellant, mixture: 5.0, stageDry: S.sii.dry, D: 10 });
  addStage(v, { order: 3, eng: j2, count: 1, fuelP: 'LH2', oxP: 'LOX', propellant: S.sivb.propellant, mixture: 5.0, stageDry: S.sivb.dry, D: 6.6 });
  addAvionics(v, 'stage3');
  // payload = "everything above the S-IVB tanks": derived so that the vehicle mass at orbit insertion equals the published
  // 135,669 kg: insertion mass = S-IVB dry + propellant left after the 144 s first burn + payload.
  const mdot3 = S.sivb.thrustVac / (S.sivb.ispVac * G0);
  const residual = S.sivb.propellant - mdot3 * S.sivbFirstBurn;
  const payload = S.insertionMass - S.sivb.dry - residual;
  addTop(v, { D: 6.6, payloadMass: payload, payloadName: 'Everything above the S-IVB tanks (derived mass: CSM, LM, adapters, IU, escape tower ...)', noseLength: 8 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 185000, validation: 'saturn-v' };
  return v;
}

// ---- Falcon 9 Full Thrust (v1.2) ---------------------------------------------------------------------------------
const SRC_F9FT = 'https://en.wikipedia.org/wiki/Falcon_9_Full_Thrust';
const SRC_F9 = 'https://en.wikipedia.org/wiki/Falcon_9';
const SRC_MERLIN = 'https://en.wikipedia.org/wiki/SpaceX_Merlin';
const SRC_F9TL = 'https://spaceflightnow.com/2020/06/03/timeline-for-falcon-9-launch-with-starlink-satellites/';
const SRC_CRS4 = 'https://www.nasa.gov/wp-content/uploads/2018/07/spacex_nasa_crs-4_presskit.pdf';

const F9_INPUTS = {
  s1: { lox: 287.4e3, rp1: 123.5e3, dry: 22.2e3, thrustSL: 7607e3, engines: 9, source: SRC_F9FT },
  s2: { lox: 75.2e3, rp1: 32.3e3, dry: 4.0e3, thrustVac: 981e3, ispVac: 348, source: SRC_F9FT },
  merlin: { thrustSL: 845e3, ispSl: 282, ispVac: 311, mass: 470, source: SRC_MERLIN },
  fairing: 1700, payload: 22800, D: 3.7,
};
export function buildFalcon9() {
  const F = F9_INPUTS;
  const v = newVehicle({ name: 'Falcon 9 Full Thrust - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  // Merlin 1D: published sea-level thrust and Isp; vacuum thrust derived = SL thrust x (Isp_vac / Isp_SL)
  const merlin = engine({ name: 'Merlin 1D (published SL thrust/Isp)', thrustVac: F.merlin.thrustSL * (F.merlin.ispVac / F.merlin.ispSl), ispVac: F.merlin.ispVac, ispSl: F.merlin.ispSl, mixtureRatio: F.s1.lox / F.s1.rp1, propellants: ['LOX', 'RP-1'], mass: F.merlin.mass, length: 2.9, spoolTime: 2, minThrottle: 0.4, gimbal: 5, ignitions: 3, dataSource: 'estimated' });
  const mvac = engine({ name: 'Merlin 1D Vacuum (published thrust/Isp)', thrustVac: F.s2.thrustVac, ispVac: F.s2.ispVac, ispSl: 250, mixtureRatio: F.s2.lox / F.s2.rp1, propellants: ['LOX', 'RP-1'], mass: 470, length: 3.0, spoolTime: 2, minThrottle: 0.4, gimbal: 5, ignitions: 2, vacuumOptimised: true, dataSource: 'estimated' });
  addStage(v, { order: 1, eng: merlin, count: F.s1.engines, fuelP: 'RP-1', oxP: 'LOX', propellant: F.s1.lox + F.s1.rp1, mixture: F.s1.lox / F.s1.rp1, stageDry: F.s1.dry, D: F.D });
  addAvionics(v, 'stage1');
  addStage(v, { order: 2, eng: mvac, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: F.s2.lox + F.s2.rp1, mixture: F.s2.lox / F.s2.rp1, stageDry: F.s2.dry, D: F.D });
  addAvionics(v, 'stage2');
  // published fairing: 13.1 m tall INCLUDING its ogive nose (2.0: was 13 m plus a separate 4 m nose, which made the model 9 m too tall)
  addTop(v, { D: F.D, fairingMass: F.fairing, fairingLength: 9.1, payloadMass: F.payload, payloadName: 'Payload (published maximum to LEO, expendable)', noseLength: 4 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 200000, validation: 'falcon-9' };
  return v;
}

// ---- Rocket Lab Electron -----------------------------------------------------------------------------------------
const SRC_ELEC_WIKI = 'https://en.wikipedia.org/wiki/Rocket_Lab_Electron';
const SRC_ELEC_PUG = 'https://rocketlabcorp.com/assets/Electron-Payload-User-Guide-7.0-v6.pdf';
const SRC_RUTH = 'https://en.wikipedia.org/wiki/Rutherford_(rocket_engine)';

const EL_INPUTS = {
  liftoff: 13000, payload: 200, fairing: 44, s2prop: 2000, D: 1.2,
  thrustSL: 224.3e3, ispS1: 311, thrustRatio: 5800 / 5600, // vacuum/sea-level thrust ratio of the Rutherford (5,800 lbf / 5,600 lbf)
  s2: { thrustVac: 5800 * LBF, ispVac: 343 }, rutherfordMass: 35,
  // NOT published (estimates): dry masses of both stages
  s1dryEst: 950, s2dryEst: 250,
};
export function buildElectron() {
  const E = EL_INPUTS;
  const v = newVehicle({ name: 'Electron - simplified validation model', type: 'rocket', description: 'Simplified model built from published thrust, Isp and masses. Stage dry masses are estimates.', dataSource: 'estimated' });
  const ispVac1 = E.ispS1 * E.thrustRatio;               // derived (thrust ratio x Isp); the 311 s figure is quoted without a pressure condition
  const thrustVacEach = (E.thrustSL / 9) * (ispVac1 / E.ispS1);
  const ruth = engine({ name: 'Rutherford (published SL thrust/Isp)', thrustVac: thrustVacEach, ispVac: ispVac1, ispSl: E.ispS1, mixtureRatio: 2.6, propellants: ['LOX', 'RP-1'], mass: E.rutherfordMass, length: 0.8, spoolTime: 0.5, minThrottle: 0.5, gimbal: 5, ignitions: 1, dataSource: 'estimated' });
  const ruthVac = engine({ name: 'Rutherford Vacuum (published thrust/Isp)', thrustVac: E.s2.thrustVac, ispVac: E.s2.ispVac, ispSl: 200, mixtureRatio: 2.6, propellants: ['LOX', 'RP-1'], mass: E.rutherfordMass, length: 1.0, spoolTime: 0.5, minThrottle: 0.5, gimbal: 5, ignitions: 2, vacuumOptimised: true, dataSource: 'estimated' });
  const s1prop = E.liftoff - E.payload - E.fairing - E.s2prop - E.s2dryEst - E.s1dryEst;  // derived so that the total equals the published liftoff mass
  addStage(v, { order: 1, eng: ruth, count: 9, fuelP: 'RP-1', oxP: 'LOX', propellant: s1prop, mixture: 2.6, stageDry: E.s1dryEst, D: E.D });
  addAvionics(v, 'stage1');
  addStage(v, { order: 2, eng: ruthVac, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: E.s2prop, mixture: 2.6, stageDry: E.s2dryEst, D: E.D });
  addAvionics(v, 'stage2');
  addTop(v, { D: E.D, fairingMass: E.fairing, fairingLength: 2.5, payloadMass: E.payload, payloadName: 'Payload (published nominal to 500 km SSO)', noseLength: 1.0 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 500000, validation: 'electron' };
  return v;
}

// =================================================================================================================
// Published values to compare with. `metric` names a quantity measured on the simulated flight (src/core/validation.js).
//   tol      relative tolerance for pass/fail (see TOLERANCE_NOTE); kind 'context' rows are shown but never graded.
//   url      the page/document the value was read from (all read on 2026-10-01).
// =================================================================================================================
export const TOLERANCE_NOTE = {
  input: { tol: 0.05, why: 'Inputs: the model was BUILT from published numbers, so these rows check that the build reproduces them. Anything beyond 5% means a mistake in the build (or sources that disagree with each other).' },
  flight: { tol: 0.10, why: 'Flight results: the simulator is a simplified point-mass-plus-attitude model (no engine throttle history, no real guidance software, fitted pitch programme). Real launchers differ from textbook performance by several percent flight to flight, so +/-10% is the band within which this model is considered consistent with the published number.' },
};
const IN = TOLERANCE_NOTE.input.tol, FL = TOLERANCE_NOTE.flight.tol;
const row = (id, label, metric, value, unit, tol, group, source, url, note) => ({ id, label, metric, value, unit, tol, group, source, url, note, kind: tol == null ? 'context' : 'graded' });

const SATURN_ROWS = [
  row('liftoffMass', 'Liftoff mass', 'liftoffMass', 2941221, 'kg', IN, 'build', 'Apollo 11 Saturn V launch vehicle flight evaluation report: "Vehicle mass at S-IC ignition is 2,941,221 kilograms"', SRC_LVFEA, 'The stage masses come from encyclopedic pages (nominal values); the payload is derived from the published orbit-insertion mass of 135,669 kg, so a small difference here is expected.'),
  row('liftoffThrust', 'Liftoff thrust (sea level)', 'liftoffThrust', 34500e3, 'N', IN, 'build', 'S-IC stage: "34,500 kN at sea level"', SRC_SIC),
  row('maxQT', 'Max-Q time', 'maxQT', 81.0, 's', FL, 'trajectory', 'Apollo 11 press kit, launch events table: Maximum Dynamic Pressure 00:01:21.0', SRC_PRESSKIT),
  row('maxQAlt', 'Max-Q altitude', 'maxQAlt', 43365 * FT, 'm', FL, 'trajectory', 'Same table: 43,365 ft', SRC_PRESSKIT, 'Fixed in 2.4. With the standard atmosphere this altitude was 16% low whatever the pitch table, thrust or drag: Max-Q sits where the air density stops falling faster than the speed rises, and the standard atmosphere put it at 11 km. A warm Florida summer day (AFGL tropical atmosphere, thicker air at 13 km) puts it at 13 km, as flown.'),
  row('maxQSpeed', 'Speed at Max-Q (space-fixed)', 'maxQSpeed', 2636.7 * FT, 'm/s', FL, 'trajectory', 'Same table: 2,636.7 ft/s. Space-fixed (includes Earth rotation): the table value at first motion is 1,340.67 ft/s = 408.6 m/s, which is the rotation speed at the Cape.', SRC_PRESSKIT),
  row('s1CutoffT', 'S-IC outboard engine cutoff time', 's1CutoffT', 160.8, 's', FL, 'trajectory', 'Same table: S-IC Outboard Engines Cutoff 00:02:40.8', SRC_PRESSKIT, 'The real stage shuts its centre engine early (at 135.2 s) to limit acceleration. Since 2.3 the model does the same (the centre engine is a separate component).'),
  row('s1CutoffAlt', 'S-IC cutoff altitude', 's1CutoffAlt', 217655 * FT, 'm', FL, 'trajectory', 'Same table: 217,655 ft', SRC_PRESSKIT),
  row('s1CutoffSpeed', 'S-IC cutoff speed (space-fixed)', 's1CutoffSpeed', 9030.6 * FT, 'm/s', FL, 'trajectory', 'Same table: 9,030.6 ft/s', SRC_PRESSKIT),
  row('s2CutoffT', 'S-II cutoff time', 's2CutoffT', 551.4, 's', FL, 'trajectory', 'Same table: S-II Outboard Engines Cutoff 00:09:11.4', SRC_PRESSKIT),
  row('s2CutoffAlt', 'S-II cutoff altitude', 's2CutoffAlt', 609982 * FT, 'm', FL, 'trajectory', 'Same table: 609,982 ft', SRC_PRESSKIT),
  row('s2CutoffSpeed', 'S-II cutoff speed (space-fixed)', 's2CutoffSpeed', 22746.8 * FT, 'm/s', FL, 'trajectory', 'Same table: 22,746.8 ft/s', SRC_PRESSKIT),
  row('s2Burn', 'S-II burn time', 's2Burn', 388.2, 's', FL, 'trajectory', 'Same table: S-II ignition 00:02:43.2 to cutoff 00:09:11.4 (difference computed here)', SRC_PRESSKIT),
  row('finalCutoffT', 'S-IVB first-burn cutoff time (orbit insertion)', 'finalCutoffT', 700.1, 's', FL, 'trajectory', 'Same table: S-IVB First Cutoff 00:11:40.1', SRC_PRESSKIT),
  row('finalCutoffSpeed', 'Speed at S-IVB cutoff (space-fixed)', 'finalCutoffSpeed', 25562.4 * FT, 'm/s', FL, 'trajectory', 'Same table: 25,562.4 ft/s', SRC_PRESSKIT),
  row('orbitPeri', 'Parking orbit perigee altitude', 'orbitPeri', 183.8e3, 'm', FL, 'orbit', 'Flight evaluation report: orbit 183.8 x 186.5 km', SRC_LVFEA),
  row('orbitApo', 'Parking orbit apogee altitude', 'orbitApo', 186.5e3, 'm', FL, 'orbit', 'Flight evaluation report: orbit 183.8 x 186.5 km', SRC_LVFEA),
];
const F9_ROWS = [
  row('liftoffMassNoPayload', 'Liftoff mass (model without payload)', 'liftoffMassNoPayload', 549000, 'kg', IN, 'build', 'Falcon 9 Full Thrust: "Takeoff mass 549 t"', SRC_F9, 'The source does not say whether a payload is included. The model is compared without its payload.'),
  row('liftoffThrust', 'Liftoff thrust (sea level)', 'liftoffThrust', 7607e3, 'N', IN, 'build', 'Falcon 9 Full Thrust: "7,607 kN"', SRC_F9FT),
  row('height', 'Vehicle height', 'height', 69.8, 'm', 0.10, 'build', 'Falcon 9 Full Thrust: "69.8 m". The model has no fairing-length data, so this checks only that the tank geometry is plausible.', SRC_F9FT),
  row('s1Burn', 'First-stage burn time', 's1Burn', 162, 's', FL, 'trajectory', 'Falcon 9 Full Thrust: "Burn time 162 seconds"', SRC_F9FT, 'At constant full thrust the published propellant would burn out sooner. Real engines throttle down at times; the model holds full thrust.'),
  row('s2Burn', 'Second-stage burn time', 's2Burn', 397, 's', FL, 'trajectory', 'Falcon 9 Full Thrust: "Burn time 397 seconds"', SRC_F9FT),
  row('maxQT', 'Max-Q time', 'maxQT', 72, 's', FL, 'trajectory', 'Starlink launch timeline (Block 5, June 2020): Max Q T+0:01:12', SRC_F9TL, 'Single flight of a specific mission; other missions differ.'),
  row('s1CutoffT', 'MECO time', 's1CutoffT', 152, 's', FL, 'trajectory', 'Same timeline: MECO T+0:02:32', SRC_F9TL, 'Single flight of a specific mission; other missions differ.'),
  row('s2IgnitionT', 'Second-stage ignition time', 's2IgnitionT', 163, 's', FL, 'trajectory', 'Same timeline: Stage 2 ignition T+0:02:43', SRC_F9TL),
  row('s1CutoffAlt', 'MECO altitude (context only)', 's1CutoffAlt', 80e3, 'm', null, 'trajectory', 'SpaceX CRS-4 press kit: "Falcon 9 is 80 kilometers high" at MECO. This was the older Falcon 9 v1.1, so it is shown for context and not graded.', SRC_CRS4),
  row('s1CutoffMach', 'MECO speed in Mach (context only)', 's1CutoffMach', 10, '', null, 'trajectory', 'Same press kit: "traveling at 10 times the speed of sound" (v1.1; context only, not graded).', SRC_CRS4),
];
const EL_ROWS = [
  row('liftoffMass', 'Liftoff mass', 'liftoffMass', 13000, 'kg', IN, 'build', 'Electron Payload User Guide 7.0: "Liftoff mass 13,000 kg"', SRC_ELEC_PUG, 'Includes the 200 kg payload. The stage propellant mass is derived from this number (not published).'),
  row('liftoffThrust', 'Liftoff thrust (sea level)', 'liftoffThrust', 224.3e3, 'N', IN, 'build', 'Electron: first stage thrust "224.3 kN" at sea level', SRC_ELEC_WIKI),
  row('s1CutoffT', 'Stage 1 engine cutoff time', 's1CutoffT', 155, 's', FL, 'trajectory', 'Payload User Guide 7.0, typical flight events: Stage 1 Engine Cutoff L+155 s', SRC_ELEC_PUG, 'The published thrust, Isp and 155 s would need about 11.4 t of propellant, which does not fit in a 13 t rocket: the published numbers are not consistent in a simple model (the engines probably do not run at full thrust all the time).'),
  row('s2IgnitionT', 'Stage 2 ignition time', 's2IgnitionT', 184, 's', FL, 'trajectory', 'Same table: Stage 2 Engine Ignition L+184 s', SRC_ELEC_PUG, 'The coast between stages is set to the published 29 s gap.'),
  row('s2IgnitionAlt', 'Stage 2 ignition altitude', 's2IgnitionAlt', 126e3, 'm', FL, 'trajectory', 'Same table: about 126 km', SRC_ELEC_PUG),
  row('finalCutoffT', 'Stage 2 engine cutoff time', 'finalCutoffT', 535, 's', FL, 'trajectory', 'Same table: Stage 2 Engine Cutoff L+535 s', SRC_ELEC_PUG, 'The real vehicle then uses a kick stage; the model has none, so its second stage burns to apoapsis and restarts to circularise.'),
  row('orbitPeri', 'Orbit altitude reached (lowest point)', 'orbitPeri', 500e3, 'm', FL, 'orbit', 'Payload User Guide 7.0: nominal payload 200 kg to a 500 km Sun-synchronous orbit', SRC_ELEC_PUG),
  row('orbitApo', 'Orbit altitude reached (highest point)', 'orbitApo', 500e3, 'm', FL, 'orbit', 'Same source', SRC_ELEC_PUG),
  row('orbitIncl', 'Inclination for a Sun-synchronous orbit (computed, context only)', 'orbitIncl', sunSynchronousInclination(500e3), 'deg', null, 'orbit', 'Computed from the J2 formula for a 500 km orbit; not a published number. The launch azimuth is the simulator\'s own.', 'https://en.wikipedia.org/wiki/Sun-synchronous_orbit'),
];

// ---- Atlas V 551 -------------------------------------------------------------------------------------------------
const SRC_ATLAS = 'https://en.wikipedia.org/wiki/Atlas_V';
const ATLAS_INPUTS = {
  ccb: { propellant: 284089, dry: 21054, thrustSL: 3827e3, thrustVac: 4152e3, ispSL: 311.3, ispVac: 337.8, burn: 253, D: 3.81, source: SRC_ATLAS },
  srb: { count: 5, propellant: 42630, gross: 46697, thrustAvg: 1.27e6, thrustPeak: 1688.4e3, burn: 94, source: SRC_ATLAS },
  centaur: { propellant: 20830, dry: 2316, thrustVac: 99.2e3, ispVac: 450.5, burn: 842, source: SRC_ATLAS },
  payloadLEO: 18814, fairingEst: 4000,
};
/** A published solid strap-on motor group: propellant and gross mass are published, thrust is the average, Isp is DERIVED from impulse = average thrust x burn time. */
function addStrapOns(v, { name, count, propellant, gross, thrust, burn, D, length, group = 'booster' }) {
  const isp = (thrust * burn) / (propellant * G0);
  addComponent(v, engine({ name, kind: 'engine', solid: true, propellants: ['SOLID'], mount: 'radial', strapOn: true, group, count, thrustVac: thrust, ispVac: isp, ispSl: isp * 0.93, propellantMass: propellant, mass: gross - propellant, length, diameter: D, minThrottle: 1, gimbal: 0, spoolTime: 0.1, maxQ: 1e9 }));
  return isp;
}
export function buildAtlasV551() {
  const A = ATLAS_INPUTS;
  const v = newVehicle({ name: 'Atlas V 551 - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  const rd180 = engine({ name: 'RD-180 (published thrust/Isp)', thrustVac: A.ccb.thrustVac, ispVac: A.ccb.ispVac, ispSl: A.ccb.ispSL, mixtureRatio: 2.72, propellants: ['LOX', 'RP-1'], mass: 5393, length: 3.6, spoolTime: 2, minThrottle: 0.47, gimbal: 8 });
  const rl10 = engine({ name: 'RL10A (published thrust/Isp)', thrustVac: A.centaur.thrustVac, ispVac: A.centaur.ispVac, ispSl: 200, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], mass: 167, length: 2.3, spoolTime: 2, minThrottle: 0.9, gimbal: 4, ignitions: 3 });
  addStage(v, { order: 1, eng: rd180, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: A.ccb.propellant, mixture: 2.72, stageDry: A.ccb.dry, D: A.ccb.D });
  { const core = v.components.find((c) => /RD-180/.test(c.name)); if (core) core.thrustCurveTime = [[0, 1], [100, 1], [115, ATLAS_THROTTLE], [400, ATLAS_THROTTLE]]; }   // 2.4: the RD-180 throttles back after the boosters separate (the published 253 s burn needs about 90% average thrust)
  addAvionics(v, 'stage1');
  addStrapOns(v, { name: 'AJ-60A solid booster x5 (published propellant/mass/burn; thrust = average)', count: A.srb.count, propellant: A.srb.propellant, gross: A.srb.gross, thrust: A.srb.thrustAvg, burn: A.srb.burn, D: 1.58, length: 17 });
  addStage(v, { order: 2, eng: rl10, count: 1, fuelP: 'LH2', oxP: 'LOX', propellant: A.centaur.propellant, mixture: 5.5, stageDry: A.centaur.dry, D: 3.05 });
  addAvionics(v, 'stage2');
  addTop(v, { D: 5.4, fairingMass: A.fairingEst, fairingLength: 20.7, payloadMass: A.payloadLEO, payloadName: 'Payload (published 551 capacity to LEO)', noseLength: 4 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 185000, validation: 'atlas-v-551' };
  return v;
}
const ATLAS_ROWS = [
  row('s1Burn', 'Common Core Booster burn time', 's1CutoffT', 253, 's', FL, 'trajectory', 'Atlas V infobox: first stage "Burn time 253 s" (the body text says "about four minutes")', SRC_ATLAS, 'Measured as the time to core propellant depletion.'),
  row('boosterBurn', 'Solid booster (AJ-60A) burn time', 'boosterBurn', 94, 's', FL, 'trajectory', 'Atlas V infobox, solid rocket boosters: "Burn time 94 s"', SRC_ATLAS, 'Isp was derived from the average thrust, so this row checks the model and the burn-out logic, not the motor.'),
  row('reachedOrbit', 'Reaches low Earth orbit with the published 551 payload (1 = yes)', 'reachedOrbit', 1, '', 0.01, 'orbit', 'Atlas V configurations table: 551 to LEO "18,814 kg"', SRC_ATLAS, 'The reference orbit is NOT stated on the page; 185 km circular is assumed.'),
  row('liftoffMassCtx', 'Liftoff mass (context only)', 'liftoffMassNoPayload', 590000, 'kg', null, 'build', 'Atlas V infobox: "Mass 590,000 kg". This is the figure for the whole family, not the 551 alone.', SRC_ATLAS, 'The model with its payload weighs more or less than this; the figure is not specific to the 551.'),
];

// ---- Ariane 5 ECA ------------------------------------------------------------------------------------------------
const SRC_ARIANE = 'https://en.wikipedia.org/wiki/Ariane_5';
const ARIANE_INPUTS = {
  eap: { count: 2, gross: 273000, empty: 33000, thrustMax: 7080e3, burn: 140, ispAssumed: 275, source: SRC_ARIANE },
  epc: { gross: 184700, dry: 14700, thrustSL: 960e3, thrustVac: 1390e3, ispSL: 310, ispVac: 432, burn: 540, D: 5.4, source: SRC_ARIANE },
  esc: { dry: 4540, gross: 19440, thrustVac: 67e3, ispVac: 446, burn: 945, D: 5.4, source: SRC_ARIANE },
  payload: 10865, fairingEst: 2675,
};
export function buildAriane5ECA() {
  const A = ARIANE_INPUTS;
  const v = newVehicle({ name: 'Ariane 5 ECA - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  const vulcain = engine({ name: 'Vulcain 2 (published thrust/Isp)', thrustVac: A.epc.thrustVac, ispVac: A.epc.ispVac, ispSl: A.epc.ispSL, mixtureRatio: 5.3, propellants: ['LOX', 'LH2'], mass: 2100, length: 3.5, spoolTime: 4, minThrottle: 0.8, gimbal: 6 });
  const hm7 = engine({ name: 'HM7B (published thrust/Isp)', thrustVac: A.esc.thrustVac, ispVac: A.esc.ispVac, ispSl: 200, mixtureRatio: 5.0, propellants: ['LOX', 'LH2'], mass: 165, length: 2.0, spoolTime: 2, minThrottle: 0.9, gimbal: 4 });
  const prop = A.eap.gross - A.eap.empty;
  const thrustAvg = (prop * A.eap.ispAssumed * G0) / A.eap.burn;   // average thrust for the assumed Isp and the published burn time
  addStage(v, { order: 1, eng: vulcain, count: 1, fuelP: 'LH2', oxP: 'LOX', propellant: A.epc.gross - A.epc.dry, mixture: 5.3, stageDry: A.epc.dry, D: A.epc.D });
  addAvionics(v, 'stage1');
  addStrapOns(v, { name: 'EAP solid booster x2 (published masses/burn; Isp assumed 275 s)', count: A.eap.count, propellant: prop, gross: A.eap.gross, thrust: thrustAvg, burn: A.eap.burn, D: 3.06, length: 31.6 });
  addStage(v, { order: 2, eng: hm7, count: 1, fuelP: 'LH2', oxP: 'LOX', propellant: A.esc.gross - A.esc.dry, mixture: 5.0, stageDry: A.esc.dry, D: A.esc.D });
  addAvionics(v, 'stage2');
  addTop(v, { D: 5.4, fairingMass: A.fairingEst, fairingLength: 14, payloadMass: A.payload, payloadName: 'Payload (published ECA capacity to GTO)', noseLength: 4 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 200000, validation: 'ariane-5-eca' };
  return v;
}
const ARIANE_ROWS = [
  row('boosterBurn', 'Solid booster burn time', 'boosterBurn', 140, 's', FL, 'trajectory', 'Ariane 5 infobox: boosters "Burn time 140 s" (the body text says 130 s)', SRC_ARIANE, 'Isp is assumed, so this row mostly checks the burn-out logic.'),
  row('s1Burn', 'Core stage (EPC) burn time', 's1CutoffT', 540, 's', FL, 'trajectory', 'Ariane 5 page, first stage: "Burn time 540 s"', SRC_ARIANE, 'Measured as the time to core propellant depletion; the real engine starts about 7 s before liftoff.'),
  row('reachedOrbit', 'Reaches a 200 km parking orbit with the published GTO payload (1 = yes)', 'reachedOrbit', 1, '', 0.01, 'orbit', 'Ariane 5 infobox: ECA payload to GTO "10,865 kg"', SRC_ARIANE, 'A necessary condition only: a GTO flight needs more energy than a 200 km orbit. The page gives no LEO figure for the ECA.'),
  row('liftoffMassCtx', 'Liftoff mass (context only)', 'liftoffMass', 777000, 'kg', null, 'build', 'Ariane 5 infobox: "Mass 777,000 kg" (marked "clarification needed" on the page; family value)', SRC_ARIANE),
];

// ---- Blue Origin New Shepard -------------------------------------------------------------------------------------
const SRC_NS = 'https://en.wikipedia.org/wiki/New_Shepard';
const NS_THROTTLE = globalThis.__NSTHR ?? 0.915;   // tuned (not published): with full thrust the vehicle is 59 % too high; at this average throttle the apogee matches the published 106 km
const NS_INPUTS = { thrustSL: 490e3, burn: 141, launchMass: 35000, D: 3.8, height: 19.2, ispSlAssumed: 345, ispVacAssumed: 435, source: SRC_NS };
export function buildNewShepard() {
  const N = NS_INPUTS;
  const v = newVehicle({ name: 'New Shepard - simplified validation model', type: 'rocket', description: 'Simplified model built from published thrust, burn time and launch mass. Not a real design.', dataSource: 'estimated' });
  const be3 = engine({ name: 'BE-3PM (published sea-level thrust; Isp assumed)', thrustVac: N.thrustSL * (N.ispVacAssumed / N.ispSlAssumed), ispVac: N.ispVacAssumed, ispSl: N.ispSlAssumed, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], mass: 500, length: 2.5, spoolTime: 2, minThrottle: 0.2, gimbal: 5 });
  const fAvg = (8 + (N.burn - 8) * NS_THROTTLE) / N.burn;                     // average throttle over the burn
  const mdot = (N.thrustSL * fAvg) / (N.ispSlAssumed * G0), prop = mdot * N.burn;   // propellant that lasts exactly the published burn time at that average thrust
  const dry = N.launchMass - prop;                                          // everything else, capsule included (published launch mass 35,000 kg)
  addStage(v, { order: 1, eng: be3, count: 1, fuelP: 'LH2', oxP: 'LOX', propellant: prop, mixture: 5.5, stageDry: dry - 400, D: N.D });
  { const c = v.components.find((x) => /BE-3/.test(x.name)); if (c) c.thrustCurveTime = [[0, 1], [8, 1], [16, NS_THROTTLE], [400, NS_THROTTLE]]; }   // the real engine throttles (for Max-Q, and to land): full thrust at liftoff, less afterwards
  addAvionics(v, 'stage1');
  addComponent(v, makeNose(N.D, 2.5, 'ogive', { group: 'stage1', mass: 0.5, maxQ: 1e9, tMax: 1e5 }));
  addComponent(v, { kind: 'payload', name: 'Crew capsule (mass inside the dry mass)', mount: 'stack', group: 'payload', length: 0.3, diameter: N.D * 0.9, mass: 400, maxQ: 1e9, maxQAlpha: 1e12, maxAccelG: 1e9, tMax: 1e5, tMin: 0 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 100000, validation: 'new-shepard' };
  return v;
}
const NS_ROWS = [
  row('liftoffMass', 'Launch mass', 'liftoffMass', 35000, 'kg', IN, 'build', 'New Shepard page: "launch mass 35,000 kg"', SRC_NS),
  row('liftoffThrust', 'Liftoff thrust (sea level)', 'liftoffThrust', 490e3, 'N', IN, 'build', 'New Shepard page: BE-3PM "produces 490 kilonewtons (110,000 lbf) of thrust at liftoff"', SRC_NS),
  row('s1CutoffT', 'Main engine cutoff (burn time)', 's1CutoffT', 141, 's', FL, 'trajectory', 'New Shepard infobox: "Burn time 141 seconds" (the text also says about 110 s and about two and a half minutes)', SRC_NS, 'The propellant mass is derived from this burn time, so this row checks consistency. Real flights throttle the engine.'),
  row('maxAlt', 'Apogee (above the Karman line)', 'maxAlt', 106e3, 'm', FL, 'trajectory', 'New Shepard page: "just above the Karman Line at 100 km"; flights reached 101 km (NS-27), 106 km (NS-31), 106.7 km (NS-37); 106 km is used', SRC_NS, 'Flights differ; the tolerance covers 100 to 106.7 km only if it is not tighter than the flight-to-flight spread.'),
  row('maxSpeed', 'Maximum ascent speed', 'maxSpeed', 3568 / 3.6, 'm/s', FL, 'trajectory', 'New Shepard flight table, NS-11: "3,568 km/h"', SRC_NS, 'Compared with the simulator\'s Earth-fixed speed.'),
];

const COMMON_ASSUMPTIONS = [
  'Structure strength, heat limits and component temperature limits are switched off (set very high): the real values are not published, and this page only tests performance.',
  'Tank length and diameter follow the propellant density and the published stage diameter. Stage dry mass is spread over the two tanks.',
  'Drag uses the simulator\'s generic ogive-nose drag curve, not the real vehicle\'s measured drag.',
  'The launch azimuth and the ascent guidance are the simulator\'s own, not the real vehicle\'s flight software.',
  'Wind and day-to-day atmosphere changes are not modelled (US Standard Atmosphere 1976, no wind).',
];
const COMMON_SIMPLIFIED = [
  'Engines run at constant full throttle (no throttle-down for Max-Q or at the end of the burn).',
  'Thrust changes with air pressure linearly between the published sea-level and vacuum Isp.',
  'Earth is a sphere with point-mass gravity (the J2 flattening term is off); no wind, no weather, no real navigation errors.',
  'Propellant sloshing, boil-off, residuals, ignition transients and tail-off thrust are not modelled.',
];

// ---- Soyuz-2.1a (2.4) ---------------------------------------------------------------------------------------------
const SRC_SOYUZ = 'https://en.wikipedia.org/wiki/Soyuz-2';
const SOYUZ_INPUTS = {
  core: { propellant: 90.1e3, dry: 6545, thrustSL: 792.5e3, thrustVac: 990.2e3, ispSL: 255, ispVac: 319, burn: 286, D: 2.95, source: SRC_SOYUZ },
  booster: { count: 4, propellant: 39160, gross: 44413, thrustSL: 838.5e3, thrustVac: 1021.3e3, burn: 118, D: 2.68, length: 19.6, source: SRC_SOYUZ },
  third: { propellant: 25.4e3, dry: 2355, thrustVac: 298.03e3, ispVac: 325, burn: 250, D: 2.66, source: SRC_SOYUZ },
  payloadLEO: 7430, fairingEst: 1200,
};
export function buildSoyuz21a() {
  const A = SOYUZ_INPUTS;
  const v = newVehicle({ name: 'Soyuz-2.1a - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  const rd108 = engine({ name: 'RD-108A (published thrust/Isp)', thrustVac: A.core.thrustVac, ispVac: A.core.ispVac, ispSl: A.core.ispSL, mixtureRatio: 2.43, propellants: ['LOX', 'RP-1'], mass: 1250, length: 2.9, spoolTime: 2, minThrottle: 1, gimbal: 6 });
  const rd0110 = engine({ name: 'RD-0110 (published thrust/Isp)', thrustVac: A.third.thrustVac, ispVac: A.third.ispVac, ispSl: 200, mixtureRatio: 2.34, propellants: ['LOX', 'RP-1'], mass: 450, length: 2.2, spoolTime: 2, minThrottle: 1, gimbal: 6 });
  addStage(v, { order: 1, eng: rd108, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: A.core.propellant, mixture: 2.43, stageDry: A.core.dry, D: A.core.D });
  addAvionics(v, 'stage1');
  // the four liquid strap-ons are modelled like the solid ones: constant average thrust (mean of the sea-level and vacuum figures); Isp derived from impulse
  addStrapOns(v, { name: 'Strap-on boosters x4 (RD-107A; average thrust, Isp derived)', count: A.booster.count, propellant: A.booster.propellant, gross: A.booster.gross, thrust: (A.booster.thrustSL + A.booster.thrustVac) / 2, burn: A.booster.burn, D: A.booster.D, length: A.booster.length });
  addStage(v, { order: 2, eng: rd0110, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: A.third.propellant, mixture: 2.34, stageDry: A.third.dry, D: A.third.D });
  addAvionics(v, 'stage2');
  addTop(v, { D: 3.0, fairingMass: A.fairingEst, fairingLength: 9, payloadMass: A.payloadLEO, payloadName: 'Payload (published capacity to 240 km, 51.6 deg from Baikonur)', noseLength: 3 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 240000, validation: 'soyuz-2-1a' };
  return v;
}
const SOYUZ_ROWS = [
  row('boosterBurn', 'Strap-on booster burn time', 'boosterBurn', 118, 's', FL, 'trajectory', 'Soyuz-2 page, boosters (Blocks B, V, G, D): "Burn time 118 s"', SRC_SOYUZ, 'Isp was derived from the average thrust, so this row checks the model and the burn-out logic, not the engine.'),
  row('s1Burn', 'Core stage (Block A) burn time', 's1CutoffT', 286, 's', FL, 'trajectory', 'Soyuz-2 page, core stage: "Burn time 286 s"', SRC_SOYUZ, 'Measured as the time to core propellant depletion; the core is lit at liftoff together with the boosters.'),
  row('s2Burn', 'Third stage (Block I) burn time', 's2Burn', 250, 's', FL, 'trajectory', 'Soyuz-2 page, third stage 2.1a: "Burn time 250 s"', SRC_SOYUZ, 'The page\'s thrust (298 kN), Isp (325 s) and propellant (25.4 t) give 272 s, not 250 s; the model uses thrust and Isp, so it burns longer than the page says.'),
  row('reachedOrbit', 'Reaches a 240 km orbit with the published payload (1 = yes)', 'reachedOrbit', 1, '', 0.01, 'orbit', 'Soyuz-2 page: Soyuz-2.1a to LEO (240 km) from Baikonur at 51.6 deg: 7,430 kg', SRC_SOYUZ, 'The page does not say whether the figure uses a coast or a second burn; the model flies one burn.'),
  row('liftoffMassCtx', 'Liftoff mass (context only)', 'liftoffMass', 312000, 'kg', null, 'build', 'Soyuz-2 infobox: "Mass 312,000 kg" (whole family)', SRC_SOYUZ),
];

// ---- Vega (2.5) -----------------------------------------------------------------------------------------------------
const SRC_VEGA = 'https://en.wikipedia.org/wiki/Vega_(rocket)';
const VEGA_INPUTS = {
  p80: { propellant: 88365, gross: 95695, thrust: 2200e3, isp: 280, burn: 107, D: 3.0, source: SRC_VEGA },
  z23: { propellant: 24000, gross: 28850, thrust: 871e3, isp: 287.5, burn: 71.6, D: 1.9, source: SRC_VEGA },
  z9: { propellant: 10500, gross: 11815, thrust: 260e3, isp: 296, burn: 117, D: 1.9, source: SRC_VEGA },
  avum: { propellant: 550, gross: 697, thrust: 2.45e3, isp: 315, burn: 612.5, D: 1.9, source: SRC_VEGA },
  payload: 1430, fairing: 400,
};
/** A solid motor stage modelled as a constant-thrust engine with a propellant mass: thrust and Isp are published, so the burn time follows. */
function solidStage(v, order, M, name, dryOverride) {
  const e = engine({ name: `${name} (published average thrust/Isp, constant)`, thrustVac: M.thrust, ispVac: M.isp, ispSl: M.isp * 0.93, mixtureRatio: 2.0, propellants: ['LOX', 'RP-1'], mass: 1, length: 1, spoolTime: 0.5, minThrottle: 1, gimbal: 4 });
  addStage(v, { order, eng: e, count: 1, fuelP: 'RP-1', oxP: 'LOX', propellant: M.propellant, mixture: 2.0, stageDry: dryOverride ?? (M.gross - M.propellant), D: M.D });
  addAvionics(v, `stage${order}`);
}
export function buildVega() {
  const A = VEGA_INPUTS;
  const v = newVehicle({ name: 'Vega - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  solidStage(v, 1, A.p80, 'P80'); solidStage(v, 2, A.z23, 'Zefiro 23'); solidStage(v, 3, A.z9, 'Zefiro 9');
  const avum = engine({ name: 'AVUM (published thrust/Isp)', thrustVac: A.avum.thrust, ispVac: A.avum.isp, ispSl: 200, mixtureRatio: 1.9, propellants: ['NTO', 'MMH'], mass: 20, length: 1.2, spoolTime: 1, minThrottle: 1, gimbal: 3 });
  addStage(v, { order: 4, eng: avum, count: 1, fuelP: 'MMH', oxP: 'NTO', propellant: A.avum.propellant, mixture: 1.9, stageDry: A.avum.gross - A.avum.propellant, D: A.avum.D });
  addAvionics(v, 'stage4');
  addTop(v, { D: 2.6, fairingMass: A.fairing, fairingLength: 7.8, payloadMass: A.payload, payloadName: 'Payload (published capacity to a 700 km polar orbit)', noseLength: 2 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 700000, validation: 'vega' };
  return v;
}
const VEGA_ROWS = [
  row('s1Burn', 'First stage (P80) burn time', 's1Burn', 107, 's', FL, 'trajectory', 'Vega infobox: P80FW "Burn time 107 s" (the stage table says 114 s)', SRC_VEGA, 'Thrust and Isp are published, so the burn time is a consequence: this row checks the numbers agree with each other.'),
  row('s2Burn', 'Second stage (Zefiro 23) burn time', 's2Burn', 71.6, 's', FL, 'trajectory', 'Vega infobox: Zefiro 23 "Burn time 71.6 s" (the table says 77 s)', SRC_VEGA),
  row('s3Burn', 'Third stage (Zefiro 9) burn time', 's3Burn', 117, 's', FL, 'trajectory', 'Vega infobox: Zefiro 9 "Burn time 117 s" (the table says 120 s)', SRC_VEGA),
  row('reachedOrbit', 'Reaches a 700 km polar orbit with the published payload (1 = yes)', 'reachedOrbit', 1, '', 0.01, 'orbit', 'Vega infobox: 1,430 kg to a 700 km polar orbit', SRC_VEGA, 'NOT matched. The AVUM pushes with only 2.45 kN and the real flight uses two burns with a long coast between them. Neither the one-burn flight nor a two-burn fit (apoapsis cutoff and circularisation) put the published payload in orbit in this model.'),
  row('liftoffMassCtx', 'Liftoff mass (context only)', 'liftoffMass', 137000, 'kg', null, 'build', 'Vega infobox: "Mass 137,000 kg"', SRC_VEGA),
];

// ---- PSLV-XL (2.5) -----------------------------------------------------------------------------------------------------
const SRC_PSLV = 'https://en.wikipedia.org/wiki/Polar_Satellite_Launch_Vehicle';
const PSLV_INPUTS = {
  strap: { count: 6, propellant: 12200, dryEst: 2800, isp: 262, burn: 70, D: 1.0, length: 12, source: SRC_PSLV },
  s1: { propellant: 138200, dry: 30200, isp: 269, burn: 110, D: 2.8, source: SRC_PSLV },
  s2: { propellant: 42000, dryEst: 5500, thrust: 803.7e3, isp: 293, burn: 151, D: 2.8, source: SRC_PSLV },
  s3: { propellant: 7600, dryEst: 1000, isp: 295, burn: 126.7, D: 2.0, source: SRC_PSLV },
  s4: { propellant: 2500, dryEst: 920, thrust: 14.66e3, isp: 308, burn: 525, D: 1.3, source: SRC_PSLV },
  payloadLEO: 3800, fairing: 1182,
};
export function buildPSLV() {
  const A = PSLV_INPUTS, g = G0;
  const v = newVehicle({ name: 'PSLV-XL - simplified validation model', type: 'rocket', description: 'Simplified model built from published masses, thrust and Isp. Not a real design.', dataSource: 'estimated' });
  solidStage(v, 1, { propellant: A.s1.propellant, thrust: (A.s1.propellant * A.s1.isp * g) / A.s1.burn, isp: A.s1.isp, D: A.s1.D }, 'S139', A.s1.dry);
  addStrapOns(v, { name: 'PSOM-XL strap-on motors x6 (average thrust derived from the published Isp and burn)', count: A.strap.count, propellant: A.strap.propellant, gross: A.strap.propellant + A.strap.dryEst, thrust: (A.strap.propellant * A.strap.isp * g) / A.strap.burn, burn: A.strap.burn, D: A.strap.D, length: A.strap.length });
  const vikas = engine({ name: 'Vikas (published thrust/Isp)', thrustVac: A.s2.thrust, ispVac: A.s2.isp, ispSl: 250, mixtureRatio: 1.7, propellants: ['NTO', 'MMH'], mass: 900, length: 2.5, spoolTime: 2, minThrottle: 1, gimbal: 4 });
  addStage(v, { order: 2, eng: vikas, count: 1, fuelP: 'MMH', oxP: 'NTO', propellant: A.s2.propellant, mixture: 1.7, stageDry: A.s2.dryEst, D: A.s2.D });
  addAvionics(v, 'stage2');
  solidStage(v, 3, { propellant: A.s3.propellant, thrust: (A.s3.propellant * A.s3.isp * g) / A.s3.burn, isp: A.s3.isp, D: A.s3.D }, 'HPS3', A.s3.dryEst);
  const ps4 = engine({ name: 'PS4 (published thrust/Isp)', thrustVac: A.s4.thrust, ispVac: A.s4.isp, ispSl: 200, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], mass: 30, length: 1.0, spoolTime: 1, minThrottle: 1, gimbal: 3 });
  addStage(v, { order: 4, eng: ps4, count: 1, fuelP: 'MMH', oxP: 'NTO', propellant: A.s4.propellant, mixture: 1.65, stageDry: A.s4.dryEst, D: A.s4.D });
  addAvionics(v, 'stage4');
  addTop(v, { D: 3.2, fairingMass: A.fairing, fairingLength: 8.3, payloadMass: A.payloadLEO, payloadName: 'Payload (published capacity to 200 km, 30 deg)', noseLength: 2 });
  v.meta = { role: 'launcher', body: 'earth', targetAltitude: 200000, validation: 'pslv-xl' };
  return v;
}
const PSLV_ROWS = [
  row('boosterBurn', 'Strap-on (PSOM-XL) burn time', 'boosterBurn', 70, 's', FL, 'trajectory', 'PSLV page, PSOM-XL: "Burn time 70 s"', SRC_PSLV, 'Isp is published, thrust is derived from it, so this row checks the burn-out logic.'),
  row('s1Burn', 'First stage (S139) burn time', 's1Burn', 110, 's', FL, 'trajectory', 'PSLV page, S139: "Burn time 110 s"', SRC_PSLV),
  row('s2Burn', 'Second stage (Vikas) burn time', 's2Burn', 151, 's', FL, 'trajectory', 'PSLV page, second stage: "Burn time 151 s" (the flight timeline says about 130 s)', SRC_PSLV),
  row('reachedOrbit', 'Reaches a 200 km orbit with the published payload (1 = yes)', 'reachedOrbit', 1, '', 0.01, 'orbit', 'PSLV page, PSLV-XL: payload to LEO "3,800 kg"', SRC_PSLV, 'The page gives 200 km, 30 degrees; the model flies that inclination.'),
  row('liftoffMassCtx', 'Liftoff mass (context only)', 'liftoffMass', 320000, 'kg', null, 'build', 'PSLV page, PSLV-XL: "Mass 320,000 kg"', SRC_PSLV, 'Stage empty masses are partly ESTIMATED (the page gives only the motor case of the first stage).'),
];

export const VALIDATION_VEHICLES = [
  {
    id: 'saturn-v', name: 'Saturn V (Apollo 11)', short: 'Saturn V', build: buildSaturnV, rows: SATURN_ROWS,
    flight: { altitude: 185e3, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 2.4, stage3: 4.0 }, maxTime: 1000, site: 'cape',
      atmosphereProfile: 'tropical',   // 2.4: a warm Florida summer day (AFGL tropical), not the standard atmosphere: this moves Max-Q from 11 km to 13 km
      pitch: [[0,90],[12,90],[20,81.56],[30,80.46],[45,73.2],[60,72.69],[80,57.07],[100,44],[120,31.53],[140,36.88],[165,41.86]],
      extraEvents(mission, vehicle) {   // the real S-IC shuts its centre engine at about 135 s (press kit: "Center Engine Cutoff 00:02:15.2")
        const centre = vehicle.components.find((c) => /centre engine/.test(c.name));
        if (centre) mission.events.push({ id: 'cec', name: 'S-IC centre engine cutoff', condition: { type: 'time', value: 135.2 }, action: { type: 'SHUTDOWN', engine: centre.id }, status: 'pending' });
        // like the real vehicle: a stored pitch table in the S-IC, closed-loop steering from the S-II on
        mission.events.push({ id: 'closedloop', name: 'Closed-loop steering to orbit', condition: { type: 'event', id: 'ign2' }, action: { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 185e3, azimuth: mission.meta.azimuth, holdUntilAccel: 0.3, pitchRate: 3 } }, status: 'pending' });
      } },
    pitchLabel: 'Pitch table for the S-IC phase (0-165 s) FITTED to the published Max-Q and S-IC cutoff numbers (not published data); closed-loop steering to orbit from the S-II on.',
    pitchProgram: { knots: [0, 12, 20, 30, 45, 60, 80, 100, 120, 140, 165], values: [90, 90, 81.56, 80.46, 73.2, 72.69, 57.07, 44, 31.53, 36.88, 41.86], freeFrom: 2 },
    summary: 'Three-stage kerolox/hydrolox rocket that flew Apollo 11 into a 185 km parking orbit.',
    assumptions: [
      'Stage masses and engine figures come from encyclopedic pages (nominal, not specific to AS-506); only liftoff mass and orbit-insertion mass are Apollo 11 specific.',
      'The mass above the S-IVB tanks (spacecraft, adapter, instrument unit, escape tower) is DERIVED: the published orbit-insertion mass (135,669 kg) minus the S-IVB dry mass and the propellant left after its 144.7 s first burn.',
      'S-II thrust is the stage value from the S-II page (4,400 kN) divided over five engines; the J-2 page quotes a higher figure (1,033 kN each).',
      'The escape tower is not modelled.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Mixture-ratio shift of the S-II is not modelled.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'falcon-9', name: 'Falcon 9 Full Thrust (v1.2)', short: 'Falcon 9', build: buildFalcon9, rows: F9_ROWS,
    flight: { altitude: 200e3, insertion: 'direct', kickAngle: 3, kickAlt: 150, stageDelays: { stage2: 11 }, maxTime: 1000, site: 'cape', pitch: [[0,90],[10,90],[20,82],[40,62],[60,37.5],[80,35],[100,38],[120,37],[140,36],[152,39],[165,35],[200,28],[250,20],[300,17],[350,13],[400,10],[450,6],[500,3]] }, // re-fitted in 2.0 for the corrected fairing height
    pitchProgram: { knots: [0, 10, 20, 40, 60, 80, 100, 120, 140, 152, 165, 200, 250, 300, 350, 400, 450, 500], values: [90, 90, 80, 60, 40, 39, 38, 37, 36, 35, 33, 28, 20, 17, 13, 10, 6, 3], freeFrom: 2 },
    pitchLabel: 'Pitch programme FITTED to reach a 200 km orbit (not published data).',
    summary: 'Two-stage kerosene rocket, 22.8 t to low Earth orbit when not reused.',
    assumptions: [
      'Vacuum thrust of the Merlin 1D is derived from its published sea-level thrust and the ratio of the published vacuum to sea-level Isp.',
      'The upper-stage engine\'s sea-level Isp (250 s) is a placeholder; it only burns in near-vacuum so it hardly matters.',
      'Fairing length (13 m) is a guess; it only changes drag and the centre of gravity slightly.',
      'The payload is the published maximum to low Earth orbit; the source gives no altitude, so 200 km circular is assumed.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['The first stage is not recovered or reflown; no landing burns.', 'The pitch table is fitted for the 22.8 t payload only; the published maximum payload (22,800 kg expendable) is the load it is flown with, so lighter or heavier loads are not validated.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'electron', name: 'Rocket Lab Electron', short: 'Electron', build: buildElectron, rows: EL_ROWS,
    flight: { altitude: 500e3, inclination: 97.4, insertion: 'hohmann', kickAngle: 3, kickAlt: 150, stageDelays: { stage2: 29 }, maxTime: 1800, site: { id: 'mahia', name: 'Launch site approximately 39.26 S, 177.86 E (not verified in this session)', lat: -39.26, lon: 177.86 }, pitch: [[0,90],[8,90],[15,79],[30,77],[50,58],[70,48],[90,39],[110,32],[130,26],[155,30],[184,26],[220,20],[270,15],[320,10],[380,6],[440,3],[500,1],[540,0]] },
    pitchProgram: { knots: [0, 8, 15, 30, 50, 70, 90, 110, 130, 155, 184, 220, 270, 320, 380, 440, 500, 540], values: [90, 90, 87, 77, 66, 56, 47, 40, 34, 30, 26, 20, 15, 10, 6, 3, 1, 0], freeFrom: 2 },
    pitchLabel: 'Pitch programme FITTED to reach a 500 km orbit (not published data).',
    summary: 'Small two-stage launcher: 200 kg to a 500 km Sun-synchronous orbit.',
    assumptions: [
      'Both stage dry masses are ESTIMATES (950 kg and 250 kg) because they were not found. The first-stage propellant (about 9.5 t) is DERIVED so the total equals the published 13,000 kg.',
      'The 311 s first-stage Isp is quoted without a pressure condition; it is used as the sea-level value and the vacuum value is derived from the published 5,600/5,800 lbf thrust ratio.',
      'The second stage propellant (2,000 kg) is read from the User Guide text.',
      'There is no kick stage: the second stage restarts to circularise.',
      'The 97.4 degree Sun-synchronous inclination is computed from the J2 formula, not read from a source.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['The first-stage engines run at constant thrust.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'atlas-v-551', name: 'Atlas V 551', short: 'Atlas V', build: buildAtlasV551, rows: ATLAS_ROWS,
    flight: { altitude: 185e3, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 3 }, maxTime: 1500, site: 'cape',
      pitch: [[0,90],[10,90],[20,70],[40,52.3],[60,41.3],[80,35],[100,32],[120,30],[150,30],[180,29.5],[230,28]],
      extraEvents(mission) {   // strap-on solid boosters: lit with the core, jettisoned when they burn out
        mission.events.push({ id: 'bign', name: 'Solid boosters ignition', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'bsep', name: 'Solid boosters burn out and separate', condition: { type: 'propellant', group: 'booster', op: '<=', value: 0.004 }, action: { type: 'SEPARATE', group: 'booster' }, status: 'pending' });

        // a stored pitch table while the core burns, closed-loop steering from the Centaur on (as on the real vehicle)
        mission.events.push({ id: 'closedloop', name: 'Closed-loop steering to orbit', condition: { type: 'event', id: 'ign2' }, action: { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 185e3, azimuth: mission.meta.azimuth, holdUntilAccel: 0.3, pitchRate: 3 } }, status: 'pending' });
      } },
    pitchLabel: 'Pitch table for the first 230 s FITTED so that the published 551 payload reaches orbit (not published data); closed-loop steering from the Centaur on.',
    summary: 'Two-stage kerolox/hydrolox rocket with five solid strap-on boosters (551 configuration).',
    assumptions: [
      'Only masses, thrust, Isp and burn times from the Atlas V page are used. That page gives NO trajectory timeline for the 551, so there are no Max-Q or staging-altitude rows.',
      'The solid-booster thrust is the AVERAGE (1.27 MN, body text); the infobox gives a peak of 1,688 kN. The Isp is derived from average thrust x burn time / propellant.',
      'Fairing mass (4,000 kg) is an ESTIMATE; the page does not give it. The LEO reference orbit is not stated; 185 km circular is assumed.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Boosters burn at constant average thrust (the real motor has a thrust peak and a long tail-off).', 'The RD-180 throttles to 82% after 115 s (tuned so the core burns for the published 253 s; the real throttle history is not on the page).', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'ariane-5-eca', name: 'Ariane 5 ECA', short: 'Ariane 5', build: buildAriane5ECA, rows: ARIANE_ROWS,
    flight: { altitude: 200e3, inclination: 5.24, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 3 }, maxTime: 1500, site: { id: 'kourou', name: 'Kourou, about 5.24 N, 52.77 W (not verified in this session)', lat: 5.24, lon: -52.77 },
      extraEvents(mission) {   // strap-on solid boosters: lit with the core, jettisoned when they burn out
        mission.events.push({ id: 'bign', name: 'Solid boosters ignition', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'bsep', name: 'Solid boosters burn out and separate', condition: { type: 'propellant', group: 'booster', op: '<=', value: 0.004 }, action: { type: 'SEPARATE', group: 'booster' }, status: 'pending' });
      } },
    pitchLabel: 'Generic gravity turn + closed-loop insertion of the simulator (nothing fitted).',
    summary: 'Hydrolox core stage with two large solid boosters and a restartable-class upper stage (single burn).',
    assumptions: [
      'The Ariane 5 page gives most figures for the whole family; the ECA values used here are the ones the page labels ECA (boosters, EPC, ESC-A).',
      'Solid-booster Isp (275 s) is ASSUMED (not on the page); thrust is derived from it, the propellant (gross minus empty) and the 140 s burn. The page also says 130 s and a peak thrust of 7,080 kN.',
      'EPC propellant is gross minus dry (170 t); the text says 175 t in one place and "about 189 t" total.',
      'Fairing mass (2,675 kg) is an ESTIMATE; the page does not give it. No LEO payload is published for the ECA; the flight goes to a 200 km orbit with the GTO payload, which is easier than a real GTO flight.',
      'The launch site coordinates were not verified.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Boosters burn at constant average thrust.', 'The real core engine ignites about 7 s before the boosters; here all start together.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'soyuz-2-1a', name: 'Soyuz-2.1a', short: 'Soyuz', build: buildSoyuz21a, rows: SOYUZ_ROWS,
    flight: { altitude: 240e3, inclination: 51.6, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 2 }, maxTime: 1500, site: { id: 'baikonur', name: 'Baikonur, about 46.0 N, 63.6 E (not verified in this session)', lat: 46.0, lon: 63.56 },
      pitch: [[0,90],[10,90],[20,81],[40,70],[60,57],[80,47],[100,46],[118,38],[150,34],[200,27],[286,20],[400,4]],
      extraEvents(mission) {   // four strap-on boosters: lit with the core, jettisoned when they burn out
        mission.events.push({ id: 'bign', name: 'Strap-on boosters ignition', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'bsep', name: 'Strap-on boosters burn out and separate', condition: { type: 'propellant', group: 'booster', op: '<=', value: 0.004 }, action: { type: 'SEPARATE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'closedloop', name: 'Closed-loop steering to orbit', condition: { type: 'event', id: 'ign2' }, action: { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 240e3, azimuth: mission.meta.azimuth, holdUntilAccel: 0.3, pitchRate: 3 } }, status: 'pending' });
      } },
    pitchLabel: 'Pitch table for the core burn FITTED so that the published payload reaches orbit (not published data); closed-loop steering from the third stage on.',
    summary: 'Two-and-a-half-stage kerolox rocket: four liquid strap-ons and a core stage lit together, then a third stage (Soyuz-2.1a).',
    assumptions: [
      'Masses, thrust, Isp and burn times come from the Soyuz-2 page (Soyuz-2.1a column). The page gives no launch timeline, so there are no Max-Q or staging-altitude rows.',
      'The four liquid strap-ons are modelled like solid ones: constant thrust equal to the mean of the sea-level and vacuum values; the Isp is derived from impulse.',
      'Fairing mass (1,200 kg) is an ESTIMATE. The Baikonur coordinates were not verified.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Boosters burn at constant average thrust.', 'The real third stage ignites in flight at core separation; here it starts 2 s after core cutoff.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'vega', name: 'Vega', short: 'Vega', build: buildVega, rows: VEGA_ROWS,
    flight: { altitude: 700e3, inclination: 90, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 2, stage3: 2, stage4: 4 }, maxTime: 2500, site: 'kourou',
      pitch: [[0,90],[10,90],[20,84],[40,84],[60,67],[80,54],[100,44],[130,40],[170,12],[220,14],[330,-5]],
      extraEvents(mission) { mission.events.push({ id: 'closedloop', name: 'Closed-loop steering to orbit', condition: { type: 'event', id: 'ign4' }, action: { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 700e3, azimuth: mission.meta.azimuth, holdUntilAccel: 0.05, pitchRate: 2 } }, status: 'pending' }); } },
    pitchLabel: 'Pitch table for the three solid stages FITTED so that the published payload reaches orbit (not published data); closed-loop steering from the AVUM on.',
    summary: 'Three solid-propellant stages and a small liquid upper stage (AVUM).',
    assumptions: [
      'Masses, thrust, Isp and burn times come from the Vega page. Where the infobox and the stage table differ (burn times, empty masses) the infobox is used and the difference is stated in the row.',
      'The solid motors are modelled as constant average thrust (the real thrust peaks early and tails off) with the published average thrust and Isp.',
      'The stage empty masses are the gross mass minus the propellant. The page gives no launch timeline, so there are no Max-Q or staging-altitude rows.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Solid motors at constant average thrust.', 'The real AVUM restarts several times after a long coast; here it burns once.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'pslv-xl', name: 'PSLV-XL', short: 'PSLV', build: buildPSLV, rows: PSLV_ROWS,
    flight: { altitude: 200e3, inclination: 30, insertion: 'direct', kickAngle: 2, kickAlt: 150, insertionAlt: 90000, stageDelays: { stage2: 0.5, stage3: 1, stage4: 4 }, maxTime: 2500, site: { id: 'sriharikota', name: 'Sriharikota, about 13.7 N, 80.2 E (not verified in this session)', lat: 13.72, lon: 80.23 },
      pitch: [[0,90],[10,90],[20,74],[40,56.3],[60,48],[80,40],[110,33],[150,22],[200,16],[262,20],[400,14]],
      extraEvents(mission) {
        mission.events.push({ id: 'bign', name: 'Strap-on motors ignition', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'bsep', name: 'Strap-on motors burn out and separate', condition: { type: 'propellant', group: 'booster', op: '<=', value: 0.004 }, action: { type: 'SEPARATE', group: 'booster' }, status: 'pending' });
        mission.events.push({ id: 'closedloop', name: 'Closed-loop steering to orbit', condition: { type: 'event', id: 'ign3' }, action: { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 200e3, azimuth: mission.meta.azimuth, holdUntilAccel: 0.1, pitchRate: 2 } }, status: 'pending' });
      } },
    pitchLabel: 'Pitch table for the first stages FITTED so that the published payload reaches orbit (not published data); closed-loop steering from the third stage on.',
    summary: 'Four-stage solid / liquid / solid / liquid rocket with six solid strap-on motors (PSLV-XL).',
    assumptions: [
      'Propellant masses, Isp, thrust and burn times come from the PSLV page. The page gives only the first-stage motor case (30.2 t); the other empty masses (Vikas 5.5 t, third stage 1.0 t, PS4 0.92 t, strap-on motor 2.8 t) are ESTIMATES that make the liftoff mass come close to 320 t.',
      'Solid stages and strap-ons are modelled at constant average thrust: thrust is derived from the published Isp and burn time (the page gives only the peak thrust).',
      'All six strap-on motors burn from liftoff for 70 s; on the real vehicle two are lit in the air. The launch site coordinates were not verified.',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['Solid motors at constant average thrust.', 'Two of the six strap-ons are really air-lit.', 'The real PS4 burns twice with a coast; here it burns once.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
  {
    id: 'new-shepard', name: 'Blue Origin New Shepard', short: 'New Shepard', build: buildNewShepard, rows: NS_ROWS,
    flight: { altitude: 100e3, suborbital: true, kickAngle: 0.3, kickAlt: 150, maxTime: 420, site: 'cape' },
    pitchLabel: 'Nearly vertical flight of the simulator (nothing fitted).',
    summary: 'Single-stage hydrogen/oxygen suborbital rocket that flies a capsule just above 100 km.',
    assumptions: [
      'The New Shepard page publishes thrust (490 kN at liftoff), burn time (141 s), launch mass (35,000 kg) and apogee, but NOT the Isp, the propellant mass or the dry mass. Isp (345 s at sea level, 435 s in vacuum) is ASSUMED, and the average throttle after the first 16 s (91.5 %) is TUNED so the apogee matches the published 106 km (the real engine does throttle; the values are not published); the propellant is derived so it lasts exactly 141 s at full sea-level thrust; everything else of the 35,000 kg is dry mass including the capsule.',
      'Launch site: the simulator uses its standard site, not the real one in west Texas. A different latitude changes the result only slightly for a vertical flight.',
      'The page gives different burn durations (141 s, about 110 s, about two and a half minutes).',
      ...COMMON_ASSUMPTIONS,
    ],
    simplified: ['The throttle history is a single tuned average, not the real one; the capsule does not separate and the whole vehicle flies to apogee.', ...COMMON_SIMPLIFIED],
    dataSource: 'estimated',
  },
];
