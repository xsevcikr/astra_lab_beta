// Error bars and roles for every published number the simulator is compared with (credibility assessment, 2.9).
//
// The rows themselves (value, source, link) live in data/validation-vehicles.js and src/core/mission-validation.js. This file adds two
// things to each row, without touching those files:
//
//   sigma  the 1-sigma uncertainty of the PUBLISHED number: how precisely it is known for the case the simulator flies. It comes from the
//          way the number was published (rounding, "about"), from the source itself (pre-flight nominal vs flown, family value vs this
//          vehicle, two different values on the same page) or from the spread between flights of the same rocket. `rel` is relative to
//          the value, `abs` is in the row's own unit. `basis` says in one sentence where the number came from.
//
//   role   what the comparison can prove:
//          'prediction'  the simulator had to work it out from the physics (flight dynamics, guidance, drag ...). This is validation evidence.
//          'consistency' it follows almost directly from the inputs (a burn time = propellant / mass flow from published thrust and Isp).
//                        A pass shows the published numbers agree with each other and the build is right, not that the flight physics is.
//          'calibrated'  something in the model (pitch table, throttle) was TUNED until this number matched. Never counts as evidence.
//          'target'      the guidance steers to this value (the orbit it aims for). Reaching it shows the vehicle can, not that it predicts.
//          'plan'        set mostly by the mission plan (event times copied from the real timeline), not by the physics.
//          'build'       a check that the vehicle was entered correctly (mass, thrust, height).
//          'verification' a textbook formula checked against a textbook number (tests the code, not the model of a real vehicle).
//
// Honesty rules: a row whose role is not 'prediction' is never counted in the headline. A row with no entry here makes the credibility
// tests fail, so a new published number cannot be added without saying how well it is known and what it can prove.

export const ROLES = {
  prediction: { label: 'Prediction', short: 'predicted', evidence: true, why: 'The simulator worked it out from the physics.' },
  consistency: { label: 'Consistency check', short: 'from inputs', evidence: false, why: 'Follows almost directly from published inputs (e.g. propellant / mass flow).' },
  calibrated: { label: 'Calibrated', short: 'tuned', evidence: false, why: 'Something in the model was tuned until this matched. Not evidence.' },
  target: { label: 'Guidance target', short: 'aimed for', evidence: false, why: 'The guidance steers to this value.' },
  plan: { label: 'Set by the plan', short: 'planned', evidence: false, why: 'The mission plan sets this time; the physics only fills in the gaps.' },
  build: { label: 'Build check', short: 'typed in', evidence: false, why: 'Checks the vehicle was entered correctly.' },
  verification: { label: 'Code verification', short: 'formula', evidence: false, why: 'Textbook formula against a textbook number: tests the code.' },
};

// shorthands for the bases that repeat
const NOMINAL = 'Encyclopedic nominal value for the vehicle family; individual vehicles and sources differ by a few per cent.';
const BURN = 'Nominal burn time from an encyclopedic page; flights differ by a few seconds and pages often disagree.';
const PRESS_T = 'Apollo 11 press kit: the PRE-FLIGHT nominal trajectory. The flown event times (flight evaluation report) differ from it by about 1 to 3 s.';
const PRESS_X = 'Apollo 11 press kit: PRE-FLIGHT nominal trajectory. Flown altitudes and speeds differ from the plan by about 1 to 2 %.';
const TIMELINE = 'One mission\'s published timeline, rounded to whole seconds; the same event moves by a few seconds from mission to mission.';
const FAMILY = 'Whole-family figure, not specific to this configuration (context only).';

/** Launch-vehicle rows: VEHICLE_ROWS[vehicleId][rowId] = { role, rel | abs, basis }. Binary rows (reachedOrbit) carry no sigma. */
export const VEHICLE_ROWS = {
  'saturn-v': {
    liftoffMass: { role: 'build', rel: 0.002, basis: 'Apollo 11 flight evaluation report, measured mass of this vehicle at ignition (to the kilogram).' },
    liftoffThrust: { role: 'build', rel: 0.02, basis: NOMINAL },
    maxQT: { role: 'calibrated', abs: 2, basis: PRESS_T },
    maxQAlt: { role: 'calibrated', rel: 0.015, basis: PRESS_X },
    maxQSpeed: { role: 'calibrated', rel: 0.015, basis: PRESS_X },
    s1CutoffT: { role: 'calibrated', abs: 2, basis: PRESS_T },
    s1CutoffAlt: { role: 'calibrated', rel: 0.015, basis: PRESS_X },
    s1CutoffSpeed: { role: 'calibrated', rel: 0.015, basis: PRESS_X },
    s2CutoffT: { role: 'prediction', abs: 2, basis: PRESS_T },
    s2CutoffAlt: { role: 'prediction', rel: 0.015, basis: PRESS_X },
    s2CutoffSpeed: { role: 'prediction', rel: 0.015, basis: PRESS_X },
    s2Burn: { role: 'consistency', abs: 2.5, basis: PRESS_T },
    finalCutoffT: { role: 'prediction', abs: 2, basis: PRESS_T },
    finalCutoffSpeed: { role: 'prediction', rel: 0.005, basis: 'Press kit nominal; orbit insertion speed is held tightly by the guidance (flown value within a few m/s).' },
    orbitPeri: { role: 'target', abs: 500, basis: 'Flight evaluation report, tracked orbit (0.1 km printed; tracking accuracy about 0.5 km).' },
    orbitApo: { role: 'target', abs: 500, basis: 'Flight evaluation report, tracked orbit (0.1 km printed; tracking accuracy about 0.5 km).' },
  },
  'falcon-9': {
    liftoffMassNoPayload: { role: 'build', rel: 0.03, basis: 'Encyclopedic value; the page does not say whether a payload is included.' },
    liftoffThrust: { role: 'build', rel: 0.02, basis: NOMINAL },
    height: { role: 'build', rel: 0.01, basis: 'Published height (0.1 m); the model has no fairing drawing, so it is a plausibility check.' },
    s1Burn: { role: 'consistency', rel: 0.03, basis: BURN },
    s2Burn: { role: 'consistency', rel: 0.03, basis: BURN },
    maxQT: { role: 'prediction', abs: 3, basis: TIMELINE },
    s1CutoffT: { role: 'consistency', abs: 3, basis: TIMELINE },
    s2IgnitionT: { role: 'consistency', abs: 3, basis: TIMELINE + ' The model waits the published 11 s after MECO.' },
    s1CutoffAlt: { role: 'prediction', rel: 0.10, basis: 'Press kit of an older version (v1.1), rounded ("80 kilometers"): context only.' },
    s1CutoffMach: { role: 'prediction', rel: 0.10, basis: 'Press kit of an older version (v1.1), rounded ("10 times the speed of sound"): context only.' },
  },
  electron: {
    liftoffMass: { role: 'build', rel: 0.02, basis: 'User Guide, rounded to 1,000 kg steps ("13,000 kg").' },
    liftoffThrust: { role: 'build', rel: 0.02, basis: NOMINAL },
    s1CutoffT: { role: 'consistency', rel: 0.03, basis: 'User Guide "typical flight events": a typical mission, not one flight.' },
    s2IgnitionT: { role: 'consistency', rel: 0.03, basis: 'User Guide "typical flight events". The model waits the published gap after cutoff.' },
    s2IgnitionAlt: { role: 'prediction', rel: 0.05, basis: 'User Guide, typical mission, "about 126 km".' },
    finalCutoffT: { role: 'consistency', rel: 0.03, basis: 'User Guide "typical flight events".' },
    orbitPeri: { role: 'target', rel: 0.02, basis: 'Nominal 500 km reference orbit of the User Guide.' },
    orbitApo: { role: 'target', rel: 0.02, basis: 'Nominal 500 km reference orbit of the User Guide.' },
    orbitIncl: { role: 'target', abs: 0.1, basis: 'Computed from the J2 formula, not published (context only).' },
  },
  'atlas-v-551': {
    s1Burn: { role: 'calibrated', rel: 0.03, basis: BURN + ' The RD-180 throttle after 115 s is tuned to give this burn time.' },
    boosterBurn: { role: 'build', rel: 0.03, basis: BURN + ' The booster Isp is derived from this burn time, so the row checks the build.' },
    reachedOrbit: { role: 'calibrated', basis: 'Published 551 capacity to LEO. The pitch table was fitted to make this payload reach orbit.' },
    liftoffMassCtx: { role: 'build', rel: 0.05, basis: FAMILY },
  },
  'ariane-5-eca': {
    boosterBurn: { role: 'build', rel: 0.04, basis: 'Infobox says 140 s, the text 130 s; the booster thrust is derived from this burn time.' },
    s1Burn: { role: 'consistency', rel: 0.03, basis: BURN },
    reachedOrbit: { role: 'prediction', basis: 'Published ECA payload (to GTO, flown here to a 200 km orbit, which is easier). Nothing was fitted: generic gravity turn.' },
    liftoffMassCtx: { role: 'build', rel: 0.05, basis: FAMILY },
  },
  'soyuz-2-1a': {
    boosterBurn: { role: 'build', rel: 0.03, basis: BURN + ' The booster Isp is derived from impulse over this burn time.' },
    s1Burn: { role: 'consistency', rel: 0.03, basis: BURN },
    s2Burn: { role: 'consistency', rel: 0.03, basis: BURN },
    reachedOrbit: { role: 'calibrated', basis: 'Published capacity to 240 km at 51.6 deg. The pitch table was fitted to make this payload reach orbit.' },
    liftoffMassCtx: { role: 'build', rel: 0.05, basis: FAMILY },
  },
  vega: {
    s1Burn: { role: 'consistency', rel: 0.033, basis: 'Infobox 107 s, stage table 114 s (half the difference as the error bar).' },
    s2Burn: { role: 'consistency', rel: 0.037, basis: 'Infobox 71.6 s, stage table 77 s (half the difference as the error bar).' },
    s3Burn: { role: 'consistency', rel: 0.03, basis: 'Infobox 117 s, stage table 120 s.' },
    reachedOrbit: { role: 'calibrated', basis: 'Published 1,430 kg to 700 km polar. The pitch table was fitted to make this payload reach orbit.' },
    liftoffMassCtx: { role: 'build', rel: 0.02, basis: NOMINAL },
  },
  'pslv-xl': {
    boosterBurn: { role: 'build', rel: 0.03, basis: BURN + ' The strap-on thrust is derived from this burn time.' },
    s1Burn: { role: 'build', rel: 0.03, basis: BURN + ' The S139 thrust is derived from this burn time.' },
    s2Burn: { role: 'consistency', rel: 0.07, basis: 'Page says 151 s, the flight timeline about 130 s (half the difference as the error bar).' },
    reachedOrbit: { role: 'calibrated', basis: 'Published 3,800 kg to LEO. The pitch table was fitted to make this payload reach orbit.' },
    liftoffMassCtx: { role: 'build', rel: 0.03, basis: NOMINAL + ' Several stage empty masses are estimates.' },
  },
  'new-shepard': {
    liftoffMass: { role: 'build', rel: 0.02, basis: NOMINAL },
    liftoffThrust: { role: 'build', rel: 0.02, basis: NOMINAL },
    s1CutoffT: { role: 'build', rel: 0.03, basis: 'Infobox 141 s (the text also says about 110 s). The propellant is derived so that it lasts exactly 141 s.' },
    maxAlt: { role: 'calibrated', abs: 2500, basis: 'Flights reached about 101 to 107 km. The average throttle was tuned to give 106 km.' },
    maxSpeed: { role: 'prediction', rel: 0.03, basis: 'One flight (NS-11, 3,568 km/h); other flights differ by a few per cent.' },
  },
};

/** Real-mission rows (src/core/mission-validation.js): MISSION_ROWS[caseId][rowId]. */
export const MISSION_ROWS = {
  orbits: {
    iss: { role: 'verification', rel: 0.004, basis: 'NASA: "about 92.9 minutes"; the station altitude varies by tens of km.' },
    geo: { role: 'verification', abs: 1000, basis: 'Defined value, 35,786 km.' },
    escE: { role: 'verification', rel: 0.0005, basis: 'NASA fact sheet, 5 significant digits.' },
    escM: { role: 'verification', rel: 0.0005, basis: 'NASA fact sheet, 4 significant digits.' },
    escL: { role: 'verification', rel: 0.002, basis: 'NASA fact sheet, 3 significant digits.' },
    moonP: { role: 'verification', rel: 0.0002, basis: 'NASA fact sheet, sidereal period.' },
    leoGeo: { role: 'verification', rel: 0.005, basis: 'Textbook value, about 3.89 km/s.' },
    marsT: { role: 'verification', rel: 0.04, basis: 'Curiosity\'s real cruise (254 days) is not a Hohmann transfer: different case, about 10 days either way.' },
  },
  precession: {
    sso: { role: 'prediction', rel: 0.002, basis: 'Defined: 360 deg per tropical year.' },
    issNode: { role: 'prediction', abs: 0.1, basis: 'Rounded ("about 5 deg/day").' },
  },
  msl: {
    mslChuteT: { role: 'prediction', abs: 1, basis: 'NASA timeline of the real landing, to 0.1 s; one-way light time removed by NASA.' },
    mslTouch: { role: 'prediction', abs: 1, basis: 'NASA timeline of the real landing, to 0.1 s.' },
    mslChuteAlt: { role: 'prediction', rel: 0.10, basis: 'NASA example case, "about 10 km" (context only).' },
    mslChuteV: { role: 'prediction', rel: 0.05, basis: 'NASA example case, "about 470 m/s" (context only).' },
  },
  apollo11: {
    tli: { role: 'plan', abs: 1, basis: 'Mission Report, to 1 s. The TLI start time comes from the stored plan.' },
    loi: { role: 'plan', abs: 1, basis: 'Mission Report, to 1 s. The planner chooses the trip time to the Moon for the stored launch date (about 66 h in the model, 73 h flown).' },
    loiDv: { role: 'prediction', rel: 0.005, basis: 'Mission Report, ft/s to 0.1.' },
    land: { role: 'plan', abs: 1, basis: 'Mission Report, to 1 s. The model undocks at the real time (100.2 h) and picks the descent time.' },
    dock: { role: 'plan', abs: 60, basis: 'Mission Report, to the minute. The model stays on the Moon for a planned time.' },
    teiDv: { role: 'plan', rel: 0.005, basis: 'Mission Report, ft/s to 0.1. Since 2.7 the model plans a 70 h trip home, not Apollo 11\'s 59.9 h, so this is a different burn.' },
    ei: { role: 'plan', abs: 1, basis: 'Mission Report, to 1 s. Set by the planned trip home (70 h in the model, 59.9 h flown).' },
    splash: { role: 'prediction', abs: 5, basis: 'Mission Report: entry interface and splashdown times to 1 s.' },
    entryG: { role: 'prediction', abs: 0.3, basis: 'Mission Report entry data, "about 6.5 g".' },
  },
};

/** The dispersions applied to the simulator's inputs to get ITS error bar (1 sigma). Typical values for flight-proven hardware. */
export const SIM_DISPERSIONS = [
  { id: 'thrust', label: 'Engine thrust (each engine group)', sigma: 0.015, basis: 'Acceptance-test spread of liquid engines and solid motors is about 1 to 2 %.' },
  { id: 'isp', label: 'Specific impulse (each engine group)', sigma: 0.005, basis: 'Isp is repeatable to about 0.5 % on flight engines.' },
  { id: 'prop', label: 'Propellant loaded (each stage)', sigma: 0.005, basis: 'Loading accuracy and residuals, about 0.5 %.' },
  { id: 'dry', label: 'Dry mass of each part', sigma: 0.02, basis: 'Published dry masses are nominal; real vehicles differ by a few per cent.' },
  { id: 'density', label: 'Air density (whole flight)', sigma: 0.05, basis: 'Day-to-day change of the atmosphere, about 5 %; also stands in for the drag coefficient, which is not measured for these models.' },
];
