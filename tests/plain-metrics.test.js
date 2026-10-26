import test from 'node:test';
import assert from 'node:assert/strict';
import { designLauncher, buildProbe } from '../src/vehicles/builders.js';
import { designVerifiedLauncher } from '../src/missions/tuner.js';
import { buildRunRecord } from '../src/core/project.js';
import { runMetrics } from '../src/core/run-analysis.js';
import { reportCard, dashboardCards, keyMoments, compareSpeed, compareG, compareHeight, plainTime, plainSpeed, ratingFromGoals, measuredGoals, whatIfTakeaway, SOUND_SPEED } from '../src/core/plain-metrics.js';
import { CHANNEL_META } from '../physics/telemetry.js';
import { PLAIN, plainOf } from '../ui/lib/channel-plain.js';

let cache = null;
async function realRun() {
  if (!cache) { const r = await designVerifiedLauncher({ payloadVehicle: buildProbe({ mass: 100 }), targetAltitude: 200000 }, { designLauncher }); cache = { record: buildRunRecord(r.sim), tel: r.sim.telemetry }; }
  return cache;
}

test('plain-metrics: report card numbers equal the measured run numbers', async () => {
  const { record, tel } = await realRun(); const m = runMetrics(record, tel);
  const card = reportCard(record, tel);
  const speed = card.tiles.find((t) => t.id === 'speed');
  assert.equal(speed.value, `${Math.round(m.maxSpeed * 3.6).toLocaleString('en-US')} km/h`);
  assert.ok(Math.abs(speed.machTimes - m.maxSpeed / SOUND_SPEED) < 1e-9);
  assert.match(speed.compare, /times the speed of sound/);
  const fuel = card.tiles.find((t) => t.id === 'fuel');
  assert.equal(fuel.value, `${Math.round((m.propellantUsed / m.initialPropellant) * 100)}%`);
  assert.equal(card.tiles.find((t) => t.id === 'g').value, `${(Math.round(m.maxG * 10) / 10).toFixed(1)} g`);
  assert.equal(card.ok, record.result.status === 'SUCCESS');
  assert.ok(card.story.length >= 3);
  assert.ok(card.moments.some((x) => x.kind === 'liftoff'));
  assert.ok(card.moments.some((x) => x.kind === 'maxq'), 'Max-Q is derived from the recorded dynamic pressure');
  assert.ok(card.moments.some((x) => x.kind === 'sep'));
  if (card.ok) assert.ok(card.moments.some((x) => x.kind === 'orbit'));
  for (let i = 1; i < card.moments.length; i++) assert.ok(card.moments[i].t >= card.moments[i - 1].t);
});

test('plain-metrics: rating comes only from measured goals', async () => {
  const { record, tel } = await realRun(); const card = reportCard(record, tel);
  assert.ok(card.goals.length >= 3);
  assert.equal(card.rating.total, card.goals.length);
  assert.equal(card.rating.passed, card.goals.filter((g) => g.ok).length);
  assert.ok(card.rating.stars >= 0 && card.rating.stars <= 5);
  // a failed mission cannot get a top grade, and too few goals means no rating at all
  const bad = measuredGoals({ maxG: 3 }, { status: 'FAILURE', failures: [{}] });
  assert.ok(ratingFromGoals(bad).stars <= 2);
  assert.equal(ratingFromGoals(measuredGoals({}, { status: 'SUCCESS', failures: [] })), null);
});

test('plain-metrics: comparisons and units', () => {
  assert.match(compareSpeed(3430), /10 times the speed of sound/);
  assert.match(compareSpeed(7900), /orbit/i);
  assert.equal(plainSpeed(100).text, '360 km/h');
  assert.equal(plainTime(129), '2 min 9 s');
  assert.match(compareG(3.4), /roller coaster/i);
  assert.match(compareG(0), /weightless/i);
  assert.match(compareHeight(200000), /space/i);
});

test('plain-metrics: dashboard has six cards with real numbers', async () => {
  const { tel } = await realRun();
  const cards = dashboardCards(tel, { mode: 'run' });
  assert.deepEqual(cards.map((c) => c.id), ['speed', 'height', 'push', 'fuel', 'heat', 'orbit']);
  const col = tel.column('speed'); let mx = 0; for (let i = 0; i < tel.count; i++) mx = Math.max(mx, col[i]);
  assert.equal(cards[0].big, Math.round(mx * 3.6).toLocaleString('en-US'));
  for (const c of cards) for (const s of c.series) assert.ok(CHANNEL_META[s.id], s.id);
  const live = dashboardCards(tel, { mode: 'live' });
  assert.equal(live.length, 6);
});

test('plain-metrics: keyMoments needs real events only', () => {
  assert.deepEqual(keyMoments([], null), []);
  const ev = [{ t: 0, kind: 'EVENT', message: 'Stage 1 ignition — x', data: { action: 'IGNITE' } }, { t: 1, kind: 'LIFTOFF', message: 'Liftoff', data: {} }, { t: 60, kind: 'EVENT', message: 'Stage 1 burnout & separation — Separated stage1', data: { action: 'SEPARATE' } }];
  const m = keyMoments(ev, null);
  assert.deepEqual(m.map((x) => x.label), ['Liftoff!', 'Stage 1 done']);
});

test('plain-metrics: what-if sentence is computed from the cases', () => {
  const cases = [{ x: 0.8, y: 100e3, status: 'FAILURE' }, { x: 1, y: 150e3, status: 'SUCCESS' }, { x: 1.2, y: 200e3, status: 'SUCCESS' }];
  const s = whatIfTakeaway(cases, { baseX: 1, xText: (x) => `${Math.round(x * 100)}% fuel`, metricName: 'orbit height', fmtY: (y) => `${Math.round(y / 1000)} km` });
  assert.match(s, /goes up: 100 km with 80% fuel, 200 km with 120% fuel/);
  assert.match(s, /150 km/); assert.match(s, /2 of 3 test flights/);
});

test('channel-plain: every telemetry channel has a plain name, a meaning and a good-range hint', () => {
  for (const id of Object.keys(CHANNEL_META)) {
    const p = plainOf(id);
    assert.ok(p.name && p.name.length > 2, id); assert.ok(p.meaning && p.meaning.length > 8, `${id} meaning`); assert.ok(p.good, `${id} good`);
    assert.ok(p.meaning.split(/\s+/).length <= 22, `${id} meaning too long`);
  }
  assert.ok(Object.keys(PLAIN).every((id) => CHANNEL_META[id]), 'no unknown ids in PLAIN');
});

// ---------------------------------------------------------------------------------------------- report-card grade (bug 6)
const G = (...oks) => oks.map((ok, i) => ({ id: `g${i}`, label: `Goal ${i}`, ok, detail: ok ? 'fine' : `reason ${i}` }));
const LETTER_STARS = { A: 5, B: 4, C: 3, D: 2, F: 1 };

test('report grade: stars and letter always agree (same score), for every pass/fail pattern', () => {
  for (let n = 3; n <= 6; n++) for (let mask = 0; mask < 1 << n; mask++) {
    const goals = G(...Array.from({ length: n }, (_, i) => !!(mask & (1 << i))));
    const r = ratingFromGoals(goals);
    assert.equal(r.stars, LETTER_STARS[r.letter], `mask ${mask} of ${n}`);
    assert.equal(r.passed, goals.filter((g) => g.ok).length);
    assert.equal(r.total, n);
    assert.equal(r.failed.length, n - r.passed);
  }
});

test('report grade: a flight that missed its main goal can never get A, B or C', () => {
  for (const goals of [G(false, true, true, true, true, true), G(false, true, true), G(false, true, true, true)]) {
    const r = ratingFromGoals(goals);
    assert.ok(['D', 'F'].includes(r.letter), r.letter);
    assert.ok(r.stars <= 2);
    assert.ok(r.failed.some((g) => g.id === 'g0'), 'the missed main goal is listed');
    assert.match(r.reason, /Missed: goal 0/);
  }
  assert.equal(ratingFromGoals(G(false, true, true, true, true, true)).capped, true);
  assert.match(ratingFromGoals(G(false, true, true, true, true, true)).reason, /stops at D/);
});

test('report grade: perfect flight is A with 5 stars and nothing missed; weak one is F', () => {
  const a = ratingFromGoals(G(true, true, true, true, true));
  assert.deepEqual([a.letter, a.stars, a.failed.length, a.capped], ['A', 5, 0, false]);
  const f = ratingFromGoals(G(false, false, false, false, true));
  assert.deepEqual([f.letter, f.stars], ['F', 1]);
  assert.equal(ratingFromGoals(G(true, true)), null, 'fewer than 3 measured goals: no rating');
});

test('report grade: fabricated run results give a grade that matches their goals and failure reasons', () => {
  const metrics = { maxG: 3.2, maxStructRatio: 0.5, maxThermRatio: 0.4, lastStageReserveFrac: 0.1 };
  const ok = measuredGoals(metrics, { status: 'SUCCESS', failures: [] });
  assert.equal(ratingFromGoals(ok).letter, 'A');
  const crashed = measuredGoals({ ...metrics, maxG: 9, maxStructRatio: 1.3 }, { status: 'FAILURE', reason: 'Structure failed at max-Q', failures: [{ code: 'STRUCT', title: 'Broke' }] });
  const r = ratingFromGoals(crashed);
  assert.ok(!['A', 'B', 'C'].includes(r.letter));
  assert.deepEqual(r.failed.map((g) => g.id).sort(), ['gentle', 'goal', 'intact', 'strong']);
  assert.equal(r.failed.find((g) => g.id === 'goal').detail, 'Structure failed at max-Q');
  assert.match(r.failed.find((g) => g.id === 'gentle').detail, /9 g/);
  const nearMiss = ratingFromGoals(measuredGoals(metrics, { status: 'FAILURE', reason: 'Orbit too low', failures: [] }));
  assert.ok(nearMiss.capped && nearMiss.letter === 'D' && nearMiss.stars === 2, 'only the main goal missed: still capped at D');
});

// ---------------------------------------------------------------------------------------------- T+0 (bug 3)
test('T+0: speed relative to the pad is exactly 0, height is exactly 0 or clamped, and the cards show it', async () => {
  const { tel } = await realRun();
  const at0 = (id) => tel.column(id)[0];
  assert.equal(at0('t'), 0);
  assert.equal(at0('surfSpeed'), 0);
  assert.equal(at0('vSpeed'), 0);
  assert.equal(at0('mach'), 0);
  assert.equal(at0('q'), 0);
  assert.ok(Math.abs(at0('alt')) < 1e-6, 'height is only float noise at T+0');
  assert.ok(at0('speed') > 100, 'the inertial speed includes the planet spin (about 408 m/s at the Cape)');
  const one = { count: 1, column: (id) => tel.column(id).subarray(0, 1) };
  const cards = dashboardCards(one, { mode: 'live' });
  const sp = cards.find((c) => c.id === 'speed'), ht = cards.find((c) => c.id === 'height');
  assert.equal(sp.big, '0');
  assert.match(sp.title, /^speed/i);
  assert.match(sp.sub, /inertial/i);
  assert.match(sp.sub, /1,4\d\d km\/h/);
  assert.equal(ht.big, '0');
  for (const c of cards) assert.doesNotMatch(`${c.big} ${c.sub ?? ''} ${c.compare}`, /e[+-]\d/i, `${c.id} has scientific notation`);
});
