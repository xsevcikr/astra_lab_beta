// ASTRA LAB component catalog.
// dataSource labels (see documentation/DATA-LABELS.md): 'real' | 'estimated' | 'user' | 'fictional'.
// ALL entries below are FICTIONAL generic components with representative class-typical values. They are not
// specifications of any real product. Users can edit every number in the Vehicle Designer.
import { PROPELLANTS } from '../physics/propellants.js';
import { tankLengthFor } from '../physics/vehicle-model.js';

const E = (o) => ({ kind: 'engine', mount: 'stack', dataSource: 'fictional', count: 1, ...o });

export const ENGINES = [
  E({ catalogId: 'eng-al25s', name: 'AL-25S kerolox engine (sea level)', thrustVac: 27000, ispVac: 311, ispSl: 282, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 1.0, ignitions: 1, mass: 38, length: 0.95, diameter: 0.42, description: 'Small pump-fed LOX/RP-1 booster engine class.' }),
  E({ catalogId: 'eng-al25v', name: 'AL-25V kerolox engine (vacuum, restartable)', thrustVac: 26000, ispVac: 345, ispSl: 170, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 4, spoolTime: 1.2, ignitions: 3, mass: 42, length: 1.35, diameter: 0.75, vacuumOptimised: true, description: 'Vacuum-optimised upper-stage engine with a large nozzle. Restartable.' }),
  E({ catalogId: 'eng-al100', name: 'AL-100 kerolox engine', thrustVac: 108000, ispVac: 313, ispSl: 281, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 1.5, ignitions: 1, mass: 145, length: 1.5, diameter: 0.75, description: 'Medium booster engine class.' }),
  E({ catalogId: 'eng-al100v', name: 'AL-100V kerolox engine (vacuum, restartable)', thrustVac: 100000, ispVac: 350, ispSl: 170, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 4, spoolTime: 1.5, ignitions: 2, mass: 190, length: 2.4, diameter: 1.4, vacuumOptimised: true, description: 'Upper-stage engine class.' }),
  E({ catalogId: 'eng-al500', name: 'AL-500 kerolox engine', thrustVac: 540000, ispVac: 316, ispSl: 282, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 2.0, ignitions: 1, mass: 520, length: 2.4, diameter: 1.1, description: 'Large first-stage engine class.' }),
  E({ catalogId: 'eng-al500v', name: 'AL-500V kerolox engine (vacuum)', thrustVac: 520000, ispVac: 352, ispSl: 170, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 4, spoolTime: 2.0, ignitions: 2, mass: 620, length: 3.5, diameter: 2.0, vacuumOptimised: true, description: 'Large upper-stage engine class.' }),
  E({ catalogId: 'eng-al2000', name: 'AL-2000 kerolox engine', thrustVac: 2100000, ispVac: 318, ispSl: 285, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 3.0, ignitions: 1, mass: 1900, length: 3.5, diameter: 1.8, description: 'Heavy-lift booster engine class.' }),
  E({ catalogId: 'eng-al110h', name: 'AL-110H hydrolox engine (vacuum, restartable)', thrustVac: 110000, ispVac: 452, ispSl: 250, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.4, gimbal: 4, spoolTime: 2.0, ignitions: 3, mass: 310, length: 3.0, diameter: 1.6, vacuumOptimised: true, description: 'High-efficiency cryogenic upper-stage engine class.' }),
  E({ catalogId: 'eng-al200m', name: 'AL-200M methalox engine', thrustVac: 210000, ispVac: 335, ispSl: 300, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 5, spoolTime: 1.5, ignitions: 2, mass: 320, length: 2.0, diameter: 0.9, description: 'Methane/oxygen engine class.' }),
  E({ catalogId: 'eng-hyp5', name: 'AL-5H hypergolic thruster (5 kN)', thrustVac: 5000, ispVac: 315, ispSl: 240, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 3, spoolTime: 0.1, ignitions: 200, mass: 8, length: 0.55, diameter: 0.25, description: 'Storable-propellant orbital manoeuvring engine.' }),
  E({ catalogId: 'eng-hyp05', name: 'AL-0.5H hypergolic thruster (500 N)', thrustVac: 500, ispVac: 300, ispSl: 220, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 0, spoolTime: 0.1, ignitions: 500, mass: 1.2, length: 0.3, diameter: 0.12, description: 'Small storable thruster for spacecraft manoeuvres.' }),
  E({ catalogId: 'eng-desc4', name: 'AL-4D throttleable descent engine (4 kN)', thrustVac: 4000, ispVac: 305, ispSl: 240, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 0.2, gimbal: 3, spoolTime: 0.3, ignitions: 30, mass: 18, length: 0.7, diameter: 0.35, description: 'Small deep-throttling lander engine.' }),
  E({ catalogId: 'eng-desc15', name: 'AL-15D throttleable descent engine (15 kN)', thrustVac: 15000, ispVac: 312, ispSl: 250, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 0.2, gimbal: 3, spoolTime: 0.4, ignitions: 30, mass: 45, length: 0.9, diameter: 0.5, description: 'Lander descent engine class.' }),
  E({ catalogId: 'eng-desc60', name: 'AL-60D throttleable descent engine (60 kN)', thrustVac: 60000, ispVac: 318, ispSl: 255, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 0.25, gimbal: 3, spoolTime: 0.6, ignitions: 30, mass: 130, length: 1.4, diameter: 0.8, description: 'Heavy lander descent engine class.' }),
  E({ catalogId: 'srm-s50', name: 'AL-S50 solid rocket motor', thrustVac: 50000, ispVac: 268, ispSl: 240, propellants: ['SOLID'], solid: true, propellantMass: 420, minThrottle: 1, gimbal: 0, spoolTime: 0.1, ignitions: 1, mass: 45, length: 2.0, diameter: 0.55, description: 'Solid motor. Cannot be throttled or shut down.' }),
  E({ catalogId: 'eng-ion1', name: 'AL-EP1 xenon ion thruster', thrustVac: 0.09, ispVac: 3000, ispSl: 3000, propellants: ['XENON'], minThrottle: 0.3, gimbal: 0, spoolTime: 5, ignitions: 1000, mass: 8, length: 0.4, diameter: 0.3, powerDraw: 1600, description: 'Electric propulsion: enormous Isp, tiny thrust, needs power.' }),
];

// ---------- parametric builders (the Vehicle Designer and AI call these to keep derived values consistent) ----------
const TANK_KIND = { fuel: 'fuel_tank', oxidizer: 'oxidizer_tank', mono: 'propellant_tank', solid: 'propellant_tank' };
export function makeTank(propellant, propellantMass, diameter, extra = {}) {
  const P = PROPELLANTS[propellant];
  if (!P) throw new Error(`Unknown propellant ${propellant}`);
  const kind = TANK_KIND[P.role] ?? 'propellant_tank';
  const t = {
    kind, mount: 'stack', dataSource: extra.dataSource ?? 'fictional', propellant, propellantMass, fill: 1, diameter,
    name: extra.name ?? `${P.label} tank`,
    ...extra,
  };
  return resizeTank(t);
}
/** Recompute derived tank geometry & dry mass after changing propellantMass / diameter / propellant. */
export function resizeTank(t) {
  const P = PROPELLANTS[t.propellant];
  t.length = tankLengthFor(t.propellant, t.propellantMass, t.diameter);
  // tankageFactor < 1 models a lighter construction (e.g. composite-overwrapped tanks); absent = aluminium-like baseline
  t.mass = Math.round((((P.tankage ?? 0.05) * t.propellantMass + 3 + 2 * t.diameter * t.diameter * 8) * (t.tankageFactor ?? 1)) * 10) / 10;
  t.strength = 1.2e6 * t.diameter ** 2;
  t.maxQAlpha = 3000 * t.diameter ** 2;
  t.tMax = 400; t.tMin = 60;
  return t;
}
export function makeStructure(kind, diameter, length, extra = {}) {
  const area = Math.PI * diameter * length;
  const c = { kind, mount: 'stack', dataSource: 'fictional', diameter, length, mass: Math.max(2, Math.round(area * (kind === 'interstage' ? 22 : 20) * 10) / 10), strength: 1.4e6 * diameter ** 2, maxQAlpha: 3400 * diameter ** 2, maxQ: 60000, tMax: 500, tMin: 100,
    name: kind === 'interstage' ? 'Interstage' : 'Structural section', ...extra };
  return c;
}
export function makeNose(diameter, length, shape = 'ogive', extra = {}) {
  const area = Math.PI * diameter * length * 0.6;
  return { kind: 'nose_cone', mount: 'stack', dataSource: 'fictional', shape, diameter, length, mass: Math.max(1, Math.round(area * 6 * 10) / 10), tMax: 700, tMin: 100, noseRadius: diameter * 0.06, maxQ: 70000, name: 'Nose cone', ...extra };
}
export function makeFairing(diameter, length, extra = {}) {
  const area = Math.PI * diameter * length;
  return { kind: 'fairing', mount: 'stack', dataSource: 'fictional', diameter, length, mass: Math.max(3, Math.round(area * 5.5 * 10) / 10), tMax: 520, tMin: 100, maxQ: 65000, noseRadius: diameter * 0.3, jettison: true, name: 'Payload fairing', ...extra };
}
export function makeEngineCluster(catalogId, count, group, extra = {}) {
  const base = ALL_ENGINES.find((e) => e.catalogId === catalogId);
  if (!base) throw new Error(`Unknown engine ${catalogId}`);
  const e = { ...JSON.parse(JSON.stringify(base)), count, group, ...extra };
  if (count > 1) e.name = `${base.name} ×${count}`;
  // cluster diameter: engines side by side inside the stage diameter
  e.diameter = extra.diameter ?? Math.max(base.diameter * Math.ceil(Math.sqrt(count)) * 1.1, base.diameter);
  return e;
}

// ---------- fixed catalog entries (non-engine) ----------
const K = (o) => ({ dataSource: 'fictional', mount: 'internal', ...o });
export const OTHER = [
  K({ catalogId: 'avionics-flight', kind: 'avionics', name: 'Flight computer + IMU', mass: 14, length: 0.25, diameter: 0.35, powerDraw: 90, guidance: true, pointingAccuracyDeg: 0.5, tMin: 233, tMax: 343, maxAccelG: 25, description: 'Launch-vehicle avionics providing guidance and attitude control commands.' }),
  K({ catalogId: 'guidance-gnc', kind: 'guidance', name: 'Precision GNC package (star tracker + IMU)', mass: 6, length: 0.15, diameter: 0.25, powerDraw: 28, guidance: true, pointingAccuracyDeg: 0.05, tMin: 243, tMax: 333, maxAccelG: 20, description: 'Higher-accuracy guidance unit.' }),
  K({ catalogId: 'computer-cdh', kind: 'computer', name: 'Spacecraft computer (C&DH)', mass: 3, length: 0.12, diameter: 0.25, powerDraw: 14, guidance: true, pointingAccuracyDeg: 0.2, tMin: 233, tMax: 343, maxAccelG: 30, description: 'Command and data handling computer.' }),
  K({ catalogId: 'reaction-wheel', kind: 'reaction_wheel', name: 'Reaction wheel assembly', mass: 4, length: 0.1, diameter: 0.2, torque: 0.2, momentumCap: 15, powerDraw: 25, tMin: 253, tMax: 333, description: 'Momentum wheels for fine attitude control (no propellant).' }),
  K({ catalogId: 'rcs-mono', kind: 'rcs', mount: 'radial', name: 'RCS monoprop module', mass: 6, torque: 60, thrust: 90, isp: 220, propellantMass: 8, description: 'Hydrazine attitude thrusters with integral tank.' }),
  K({ catalogId: 'rcs-large', kind: 'rcs', mount: 'radial', name: 'RCS large module', mass: 25, torque: 400, thrust: 600, isp: 225, propellantMass: 40, description: 'Bigger thruster module for upper stages.' }),
  K({ catalogId: 'battery-100', kind: 'battery', name: 'Battery 100 Wh', mass: 0.8, length: 0.12, diameter: 0.15, capacityWh: 100, maxPower: 300, tMin: 273, tMax: 313, description: 'Li-ion battery pack (~130 Wh/kg).' }),
  K({ catalogId: 'battery-500', kind: 'battery', name: 'Battery 500 Wh', mass: 3.8, length: 0.2, diameter: 0.3, capacityWh: 500, maxPower: 1500, tMin: 273, tMax: 313, description: 'Li-ion battery pack.' }),
  K({ catalogId: 'battery-2000', kind: 'battery', name: 'Battery 2000 Wh', mass: 14, length: 0.3, diameter: 0.4, capacityWh: 2000, maxPower: 5000, tMin: 273, tMax: 313, description: 'Li-ion battery pack.' }),
  K({ catalogId: 'solar-1', kind: 'solar_panel', mount: 'radial', name: 'Solar panel (1 m²)', area: 1, efficiency: 0.28, tracking: true, deployable: true, mass: 3.0, degradation: 0, description: 'Deployable triple-junction-class solar array segment (1 m²).' }),
  K({ catalogId: 'solar-4', kind: 'solar_panel', mount: 'radial', name: 'Solar array (4 m²)', area: 4, efficiency: 0.28, tracking: true, deployable: true, mass: 10.5, degradation: 0, description: 'Deployable solar array wing.' }),
  K({ catalogId: 'ant-omni', kind: 'antenna', mount: 'radial', name: 'Omni antenna (S-band)', antennaType: 'omni', gainDbi: 0, txPowerW: 5, frequencyGHz: 2.2, dataRateBps: 2000, powerDraw: 20, standbyPower: 1.5, steerable: false, beamwidthDeg: 180, deployable: false, mass: 0.4, description: 'Low-gain antenna for telemetry and commands.' }),
  K({ catalogId: 'ant-patch', kind: 'antenna', mount: 'radial', name: 'Patch antenna (S-band)', antennaType: 'patch', gainDbi: 6, txPowerW: 10, frequencyGHz: 2.2, dataRateBps: 64000, powerDraw: 30, standbyPower: 2, steerable: false, beamwidthDeg: 90, deployable: false, mass: 0.6, description: 'Medium-gain antenna.' }),
  K({ catalogId: 'ant-hga', kind: 'antenna', mount: 'radial', name: 'High-gain dish (X-band, 0.6 m)', antennaType: 'dish', gainDbi: 29, txPowerW: 20, frequencyGHz: 8.4, dataRateBps: 500000, powerDraw: 60, standbyPower: 3, steerable: false, beamwidthDeg: 6, deployable: true, mass: 3.2, description: 'Fixed dish. Point it at Earth.' }),
  K({ catalogId: 'ins-camera', kind: 'instrument', mount: 'internal', name: 'Imaging camera', measurement: 'imaging', mass: 2.5, length: 0.2, diameter: 0.15, powerDraw: 12, standbyPower: 0.5, dataRateBps: 800000, tMin: 253, tMax: 323, description: 'Optical imager.' }),
  K({ catalogId: 'ins-spectrometer', kind: 'instrument', mount: 'internal', name: 'Spectrometer', measurement: 'spectroscopy', mass: 4, length: 0.25, diameter: 0.2, powerDraw: 18, standbyPower: 0.5, dataRateBps: 120000, tMin: 243, tMax: 323, description: 'Surface/atmosphere composition spectrometer.' }),
  K({ catalogId: 'ins-magnetometer', kind: 'instrument', mount: 'internal', name: 'Magnetometer', measurement: 'magnetometry', mass: 1, length: 0.1, diameter: 0.08, powerDraw: 3, standbyPower: 0.2, dataRateBps: 2000, tMin: 233, tMax: 333, description: 'Vector magnetometer.' }),
  K({ catalogId: 'ins-radar', kind: 'instrument', mount: 'internal', name: 'Ground-penetrating radar', measurement: 'radar', mass: 9, length: 0.3, diameter: 0.3, powerDraw: 45, standbyPower: 1, dataRateBps: 300000, tMin: 243, tMax: 323, description: 'Subsurface sounding radar.' }),
  K({ catalogId: 'thermal-radiator', kind: 'radiator', mount: 'radial', name: 'Radiator panel (1 m²)', area: 1, deployable: false, mass: 5, description: 'Rejects heat to space (adds radiating area).' }),
  K({ catalogId: 'thermal-heater', kind: 'heater', mount: 'internal', name: 'Thermostat heater', powerDraw: 30, setpointK: 283, mass: 0.5, description: 'Keeps the vehicle above freezing.' }),
  K({ catalogId: 'thermal-mli', kind: 'mli', mount: 'internal', name: 'Multilayer insulation blanket', insulationFactor: 0.06, mass: 3, description: 'Cuts radiative heat exchange with space.' }),
  K({ catalogId: 'heat-shield', kind: 'heat_shield', mount: 'stack', name: 'Ablative heat shield', mass: 20, length: 0.15, diameter: 1.0, tMax: 2800, tMin: 100, description: 'Blunt heat shield for entering atmospheres.' }),
  K({ catalogId: 'payload-dummy', kind: 'payload', mount: 'internal', name: 'Payload (mass simulator)', mass: 100, length: 0.8, diameter: 0.8, maxAccelG: 15, tMin: 233, tMax: 343, description: 'Generic payload of a given mass.' }),
  K({ catalogId: 'legs-4', kind: 'landing_legs', mount: 'radial', name: 'Landing legs (4)', deployable: true, count: 1, mass: 30, legLength: 0.8, footprintRadius: 1.6, maxImpactVelocity: 3.5, maxHorizontal: 1.5, description: 'Crushable landing legs; deploy before touchdown.' }),
  K({ catalogId: 'chute-small', kind: 'parachute', mount: 'radial', name: 'Parachute (CdA 20 m²)', dragArea: 20, deployTime: 4, maxDeployQ: 9000, maxDeploySpeed: 300, maxLoad: 120000, mass: 6, description: 'Main parachute.' }),
  K({ catalogId: 'fin-set', kind: 'fin', mount: 'radial', name: 'Fin set', cnAlpha: 4, count: 1, mass: 8, description: 'Aerodynamic stabiliser: moves the centre of pressure aft.' }),
];

export const ROVER_PARTS = [
  K({ catalogId: 'rover-chassis', kind: 'rover_chassis', mount: 'body', name: 'Rover chassis', mass: 45, length: 1.4, width: 0.9, height: 0.5, wheelbase: 1.0, trackWidth: 0.85, groundClearance: 0.25, description: 'Rover body and suspension.' }),
  K({ catalogId: 'rover-wheel', kind: 'wheel', mount: 'body', name: 'Wheel', mass: 3.5, count: 6, radius: 0.15, width: 0.12, description: 'Wire-mesh wheel.' }),
  K({ catalogId: 'rover-motor', kind: 'motor', mount: 'body', name: 'Wheel drive motor', mass: 1.6, count: 6, stallTorque: 12, noLoadSpeed: 12, efficiency: 0.78, powerDraw: 0, maxPower: 60, description: 'Geared DC motor per wheel.' }),
  K({ catalogId: 'rover-sensor', kind: 'sensor', mount: 'body', name: 'Navigation cameras', mass: 1.2, powerDraw: 6, tMin: 233, tMax: 333, description: 'Stereo navigation cameras.' }),
]

// =====================================================================================================================
// EXTENDED CATALOG (all FICTIONAL, class-typical numbers; none of these is a real product)
// `cost` = illustrative US$ per item ("each"; multiplied by `count` in src/vehicles/cost.js). These are NOT real prices.
// Kept in separate arrays so that the automatic launcher designer (which only searches ENGINES) behaves exactly as before.
// =====================================================================================================================
const SRM = (o) => E({ solid: true, propellants: ['SOLID'], minThrottle: 1, gimbal: 0, spoolTime: 0.1, ignitions: 1, ...o });
/** Strap-on booster: a solid motor that is mounted radially beside the core, ignited with it, and jettisoned as its own group ("booster"). */
export const BOOSTER_GROUP = 'booster';
const SRB = (o) => SRM({ mount: 'radial', strapOn: true, count: 2, group: BOOSTER_GROUP, maxQ: 70000, ...o });

export const EXTRA_ENGINES = [
  // --- kerolox (LOX / RP-1) ---
  E({ catalogId: 'eng-al10p', name: 'AL-10P pressure-fed kerolox engine (10 kN)', thrustVac: 10000, ispVac: 290, ispSl: 255, mixtureRatio: 2.4, propellants: ['LOX', 'RP-1'], minThrottle: 0.7, gimbal: 4, spoolTime: 0.6, ignitions: 1, mass: 14, length: 0.6, diameter: 0.28, cost: 180000, description: 'Small pressure-fed engine. Simple, lower Isp.' }),
  E({ catalogId: 'eng-al250', name: 'AL-250 kerolox engine (250 kN)', thrustVac: 250000, ispVac: 316, ispSl: 281, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 1.6, ignitions: 1, mass: 310, length: 1.9, diameter: 0.85, cost: 2200000, description: 'Medium-large booster engine class, between AL-100 and AL-500.' }),
  E({ catalogId: 'eng-al1000', name: 'AL-1000 kerolox engine (1 MN)', thrustVac: 1050000, ispVac: 317, ispSl: 283, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.6, gimbal: 5, spoolTime: 2.4, ignitions: 1, mass: 950, length: 2.9, diameter: 1.4, cost: 7500000, description: 'Large first-stage engine class (about one meganewton).' }),
  E({ catalogId: 'eng-al20v', name: 'AL-20V small vacuum kerolox engine (20 kN, restartable)', thrustVac: 20000, ispVac: 338, ispSl: 120, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 4, spoolTime: 0.8, ignitions: 3, mass: 26, length: 1.0, diameter: 0.55, vacuumOptimised: true, cost: 450000, description: 'Small upper-stage engine. Useless at sea level.' }),
  // --- hydrolox (LOX / LH2) ---
  E({ catalogId: 'eng-al30h', name: 'AL-30H small hydrolox engine (30 kN, vacuum)', thrustVac: 30000, ispVac: 440, ispSl: 200, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.5, gimbal: 4, spoolTime: 1.5, ignitions: 5, mass: 95, length: 1.8, diameter: 1.0, vacuumOptimised: true, cost: 2400000, description: 'Small hydrogen upper-stage engine. Very high Isp.' }),
  E({ catalogId: 'eng-al250h', name: 'AL-250H large hydrolox engine (250 kN, vacuum)', thrustVac: 250000, ispVac: 456, ispSl: 210, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.4, gimbal: 4, spoolTime: 2.5, ignitions: 2, mass: 650, length: 3.6, diameter: 2.1, vacuumOptimised: true, cost: 14000000, description: 'Large cryogenic upper-stage engine class.' }),
  E({ catalogId: 'eng-al1800h', name: 'AL-1800H hydrolox sustainer engine (1.8 MN, sea level capable)', thrustVac: 1800000, ispVac: 448, ispSl: 360, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.67, gimbal: 5, spoolTime: 4.0, ignitions: 1, mass: 3200, length: 4.2, diameter: 2.4, cost: 38000000, description: 'Big hydrogen engine, pad to orbit. Complex, costly.' }),
  // --- methalox (LOX / CH4) ---
  E({ catalogId: 'eng-al50m', name: 'AL-50M methalox engine (50 kN)', thrustVac: 50000, ispVac: 345, ispSl: 300, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 5, spoolTime: 1.0, ignitions: 10, mass: 80, length: 1.1, diameter: 0.5, cost: 650000, description: 'Small methane/oxygen engine class, many restarts.' }),
  E({ catalogId: 'eng-al1000m', name: 'AL-1000M methalox engine (1 MN)', thrustVac: 1000000, ispVac: 338, ispSl: 310, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 6, spoolTime: 2.0, ignitions: 3, mass: 680, length: 2.6, diameter: 1.2, cost: 5200000, description: 'Large methane/oxygen booster engine class.' }),
  E({ catalogId: 'eng-al90mv', name: 'AL-90MV vacuum methalox engine (90 kN, restartable)', thrustVac: 90000, ispVac: 372, ispSl: 190, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 4, spoolTime: 1.5, ignitions: 5, mass: 200, length: 2.2, diameter: 1.3, vacuumOptimised: true, cost: 2000000, description: 'Methane vacuum engine for upper stages.' }),
  // --- hypergolic / storable ---
  E({ catalogId: 'eng-hyp25', name: 'AL-25H hypergolic engine (25 kN)', thrustVac: 25000, ispVac: 320, ispSl: 230, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 4, spoolTime: 0.3, ignitions: 20, mass: 70, length: 1.5, diameter: 0.7, cost: 1100000, description: 'Storable upper-stage engine. Restarts easily.' }),
  E({ catalogId: 'eng-hyp01', name: 'AL-0.1H hypergolic thruster (100 N)', thrustVac: 100, ispVac: 290, ispSl: 200, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 0, spoolTime: 0.05, ignitions: 1000, mass: 0.5, length: 0.2, diameter: 0.07, cost: 35000, description: 'Tiny storable thruster for small spacecraft manoeuvres.' }),
  // --- monopropellant hydrazine ---
  E({ catalogId: 'eng-mono22', name: 'AL-M22 hydrazine thruster (22 N)', thrustVac: 22, ispVac: 225, ispSl: 180, propellants: ['N2H4'], minThrottle: 1, gimbal: 0, spoolTime: 0.05, ignitions: 1000, mass: 0.4, length: 0.2, diameter: 0.06, cost: 20000, description: 'Hydrazine thruster. Simple, low Isp.' }),
  E({ catalogId: 'eng-mono200', name: 'AL-M200 hydrazine thruster (200 N)', thrustVac: 200, ispVac: 230, ispSl: 190, propellants: ['N2H4'], minThrottle: 1, gimbal: 0, spoolTime: 0.05, ignitions: 1000, mass: 1.8, length: 0.3, diameter: 0.1, cost: 60000, description: 'Larger monopropellant thruster for satellite orbit changes.' }),
  // --- cold gas ---
  E({ catalogId: 'eng-cold10', name: 'AL-CG10 cold-gas thruster (10 N)', thrustVac: 10, ispVac: 65, ispSl: 60, propellants: ['GN2'], minThrottle: 1, gimbal: 0, spoolTime: 0.02, ignitions: 1000, mass: 0.3, length: 0.12, diameter: 0.05, cost: 6000, description: 'Just a valve and nozzle. Safe and cheap.' }),
  E({ catalogId: 'eng-cold100', name: 'AL-CG100 cold-gas thruster (100 N)', thrustVac: 100, ispVac: 70, ispSl: 65, propellants: ['GN2'], minThrottle: 1, gimbal: 0, spoolTime: 0.02, ignitions: 1000, mass: 1.4, length: 0.2, diameter: 0.08, cost: 15000, description: 'Bigger cold-gas thruster for small craft.' }),
  // --- electric propulsion ---
  E({ catalogId: 'eng-ion05', name: 'AL-EP0.4 small ion thruster (0.4 kW)', thrustVac: 0.016, ispVac: 2500, ispSl: 2500, propellants: ['XENON'], minThrottle: 0.3, gimbal: 0, spoolTime: 5, ignitions: 1000, mass: 2.5, length: 0.25, diameter: 0.15, powerDraw: 400, cost: 450000, description: 'Tiny electric thruster. Whisper of push, very efficient.' }),
  E({ catalogId: 'eng-hall1', name: 'AL-HT1 Hall thruster (1.3 kW)', thrustVac: 0.085, ispVac: 1600, ispSl: 1600, propellants: ['XENON'], minThrottle: 0.4, gimbal: 0, spoolTime: 5, ignitions: 1000, mass: 6, length: 0.3, diameter: 0.2, powerDraw: 1350, cost: 800000, description: 'Hall thruster. More push than ion, lower Isp.' }),
  E({ catalogId: 'eng-hall3', name: 'AL-HT3 Hall thruster (3 kW)', thrustVac: 0.18, ispVac: 1800, ispSl: 1800, propellants: ['XENON'], minThrottle: 0.4, gimbal: 0, spoolTime: 5, ignitions: 1000, mass: 12, length: 0.35, diameter: 0.25, powerDraw: 3000, cost: 1500000, description: 'Medium Hall thruster for big satellites.' }),
  E({ catalogId: 'eng-ion7', name: 'AL-EP7 large ion thruster (7 kW)', thrustVac: 0.24, ispVac: 4000, ispSl: 4000, propellants: ['XENON'], minThrottle: 0.3, gimbal: 0, spoolTime: 8, ignitions: 1000, mass: 14, length: 0.5, diameter: 0.4, powerDraw: 7000, cost: 3500000, description: 'Big ion thruster. Needs lots of solar power.' }),
  // --- solid motors (stage / kick motors, stack-mounted) ---
  SRM({ catalogId: 'srm-k10', name: 'AL-K10 small kick motor (10 kN)', thrustVac: 10000, ispVac: 285, ispSl: 200, propellantMass: 60, mass: 9, length: 0.8, diameter: 0.35, cost: 60000, description: 'Little solid motor giving one push to orbit.' }),
  SRM({ catalogId: 'srm-k40', name: 'AL-K40 kick motor (40 kN)', thrustVac: 40000, ispVac: 290, ispSl: 210, propellantMass: 300, mass: 30, length: 1.5, diameter: 0.6, cost: 160000, description: 'Medium solid kick motor for higher orbits.' }),
  SRM({ catalogId: 'srm-s120', name: 'AL-S120 solid rocket motor (120 kN)', thrustVac: 120000, ispVac: 272, ispSl: 244, propellantMass: 2300, mass: 210, length: 3.2, diameter: 0.9, cost: 700000, description: 'Medium solid motor for a small stage.' }),
  SRM({ catalogId: 'srm-s1000', name: 'AL-S1000 large solid rocket motor (1 MN)', thrustVac: 1000000, ispVac: 268, ispSl: 242, propellantMass: 18000, mass: 1800, length: 6.5, diameter: 1.6, cost: 4200000, description: 'Big solid stage. Cheap thrust, no shutdown.' }),
  // --- STRAP-ON BOOSTERS: radial, in pairs (count 2), own group "booster", ignite with the core, jettisoned when empty ---
  SRB({ catalogId: 'srb-b40', name: 'AL-B40 strap-on booster pair (2 × 40 kN)', thrustVac: 40000, ispVac: 265, ispSl: 238, propellantMass: 400, mass: 50, length: 3.0, diameter: 0.45, cost: 120000, description: 'Each booster: 40 kN, 26 s burn.' }),
  SRB({ catalogId: 'srb-b120', name: 'AL-B120 strap-on booster pair (2 × 120 kN)', thrustVac: 120000, ispVac: 268, ispSl: 241, propellantMass: 1500, mass: 170, length: 4.5, diameter: 0.7, cost: 420000, description: 'Each booster: 120 kN, about 33 s burn.' }),
  SRB({ catalogId: 'srb-b400', name: 'AL-B400 strap-on booster pair (2 × 400 kN)', thrustVac: 400000, ispVac: 269, ispSl: 243, propellantMass: 6000, mass: 620, length: 7.0, diameter: 1.1, cost: 1400000, description: 'Each booster: 400 kN, about 40 s burn.' }),
  SRB({ catalogId: 'srb-b1200', name: 'AL-B1200 strap-on booster pair (2 × 1.2 MN)', thrustVac: 1200000, ispVac: 270, ispSl: 244, propellantMass: 20000, mass: 2000, length: 11.0, diameter: 1.7, cost: 4600000, description: 'Each booster: 1.2 MN, 44 s burn.' }),
];
// ---------- NEW ENGINES (batch 2): more thrust classes and types. All fictional, class-typical. `plain` = short student-level hints. ----------
const PL = (best_for, trade_off) => ({ best_for, trade_off });
export const NEW_ENGINES = [
  // methalox
  E({ catalogId: 'eng-al300m', name: 'AL-300M methalox booster engine (300 kN)', thrustVac: 300000, ispVac: 340, ispSl: 305, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 6, spoolTime: 1.8, ignitions: 3, mass: 400, length: 2.1, diameter: 0.95, cost: 2600000, description: 'Mid-size methane engine for first stages. Can restart.', plain: PL('Reusable-style first stages that also land again.', 'Methane tanks are bigger than kerosene tanks.') }),
  E({ catalogId: 'eng-al2500m', name: 'AL-2500M heavy methalox engine (2.5 MN)', thrustVac: 2500000, ispVac: 343, ispSl: 312, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 6, spoolTime: 3.0, ignitions: 3, mass: 1700, length: 3.4, diameter: 1.7, cost: 13000000, description: 'Huge methane engine for super-heavy rockets.', plain: PL('Giant first stages with a few big engines.', 'Very expensive and heavy to handle.') }),
  E({ catalogId: 'eng-al15mv', name: 'AL-15MV small vacuum methalox engine (15 kN)', thrustVac: 15000, ispVac: 360, ispSl: 150, mixtureRatio: 3.4, propellants: ['LOX', 'CH4'], minThrottle: 0.4, gimbal: 4, spoolTime: 0.8, ignitions: 8, mass: 35, length: 1.0, diameter: 0.55, vacuumOptimised: true, cost: 520000, description: 'Small space engine. Restarts often.', plain: PL('Small upper stages and space tugs.', 'Only works well high above the air.') }),
  // hydrolox
  E({ catalogId: 'eng-al600h', name: 'AL-600H hydrolox sustainer engine (600 kN)', thrustVac: 600000, ispVac: 450, ispSl: 340, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.6, gimbal: 5, spoolTime: 3.0, ignitions: 1, mass: 1500, length: 3.8, diameter: 1.9, cost: 16000000, description: 'Hydrogen engine that works from pad to space.', plain: PL('Core stages that need top efficiency.', 'Hydrogen tanks are huge and hard to cool.') }),
  E({ catalogId: 'eng-al8h', name: 'AL-8H small hydrolox engine (8 kN, vacuum)', thrustVac: 8000, ispVac: 445, ispSl: 150, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.5, gimbal: 3, spoolTime: 1.2, ignitions: 5, mass: 45, length: 1.3, diameter: 0.7, vacuumOptimised: true, cost: 1400000, description: 'Tiny, very efficient hydrogen engine for upper stages.', plain: PL('Long missions where every bit of Isp counts.', 'Low thrust and complex cold tanks.') }),
  // aerospike-style (altitude compensating)
  E({ catalogId: 'eng-spike40', name: 'AL-SP40 aerospike-style kerolox engine (40 kN)', thrustVac: 40000, ispVac: 330, ispSl: 292, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 0, spoolTime: 1.2, ignitions: 2, mass: 85, length: 0.9, diameter: 1.0, cost: 1800000, description: 'Plug nozzle that adapts to altitude.', plain: PL('One engine for both air and space.', 'Hard to cool. Cannot swivel to steer.') }),
  E({ catalogId: 'eng-spike150', name: 'AL-SP150 aerospike-style kerolox engine (150 kN)', thrustVac: 150000, ispVac: 335, ispSl: 295, mixtureRatio: 2.5, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 0, spoolTime: 1.8, ignitions: 2, mass: 380, length: 1.6, diameter: 1.9, cost: 5200000, description: 'Wide plug nozzle. Efficient at any height.', plain: PL('Single-stage-to-orbit style designs.', 'Wide and heavy, with no gimbal steering.') }),
  // pressure-fed, vernier, small hypergolic
  E({ catalogId: 'eng-vern2', name: 'AL-V2 kerolox vernier engine (2 kN)', thrustVac: 2000, ispVac: 282, ispSl: 240, mixtureRatio: 2.4, propellants: ['LOX', 'RP-1'], minThrottle: 0.5, gimbal: 10, spoolTime: 0.3, ignitions: 3, mass: 6, length: 0.4, diameter: 0.18, cost: 90000, description: 'Small helper engine for steering and trimming.', plain: PL('Fine steering and small speed corrections.', 'Too weak to lift anything alone.') }),
  E({ catalogId: 'eng-desc1', name: 'AL-1D small pressure-fed lander engine (1 kN)', thrustVac: 1000, ispVac: 290, ispSl: 215, mixtureRatio: 1.65, propellants: ['NTO', 'MMH'], minThrottle: 0.3, gimbal: 2, spoolTime: 0.2, ignitions: 50, mass: 6, length: 0.45, diameter: 0.22, cost: 240000, description: 'Little throttleable engine for tiny landers and probes.', plain: PL('Soft landings of small probes.', 'Low Isp and very little thrust.') }),
  // cold gas / hydrazine micro thrusters
  E({ catalogId: 'eng-cold1', name: 'AL-CG1 micro cold-gas thruster (1 N)', thrustVac: 1, ispVac: 60, ispSl: 55, propellants: ['GN2'], minThrottle: 1, gimbal: 0, spoolTime: 0.01, ignitions: 1000, mass: 0.05, length: 0.06, diameter: 0.03, cost: 2500, description: 'Tiny gas jet for CubeSats. Gentle and cheap.', plain: PL('Nudging very small satellites.', 'Uses a lot of gas for little speed.') }),
  E({ catalogId: 'eng-mono1', name: 'AL-M1 hydrazine thruster (1 N)', thrustVac: 1, ispVac: 205, ispSl: 150, propellants: ['N2H4'], minThrottle: 1, gimbal: 0, spoolTime: 0.03, ignitions: 1000, mass: 0.3, length: 0.15, diameter: 0.04, cost: 12000, description: 'Very small fuel thruster for pointing a satellite.', plain: PL('Holding a satellite steady.', 'Toxic fuel and low Isp.') }),
  // electric
  E({ catalogId: 'eng-hall02', name: 'AL-HT0.2 micro Hall thruster (0.2 kW)', thrustVac: 0.013, ispVac: 1200, ispSl: 1200, propellants: ['XENON'], minThrottle: 0.4, gimbal: 0, spoolTime: 4, ignitions: 1000, mass: 1.2, length: 0.15, diameter: 0.1, powerDraw: 200, cost: 250000, description: 'Micro electric thruster for small satellites.', plain: PL('Slow orbit changes for tiny satellites.', 'Thrust is tiny, so it takes months.') }),
  E({ catalogId: 'eng-hall5', name: 'AL-HT5 Hall thruster (5 kW)', thrustVac: 0.3, ispVac: 1900, ispSl: 1900, propellants: ['XENON'], minThrottle: 0.4, gimbal: 0, spoolTime: 5, ignitions: 1000, mass: 18, length: 0.4, diameter: 0.3, powerDraw: 5000, cost: 2600000, description: 'Strong Hall thruster for tugs and satellites.', plain: PL('Moving heavy satellites with little fuel.', 'Needs lots of solar power.') }),
  E({ catalogId: 'eng-ion20', name: 'AL-EP20 high-power ion thruster (20 kW)', thrustVac: 0.57, ispVac: 5000, ispSl: 5000, propellants: ['XENON'], minThrottle: 0.3, gimbal: 0, spoolTime: 10, ignitions: 1000, mass: 35, length: 0.7, diameter: 0.6, powerDraw: 20000, cost: 9000000, description: 'Top-end ion engine for deep-space trips.', plain: PL('Long trips to far planets with tiny fuel.', 'Needs a huge solar array and time.') }),
  // solid kick / stage motors
  SRM({ catalogId: 'srm-k3', name: 'AL-K3 micro kick motor (3 kN)', thrustVac: 3000, ispVac: 280, ispSl: 190, propellantMass: 18, mass: 3.5, length: 0.5, diameter: 0.22, cost: 22000, description: 'Tiny solid motor for one push.', plain: PL('Small final boost for light satellites.', 'Burns out once and cannot be stopped.') }),
  SRM({ catalogId: 'srm-k200', name: 'AL-K200 solid upper-stage motor (200 kN)', thrustVac: 200000, ispVac: 288, ispSl: 215, propellantMass: 1800, mass: 170, length: 2.8, diameter: 0.8, cost: 650000, description: 'Strong solid upper stage. Burns about 25 seconds.', plain: PL('Cheap, simple second stage.', 'Cannot throttle, stop or restart.') }),
  SRM({ catalogId: 'srm-s400', name: 'AL-S400 solid booster stage (400 kN)', thrustVac: 400000, ispVac: 270, ispSl: 243, propellantMass: 7000, mass: 650, length: 4.8, diameter: 1.2, cost: 1900000, description: 'Big solid first stage. Burns about 47 seconds.', plain: PL('Simple first stage with lots of push.', 'No shutdown, so the path is fixed early.') }),
];

// ---------- APOLLO-ERA CLASS ENGINES AND PARTS (ASTRA LAB 1.9) ----------
// Numbers are rounded published values of the Apollo-era hardware they are modelled on (thrust, Isp, mass). They are labelled 'estimated':
// ASTRA LAB uses them as plain engine models (no turbopump, no combustion instability), so they are class-typical, not specifications.
const AP = (o) => E({ dataSource: 'estimated', ...o });
export const APOLLO_ENGINES = [
  AP({ catalogId: 'eng-f1', name: 'F-1-class kerolox engine (Apollo-era, 7.8 MN vacuum)', thrustVac: 7770000, ispVac: 304, ispSl: 263, mixtureRatio: 2.27, propellants: ['LOX', 'RP-1'], minThrottle: 1, gimbal: 5.5, spoolTime: 4.0, ignitions: 1, mass: 8400, length: 5.6, diameter: 3.7, cost: 60000000, description: 'Giant first-stage kerolox engine of the Saturn V class. Cannot be throttled.' }),
  AP({ catalogId: 'eng-j2', name: 'J-2-class hydrolox engine (Apollo-era, 1.03 MN vacuum, restartable)', thrustVac: 1033000, ispVac: 421, ispSl: 200, mixtureRatio: 5.5, propellants: ['LOX', 'LH2'], minThrottle: 0.8, gimbal: 7, spoolTime: 3.0, ignitions: 3, mass: 1580, length: 3.4, diameter: 2.0, vacuumOptimised: true, cost: 20000000, description: 'Upper-stage hydrogen engine of the Saturn V class. Restartable (trans-lunar injection).' }),
  AP({ catalogId: 'eng-sps', name: 'SPS-class storable engine (Apollo-era, 91 kN, restartable)', thrustVac: 91200, ispVac: 314, ispSl: 200, mixtureRatio: 1.6, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 4, spoolTime: 0.6, ignitions: 50, mass: 300, length: 3.9, diameter: 1.2, vacuumOptimised: true, cost: 12000000, description: 'Service-module main engine class: fixed thrust, very reliable restarts.' }),
  AP({ catalogId: 'eng-dps', name: 'DPS-class throttleable descent engine (Apollo-era, 45 kN)', thrustVac: 45040, ispVac: 311, ispSl: 200, mixtureRatio: 1.6, propellants: ['NTO', 'MMH'], minThrottle: 0.1, gimbal: 6, spoolTime: 0.5, ignitions: 30, mass: 179, length: 1.5, diameter: 1.5, vacuumOptimised: true, cost: 9000000, description: 'Lunar-module descent engine class: deep throttling from 10 % to 100 %.' }),
  AP({ catalogId: 'eng-aps', name: 'APS-class ascent engine (Apollo-era, 15.6 kN, fixed thrust)', thrustVac: 15570, ispVac: 311, ispSl: 200, mixtureRatio: 1.6, propellants: ['NTO', 'MMH'], minThrottle: 1, gimbal: 0, spoolTime: 0.3, ignitions: 20, mass: 82, length: 1.2, diameter: 0.8, vacuumOptimised: true, cost: 5000000, description: 'Lunar-module ascent engine class: simple pressure-fed engine, fixed thrust.' }),
];
export const APOLLO_PARTS = [
  K({ catalogId: 'fuel-cell', kind: 'fuel_cell', mount: 'internal', name: 'Hydrogen-oxygen fuel cell (1.4 kW)', powerW: 1400, reactantMass: 107, kWhPerKg: 2.2, mass: 157, length: 0.5, diameter: 0.5, tMin: 273, tMax: 358, dataSource: 'estimated', description: 'Makes electricity from stored hydrogen and oxygen. Stops when the reactants run out.' }),
];
export const ALL_ENGINES = [...ENGINES, ...EXTRA_ENGINES, ...NEW_ENGINES, ...APOLLO_ENGINES];

// ---------- tank presets (computed by the same makeTank/resizeTank code as the Designer uses, so they stay consistent) ----------
const tankPreset = (catalogId, propellant, propMass, diameter, label, extra = {}) => {
  const t = makeTank(propellant, propMass, diameter, { name: `${label} tank`, ...extra });
  const rate = (extra.tankageFactor ? 1600 : 450) * (propellant === 'LH2' ? 1.6 : 1);
  return { catalogId, ...t, cost: Math.round((t.mass * rate) / 1000) * 1000, description: `${extra.tankageFactor ? 'Composite' : 'Aluminium-class'} tank for ${PROPELLANTS[propellant].label.toLowerCase().replace(/ \(.*\)/, '')}.`, ...(extra.tankageFactor ? { material: 'composite' } : { material: 'aluminium' }) };
};
const COMP = { tankageFactor: 0.65 };
export const TANK_PRESETS = [
  tankPreset('tank-rp1-300', 'RP-1', 300, 0.5, 'RP-1 300 kg'), tankPreset('tank-lox-750', 'LOX', 750, 0.5, 'LOX 750 kg'),
  tankPreset('tank-rp1-1500', 'RP-1', 1500, 1.0, 'RP-1 1.5 t'), tankPreset('tank-lox-3750', 'LOX', 3750, 1.0, 'LOX 3.75 t'),
  tankPreset('tank-rp1-6000', 'RP-1', 6000, 1.6, 'RP-1 6 t'), tankPreset('tank-lox-15000', 'LOX', 15000, 1.6, 'LOX 15 t'),
  tankPreset('tank-rp1-6000c', 'RP-1', 6000, 1.6, 'RP-1 6 t composite', COMP), tankPreset('tank-lox-15000c', 'LOX', 15000, 1.6, 'LOX 15 t composite', COMP),
  tankPreset('tank-rp1-20000', 'RP-1', 20000, 2.4, 'RP-1 20 t'), tankPreset('tank-lox-50000', 'LOX', 50000, 2.4, 'LOX 50 t'),
  tankPreset('tank-lh2-400', 'LH2', 400, 1.6, 'LH2 400 kg'), tankPreset('tank-lox-hl-2200', 'LOX', 2200, 1.6, 'LOX 2.2 t (hydrolox)'),
  tankPreset('tank-lh2-2000', 'LH2', 2000, 2.4, 'LH2 2 t'), tankPreset('tank-lox-hl-11000', 'LOX', 11000, 2.4, 'LOX 11 t (hydrolox)'),
  tankPreset('tank-ch4-1000', 'CH4', 1000, 1.0, 'Methane 1 t'), tankPreset('tank-lox-ch4-3400', 'LOX', 3400, 1.0, 'LOX 3.4 t (methalox)'),
  tankPreset('tank-mmh-300', 'MMH', 300, 0.8, 'MMH 300 kg'), tankPreset('tank-nto-495', 'NTO', 495, 0.8, 'NTO 495 kg'),
  tankPreset('tank-n2h4-50', 'N2H4', 50, 0.4, 'Hydrazine 50 kg'), tankPreset('tank-gn2-5', 'GN2', 5, 0.3, 'Nitrogen gas 5 kg'),
  tankPreset('tank-xenon-50', 'XENON', 50, 0.4, 'Xenon 50 kg'), tankPreset('tank-xenon-200', 'XENON', 200, 0.6, 'Xenon 200 kg'),
];

// ---------- structures ----------
/** Stage separation hardware (ring + pyrotechnic bolts/springs). In ASTRA LAB it contributes mass and axial strength; separation itself is the SEPARATE mission event. */
export function makeDecoupler(diameter, extra = {}) {
  return { kind: 'decoupler', mount: 'stack', dataSource: 'fictional', diameter, length: Math.max(0.1, Math.round(0.14 * diameter * 100) / 100 + 0.06), mass: Math.round((4 + 18 * diameter * diameter) * 10) / 10, strength: 2.0e6 * diameter ** 2, maxQAlpha: 3400 * diameter ** 2, maxQ: 60000, tMax: 500, tMin: 100, name: 'Decoupler', separation: 'pyro ring', ...extra };
}
const S = (base, o) => ({ ...base, ...o });
export const STRUCTURE_PARTS = [
  // nose cones
  S(makeNose(0.5, 1.0, 'ogive'), { catalogId: 'nose-ogive-0.5', name: 'Ogive nose cone Ø0.5 m', cost: 9000, description: 'Smooth low-drag nose for small rockets.' }),
  S(makeNose(1.0, 2.0, 'ogive'), { catalogId: 'nose-ogive-1.0', name: 'Ogive nose cone Ø1.0 m', cost: 30000, description: 'Smooth low-drag nose for medium rockets.' }),
  S(makeNose(2.0, 4.0, 'ogive'), { catalogId: 'nose-ogive-2.0', name: 'Ogive nose cone Ø2.0 m', cost: 120000, description: 'Smooth low-drag nose for large rockets.' }),
  S(makeNose(1.0, 1.6, 'cone'), { catalogId: 'nose-cone-1.0', name: 'Conical nose cone Ø1.0 m', cost: 20000, description: 'Simple cone. Cheap, slightly more drag.' }),
  S(makeNose(1.0, 0.6, 'blunt'), { catalogId: 'nose-blunt-1.0', name: 'Blunt nose cap Ø1.0 m', noseRadius: 0.35, tMax: 900, cost: 14000, description: 'Short rounded cap. More drag, less heating.' }),
  // fairings
  S(makeFairing(0.8, 2.4), { catalogId: 'fairing-0.8', name: 'Payload fairing Ø0.8 × 2.4 m', cost: 60000, description: 'Small fairing for tiny satellites.' }),
  S(makeFairing(1.2, 3.5), { catalogId: 'fairing-1.2', name: 'Payload fairing Ø1.2 × 3.5 m', cost: 150000, description: 'Fairing for small satellites.' }),
  S(makeFairing(2.0, 5.5), { catalogId: 'fairing-2.0', name: 'Payload fairing Ø2.0 × 5.5 m', cost: 600000, description: 'Fairing for medium satellites and probes.' }),
  S(makeFairing(3.0, 8.0), { catalogId: 'fairing-3.0', name: 'Payload fairing Ø3.0 × 8.0 m', cost: 1800000, description: 'Large fairing for big satellites.' }),
  // interstages
  S(makeStructure('interstage', 0.6, 0.4), { catalogId: 'interstage-0.6', name: 'Interstage Ø0.6 m', cost: 12000, description: 'Connects two stages and shelters the upper engine.' }),
  S(makeStructure('interstage', 1.0, 0.5), { catalogId: 'interstage-1.0', name: 'Interstage Ø1.0 m', cost: 25000, description: 'Connects two stages and shelters the upper engine.' }),
  S(makeStructure('interstage', 1.6, 0.7), { catalogId: 'interstage-1.6', name: 'Interstage Ø1.6 m', cost: 55000, description: 'Connects two stages and shelters the upper engine.' }),
  S(makeStructure('interstage', 2.4, 1.0), { catalogId: 'interstage-2.4', name: 'Interstage Ø2.4 m', cost: 120000, description: 'Connects two stages and shelters the upper engine.' }),
  // payload adapters (cone-shaped, narrow toward the payload)
  S(makeStructure('structural_section', 0.6, 0.25), { catalogId: 'adapter-0.6', name: 'Payload adapter Ø0.6 m', structure: 'adapter', mass: 7, strength: 2.0e6 * 0.36, cost: 18000, description: 'Short ring that clamps a payload.' }),
  S(makeStructure('structural_section', 1.0, 0.35), { catalogId: 'adapter-1.0', name: 'Payload adapter Ø1.0 m', structure: 'adapter', mass: 15, strength: 2.0e6, cost: 40000, description: 'Short ring that clamps a payload.' }),
  S(makeStructure('structural_section', 1.6, 0.5), { catalogId: 'adapter-1.6', name: 'Payload adapter Ø1.6 m', structure: 'adapter', mass: 34, strength: 2.0e6 * 2.56, cost: 90000, description: 'Short ring that clamps a payload.' }),
  S(makeStructure('structural_section', 2.4, 0.7), { catalogId: 'adapter-2.4', name: 'Payload adapter Ø2.4 m', structure: 'adapter', mass: 75, strength: 2.0e6 * 5.76, cost: 180000, description: 'Short ring that clamps a payload.' }),
  // open trusses (light, but not aerodynamic: use them above the dense air)
  S(makeStructure('structural_section', 0.6, 1.0), { catalogId: 'truss-0.6', name: 'Open truss Ø0.6 × 1.0 m', structure: 'truss', mass: 8, strength: 0.7e6 * 0.36, maxQAlpha: 800 * 0.36, maxQ: 20000, cost: 30000, description: 'Light open frame for use in space.' }),
  S(makeStructure('structural_section', 1.2, 2.0), { catalogId: 'truss-1.2', name: 'Open truss Ø1.2 × 2.0 m', structure: 'truss', mass: 30, strength: 0.7e6 * 1.44, maxQAlpha: 800 * 1.44, maxQ: 20000, cost: 90000, description: 'Light open frame for buses and upper stages.' }),
  S(makeStructure('structural_section', 2.0, 3.0), { catalogId: 'truss-2.0', name: 'Open truss Ø2.0 × 3.0 m', structure: 'truss', mass: 75, strength: 0.7e6 * 4, maxQAlpha: 800 * 4, maxQ: 20000, cost: 220000, description: 'Large open frame for heavy space payloads.' }),
  // decouplers (new kind)
  S(makeDecoupler(0.6), { catalogId: 'decoupler-0.6', name: 'Decoupler Ø0.6 m', cost: 25000, description: 'Bolt ring between two stages.' }),
  S(makeDecoupler(1.0), { catalogId: 'decoupler-1.0', name: 'Decoupler Ø1.0 m', cost: 45000, description: 'Bolt ring between two stages.' }),
  S(makeDecoupler(1.6), { catalogId: 'decoupler-1.6', name: 'Decoupler Ø1.6 m', cost: 80000, description: 'Bolt ring between two stages.' }),
  S(makeDecoupler(2.4), { catalogId: 'decoupler-2.4', name: 'Decoupler Ø2.4 m', cost: 140000, description: 'Bolt ring between two stages.' }),
];

// ---------- fins, heat shields, landing, parachutes ----------
export const EXTRA_OTHER = [
  K({ catalogId: 'fin-small', kind: 'fin', mount: 'radial', name: 'Small fin set (4 fins)', cnAlpha: 2, count: 1, mass: 4, cost: 4000, description: 'Small aerodynamic stabilisers for light rockets.' }),
  K({ catalogId: 'fin-large', kind: 'fin', mount: 'radial', name: 'Large fin set (4 fins)', cnAlpha: 7, count: 1, mass: 25, cost: 30000, description: 'Big fins for tall, light rockets.' }),
  K({ catalogId: 'gridfin-set', kind: 'fin', mount: 'radial', name: 'Grid fin set (4 fins)', gridFin: true, cnAlpha: 2.5, count: 1, mass: 40, tMax: 1200, cost: 160000, description: 'Grid fins for high speed. Modelled as stabilisers.' }),
  // heat shields
  K({ catalogId: 'shield-ablative-0.8', kind: 'heat_shield', mount: 'stack', name: 'Light ablative heat shield Ø0.8 m', shieldType: 'ablative', mass: 11, length: 0.1, diameter: 0.8, tMax: 2800, tMin: 100, cost: 70000, description: 'Thin shield that chars away for capsules.' }),
  K({ catalogId: 'shield-ablative-1.5', kind: 'heat_shield', mount: 'stack', name: 'Ablative heat shield Ø1.5 m', shieldType: 'ablative', mass: 65, length: 0.18, diameter: 1.5, tMax: 2900, tMin: 100, cost: 320000, description: 'Medium ablative shield for capsules and landers.' }),
  K({ catalogId: 'shield-ablative-2.5', kind: 'heat_shield', mount: 'stack', name: 'Ablative heat shield Ø2.5 m', shieldType: 'ablative', mass: 210, length: 0.25, diameter: 2.5, tMax: 3000, tMin: 100, cost: 1100000, description: 'Large ablative shield for heavy entry vehicles.' }),
  K({ catalogId: 'shield-tiles-1.5', kind: 'heat_shield', mount: 'stack', name: 'Ceramic tile shield Ø1.5 m', shieldType: 'tiles', mass: 55, length: 0.15, diameter: 1.5, tMax: 1900, tMin: 100, cost: 600000, description: 'Reusable tiles. Light, handle less heat.' }),
  K({ catalogId: 'shield-cc-0.5', kind: 'heat_shield', mount: 'stack', name: 'Carbon-carbon nose cap Ø0.5 m', shieldType: 'carbon', mass: 14, length: 0.12, diameter: 0.5, tMax: 3600, tMin: 100, cost: 260000, description: 'Carbon cap for very hot edges. Costly.' }),
  // landing
  K({ catalogId: 'legs-small', kind: 'landing_legs', mount: 'radial', name: 'Small landing legs (4)', deployable: true, count: 1, mass: 12, legLength: 0.5, footprintRadius: 1.0, maxImpactVelocity: 2.5, maxHorizontal: 1.0, cost: 90000, description: 'Light legs for small landers.' }),
  K({ catalogId: 'legs-large', kind: 'landing_legs', mount: 'radial', name: 'Large landing legs (4)', deployable: true, count: 1, mass: 120, legLength: 1.5, footprintRadius: 3.2, maxImpactVelocity: 4.5, maxHorizontal: 2.0, cost: 900000, description: 'Wide heavy legs for tall or heavy landers.' }),
  K({ catalogId: 'chute-drogue', kind: 'parachute', mount: 'radial', name: 'Drogue parachute (CdA 2.5 m²)', dragArea: 2.5, deployTime: 1.5, maxDeployQ: 40000, maxDeploySpeed: 700, maxLoad: 60000, mass: 2.5, cost: 12000, description: 'Small chute that opens at high speed.' }),
  K({ catalogId: 'chute-medium', kind: 'parachute', mount: 'radial', name: 'Main parachute (CdA 60 m²)', dragArea: 60, deployTime: 6, maxDeployQ: 7000, maxDeploySpeed: 250, maxLoad: 100000, mass: 14, cost: 120000, description: 'Main chute for capsules and small probes.' }),
  K({ catalogId: 'chute-large', kind: 'parachute', mount: 'radial', name: 'Large parachute (CdA 250 m²)', dragArea: 250, deployTime: 9, maxDeployQ: 5000, maxDeploySpeed: 220, maxLoad: 300000, mass: 55, cost: 450000, description: 'Large main chute for heavy capsules.' }),
  K({ catalogId: 'chute-huge', kind: 'parachute', mount: 'radial', name: 'Huge parachute (CdA 900 m²)', dragArea: 900, deployTime: 14, maxDeployQ: 3000, maxDeploySpeed: 180, maxLoad: 1000000, mass: 190, cost: 1500000, description: 'Giant chute for heavy loads or Mars.' }),
  // reaction wheels / control moment gyro
  K({ catalogId: 'rw-nano', kind: 'reaction_wheel', mount: 'internal', name: 'Nano reaction wheel', mass: 0.3, length: 0.05, diameter: 0.06, torque: 0.002, momentumCap: 0.02, powerDraw: 2, tMin: 253, tMax: 333, cost: 15000, description: 'Tiny wheel for CubeSat-class spacecraft.' }),
  K({ catalogId: 'rw-small', kind: 'reaction_wheel', mount: 'internal', name: 'Small reaction wheel', mass: 1.2, length: 0.07, diameter: 0.12, torque: 0.03, momentumCap: 1, powerDraw: 8, tMin: 253, tMax: 333, cost: 60000, description: 'Wheel for small satellites (10 to 200 kg).' }),
  K({ catalogId: 'rw-large', kind: 'reaction_wheel', mount: 'internal', name: 'Large reaction wheel', mass: 25, length: 0.2, diameter: 0.5, torque: 1.0, momentumCap: 100, powerDraw: 130, tMin: 253, tMax: 333, cost: 400000, description: 'Big wheel for heavy spacecraft.' }),
  K({ catalogId: 'cmg', kind: 'reaction_wheel', mount: 'internal', name: 'Control moment gyro', mass: 80, length: 0.4, diameter: 0.6, torque: 25, momentumCap: 4000, powerDraw: 200, tMin: 253, tMax: 333, cost: 1800000, description: 'Gyro giving huge turning force. For big craft.' }),
  // RCS
  K({ catalogId: 'rcs-cold', kind: 'rcs', mount: 'radial', name: 'RCS cold-gas module', mass: 3, torque: 6, thrust: 10, isp: 65, propellantMass: 3, cost: 25000, description: 'Nitrogen gas thrusters for CubeSats and small probes.' }),
  K({ catalogId: 'rcs-medium', kind: 'rcs', mount: 'radial', name: 'RCS medium module', mass: 12, torque: 150, thrust: 250, isp: 222, propellantMass: 20, cost: 200000, description: 'Medium hydrazine thrusters for small stages.' }),
  K({ catalogId: 'rcs-xl', kind: 'rcs', mount: 'radial', name: 'RCS extra-large module', mass: 80, torque: 1800, thrust: 2000, isp: 228, propellantMass: 150, cost: 900000, description: 'Big RCS module for large stages and landers.' }),
  // batteries
  K({ catalogId: 'battery-20', kind: 'battery', mount: 'internal', name: 'Battery 20 Wh', mass: 0.15, length: 0.05, diameter: 0.08, capacityWh: 20, maxPower: 60, tMin: 273, tMax: 313, cost: 1500, description: 'Small pack for CubeSats.' }),
  K({ catalogId: 'battery-50', kind: 'battery', mount: 'internal', name: 'Battery 50 Wh', mass: 0.4, length: 0.08, diameter: 0.1, capacityWh: 50, maxPower: 150, tMin: 273, tMax: 313, cost: 3500, description: 'Small pack for small satellites.' }),
  K({ catalogId: 'battery-1000', kind: 'battery', mount: 'internal', name: 'Battery 1000 Wh', mass: 7.5, length: 0.25, diameter: 0.35, capacityWh: 1000, maxPower: 3000, tMin: 273, tMax: 313, cost: 55000, description: 'Mid-size pack for probes and small rovers.' }),
  K({ catalogId: 'battery-5000', kind: 'battery', mount: 'internal', name: 'Battery 5000 Wh', mass: 34, length: 0.4, diameter: 0.5, capacityWh: 5000, maxPower: 12000, tMin: 273, tMax: 313, cost: 240000, description: 'Large pack for crewed-size spacecraft and big rovers.' }),
  K({ catalogId: 'battery-10000', kind: 'battery', mount: 'internal', name: 'Battery 10 kWh', mass: 67, length: 0.5, diameter: 0.6, capacityWh: 10000, maxPower: 25000, tMin: 273, tMax: 313, cost: 450000, description: 'Very large pack (about 150 Wh per kilogram).' }),
  // solar
  K({ catalogId: 'solar-0.25', kind: 'solar_panel', mount: 'radial', name: 'Solar panel (0.25 m²)', area: 0.25, efficiency: 0.28, tracking: false, deployable: true, mass: 0.7, degradation: 0, cost: 15000, description: 'CubeSat-size deployable panel (fixed, not sun-tracking).' }),
  K({ catalogId: 'solar-2', kind: 'solar_panel', mount: 'radial', name: 'Solar panel (2 m²)', area: 2, efficiency: 0.28, tracking: true, deployable: true, mass: 6, degradation: 0, cost: 110000, description: 'Deployable panel segment (2 m²).' }),
  K({ catalogId: 'solar-10', kind: 'solar_panel', mount: 'radial', name: 'Solar array (10 m²)', area: 10, efficiency: 0.28, tracking: true, deployable: true, mass: 26, degradation: 0, cost: 520000, description: 'Large deployable wing (10 m²).' }),
  K({ catalogId: 'solar-25', kind: 'solar_panel', mount: 'radial', name: 'Solar array (25 m²)', area: 25, efficiency: 0.28, tracking: true, deployable: true, mass: 62, degradation: 0, cost: 1250000, description: 'Huge unfolding wing for electric spacecraft.' }),
  K({ catalogId: 'solar-gaas-4', kind: 'solar_panel', mount: 'radial', name: 'High-efficiency solar array (4 m², 32 %)', area: 4, efficiency: 0.32, tracking: true, deployable: true, mass: 14, degradation: 0, cost: 480000, description: 'Top solar cells. More power, much costlier.' }),
  K({ catalogId: 'solar-si-2', kind: 'solar_panel', mount: 'radial', name: 'Silicon solar panel (2 m², 18 %)', area: 2, efficiency: 0.18, tracking: true, deployable: true, mass: 4.5, degradation: 0, cost: 40000, description: 'Budget solar cells. Cheap, less power.' }),
  K({ catalogId: 'solar-body-1', kind: 'solar_panel', mount: 'radial', name: 'Body-mounted solar panel (1 m²)', area: 1, efficiency: 0.26, tracking: false, deployable: false, mass: 2.4, degradation: 0, cost: 45000, description: 'Skin panel. Only works facing the Sun.' }),
  // antennas (gain and beam width follow the dish size; fictional but physically consistent)
  K({ catalogId: 'ant-whip', kind: 'antenna', mount: 'radial', name: 'Whip antenna (UHF)', antennaType: 'whip', gainDbi: 2, txPowerW: 2, frequencyGHz: 0.4, dataRateBps: 1200, powerDraw: 8, standbyPower: 0.5, steerable: false, beamwidthDeg: 180, deployable: false, mass: 0.15, cost: 8000, description: 'Simple rod. Works any way, very slow data.' }),
  K({ catalogId: 'ant-lga', kind: 'antenna', mount: 'radial', name: 'Low-gain horn (X-band)', antennaType: 'horn', gainDbi: 8, txPowerW: 10, frequencyGHz: 8.4, dataRateBps: 8000, powerDraw: 30, standbyPower: 2, steerable: false, beamwidthDeg: 60, deployable: false, mass: 0.8, cost: 60000, description: 'Wide beam. The usual safe-mode antenna.' }),
  K({ catalogId: 'ant-horn', kind: 'antenna', mount: 'radial', name: 'Medium-gain horn (X-band)', antennaType: 'horn', gainDbi: 16, txPowerW: 20, frequencyGHz: 8.4, dataRateBps: 60000, powerDraw: 45, standbyPower: 2.5, steerable: false, beamwidthDeg: 25, deployable: false, mass: 1.4, cost: 110000, description: 'Medium beam. Roughly point at Earth.' }),
  K({ catalogId: 'ant-dish03', kind: 'antenna', mount: 'radial', name: 'Dish 0.3 m (X-band)', antennaType: 'dish', gainDbi: 26, txPowerW: 10, frequencyGHz: 8.4, dataRateBps: 150000, powerDraw: 40, standbyPower: 2, steerable: false, beamwidthDeg: 8, deployable: false, mass: 1.6, cost: 160000, description: 'Small dish. Point within about 4 degrees.' }),
  K({ catalogId: 'ant-dish10', kind: 'antenna', mount: 'radial', name: 'Dish 1.0 m (X-band)', antennaType: 'dish', gainDbi: 36.5, txPowerW: 30, frequencyGHz: 8.4, dataRateBps: 1500000, powerDraw: 85, standbyPower: 3.5, steerable: false, beamwidthDeg: 2.5, deployable: true, mass: 6.5, cost: 650000, description: 'Standard deep-space dish. Fast data, narrow beam.' }),
  K({ catalogId: 'ant-dish10-gimbal', kind: 'antenna', mount: 'radial', name: 'Gimballed dish 1.0 m (X-band)', antennaType: 'dish', gainDbi: 36.5, txPowerW: 30, frequencyGHz: 8.4, dataRateBps: 1500000, powerDraw: 95, standbyPower: 4, steerable: true, beamwidthDeg: 2.5, deployable: true, mass: 11, cost: 1300000, description: 'Dish on a motor that follows Earth.' }),
  K({ catalogId: 'ant-dish20', kind: 'antenna', mount: 'radial', name: 'Dish 2.0 m (X-band)', antennaType: 'dish', gainDbi: 42.5, txPowerW: 50, frequencyGHz: 8.4, dataRateBps: 4000000, powerDraw: 130, standbyPower: 5, steerable: false, beamwidthDeg: 1.25, deployable: true, mass: 22, cost: 1500000, description: 'Big dish for outer planets. Needs accurate aim.' }),
  K({ catalogId: 'ant-dish-ka', kind: 'antenna', mount: 'radial', name: 'Dish 1.0 m (Ka-band)', antennaType: 'dish', gainDbi: 48, txPowerW: 50, frequencyGHz: 32, dataRateBps: 20000000, powerDraw: 140, standbyPower: 5, steerable: false, beamwidthDeg: 0.7, deployable: true, mass: 9, cost: 1900000, description: 'Higher frequency. Far more data, very precise aim.' }),
  K({ catalogId: 'ant-dish30', kind: 'antenna', mount: 'radial', name: 'Dish 3.0 m (X-band)', antennaType: 'dish', gainDbi: 46, txPowerW: 100, frequencyGHz: 8.4, dataRateBps: 8000000, powerDraw: 260, standbyPower: 8, steerable: false, beamwidthDeg: 0.83, deployable: true, mass: 48, cost: 3200000, description: 'Large deployable dish for flagship deep-space missions.' }),
  // instruments (each fictional; only mass, power, data rate and temperature limits are simulated)
  K({ catalogId: 'ins-cam-micro', kind: 'instrument', mount: 'internal', name: 'Micro camera', measurement: 'imaging', mass: 0.3, length: 0.06, diameter: 0.05, powerDraw: 2, standbyPower: 0.1, dataRateBps: 200000, tMin: 253, tMax: 323, cost: 25000, description: 'Tiny visible-light camera for CubeSats.' }),
  K({ catalogId: 'ins-cam-hires', kind: 'instrument', mount: 'internal', name: 'High-resolution camera', measurement: 'imaging', mass: 12, length: 0.6, diameter: 0.25, powerDraw: 40, standbyPower: 1.5, dataRateBps: 6000000, tMin: 253, tMax: 323, cost: 4500000, description: 'Large camera. Sharp pictures, lots of data.' }),
  K({ catalogId: 'ins-cam-ir', kind: 'instrument', mount: 'internal', name: 'Thermal infrared camera', measurement: 'thermal_imaging', mass: 3, length: 0.2, diameter: 0.12, powerDraw: 18, standbyPower: 0.8, dataRateBps: 400000, tMin: 233, tMax: 323, cost: 900000, description: 'Sees heat instead of light: maps surface temperature.' }),
  K({ catalogId: 'ins-spec-ir', kind: 'instrument', mount: 'internal', name: 'Infrared spectrometer', measurement: 'spectroscopy', mass: 6, length: 0.3, diameter: 0.2, powerDraw: 22, standbyPower: 0.8, dataRateBps: 250000, tMin: 243, tMax: 323, cost: 2000000, description: 'Splits light into colours to find minerals.' }),
  K({ catalogId: 'ins-rad', kind: 'instrument', mount: 'internal', name: 'Radiation sensor', measurement: 'radiation', mass: 0.5, length: 0.08, diameter: 0.06, powerDraw: 1.5, standbyPower: 0.1, dataRateBps: 1000, tMin: 233, tMax: 333, cost: 90000, description: 'Counts particles to measure radiation.' }),
  K({ catalogId: 'ins-weather', kind: 'instrument', mount: 'internal', name: 'Weather station', measurement: 'weather', mass: 1.5, length: 0.15, diameter: 0.1, powerDraw: 5, standbyPower: 0.3, dataRateBps: 500, tMin: 203, tMax: 333, cost: 350000, description: 'Measures pressure, temperature and wind.' }),
  K({ catalogId: 'ins-seismo', kind: 'instrument', mount: 'internal', name: 'Seismometer', measurement: 'seismology', mass: 2, length: 0.15, diameter: 0.15, powerDraw: 3, standbyPower: 0.5, dataRateBps: 2000, tMin: 223, tMax: 323, cost: 1500000, description: 'Listens for quakes inside a planet.' }),
  K({ catalogId: 'ins-massspec', kind: 'instrument', mount: 'internal', name: 'Mass spectrometer', measurement: 'mass_spectrometry', mass: 12, length: 0.4, diameter: 0.25, powerDraw: 40, standbyPower: 2, dataRateBps: 30000, tMin: 253, tMax: 323, cost: 5500000, description: 'Weighs gas or soil molecules.' }),
  K({ catalogId: 'ins-dust', kind: 'instrument', mount: 'internal', name: 'Dust and particle counter', measurement: 'particles', mass: 1.8, length: 0.15, diameter: 0.12, powerDraw: 6, standbyPower: 0.4, dataRateBps: 3000, tMin: 233, tMax: 333, cost: 700000, description: 'Counts tiny grains hitting the spacecraft.' }),
  K({ catalogId: 'ins-laser-alt', kind: 'instrument', mount: 'internal', name: 'Laser altimeter (science)', measurement: 'altimetry', mass: 7, length: 0.3, diameter: 0.2, powerDraw: 30, standbyPower: 1, dataRateBps: 20000, tMin: 243, tMax: 323, cost: 2800000, description: 'Measures terrain height with laser pulses.' }),
  // sensors (engineering sensors: ASTRA LAB counts their mass, power and heat; the flight computer's pointing accuracy is set by the avionics/guidance unit)
  K({ catalogId: 'sens-startracker', kind: 'sensor', mount: 'internal', name: 'Star tracker', sensorType: 'star_tracker', mass: 1.5, length: 0.15, diameter: 0.1, powerDraw: 8, tMin: 243, tMax: 333, cost: 300000, description: 'Finds pointing direction from star patterns.' }),
  K({ catalogId: 'sens-sun', kind: 'sensor', mount: 'internal', name: 'Sun sensor', sensorType: 'sun_sensor', mass: 0.05, length: 0.03, diameter: 0.03, powerDraw: 0.3, tMin: 223, tMax: 353, cost: 8000, description: 'Tiny sensor that finds the Sun.' }),
  K({ catalogId: 'sens-imu-mems', kind: 'sensor', mount: 'internal', name: 'MEMS inertial unit', sensorType: 'imu', mass: 0.3, length: 0.06, diameter: 0.06, powerDraw: 1.5, tMin: 233, tMax: 343, cost: 20000, description: 'Cheap chip gyros. Fine for short flights.' }),
  K({ catalogId: 'sens-imu-fog', kind: 'sensor', mount: 'internal', name: 'Fibre-optic gyro inertial unit', sensorType: 'imu', mass: 4, length: 0.15, diameter: 0.15, powerDraw: 20, tMin: 243, tMax: 333, cost: 450000, description: 'Precise laser gyros. Very little drift.' }),
  K({ catalogId: 'sens-gps', kind: 'sensor', mount: 'internal', name: 'GNSS receiver', sensorType: 'gps', mass: 0.1, length: 0.08, diameter: 0.05, powerDraw: 1, tMin: 233, tMax: 343, cost: 15000, description: 'Satellite-navigation receiver: works only near the Earth.' }),
  K({ catalogId: 'sens-radar-alt', kind: 'sensor', mount: 'internal', name: 'Radar altimeter', sensorType: 'radar_altimeter', mass: 2.5, length: 0.2, diameter: 0.15, powerDraw: 18, tMin: 233, tMax: 343, cost: 250000, description: 'Measures height above the ground during a landing.' }),
  K({ catalogId: 'sens-lidar', kind: 'sensor', mount: 'internal', name: 'Landing lidar', sensorType: 'lidar', mass: 5, length: 0.25, diameter: 0.2, powerDraw: 35, tMin: 243, tMax: 333, cost: 1200000, description: 'Laser scanner that maps landing hazards.' }),
  K({ catalogId: 'sens-horizon', kind: 'sensor', mount: 'internal', name: 'Horizon sensor', sensorType: 'horizon', mass: 0.8, length: 0.1, diameter: 0.08, powerDraw: 3, tMin: 233, tMax: 343, cost: 70000, description: 'Finds the edge of the planet below.' }),
  // avionics & computers
  K({ catalogId: 'avionics-mini', kind: 'avionics', mount: 'internal', name: 'Mini flight computer', mass: 2.5, length: 0.12, diameter: 0.15, powerDraw: 25, guidance: true, pointingAccuracyDeg: 1.0, tMin: 233, tMax: 343, maxAccelG: 20, cost: 120000, description: 'Small launch-vehicle controller for light rockets: less accurate.' }),
  K({ catalogId: 'avionics-heavy', kind: 'avionics', mount: 'internal', name: 'Heavy redundant flight computer', mass: 40, length: 0.4, diameter: 0.5, powerDraw: 180, guidance: true, pointingAccuracyDeg: 0.2, tMin: 233, tMax: 343, maxAccelG: 30, cost: 2800000, description: 'Triple-redundant controller for big launchers.' }),
  K({ catalogId: 'gnc-lite', kind: 'guidance', mount: 'internal', name: 'Basic GNC unit (IMU only)', mass: 1, length: 0.1, diameter: 0.12, powerDraw: 6, guidance: true, pointingAccuracyDeg: 0.5, tMin: 243, tMax: 333, maxAccelG: 20, cost: 150000, description: 'Low-cost guidance unit without star tracker.' }),
  K({ catalogId: 'gnc-star', kind: 'guidance', mount: 'internal', name: 'Fine-pointing GNC (2 star trackers + FOG)', mass: 12, length: 0.25, diameter: 0.3, powerDraw: 55, guidance: true, pointingAccuracyDeg: 0.02, tMin: 243, tMax: 333, maxAccelG: 15, cost: 2600000, description: 'Very accurate pointing for telescopes and narrow-beam antennas.' }),
  K({ catalogId: 'computer-cubesat', kind: 'computer', mount: 'internal', name: 'CubeSat computer', mass: 0.1, length: 0.05, diameter: 0.09, powerDraw: 1.2, guidance: true, pointingAccuracyDeg: 2, tMin: 233, tMax: 343, maxAccelG: 30, cost: 12000, description: 'Tiny on-board computer.' }),
  K({ catalogId: 'computer-radhard', kind: 'computer', mount: 'internal', name: 'Radiation-hardened computer', mass: 2, length: 0.12, diameter: 0.22, powerDraw: 12, guidance: true, pointingAccuracyDeg: 0.2, tMin: 233, tMax: 343, maxAccelG: 40, cost: 900000, description: 'Tougher, slower computer for deep space.' }),
  // thermal
  K({ catalogId: 'thermal-radiator-0.25', kind: 'radiator', mount: 'radial', name: 'Radiator panel (0.25 m²)', area: 0.25, deployable: false, mass: 1.3, cost: 12000, description: 'Small panel that radiates heat to space.' }),
  K({ catalogId: 'thermal-radiator-3', kind: 'radiator', mount: 'radial', name: 'Radiator panel (3 m²)', area: 3, deployable: false, mass: 14, cost: 100000, description: 'Large body-mounted radiator.' }),
  K({ catalogId: 'thermal-radiator-dep6', kind: 'radiator', mount: 'radial', name: 'Deployable radiator (6 m²)', area: 6, deployable: true, mass: 20, cost: 340000, description: 'Folds for launch, unfolds in space.' }),
  K({ catalogId: 'thermal-heater-small', kind: 'heater', mount: 'internal', name: 'Small thermostat heater (10 W)', powerDraw: 10, setpointK: 283, mass: 0.2, cost: 3000, description: 'Keeps a small probe above its minimum temperature.' }),
  K({ catalogId: 'thermal-heater-large', kind: 'heater', mount: 'internal', name: 'Large thermostat heater (150 W)', powerDraw: 150, setpointK: 283, mass: 1.2, cost: 25000, description: 'Keeps a big craft or rover warm.' }),
  K({ catalogId: 'thermal-mli-thin', kind: 'mli', mount: 'internal', name: 'Thin insulation blanket', insulationFactor: 0.12, mass: 1, cost: 8000, description: 'A few foil layers. Cheap, light, moderate.' }),
  K({ catalogId: 'thermal-mli-heavy', kind: 'mli', mount: 'internal', name: 'Heavy multilayer insulation', insulationFactor: 0.03, mass: 9, cost: 90000, description: 'Many foil layers. Excellent for cold missions.' }),
  // payload mass simulators
  K({ catalogId: 'payload-cubesat3u', kind: 'payload', mount: 'internal', name: 'CubeSat 3U (mass simulator)', mass: 4, length: 0.34, diameter: 0.1, maxAccelG: 15, tMin: 233, tMax: 343, cost: 120000, description: 'A 4 kg CubeSat-size payload.' }),
  K({ catalogId: 'payload-10', kind: 'payload', mount: 'internal', name: 'Payload 10 kg (mass simulator)', mass: 10, length: 0.4, diameter: 0.3, maxAccelG: 15, tMin: 233, tMax: 343, cost: 250000, description: 'Generic 10 kg payload.' }),
  K({ catalogId: 'payload-500', kind: 'payload', mount: 'internal', name: 'Payload 500 kg (mass simulator)', mass: 500, length: 1.4, diameter: 1.0, maxAccelG: 15, tMin: 233, tMax: 343, cost: 10000000, description: 'Generic 500 kg satellite.' }),
  K({ catalogId: 'payload-2000', kind: 'payload', mount: 'internal', name: 'Payload 2000 kg (mass simulator)', mass: 2000, length: 2.8, diameter: 1.8, maxAccelG: 12, tMin: 233, tMax: 343, cost: 40000000, description: 'Generic 2 tonne satellite.' }),
  K({ catalogId: 'payload-5000', kind: 'payload', mount: 'internal', name: 'Payload 5000 kg (mass simulator)', mass: 5000, length: 4.5, diameter: 2.6, maxAccelG: 10, tMin: 233, tMax: 343, cost: 100000000, description: 'Generic 5 tonne spacecraft.' }),
];

export const EXTRA_ROVER = [
  K({ catalogId: 'rover-chassis-small', kind: 'rover_chassis', mount: 'body', name: 'Small rover chassis', mass: 12, length: 0.6, width: 0.45, height: 0.3, wheelbase: 0.4, trackWidth: 0.45, groundClearance: 0.12, cost: 90000, description: 'Tiny rover body, a few tens of kg.' }),
  K({ catalogId: 'rover-chassis-large', kind: 'rover_chassis', mount: 'body', name: 'Large rover chassis', mass: 180, length: 2.4, width: 1.6, height: 0.8, wheelbase: 1.8, trackWidth: 1.6, groundClearance: 0.35, cost: 1600000, description: 'Big rover body and suspension (car-size).' }),
  K({ catalogId: 'rover-wheel-small', kind: 'wheel', mount: 'body', name: 'Small wheel', mass: 0.8, count: 4, radius: 0.07, width: 0.06, cost: 6000, description: 'Small wheel for micro-rovers.' }),
  K({ catalogId: 'rover-wheel-large', kind: 'wheel', mount: 'body', name: 'Large wheel', mass: 12, count: 6, radius: 0.3, width: 0.25, cost: 90000, description: 'Big wheel. Rolls over rocks, sinks less.' }),
  K({ catalogId: 'rover-motor-small', kind: 'motor', mount: 'body', name: 'Small wheel motor', mass: 0.5, count: 4, stallTorque: 3, noLoadSpeed: 20, efficiency: 0.7, powerDraw: 0, maxPower: 25, cost: 9000, description: 'Geared DC motor for micro-rovers.' }),
  K({ catalogId: 'rover-motor-large', kind: 'motor', mount: 'body', name: 'Large wheel motor', mass: 6, count: 6, stallTorque: 60, noLoadSpeed: 8, efficiency: 0.82, powerDraw: 0, maxPower: 250, cost: 60000, description: 'Strong geared motor for heavy rovers.' }),
  K({ catalogId: 'rover-hazcam', kind: 'sensor', mount: 'body', name: 'Hazard camera pair', sensorType: 'hazcam', mass: 0.35, powerDraw: 2, tMin: 233, tMax: 333, cost: 40000, description: 'Wide cameras that spot rocks and holes.' }),
  K({ catalogId: 'rover-lidar', kind: 'sensor', mount: 'body', name: 'Rover lidar', sensorType: 'lidar', mass: 3.5, powerDraw: 30, tMin: 233, tMax: 333, cost: 700000, description: 'Laser scanner for mapping terrain and obstacles.' }),
];

// =====================================================================================================================
// NEW CATALOG ITEMS (batch 2). All FICTIONAL, class-typical numbers. Every item has a short `description` and a `plain` hint.
// They use only existing component kinds, so the simulation and the 3D scene treat them like their older siblings.
// =====================================================================================================================
const withPlain = (t, best_for, trade_off, extra = {}) => ({ ...t, ...extra, plain: PL(best_for, trade_off) });
export const NEW_TANKS = [
  withPlain(tankPreset('tank-rp1-80', 'RP-1', 80, 0.3, 'RP-1 80 kg'), 'Tiny rockets and test stages.', 'Holds very little fuel.', { description: 'Small kerosene tank for tiny rockets.' }),
  withPlain(tankPreset('tank-lox-200', 'LOX', 200, 0.3, 'LOX 200 kg'), 'Matches the 80 kg kerosene tank.', 'Oxygen boils off if left waiting.', { description: 'Small liquid oxygen tank for kerosene engines.' }),
  withPlain(tankPreset('tank-ch4-5000', 'CH4', 5000, 1.6, 'Methane 5 t'), 'Big methane-fuelled stages.', 'Less dense than kerosene, so it is longer.', { description: 'Large methane tank for a booster stage.' }),
  withPlain(tankPreset('tank-lox-ch4-17000', 'LOX', 17000, 1.6, 'LOX 17 t (methalox)'), 'Pairs with the 5 t methane tank.', 'Heavy when full.', { description: 'Large oxygen tank for methane engines.' }),
  withPlain(tankPreset('tank-mmh-80', 'MMH', 80, 0.5, 'MMH 80 kg'), 'Small landers and kick stages.', 'Toxic fuel.', { description: 'Small storable fuel tank for space engines.' }),
  withPlain(tankPreset('tank-nto-132', 'NTO', 132, 0.5, 'NTO 132 kg'), 'Pairs with the 80 kg fuel tank.', 'Toxic and corrosive.', { description: 'Small storable oxidizer tank.' }),
  withPlain(tankPreset('tank-n2h4-10', 'N2H4', 10, 0.25, 'Hydrazine 10 kg'), 'Small satellites with thrusters.', 'Little fuel, toxic.', { description: 'Tiny hydrazine tank for satellite thrusters.' }),
  withPlain(tankPreset('tank-xenon-10', 'XENON', 10, 0.25, 'Xenon 10 kg'), 'Small electric-propulsion satellites.', 'Xenon gas is costly.', { description: 'Small xenon tank for ion and Hall thrusters.' }),
];

const NS = (base, o, best_for, trade_off) => ({ ...base, ...o, plain: PL(best_for, trade_off) });
export const NEW_STRUCTURE_PARTS = [
  // nose cones (physics knows three shapes: ogive = low drag, cone = a bit more, blunt = much more but tougher)
  NS(makeNose(0.3, 0.6, 'ogive'), { catalogId: 'nose-ogive-0.3', name: 'Ogive nose cone Ø0.3 m', cost: 3500, description: 'Tiny smooth nose for sounding rockets.' }, 'Very small rockets.', 'Only fits thin rockets.'),
  NS(makeNose(3.0, 6.0, 'ogive'), { catalogId: 'nose-ogive-3.0', name: 'Ogive nose cone Ø3.0 m', cost: 260000, description: 'Large smooth nose for heavy rockets.' }, 'Wide heavy-lift rockets.', 'Heavy and costly.'),
  NS(makeNose(0.5, 0.8, 'cone'), { catalogId: 'nose-cone-0.5', name: 'Conical nose cone Ø0.5 m', cost: 5000, description: 'Simple cheap cone for small rockets.' }, 'Low-cost small rockets.', 'A little more drag than an ogive.'),
  NS(makeNose(2.0, 3.0, 'cone'), { catalogId: 'nose-cone-2.0', name: 'Conical nose cone Ø2.0 m', cost: 70000, description: 'Plain cone nose for medium rockets.' }, 'Easy, cheap builds.', 'More drag than a smooth ogive.'),
  NS(makeNose(0.5, 0.3, 'blunt'), { catalogId: 'nose-blunt-0.5', name: 'Blunt nose cap Ø0.5 m', noseRadius: 0.18, tMax: 900, cost: 8000, description: 'Short round cap. Tough against heat.' }, 'Very fast, hot flights.', 'Adds a lot of drag.'),
  NS(makeNose(2.5, 1.2, 'blunt'), { catalogId: 'nose-blunt-2.5', name: 'Blunt nose cap Ø2.5 m', noseRadius: 0.9, tMax: 950, cost: 60000, description: 'Wide round cap that spreads heating.' }, 'Re-entry style shapes.', 'A lot of drag on the way up.'),
  // fairings
  NS(makeFairing(0.5, 1.6), { catalogId: 'fairing-0.5', name: 'Payload fairing Ø0.5 × 1.6 m', cost: 25000, description: 'Tiny shell for CubeSats.' }, 'CubeSat launchers.', 'Very little room inside.'),
  NS(makeFairing(1.6, 4.6), { catalogId: 'fairing-1.6', name: 'Payload fairing Ø1.6 × 4.6 m', cost: 300000, description: 'Medium shell for small satellites.' }, 'Small-to-medium satellites.', 'Extra mass up high.'),
  NS(makeFairing(4.0, 11.0), { catalogId: 'fairing-4.0', name: 'Payload fairing Ø4.0 × 11 m', cost: 4500000, description: 'Giant shell for very big payloads.' }, 'Space telescopes and stations.', 'Heavy and very costly.'),
  // interstages
  NS(makeStructure('interstage', 0.3, 0.3), { catalogId: 'interstage-0.3', name: 'Interstage Ø0.3 m', cost: 5000, description: 'Little ring joining two small stages.' }, 'Small two-stage rockets.', 'Thin, so not very strong.'),
  NS(makeStructure('interstage', 1.2, 0.6), { catalogId: 'interstage-1.2', name: 'Interstage Ø1.2 m', cost: 38000, description: 'Connects two stages and shelters the upper engine.' }, 'Medium two-stage rockets.', 'Adds dead weight.'),
  NS(makeStructure('interstage', 3.2, 1.3), { catalogId: 'interstage-3.2', name: 'Interstage Ø3.2 m', cost: 210000, description: 'Wide interstage for heavy rockets.' }, 'Big two-stage rockets.', 'Heavy, costly part.'),
  // decouplers
  NS(makeDecoupler(0.3), { catalogId: 'decoupler-0.3', name: 'Decoupler Ø0.3 m', cost: 12000, description: 'Small separation ring for tiny stages.' }, 'Little rockets with two stages.', 'Only holds small loads.'),
  NS(makeDecoupler(3.2), { catalogId: 'decoupler-3.2', name: 'Decoupler Ø3.2 m', cost: 240000, description: 'Big separation ring for heavy stages.' }, 'Heavy-lift rockets.', 'Heavy and costly.'),
  // adapters / truss
  NS(makeStructure('structural_section', 0.3, 0.2), { catalogId: 'adapter-0.3', name: 'Payload adapter Ø0.3 m', structure: 'adapter', mass: 3, strength: 2.0e6 * 0.09, cost: 8000, description: 'Small clamp that holds a payload.' }, 'CubeSat-class payloads.', 'Holds only light loads.'),
  NS(makeStructure('structural_section', 3.2, 0.9), { catalogId: 'adapter-3.2', name: 'Payload adapter Ø3.2 m', structure: 'adapter', mass: 140, strength: 2.0e6 * 10.24, cost: 330000, description: 'Wide clamp for heavy payloads.' }, 'Large satellites.', 'Heavy ring.'),
  NS(makeStructure('structural_section', 3.0, 4.0), { catalogId: 'truss-3.0', name: 'Open truss Ø3.0 × 4.0 m', structure: 'truss', mass: 130, strength: 0.7e6 * 9, maxQAlpha: 800 * 9, maxQ: 20000, cost: 450000, description: 'Wide light lattice for big spacecraft in space.' }, 'Big tugs and stations above the air.', 'Not safe in thick air.'),
];

export const NEW_OTHER = [
  // --- fins ---
  K({ catalogId: 'fin-tab', kind: 'fin', mount: 'radial', name: 'Tiny fin tabs (4)', cnAlpha: 0.8, count: 1, mass: 1.5, cost: 1500, description: 'Little fins for model-size rockets.', plain: PL('Very light, short rockets.', 'Barely steadies tall rockets.') }),
  K({ catalogId: 'fin-swept-small', kind: 'fin', mount: 'radial', name: 'Swept fin set, small (4 fins)', cnAlpha: 3, count: 1, mass: 6, cost: 9000, description: 'Swept-back fins. Low drag at high speed.', plain: PL('Fast rockets that go supersonic.', 'Smaller lift than straight fins.') }),
  K({ catalogId: 'fin-swept-large', kind: 'fin', mount: 'radial', name: 'Swept fin set, large (4 fins)', cnAlpha: 9, count: 1, mass: 60, cost: 75000, description: 'Big swept fins keep a tall rocket steady.', plain: PL('Tall rockets and rocket planes.', 'Heavy and hot at high speed.') }),
  K({ catalogId: 'gridfin-small', kind: 'fin', mount: 'radial', name: 'Small grid fin set (4 fins)', gridFin: true, cnAlpha: 1.2, count: 1, mass: 14, tMax: 1200, cost: 60000, description: 'Small grid fins for steering on descent.', plain: PL('Small boosters that fly back.', 'Only stabilises here, it does not steer.') }),
  K({ catalogId: 'gridfin-large', kind: 'fin', mount: 'radial', name: 'Large grid fin set (4 fins)', gridFin: true, cnAlpha: 4, count: 1, mass: 90, tMax: 1300, cost: 380000, description: 'Big lattice fins for returning boosters.', plain: PL('Heavy boosters coming back.', 'Heavy and expensive.') }),
  // --- heat shields ---
  K({ catalogId: 'shield-ablative-0.4', kind: 'heat_shield', mount: 'stack', name: 'Micro ablative heat shield Ø0.4 m', shieldType: 'ablative', mass: 3, length: 0.06, diameter: 0.4, tMax: 2700, tMin: 100, cost: 25000, description: 'Tiny shield for dart-size probes.', plain: PL('Small entry probes.', 'Cannot take long, hot entries.') }),
  K({ catalogId: 'shield-ablative-1.2', kind: 'heat_shield', mount: 'stack', name: 'High-performance ablative shield Ø1.2 m', shieldType: 'ablative', mass: 40, length: 0.14, diameter: 1.2, tMax: 3200, tMin: 100, cost: 520000, description: 'Top-grade burn-away shield. Survives very fast entry.', plain: PL('Sample-return capsules at high speed.', 'Costs a lot for its size.') }),
  K({ catalogId: 'shield-ablative-4', kind: 'heat_shield', mount: 'stack', name: 'Ablative heat shield Ø4.0 m', shieldType: 'ablative', mass: 560, length: 0.35, diameter: 4.0, tMax: 3000, tMin: 100, cost: 3000000, description: 'Huge shield for big crew or cargo vehicles.', plain: PL('Heavy landers for Mars.', 'Very heavy.') }),
  K({ catalogId: 'shield-tiles-3', kind: 'heat_shield', mount: 'stack', name: 'Ceramic tile shield Ø3.0 m', shieldType: 'tiles', mass: 190, length: 0.2, diameter: 3.0, tMax: 1900, tMin: 100, cost: 1700000, description: 'Reusable tiles for a large vehicle.', plain: PL('Gentle, reusable Earth returns.', 'Tiles cannot take very fast entry.') }),
  // --- landing ---
  K({ catalogId: 'legs-tiny', kind: 'landing_legs', mount: 'radial', name: 'Tiny landing legs (4)', deployable: true, count: 1, mass: 3, legLength: 0.25, footprintRadius: 0.5, maxImpactVelocity: 1.8, maxHorizontal: 0.6, cost: 30000, description: 'Feather-light legs for small hoppers.', plain: PL('Small hoppers and probes.', 'Only gentle touchdowns.') }),
  K({ catalogId: 'legs-xl', kind: 'landing_legs', mount: 'radial', name: 'Extra-large landing legs (6)', deployable: true, count: 1, mass: 420, legLength: 2.4, footprintRadius: 5.0, maxImpactVelocity: 5.0, maxHorizontal: 2.5, cost: 2500000, description: 'Very wide legs for tall, heavy landers.', plain: PL('Big, tall landers.', 'Heavy and costly.') }),
  K({ catalogId: 'legs-airbag', kind: 'landing_legs', mount: 'radial', name: 'Airbag landing system', deployable: true, count: 1, mass: 22, legLength: 0.3, footprintRadius: 0.9, maxImpactVelocity: 22, maxHorizontal: 12, cost: 350000, description: 'Big bouncy bags for hard, rough landings.', plain: PL('Light probes that can hit hard.', 'Bouncy and cannot carry big instruments.') }),
  // --- parachutes ---
  K({ catalogId: 'chute-tiny', kind: 'parachute', mount: 'radial', name: 'Recovery parachute (CdA 4 m²)', dragArea: 4, deployTime: 1, maxDeployQ: 4000, maxDeploySpeed: 120, maxLoad: 4000, mass: 0.4, cost: 1200, description: 'Little chute for bringing small rockets down.', plain: PL('Small rockets that come down slowly.', 'Breaks if opened too fast.') }),
  K({ catalogId: 'chute-drogue-large', kind: 'parachute', mount: 'radial', name: 'Large drogue parachute (CdA 8 m²)', dragArea: 8, deployTime: 2, maxDeployQ: 45000, maxDeploySpeed: 750, maxLoad: 150000, mass: 6, cost: 30000, description: 'Strong first chute that opens at high speed.', plain: PL('Slowing a fast capsule before the main chute.', 'Does not slow you enough alone.') }),
  K({ catalogId: 'chute-supersonic', kind: 'parachute', mount: 'radial', name: 'Supersonic parachute (CdA 120 m²)', dragArea: 120, deployTime: 3, maxDeployQ: 14000, maxDeploySpeed: 650, maxLoad: 250000, mass: 28, cost: 900000, description: 'Tough chute that opens even faster than sound.', plain: PL('Mars landers that open chutes at Mach 2.', 'Costly and heavier than plain chutes.') }),
  K({ catalogId: 'chute-cluster', kind: 'parachute', mount: 'radial', name: 'Parachute cluster (CdA 500 m²)', dragArea: 500, deployTime: 10, maxDeployQ: 4500, maxDeploySpeed: 200, maxLoad: 600000, mass: 110, cost: 1000000, description: 'Several big chutes together for heavy capsules.', plain: PL('Heavy capsules landing on Earth.', 'Slow to open and very heavy.') }),
  // --- reaction wheels ---
  K({ catalogId: 'rw-mini', kind: 'reaction_wheel', mount: 'internal', name: 'Mini reaction wheel', mass: 0.6, length: 0.06, diameter: 0.09, torque: 0.008, momentumCap: 0.2, powerDraw: 4, tMin: 253, tMax: 333, cost: 30000, description: 'Small wheel for microsatellites.', plain: PL('Small satellites that point at things.', 'Weak, so turns slowly.') }),
  K({ catalogId: 'rw-medium', kind: 'reaction_wheel', mount: 'internal', name: 'Medium reaction wheel', mass: 12, length: 0.14, diameter: 0.3, torque: 0.5, momentumCap: 40, powerDraw: 70, tMin: 253, tMax: 333, cost: 220000, description: 'Mid-size wheel for satellites.', plain: PL('Medium spacecraft.', 'Fills up and then needs thrusters.') }),
  K({ catalogId: 'rw-xl', kind: 'reaction_wheel', mount: 'internal', name: 'Extra-large reaction wheel', mass: 45, length: 0.25, diameter: 0.6, torque: 5, momentumCap: 400, powerDraw: 300, tMin: 253, tMax: 333, cost: 900000, description: 'Very strong wheel for large spacecraft.', plain: PL('Big, heavy spacecraft.', 'Uses lots of power.') }),
  // --- batteries ---
  K({ catalogId: 'battery-10', kind: 'battery', mount: 'internal', name: 'Battery 10 Wh', mass: 0.08, length: 0.04, diameter: 0.06, capacityWh: 10, maxPower: 30, tMin: 273, tMax: 313, cost: 800, description: 'Tiny pack for CubeSats and small rockets.', plain: PL('Very small flights.', 'Holds very little energy.') }),
  K({ catalogId: 'battery-200', kind: 'battery', mount: 'internal', name: 'Battery 200 Wh', mass: 1.5, length: 0.14, diameter: 0.18, capacityWh: 200, maxPower: 600, tMin: 273, tMax: 313, cost: 12000, description: 'Small pack for microsatellites and rocket avionics.', plain: PL('Launch vehicle electronics.', 'Not enough for long nights.') }),
  K({ catalogId: 'battery-solid-500', kind: 'battery', mount: 'internal', name: 'Solid-state battery 500 Wh', mass: 2.3, length: 0.2, diameter: 0.26, capacityWh: 500, maxPower: 1500, tMin: 253, tMax: 333, cost: 120000, description: 'Lighter pack for wider temperatures.', plain: PL('Saving weight and surviving cold.', 'Much more expensive per Wh.') }),
  K({ catalogId: 'battery-20000', kind: 'battery', mount: 'internal', name: 'Battery 20 kWh', mass: 135, length: 0.6, diameter: 0.8, capacityWh: 20000, maxPower: 50000, tMin: 273, tMax: 313, cost: 850000, description: 'Huge pack for rovers, landers and stations.', plain: PL('Long nights and big loads.', 'Heavy to launch.') }),
  // --- solar panels ---
  K({ catalogId: 'solar-fixed-0.5', kind: 'solar_panel', mount: 'radial', name: 'Fixed solar panel (0.5 m²)', area: 0.5, efficiency: 0.28, tracking: false, deployable: false, mass: 1.3, degradation: 0, cost: 25000, description: 'Small flat panel. No unfolding, no sun tracking.', plain: PL('Simple small satellites.', 'Works only when it faces the Sun.') }),
  K({ catalogId: 'solar-flex-2', kind: 'solar_panel', mount: 'radial', name: 'Flexible roll-out solar array (2 m²)', area: 2, efficiency: 0.3, tracking: true, deployable: true, flexible: true, mass: 3.2, degradation: 0, cost: 150000, description: 'Thin array that unrolls in space. Very light.', plain: PL('Light power for small probes.', 'Needs a DEPLOY event, costs more.') }),
  K({ catalogId: 'solar-flex-6', kind: 'solar_panel', mount: 'radial', name: 'Flexible roll-out solar array (6 m²)', area: 6, efficiency: 0.3, tracking: true, deployable: true, flexible: true, mass: 9.6, degradation: 0, cost: 420000, description: 'Medium roll-out array. About 2 kilowatts near Earth.', plain: PL('Power without much weight.', 'Needs a DEPLOY event, costs more.') }),
  K({ catalogId: 'solar-flex-20', kind: 'solar_panel', mount: 'radial', name: 'Flexible roll-out solar array (20 m²)', area: 20, efficiency: 0.3, tracking: true, deployable: true, flexible: true, mass: 32, degradation: 0, cost: 1300000, description: 'Large roll-out wing for electric-propulsion craft.', plain: PL('Electric-propulsion spacecraft.', 'Big and delicate.') }),
  K({ catalogId: 'solar-rigid-6', kind: 'solar_panel', mount: 'radial', name: 'Rigid solar array (6 m²)', area: 6, efficiency: 0.28, tracking: true, deployable: true, flexible: false, mass: 15.6, degradation: 0, cost: 720000, description: 'Sturdy folding panels that hold their shape.', plain: PL('Tough, proven power.', 'Heavier than roll-out arrays.') }),
  // --- antennas ---
  K({ catalogId: 'ant-lga-s', kind: 'antenna', mount: 'radial', name: 'Low-gain cone antenna (S-band)', antennaType: 'horn', gainDbi: 3, txPowerW: 5, frequencyGHz: 2.2, dataRateBps: 4000, powerDraw: 14, standbyPower: 1, steerable: false, beamwidthDeg: 120, deployable: false, mass: 0.25, cost: 15000, description: 'Wide-beam antenna for near-Earth talking.', plain: PL('Backup link near Earth.', 'Very slow data.') }),
  K({ catalogId: 'ant-helix-uhf', kind: 'antenna', mount: 'radial', name: 'UHF relay antenna (helix)', antennaType: 'helix', gainDbi: 6, txPowerW: 5, frequencyGHz: 0.4, dataRateBps: 128000, powerDraw: 25, standbyPower: 1.5, steerable: false, beamwidthDeg: 70, deployable: false, mass: 0.6, cost: 120000, description: 'Talks to an orbiter that relays to Earth.', plain: PL('Rovers and landers using a relay orbiter.', 'Only works when the orbiter is overhead.') }),
  K({ catalogId: 'ant-dish05', kind: 'antenna', mount: 'radial', name: 'Dish 0.5 m (X-band)', antennaType: 'dish', gainDbi: 30.5, txPowerW: 15, frequencyGHz: 8.4, dataRateBps: 400000, powerDraw: 50, standbyPower: 2.5, steerable: false, beamwidthDeg: 5, deployable: true, mass: 3.0, cost: 350000, description: 'Medium dish between the small and standard ones.', plain: PL('Mid-size probes.', 'Must point within 2 degrees.') }),
  K({ catalogId: 'ant-phased-x', kind: 'antenna', mount: 'radial', name: 'Phased-array antenna (X-band)', antennaType: 'phased', gainDbi: 20, txPowerW: 15, frequencyGHz: 8.4, dataRateBps: 300000, powerDraw: 60, standbyPower: 3, steerable: true, beamwidthDeg: 12, deployable: false, mass: 2.4, cost: 1400000, description: 'Flat antenna that steers with no moving parts.', plain: PL('Keeping the link while the craft turns.', 'Less gain than a dish.') }),
  K({ catalogId: 'ant-ka-gimbal06', kind: 'antenna', mount: 'radial', name: 'Gimballed dish 0.6 m (Ka-band)', antennaType: 'dish', gainDbi: 43.8, txPowerW: 20, frequencyGHz: 32, dataRateBps: 8000000, powerDraw: 110, standbyPower: 4, steerable: true, beamwidthDeg: 1.1, deployable: true, mass: 8, cost: 2400000, description: 'Small fast dish that follows Earth.', plain: PL('Lots of data from a small probe.', 'Costly. Motors can fail.') }),
  // --- science instruments ---
  K({ catalogId: 'ins-drill', kind: 'instrument', mount: 'internal', name: 'Sampling drill', measurement: 'drilling', mass: 12, length: 0.8, diameter: 0.12, powerDraw: 60, standbyPower: 1, dataRateBps: 500, tMin: 233, tMax: 323, cost: 6000000, description: 'Drills into rock and brings up samples.', plain: PL('Finding out what is under the surface.', 'Heavy and hungry for power.') }),
  K({ catalogId: 'ins-rover-arm', kind: 'instrument', mount: 'internal', name: 'Rover sampling arm', measurement: 'sampling', mass: 8, length: 0.6, diameter: 0.15, powerDraw: 25, standbyPower: 0.5, dataRateBps: 1000, tMin: 233, tMax: 333, cost: 3200000, description: 'Robot arm that scoops soil and holds tools.', plain: PL('Scooping soil and placing tools.', 'Slow and adds weight up front.') }),
  K({ catalogId: 'ins-hyperspec', kind: 'instrument', mount: 'internal', name: 'Hyperspectral imager', measurement: 'spectroscopy', mass: 6, length: 0.35, diameter: 0.2, powerDraw: 25, standbyPower: 1, dataRateBps: 3000000, tMin: 243, tMax: 323, cost: 3800000, description: 'Camera that records hundreds of colours per pixel.', plain: PL('Mapping minerals from orbit.', 'Produces huge amounts of data.') }),
  K({ catalogId: 'ins-gamma', kind: 'instrument', mount: 'internal', name: 'Gamma-ray and neutron spectrometer', measurement: 'nuclear_spectroscopy', mass: 10, length: 0.3, diameter: 0.2, powerDraw: 30, standbyPower: 1, dataRateBps: 5000, tMin: 233, tMax: 323, cost: 4000000, description: 'Finds water ice and elements near the surface.', plain: PL('Looking for ice from orbit.', 'Needs a long time to collect data.') }),
  K({ catalogId: 'ins-sar', kind: 'instrument', mount: 'internal', name: 'Synthetic aperture radar', measurement: 'radar', mass: 60, length: 0.9, diameter: 0.5, powerDraw: 400, standbyPower: 5, dataRateBps: 10000000, tMin: 243, tMax: 323, cost: 25000000, description: 'Radar that maps ground through clouds and darkness.', plain: PL('Mapping cloudy planets.', 'Heavy and needs lots of power.') }),
  K({ catalogId: 'ins-cam-stereo', kind: 'instrument', mount: 'internal', name: 'Stereo panorama camera', measurement: 'imaging', mass: 1.5, length: 0.12, diameter: 0.1, powerDraw: 8, standbyPower: 0.3, dataRateBps: 3000000, tMin: 243, tMax: 323, cost: 1200000, description: 'Two cameras for 3D landscape pictures.', plain: PL('Pictures of a landing site.', 'Big images need a good radio link.') }),
  K({ catalogId: 'ins-plasma', kind: 'instrument', mount: 'internal', name: 'Plasma and particle analyzer', measurement: 'plasma', mass: 3, length: 0.18, diameter: 0.14, powerDraw: 10, standbyPower: 0.5, dataRateBps: 8000, tMin: 233, tMax: 333, cost: 1600000, description: 'Measures the solar wind and charged particles.', plain: PL('Studying space weather.', 'Needs a clear view in all directions.') }),
  K({ catalogId: 'ins-xrf', kind: 'instrument', mount: 'internal', name: 'X-ray fluorescence analyzer', measurement: 'x_ray_spectroscopy', mass: 2.2, length: 0.15, diameter: 0.1, powerDraw: 15, standbyPower: 0.5, dataRateBps: 4000, tMin: 243, tMax: 323, cost: 2100000, description: 'Zaps rock with X-rays to read its elements.', plain: PL('Checking what a rock is made of.', 'Must touch or be close to the rock.') }),
  // --- engineering sensors ---
  K({ catalogId: 'sens-startracker-mini', kind: 'sensor', mount: 'internal', name: 'Mini star tracker', sensorType: 'star_tracker', mass: 0.3, length: 0.08, diameter: 0.06, powerDraw: 1.5, tMin: 243, tMax: 333, cost: 90000, description: 'Tiny star camera for small satellites.', plain: PL('Pointing small satellites well.', 'Less accurate than big trackers.') }),
  K({ catalogId: 'sens-doppler', kind: 'sensor', mount: 'internal', name: 'Doppler velocity radar', sensorType: 'doppler_radar', mass: 10, length: 0.3, diameter: 0.25, powerDraw: 55, tMin: 233, tMax: 343, cost: 2000000, description: 'Measures speed over the ground during landing.', plain: PL('Precise, safe powered landings.', 'Heavy and draws power.') }),
  K({ catalogId: 'sens-terrain-cam', kind: 'sensor', mount: 'internal', name: 'Terrain-navigation camera', sensorType: 'terrain_nav', mass: 1.2, length: 0.1, diameter: 0.08, powerDraw: 7, tMin: 243, tMax: 333, cost: 500000, description: 'Matches ground to a map to find position.', plain: PL('Landing close to a chosen spot.', 'Needs daylight and a good map.') }),
  K({ catalogId: 'sens-gps-rocket', kind: 'sensor', mount: 'internal', name: 'High-speed GNSS receiver', sensorType: 'gps', mass: 0.3, length: 0.1, diameter: 0.06, powerDraw: 2.5, tMin: 233, tMax: 343, cost: 60000, description: 'Satellite navigation that still works at rocket speeds.', plain: PL('Tracking a rocket during launch.', 'Works only near Earth.') }),
  K({ catalogId: 'sens-lidar-small', kind: 'sensor', mount: 'internal', name: 'Compact lidar altimeter', sensorType: 'lidar', mass: 1.5, length: 0.12, diameter: 0.09, powerDraw: 10, tMin: 243, tMax: 333, cost: 350000, description: 'Small laser that measures height above ground.', plain: PL('Small landers and hoppers.', 'Short range only.') }),
  // --- avionics & computers ---
  K({ catalogId: 'gnc-mid', kind: 'guidance', mount: 'internal', name: 'Mid-range GNC (star tracker + MEMS)', mass: 3, length: 0.15, diameter: 0.2, powerDraw: 18, guidance: true, pointingAccuracyDeg: 0.1, tMin: 243, tMax: 333, maxAccelG: 20, cost: 700000, description: 'Good pointing for medium spacecraft at fair cost.', plain: PL('Most small and medium spacecraft.', 'Not precise enough for telescopes.') }),
  K({ catalogId: 'computer-dual', kind: 'computer', mount: 'internal', name: 'Dual-redundant computer', mass: 4.5, length: 0.15, diameter: 0.25, powerDraw: 26, guidance: true, pointingAccuracyDeg: 0.15, tMin: 233, tMax: 343, maxAccelG: 35, cost: 1300000, description: 'Two computers in one box. One backs up.', plain: PL('Missions that must not fail.', 'Double the mass and power.') }),
  // --- thermal ---
  K({ catalogId: 'thermal-heater-mini', kind: 'heater', mount: 'internal', name: 'Mini heater (2 W)', powerDraw: 2, setpointK: 283, mass: 0.05, cost: 800, description: 'Tiny heater to keep one small box warm.', plain: PL('CubeSats and instruments.', 'Too weak for a big vehicle.') }),
  K({ catalogId: 'thermal-heater-xl', kind: 'heater', mount: 'internal', name: 'Extra-large heater (500 W)', powerDraw: 500, setpointK: 283, mass: 3, cost: 90000, description: 'Powerful heater for big cold vehicles.', plain: PL('Big landers during cold nights.', 'Drains the battery fast.') }),
  K({ catalogId: 'thermal-radiator-dep10', kind: 'radiator', mount: 'radial', name: 'Deployable radiator (10 m²)', area: 10, deployable: true, mass: 32, cost: 560000, description: 'Large panel that unfolds to shed heat.', plain: PL('Hot power-hungry spacecraft.', 'Needs a DEPLOY event.') }),
  K({ catalogId: 'thermal-mli-cryo', kind: 'mli', mount: 'internal', name: 'Cryogenic insulation (40 layers)', insulationFactor: 0.015, mass: 14, cost: 180000, description: 'Thick foil stack for very cold fuels.', plain: PL('Long missions with cold tanks.', 'Adds noticeable weight.') }),
  K({ catalogId: 'thermal-aerogel', kind: 'mli', mount: 'internal', name: 'Aerogel insulation blanket', insulationFactor: 0.04, mass: 4, cost: 60000, description: 'Super-light foam that blocks heat loss.', plain: PL('Rovers and landers on cold planets.', 'Fragile and costly.') }),
  // --- RCS ---
  K({ catalogId: 'rcs-mono-xs', kind: 'rcs', mount: 'radial', name: 'RCS mini monoprop module', mass: 1.5, torque: 20, thrust: 30, isp: 215, propellantMass: 3.5, cost: 60000, description: 'Very small thruster module for light probes.', plain: PL('Small probes that need a nudge.', 'Only a little fuel.') }),
  K({ catalogId: 'rcs-biprop', kind: 'rcs', mount: 'radial', name: 'RCS bipropellant module', mass: 18, torque: 250, thrust: 400, isp: 285, propellantMass: 35, cost: 420000, description: 'Stronger thrusters that use fuel better.', plain: PL('Upper stages and landers.', 'Costs more and is toxic.') }),
  // --- payload mass simulators ---
  K({ catalogId: 'payload-1u', kind: 'payload', mount: 'internal', name: 'CubeSat 1U (mass simulator)', mass: 1.3, length: 0.11, diameter: 0.1, maxAccelG: 15, tMin: 233, tMax: 343, cost: 40000, description: 'A tiny 10 cm satellite.', plain: PL('Cheapest first mission.', 'Very little room for gear.') }),
  K({ catalogId: 'payload-6u', kind: 'payload', mount: 'internal', name: 'CubeSat 6U (mass simulator)', mass: 9, length: 0.34, diameter: 0.14, maxAccelG: 15, tMin: 233, tMax: 343, cost: 300000, description: 'A shoebox-size satellite.', plain: PL('Small science missions.', 'Still very small.') }),
  K({ catalogId: 'payload-50', kind: 'payload', mount: 'internal', name: 'Payload 50 kg (mass simulator)', mass: 50, length: 0.7, diameter: 0.5, maxAccelG: 15, tMin: 233, tMax: 343, cost: 1500000, description: 'Generic 50 kg microsatellite.', plain: PL('Testing small launchers.', 'Needs a proper fairing.') }),
  K({ catalogId: 'payload-200', kind: 'payload', mount: 'internal', name: 'Payload 200 kg (mass simulator)', mass: 200, length: 1.1, diameter: 0.8, maxAccelG: 15, tMin: 233, tMax: 343, cost: 4500000, description: 'Generic 200 kg satellite.', plain: PL('Medium launchers.', 'Needs a proper fairing.') }),
  K({ catalogId: 'payload-10000', kind: 'payload', mount: 'internal', name: 'Payload 10 t (mass simulator)', mass: 10000, length: 6, diameter: 3.0, maxAccelG: 8, tMin: 233, tMax: 343, cost: 220000000, description: 'Generic 10 tonne heavy spacecraft.', plain: PL('Testing heavy-lift rockets.', 'Needs a huge fairing.') }),
];

export const NEW_ROVER = [
  K({ catalogId: 'rover-chassis-mid', kind: 'rover_chassis', mount: 'body', name: 'Medium rover chassis', mass: 75, length: 1.8, width: 1.2, height: 0.6, wheelbase: 1.3, trackWidth: 1.15, groundClearance: 0.28, cost: 650000, description: 'Mid-size rover body and suspension.', plain: PL('Good all-round science rover.', 'Needs bigger motors than micro-rovers.') }),
  K({ catalogId: 'rover-chassis-xl', kind: 'rover_chassis', mount: 'body', name: 'Extra-large rover chassis', mass: 500, length: 3.6, width: 2.4, height: 1.2, wheelbase: 2.8, trackWidth: 2.4, groundClearance: 0.5, cost: 5000000, description: 'Truck-size rover body for crew or cargo.', plain: PL('Carrying heavy loads far.', 'Needs big motors and lots of power.') }),
  K({ catalogId: 'rover-wheel-micro', kind: 'wheel', mount: 'body', name: 'Micro wheel', mass: 0.25, count: 4, radius: 0.04, width: 0.04, cost: 1500, description: 'Toy-size wheel for tiny rovers.', plain: PL('Very light hoppers and minis.', 'Gets stuck on small rocks.') }),
  K({ catalogId: 'rover-wheel-mid', kind: 'wheel', mount: 'body', name: 'Medium wheel', mass: 6, count: 4, radius: 0.2, width: 0.16, cost: 40000, description: 'All-round wheel for mid-size rovers.', plain: PL('Balanced grip and weight.', 'Not as good in deep sand.') }),
  K({ catalogId: 'rover-wheel-xl', kind: 'wheel', mount: 'body', name: 'Extra-large wheel', mass: 30, count: 6, radius: 0.45, width: 0.35, cost: 240000, description: 'Huge wheel that rolls over big rocks.', plain: PL('Rough ground and soft sand.', 'Heavy and needs big motors.') }),
  K({ catalogId: 'rover-motor-micro', kind: 'motor', mount: 'body', name: 'Micro wheel motor', mass: 0.2, count: 4, stallTorque: 1, noLoadSpeed: 25, efficiency: 0.65, powerDraw: 0, maxPower: 10, cost: 3000, description: 'Tiny motor for toy-size rovers.', plain: PL('Tiny, light rovers.', 'Weak on slopes.') }),
  K({ catalogId: 'rover-motor-mid', kind: 'motor', mount: 'body', name: 'Medium wheel motor', mass: 2.6, count: 4, stallTorque: 25, noLoadSpeed: 10, efficiency: 0.8, powerDraw: 0, maxPower: 100, cost: 25000, description: 'Strong motor for a mid-size rover.', plain: PL('Everyday climbing and driving.', 'Uses more power than small motors.') }),
  K({ catalogId: 'rover-motor-xl', kind: 'motor', mount: 'body', name: 'Extra-large wheel motor', mass: 14, count: 6, stallTorque: 150, noLoadSpeed: 6, efficiency: 0.85, powerDraw: 0, maxPower: 500, cost: 160000, description: 'Very strong motor for heavy rovers.', plain: PL('Steep slopes with heavy loads.', 'Heavy and hungry for power.') }),
];

// ---------- illustrative cost of the original catalog entries (fictional US$ each; see src/vehicles/cost.js) ----------
const LEGACY_COST = {
  'eng-al25s': 450000, 'eng-al25v': 700000, 'eng-al100': 1400000, 'eng-al100v': 2200000, 'eng-al500': 4500000, 'eng-al500v': 7000000, 'eng-al2000': 14000000,
  'eng-al110h': 6500000, 'eng-al200m': 2800000, 'eng-hyp5': 400000, 'eng-hyp05': 70000, 'eng-desc4': 650000, 'eng-desc15': 1600000, 'eng-desc60': 3800000,
  'srm-s50': 300000, 'eng-ion1': 1200000, 'avionics-flight': 600000, 'guidance-gnc': 900000, 'computer-cdh': 250000, 'reaction-wheel': 180000, 'rcs-mono': 120000,
  'rcs-large': 350000, 'battery-100': 8000, 'battery-500': 30000, 'battery-2000': 100000, 'solar-1': 60000, 'solar-4': 220000, 'ant-omni': 40000, 'ant-patch': 70000,
  'ant-hga': 450000, 'ins-camera': 350000, 'ins-spectrometer': 1200000, 'ins-magnetometer': 250000, 'ins-radar': 2500000, 'thermal-radiator': 40000,
  'thermal-heater': 6000, 'thermal-mli': 25000, 'heat-shield': 150000, 'payload-dummy': 50000, 'legs-4': 350000, 'chute-small': 60000, 'fin-set': 15000,
  'rover-chassis': 400000, 'rover-wheel': 40000, 'rover-motor': 30000, 'rover-sensor': 120000,
};
for (const c of [...ENGINES, ...OTHER, ...ROVER_PARTS]) c.cost ??= LEGACY_COST[c.catalogId];

export const CATALOG = [...ENGINES, ...EXTRA_ENGINES, ...TANK_PRESETS, ...OTHER, ...STRUCTURE_PARTS, ...EXTRA_OTHER, ...ROVER_PARTS, ...EXTRA_ROVER,
  ...NEW_ENGINES, ...NEW_TANKS, ...NEW_STRUCTURE_PARTS, ...NEW_OTHER, ...NEW_ROVER, ...APOLLO_ENGINES, ...APOLLO_PARTS];
// ---- plain-language "best for / trade-off" lines for parts that do not carry their own (derived from the part's real numbers) ----
function autoPlain(c) {
  const T = (best_for, trade_off) => ({ best_for, trade_off });
  switch (c.kind) {
    case 'engine': {
      const f = c.thrustVac ?? 0;
      if (c.propellants?.[0] === 'XENON') return T('Long trips in space, using very little fuel.', 'Too gentle to lift off or land.');
      if (c.propellants?.[0] === 'GN2') return T('Tiny, safe nudges for small spacecraft.', 'Weak push and low efficiency.');
      if (c.propellants?.[0] === 'N2H4') return T('Small steering and nudging burns.', 'Low push. Hydrazine is toxic.');
      if (c.solid) return T(f >= 400000 ? 'Strap-on boosters for extra liftoff push.' : 'Simple small stages and boosters.', 'Cannot be switched off or restarted.');
      if (f < 2000) return T('Tiny precise burns in space.', 'Far too weak to lift a rocket.');
      if (c.propellants?.[0] === 'NTO') return T('Burns in space and soft landings. Easy restarts.', f < 30000 ? 'Low efficiency and a toxic fuel.' : 'Lower efficiency than cryogenic engines.');
      if ((c.ispVac ?? 0) >= 420) return T(c.vacuumOptimised ? 'Upper stages. The most efficient fuel mix.' : 'Big stages that need top efficiency.', 'Hydrogen needs huge, very cold tanks.');
      if (c.propellants?.includes('CH4')) return T('Reusable-style stages and landers. Clean burning.', 'Needs cold tanks for methane and oxygen.');
      if (c.vacuumOptimised) return T('Upper stages that burn in space.', 'The big nozzle works poorly in thick air.');
      return T(f >= 1000000 ? 'Heavy first stages.' : f >= 200000 ? 'Medium first stages.' : f >= 40000 ? 'Small first stages.' : 'Light rockets and small stages.', 'Heavier engines use more fuel and cost more.');
    }
    case 'fuel_tank': case 'oxidizer_tank': case 'propellant_tank': {
      const m = c.propellantMass ?? 0, what = c.kind === 'oxidizer_tank' ? 'oxidizer' : c.kind === 'fuel_tank' ? 'fuel' : 'propellant';
      return T(m < 1000 ? `Small stages and light rockets (${what}).` : m < 20000 ? `Medium stages (${what}).` : `Big stages (${what}).`, 'More propellant means more weight to lift.');
    }
    case 'avionics': case 'guidance': case 'computer': return T(c.mass < 2 ? 'Small and light craft.' : c.kind === 'computer' ? 'Spacecraft that run many systems.' : 'Steering the rocket on its path.', 'Uses power and cannot be repaired in flight.');
    case 'reaction_wheel': return T('Turning a spacecraft without using fuel.', 'Wheels fill up and need thrusters.');
    case 'rcs': return T('Small turns and nudges in space.', 'Uses up its own fuel.');
    case 'battery': return T('Power in the dark and during busy moments.', 'Adds weight and works badly when cold.');
    case 'solar_panel': return T(c.area >= 8 ? 'Spacecraft that need lots of power.' : 'Making power from sunlight.', 'Useless in shadow and far from the Sun.');
    case 'antenna': return (c.gainDbi ?? 0) >= 20 ? T('Sending lots of data over long distances.', 'Must be pointed at Earth.') : T('Simple radio contact from any direction.', 'Slow data rate.');
    case 'instrument': return T('Collecting science data.', 'Uses power and makes data to send.');
    case 'sensor': return T('Tells the craft where it is and points.', 'Adds mass and uses power.');
    case 'radiator': return T('Getting rid of extra heat.', 'Adds weight and loses wanted heat.');
    case 'heater': return T('Keeping parts warm in the cold of space.', 'Uses precious power.');
    case 'mli': return T('Keeping heat in or out, with no power.', 'Delicate. Adds some weight.');
    case 'heat_shield': return T('Surviving the heat of coming back through air.', 'Dead weight until needed. Used once.');
    case 'payload': return T('Standing in for your real cargo.', 'It does no science by itself.');
    case 'landing_legs': return T('Soft landings on the Moon or planets.', 'Heavy. Only handles gentle landings.');
    case 'parachute': return T('Slowing down in air for a soft landing.', 'Needs air. Useless on the Moon.');
    case 'fin': return T('Keeping a rocket flying straight in air.', 'Adds drag. No use in space.');
    case 'nose_cone': return T('Cutting through air with less drag.', 'Carries no payload inside.');
    case 'fairing': return T('Protecting a payload during the climb.', 'Dead weight once you are above the air.');
    case 'interstage': return T('Joining two stages and sheltering the upper engine.', 'Adds weight that never reaches orbit.');
    case 'decoupler': return T('Letting an empty stage drop off.', 'Adds little weight. Needs correct stage order.');
    case 'structural_section': return T(c.structure === 'adapter' ? 'Fixing a payload to the stage below.' : 'Making the body longer and stiffer.', 'All structure weight is weight you lift.');
    case 'rover_chassis': return T('The body that carries the rover parts.', 'Bigger body weighs more, needs power.');
    case 'wheel': return T('Driving over rock and sand.', 'Slips on loose soil and steep slopes.');
    case 'motor': return T('Turning the wheels.', 'Uses battery power and gets warm.');
    default: return T('A useful part for many designs.', 'Adds mass.');
  }
}
for (const c of CATALOG) if (!c.plain) c.plain = autoPlain(c);
export const byCatalogId = (id) => CATALOG.find((c) => c.catalogId === id);

export const CATEGORIES = [
  { id: 'propulsion', label: 'Propulsion', kinds: ['engine', 'fuel_tank', 'oxidizer_tank', 'propellant_tank', 'rcs'] },
  { id: 'structure', label: 'Structure', kinds: ['nose_cone', 'fairing', 'interstage', 'decoupler', 'structural_section', 'fin', 'heat_shield'] },
  { id: 'avionics', label: 'Avionics & control', kinds: ['avionics', 'guidance', 'computer', 'reaction_wheel'] },
  { id: 'power', label: 'Power', kinds: ['battery', 'solar_panel', 'fuel_cell'] },
  { id: 'comms', label: 'Communications', kinds: ['antenna'] },
  { id: 'science', label: 'Instruments & payload', kinds: ['instrument', 'payload', 'sensor'] },
  { id: 'thermal', label: 'Thermal', kinds: ['radiator', 'heater', 'mli'] },
  { id: 'landing', label: 'Landing', kinds: ['landing_legs', 'parachute'] },
  { id: 'rover', label: 'Rover', kinds: ['rover_chassis', 'wheel', 'motor'] },
];

export const KIND_LABELS = {
  engine: 'Engine', fuel_tank: 'Fuel tank', oxidizer_tank: 'Oxidizer tank', propellant_tank: 'Propellant tank', rcs: 'RCS', nose_cone: 'Nose cone', fairing: 'Payload fairing',
  interstage: 'Interstage', decoupler: 'Decoupler', structural_section: 'Structural section', fin: 'Fins', heat_shield: 'Heat shield', avionics: 'Avionics', guidance: 'Guidance system', computer: 'Computer',
  reaction_wheel: 'Reaction wheels', battery: 'Battery', solar_panel: 'Solar panel', fuel_cell: 'Fuel cell', antenna: 'Antenna', instrument: 'Instrument', payload: 'Payload', sensor: 'Sensor',
  radiator: 'Radiator', heater: 'Heater', mli: 'Insulation', landing_legs: 'Landing legs', parachute: 'Parachute', rover_chassis: 'Chassis', wheel: 'Wheels', motor: 'Motor',
};

/** Editable numeric fields per component kind, used to generate the inspector form. [key, label, unit, min, max, step] */
export const KIND_FIELDS = {
  engine: [['thrustVac', 'Thrust (vacuum)', 'N', 0, 1e8, 100], ['ispVac', 'Isp (vacuum)', 's', 50, 5000, 1], ['ispSl', 'Isp (sea level)', 's', 50, 5000, 1], ['mixtureRatio', 'Mixture ratio O/F', '', 0.1, 10, 0.05], ['minThrottle', 'Min throttle', '', 0, 1, 0.05], ['gimbal', 'Gimbal range', '°', 0, 15, 0.5], ['ignitions', 'Ignitions', '', 1, 1000, 1], ['spoolTime', 'Spool time', 's', 0.05, 20, 0.05], ['count', 'Engine count', '', 1, 40, 1], ['mass', 'Mass (each)', 'kg', 0.1, 1e5, 1], ['propellantMass', 'Solid propellant (each)', 'kg', 1, 1e6, 10], ['powerDraw', 'Electric power (thrusters)', 'W', 0, 1e5, 10]],
  fuel_tank: [['propellantMass', 'Propellant capacity', 'kg', 1, 1e7, 10], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['fill', 'Initial fill', '', 0, 1, 0.01]],
  oxidizer_tank: [['propellantMass', 'Propellant capacity', 'kg', 1, 1e7, 10], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['fill', 'Initial fill', '', 0, 1, 0.01]],
  propellant_tank: [['propellantMass', 'Propellant capacity', 'kg', 1, 1e7, 10], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['fill', 'Initial fill', '', 0, 1, 0.01]],
  rcs: [['torque', 'Torque authority', 'N·m', 0, 1e5, 1], ['thrust', 'Thrust', 'N', 1, 1e5, 1], ['isp', 'Isp', 's', 50, 500, 1], ['propellantMass', 'Propellant', 'kg', 0, 1e4, 0.5], ['mass', 'Dry mass', 'kg', 0.1, 1e4, 0.5]],
  nose_cone: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['length', 'Length', 'm', 0.1, 30, 0.05], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['tMax', 'Max temperature', 'K', 200, 4000, 10]],
  fairing: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['length', 'Length', 'm', 0.1, 30, 0.05], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['tMax', 'Max temperature', 'K', 200, 4000, 10]],
  decoupler: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['length', 'Length', 'm', 0.05, 5, 0.01], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['strength', 'Axial strength', 'N', 1e3, 1e9, 1e3]],
  interstage: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['length', 'Length', 'm', 0.05, 30, 0.05], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['strength', 'Axial strength', 'N', 1e3, 1e9, 1e3], ['maxQAlpha', 'Max q·α', 'Pa·rad', 100, 1e6, 100]],
  structural_section: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['length', 'Length', 'm', 0.05, 30, 0.05], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['strength', 'Axial strength', 'N', 1e3, 1e9, 1e3], ['maxQAlpha', 'Max q·α', 'Pa·rad', 100, 1e6, 100]],
  fin: [['cnAlpha', 'Normal-force slope', '/rad', 0, 30, 0.5], ['mass', 'Mass', 'kg', 0.1, 1e3, 0.5]],
  heat_shield: [['mass', 'Mass', 'kg', 0.1, 1e4, 0.5], ['diameter', 'Diameter', 'm', 0.1, 20, 0.05], ['tMax', 'Max temperature', 'K', 500, 5000, 50]],
  avionics: [['mass', 'Mass', 'kg', 0.1, 500, 0.5], ['powerDraw', 'Power draw', 'W', 0, 2000, 1], ['maxAccelG', 'Max acceleration', 'g', 1, 100, 1]],
  guidance: [['mass', 'Mass', 'kg', 0.1, 500, 0.5], ['powerDraw', 'Power draw', 'W', 0, 2000, 1], ['pointingAccuracyDeg', 'Pointing accuracy', '°', 0.001, 5, 0.01]],
  computer: [['mass', 'Mass', 'kg', 0.1, 500, 0.5], ['powerDraw', 'Power draw', 'W', 0, 2000, 1]],
  reaction_wheel: [['torque', 'Torque', 'N·m', 0.001, 100, 0.01], ['powerDraw', 'Power', 'W', 0, 500, 1], ['mass', 'Mass', 'kg', 0.1, 500, 0.5], ['count', 'Count', '', 1, 12, 1]],
  battery: [['capacityWh', 'Capacity', 'Wh', 1, 1e6, 10], ['mass', 'Mass', 'kg', 0.1, 1e4, 0.5]],
  fuel_cell: [['powerW', 'Power', 'W', 10, 1e5, 10], ['reactantMass', 'Hydrogen and oxygen', 'kg', 1, 5000, 1], ['mass', 'Mass', 'kg', 1, 2000, 1]],
  solar_panel: [['area', 'Area', 'm²', 0.01, 1000, 0.1], ['efficiency', 'Efficiency', '', 0.05, 0.45, 0.01], ['mass', 'Mass', 'kg', 0.1, 1e3, 0.5]],
  antenna: [['gainDbi', 'Gain', 'dBi', -5, 70, 0.5], ['txPowerW', 'Transmit power', 'W', 0.1, 1000, 0.5], ['frequencyGHz', 'Frequency', 'GHz', 0.1, 100, 0.1], ['dataRateBps', 'Data rate', 'bit/s', 10, 1e9, 100], ['powerDraw', 'Power draw', 'W', 0, 1000, 1], ['mass', 'Mass', 'kg', 0.05, 200, 0.1]],
  instrument: [['mass', 'Mass', 'kg', 0.05, 500, 0.1], ['powerDraw', 'Power draw', 'W', 0, 1000, 0.5], ['dataRateBps', 'Data rate', 'bit/s', 0, 1e8, 100]],
  payload: [['mass', 'Mass', 'kg', 0.1, 1e6, 1], ['length', 'Length', 'm', 0.05, 30, 0.05], ['diameter', 'Diameter', 'm', 0.05, 20, 0.05], ['maxAccelG', 'Max acceleration', 'g', 1, 100, 1]],
  radiator: [['area', 'Area', 'm²', 0.01, 500, 0.1], ['mass', 'Mass', 'kg', 0.1, 1e3, 0.5]],
  heater: [['powerDraw', 'Heater power', 'W', 0.1, 1000, 1], ['setpointK', 'Setpoint', 'K', 200, 350, 1]],
  mli: [['insulationFactor', 'Effective emissivity factor', '', 0.01, 1, 0.01], ['mass', 'Mass', 'kg', 0.1, 100, 0.5]],
  landing_legs: [['maxImpactVelocity', 'Max impact speed', 'm/s', 0.5, 20, 0.1], ['footprintRadius', 'Footprint radius', 'm', 0.2, 20, 0.1], ['legLength', 'Leg length', 'm', 0.1, 10, 0.1], ['mass', 'Mass', 'kg', 1, 1e3, 1]],
  parachute: [['dragArea', 'Drag area CdA', 'm²', 0.5, 5000, 0.5], ['deployTime', 'Inflation time', 's', 0.5, 30, 0.5], ['maxDeployQ', 'Max deploy q', 'Pa', 100, 1e6, 100], ['mass', 'Mass', 'kg', 0.1, 1e3, 0.5]],
  rover_chassis: [['mass', 'Mass', 'kg', 1, 5000, 1], ['length', 'Length', 'm', 0.2, 10, 0.05], ['width', 'Width', 'm', 0.2, 6, 0.05], ['wheelbase', 'Wheelbase', 'm', 0.1, 8, 0.05], ['groundClearance', 'Ground clearance', 'm', 0.02, 2, 0.01]],
  wheel: [['count', 'Wheel count', '', 2, 12, 2], ['radius', 'Radius', 'm', 0.03, 1, 0.01], ['width', 'Width', 'm', 0.02, 0.6, 0.01], ['mass', 'Mass (each)', 'kg', 0.1, 100, 0.1]],
  motor: [['stallTorque', 'Stall torque', 'N·m', 0.1, 1000, 0.5], ['noLoadSpeed', 'No-load speed', 'rad/s', 1, 200, 0.5], ['efficiency', 'Efficiency', '', 0.3, 0.98, 0.01], ['mass', 'Mass (each)', 'kg', 0.1, 100, 0.1]],
  sensor: [['powerDraw', 'Power', 'W', 0, 500, 0.5], ['mass', 'Mass', 'kg', 0.05, 100, 0.1]],
};
