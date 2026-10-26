// Regression suite: nominal scenarios whose key outputs are stored in baseline.json. Any physics change that
// moves them beyond tolerance fails the tests until the change is understood and the baseline re-approved
// (node scripts/update-engineering-baseline.mjs).
import { runLunarMission, defaultLunarArchitecture } from '../workflow/lunarMission.js';
import { simulateAscent } from '../flight/ascent.js';
import { simulateDescent } from '../flight/descent.js';
import { simulateEntry } from '../flight/entry.js';
import { simulateRendezvous } from '../flight/rendezvous.js';
import { loadVehicle } from '../vehicle/library.js';

export function regressionOutputs() {
  const m = runLunarMission(defaultLunarArchitecture());
  const a = simulateAscent(loadVehicle('heavy-lunar'), { targetAlt: 185e3, kickDeg: 6, record: false });
  const d = simulateDescent(loadVehicle('lunar-lander'), { seed: 1, record: false });
  const e = simulateEntry('crew-capsule', { record: false });
  const mars = simulateEntry('mars-lander', { body: 'mars', entryAlt: 125000, entrySpeed: 5800, gammaDeg: -15.5, record: false });
  const r = simulateRendezvous({ seed: 1, record: false });
  return {
    'mission.success': m.metrics['mission.success'], 'mission.tli.dvMargin': m.metrics['tli.dvMargin'], 'mission.landing.propellantMarginFrac': m.metrics['landing.propellantMarginFrac'], 'mission.entry.maxG': m.metrics['entry.maxG'], 'mission.tei.propReserveFrac': m.metrics['tei.propReserveFrac'],
    'ascent.heavy.propellantRemaining': a.propellantRemaining, 'ascent.heavy.maxG': a.maxG, 'ascent.heavy.periapsisAlt': a.orbit.periapsisAlt,
    'descent.seed1.propellantRemaining': d.propellantRemaining, 'descent.seed1.touchdownVz': d.touchdown.vz,
    'entry.earth.maxG': e.maxG, 'entry.earth.range': e.range, 'entry.mars.touchdown': mars.touchdown?.vz ?? -1,
    'rendezvous.seed1.dvUsed': r.dvUsed,
  };
}
