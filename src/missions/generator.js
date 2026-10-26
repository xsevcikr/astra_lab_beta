// Mission generators: build complete, executable mission definitions (event timelines) for a given vehicle.
// A mission is data only; the simulator decides what actually happens. Nothing here predicts an outcome.
import { getBody, LAUNCH_SITES, findMorningEpoch } from '../../physics/bodies.js';
import { launchAzimuth } from '../../physics/guidance.js';
import { stageOrder } from '../vehicles/analysis.js';
import { circularSpeed } from '../../physics/orbital.js';

const DEG = Math.PI / 180;
let evCounter = 0;
/** Default pitch programme: flight-path angle falls from vertical to horizontal over ~100 km altitude (verified by simulation for the sized launchers). */
export const DEFAULT_ASCENT_SCHEDULE = { hF: 100e3, n: 0.45 };
const ev = (name, condition, action, extra = {}) => ({ id: extra.id ?? `ev${++evCounter}`, name, condition, action, status: 'pending', ...extra });

/** Launch to a circular orbit and (optionally) deploy the payload. Works for any number of stages (≥1). */
export function launchMission(vehicle, opts = {}) {
  evCounter = 0;
  const body = opts.body ?? vehicle.meta?.body ?? 'earth';
  const B = getBody(body);
  const site = (typeof opts.site === 'string' ? LAUNCH_SITES.find((x) => x.id === opts.site) : opts.site) ?? LAUNCH_SITES.find((x) => x.body === body) ?? { lat: vehicle.meta?.latitude ?? 28.573, lon: -80.649, name: 'Launch site' };
  const altitude = opts.altitude ?? vehicle.meta?.targetAltitude ?? 200000;
  const incl = opts.inclination ?? Math.abs(site.lat);
  const vOrb = circularSpeed(B.mu, B.radius + altitude);
  const vRot = B.omega * B.radius * Math.cos(site.lat * DEG);
  const azimuth = opts.azimuth ?? launchAzimuth(site.lat * DEG, Math.max(incl, Math.abs(site.lat)) * DEG, vOrb, vRot) / DEG;
  const stages = stageOrder(vehicle).filter((st) => !opts.launchStages || opts.launchStages.includes(st.id));
  const hasFairing = vehicle.components.some((c) => c.group === 'fairing');
  const hasPayload = vehicle.components.some((c) => c.group === 'payload');
  const mode = opts.insertion ?? 'hohmann'; // 'direct' (closed-loop single upper-stage burn) | 'hohmann' (apoapsis cutoff + circularisation)
  const events = [];
  const first = stages[0], last = stages[stages.length - 1];
  events.push(ev(`${first.name} ignition`, { type: 'time', value: 0 }, { type: 'IGNITE', group: first.id }, { id: 'ign1' }));
  let prevSep = null;
  for (let i = 0; i < stages.length - 1; i++) {
    const s = stages[i], nxt = stages[i + 1];
    const sepId = `sep${i + 1}`;
    events.push(ev(`${s.name} burnout & separation`, { type: 'propellant', group: s.id, op: '<=', value: 0.004 }, { type: 'SEPARATE', group: s.id }, { id: sepId }));
    events.push(ev(`${nxt.name} ignition`, { type: 'event', id: sepId, delay: opts.stageDelay ?? 1.2 }, { type: 'IGNITE', group: nxt.id }, { id: `ign${i + 2}` }));
    prevSep = sepId;
  }
  if (hasFairing) events.push(ev('Fairing jettison', { type: 'all', conditions: [{ type: 'altitude', op: '>=', value: opts.fairingAlt ?? 105000 }, { type: 'dynamicPressure', op: '<=', value: 50 }] }, { type: 'SEPARATE', group: 'fairing' }, { id: 'fairing' }));
  const cut = { id: 'cutoff' };
  if (mode === 'direct') {
    events.push(ev(`${last.name} cutoff (orbit reached)`, { type: 'all', conditions: [{ type: 'periapsis', op: '>=', value: altitude * (opts.periapsisFraction ?? 0.985) }] }, { type: 'SHUTDOWN', group: last.id }, cut));
  } else {
    events.push(ev(`${last.name} cutoff (target apoapsis)`, { type: 'all', conditions: [{ type: 'event', id: `ign${stages.length}` }, { type: 'apoapsis', op: '>=', value: altitude }] }, { type: 'SHUTDOWN', group: last.id }, cut));
    events.push(ev('Circularisation burn', { type: 'all', conditions: [{ type: 'event', id: 'cutoff' }, { type: 'timeToApoapsis', op: '<=', value: 'halfBurn', burnGroup: last.id }] }, { type: 'BURN', group: last.id, direction: 'prograde', dv: 'circularize', until: { type: 'periapsis', op: '>=', value: altitude * 0.99 } }, { id: 'circ' }));
  }
  const orbitDone = mode === 'direct' ? 'cutoff' : 'circ';
  if (hasPayload && opts.deploy !== false) {
    events.push(ev('Payload deployment', { type: 'event', id: orbitDone, delay: opts.deployDelay ?? 20 }, { type: 'DEPLOY_PAYLOAD', group: 'payload' }, { id: 'deploy' }));
    events.push(ev('Deploy solar arrays & antennas', { type: 'event', id: 'deploy', delay: 5 }, { type: 'DEPLOY', target: 'all' }, { id: 'appendages' }));
    events.push(ev('Point arrays at the Sun', { type: 'event', id: 'deploy', delay: 6 }, { type: 'SET_GUIDANCE', mode: 'sun_point' }, { id: 'sunpoint' }));
  }
  return {
    name: opts.name ?? `Launch to ${(altitude / 1000).toFixed(0)} km orbit`,
    description: opts.description ?? `Ascent from ${site.name ?? 'the launch site'} to a ${(altitude / 1000).toFixed(0)} km circular orbit${hasPayload && opts.deploy !== false ? ' and payload deployment' : ''}. Goal: ${(altitude / 1000).toFixed(0)} km, accepted from ${((altitude * (1 - (opts.tolerance ?? 0.1))) / 1000).toFixed(0)} to ${((altitude * (1 + (opts.tolerance ?? 0.1))) / 1000).toFixed(0)} km.`,
    objective: { type: 'orbit', altitude, body, tolerance: opts.tolerance ?? 0.1, inclination: undefined },
    initial: { type: 'pad', lat: site.lat, lon: site.lon, altitude: 0 },
    guidance: { mode: 'ascent', params: { azimuth, kickAlt: 250, kickAngle: opts.kickAngle ?? 3.5, kickTime: 6, closedLoop: mode === 'direct', insertionAlt: opts.insertionAlt ?? 80000, targetAlt: altitude, ...((opts.schedule ?? (opts.kickAngle == null && mode === 'hohmann' ? DEFAULT_ASCENT_SCHEDULE : null)) ? { schedule: opts.schedule ?? DEFAULT_ASCENT_SCHEDULE } : {}), ...(opts.guidance ?? {}) } },
    events,
    faults: opts.faults ?? [],
    environment: { body, site: { lat: site.lat, lon: site.lon } },
    maxTime: opts.maxTime ?? 1800,
    meta: { generator: 'launchMission', insertion: mode, azimuth },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Powered lunar / Mars landing from a circular parking orbit
// ---------------------------------------------------------------------------------------------------------------
export function landerMission(vehicle, opts = {}) {
  evCounter = 0;
  const body = opts.body ?? vehicle.meta?.body ?? 'moon';
  const B = getBody(body);
  const orbitAlt = opts.orbitAltitude ?? (body === 'moon' ? 100000 : 150000);
  const periAlt = opts.periapsis ?? (body === 'moon' ? 15000 : 40000);
  const r1 = B.radius + orbitAlt, r2 = B.radius + periAlt;
  const dvDeorbit = circularSpeed(B.mu, r1) * (1 - Math.sqrt((2 * r2) / (r1 + r2)));
  const group = vehicle.stages?.[0]?.id ?? 'lander';
  const hasLegs = vehicle.components.some((c) => c.kind === 'landing_legs');
  const hasRover = vehicle.components.some((c) => c.group === 'rover');
  const events = [
    ev('Deorbit burn', { type: 'time', value: opts.deorbitTime ?? 60 }, { type: 'BURN', group, direction: 'retrograde', dv: dvDeorbit, throttle: 1 }, { id: 'deorbit' }),
    ev('Arm powered descent guidance', { type: 'event', id: 'deorbit', delay: 2 }, { type: 'LAND', group, params: { safetyMargin: opts.safetyMargin ?? 0.85, touchdownSpeed: opts.touchdownSpeed ?? 1.0 } }, { id: 'land' }),
  ];
  if (hasLegs) events.push(ev('Deploy landing legs', { type: 'all', conditions: [{ type: 'event', id: 'land' }, { type: 'radarAltitude', op: '<=', value: 4000 }] }, { type: 'DEPLOY', target: 'landing_legs' }, { id: 'legs' }));
  events.push(ev('Deploy solar panels & antennas', { type: 'landed' }, { type: 'DEPLOY', target: 'all' }, { id: 'deployApp' }));
  if (hasRover) events.push(ev('Deploy rover', { type: 'event', id: 'deployApp', delay: opts.roverDelay ?? 120 }, { type: 'DEPLOY_ROVER', group: 'rover' }, { id: 'rover' }));
  return {
    name: opts.name ?? `${B.name} powered landing`,
    description: `Deorbit from a ${(orbitAlt / 1000).toFixed(0)} km circular orbit and land under closed-loop powered-descent guidance.`,
    objective: { type: 'landing', body },
    initial: { type: 'orbit', altitude: orbitAlt, inclination: opts.inclination ?? 0, u: opts.u ?? 0, attitude: 'retrograde' },
    guidance: { mode: 'retrograde', params: {} },
    events, faults: opts.faults ?? [],
    environment: { body, terrainSeed: opts.terrainSeed ?? 1, terrain: { roughness: opts.roughness } },
    maxTime: opts.maxTime ?? 14000,
    meta: { generator: 'landerMission', dvDeorbit },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Rover traverse on the surface
// ---------------------------------------------------------------------------------------------------------------
export function roverMission(vehicle, opts = {}) {
  evCounter = 0;
  const body = opts.body ?? vehicle.meta?.body ?? 'moon';
  const distance = opts.distance ?? 200;
  const legs = opts.legs ?? [{ heading: opts.heading ?? 90, distance }];
  const speed = opts.speed ?? 0.5;
  const events = [
    ev('Deploy solar panel & antenna', { type: 'time', value: 1 }, { type: 'DEPLOY', target: 'all' }, { id: 'deploy' }),
    ev('Panoramic imaging', { type: 'event', id: 'deploy', delay: 5 }, { type: 'MEASURE', instrument: 'all', duration: 60 }, { id: 'imaging' }),
  ];
  let prev = 'imaging';
  legs.forEach((l, i) => {
    events.push(ev(`Drive leg ${i + 1} (${l.distance} m @ ${l.heading}°)`, { type: 'event', id: prev, delay: 2 }, { type: 'DRIVE', heading: l.heading, distance: l.distance, speed: l.speed ?? speed }, { id: `leg${i + 1}` }));
    prev = `leg${i + 1}`;
  });
  events.push(ev('Science measurement', { type: 'event', id: prev, delay: 2 }, { type: 'MEASURE', instrument: 'all', duration: 120 }, { id: 'science' }));
  events.push(ev('Downlink data', { type: 'event', id: 'science', delay: 1 }, { type: 'TRANSMIT', duration: opts.downlink ?? 600 }, { id: 'downlink' }));
  const total = legs.reduce((s, l) => s + l.distance, 0);
  return {
    name: opts.name ?? `${getBody(body).name} rover traverse`,
    description: `Drive ${total} m across the surface, take measurements and downlink the data.`,
    objective: { type: 'traverse', distance: total * 0.98, body },
    initial: { type: 'surface', lat: opts.lat ?? 20, lon: opts.lon ?? 30, heading: legs[0].heading },
    guidance: { mode: 'none', params: {} },
    events, faults: opts.faults ?? [],
    environment: { body, terrainSeed: opts.terrainSeed ?? 1, terrain: opts.roughness != null ? { roughness: opts.roughness } : undefined, epoch: opts.epoch ?? findMorningEpoch(body, (opts.lat ?? 20) * DEG, (opts.lon ?? 30) * DEG, { lo: 12, hi: 22 }) },
    maxTime: opts.maxTime ?? Math.max(3600, (total / speed) * 3),
    meta: { generator: 'roverMission' },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Orbital manoeuvre for a spacecraft: raise the orbit with a Hohmann transfer
// ---------------------------------------------------------------------------------------------------------------
export function orbitRaiseMission(vehicle, opts = {}) {
  evCounter = 0;
  const body = opts.body ?? 'earth';
  const B = getBody(body);
  const alt1 = opts.fromAltitude ?? 300000, alt2 = opts.toAltitude ?? 800000;
  const r1 = B.radius + alt1, r2 = B.radius + alt2;
  const v1 = circularSpeed(B.mu, r1), v2 = circularSpeed(B.mu, r2);
  const dv1 = v1 * (Math.sqrt((2 * r2) / (r1 + r2)) - 1), dv2 = v2 * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  const group = vehicle.stages?.[0]?.id ?? 'main';
  return {
    name: opts.name ?? `Orbit raise ${(alt1 / 1000).toFixed(0)} → ${(alt2 / 1000).toFixed(0)} km`,
    description: 'Two-burn Hohmann transfer to a higher circular orbit.',
    objective: { type: 'orbit', altitude: alt2, body, tolerance: 0.05 },
    initial: { type: 'orbit', altitude: alt1, inclination: opts.inclination ?? 28.5 },
    guidance: { mode: 'sun_point', params: {} },
    events: [
      ev('Deploy solar arrays & antennas', { type: 'time', value: 5 }, { type: 'DEPLOY', target: 'all' }, { id: 'deploy' }),
      ev('Transfer burn 1 (raise apoapsis)', { type: 'time', value: 120 }, { type: 'BURN', group, direction: 'prograde', dv: dv1 }, { id: 'burn1' }),
      ev('Circularisation burn 2', { type: 'all', conditions: [{ type: 'event', id: 'burn1' }, { type: 'timeToApoapsis', op: '<=', value: 'halfBurn', burnGroup: group }] }, { type: 'BURN', group, direction: 'prograde', dv: 'circularize', until: { type: 'periapsis', op: '>=', value: alt2 * 0.995 } }, { id: 'burn2' }),
      ev('Point arrays at the Sun', { type: 'event', id: 'burn2', delay: 5 }, { type: 'SET_GUIDANCE', mode: 'sun_point' }, { id: 'sun' }),
    ],
    faults: opts.faults ?? [],
    environment: { body },
    maxTime: opts.maxTime ?? 30000,
    meta: { generator: 'orbitRaiseMission', dv1, dv2 },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Probe in orbit: deploy, measure, downlink (checks power, thermal and communications)
// ---------------------------------------------------------------------------------------------------------------
export function probeOperationsMission(vehicle, opts = {}) {
  evCounter = 0;
  const body = opts.body ?? 'earth';
  return {
    name: opts.name ?? 'Probe operations in orbit',
    description: 'Deploy solar arrays and antennas, point at the Sun, measure with all instruments and downlink the data.',
    objective: { type: 'survive', duration: opts.duration ?? 5400, requireComms: true },
    initial: { type: 'orbit', altitude: opts.altitude ?? 500000, inclination: opts.inclination ?? 51.6 },
    guidance: { mode: 'sun_point', params: {} },
    events: [
      ev('Deploy arrays & antennas', { type: 'time', value: 10 }, { type: 'DEPLOY', target: 'all' }, { id: 'deploy' }),
      ev('Science campaign', { type: 'event', id: 'deploy', delay: 60 }, { type: 'MEASURE', instrument: 'all', duration: 600 }, { id: 'science' }),
      ev('Downlink', { type: 'all', conditions: [{ type: 'event', id: 'science', delay: 5 }, { type: 'linkClosed', value: true }] }, { type: 'TRANSMIT', duration: 900 }, { id: 'downlink' }),
    ],
    faults: opts.faults ?? [],
    environment: { body },
    maxTime: opts.maxTime ?? 8000,
    meta: { generator: 'probeOperationsMission' },
  };
}

/** Change the target orbit altitude of an existing launch / orbit mission consistently (objective, guidance target, apoapsis cutoff, circularisation). */
export function setMissionAltitude(m, altitude) {
  if (m.objective?.altitude != null) m.objective.altitude = altitude;
  if (m.guidance?.params && 'targetAlt' in m.guidance.params) m.guidance.params.targetAlt = altitude;
  for (const e of m.events ?? []) {
    if (e.condition?.type === 'apoapsis') e.condition.value = altitude;
    if (e.action?.until?.type === 'periapsis') e.action.until.value = altitude * 0.99;
    for (const c of e.condition?.conditions ?? []) { if (c.type === 'periapsis') c.value = altitude * 0.985; if (c.type === 'apoapsis') c.value = altitude; }
  }
  return m;
}
