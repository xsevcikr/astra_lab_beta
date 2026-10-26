// Reference vehicles built from rounded public figures. Educational: real vehicles differ in detail.
const comp = (id, name, subsystem, mass, power, failureRate, extra = {}) => ({ id, name, subsystem, mass, power, failureRate, critical: true, redundancy: { n: 1, k: 1 }, ...extra });

// Avionics and subsystems shared by the crewed spacecraft. failureRate is per hour (generic order-of-magnitude values).
const crewSystems = () => ({
  power: { solarArea: 0, solarEfficiency: 0.28, batteryWh: 30000, fuelCellW: 2000, busVoltage: 28,
    loads: [
      { id: 'fc', name: 'Flight computers', power: 180, priority: 1 },
      { id: 'gnc', name: 'GNC sensors', power: 120, priority: 1 },
      { id: 'comm', name: 'Communications', power: 160, priority: 2 },
      { id: 'eclss', name: 'Life support', power: 600, priority: 1 },
      { id: 'heat', name: 'Heaters', power: 300, priority: 2 },
      { id: 'sci', name: 'Science', power: 200, priority: 3 },
      { id: 'light', name: 'Cabin lighting', power: 80, priority: 3 },
    ] },
  thermal: { radiatorArea: 8, emissivity: 0.85, absorptivity: 0.2, heatShield: { material: 'ablative', maxTemp: 2900, thickness: 0.04 } },
  comms: { antennaGainDb: 25, txPowerW: 20, frequencyHz: 2.2875e9, systemNoiseTempK: 300, lossesDb: 3 },
});

export const SMALL_LAUNCHER = {
  id: 'small-launcher', name: 'Small Launcher', version: '1.0', kind: 'rocket',
  payload: { mass: 300, name: 'Small satellite' },
  aero: { cd0: 0.3, diameter: 1.2, length: 18 },
  stages: [
    { id: 's1', name: 'Stage 1', dryMass: 950, propMass: 9250, diameter: 1.2, length: 12,
      engines: [{ id: 'e1', name: 'Pump-fed kerolox', count: 9, thrustVac: 25000, ispVac: 311, ispSL: 280, throttleMin: 0.7, gimbalDeg: 5 }],
      structure: { material: 'cfrp', wallThickness: 0.004 } },
    { id: 's2', name: 'Stage 2', dryMass: 250, propMass: 2050, diameter: 1.2, length: 3,
      engines: [{ id: 'e2', name: 'Vacuum kerolox', count: 1, thrustVac: 25800, ispVac: 343, ispSL: 200, throttleMin: 0.5, gimbalDeg: 5 }],
      structure: { material: 'cfrp', wallThickness: 0.003 } },
  ],
  components: [
    comp('s1.eng', 'Stage 1 engine', 'propulsion', 35, 0, 2e-4, { stage: 0, redundancy: { n: 9, k: 8 } }),
    comp('s2.eng', 'Stage 2 engine', 'propulsion', 40, 0, 2e-4, { stage: 1 }),
    comp('fc', 'Flight computer', 'avionics', 4, 25, 1e-5, { redundancy: { n: 2, k: 1 } }),
    comp('imu', 'Inertial measurement unit', 'gnc', 3, 15, 2e-5),
    comp('gps', 'GNSS receiver', 'gnc', 1, 5, 2e-5, { critical: false }),
    comp('batt', 'Battery', 'power', 8, 0, 5e-6),
    comp('tx', 'Telemetry transmitter', 'comms', 2, 20, 3e-5, { critical: false }),
    comp('sep', 'Stage separation system', 'structures', 15, 0, 1e-4, { stage: 0 }),
  ],
};

export const HEAVY_LUNAR = {
  id: 'heavy-lunar', name: 'Heavy Lunar Launcher', version: '1.0', kind: 'rocket',
  payload: { mass: 45000, name: 'CSM + LM' },
  aero: { cd0: 0.35, diameter: 10.1, length: 110 },
  stages: [
    { id: 's1', name: 'S-1 booster', dryMass: 131000, propMass: 2150000, diameter: 10.1, length: 42,
      engines: [{ id: 'f1', name: 'Large kerolox', count: 5, thrustVac: 7770000, ispVac: 304, ispSL: 263, throttleMin: 1, gimbalDeg: 6 }],
      structure: { material: 'al2219', wallThickness: 0.016, stiffening: 2.5, note: 'smeared skin + stringer thickness' } },
    { id: 's2', name: 'S-2 second stage', dryMass: 36000, propMass: 444000, diameter: 10.1, length: 25,
      engines: [{ id: 'j2a', name: 'Hydrolox J-class', count: 5, thrustVac: 1033000, ispVac: 421, ispSL: 200, throttleMin: 1, gimbalDeg: 7 }],
      structure: { material: 'al2014', wallThickness: 0.010, stiffening: 2.5, note: 'smeared skin + stringer thickness' } },
    { id: 's3', name: 'S-3 third stage', dryMass: 10000, propMass: 109000, diameter: 6.6, length: 18,
      engines: [{ id: 'j2b', name: 'Restartable hydrolox', count: 1, thrustVac: 1033000, ispVac: 421, ispSL: 200, throttleMin: 1, gimbalDeg: 7, restarts: 1 }],
      structure: { material: 'al2014', wallThickness: 0.008, stiffening: 2.5, note: 'smeared skin + stringer thickness' } },
  ],
  components: [
    comp('s1.eng', 'S-1 engine', 'propulsion', 8400, 0, 3e-4, { stage: 0, redundancy: { n: 5, k: 4 } }),
    comp('s2.eng', 'S-2 engine', 'propulsion', 1600, 0, 3e-4, { stage: 1, redundancy: { n: 5, k: 4 } }),
    comp('s3.eng', 'S-3 engine', 'propulsion', 1600, 0, 3e-4, { stage: 2 }),
    comp('iu.fc', 'Instrument unit computer', 'avionics', 50, 300, 1e-5, { redundancy: { n: 3, k: 2 } }),
    comp('iu.imu', 'Inertial platform', 'gnc', 60, 200, 2e-5),
    comp('iu.batt', 'IU batteries', 'power', 120, 0, 5e-6, { redundancy: { n: 2, k: 1 } }),
    comp('iu.tx', 'Telemetry system', 'comms', 40, 150, 3e-5, { critical: false }),
    comp('sep12', 'S-1/S-2 separation', 'structures', 200, 0, 5e-5, { stage: 0 }),
    comp('sep23', 'S-2/S-3 separation', 'structures', 150, 0, 5e-5, { stage: 1 }),
  ],
};

export const LUNAR_LANDER = {
  id: 'lunar-lander', name: 'Lunar Lander', version: '1.0', kind: 'lander',
  payload: { mass: 0, name: 'Crew + samples (in ascent stage dry mass)' },
  aero: { cd0: 0, diameter: 4.3, length: 7 },
  stages: [
    { id: 'ds', name: 'Descent stage', dryMass: 2034, propMass: 8200, diameter: 4.3, length: 3.2,
      engines: [{ id: 'dps', name: 'Throttleable descent engine', count: 1, thrustVac: 45040, ispVac: 311, throttleMin: 0.1, gimbalDeg: 6 }] },
    { id: 'as', name: 'Ascent stage', dryMass: 2445, propMass: 2353, diameter: 4.3, length: 2.8,
      engines: [{ id: 'aps', name: 'Fixed ascent engine', count: 1, thrustVac: 15600, ispVac: 311, throttleMin: 1, gimbalDeg: 0 }] },
  ],
  components: [
    comp('dps', 'Descent engine', 'propulsion', 180, 0, 2e-4, { stage: 0 }),
    comp('aps', 'Ascent engine', 'propulsion', 100, 0, 1e-4, { stage: 1 }),
    comp('rcs', 'RCS quads', 'gnc', 120, 40, 5e-5, { redundancy: { n: 4, k: 3 } }),
    comp('lr', 'Landing radar', 'gnc', 20, 130, 5e-5),
    comp('pgns', 'Primary guidance computer', 'avionics', 32, 70, 2e-5),
    comp('ags', 'Abort guidance system', 'avionics', 15, 90, 2e-5, { critical: false, backupOf: 'pgns' }),
    comp('imu', 'Inertial measurement unit', 'gnc', 19, 100, 2e-5),
    comp('batt', 'Descent batteries', 'power', 280, 0, 5e-6, { stage: 0, redundancy: { n: 4, k: 3 } }),
    comp('sband', 'S-band transponder', 'comms', 15, 40, 3e-5),
    comp('eclss', 'Life support', 'eclss', 90, 300, 2e-5),
  ],
  systems: crewSystems(),
};

export const CREW_CAPSULE = {
  id: 'crew-capsule', name: 'Command and Service Module', version: '1.0', kind: 'spacecraft',
  payload: { mass: 5560, name: 'Command module (crew, heat shield)' },
  aero: { cd0: 1.3, diameter: 3.9, length: 3.5, liftToDrag: 0.3 },
  stages: [
    { id: 'sm', name: 'Service module', dryMass: 6110, propMass: 18410, diameter: 3.9, length: 7.5,
      engines: [{ id: 'sps', name: 'Service propulsion engine', count: 1, thrustVac: 91000, ispVac: 314, throttleMin: 1, gimbalDeg: 8, restarts: 36 }] },
  ],
  components: [
    comp('sps', 'Service propulsion engine', 'propulsion', 300, 0, 1e-4, { stage: 0 }),
    comp('fcell', 'Fuel cells', 'power', 110, 0, 3e-5, { redundancy: { n: 3, k: 1 } }),
    comp('o2tank', 'Cryogenic oxygen tanks', 'eclss', 90, 0, 1e-5, { redundancy: { n: 2, k: 1 } }),
    comp('agc', 'Guidance computer', 'avionics', 32, 70, 2e-5),
    comp('imu', 'Inertial measurement unit', 'gnc', 19, 100, 2e-5),
    comp('hga', 'High-gain antenna', 'comms', 40, 50, 3e-5, { critical: false }),
    comp('heatshield', 'Heat shield', 'thermal', 850, 0, 2e-6),
    comp('chutes', 'Main parachutes', 'recovery', 250, 0, 3e-5, { redundancy: { n: 3, k: 2 } }),
  ],
  systems: crewSystems(),
};

export const LIBRARY = { [SMALL_LAUNCHER.id]: SMALL_LAUNCHER, [HEAVY_LUNAR.id]: HEAVY_LUNAR, [LUNAR_LANDER.id]: LUNAR_LANDER, [CREW_CAPSULE.id]: CREW_CAPSULE };
export const loadVehicle = (id) => { if (!LIBRARY[id]) throw new Error(`no vehicle ${id}`); return JSON.parse(JSON.stringify(LIBRARY[id])); };
