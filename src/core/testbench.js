// Test bench (2.0): one click flies a ready-made rocket, probe, lander or rover in the REAL simulator and answers "will it work?"
// with a clear PASS / FAIL and one plain sentence why. Each example runs in its own throw-away session, so the user's project is
// never touched. The "broken" examples are real templates with one honest change (too much payload, too little fuel ...), so
// students can see what failure looks like and why.
import { AiSession } from '../../ai/session.js';
import { MemoryStorage } from './storage.js';
import { runMetrics } from './run-analysis.js';
import { describeFlight, plainCause, flightWinText } from './makeitfly.js';
import { TEMPLATE_BY_ID } from '../../data/templates.js';

const TANKS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];
const n0 = (x) => Math.round(x).toLocaleString('en-US');
const scaleFuel = (v, f, group = null) => { for (const c of v.components) if (TANKS.includes(c.kind) && (!group || c.group === group)) c.propellantMass = Math.max(1, (c.propellantMass ?? 0) * f); return v; };

/** Did the recorded flight meet the example's goal? Numbers come from the recorded telemetry only. */
export function meetsClaim(claim, m, status) {
  if (status !== 'SUCCESS') return false;
  switch (claim?.kind) {
    case 'altitude': return m.maxAlt >= claim.minKm * 1000;
    case 'orbit': return m.finalPeri >= (claim.km - 25) * 1000 && m.finalApo <= (claim.km + 25) * 1000;
    case 'traverse': return m.distanceDriven >= claim.meters * 0.97;
    case 'landing': return Number.isFinite(m.touchdownVertical) && m.touchdownVertical <= 5;
    default: return true;
  }
}
const goalText = (claim) => ({ altitude: `fly higher than ${claim?.minKm} km`, orbit: `reach a ${claim?.km} km orbit`, traverse: `drive ${claim?.meters} m`, landing: 'land softly', survive: 'work in space for the whole mission' })[claim?.kind] ?? 'reach its goal';

// kind: rocket | probe | lander | rover. expect: what the real flight shows (tests/testbench.test.js checks it).
export const EXAMPLES = [
  { id: 'sounding-rocket', template: 'sounding-rocket', kind: 'rocket', expect: 'pass' },
  { id: 'small-launcher', template: 'small-launcher', kind: 'rocket', expect: 'pass' },
  { id: 'medium-launcher', template: 'medium-launcher', kind: 'rocket', expect: 'pass' },
  { id: 'satellite', template: 'satellite', kind: 'probe', expect: 'pass' },
  { id: 'space-probe', template: 'space-probe', kind: 'probe', expect: 'pass' },
  { id: 'moon-lander', template: 'moon-lander', kind: 'lander', expect: 'pass' },
  { id: 'lander-with-rover', template: 'lander-with-rover', kind: 'lander', expect: 'pass' },
  { id: 'rover', template: 'rover', kind: 'rover', expect: 'pass' },
  { id: 'heavy-launcher', template: 'small-launcher', kind: 'rocket', expect: 'fail', title: 'Overloaded launcher', blurb: 'The small launcher with a 900 kg payload instead of 100 kg.',
    change: 'Payload 900 kg instead of 100 kg', edit: (v) => { for (const c of v.components) if (c.kind === 'payload' || c.group === 'payload') c.mass = c.kind === 'payload' ? 900 : c.mass; } },
  { id: 'thirsty-launcher', template: 'small-launcher', kind: 'rocket', expect: 'fail', title: 'Half-fuelled launcher', blurb: 'The small launcher with only half the fuel in its second stage.',
    change: 'Second stage: half the fuel', edit: (v) => scaleFuel(v, 0.5, 'stage2') },
  { id: 'dry-lander', template: 'moon-lander', kind: 'lander', expect: 'fail', title: 'Lander low on fuel', blurb: 'The Moon lander with a third of its fuel.',
    change: 'A third of the fuel', edit: (v) => scaleFuel(v, 0.33) },
];
export const exampleById = (id) => EXAMPLES.find((e) => e.id === id) ?? null;

/** {vehicle, mission} for an example (pure). */
export function makeExample(id) {
  const E = exampleById(id), T = TEMPLATE_BY_ID[E?.template];
  if (!T) throw new Error(`Unknown example ${id}`);
  const { vehicle, mission } = T.make();
  if (E.edit) { E.edit(vehicle); vehicle.name = `${vehicle.name} (${E.change.toLowerCase()})`; }
  return { vehicle, mission, E, T };
}
export function exampleCard(id) {
  const E = exampleById(id), T = TEMPLATE_BY_ID[E.template];
  return { id, kind: E.kind, title: E.title ?? T.title, blurb: E.blurb ?? T.blurb, goal: goalText(T.claim), change: E.change ?? null, broken: !!E.edit, difficulty: T.difficulty };
}

/**
 * Turn a recorded flight into a verdict. Returns {pass, headline, reason, facts:[[label, value]], status, metrics}.
 * `claim` is the goal; without one, a SUCCESS status is the goal.
 */
export function verdictOf(record, tel, vehicle, mission, claim) {
  const status = record.result?.status;
  let m = {}; try { m = runMetrics(record, tel); } catch { /* keep empty */ }
  const info = describeFlight(record, tel, vehicle, mission);
  const pass = meetsClaim(claim, m, status);
  const facts = [];
  if (Number.isFinite(m.maxAlt) && m.maxAlt > 500 && claim?.kind !== 'traverse') facts.push(['Highest point', `${n0(m.maxAlt / 1000)} km`]);
  if (Number.isFinite(m.maxSpeed)) facts.push(['Top speed', `${n0(m.maxSpeed)} m/s`]);
  if (claim?.kind === 'orbit' && Number.isFinite(m.finalPeri) && m.finalPeri > 0) facts.push(['Orbit', `${n0(m.finalPeri / 1000)} × ${n0(m.finalApo / 1000)} km`]);
  if (Number.isFinite(m.touchdownVertical)) facts.push([m.touchdownVertical <= 5 ? 'Touchdown speed' : 'Hit the ground at', `${m.touchdownVertical.toFixed(1)} m/s`]);
  if (Number.isFinite(m.distanceDriven) && m.distanceDriven > 0) facts.push(['Distance driven', `${n0(m.distanceDriven)} m`]);
  if (Number.isFinite(record.result?.endTime)) facts.push(['Flight time', record.result.endTime >= 3600 ? `${(record.result.endTime / 3600).toFixed(1)} h` : `${n0(record.result.endTime)} s`]);
  let reason;
  if (pass) {
    reason = claim?.kind === 'landing' ? `It touched down at ${m.touchdownVertical.toFixed(1)} m/s, gentle enough to land.`
      : claim?.kind === 'traverse' ? `It drove ${n0(m.distanceDriven)} m without running out of power.`
      : claim?.kind === 'survive' ? 'Power, heat and radio stayed inside their limits for the whole mission.' : flightWinText(info);
  } else if (status === 'SUCCESS') reason = `The flight ended without a failure but did not ${goalText(claim)}.`;
  else if (claim?.kind === 'landing' && Number.isFinite(m.touchdownVertical) && m.touchdownVertical > 5) reason = `It hit the ground at ${n0(m.touchdownVertical)} m/s. A soft landing needs less than about 3 m/s, so it needs more fuel to slow down.`;
  else reason = info.cause ?? plainCause(info);
  return { pass, status, headline: pass ? 'PASS: it works' : 'FAIL: it does not work', reason, why: record.result?.reason ?? '', facts, metrics: m, kind: info.kind };
}

/** Fly an example (or {vehicle, mission, claim}) in a throw-away session. opts.name. */
export async function testDesign({ vehicle, mission, claim }, opts = {}) {
  const S = new AiSession({ storage: new MemoryStorage() });
  S.project.setVehicle(JSON.parse(JSON.stringify(vehicle)), { activate: true });
  if (mission) { const mm = JSON.parse(JSON.stringify(mission)); mm.vehicleName = vehicle.name; S.project.setMission(mm, { activate: true }); }
  const r = await S.api.execute('RUN_SIMULATION', { name: opts.name ?? 'Test bench' });
  if (!r.ok) return { pass: false, status: 'NOT_RUN', headline: 'FAIL: it cannot fly yet', reason: r.message, facts: [], metrics: {} };
  const { record, telemetry } = await S.api.getRun(r.data.runId);
  return verdictOf(record, telemetry, vehicle, mission, claim);
}
export async function testExample(id) {
  const { vehicle, mission, T } = makeExample(id);
  return testDesign({ vehicle, mission, claim: T.claim }, { name: id });
}
