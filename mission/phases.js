// Mission phase model: an ordered graph of phases built from a template, each with entry gates (what must be true to start it),
// a "simulated by" tag naming the physics that decides the outcome, and the failure modes it can produce.
// The model holds NO scripted results. advance() only moves forward when the caller reports a physical outcome
// (e.g. {landed:true, vz:-1.2}) and gates are satisfied; otherwise the mission records a failure with an engineering reason.
import { planetInfo } from './planets.js';

export const SIM = { LAUNCH: 'ascent-sim', ORBIT: 'kepler-propagation', BURN: 'powered-flight', CRUISE: 'n-body-cruise', DESCENT: 'powered-descent', SURFACE: 'surface-ops', ASCENT: 'powered-ascent', RENDEZVOUS: 'relative-motion', DOCKING: 'contact-dynamics', ENTRY: 'entry-sim', CHUTE: 'parachute-sim', NONE: 'bookkeeping' };

const P = (id, name, sim, extra = {}) => ({ id, name, sim, gates: [], failures: [], ...extra });

/** Apollo-style lunar orbit rendezvous template (24 phases). */
function lunarOrbitRendezvous({ body = 'moon', origin = 'earth' } = {}) {
  return [
    P('prelaunch', 'On the launch pad', SIM.NONE, { gates: ['validationNotFailed'] }),
    P('launch', 'Launch and ascent', SIM.LAUNCH, { failures: ['no-liftoff', 'out-of-propellant', 'structural-failure', 'unstable', 'suborbital'], gates: ['crewInCommandModule'] }),
    P('stage-sep', 'Stage separation', SIM.NONE, { failures: ['separation-failure'] }),
    P('earth-orbit', 'Earth parking orbit', SIM.ORBIT, { failures: ['orbit-decays', 'perigee-too-low'], needs: { periapsis: '>=140 km' } }),
    P('tli', 'Trans-Lunar Injection', SIM.BURN, { gates: ['upperStageRestart'], failures: ['burn-short', 'wrong-direction', 'engine-no-restart'] }),
    P('translunar', 'Trans-lunar cruise', SIM.CRUISE, { failures: ['misses-moon', 'crash-on-moon'], allowsCorrections: true }),
    P('loi', 'Lunar Orbit Insertion', SIM.BURN, { failures: ['burn-short', 'flyby-escape', 'low-periapsis-crash', 'unstable-orbit'] }),
    P('lunar-orbit', 'Lunar orbit', SIM.ORBIT, { failures: ['orbit-decays'] }),
    P('lm-sep', 'Lunar Module separation', SIM.NONE, { gates: ['lmCrewAboard'], failures: ['separation-failure'] }),
    P('descent', 'Powered lunar descent', SIM.DESCENT, { failures: ['out-of-propellant', 'engine-failure', 'terrain-collision'] }),
    P('landing', 'Moon landing', SIM.DESCENT, { failures: ['hard-landing', 'tipped-over', 'gear-failure', 'crash'] }),
    P('surface', 'Surface operations', SIM.SURFACE, { failures: ['consumables-depleted', 'rover-stranded'] }),
    P('ascent', 'Lunar ascent', SIM.ASCENT, { gates: ['crewInLunarModule', 'ascentStageSeparated'], failures: ['out-of-propellant', 'engine-failure', 'suborbital', 'unstable'] }),
    P('rendezvous', 'Lunar orbit rendezvous', SIM.RENDEZVOUS, { failures: ['no-propellant', 'lost-contact'] }),
    P('docking', 'Docking', SIM.DOCKING, { failures: ['too-fast', 'misaligned', 'hardware-damaged', 'collision'] }),
    P('crew-transfer', 'Crew transfer', SIM.NONE, { gates: ['dockedHardLatch'], failures: ['crew-left-behind'] }),
    P('lm-jettison', 'Lunar Module jettison', SIM.NONE, { gates: ['crewInCommandModule'], failures: ['crew-left-behind'] }),
    P('tei', 'Trans-Earth Injection', SIM.BURN, { gates: ['crewInCommandModule', 'lmJettisoned'], failures: ['burn-short', 'wrong-direction', 'out-of-propellant'] }),
    P('transearth', 'Earth-Moon cruise', SIM.CRUISE, { failures: ['misses-earth', 'entry-corridor-missed'], allowsCorrections: true }),
    P('sm-sep', 'Service Module separation', SIM.NONE, { gates: ['crewInCommandModule'], failures: ['separation-failure'] }),
    P('reentry', 'Earth re-entry', SIM.ENTRY, { gates: ['crewInCommandModule', 'serviceModuleSeparated'], failures: ['skip-out', 'too-steep', 'heat-shield-failure', 'overload'] }),
    P('parachutes', 'Parachute descent', SIM.CHUTE, { failures: ['drogue-overspeed', 'main-failure', 'too-fast-splashdown'] }),
    P('splashdown', 'Ocean splashdown', SIM.CHUTE, { failures: ['capsule-damage', 'crew-injury'] }),
    P('complete', 'Mission complete', SIM.NONE),
  ];
}

/** Direct-descent planetary mission template that works for any PlanetDefinition (Mars, a future Venus orbiter...). */
function planetaryLander({ body = 'mars' } = {}) {
  const info = planetInfo(body);
  const entry = info.hasAtmosphere
    ? [P('atmo-entry', `${info.name} atmospheric entry`, SIM.ENTRY, { failures: ['skip-out', 'too-steep', 'heat-shield-failure', 'overload'] }),
      P('supersonic-chute', 'Parachute and heat shield jettison', SIM.CHUTE, { failures: ['chute-failure', 'deploy-too-fast', 'too-thin-atmosphere'] })]
    : [];
  return [
    P('prelaunch', 'On the launch pad', SIM.NONE, { gates: ['validationNotFailed'] }),
    P('launch', 'Launch and ascent', SIM.LAUNCH, { failures: ['no-liftoff', 'out-of-propellant', 'structural-failure', 'unstable', 'suborbital'] }),
    P('earth-orbit', 'Earth parking orbit', SIM.ORBIT),
    P('departure', 'Interplanetary injection', SIM.BURN, { failures: ['burn-short', 'wrong-window'] }),
    P('cruise', 'Interplanetary cruise', SIM.CRUISE, { allowsCorrections: true, failures: ['misses-target'] }),
    P('oi', `${info.name} orbit insertion`, SIM.BURN, { failures: ['burn-short', 'flyby-escape'] }),
    P('orbit', `${info.name} orbit`, SIM.ORBIT),
    ...entry,
    P('descent', 'Powered descent', SIM.DESCENT, { failures: ['out-of-propellant', 'engine-failure', 'terrain-collision'] }),
    P('landing', `${info.name} landing`, SIM.DESCENT, { failures: ['hard-landing', 'tipped-over', 'gear-failure', 'crash'] }),
    P('surface', 'Surface operations', SIM.SURFACE, { failures: ['consumables-depleted', 'rover-stranded'] }),
    P('ascent', `Ascent to ${info.name} orbit`, SIM.ASCENT, { failures: ['out-of-propellant', 'engine-failure', 'suborbital'] }),
    P('return-orbit', `${info.name} orbit rendezvous`, SIM.RENDEZVOUS),
    P('earth-transfer', 'Earth transfer injection', SIM.BURN, { failures: ['burn-short', 'wrong-window'] }),
    P('return-cruise', 'Interplanetary return cruise', SIM.CRUISE, { allowsCorrections: true }),
    P('reentry', 'Earth re-entry', SIM.ENTRY, { failures: ['skip-out', 'too-steep', 'heat-shield-failure', 'overload'] }),
    P('parachutes', 'Parachute descent', SIM.CHUTE),
    P('splashdown', 'Ocean splashdown', SIM.CHUTE),
    P('complete', 'Mission complete', SIM.NONE),
  ];
}

export const TEMPLATES = { 'lunar-orbit-rendezvous': lunarOrbitRendezvous, 'planetary-lander': planetaryLander };

/** Where the crew is. One record per crew member; a spacecraft's capacity is enforced on transfer. */
export function newCrew(count, startIn = 'cm') {
  return Array.from({ length: count }, (_, i) => ({ id: `crew-${i + 1}`, location: startIn, status: 'ok' }));
}

export class Mission {
  constructor(templateId, { arch = null, params = {}, crew = 3, capacity = { cm: 3, lm: 2 } } = {}) {
    if (!TEMPLATES[templateId]) throw new Error(`Unknown mission template ${templateId}`);
    this.template = templateId;
    this.phases = TEMPLATES[templateId](params);
    this.index = 0;
    this.arch = arch;
    this.crew = newCrew(crew, 'cm');
    this.capacity = { ...capacity };
    this.flags = { validationNotFailed: true, upperStageRestart: true, ascentStageSeparated: false, serviceModuleSeparated: false, lmJettisoned: false, dockedHardLatch: false };
    this.log = [];
    this.outcome = 'in-progress'; // in-progress | success | failed
    this.failure = null;
  }
  get phase() { return this.phases[this.index]; }
  get crewByLocation() { const m = {}; for (const c of this.crew) (m[c.location] ||= []).push(c.id); return m; }
  gatesFor(phase = this.phase) {
    return phase.gates.map((g) => ({ gate: g, ok: this.gateOk(g) }));
  }
  gateOk(g) {
    const loc = (l) => this.crew.filter((c) => c.status === 'ok').every((c) => c.location === l);
    switch (g) {
      case 'crewInCommandModule': return loc('cm');
      case 'crewInLunarModule': return this.crew.filter((c) => c.location === 'lm').length === Math.min(this.capacity.lm, this.crew.length) && this.crew.every((c) => c.location === 'lm' || c.location === 'surface' || c.location === 'cm');
      case 'lmCrewAboard': return this.crew.filter((c) => c.location === 'lm').length >= 1;
      default: return !!this.flags[g];
    }
  }
  /** Move crew between spacecraft; refuses if capacity is exceeded or the craft are not docked. */
  transfer(ids, to) {
    const targets = this.crew.filter((c) => ids.includes(c.id));
    const cap = this.capacity[to];
    if (cap != null && this.crew.filter((c) => c.location === to).length + targets.length > cap) throw new Error(`${to} has only ${cap} seats`);
    const needDock = targets.some((c) => (c.location === 'lm' && to === 'cm') || (c.location === 'cm' && to === 'lm'));
    if (needDock && !this.flags.dockedHardLatch && this.phase.id !== 'lm-sep' && this.phase.id !== 'lunar-orbit') throw new Error('Spacecraft are not docked, the crew can not transfer');
    targets.forEach((c) => { c.location = to; });
  }
  setFlag(k, v = true) { this.flags[k] = v; }
  fail(reason, details = {}) {
    this.outcome = 'failed';
    this.failure = { phase: this.phase.id, phaseName: this.phase.name, reason, ...details };
    this.log.push({ phase: this.phase.id, event: 'failed', reason, ...details });
    return this.failure;
  }
  /** Report the physical result of the current phase. `result.failure` (a failure mode id) fails the mission; otherwise advance if gates pass. */
  advance(result = {}) {
    if (this.outcome !== 'in-progress') return this.outcome;
    const ph = this.phase;
    const blocked = this.gatesFor().filter((g) => !g.ok);
    if (blocked.length) { this.fail('gate-not-met', { gates: blocked.map((b) => b.gate) }); return this.outcome; }
    if (result.failure) { this.fail(result.failure, result); return this.outcome; }
    this.log.push({ phase: ph.id, event: 'completed', ...result });
    if (this.index < this.phases.length - 1) this.index++;
    if (this.phase.id === 'complete') this.outcome = this.crew.every((c) => c.location === 'cm' && c.status === 'ok') ? 'success' : 'failed';
    if (this.outcome === 'failed' && !this.failure) this.fail('crew-not-safe');
    return this.outcome;
  }
}
