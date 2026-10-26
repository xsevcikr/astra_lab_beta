// Launch Readiness Review ("Go / No-Go poll"). Every light is derived from real checks of the current vehicle and mission:
// validateVehicle issues, analyzeVehicle (thrust-to-weight, delta-v per stage) and the presence of the required components.
// Nothing is simulated here: these are static design checks, so they say "looks fine on paper", never "will succeed".
import { validateVehicle, analyzeVehicle } from '../vehicles/analysis.js';
import { getBody } from '../../physics/bodies.js';

const f0 = (x) => Math.round(x).toLocaleString('en-US');
const GO = 'go', CAUTION = 'caution', NOGO = 'nogo', NA = 'na';

/** Rough delta-v a launcher needs to reach a circular orbit: the energy of the orbit at the surface, minus the free speed of the
 * planet's rotation, plus typical gravity / drag / steering losses (same 1,500 m/s as analysis.js ascentDvRequired). */
export function ascentDvNeeded(bodyId, altitude, latDeg = 28.5, losses = 1500) {
  const B = getBody(bodyId);
  const r = B.radius + altitude;
  const vEnergy = Math.sqrt(Math.max(0, 2 * B.mu / B.radius - B.mu / r));
  const vRot = B.omega * B.radius * Math.cos((latDeg * Math.PI) / 180);
  return vEnergy - vRot + (B.atmosphereModel?.hasAtmosphere ? losses : 0);
}

/** Rough delta-v of a straight-up (suborbital) flight to `altitude`: the energy needed to coast up there, plus an allowance for drag and
 * gravity losses. An ESTIMATE (the shape of the climb decides the real losses), so it is always shown as "about". */
export function suborbitalDvNeeded(bodyId, altitude, losses = 300) {
  const B = getBody(bodyId);
  const v = Math.sqrt(Math.max(0, 2 * B.mu * (1 / B.radius - 1 / (B.radius + altitude))));
  return v + (B.atmosphereModel?.hasAtmosphere ? losses : losses / 3);
}

/** What the mission asks of the speed budget: {kind:'orbit'|'height'|'none', dv, label}. Always an estimate. */
export function missionDvNeed(mission, vehicle, bodyId = 'earth') {
  const o = mission?.objective;
  if (!vehicle || vehicle.type !== 'rocket' || !mission) return { kind: 'none', dv: null, label: '' };
  if (o?.type === 'orbit') return { kind: 'orbit', dv: ascentDvNeeded(bodyId, o.altitude ?? 200000, Math.abs(mission.initial?.lat ?? 28.5)), label: `${f0((o.altitude ?? 0) / 1000)} km orbit` };
  if (o?.type === 'suborbital' || o?.type === 'altitude') return { kind: 'height', dv: suborbitalDvNeeded(bodyId, o.altitude ?? 100000), label: `${f0((o.altitude ?? 0) / 1000)} km height` };
  return { kind: 'none', dv: null, label: '' };
}

const gLimit = (comps) => { const g = comps.map((c) => c.maxAccelG).filter((x) => Number.isFinite(x) && x > 0 && x < 1e6); return g.length ? Math.min(...g) : null; };
const STRUCT_CODES = new Set(['EMPTY', 'DUP_ID', 'ORPHAN', 'DIAMETER_STEP', 'EXPOSED_PAYLOAD']);
const PAYLOAD_CODES = new Set(['PAYLOAD_TOO_LONG', 'PAYLOAD_TOO_BIG', 'PAYLOAD_TOO_WIDE']);

/**
 * @returns {{stations:{id,name,status,reason,learn:{component?,lesson}}[], overall:{status,text,reds,cautions}}}
 */
export function readinessReview(vehicle, mission = null, { body = null } = {}) {
  const bodyId = body ?? vehicle?.meta?.body ?? mission?.objective?.body ?? 'earth';
  if (!vehicle) return null;
  const issues = validateVehicle(vehicle, { body: bodyId });
  const comps = vehicle.components;
  const by = (codes) => issues.filter((i) => codes.has ? codes.has(i.code) : codes.includes(i.code));
  const isRocket = vehicle.type === 'rocket';
  const hasEngine = comps.some((c) => c.kind === 'engine');
  let a = null; try { if (hasEngine) a = analyzeVehicle(vehicle, { body: bodyId }); } catch { /* keep null */ }
  const st = [];
  const add = (id, name, status, reason, learn) => st.push({ id, name, status, reason, learn });

  // ---- Structures
  { const errs = issues.filter((i) => i.severity === 'error' && STRUCT_CODES.has(i.code)), warns = issues.filter((i) => STRUCT_CODES.has(i.code) && i.severity !== 'error');
    if (errs.length) add('structures', 'Structures', NOGO, errs[0].message, { component: 'structural_section', lesson: 'L8-1' });
    else if (warns.length) add('structures', 'Structures', CAUTION, warns[0].message, { component: 'structural_section', lesson: 'L8-1' });
    else if (a && isRocket && a.liftoffTWR > 2.5) add('structures', 'Structures', CAUTION, `The engines push ${a.liftoffTWR.toFixed(1)} times the weight at lift-off. ${a.liftoffTWR > 3.5 ? 'That much acceleration can break the rocket' : 'Fast acceleration in thick air can overload the structure'}. Real loads are only known after a flight.`, { component: 'structural_section', lesson: 'L8-1' });
    else if (a && isRocket && gLimit(comps) && Math.max(0, ...a.stages.map((x) => x.twrEnd).filter(Number.isFinite)) > gLimit(comps)) add('structures', 'Structures', CAUTION, `Near the end of a burn the push reaches about ${Math.max(0, ...a.stages.map((x) => x.twrEnd).filter(Number.isFinite)).toFixed(0)} g, but a part is rated for ${gLimit(comps).toFixed(0)} g.`, { component: 'structural_section', lesson: 'L8-1' });
    else add('structures', 'Structures', GO, 'The parts are connected correctly and the diameters fit together. (Real loads are only known after a flight.)', { component: 'structural_section', lesson: 'L8-1' }); }

  // ---- Propulsion
  { const learn = { component: 'engine', lesson: 'L3-2' };
    const errs = issues.filter((i) => i.severity === 'error' && ['NO_ENGINE', 'NO_FEED', 'NO_PROPELLANT_DEF', 'LOW_TWR'].includes(i.code));
    const warns = issues.filter((i) => ['MARGINAL_TWR', 'VAC_ENGINE_SL', 'STAGE_NO_ENGINE', 'TANK_UNUSED', 'BAD_PROPELLANT_PAIR'].includes(i.code));
    const launches = isRocket && mission?.guidance?.mode === 'ascent' && mission?.initial?.type === 'pad' && mission?.objective?.type === 'orbit' && a;
    let need = null, ratio = null;
    if (launches) { need = ascentDvNeeded(bodyId, mission.objective.altitude ?? 200000, Math.abs(mission.initial.lat ?? 28.5)); ratio = a.dvEstimate / need; }
    // a straight-up flight to a set height needs far less speed than an orbit (an estimate)
    const hops = !launches && isRocket && a && mission?.guidance?.mode === 'ascent' && mission?.initial?.type === 'pad' && ['suborbital', 'altitude'].includes(mission?.objective?.type);
    let hopNeed = null; if (hops) hopNeed = suborbitalDvNeeded(bodyId, mission.objective.altitude ?? 100000);
    if (!hasEngine && !['rocket', 'lander'].includes(vehicle.type)) add('propulsion', 'Propulsion', NA, 'This vehicle has no engine, so there is nothing to check here.', learn);
    else if (errs.length) add('propulsion', 'Propulsion', NOGO, errs[0].message, learn);
    else if (launches && ratio < 1) add('propulsion', 'Propulsion', NOGO, `Not enough delta-v: about ${f0(a.dvEstimate)} m/s available, about ${f0(need)} m/s needed to reach ${f0((mission.objective.altitude ?? 0) / 1000)} km.`, learn);
    else if (hops && a.dvEstimate < hopNeed) add('propulsion', 'Propulsion', NOGO, `Not enough delta-v: about ${f0(a.dvEstimate)} m/s available, about ${f0(hopNeed)} m/s needed (estimate) to reach ${f0((mission.objective.altitude ?? 0) / 1000)} km.`, learn);
    else if (warns.length) add('propulsion', 'Propulsion', CAUTION, warns[0].message, learn);
    else if (hops && a.dvEstimate < hopNeed * 1.05) add('propulsion', 'Propulsion', CAUTION, `Thin margin: about ${f0(a.dvEstimate)} m/s available for about ${f0(hopNeed)} m/s needed (estimate). Thrust-to-weight ${a.liftoffTWR.toFixed(2)}.`, learn);
    else if (hops) add('propulsion', 'Propulsion', GO, `Thrust-to-weight ${a.liftoffTWR.toFixed(2)} at lift-off; about ${f0(a.dvEstimate)} m/s of delta-v for about ${f0(hopNeed)} m/s needed (estimate).`, learn);
    else if (launches && ratio < 1.02) add('propulsion', 'Propulsion', CAUTION, `Thin margin: about ${f0(a.dvEstimate)} m/s available for about ${f0(need)} m/s needed. Thrust-to-weight ${a.liftoffTWR.toFixed(2)}.`, learn);
    else if (launches) add('propulsion', 'Propulsion', GO, `Thrust-to-weight ${a.liftoffTWR.toFixed(2)} at lift-off; about ${f0(a.dvEstimate)} m/s of delta-v for about ${f0(need)} m/s needed.`, learn);
    else add('propulsion', 'Propulsion', GO, a ? `Engines are fed and the vehicle has about ${f0(a.dvVacuum)} m/s of delta-v.` : 'Engines look fine.', learn); }

  // ---- Guidance & control
  { const learn = { component: 'avionics', lesson: 'L9-1' };
    const hasGuid = comps.some((c) => c.guidance);
    const s1 = a?.stages?.[0]?.id;
    const tvc = comps.some((c) => c.kind === 'engine' && (c.gimbal ?? 0) > 0 && (c.group === s1 || !s1)) || comps.some((c) => c.kind === 'fin' || c.kind === 'reaction_wheel');
    if (!hasGuid && (hasEngine || isRocket)) add('guidance', 'Guidance & control', NOGO, 'No guidance computer: the vehicle cannot steer itself.', learn);
    else if (!hasGuid) add('guidance', 'Guidance & control', CAUTION, 'No computer on board: the vehicle will not control its direction.', learn);
    else if (isRocket && !tvc) add('guidance', 'Guidance & control', CAUTION, 'There is a computer, but the first stage cannot steer (no swivelling engine, fins or reaction wheels).', learn);
    else add('guidance', 'Guidance & control', GO, 'A guidance computer is on board and the first stage can steer.', learn); }

  // ---- Power
  { const learn = { component: 'battery', lesson: 'L8-2' };
    const draw = comps.reduce((s, c) => s + (c.powerDraw && ['avionics', 'guidance', 'computer'].includes(c.kind) ? c.powerDraw * (c.count ?? 1) : 0), 0);
    const wh = comps.filter((c) => c.kind === 'battery').reduce((s, c) => s + (c.capacityWh ?? 0) * (c.count ?? 1), 0);
    const solar = comps.some((c) => c.kind === 'solar_panel');
    const secs = mission?.maxTime ?? 1800, need = (draw * secs) / 3600;
    const code = issues.find((i) => i.code === 'NO_POWER');
    if (code) add('power', 'Power', NOGO, code.message, learn);
    else if (draw === 0 && !wh && !solar) add('power', 'Power', vehicle.type === 'rocket' ? CAUTION : NA, 'No power source, but nothing on board needs electricity yet.', learn);
    else if (wh > 0 && need > wh) add('power', 'Power', NOGO, `The batteries hold ${f0(wh)} Wh but the computers need about ${f0(need)} Wh for the ${f0(secs / 60)}-minute mission.`, learn);
    else if (wh === 0) add('power', 'Power', CAUTION, 'Only solar panels: they make no power until they are unfolded in orbit. Add a battery for the launch.', learn);
    else if (need > 0.5 * wh) add('power', 'Power', CAUTION, `Battery margin is small: ${f0(wh)} Wh stored for about ${f0(need)} Wh needed.`, learn);
    else add('power', 'Power', GO, `Batteries hold ${f0(wh)} Wh; the flight computers need about ${f0(need)} Wh for the mission.`, learn); }

  // ---- Communications
  { const learn = { component: 'antenna', lesson: 'L8-3' };
    const ants = comps.filter((c) => c.kind === 'antenna');
    if (ants.length) add('comms', 'Communications', GO, `${ants.length === 1 ? 'An antenna is' : `${ants.length} antennas are`} on board (${ants.map((c) => c.antennaType ?? 'antenna').join(', ')}), so the flight can be tracked.`, learn);
    else add('comms', 'Communications', CAUTION, 'No antenna: the flight cannot talk to the ground. It can still fly, but it will be silent.', learn); }

  // ---- Payload
  { const learn = { component: 'payload', lesson: 'L10-2' };
    const fit = issues.filter((i) => PAYLOAD_CODES.has(i.code));
    const pl = comps.filter((c) => c.group === 'payload');
    const mass = a?.payloadMass ?? 0;
    if (fit.length) add('payload', 'Payload', NOGO, fit[0].message, learn);
    else if (!pl.length && isRocket) add('payload', 'Payload', CAUTION, 'Nothing is being carried: this is a test flight with an empty nose.', learn);
    else if (isRocket && !comps.some((c) => c.kind === 'fairing')) add('payload', 'Payload', CAUTION, 'The payload has no fairing, so wind and heat will hit it directly.', learn);
    else add('payload', 'Payload', GO, pl.length ? `${mass ? f0(mass) + ' kg payload' : 'Payload'} is ${isRocket ? 'protected inside the fairing' : 'on board'}.` : 'Nothing to check.', learn); }

  // Beginner wording: one short line per light (the long `reason` stays for Standard / Advanced).
  const PLAIN = {
    structures: { go: 'All parts fit together.', caution: 'Some parts do not fit well.', nogo: 'Parts are not joined properly.' },
    propulsion: { go: 'Enough push and fuel.', caution: 'Fuel or push is a bit low.', nogo: 'Not enough fuel or push to get there.' },
    guidance: { go: 'The rocket can steer itself.', caution: 'Steering is weak.', nogo: 'No computer to steer.' },
    power: { go: 'Enough electricity.', caution: 'Electricity is tight.', nogo: 'The batteries are too small.' },
    comms: { go: 'It can talk to Earth.', caution: 'No antenna, so it stays silent.', nogo: 'No way to talk to Earth.' },
    payload: { go: 'The payload is safe.', caution: 'The payload is not well protected.', nogo: 'The payload does not fit.' },
  };
  const SHORT = { structures: 'Body', propulsion: 'Engines', guidance: 'Steering', power: 'Power', comms: 'Radio', payload: 'Cargo' };
  for (const x of st) x.short = SHORT[x.id] ?? x.name;
  for (const x of st) x.plain = x.status === NA ? 'Nothing to check.' : (PLAIN[x.id]?.[x.status] ?? x.reason);
  const reds = st.filter((s) => s.status === NOGO), cautions = st.filter((s) => s.status === CAUTION);
  const overall = reds.length
    ? { status: NOGO, text: `NO-GO: ${reds[0].name.toLowerCase()}. ${reds[0].reason}`, reds: reds.length, cautions: cautions.length }
    : { status: GO, text: cautions.length ? `GO for launch, with ${cautions.length} caution${cautions.length > 1 ? 's' : ''} (${cautions.map((c) => c.name.toLowerCase()).join(', ')}).` : 'GO for launch.', reds: 0, cautions: cautions.length };
  overall.plain = reds.length ? `NO-GO: ${reds[0].plain}` : cautions.length ? 'GO, but check yellow lights.' : 'GO for launch!';
  st.push({ id: 'director', name: 'Flight Director', status: reds.length ? NOGO : cautions.length ? CAUTION : GO, reason: overall.text, plain: overall.plain, learn: { lesson: 'L10-3' }, overall: true, short: 'Final check' });
  return { stations: st, overall, prediction: true };
}
