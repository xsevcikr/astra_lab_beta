// Shared helpers for the validation tests: minimal vehicles and custom test bodies.
import { registerBody } from '../physics/bodies.js';

// A gravity-free "void" body (mu tiny) for pure rocket-equation tests, an airless Earth clone, and a constant-density atmosphere.
registerBody({ id: 'void', name: 'Void', type: 'planet', parent: null, mu: 1e-2, radius: 6378137, rotationPeriod: 0, dataSource: 'user', atmosphere: { model: 'none' }, surface: { terrainAmplitude: 0 } });
registerBody({ id: 'vacearth', name: 'Airless Earth', type: 'planet', parent: null, mu: 3.986004418e14, radius: 6378137, rotationPeriod: 86164.0905, dataSource: 'user', atmosphere: { model: 'none' }, surface: { terrainAmplitude: 0 } });
registerBody({ id: 'denseair', name: 'Uniform-air Earth', type: 'planet', parent: null, mu: 3.986004418e14, radius: 6378137, rotationPeriod: 0, dataSource: 'user',
  atmosphere: { model: 'exponential', rho0: 1.225, scaleHeight: 1e9, T0: 288, height: 1e6 }, surface: { terrainAmplitude: 0 } });

export const ball = (mass = 100, D = 0.5, extra = {}) => ({
  id: 'ball', name: 'Test mass', type: 'probe', components: [{ id: 'c1', kind: 'payload', name: 'Test mass', mount: 'stack', group: 'main', mass, length: 0.5, diameter: D, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0, ...extra }], stages: [{ id: 'main', name: 'Main', order: 1 }],
});

/** A single engine + tank stage with exactly the requested masses; free of aerodynamics; enough power for the flight computer. */
export function engineStage({ dry = 100, prop = 400, thrust = 5000, isp = 300, group = 'main', name = 'Test stage' } = {}) {
  const mr = 2.0;
  const fuel = prop / (1 + mr), ox = prop - fuel;
  return {
    id: 'stage', name, type: 'rocket',
    components: [
      { id: 'eng', kind: 'engine', name: 'Test engine', mount: 'stack', group, mass: 5, length: 0.5, diameter: 0.5, thrustVac: thrust, ispVac: isp, ispSl: isp, propellants: ['RP-1', 'LOX'], mixtureRatio: mr, gimbal: 0, minThrottle: 0.0, maxThrottle: 1, ignitions: 5, spoolTime: 0.05, maxQ: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 },
      { id: 'tf', kind: 'fuel_tank', name: 'Fuel', mount: 'stack', group, mass: 0, length: 1, diameter: 0.5, propellant: 'RP-1', propellantMass: fuel, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 },
      { id: 'to', kind: 'oxidizer_tank', name: 'Oxidizer', mount: 'stack', group, mass: 0, length: 1, diameter: 0.5, propellant: 'LOX', propellantMass: ox, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 },
      { id: 'dead', kind: 'payload', name: 'Dry mass', mount: 'stack', group, mass: dry - 5, length: 0.5, diameter: 0.5, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 },
    ],
    stages: [{ id: group, name, order: 1 }],
  };
}
export const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
