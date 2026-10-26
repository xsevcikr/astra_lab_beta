// Challenges and launch readiness review. Everything is judged from REAL simulator runs of the AI-built two-stage rocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { CHALLENGES, challengeById, setupChallenge, evaluate, totalStars, maxStars } from '../src/core/challenges.js';
import { readinessReview, ascentDvNeeded } from '../src/core/readiness.js';
import { findLesson } from '../data/academy/index.js';

async function rocket(prompt = 'Build me a two-stage rocket carrying a 100 kg space probe.') {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.send(prompt); await S.send('yes');
  return S;
}
async function fly(S, ch) {
  const a = await setupChallenge(S.api, ch); assert.ok(a.ok, a.message);
  const r = await S.api.execute('RUN_SIMULATION', { name: ch.id, tune: true }); assert.ok(r.ok, r.message);
  return S.api.getRun(r.data.runId);
}

test('challenge definitions are complete and point at real Academy lessons', () => {
  assert.ok(CHALLENGES.length >= 16);
  const ids = new Set();
  for (const c of CHALLENGES) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.ok(c.title && c.story && c.difficulty >= 1 && c.difficulty <= 3, c.id);
    assert.ok(findLesson(c.lesson), `lesson ${c.lesson} exists`);
    assert.ok(c.setup.altitude >= 80000);
    assert.ok(c.goals.some((g) => g.tier === 1) && c.goals.some((g) => g.tier === 2) && c.goals.some((g) => g.tier === 3), `${c.id} has goals for 1, 2 and 3 stars`);
    for (const g of c.goals) assert.equal(typeof g.test, 'function');
  }
  assert.equal(maxStars, CHALLENGES.length * 3);
  assert.equal(totalStars({ 'reach-orbit': { stars: 3 }, 'max-q': { stars: 2 } }), 5);
});

test('real runs: the AI-built rocket completes the first four challenges; stars come from measured numbers', { timeout: 280000 }, async () => {
  const S = await rocket();
  for (const id of ['first-steps', 'reach-orbit', 'station-orbit', 'max-q']) {
    const ch = challengeById(id);
    const { record, telemetry } = await fly(S, ch);
    const ev = evaluate(ch, record, telemetry);
    assert.ok(ev.valid && ev.passed, `${id}: ${JSON.stringify(ev.goals)}`);
    assert.ok(ev.stars >= 2, `${id} stars ${ev.stars}`);
    // every reported value is backed by the recorded run
    assert.equal(ev.metrics.maxAlt, Math.max(...telemetry.column('alt')));
  }
  // honest failures: this rocket pulls 6+ g, so "Gentle ride" stays at one star; Max-Q of 43 kPa misses the 35 kPa stretch goal
  const gentle = challengeById('gentle-ride'); let r = await fly(S, gentle); let ev = evaluate(gentle, r.record, r.telemetry);
  assert.equal(ev.stars, 1); assert.equal(ev.goals.find((g) => g.id === 'g5').ok, false); assert.ok(ev.metrics.maxG > 5);
  const mq = challengeById('max-q'); r = await fly(S, mq); ev = evaluate(mq, r.record, r.telemetry);
  assert.equal(ev.stars, 2); assert.equal(ev.goals.find((g) => g.id === 'q35').ok, false);
  // a run flown for another mission does not count
  const other = evaluate(challengeById('station-orbit'), r.record, r.telemetry);
  assert.equal(other.valid, false); assert.equal(other.stars, 0);
  // 500 kg challenge fails with the 100 kg probe rocket (no payload credit)
  const heavy = challengeById('heavy-lift'); r = await fly(S, heavy); ev = evaluate(heavy, r.record, r.telemetry);
  assert.equal(ev.passed, false); assert.equal(ev.goals.find((g) => g.id === 'payload').ok, false);
});

test('real runs: a 500 kg rocket completes Heavy lift; Polar pioneer reaches a tilted orbit', { timeout: 280000 }, async () => {
  const S = await rocket(challengeById('heavy-lift').build);
  const heavy = challengeById('heavy-lift'); let r = await fly(S, heavy); let ev = evaluate(heavy, r.record, r.telemetry);
  assert.ok(ev.passed, JSON.stringify(ev.goals)); assert.ok(ev.metrics.initialMass > 15000);
  const polar = challengeById('polar-pioneer'); r = await fly(S, polar); ev = evaluate(polar, r.record, r.telemetry);
  assert.ok(ev.passed && ev.goals.find((g) => g.id === 'incl').ok, JSON.stringify(ev.goals));
  assert.ok(ev.metrics.finalIncl >= 60);
});

test('real runs: the six newer challenges are judged from measured numbers', { timeout: 280000 }, async () => {
  const S = await rocket();
  for (const id of ['sound-barrier', 'strong-liftoff', 'cool-nose', 'steady-flight', 'perfect-circle', 'speedy-orbit']) {
    const ch = challengeById(id); assert.ok(ch.hint, `${id} has a hint`);
    const { record, telemetry } = await fly(S, ch);
    const ev = evaluate(ch, record, telemetry);
    assert.ok(ev.valid && ev.passed, `${id}: ${JSON.stringify(ev.goals)}`);
    assert.ok(ev.stars >= 2, `${id} stars ${ev.stars}: ${JSON.stringify(ev.goals)}`);
    if (id === 'sound-barrier') assert.equal(ev.metrics.maxMach, Math.max(...telemetry.column('mach')));
    if (id === 'steady-flight') assert.equal(ev.goals.find((g) => g.id === 'aoa10').ok, false);   // this rocket swings to about 17 degrees
  }
});

test('readiness review: lights come from real design checks', { timeout: 120000 }, async () => {
  const S = await rocket();
  const v = S.project.vehicle;
  let rv = readinessReview(v, S.project.mission);
  assert.deepEqual(rv.stations.map((s) => s.id), ['structures', 'propulsion', 'guidance', 'power', 'comms', 'payload', 'director']);
  assert.equal(rv.overall.status, 'go'); assert.match(rv.stations[1].reason, /Thrust-to-weight 1\.\d\d/);
  assert.ok(ascentDvNeeded('earth', 200000, 28.5) > 8500 && ascentDvNeeded('earth', 200000, 28.5) < 10000);
  // not enough delta-v for a 1,000 km orbit: propulsion NO-GO and the director says why
  await S.api.execute('CREATE_MISSION', { kind: 'launch', altitude: 1e6 });
  rv = readinessReview(v, S.project.mission);
  assert.equal(rv.stations.find((s) => s.id === 'propulsion').status, 'nogo'); assert.match(rv.overall.text, /^NO-GO: propulsion/);
  // remove the guidance computers and the batteries
  const broken = JSON.parse(JSON.stringify(v));
  broken.components.forEach((c) => { if (c.guidance) delete c.guidance; });
  rv = readinessReview(broken, null); assert.equal(rv.stations.find((s) => s.id === 'guidance').status, 'nogo'); assert.equal(rv.overall.status, 'nogo');
  const noPower = JSON.parse(JSON.stringify(v)); noPower.components = noPower.components.filter((c) => c.kind !== 'battery' && c.kind !== 'solar_panel');
  assert.equal(readinessReview(noPower, null).stations.find((s) => s.id === 'power').status, 'nogo');
  const noAnt = JSON.parse(JSON.stringify(v)); noAnt.components = noAnt.components.filter((c) => c.kind !== 'antenna');
  const c = readinessReview(noAnt, null); assert.equal(c.stations.find((s) => s.id === 'comms').status, 'caution'); assert.equal(c.overall.status, 'go');
});

test('stars are computed from run numbers: every challenge can reach 3 stars and drops stars when a number is missed', () => {
  const rec = (ch, extra = {}) => ({ mission: { objective: { type: 'orbit', altitude: ch.setup.altitude }, initial: { lat: ch.setup.site === 'polar' ? 65 : 28.57 } }, vehicle: { meta: { payloadMass: 600 } }, result: { status: 'SUCCESS', separations: [{ group: 'deploy:payload' }], ...extra } });
  const great = { maxAlt: 3e5, maxMach: 12, maxG: 3, maxQ: 30000, maxTempNose: 400, maxAoA: 5, liftoffTWR: 1.6, initialMass: 6000, endTime: 400, lastStageReserveFrac: 0.2, finalApo: 4e5 + 1000, finalPeri: 4e5, finalEcc: 0.0005, finalIncl: 80 };
  for (const ch of CHALLENGES) {
    const r = rec(ch), m = { ...great };
    if (ch.id === 'high-flyer') m.finalApo = 1.0e6;
    r.result.summary = { separations: [{ group: 'deploy:payload' }] };
    // the orbit goal reads status SUCCESS; numbers decide the rest
    m.finalPeri = ch.setup.altitude; m.finalApo = ch.id === 'high-flyer' ? 1.0e6 : ch.setup.altitude + 1000;
    const ev = evaluate(ch, r, null, m);
    assert.equal(ev.valid, true, ch.id); assert.equal(ev.stars, 3, `${ch.id}: ${JSON.stringify(ev.goals.filter((g) => !g.ok))}`);
    assert.ok(ch.hint && ch.hint.length < 120, `${ch.id} has a short hint`);
    // a failed mission earns nothing
    const bad = evaluate(ch, rec(ch, { status: 'FAILURE' }), null, { ...m, maxAlt: 5000, maxMach: 0.5, finalPeri: NaN, finalApo: NaN });
    assert.equal(bad.stars, 0, `${ch.id} failure`);
  }
  // one missed stretch number costs exactly the third star
  const ch = challengeById('gentle-ride');
  assert.equal(evaluate(ch, rec(ch), null, { ...great, maxG: 4.5 }).stars, 2);
  assert.equal(evaluate(ch, rec(ch), null, { ...great, maxG: 6 }).stars, 1);
});
