// Ascent trajectory tuning by repeated *real* simulation (the same practice as real mission design: the pitch-over
// (kick) angle is a free trajectory parameter and is chosen by flying candidates through the simulator).
import { Simulation } from '../../physics/simulation.js';
import { launchMission } from './generator.js';

/** Run a mission to completion (or until maxSimSeconds) and return the finished simulation. */
export function runToEnd(vehicle, mission, { environment, settings, wallMs = 60000 } = {}) {
  const sim = new Simulation({ vehicle, mission, environment, settings });
  sim.run({ budgetMs: wallMs });
  if (!sim.finished) sim._finish(null, 'Wall-clock budget exhausted');
  return sim;
}

const orbitError = (sim) => {
  const s = sim.result.summary.finalOrbit;
  return Math.abs(s.peri - (sim.mission.objective.altitude ?? 0)) + Math.abs(s.apo - (sim.mission.objective.altitude ?? 0));
};

/**
 * Find a pitch-over angle for which the launch mission achieves its orbit. Returns {mission, sim, tried, ok}.
 * Nothing is assumed: every candidate is flown; the returned mission is the best one actually simulated.
 */
export function tuneLaunch(vehicle, opts = {}) {
  // candidate pitch programmes: altitude at which the vehicle reaches horizontal (hF) and the shape exponent (n)
  const cands = opts.schedules ?? [
    { hF: 100e3, n: 0.45 }, { hF: 100e3, n: 0.65 }, { hF: 140e3, n: 0.3 }, { hF: 180e3, n: 0.3 }, { hF: 120e3, n: 0.5 }, { hF: 90e3, n: 0.55 },
    { hF: 140e3, n: 0.4 }, { hF: 80e3, n: 0.7 }, { hF: 240e3, n: 0.25 }, { hF: 110e3, n: 0.35 }, { hF: 160e3, n: 0.35 }, { hF: 70e3, n: 0.8 },
  ];
  const tried = [];
  let best = null;
  for (const schedule of cands) {
    const mission = launchMission(vehicle, { ...opts, schedule });
    const sim = runToEnd(vehicle, mission, opts);
    const ok = sim.result.status === 'SUCCESS';
    tried.push({ schedule, status: sim.result.status, reason: sim.result.reason, orbit: sim.result.summary.finalOrbit });
    const err = orbitError(sim);
    if (!best || (ok && !best.ok) || (ok === best.ok && err < best.err)) best = { mission, sim, ok, err, schedule };
    if (ok) break;
    if (opts.maxTries && tried.length >= opts.maxTries) break;
  }
  return { mission: best.mission, sim: best.sim, ok: best.ok, schedule: best.schedule, tried };
}

/**
 * Design a launcher for a payload and verify by real simulation that it reaches the orbit; if a candidate falls short the
 * delta-v margin is increased and the vehicle is re-sized. Returns {vehicle, mission, sim, ok, margin, attempts}.
 */
export async function designVerifiedLauncher(spec = {}, { designLauncher, margins = [1.045, 1.09, 1.14], onProgress } = {}) {
  const attempts = [];
  let last = null;
  for (const margin of margins) {
    const vehicle = designLauncher({ ...spec, dvMargin: margin });
    onProgress?.({ stage: 'sizing', margin, mass: vehicle.components.reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1), 0) });
    const r = tuneLaunch(vehicle, { ...(spec.mission ?? {}), maxTries: spec.maxTries });
    attempts.push({ margin, ok: r.ok, tried: r.tried.length });
    last = { vehicle, ...r, margin, attempts };
    if (r.ok) break;
  }
  return last;
}
