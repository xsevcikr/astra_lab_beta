// Moon mission generator (ASTRA LAB 1.8): launch -> parking orbit -> trans-lunar injection -> course corrections -> lunar orbit capture ->
// service module drop -> deorbit -> powered landing (-> rover). Like every generator in this folder, the result is DATA ONLY (an event timeline);
// the simulator decides what happens. The planner only chooses WHEN to fly (launch epoch and burn start), using the real ascent trajectory
// flown once in the simulator and patched-conic maths (physics/lunar-transfer.js). The mid-course correction is computed on board from the
// true state at the time (AIM_MOON), and every burn ends on a measured condition (apoapsis, periapsis), not on a promised number.
import { Simulation } from '../../physics/simulation.js';
import { getBody } from '../../physics/bodies.js';
import { planTransLunar } from '../../physics/lunar-transfer.js';
import { launchMission } from './generator.js';

const DAY = 86400;
/** Ascent pitch programmes tried in this order until one reaches a usable parking orbit (each candidate is a real simulation). */
export const MOON_ASCENT_SCHEDULES = [{ hF: 100e3, n: 0.5 }, { hF: 120e3, n: 0.45 }, { hF: 130e3, n: 0.4 }, { hF: 100e3, n: 0.65 }, { hF: 90e3, n: 0.55 }, { hF: 150e3, n: 0.35 }];
let evCounter = 0;
const ev = (name, condition, action, extra = {}) => ({ id: extra.id ?? `m${++evCounter}`, name, condition, action, status: 'pending', ...extra });

const launchStages = (vehicle) => (vehicle.stages ?? []).filter((s) => /^stage\d+$/.test(s.id)).sort((a, b) => a.order - b.order).map((s) => s.id);

/** Fly the ascent alone (until the parking orbit is circularised) and return the simulation, ready to be read. */
export function flyMoonAscent(vehicle, { schedule, altitude = 185000, wallMs = 120000, site } = {}) {
  const stages = launchStages(vehicle);
  const m = launchMission(vehicle, { altitude, insertion: 'hohmann', launchStages: stages, deploy: false, schedule, maxTime: 4000, site });
  const circ = m.events.find((e) => e.id === 'circ');
  m.events.push({ id: 'ascentEnd', name: 'End of ascent run', condition: { type: 'event', id: circ.id, delay: 5 }, action: { type: 'END_MISSION', status: 'success' }, status: 'pending' });
  m.objective = { type: 'survive', duration: 1e9 };
  const sim = new Simulation({ vehicle, mission: m });
  sim.run({ budgetMs: wallMs });
  return { sim, mission: m };
}

/** Parking orbit reached by an ascent run, or null when the ascent failed. */
function parkingOf(sim, altitude) {
  if (!sim.finished || sim.t < 100 || sim.events.some((e) => e.kind === 'FAILURE' && !/Incorrect orbit|Insufficient delta-v/.test(e.message))) return null;
  const y = sim.y, B = getBody('earth');
  const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]];
  const rm = Math.hypot(...r), vm = Math.hypot(...v);
  const energy = (vm * vm) / 2 - B.mu / rm;
  const a = -B.mu / (2 * energy);
  if (!(energy < 0) || a * 2 - rm - B.radius < 0) return null;
  const el = sim._elements();
  if (el.rp - B.radius < altitude * 0.9) return null;
  return { r, v, t: sim.t, peri: el.rp - B.radius, apo: el.ra - B.radius };
}

/**
 * Plan a Moon mission: fly the ascent for real, then choose the launch epoch and the burn start. Returns plain numbers (the "plan"),
 * which moonMissionFromPlan() turns into the event timeline. Plans can be stored (the ready-made rockets store theirs, so that loading is instant).
 * Throws an Error with a plain sentence when the vehicle cannot reach a parking orbit (nothing is invented).
 */
export function planMoonMission(vehicle, opts = {}) {
  const parkAlt = opts.parkingAltitude ?? 185000, aimAlt = opts.aimAltitude ?? 110000;
  const stages = launchStages(vehicle);
  if (stages.length < 2) throw new Error('A Moon rocket needs at least two launch stages (stage1, stage2, ...).');
  const lastStage = stages[stages.length - 1];
  if (!vehicle.components.some((c) => c.group === 'orbiter') || !vehicle.components.some((c) => c.group === 'lander')) throw new Error('The Moon ship needs a service module and a lander under the fairing (use ADD_PAYLOAD with both).');

  // 1. fly the ascent for real (the schedule is a free trajectory parameter: candidates are flown until one works)
  let asc = opts.ascent ?? null; const tried = [];
  if (!asc) {
    for (const schedule of opts.schedule ? [opts.schedule] : MOON_ASCENT_SCHEDULES) {
      const r = flyMoonAscent(vehicle, { schedule, altitude: parkAlt });
      const park = parkingOf(r.sim, parkAlt);
      tried.push({ schedule, ok: !!park, reason: r.sim.events.filter((e) => e.kind === 'FAILURE').map((e) => e.message.split(':')[0]).join(', ') || 'no usable parking orbit' });
      if (park) { asc = { ...r, park, schedule }; break; }
    }
    if (!asc) throw new Error(`The rocket does not reach a ${parkAlt / 1000} km parking orbit (${[...new Set(tried.map((t) => t.reason))].join('; ')}). Add propellant or engines to the stages and try again.`);
  }
  const { sim: aSim, park, schedule } = asc;

  // 2. the trans-lunar burn: how long does it last, and when does it have to start?
  const burnSeconds = aSim.burnTime(lastStage, 3150);
  const plan = planTransLunar(park, { aimAltitude: aimAlt, days: opts.searchDays ?? 29 });
  if (plan.miss > getBody('moon').soi * 0.5) throw new Error(`No launch time in the next ${opts.searchDays ?? 29} days sends this rocket to the Moon (best miss ${plan.missKm.toFixed(0)} km).`);
  const tBurnCentre = park.t + plan.tau;
  const tBurnStart = Math.max(park.t + 300, tBurnCentre - burnSeconds / 2);
  return {
    schedule, parkingAltitude: parkAlt, aimAltitude: aimAlt,
    epoch: Math.round(plan.epoch * 10) / 10, parkEnd: Math.round(park.t * 10) / 10, burnStart: Math.round(tBurnStart * 10) / 10, burnSeconds: Math.round(burnSeconds * 10) / 10,
    apogeeAltitude: Math.round(plan.ra - getBody('earth').radius), tofSeconds: Math.round(plan.tof), impulsiveDv: Math.round(plan.dv * 10) / 10,
    missKm: Math.round(plan.missKm * 10) / 10, parkingPeriKm: Math.round(park.peri / 100) / 10, parkingApoKm: Math.round(park.apo / 100) / 10,
    model: 'Patched conics (Earth, then Moon) for the plan; the flight itself is integrated by the simulator.',
  };
}

/** The event timeline of a Moon mission for a given plan (pure: no simulation). opts: {name, lowOrbit (lunar orbit altitude the capture burn stops at), roverDelay, deorbitDelay, faults}. */
export function moonMissionFromPlan(vehicle, plan, opts = {}) {
  evCounter = 0;
  const lowOrbit = opts.lowOrbit ?? 150000, aimAlt = plan.aimAltitude;
  const stages = launchStages(vehicle);
  const tliStage = stages[stages.length - 1];
  const hasRover = vehicle.components.some((c) => c.group === 'rover');
  const hasLegs = vehicle.components.some((c) => c.kind === 'landing_legs');
  const tBurnStart = plan.burnStart, tTliDone = tBurnStart + plan.burnSeconds;
  const base = launchMission(vehicle, { altitude: plan.parkingAltitude, insertion: 'hohmann', launchStages: stages, deploy: false, schedule: plan.schedule });
  const events = base.events.map((e) => ({ ...e }));
  evCounter = 100;
  events.push(
    ev('Deploy service-module solar arrays, radiators and antennas', { type: 'event', id: 'circ', delay: 30 }, { type: 'DEPLOY', target: 'orbiter' }, { id: 'arrays' }),
    ev('Hold attitude (the arrays track the Sun on their own gimbals)', { type: 'event', id: 'arrays', delay: 5 }, { type: 'SET_GUIDANCE', mode: 'hold' }, { id: 'sun1' }),
    ev('Turn to the burn direction', { type: 'time', value: Math.max(tBurnStart - 240, plan.parkEnd + 120) }, { type: 'SET_GUIDANCE', mode: 'prograde' }, { id: 'orientTli' }),
    ev('Trans-lunar injection burn (third stage)', { type: 'time', value: tBurnStart }, { type: 'BURN', group: tliStage, direction: 'prograde', until: { type: 'apoapsis', op: '>=', value: plan.apogeeAltitude }, throttle: 1, maxDuration: 1800 }, { id: 'tli' }),
    ev('Third stage separation', { type: 'event', id: 'tli', delay: 60 }, { type: 'SEPARATE', group: tliStage }, { id: 'sepS3' }),
    ev('Hold attitude', { type: 'event', id: 'sepS3', delay: 20 }, { type: 'SET_GUIDANCE', mode: 'hold' }, { id: 'sun2' }),
    ev('Course correction 1: compute', { type: 'time', value: tTliDone + 10 * 3600 }, { type: 'AIM_MOON', periapsis: aimAlt }, { id: 'aim1' }),
    ev('Course correction 1: burn', { type: 'event', id: 'aim1', delay: 240 }, { type: 'COURSE_CORRECTION', group: 'orbiter', direction: 'planned', dv: 'planned' }, { id: 'mcc1' }),
    ev('Hold attitude', { type: 'event', id: 'mcc1', delay: 20 }, { type: 'SET_GUIDANCE', mode: 'hold' }, { id: 'sun3' }),
    ev('Course correction 2: compute', { type: 'all', conditions: [{ type: 'primary', value: 'earth' }, { type: 'time', value: tTliDone + Math.max(plan.tofSeconds - 1.4 * DAY, 20 * 3600) }] }, { type: 'AIM_MOON', periapsis: aimAlt }, { id: 'aim2' }),
    ev('Course correction 2: burn', { type: 'event', id: 'aim2', delay: 240 }, { type: 'COURSE_CORRECTION', group: 'orbiter', direction: 'planned', dv: 'planned' }, { id: 'mcc2' }),
    ev('Hold attitude', { type: 'event', id: 'mcc2', delay: 20 }, { type: 'SET_GUIDANCE', mode: 'hold' }, { id: 'sun4' }),
    ev('Turn to brake into lunar orbit', { type: 'all', conditions: [{ type: 'primary', value: 'moon' }, { type: 'altitude', op: '<=', value: 6e6 }] }, { type: 'SET_GUIDANCE', mode: 'retrograde' }, { id: 'near' }),
    ev('Lunar orbit insertion burn', { type: 'all', conditions: [{ type: 'primary', value: 'moon' }, { type: 'timeToPeriapsis', op: '<=', value: 'halfBurnCapture', burnGroup: 'orbiter' }] }, { type: 'BURN', group: 'orbiter', direction: 'retrograde', until: { type: 'apoapsis', op: '<=', value: lowOrbit }, throttle: 1, maxDuration: 1800 }, { id: 'loi' }),
    ev('Deorbit burn (service module engine)', { type: 'event', id: 'loi', delay: opts.deorbitDelay ?? 900 }, { type: 'BURN', group: 'orbiter', direction: 'retrograde', until: { type: 'periapsis', op: '<=', value: 15000 }, throttle: 1, maxDuration: 900 }, { id: 'deorbit' }),
    ev('Service module separation', { type: 'all', conditions: [{ type: 'event', id: 'deorbit' }, { type: 'radarAltitude', op: '<=', value: 60000 }] }, { type: 'SEPARATE', group: 'orbiter' }, { id: 'sepSM' }),
    ev('Deploy lander solar panels', { type: 'event', id: 'sepSM', delay: 5 }, { type: 'DEPLOY', target: 'solar_panel' }, { id: 'landerArrays' }),
    ev('Arm powered descent guidance', { type: 'event', id: 'sepSM', delay: 3 }, { type: 'LAND', group: 'lander', params: { safetyMargin: 0.85, touchdownSpeed: 1.0 } }, { id: 'land' }),
  );
  if (hasLegs) events.push(ev('Deploy landing legs', { type: 'all', conditions: [{ type: 'event', id: 'land' }, { type: 'radarAltitude', op: '<=', value: 4000 }] }, { type: 'DEPLOY', target: 'landing_legs' }, { id: 'legs' }));
  events.push(ev('Deploy antennas after landing', { type: 'landed' }, { type: 'DEPLOY', target: 'all' }, { id: 'deployApp' }));
  if (hasRover) events.push(ev('Deploy rover', { type: 'event', id: 'deployApp', delay: opts.roverDelay ?? 120 }, { type: 'DEPLOY_ROVER', group: 'rover' }, { id: 'rover' }));

  const maxTime = Math.ceil((tTliDone + plan.tofSeconds + 1.2 * DAY) / 3600) * 3600;
  return {
    name: opts.name ?? 'Moon landing mission',
    description: `Launch, park in a ${(plan.parkingAltitude / 1000).toFixed(0)} km orbit, fire the third stage towards the Moon (launch epoch day ${(plan.epoch / DAY).toFixed(2)}), correct the course twice, brake into lunar orbit, drop the service module and land${hasRover ? ' and deploy the rover' : ''}. Goal: a soft landing on the Moon.`,
    objective: { type: 'landing', body: 'moon' },
    initial: { type: 'pad', lat: base.initial.lat, lon: base.initial.lon, altitude: 0 },
    guidance: base.guidance,
    events, faults: opts.faults ?? [],
    environment: { body: 'earth', site: base.environment.site, epoch: plan.epoch, terrainSeed: opts.terrainSeed ?? 1 },
    maxTime,
    meta: { generator: 'moonMission', plan },
  };
}

/** Plan and build the Moon mission for a vehicle in one go (flies the ascent once: about 4 s on a desktop computer). */
export function moonMission(vehicle, opts = {}) {
  return moonMissionFromPlan(vehicle, planMoonMission(vehicle, opts), opts);
}
