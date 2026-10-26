// Monte Carlo / sensitivity adapters: each wraps a time-domain physics simulation with its uncertain inputs.
// The uncertainty magnitudes are typical public engineering values (APPROXIMATION) and are user-editable.
import { DescentSim } from '../flight/descent.js';
import { AscentSim, tuneAscent } from '../flight/ascent.js';
import { EntrySim } from '../flight/entry.js';
import { RendezvousSim } from '../flight/rendezvous.js';
import { runLunarMission, defaultLunarArchitecture } from '../workflow/lunarMission.js';
import { loadVehicle } from '../vehicle/library.js';
import { cloneVehicle } from '../vehicle/model.js';

const P = (id, label, unit, nominal, sd, extra = {}) => ({ id, label, unit, nominal, sd, distribution: 'normal', ...extra });

export function lunarLandingModel(lander = loadVehicle('lunar-lander'), { terrain = 'mare', payloadMass = 0, dt = 0.1 } = {}) {
  return {
    id: 'lunar-landing', name: 'Lunar powered descent and landing',
    params: [
      P('thrustScale', 'Descent engine thrust', 'x', 1, 0.01, { min: 0.9 }),
      P('ispScale', 'Descent engine Isp', 'x', 1, 0.005),
      P('massScale', 'Vehicle dry mass', 'x', 1, 0.01),
      P('propScale', 'Propellant load', 'x', 1, 0.005, { max: 1.0 }),
      { id: 'navScale', label: 'Navigation error (initial state)', unit: 'x', nominal: 1, sd: 0.3, distribution: 'lognormal' },
      P('accelBias', 'Accelerometer bias', 'm/s^2', 0, 0.0005),
      P('radarBias', 'Radar altimeter bias', 'm', 0, 2),
      P('pdiRangeError', 'PDI downrange dispersion', 'm', 0, 500),
      P('pdiAltError', 'PDI altitude dispersion', 'm', 0, 150),
      P('pdiVelError', 'PDI velocity dispersion', 'm/s', 0, 0.5),
      { id: 'terrainSeed', label: 'Terrain realization', unit: '-', nominal: 11, min: 1, max: 5000, distribution: 'uniform' },
    ],
    run(x, seed) {
      const l = cloneVehicle(lander);
      l.stages[0].propMass *= x.propScale;
      l.payload.mass = payloadMass;
      const r = new DescentSim(l, { record: false, seed, dt, terrain: { type: terrain, seed: Math.round(x.terrainSeed) },
        dispersions: { thrustScale: x.thrustScale, ispScale: x.ispScale, massScale: x.massScale, navScale: x.navScale, accelBias: [x.accelBias, x.accelBias * 0.7], radarBias: x.radarBias, pdiError: [x.pdiRangeError, x.pdiAltError, x.pdiVelError, x.pdiVelError * 0.3] } }).run();
      return { success: r.success, failureMode: r.success ? null : r.outcome, metrics: { touchdownVz: r.touchdown?.vz, touchdownVh: r.touchdown?.vh, landingError: r.touchdown?.error, propellantRemaining: r.propellantRemaining, propellantMarginFrac: r.propellantMarginFrac, maxG: r.maxG, time: r.time } };
    },
  };
}

export function ascentModel(vehicle = loadVehicle('small-launcher'), { targetAlt = 200e3, body = 'earth' } = {}) {
  const kick = tuneAscent(vehicle, { targetAlt, body }).kickDeg;
  return {
    id: 'ascent', name: `Ascent to ${(targetAlt / 1000).toFixed(0)} km`,
    params: [
      P('thrust1', 'Stage 1 thrust', 'x', 1, 0.01), P('thrust2', 'Upper stage thrust', 'x', 1, 0.01),
      P('isp1', 'Stage 1 Isp', 'x', 1, 0.004), P('isp2', 'Upper stage Isp', 'x', 1, 0.004),
      P('massScale', 'Liftoff mass', 'x', 1, 0.005), P('prop1', 'Stage 1 propellant load', 'x', 1, 0.003, { max: 1.0 }),
      P('densityScale', 'Atmospheric density', 'x', 1, 0.05), P('windJet', 'Jet-stream wind', 'm/s', 0, 25),
      P('pitchBias', 'Guidance pitch bias', 'deg', 0, 0.3),
    ],
    run(x, seed) {
      const n = vehicle.stages.length;
      const r = new AscentSim(vehicle, { targetAlt, body, kickDeg: kick, record: false, subsystems: false,
        dispersions: { thrustScale: [x.thrust1, ...Array(n - 1).fill(x.thrust2)], ispScale: [x.isp1, ...Array(n - 1).fill(x.isp2)], massScale: x.massScale, propScale: [x.prop1], pitchBiasDeg: x.pitchBias },
        env: { densityScale: x.densityScale, windJet: x.windJet } }).run();
      return { success: r.success, failureMode: r.success ? null : r.outcome, metrics: { periapsisAlt: r.orbit.periapsisAlt, apoapsisAlt: r.orbit.apoapsisAlt, propellantRemaining: r.propellantRemaining, maxG: r.maxG, maxQ: r.maxQ.q, maxQAlpha: r.maxQAlpha } };
    },
  };
}

export function entryModel(vehicle = 'crew-capsule', { body = 'earth', entrySpeed = 11000, gammaDeg = -6.5, entryAlt } = {}) {
  return {
    id: 'entry', name: 'Atmospheric entry and recovery',
    params: [
      P('gammaError', 'Entry flight-path angle error', 'deg', 0, 0.15), P('densityScale', 'Atmospheric density', 'x', 1, 0.08),
      P('cdScale', 'Drag coefficient', 'x', 1, 0.03), P('ldScale', 'Lift-to-drag ratio', 'x', 1, 0.05), P('massScale', 'Entry mass', 'x', 1, 0.01),
      { id: 'chuteFail', label: 'One main parachute fails', unit: '-', nominal: 0, p: 0.02, distribution: 'bernoulli' },
    ],
    run(x, seed) {
      const r = new EntrySim(vehicle, { body, entrySpeed, gammaDeg, ...(entryAlt ? { entryAlt } : {}), record: false, dt: 0.2,
        dispersions: { gammaErrorDeg: x.gammaError, densityScale: x.densityScale, cdScale: x.cdScale, ldScale: x.ldScale, massScale: x.massScale, chuteFailures: x.chuteFail ? ['Mains:1'] : [] } }).run();
      return { success: r.success, failureMode: r.success ? null : r.outcome, metrics: { maxG: r.maxG, maxHeatFlux: r.maxHeatFlux, heatLoad: r.heatLoad, ablatorMarginFrac: r.ablatorMarginFrac, touchdownSpeed: r.touchdown?.vz, range: r.range } };
    },
  };
}

export function rendezvousModel() {
  return {
    id: 'rendezvous', name: 'Lunar orbit rendezvous and docking',
    params: [
      { id: 'navScale', label: 'Relative navigation error', unit: 'x', nominal: 1, sd: 0.4, distribution: 'lognormal' },
      P('alongTrack', 'Initial along-track separation', 'm', -60000, 5000), P('radial', 'Initial radial separation', 'm', -15000, 1500),
      P('rcsProp', 'RCS propellant load', 'kg', 280, 5),
    ],
    run(x, seed) {
      const r = new RendezvousSim({ seed, record: false, navSd: 20 * x.navScale, initial: [x.radial, x.alongTrack, 200, 0, 22, 0], rcsProp: x.rcsProp }).run();
      return { success: r.success, failureMode: r.success ? null : r.outcome, metrics: { dvUsed: r.dvUsed, rcsMarginFrac: r.rcsMarginFrac, closingSpeed: r.docking?.closing, lateralOffset: r.docking?.lateral } };
    },
  };
}

export function lunarMissionModel(archFactory = defaultLunarArchitecture) {
  return {
    id: 'lunar-mission', name: 'Complete lunar mission (launch to splashdown)',
    params: [
      P('spsIsp', 'Service engine Isp', 'x', 1, 0.005), P('tliProp', 'Third stage residual propellant', 'x', 1, 0.01),
      { id: 'navScale', label: 'Navigation quality', unit: 'x', nominal: 1, sd: 0.3, distribution: 'lognormal' },
      P('descentThrust', 'Descent engine thrust', 'x', 1, 0.01), P('densityScale', 'Earth atmospheric density', 'x', 1, 0.05),
      { id: 'terrainSeed', label: 'Landing terrain realization', unit: '-', nominal: 11, min: 1, max: 5000, distribution: 'uniform' },
    ],
    run(x, seed) {
      const a = archFactory(); a.seed = seed % 100000; a.terrain = { ...a.terrain, seed: Math.round(x.terrainSeed) };
      const r = runLunarMission(a, { dispersions: { spsIspScale: x.spsIsp, tliPropScale: x.tliProp, navScale: x.navScale, descent: { thrustScale: x.descentThrust, navScale: x.navScale }, launchEnv: { densityScale: x.densityScale } } });
      return { success: r.success, failureMode: r.failedPhase, metrics: r.metrics };
    },
  };
}

export const MODELS = { 'lunar-landing': lunarLandingModel, ascent: ascentModel, entry: entryModel, rendezvous: rendezvousModel, 'lunar-mission': lunarMissionModel };
