// Mission scenario generator, emergency scenarios and engineering challenges.
import { makeRng } from '../core/rng.js';

const TYPES = {
  'launch-satellite': { name: 'Launch a satellite', vehicle: 'small-launcher', sim: 'ascent', base: { payload: 150, targetAlt: 300e3 } },
  'lunar-landing': { name: 'Lunar landing', vehicle: 'lunar-lander', sim: 'descent', base: { terrain: 'mare' } },
  'mars-rover': { name: 'Mars rover landing', vehicle: 'mars-lander', sim: 'entry', base: { body: 'mars', entrySpeed: 5800, gammaDeg: -15.5 } },
  'orbital-rendezvous': { name: 'Orbital rendezvous', sim: 'rendezvous', base: { alongTrack: -60000 } },
  'sample-return': { name: 'Lunar sample return', sim: 'lunar-mission', base: { sampleMass: 22 } },
  'station-resupply': { name: 'Space station resupply', sim: 'rendezvous', base: { alongTrack: -30000, body: 'earth', targetAlt: 400e3 } },
  'emergency-rescue': { name: 'Emergency rescue', sim: 'rendezvous', base: { alongTrack: -120000, rcsProp: 200 } },
  'comsat': { name: 'Communication satellite', sim: 'ascent', vehicle: 'heavy-lunar', base: { payload: 6000, targetAlt: 250e3 } },
  'deep-space-probe': { name: 'Deep-space probe', sim: 'ascent', vehicle: 'heavy-lunar', base: { payload: 2000, targetAlt: 200e3 } },
};
const DIFFICULTY = { easy: { margin: 1.0, failures: 0, dispersion: 0.5 }, normal: { margin: 0.9, failures: 0, dispersion: 1 }, hard: { margin: 0.8, failures: 1, dispersion: 1.5 }, expert: { margin: 0.7, failures: 2, dispersion: 2 } };

export function generateScenario(type, difficulty = 'normal', seed = 1) {
  const T = TYPES[type]; if (!T) throw new Error(`unknown scenario type ${type}`);
  const D = DIFFICULTY[difficulty]; if (!D) throw new Error(`unknown difficulty ${difficulty}`);
  const rng = makeRng(seed);
  const params = { ...T.base };
  if (params.payload) params.payload = Math.round(params.payload * (1 + (1 - D.margin) * 2 * rng.next()));
  if (params.terrain && difficulty !== 'easy') params.terrain = rng.next() < 0.3 * D.dispersion ? 'highlands' : 'mare';
  const failurePool = { ascent: [{ type: 'engine-out', t: 40 }, { type: 'thrust-loss', t: 90, fraction: 0.15 }], descent: [{ type: 'radar-failure', t: 300 }, { type: 'thrust-loss', t: 200, fraction: 0.1 }, { type: 'imu-bias', t: 100, bias: 0.01 }], entry: [], rendezvous: [], 'lunar-mission': [] }[T.sim] || [];
  const failures = Array.from({ length: Math.min(D.failures, failurePool.length) }, () => failurePool.splice(rng.int(0, failurePool.length - 1), 1)[0]);
  return { id: `${type}-${difficulty}-${seed}`, type, name: T.name, difficulty, sim: T.sim, vehicle: T.vehicle, params, failures, dispersionScale: D.dispersion, briefing: `${T.name} (${difficulty}). ${failures.length ? 'Expect off-nominal events.' : 'Nominal conditions expected.'}` };
}
export const SCENARIO_TYPES = Object.keys(TYPES);

// Emergencies: the user gets telemetry and alarms, not the answer. Each has a hidden root cause, the observable
// symptoms the simulator produces, and the responses that recover the vehicle (used only to score afterwards).
export const EMERGENCIES = [
  { id: 'engine-failure-ascent', title: 'Engine failure during ascent', sim: 'ascent', vehicle: 'small-launcher', inject: [{ type: 'engine-out', t: 35 }], alarms: ['PROP ENGINE 3 CHAMBER PRESSURE LOW', 'THRUST ASYMMETRY'], acceptable: ['continue-to-orbit-lower', 'abort'], hiddenCause: 'Turbopump bearing seizure on one first-stage engine.' },
  { id: 'fuel-leak', title: 'Propellant leak', sim: 'ascent', vehicle: 'small-launcher', inject: [{ type: 'propellant-leak', t: 150, rate: 4, stage: 1 }], alarms: ['STAGE 2 TANK PRESSURE DECAY'], acceptable: ['early-cutoff-lower-orbit'], hiddenCause: 'Feedline flange leak on the upper stage.' },
  { id: 'navigation-failure', title: 'Navigation failure on descent', sim: 'descent', vehicle: 'lunar-lander', inject: [{ type: 'imu-bias', t: 120, bias: 0.02 }], alarms: ['NAV RESIDUAL HIGH'], acceptable: ['trust-radar', 'abort-to-orbit'], hiddenCause: 'Accelerometer bias shift after a power transient.' },
  { id: 'radar-loss', title: 'Landing radar loss', sim: 'descent', vehicle: 'lunar-lander', inject: [{ type: 'radar-failure', t: 280 }], alarms: ['LR DATA NO GOOD'], acceptable: ['abort-to-orbit', 'manual-landing'], hiddenCause: 'Landing radar transmitter failure.' },
  { id: 'landing-engine-failure', title: 'Landing engine thrust loss', sim: 'descent', vehicle: 'lunar-lander', inject: [{ type: 'thrust-loss', t: 400, fraction: 0.25 }], alarms: ['DPS CHAMBER PRESSURE LOW'], acceptable: ['abort-stage'], hiddenCause: 'Partial injector blockage.' },
  { id: 'computer-failure', title: 'Flight computer failure', sim: 'flight-computer', inject: [{ fault: 'computer-restart' }], alarms: ['PROGRAM ALARM', 'FC-A RESTART'], acceptable: ['failover', 'wait-for-reboot'], hiddenCause: 'Executive overflow from a high-rate task.' },
  { id: 'power-failure', title: 'Power failure', sim: 'power', inject: [{ fault: 'solar-panel-failure', fraction: 0.6 }, { fault: 'battery-degradation', fraction: 0.2 }], alarms: ['MAIN BUS UNDERVOLT', 'BATTERY DISCHARGE HIGH'], acceptable: ['shed-loads', 'safe-mode'], hiddenCause: 'Array string failure plus aged battery.' },
  { id: 'thermal-runaway', title: 'Thermal runaway', sim: 'thermal', inject: [{ node: 'battery', extraHeat: 400 }], alarms: ['BATTERY TEMP HIGH'], acceptable: ['isolate-battery', 'reduce-load'], hiddenCause: 'Cell internal short.' },
  { id: 'comms-loss', title: 'Communications loss', sim: 'comms', inject: [{ pointingErrorDeg: 8 }], alarms: ['NO DOWNLINK'], acceptable: ['switch-low-gain', 'repoint'], hiddenCause: 'High-gain antenna gimbal stuck.' },
  { id: 'sensor-failure', title: 'Sensor failure', sim: 'sensor', inject: [{ mode: 'stuck' }], alarms: ['GYRO 2 DISAGREE'], acceptable: ['vote-out-sensor'], hiddenCause: 'Gyro output frozen.' },
  { id: 'docking-failure', title: 'Docking failure', sim: 'rendezvous', inject: [{ navScale: 6 }], alarms: ['RANGE RATE ERRATIC'], acceptable: ['back-away-and-retry'], hiddenCause: 'Degraded docking target optics.' },
  { id: 'parachute-failure', title: 'Parachute failure', sim: 'entry', inject: [{ chuteFailures: ['Mains:1'] }], alarms: ['MAIN CHUTE 2 NOT DEPLOYED'], acceptable: ['continue-two-mains'], hiddenCause: 'Riser cut by a broken fitting.' },
  { id: 'guidance-failure', title: 'Guidance failure', sim: 'ascent', vehicle: 'small-launcher', inject: [{ type: 'thrust-loss', t: 200, fraction: 0.05 }], alarms: ['GUIDANCE TGO DIVERGING'], acceptable: ['accept-lower-orbit'], hiddenCause: 'Underperforming upper stage confuses guidance.' },
];
// Public view hides the cause and the accepted responses.
export const emergencyBriefing = (id) => { const e = EMERGENCIES.find((x) => x.id === id); if (!e) throw new Error(`unknown emergency ${id}`); const { hiddenCause, acceptable, ...pub } = e; return pub; };
export function scoreEmergencyResponse(id, response, outcome) {
  const e = EMERGENCIES.find((x) => x.id === id);
  const correct = e.acceptable.includes(response);
  return { correct, survived: outcome?.success ?? null, rootCause: e.hiddenCause, recommended: e.acceptable };
}

export const CHALLENGES = [
  { id: 'c1', title: 'Put a 500 kg satellite into orbit', sim: 'ascent', goal: { payload: 500, targetAlt: 200e3 }, limits: { grossMass: 30000 } },
  { id: 'c2', title: 'Land 1,000 kg on the Moon', sim: 'descent', goal: { payload: 1000 } },
  { id: 'c3', title: 'Return a lunar crew safely to Earth', sim: 'lunar-mission' },
  { id: 'c4', title: 'Land a rover on Mars', sim: 'entry', goal: { body: 'mars' } },
  { id: 'c5', title: 'Perform an orbital rendezvous', sim: 'rendezvous' },
  { id: 'c6', title: 'Design a rocket for 1,000 kg to orbit under 60 t', sim: 'ascent', goal: { payload: 1000, targetAlt: 200e3 }, limits: { grossMass: 60000 } },
  { id: 'c7', title: 'Recover a spacecraft after an engine failure', sim: 'ascent', goal: { targetAlt: 200e3 }, failures: [{ type: 'engine-out', t: 40 }] },
];
// Score 0-100 per criterion from simulation results only.
export function scoreChallenge(ch, { success, propellantMarginFrac = 0, grossMass, payload = 0, minMargin = 0, reliability = 0.9, precision = 0 }) {
  const s = {
    missionSuccess: success ? 100 : 0,
    fuelEfficiency: Math.max(0, Math.min(100, 100 - Math.abs(propellantMarginFrac - 0.08) * 600)),
    massEfficiency: grossMass && payload ? Math.min(100, 2000 * payload / grossMass) : 0,
    safetyMargin: Math.max(0, Math.min(100, minMargin * 200)),
    reliability: Math.max(0, Math.min(100, (reliability - 0.9) * 1000)),
    precision: Math.max(0, Math.min(100, precision)),
  };
  if (ch.limits?.grossMass && grossMass > ch.limits.grossMass) s.massEfficiency = 0;
  const total = success ? Object.values(s).reduce((a, b) => a + b, 0) / 6 : 0;
  return { criteria: s, total, passed: success && (!ch.limits?.grossMass || grossMass <= ch.limits.grossMass) };
}
