// Ready-made AI Experiment Mode problems, e.g. "find the lightest lander that can put 2,000 kg on the Moon".
// Dry mass comes from a mass-estimating relationship (tankage fraction + engine thrust-to-weight +
// fixed structure): APPROXIMATION. Feasibility comes from the time-domain landing simulation.
import { DescentSim } from '../flight/descent.js';
import { loadVehicle } from '../vehicle/library.js';

export function landerSizing({ payload = 2000, minPropMarginFrac = 0.05, terrain = 'mare', seeds = [1, 2, 3] } = {}) {
  const base = loadVehicle('lunar-lander');
  return {
    id: 'lightest-lander', objectiveLabel: 'mass in lunar orbit (kg)',
    variables: [{ id: 'prop', label: 'Descent propellant (kg)', min: 3000, max: 16000 }, { id: 'thrust', label: 'Descent engine thrust (N)', min: 15000, max: 90000 }],
    build({ prop, thrust }) {
      const v = JSON.parse(JSON.stringify(base));
      v.name = 'Candidate lander';
      v.stages = [{ ...v.stages[0], propMass: prop, dryMass: 600 + 0.09 * prop + thrust / (9.81 * 45) + 0.12 * payload, engines: [{ ...v.stages[0].engines[0], thrustVac: thrust }] }];
      v.payload = { mass: payload, name: 'Cargo' };
      return v;
    },
    evaluate(v) {
      const gross = v.stages[0].dryMass + v.stages[0].propMass + v.payload.mass;
      const runs = seeds.map((s) => new DescentSim(v, { record: false, seed: s, dt: 0.2, terrain: { type: terrain, seed: 100 + s } }).run());
      const failed = runs.find((r) => !r.success);
      const margin = Math.min(...runs.map((r) => r.propellantMarginFrac));
      const metrics = { gross, propellantMarginFrac: margin, maxG: Math.max(...runs.map((r) => r.maxG)) };
      if (failed) return { feasible: false, objective: gross, metrics, reason: `landing simulation: ${failed.text}`, violation: 1 };
      if (margin < minPropMarginFrac) return { feasible: false, objective: gross, metrics, reason: `propellant margin ${(margin * 100).toFixed(1)}% below ${(minPropMarginFrac * 100).toFixed(0)}%`, violation: minPropMarginFrac - margin };
      return { feasible: true, objective: gross, metrics };
    },
  };
}
