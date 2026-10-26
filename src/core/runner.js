// Cooperative simulation runner: advances a Simulation in short slices and yields to the event loop between them,
// so the UI stays responsive and STOP_SIMULATION works. The physics is identical to a synchronous run().
import { Simulation } from '../../physics/simulation.js';

export const yieldToLoop = () => new Promise((r) => (typeof setImmediate === 'function' ? setImmediate(r) : setTimeout(r, 0)));

/**
 * @param inputs {vehicle, mission, environment?, settings?}
 * @param opts   {sliceMs, shouldStop(), onProgress({t, wallMs, state}), maxWallMs}
 * @returns the finished Simulation (sim.result is set). If stopped early the result reason says so.
 */
export async function runSimulation(inputs, { sliceMs = 12, shouldStop, onProgress, maxWallMs = 300000 } = {}) {
  const sim = new Simulation(inputs);
  const start = Date.now();
  let lastReport = 0;
  while (!sim.finished) {
    sim.run({ budgetMs: sliceMs });
    if (sim.finished) break;
    const wall = Date.now() - start;
    if (shouldStop?.()) { sim._finish(null, 'Stopped by the user'); break; }
    if (wall > maxWallMs) { sim._finish(null, 'Wall-clock budget exhausted'); break; }
    if (onProgress && wall - lastReport > 100) { lastReport = wall; onProgress({ t: sim.t, wallMs: wall, state: sim.now, sim }); }
    await yieldToLoop();
  }
  return sim;
}
