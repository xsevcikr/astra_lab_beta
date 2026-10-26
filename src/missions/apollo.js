// Apollo 11-style mission generator (ASTRA LAB 1.9). Like every generator in this folder the result is DATA ONLY (an event timeline);
// the simulator decides what actually happens. The timeline follows the published Apollo 11 profile; each time quoted below is a TARGET
// that the events try to meet, never an assumption about the result: the real times come out of the simulation.
//   launch -> S-IC / S-II / S-IVB -> 185 km parking orbit -> trans-lunar injection (S-IVB second burn) -> transposition and docking
//   -> coast -> lunar orbit insertion -> LM undock -> descent and landing -> surface stay -> ascent -> rendezvous and docking -> trans-Earth injection
import { getBody, LAUNCH_SITES, surfacePointInertial, sunDirection } from '../../physics/bodies.js';
import { launchAzimuth } from '../../physics/guidance.js';
import { circularSpeed, propagateKepler } from '../../physics/orbital.js';
import { Simulation } from '../../physics/simulation.js';
import { planTransLunar, solveCourseCorrection } from '../../physics/lunar-transfer.js';
import { add, scale, norm, dot } from '../../physics/vec.js';

const DEG = Math.PI / 180;
let evCounter = 0;
export const ev = (name, condition, action, extra = {}) => ({ id: extra.id ?? `ev${++evCounter}`, name, condition, action, status: 'pending', ...extra });
const engineIds = (vehicle, group) => vehicle.components.filter((c) => c.kind === 'engine' && c.group === group).map((c) => c.id);

/** Pitch programmes tried by the planner (flight-path angle against altitude; verified by simulation: see tests/apollo.test.js). */
export const APOLLO_ASCENT_SCHEDULES = [{ hF: 100e3, n: 0.6 }, { hF: 110e3, n: 0.65 }, { hF: 90e3, n: 0.55 }];

/**
 * The ascent: S-IC burn with centre-engine cutoff, S-II burn with launch-escape-tower jettison, S-IVB first burn into a 185 km parking orbit.
 * Returns {events, guidance}. Target times (Apollo 11): max-Q ~T+1:20, S-IC separation T+2:41, S-II separation T+9:00, orbit T+11:42.
 */
/** Plain-words key moments of the Apollo-style mission, by event id: [label, what happened]. Shown in the Control screen with the mission clock. */
export const APOLLO_MOMENTS = {
  ign1: ['Engines on', 'The five S-IC engines start. The Saturn V is held on the pad for a moment, then rises.'],
  sep1: ['Stage 1 separation', 'The empty S-IC falls away and the S-II takes over.'],
  les: ['Escape tower jettisoned', 'The rocket is high enough that the crew no longer needs the escape tower.'],
  sep2: ['Stage 2 separation', 'The empty S-II falls away and the S-IVB lights its engine for the first time.'],
  cutoff: ['Parking orbit', 'The S-IVB shuts down. The ship circles the Earth about 185 km up at about 28,000 km/h.'],
  tli: ['Trans-lunar injection', 'The S-IVB fires a second time and throws the ship toward the Moon.'],
  slaSep: ['Adapter panels open', 'The four panels around the lunar module fold away.'],
  transp: ['Turn-around and docking', 'The command module separates, turns around and docks nose-to-nose with the lunar module. Scripted.'],
  extract: ['Lunar module pulled out', 'The docked pair leaves the empty S-IVB behind.'],
  mcc1: ['Course correction', 'A small burn keeps the ship on its way to the Moon.'],
  loi1: ['Lunar orbit insertion', 'The service module engine slows the ship so the Moon can capture it.'],
  loi2: ['Round lunar orbit', 'A small burn makes the orbit round, about 125 km up.'],
  undock: ['Lunar module separates', 'The lunar module leaves the command module, which stays in orbit.'],
  doi: ['Descent orbit', 'A short burn lowers the lunar module toward the surface.'],
  land: ['Powered descent', 'The descent engine fires and throttles down to land.'],
  touchdown: ['Touchdown', 'The lunar module is on the Moon.'],
  sepLmd: ['Ascent stage leaves', 'The ascent stage separates from the descent stage, which stays behind.'],
  liftoff: ['Lunar liftoff', 'The small ascent engine lifts the crew cabin off the Moon.'],
  ascCut: ['Back in lunar orbit', 'The ascent engine shuts down in orbit.'],
  rdvBurn: ['Rendezvous burn', 'The ascent stage raises its orbit to meet the command module.'],
  brake: ['Braking burn', 'The ascent stage matches speed with the command module.'],
  dock: ['Docked again', 'The ascent stage docks with the command module. Scripted.'],
  sepLma: ['Ascent stage dropped', 'The crew moves over and the used ascent stage is let go.'],
  tei: ['Trans-Earth injection', 'The service module engine sends the ship home.'],
  sepSm: ['Service module dropped', 'The service module lets go. Only the command module, with its heat shield, comes home.'],
  entry: ['Entry interface', 'The command module reaches the top of the atmosphere, heat shield first, at about 11 km/s (40,000 km/h).'],
  drogue: ['Drogue parachutes', 'Two small parachutes open at about 7 km and slow the capsule.'],
  mains: ['Main parachutes', 'Three big parachutes open at about 3 km and bring the speed down to about 30 km/h.'],
  splashdown: ['Splashdown', 'The command module lands in the ocean. The crew is home.'],
};

export function apolloAscent(vehicle, opts = {}) {
  const altitude = opts.altitude ?? 185000;
  const E = [];
  const centre = engineIds(vehicle, 'stage1').find((id) => /centre engine/.test(vehicle.components.find((c) => c.id === id).name));
  E.push(ev('S-IC ignition', { type: 'time', value: 0 }, { type: 'IGNITE', group: 'stage1' }, { id: 'ign1' }));
  if (centre) E.push(ev('Centre engine cutoff (limits acceleration)', { type: 'time', value: opts.centreCutoff ?? 135 }, { type: 'SHUTDOWN', engine: centre }, { id: 'cec' }));
  E.push(ev('S-IC burnout and separation', { type: 'propellant', group: 'stage1', op: '<=', value: 0.004 }, { type: 'SEPARATE', group: 'stage1' }, { id: 'sep1' }));
  E.push(ev('S-II ignition', { type: 'event', id: 'sep1', delay: 1.2 }, { type: 'IGNITE', group: 'stage2' }, { id: 'ign2' }));
  E.push(ev('Interstage jettison', { type: 'event', id: 'ign2', delay: 26 }, { type: 'SEPARATE', group: 'int12' }, { id: 'int12' }));
  E.push(ev('Launch escape tower jettison', { type: 'event', id: 'ign2', delay: 33 }, { type: 'SEPARATE', group: 'les' }, { id: 'les' }));
  E.push(ev('S-II cutoff and separation', { type: 'propellant', group: 'stage2', op: '<=', value: 0.004 }, { type: 'SEPARATE', group: 'stage2' }, { id: 'sep2' }));
  E.push(ev('S-IVB ignition', { type: 'event', id: 'sep2', delay: 1.5 }, { type: 'IGNITE', group: 'stage3' }, { id: 'ign3' }));
  E.push(ev('S-II pitch programme', { type: 'event', id: 'sep1', delay: 0.5 }, { type: 'SET_GUIDANCE', mode: 'pitch_program', params: { table: opts.s2Table ?? [[0, 27.75], [110, 16.54], [230, 8.82], [345, 18.42]], azimuth: opts.azimuth ?? 72 } }, { id: 'steer2' }));
  E.push(ev('Closed-loop steering to orbit', { type: 'event', id: 'ign3', delay: 0.5 }, { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: altitude, azimuth: opts.azimuth ?? 72, tauH: opts.tauH ?? 60, tauV: opts.tauV ?? 20, pitchRate: opts.pitchRate ?? 2.5, holdUntilAccel: 4, minSinPitch: opts.minSinPitch ?? -0.1 } }, { id: 'steer' }));
  E.push(ev('S-IVB cutoff (parking orbit reached)', { type: 'all', conditions: [{ type: 'event', id: 'ign3' }, { type: 'periapsis', op: '>=', value: altitude * (opts.periapsisFraction ?? 0.985) }] }, { type: 'SHUTDOWN', group: 'stage3' }, { id: 'cutoff' }));
  E.push(ev('Orbital attitude hold', { type: 'event', id: 'cutoff', delay: 1 }, { type: 'SET_GUIDANCE', mode: 'hold' }, { id: 'hold' }));
  return E;
}

/** A launch-only mission: used to measure the parking orbit before the Moon trip is planned, and by the ascent tests. */
export function apolloAscentMission(vehicle, opts = {}) {
  evCounter = 0;
  const site = LAUNCH_SITES.find((x) => x.body === 'earth') ?? { lat: 28.573, lon: -80.649, name: 'Launch site' };
  const B = getBody('earth');
  const altitude = opts.altitude ?? 185000;
  const azimuth = opts.azimuth ?? 72;
  const events = apolloAscent(vehicle, { ...opts, altitude, azimuth });
  events.push(ev('End of ascent test', { type: 'event', id: 'cutoff', delay: opts.endDelay ?? 5 }, { type: 'END_MISSION', status: 'success' }, { id: 'end' }));
  return {
    name: opts.name ?? 'Apollo ascent to parking orbit',
    description: 'Saturn V-class ascent to a 185 km parking orbit.',
    objective: { type: 'orbit', altitude, body: 'earth', tolerance: 0.1 },
    initial: { type: 'pad', lat: site.lat, lon: site.lon, altitude: 0 },
    guidance: { mode: 'ascent', params: { azimuth, kickAlt: 130, kickAngle: 1, kickTime: 6, kickSpeed: 30, schedule: opts.schedule ?? APOLLO_ASCENT_SCHEDULES[0] } },
    events, faults: [],
    environment: { body: 'earth', site: { lat: site.lat, lon: site.lon } },
    maxTime: opts.maxTime ?? 1500,
    meta: { generator: 'apolloAscentMission', azimuth },
  };
}

const DAY = 86400, HOUR = 3600;
/** Pitch above the horizon against time for the lunar module's ascent (found by trial flights in the simulator, see tests/apollo.test.js). */
export const LM_ASCENT_TABLE = [[0, 90], [10, 90], [30, 55], [80, 30], [200, 10]];

/**
 * Plan the Moon trip of a Saturn V-class stack: fly the ascent for real, then choose the launch epoch and the start of the trans-lunar burn.
 * The burn point is 2 to 3 hours after orbit insertion (Apollo 11: T+2:44), the launch day is the candidate whose arrival orbit lies closest to
 * the lunar equator (the orbit plane then stays nearly fixed while the Moon turns beneath it during the surface stay).
 * Returns plain numbers; apolloMissionFromPlan() turns them into the event timeline. Throws an Error with a plain sentence when the ascent fails.
 */
export function planApolloMission(vehicle, opts = {}) {
  const parkAlt = opts.parkingAltitude ?? 185000, aimAlt = opts.aimAltitude ?? 110000;
  const m = apolloAscentMission(vehicle, { ...opts, altitude: parkAlt, endDelay: 2 });
  const sim = new Simulation({ vehicle, mission: m });
  sim.run({ budgetMs: opts.wallMs ?? 120000 });
  const bad = sim.events.filter((e) => e.kind === 'FAILURE').map((e) => e.message.split(':')[0]);
  if (!sim.finished || bad.length) throw new Error(`The rocket does not reach a ${parkAlt / 1000} km parking orbit (${bad.join(', ') || 'ran out of time'}).`);
  const y = sim.y, B = getBody('earth');
  const park = { r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]], t: sim.t };
  const burnSeconds = sim.burnTime('stage3', opts.tliDv ?? 3160);
  const plan = planTransLunar(park, { raFactor: opts.raFactor ?? 1.55, fast: true, coastMin: opts.coastMin ?? 7300, coastMax: opts.coastMax ?? 10500, days: opts.searchDays ?? 29, aimAltitude: aimAlt });
  // among the launch days that reach the Moon, take the one whose course correction (9 hours after the burn) gives an equatorial lunar orbit most cheaply:
  // the orbit plane then stays nearly fixed while the Moon turns beneath it during the surface stay
  // Apollo 11 lifted off in the morning: among the launch days whose correction costs within 3 m/s of the cheapest, take the one with the Sun highest at the pad
  const site0 = LAUNCH_SITES.find((x) => x.body === 'earth') ?? { lat: 28.573, lon: -80.649 };
  const sunAtPad = (epoch) => { const sp = surfacePointInertial('earth', site0.lat * Math.PI / 180, site0.lon * Math.PI / 180, epoch, B.radius); return Math.asin(dot(norm(sp), sunDirection('earth', epoch))) * 180 / Math.PI; };
  const options = [];
  for (const c of plan.candidates.filter((x) => x.missKm * 1000 < getBody('moon').soi * 0.4)) {
    const phi = B.omega * c.epoch, cs = Math.cos(phi), sn = Math.sin(phi);
    const rot = (a) => [cs * a[0] - sn * a[1], sn * a[0] + cs * a[1], a[2]];
    const s0 = propagateKepler(B.mu, rot(park.r), rot(park.v), c.tau);
    const v1 = add(s0.v, scale(norm(s0.v), c.dv));
    const tc = 9 * HOUR + burnSeconds / 2, sc = propagateKepler(B.mu, s0.r, v1, tc), tAbs = c.epoch + park.t + c.tau + tc;
    for (const incl of [opts.equatorialInclination ?? 1.5, 180 - (opts.equatorialInclination ?? 1.5)]) {
      const sol = solveCourseCorrection(sc.r, sc.v, tAbs, aimAlt, { inclination: incl });
      if (sol) options.push({ c, dv: sol.dvMag, incl, sun: sunAtPad(c.epoch) });
    }
  }
  const cheapest = options.reduce((m, o) => Math.min(m, o.dv), Infinity);
  const best = options.filter((o) => o.dv <= cheapest + 3).sort((x, y) => y.sun - x.sun)[0] ?? null;
  const c = best?.c ?? plan;
  if (c.missKm * 1000 > getBody('moon').soi * 0.5) throw new Error(`No launch time in the next ${opts.searchDays ?? 29} days sends this rocket to the Moon (best miss ${c.missKm.toFixed(0)} km).`);
  const tBurnStart = Math.max(park.t + 300, park.t + c.tau - burnSeconds / 2);
  return {
    parkingAltitude: parkAlt, aimAltitude: aimAlt, ascent: { azimuth: opts.azimuth ?? 72 },
    epoch: Math.round(c.epoch * 10) / 10, parkEnd: Math.round(park.t * 10) / 10, burnStart: Math.round(tBurnStart * 10) / 10, burnSeconds: Math.round(burnSeconds * 10) / 10,
    apogeeAltitude: Math.round(c.ra - B.radius), tofSeconds: Math.round(c.tof), impulsiveDv: Math.round(c.dv * 10) / 10, missKm: Math.round(c.missKm * 10) / 10,
    sunElevationAtLaunch: best ? Math.round(best.sun) : null, targetInclination: best ? best.incl : null, correctionDv: best ? Math.round(best.dv * 10) / 10 : null,
    parkingPeriKm: Math.round(sim.now.peri / 100) / 10, parkingApoKm: Math.round(sim.now.apo / 100) / 10,
    model: 'Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator.',
  };
}

/**
 * The event timeline of the whole Apollo 11-style mission for a given plan (pure: no simulation). Everything after the parking orbit is
 * written as DATA: each step names its trigger (a time, an earlier step, a measured condition) and what it does; the simulator decides what
 * really happens. Times in the comments are Apollo 11's, as targets.
 */
export function apolloMissionFromPlan(vehicle, plan, opts = {}) {
  evCounter = 100;
  const altitude = plan.parkingAltitude, azimuth = plan.ascent?.azimuth ?? 72;
  const site = LAUNCH_SITES.find((x) => x.body === 'earth') ?? { lat: 28.573, lon: -80.649 };
  const events = apolloAscent(vehicle, { ...opts, altitude, azimuth }).map((e) => ({ ...e }));
  const ID = (id) => ({ id });
  const after = (id, delay = 0) => ({ type: 'event', id, delay });
  const tBurn = plan.burnStart, aim = plan.aimAltitude;
  events.push(
    ev('Coast in the parking orbit (about 2.5 hours)', after('hold', 60), { type: 'LOG', message: 'Checking the spacecraft before the trans-lunar burn' }, ID('coast')),
    ev('Turn to the burn direction', { type: 'time', value: tBurn - 300 }, { type: 'SET_GUIDANCE', mode: 'prograde' }, ID('orientTli')),
    ev('Trans-lunar injection: S-IVB second burn', { type: 'time', value: tBurn }, { type: 'BURN', group: 'stage3', direction: 'prograde', until: { type: 'apoapsis', op: '>=', value: plan.apogeeAltitude }, throttle: 1, maxDuration: 900 }, ID('tli')),
    ev('Spacecraft adapter panels jettisoned', after('tli', 25), { type: 'SEPARATE', group: 'sla' }, ID('slaSep')),
    ev('Transposition and docking (scripted sequence)', after('slaSep', 20), { type: 'CHOREO', id: 'transposition', duration: 840 }, ID('transp')),
    ev('Lunar module extracted, third stage left behind', after('transp'), { type: 'EXTRACT_LM' }, ID('extract')),
    ev('Hold attitude', after('extract', 60), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('hold2')),
    // coast to the Moon (Apollo 11: T+2:50 to T+75:50), with two course corrections by the service module engine
    ev('Course correction 1: compute', { type: 'time', value: tBurn + plan.burnSeconds + 9 * HOUR }, { type: 'AIM_MOON', periapsis: aim, inclination: plan.targetInclination ?? undefined }, ID('aim1')),
    ev('Course correction 1: burn (service module engine)', after('aim1', 240), { type: 'COURSE_CORRECTION', group: 'sm', direction: 'planned', dv: 'planned' }, ID('mcc1')),
    ev('Hold attitude', after('mcc1', 20), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('hold3')),
    ev('Course correction 2: compute', { type: 'all', conditions: [{ type: 'primary', value: 'earth' }, { type: 'time', value: tBurn + plan.burnSeconds + plan.tofSeconds - 20 * HOUR }] }, { type: 'AIM_MOON', periapsis: aim, inclination: plan.targetInclination ?? undefined }, ID('aim2')),
    ev('Course correction 2: burn (service module engine)', after('aim2', 240), { type: 'COURSE_CORRECTION', group: 'sm', direction: 'planned', dv: 'planned' }, ID('mcc2')),
    ev('Hold attitude', after('mcc2', 20), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('hold4')),
    // lunar orbit insertion (Apollo 11: LOI-1 at T+75:50 into 111 x 315 km, LOI-2 about 4 hours later into 100 x 122 km)
    ev('Turn to brake into lunar orbit', { type: 'all', conditions: [{ type: 'primary', value: 'moon' }, { type: 'altitude', op: '<=', value: 4e6 }] }, { type: 'SET_GUIDANCE', mode: 'retrograde' }, ID('near')),
    ev('Lunar orbit insertion 1 (service module engine)', { type: 'all', conditions: [{ type: 'primary', value: 'moon' }, { type: 'timeToPeriapsis', op: '<=', value: 'halfBurnCapture', targetAltitude: 315e3, burnGroup: 'sm' }] }, { type: 'BURN', group: 'sm', direction: 'retrograde', until: { type: 'apoapsis', op: '<=', value: 315e3 }, throttle: 1, maxDuration: 900 }, ID('loi1')),
    ev('Hold attitude', after('loi1', 30), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('hold5')),
    ev('Turn to retrograde', { type: 'all', conditions: [{ type: 'event', id: 'loi1', delay: 2.5 * HOUR }, { type: 'timeToPeriapsis', op: '<=', value: 600 }] }, { type: 'SET_GUIDANCE', mode: 'retrograde' }, ID('turn2')),
    ev('Lunar orbit insertion 2 (circularise at about 100 km)', { type: 'all', conditions: [{ type: 'event', id: 'turn2' }, { type: 'timeToPeriapsis', op: '<=', halfBurnDv: 60, burnGroup: 'sm' }] }, { type: 'BURN', group: 'sm', direction: 'retrograde', until: { type: 'apoapsis', op: '<=', value: opts.lowOrbit ?? 125e3 }, throttle: 1, maxDuration: 300 }, ID('loi2')),
    ev('Hold attitude', after('loi2', 30), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('hold6')),
    // undocking and descent (Apollo 11: undock T+100:12, descent orbit insertion T+101:36, powered descent T+102:33, landing T+102:45)
    ev('Undock: the lunar module separates from the command module', { type: 'all', conditions: [{ type: 'event', id: 'loi2' }, { type: 'time', value: opts.undockTime ?? 100.2 * HOUR }] }, { type: 'UNDOCK', groups: ['sm', 'cm'] }, ID('undock')),
    ev('Lunar module station keeping', after('undock', 30), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdLm')),
    ev('Choose the moment for the descent orbit insertion (landing in the lunar morning)', after('undock', 600), { type: 'PLAN_DOI', minWait: 3600, sunElevation: opts.sunElevation ?? 8 }, ID('planDoi')),
    ev('Turn to retrograde for descent orbit insertion', { type: 'planned', key: 'doi', lead: 150 }, { type: 'SET_GUIDANCE', mode: 'retrograde' }, ID('doiTurn')),
    ev('Descent orbit insertion burn (descent engine)', { type: 'planned', key: 'doi', lead: 0 }, { type: 'BURN', group: 'lmd', direction: 'retrograde', until: { type: 'periapsis', op: '<=', value: opts.perilune ?? 15000 }, throttle: 0.5, maxDuration: 200 }, ID('doi')),
    ev('Arm powered descent guidance', after('doi', 20 * 60), { type: 'LAND', group: 'lmd', params: { safetyMargin: 0.9, touchdownSpeed: 1.0 } }, ID('land')),
    ev('Deploy landing legs', { type: 'all', conditions: [{ type: 'event', id: 'land' }, { type: 'radarAltitude', op: '<=', value: 4000 }] }, { type: 'DEPLOY', target: 'landing_legs' }, ID('legs')),
    ev('Touchdown: deploy antennas', { type: 'landed' }, { type: 'DEPLOY', target: 'all' }, ID('touchdown')),
    // surface stay (Apollo 11: 21.6 hours), then liftoff into the plane of the command module's orbit
    ev('Plan the liftoff time and direction', after('touchdown', (opts.stay ?? 19) * HOUR), { type: 'PLAN_LIFTOFF', minWait: 1200, phaseLead: 17, downrange: 7.5, ascentTime: 450 }, ID('planLift')),
    ev('Prepare the ascent stage', { type: 'planned', key: 'liftoff', lead: 90 }, { type: 'ARM_LIFTOFF' }, ID('armLift')),
    ev('Stage separation: the descent stage stays on the Moon', { type: 'planned', key: 'liftoff', lead: 4 }, { type: 'SEPARATE', group: 'lmd' }, ID('sepLmd')),
    ev('Ascent engine ignition: liftoff', { type: 'planned', key: 'liftoff', lead: 0 }, { type: 'IGNITE', group: 'lma' }, ID('liftoff')),
    ev('Ascent pitch programme', { type: 'planned', key: 'liftoff', lead: 0 }, { type: 'SET_GUIDANCE', mode: 'pitch_program', params: { table: LM_ASCENT_TABLE, fromPlan: 'liftoff' } }, ID('ascPitch')),
    ev('Closed-loop steering to orbit', after('liftoff', 60), { type: 'SET_GUIDANCE', mode: 'insertion', params: { targetAlt: 25000, tauH: 60, tauV: 20, minSinPitch: -0.1, pitchRate: 6, holdUntilAccel: 4, fromPlan: 'liftoff' } }, ID('ascSteer')),
    ev('Ascent engine cutoff: orbit reached', { type: 'all', conditions: [{ type: 'event', id: 'liftoff', delay: 30 }, { type: 'periapsis', op: '>=', value: 12000 }] }, { type: 'SHUTDOWN', group: 'lma' }, ID('ascCut')),
    ev('Hold attitude', after('ascCut', 20), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdAsc')),
    // rendezvous (Lambert transfer onboard, then a braking burn) and docking
    ev('Plan the rendezvous', after('ascCut', 90), { type: 'PLAN_RENDEZVOUS', mode: 'search', offset: 300 }, ID('planRdv')),
    ev('Turn to the rendezvous burn', { type: 'planned', key: 'rdv1', lead: 90 }, { type: 'SET_GUIDANCE', mode: 'inertial', params: { fromPlan: 'rdv1' } }, ID('rdvTurn')),
    ev('Rendezvous burn (ascent engine)', { type: 'planned', key: 'rdv1', lead: 0 }, { type: 'BURN', group: 'lma', plan: 'rdv1', throttle: 1, maxDuration: 300 }, ID('rdvBurn')),
    ev('Hold attitude', after('rdvBurn', 10), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdRdv')),
    ev('Mid-course correction: compute', { type: 'planned', key: 'rdv2', lead: 1500 }, { type: 'PLAN_RENDEZVOUS', mode: 'correct' }, ID('rdvAim')),
    ev('Mid-course correction: burn', after('rdvAim', 60), { type: 'BURN', group: 'lma', plan: 'rdvc', throttle: 1, maxDuration: 120 }, ID('rdvCorr')),
    ev('Hold attitude', after('rdvCorr', 10), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdCorr')),
    ev('Final correction: compute', { type: 'planned', key: 'rdv2', lead: 480 }, { type: 'PLAN_RENDEZVOUS', mode: 'correct' }, ID('rdvAim2')),
    ev('Final correction: burn', after('rdvAim2', 40), { type: 'BURN', group: 'lma', plan: 'rdvc', throttle: 1, maxDuration: 60 }, ID('rdvCorr2')),
    ev('Turn to brake', { type: 'planned', key: 'rdv2', lead: 180 }, { type: 'SET_GUIDANCE', mode: 'match_target' }, ID('brakeTurn')),
    ev('Braking burn', { type: 'planned', key: 'rdv2', lead: 0 }, { type: 'BURN', group: 'lma', plan: 'rdv2', throttle: 1, maxDuration: 200, until: { type: 'relativeSpeed', op: '<=', value: 0.4 } }, ID('brake')),
    ev('Hold attitude', after('brake', 10), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdBrake')),
    ev('Final approach and docking (scripted sequence)', after('brake', 60), { type: 'CHOREO', id: 'docking', duration: 300 }, ID('dockChoreo')),
    ev('Docked with the command module', after('dockChoreo'), { type: 'DOCK' }, ID('dock')),
    ev('Ascent stage jettisoned (crew and samples transferred)', after('dock', opts.lmJettisonDelay ?? 2.1 * HOUR), { type: 'SEPARATE', group: 'lma' }, ID('sepLma')),
    // trans-Earth injection (Apollo 11: LM jettison T+130:10, TEI T+135:24, entry interface T+195:03, i.e. 59.7 h home; Mission Report
    // MSC-00171). The planned trip home is the published one; the burn size then follows from the physics (Apollo 11: 1,001 m/s) and is
    // compared with the published value by src/core/mission-validation.js.
    ev('Plan the trans-Earth injection', after('sepLma', opts.teiPlanDelay ?? 4.4 * HOUR), { type: 'PLAN_TEI', group: 'sm', perigee: 45000, tofTarget: opts.teiTripHours != null ? opts.teiTripHours * HOUR : 59.9 * HOUR }, ID('planTei')),
    ev('Turn to the burn direction', { type: 'planned', key: 'tei', lead: 400 }, { type: 'SET_GUIDANCE', mode: 'prograde' }, ID('teiTurn')),
    ev('Trans-Earth injection (service module engine)', { type: 'planned', key: 'tei', lead: 0 }, { type: 'BURN', group: 'sm', plan: 'tei', throttle: 1, maxDuration: 600 }, ID('tei')),
    ev('Hold attitude', after('tei', 30), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdTei')),
    ev('Return correction 1: compute', { type: 'all', conditions: [{ type: 'event', id: 'tei', delay: 14 * HOUR }, { type: 'primary', value: 'earth' }] }, { type: 'AIM_EARTH', perigee: 45000, key: 'mcc3' }, ID('aimE1')),
    ev('Return correction 1: burn', after('aimE1', 240), { type: 'COURSE_CORRECTION', group: 'sm', plan: 'mcc3', throttle: 1, maxDuration: 300 }, ID('mccE1')),
    ev('Hold attitude', after('mccE1', 20), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdE1')),
    ev('Return correction 2: compute', after('mccE1', 20 * HOUR), { type: 'AIM_EARTH', perigee: 45000, key: 'mcc4' }, ID('aimE2')),
    ev('Return correction 2: burn', after('aimE2', 240), { type: 'COURSE_CORRECTION', group: 'sm', plan: 'mcc4', throttle: 1, maxDuration: 300 }, ID('mccE2')),
    ev('Hold attitude', after('mccE2', 20), { type: 'SET_GUIDANCE', mode: 'hold' }, ID('holdE2')),
    // the way home: service module off, heat shield first, lift-steered entry, parachutes, splashdown (Apollo 11: entry interface T+195:03, splashdown T+195:18)
    ev('Service module separation (the command module is on its own)', { type: 'all', conditions: [{ type: 'primary', value: 'earth' }, { type: 'altitude', op: '<=', value: 300000 }, { type: 'event', id: 'tei', delay: 20 * HOUR }] }, { type: 'SEPARATE', group: 'sm' }, ID('sepSm')),
    ev('Turn the heat shield forward and fly the lifting entry', after('sepSm', 1), { type: 'SET_GUIDANCE', mode: 'lifting_entry', params: { gTarget: 4 } }, ID('entryGuid')),
    ev('Entry interface (altitude 122 km): the command module comes home', { type: 'all', conditions: [{ type: 'event', id: 'sepSm' }, { type: 'altitude', op: '<=', value: 122000 }] }, { type: 'LOG', message: 'The command module reaches the top of the atmosphere on the planned path' }, ID('entry')),
    ev('Drogue parachutes open', { type: 'all', conditions: [{ type: 'event', id: 'entry' }, { type: 'altitude', op: '<=', value: 7300 }] }, { type: 'DEPLOY_PARACHUTE', id: 'drogue' }, ID('drogue')),
    ev('Main parachutes open', { type: 'all', conditions: [{ type: 'event', id: 'drogue' }, { type: 'altitude', op: '<=', value: 3000 }] }, { type: 'DEPLOY_PARACHUTE', id: 'main' }, ID('mains')),
    ev('Splashdown in the ocean', { type: 'all', conditions: [{ type: 'event', id: 'mains' }, { type: 'landed' }] }, { type: 'LOG', message: 'Splashdown: the crew is home' }, ID('splashdown')),
    ev('End of the simulated mission', after('splashdown', 30), { type: 'END_MISSION', status: 'success' }, ID('endAll')),
  );
  for (const e of events) if (e.action.type === 'BURN' || e.action.type === 'COURSE_CORRECTION') e.action.align = true;   // every Apollo burn waits (up to 90 s) until the ship points the right way
  const maxTime = Math.ceil((tBurn + plan.burnSeconds + plan.tofSeconds + 9 * DAY) / 3600) * 3600;
  return {
    name: opts.name ?? 'Apollo 11-style Moon mission',
    description: 'Saturn V-class launch, Earth parking orbit, trans-lunar injection, transposition and docking, three days to the Moon, lunar orbit, landing, ascent, rendezvous and return.',
    objective: { type: 'milestones', requires: ['cutoff', 'tli', 'extract', 'loi1', 'loi2', 'undock', 'touchdown', 'liftoff', 'ascCut', 'dock', 'tei', 'entry', 'drogue', 'mains', 'splashdown'] },
    initial: { type: 'pad', lat: site.lat, lon: site.lon, altitude: 0 },
    guidance: { mode: 'ascent', params: { azimuth, kickAlt: 130, kickAngle: 1, kickTime: 6, kickSpeed: 30, schedule: opts.schedule ?? APOLLO_ASCENT_SCHEDULES[0] } },
    events, faults: opts.faults ?? [],
    environment: { body: 'earth', site: { lat: site.lat, lon: site.lon }, epoch: plan.epoch, terrainSeed: opts.terrainSeed ?? 1 },
    maxTime,
    meta: { generator: 'apolloMission', plan },
  };
}

/**
 * The last quarter of an hour of Apollo 11 on its own (2.3): the command module alone, at the top of the atmosphere, flies the lifting entry,
 * opens its drogues and mains and splashes down. About 16 simulated minutes, so it plays in a few seconds. `gamma` is the flight-path angle
 * at 122 km (Apollo 11: -6.5 deg, the safe corridor is about -5.5 to -7.3 deg), `speed` the entry speed (Apollo 11: 11.03 km/s).
 */
export function apolloReturnMission(vehicle, opts = {}) {
  evCounter = 300;
  const R = 6371000, g = (opts.gamma ?? -6.5) * Math.PI / 180, v = opts.speed ?? 11030;
  const ID = (id) => ({ id });
  const events = [
    ev('Entry interface (altitude 122 km): the command module comes home', { type: 'time', value: 2 }, { type: 'LOG', message: 'The command module reaches the top of the atmosphere on the planned path' }, ID('entry')),
    ev('Heat shield forward, lifting entry', { type: 'time', value: 1 }, { type: 'SET_GUIDANCE', mode: 'lifting_entry', params: { gTarget: 4 } }, ID('entryGuid')),
    ev('Drogue parachutes open', { type: 'all', conditions: [{ type: 'event', id: 'entry' }, { type: 'altitude', op: '<=', value: 7300 }] }, { type: 'DEPLOY_PARACHUTE', id: 'drogue' }, ID('drogue')),
    ev('Main parachutes open', { type: 'all', conditions: [{ type: 'event', id: 'drogue' }, { type: 'altitude', op: '<=', value: 3000 }] }, { type: 'DEPLOY_PARACHUTE', id: 'main' }, ID('mains')),
    ev('Splashdown in the ocean', { type: 'all', conditions: [{ type: 'event', id: 'mains' }, { type: 'landed' }] }, { type: 'LOG', message: 'Splashdown: the crew is home' }, ID('splashdown')),
    ev('End of the simulated mission', { type: 'event', id: 'splashdown', delay: 30 }, { type: 'END_MISSION', status: 'success' }, ID('endAll')),
  ];
  return {
    name: opts.name ?? 'Apollo 11: coming home',
    description: 'The command module alone, from the top of the atmosphere to the splashdown: heat shield first, steered by its lift, then drogue and main parachutes.',
    objective: { type: 'milestones', requires: ['entry', 'drogue', 'mains', 'splashdown'] },
    initial: { type: 'state', r: [R + 122000, 0, 0], v: [v * Math.sin(g), v * Math.cos(g), 0], attitude: 'retrograde' },
    guidance: { mode: 'lifting_entry', params: { gTarget: 4 } },
    events, faults: [],
    environment: { body: 'earth', site: { lat: 0, lon: 0 }, epoch: 0 },
    maxTime: 2400,
    meta: { generator: 'apolloReturnMission' },
  };
}
