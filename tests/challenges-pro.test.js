// Pro challenges: scoring with fabricated runs (exact tier edges), design-budget scoring with real analysis, honest unavailability and real simulated runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { engineStage } from './helpers.js';
import { CHALLENGES, PRO_CHALLENGES, ALL_CHALLENGES, UNAVAILABLE, DIFFICULTY_NAMES, challengeById, setupChallenge, evaluate, evaluateDesign, marsTransferBudget, payloadOf, engineCostOf, vehicleProblem, proStars } from '../src/core/challenges.js';
import { findLesson } from '../data/academy/index.js';

const orbitRec = (ch, extra = {}, vehicle = { meta: { payloadMass: 600 } }) => ({ mission: { objective: { type: 'orbit', altitude: ch.setup.altitude }, initial: { lat: ch.setup.site === 'polar' ? 65 : 28.57 } }, vehicle, result: { status: 'SUCCESS', summary: { separations: [] }, ...extra } });
const landRec = (extra = {}) => ({ mission: { objective: { type: 'landing', body: 'moon' } }, vehicle: { type: 'lander' }, result: { status: 'SUCCESS', ...extra } });

test('library: 8 pro challenges, tiers named, sorted easy to pro, lessons exist, 3 stars reachable', () => {
  assert.equal(PRO_CHALLENGES.length, 8); assert.equal(CHALLENGES.length, 16); assert.deepEqual(DIFFICULTY_NAMES, ['', 'Easy', 'Medium', 'Hard', 'Pro']);
  const d = ALL_CHALLENGES.map((c) => c.difficulty); assert.deepEqual(d, [...d].sort((a, b) => a - b)); assert.ok(d.includes(4) && d.includes(3));
  assert.equal(new Set(ALL_CHALLENGES.map((c) => c.id)).size, ALL_CHALLENGES.length);
  for (const c of PRO_CHALLENGES) { assert.ok(findLesson(c.lesson), c.id); assert.ok(c.hint.length < 120 && c.story && c.title); for (const t of [1, 2, 3]) assert.ok(c.goals.some((g) => g.tier === t), `${c.id} tier ${t}`); }
  assert.equal(proStars({ 'max-payload': { stars: 2 }, 'cheap-orbit': { stars: 3 }, 'reach-orbit': { stars: 3 } }), 5);
  assert.ok(UNAVAILABLE.some((u) => /booster/i.test(u.title)) && UNAVAILABLE.every((u) => u.why.length > 20), 'unavailable items explain why');
  assert.match(challengeById('mars-transfer-budget').story, /does not land on Mars/);
});

test('moon landing: tier edges from fabricated runs', () => {
  const ch = challengeById('moon-soft-landing');
  const run = (v, h = 0.2, left = 0.2) => evaluate(ch, landRec(), null, { touchdownVertical: v, touchdownHorizontal: h, initialPropellant: 100, finalPropellant: 100 * left });
  assert.equal(run(4.9).stars, 1); assert.equal(run(5.1).stars, 0); assert.equal(run(4.9, 2).stars, 0, 'too much sideways speed');
  assert.equal(run(2.4).stars, 2); assert.equal(run(0.9, 0.2, 0.04).stars, 2, 'needs 5% fuel for 3'); assert.equal(run(0.9, 0.2, 0.06).stars, 3);
  assert.equal(evaluate(ch, landRec({ status: 'FAILURE' }), null, { touchdownVertical: 1, touchdownHorizontal: 0, initialPropellant: 1, finalPropellant: 1 }).stars, 0, 'a crash does not count');
  assert.equal(evaluate(ch, orbitRec(challengeById('reach-orbit')), null, {}).valid, false, 'an orbit run is not a landing');
  assert.match(vehicleProblem(ch, { type: 'rocket' }), /lander/); assert.equal(vehicleProblem(ch, { type: 'lander' }), '');
});

test('orbit-shape pro challenges: tier edges', () => {
  const inc = challengeById('inclined-orbit'), pre = challengeById('precision-orbit');
  const ev = (ch, m, extra) => evaluate(ch, orbitRec(ch, extra), null, m);
  assert.equal(ev(inc, { finalIncl: 66.9, finalEcc: 0.01 }).stars, 1); assert.equal(ev(inc, { finalIncl: 67.1, finalEcc: 0.01 }).stars, 0);
  assert.equal(ev(inc, { finalIncl: 65.4, finalEcc: 0.01 }).stars, 2); assert.equal(ev(inc, { finalIncl: 65.4, finalEcc: 0.001 }).stars, 3);
  assert.equal(evaluate(inc, orbitRec(inc, {}), null, { finalIncl: 65 }).valid, true);
  const wrongSite = orbitRec(inc); wrongSite.mission.initial.lat = 28.5; assert.equal(evaluate(inc, wrongSite, null, {}).valid, false);
  assert.equal(ev(pre, { finalPeri: 543e3, finalApo: 557e3, lastStageReserveFrac: 0.1 }).stars, 1);
  assert.equal(ev(pre, { finalPeri: 546e3, finalApo: 554e3, lastStageReserveFrac: 0.1 }).stars, 2);
  assert.equal(ev(pre, { finalPeri: 549.5e3, finalApo: 550.5e3, lastStageReserveFrac: 0.04 }).stars, 2);
  assert.equal(ev(pre, { finalPeri: 549.5e3, finalApo: 550.5e3, lastStageReserveFrac: 0.06 }).stars, 3);
  assert.equal(ev(pre, { finalPeri: 549.5e3, finalApo: 550.5e3, lastStageReserveFrac: 0.06 }, { status: 'FAILURE' }).stars, 0);
});

test('payload and mass challenges use the real payload of the flown design', () => {
  const veh = (payload, cost) => ({ meta: { payloadMass: payload }, components: [{ kind: 'engine', cost, count: 1, mass: 10, thrustVac: 1, ispVac: 300, ispSl: 280, group: 'stage1' }] });
  assert.equal(payloadOf({ vehicle: { meta: { payloadMass: 123 } } }), 123); assert.equal(engineCostOf({ vehicle: veh(1, 5e6) }), 5e6); assert.ok(Number.isNaN(engineCostOf({ vehicle: { meta: {} } })));
  const cheap = challengeById('cheap-orbit'), mx = challengeById('max-payload'), mm = challengeById('min-mass-orbit');
  const ev = (ch, v, m) => evaluate(ch, orbitRec(ch, {}, v), null, m);
  assert.equal(ev(cheap, veh(250, 9e6), {}).stars, 1);                 // $36,000 per kg
  assert.equal(ev(cheap, veh(250, 6e6), {}).stars, 2);                 // $24,000
  assert.equal(ev(cheap, veh(400, 5e6), {}).stars, 3);                 // $12,500
  assert.equal(ev(cheap, veh(150, 1e5), {}).stars, 0, 'under 200 kg is not enough');
  assert.equal(ev(mx, veh(300, 1), { initialMass: 25000 }).stars, 1); assert.equal(ev(mx, veh(300, 1), { initialMass: 25100 }).stars, 0);
  assert.equal(ev(mx, veh(500, 1), { initialMass: 20000 }).stars, 2); assert.equal(ev(mx, veh(800, 1), { initialMass: 20000 }).stars, 3);
  assert.equal(ev(mm, veh(50, 1), { initialMass: 5900 }).stars, 1); assert.equal(ev(mm, veh(50, 1), { initialMass: 4900 }).stars, 2); assert.equal(ev(mm, veh(50, 1), { initialMass: 3900 }).stars, 3);
  assert.equal(ev(mm, veh(20, 1), { initialMass: 3000 }).stars, 0, 'a tiny payload does not count');
});

test('Mars transfer: a transfer-budget challenge computed from physics/mission-design.js, judged on the real design analysis', () => {
  const b = marsTransferBudget();
  assert.ok(b.departure > 3000 && b.departure < 4500, `departure burn ${b.departure}`); assert.ok(b.ascent > 8000 && b.ascent < 11000); assert.ok(Math.abs(b.total - b.ascent - b.departure) < 1e-6);
  const ch = challengeById('mars-transfer-budget'); assert.equal(ch.design, true);
  const rocket = (isp, prop) => { const v = engineStage({ dry: 100, prop, thrust: 5000, isp }); v.type = 'rocket'; return v; };
  const weak = evaluateDesign(ch, rocket(300, 400)); assert.equal(weak.valid, true); assert.equal(weak.stars, 0); assert.ok(weak.metrics.dvVacuum < b.total);
  const big = evaluateDesign(ch, rocket(460, 3000)); assert.ok(big.metrics.dvVacuum > 1.2 * b.total, `dv ${big.metrics.dvVacuum}`);
  assert.ok(big.stars >= 2, JSON.stringify(big.goals)); assert.equal(evaluateDesign(ch, rocket(460, 3000)).goals.find((g) => g.id === 'dv20pay').ok, false, 'no 200 kg payload in that design');
  assert.equal(evaluateDesign(challengeById('reach-orbit'), rocket(300, 400)).valid, false, 'flight challenges are not design-judged');
  assert.equal(evaluateDesign(ch, { type: 'lander', components: [] }).valid, false);
});

test('real runs: a lander lands softly; a 500 kg rocket flies the tilted, precision and payload missions (numbers come from the recorded runs)', { timeout: 280000 }, async () => {
  const fly = async (S, ch) => { const a = await setupChallenge(S.api, ch); assert.ok(a.ok, a.message); const r = await S.api.execute('RUN_SIMULATION', { name: ch.id, tune: true }); assert.ok(r.ok, r.message); return S.api.getRun(r.data.runId); };
  const L = new AiSession({ storage: new MemoryStorage() }); await L.send('Build me a lunar lander that lands on the Moon.'); await L.send('yes');
  const land = challengeById('moon-soft-landing'); let r = await fly(L, land); let ev = evaluate(land, r.record, r.telemetry);
  assert.equal(ev.valid, true); assert.ok(ev.stars >= 2, JSON.stringify(ev.goals)); assert.equal(ev.stars, r.telemetry.count > 0 && ev.metrics.touchdownVertical <= 1 && ev.metrics.finalPropellant / ev.metrics.initialPropellant >= 0.05 ? 3 : 2, 'the honest star count follows the recorded touchdown numbers');
  const rocketOnly = await setupChallenge(L.api, challengeById('reach-orbit')); assert.equal(rocketOnly.ok, false, 'a lander cannot be used for an orbit challenge');
  const S = new AiSession({ storage: new MemoryStorage() }); await S.send('Build me a two-stage rocket carrying a 500 kg satellite to a 400 km orbit.'); await S.send('yes');
  for (const id of ['inclined-orbit', 'precision-orbit']) { const ch = challengeById(id); r = await fly(S, ch); ev = evaluate(ch, r.record, r.telemetry); assert.ok(ev.valid && ev.passed, `${id}: ${JSON.stringify(ev.goals)}`); }
  const mx = challengeById('max-payload'); r = await fly(S, mx); ev = evaluate(mx, r.record, r.telemetry);
  assert.ok(ev.passed && ev.metrics.initialMass <= 25000, JSON.stringify(ev.goals)); assert.ok(payloadOf(r.record) >= 500);
  const cheap = challengeById('cheap-orbit'); r = await fly(S, cheap); ev = evaluate(cheap, r.record, r.telemetry); assert.ok(ev.passed, JSON.stringify(ev.goals));
  const mm = challengeById('min-mass-orbit'); r = await fly(S, mm); ev = evaluate(mm, r.record, r.telemetry);
  assert.equal(ev.stars, 0, 'a 22-tonne rocket is honestly not a "smallest rocket"');
  const ll = challengeById('low-loss-ascent'); r = await fly(S, ll); ev = evaluate(ll, r.record, r.telemetry); console.log('low-loss', JSON.stringify(ev.goals.map((g) => [g.id, g.ok, g.value])));
  assert.ok(ev.valid && ev.goals[0].ok);
});
