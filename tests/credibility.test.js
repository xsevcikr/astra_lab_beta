// Credibility assessment (src/core/credibility.js, data/validation-uncertainty.js, data/credibility-results.js).
// These tests keep the page honest: every compared number has an error bar and a role, tuned rows never count as evidence,
// failures cannot disappear from the headline, and the stored results belong to the current validation data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareWithErrorBars, verdictOf, binaryVerdict, wilson, meanStd, publishedSigma, disperse, flyCase, assessVehicle, headline, buildReport,
  credibilityScores, robustnessText, fmtZ, ROLES, VEHICLE_ROWS, MISSION_ROWS, SIM_DISPERSIONS, VEHICLE_IDS,
} from '../src/core/credibility.js';
import { VALIDATION_VEHICLES, buildFlight } from '../src/core/validation.js';
import { MISSION_CASES } from '../src/core/mission-validation.js';
import { makeRng } from '../src/core/montecarlo.js';
import { CREDIBILITY_RESULTS } from '../data/credibility-results.js';

test('error-bar arithmetic: z-score, verdict bands and model-form error', () => {
  const a = compareWithErrorBars(103, 3, 100, 4);           // d = 3, sigma_c = 5
  assert.equal(a.d, 3); assert.equal(a.sigmaC, 5); assert.ok(Math.abs(a.z - 0.6) < 1e-12); assert.equal(a.verdict, 'consistent'); assert.equal(a.modelForm, 0);
  const b = compareWithErrorBars(125, 3, 100, 4);           // z = 5 -> 25 - 2*5 = 15 left unexplained
  assert.equal(b.verdict, 'inconsistent'); assert.equal(b.modelForm, 15); assert.ok(Math.abs(b.modelFormRel - 0.15) < 1e-12); assert.ok(Math.abs(b.rel - 0.25) < 1e-12);
  assert.equal(compareWithErrorBars(112.5, 3, 100, 4).verdict, 'tension');   // z = 2.5
  assert.equal(verdictOf(2), 'consistent'); assert.equal(verdictOf(-3), 'tension'); assert.equal(verdictOf(3.01), 'inconsistent'); assert.equal(verdictOf(null), 'missing');
  assert.equal(compareWithErrorBars(null, 1, 100, 1).verdict, 'missing');
  // no error bar at all: any difference is inconsistent, an exact match is consistent
  assert.equal(compareWithErrorBars(101, null, 100, null).verdict, 'inconsistent');
  assert.equal(compareWithErrorBars(100, 0, 100, 0).verdict, 'consistent');
  assert.equal(fmtZ(4.24), '4.2 sigma'); assert.equal(fmtZ(-1e6), 'more than 50 sigma');
});

test('statistics helpers: Wilson interval, mean and sample standard deviation, binary verdicts', () => {
  const [lo, hi] = wilson(24, 24); assert.ok(lo > 0.85 && lo < 0.87 && hi === 1, `${lo} ${hi}`);   // 24/24: 95 % interval 0.862 .. 1
  const [l0, h0] = wilson(0, 10); assert.equal(l0, 0); assert.ok(h0 > 0.27 && h0 < 0.29);
  const ms = meanStd([1, 2, 3, 4, null, NaN]); assert.equal(ms.mean, 2.5); assert.equal(ms.n, 4); assert.ok(Math.abs(ms.std - Math.sqrt(5 / 3)) < 1e-12);
  assert.equal(binaryVerdict(0.9, 10), 'consistent'); assert.equal(binaryVerdict(0.5, 10), 'tension'); assert.equal(binaryVerdict(0.1, 10), 'inconsistent'); assert.equal(binaryVerdict(null, 0), 'missing');
});

test('every published number (rockets and missions) has a role, a basis and an error bar', () => {
  for (const V of VALIDATION_VEHICLES) {
    const table = VEHICLE_ROWS[V.id];
    assert.ok(table, `${V.id} has an uncertainty table`);
    for (const r of V.rows) {
      const u = table[r.id];
      assert.ok(u, `${V.id}/${r.id} has an entry in data/validation-uncertainty.js`);
      assert.ok(ROLES[u.role], `${V.id}/${r.id} role ${u.role}`);
      assert.ok(u.basis && u.basis.length > 15, `${V.id}/${r.id} says where its error bar comes from`);
      if (r.metric === 'reachedOrbit') { assert.equal(publishedSigma(r, u), null); continue; }
      const s = publishedSigma(r, u);
      assert.ok(Number.isFinite(s) && s > 0, `${V.id}/${r.id} sigma`);
      assert.ok(s / Math.abs(r.value) <= 0.12, `${V.id}/${r.id}: error bar of ${(s / r.value * 100).toFixed(1)} % is too wide to test anything`);
    }
    for (const id of Object.keys(table)) assert.ok(V.rows.some((r) => r.id === id), `${V.id}: stale uncertainty entry ${id}`);
  }
  for (const C of MISSION_CASES) {
    const table = MISSION_ROWS[C.id];
    assert.ok(table, `mission ${C.id} has an uncertainty table`);
    for (const r of C.rows) { const u = table[r.id]; assert.ok(u && ROLES[u.role] && publishedSigma(r, u) > 0, `${C.id}/${r.id}`); }
  }
  assert.deepEqual(Object.keys(ROLES).filter((k) => ROLES[k].evidence), ['prediction'], 'only predictions are evidence');
});

test('rows that were tuned to match are labelled calibrated and the steering-fitted Saturn V rows are not counted', () => {
  assert.equal(VEHICLE_ROWS['saturn-v'].maxQT.role, 'calibrated');
  assert.equal(VEHICLE_ROWS['saturn-v'].s1CutoffAlt.role, 'calibrated');
  assert.equal(VEHICLE_ROWS['new-shepard'].maxAlt.role, 'calibrated');     // throttle tuned to the published apogee
  assert.equal(VEHICLE_ROWS['atlas-v-551'].s1Burn.role, 'calibrated');     // RD-180 throttle tuned to the burn time
  for (const V of VALIDATION_VEHICLES) {
    if (V.flight.pitch && V.rows.some((r) => r.metric === 'reachedOrbit')) assert.equal(VEHICLE_ROWS[V.id].reachedOrbit.role, 'calibrated', `${V.id}: pitch fitted to reach orbit`);
  }
  assert.equal(VEHICLE_ROWS['ariane-5-eca'].reachedOrbit.role, 'prediction', 'Ariane 5 flies the generic gravity turn, nothing fitted');
});

test('dispersions change thrust, Isp, propellant, dry mass and air density but never the payload; same seed, same draw', () => {
  assert.deepEqual(SIM_DISPERSIONS.map((d) => d.id), ['thrust', 'isp', 'prop', 'dry', 'density']);
  const a = buildFlight('falcon-9'), b = buildFlight('falcon-9'), c = buildFlight('falcon-9');
  disperse(a.vehicle, a.mission, makeRng(7)); disperse(b.vehicle, b.mission, makeRng(7));
  const base = buildFlight('falcon-9');
  assert.deepEqual(a.vehicle.components.map((x) => [x.mass, x.thrustVac, x.propellantMass]), b.vehicle.components.map((x) => [x.mass, x.thrustVac, x.propellantMass]));
  assert.equal(a.mission.environment.densityScale, b.mission.environment.densityScale);
  disperse(c.vehicle, c.mission, makeRng(8));
  assert.notEqual(a.mission.environment.densityScale, c.mission.environment.densityScale);
  const pay = (v) => v.components.find((x) => x.kind === 'payload').mass;
  assert.equal(pay(a.vehicle), pay(base.vehicle));
  const eng = (v) => v.components.find((x) => x.kind === 'engine' && x.group === 'stage1');
  assert.notEqual(eng(a.vehicle).thrustVac, eng(base.vehicle).thrustVac);
  assert.ok(Math.abs(eng(a.vehicle).thrustVac / eng(base.vehicle).thrustVac - 1) < 0.06, 'thrust stays within 3 sigma');
  // both tanks of a stage share one propellant draw: the mixture ratio is kept
  const tanks = (v) => v.components.filter((x) => x.group === 'stage1' && /tank/.test(x.kind)).map((x) => x.propellantMass);
  const [f0, o0] = tanks(base.vehicle), [f1, o1] = tanks(a.vehicle);
  assert.ok(Math.abs(f1 / f0 - o1 / o0) < 1e-12);
});

test('a real dispersed study: Saturn V nominal plus three dispersed flights gives error bars on both sides', async () => {
  const runs = [];
  for (let i = 1; i <= 3; i++) { const f = await flyCase('saturn-v', i); runs.push({ metrics: f.metrics, ok: f.outcome.ok, reason: f.outcome.reason }); }
  const nom = await flyCase('saturn-v', null);
  const a = assessVehicle({ id: 'saturn-v', n: 3, nominal: { metrics: nom.metrics, ok: nom.outcome.ok, reason: nom.outcome.reason }, runs });
  assert.equal(a.outcome.ok, true, 'Saturn V reaches its parking orbit');
  const row = a.rows.find((r) => r.id === 's2CutoffT');
  assert.ok(row.sigmaSim > 0 && row.sigmaPub === 2, 'S-II cutoff time has a simulator and a published error bar');
  assert.equal(row.role, 'prediction'); assert.equal(row.evidence, true);
  assert.equal(a.rows.find((r) => r.id === 'maxQT').evidence, false, 'calibrated rows are never evidence');
  assert.ok(Math.abs(row.sim - nom.metrics.s2CutoffT) < 1e-9, 'the point is the nominal flight');
});

// ---- the stored results the page shows ----
const REP = buildReport(CREDIBILITY_RESULTS);

test('stored results cover every rocket and every mission case, with the current rows', () => {
  assert.deepEqual(CREDIBILITY_RESULTS.studies.map((s) => s.id), VEHICLE_IDS, 'all nine rockets (re-run scripts/update-credibility.mjs)');
  assert.deepEqual(CREDIBILITY_RESULTS.missions.map((m) => m.C.id), MISSION_CASES.map((c) => c.id));
  assert.ok(CREDIBILITY_RESULTS.n >= 20, 'at least 20 dispersed flights per rocket');
  for (const s of CREDIBILITY_RESULTS.studies) {
    assert.equal(s.runs.length, CREDIBILITY_RESULTS.n);
    const V = VALIDATION_VEHICLES.find((v) => v.id === s.id);
    for (const r of V.rows) assert.ok(r.metric in s.nominal.metrics, `${s.id}: stored metrics lack ${r.metric} (re-run the generator)`);
  }
  for (const m of CREDIBILITY_RESULTS.missions) {
    const C = MISSION_CASES.find((c) => c.id === m.C.id);
    assert.deepEqual(m.rows.map((r) => r.id), C.rows.map((r) => r.id), `${C.id}: rows changed since the results were generated`);
    for (const r of m.rows) assert.equal(r.value, C.rows.find((x) => x.id === r.id).value, `${C.id}/${r.id}: published value changed`);
  }
});

test('the headline counts predictions only and lists every failure', () => {
  const H = REP.headline;
  const pred = REP.cases.flatMap((c) => c.rows).filter((r) => r.evidence && r.verdict !== 'missing');
  assert.equal(H.predictions.total, pred.length);
  assert.equal(H.predictions.consistent + H.predictions.tension + H.predictions.inconsistent, H.predictions.total);
  assert.ok(pred.every((r) => r.role === 'prediction' && r.kind === 'graded'));
  assert.ok(H.notEvidence > H.predictions.total, 'most graded rows are not independent predictions, and the page says so');
  for (const c of REP.cases) {
    if (!c.outcome.ok) assert.ok(H.failures.some((f) => f.caseId === c.id && f.severity === 'failure'), `${c.id} failed and must be listed`);
    if (c.dispersed?.n && c.dispersed.rate < 0.8) assert.ok(H.failures.some((f) => f.caseId === c.id && f.severity === 'robustness'), `${c.id} is fragile and must be listed`);
  }
  for (const r of REP.cases.flatMap((c) => c.rows.map((x) => ({ ...x, c: c.id })))) {
    if (r.evidence && r.verdict === 'inconsistent') assert.ok(H.failures.some((f) => f.caseId === r.c && f.what.startsWith(r.label)), `${r.c}/${r.id} is a model error and must be listed`);
  }
  // the old band looks better than the evidence: a passing band row can still be a model error
  assert.ok(REP.cases.flatMap((c) => c.rows).some((r) => r.bandStatus === 'pass' && r.evidence && r.verdict === 'inconsistent'));
});

test('the nominal flight outcome is the same as the Validation screen (a good table never hides a failed flight)', () => {
  const failing = REP.cases.filter((c) => c.kind === 'vehicle' && !c.outcome.ok).map((c) => c.id);
  for (const id of failing) assert.ok(REP.headline.failures.some((f) => f.caseId === id && /FAILED/.test(f.what)));
  assert.equal(REP.headline.flights.total, 9);
  assert.equal(REP.headline.flights.ok, 9 - failing.length);
});

test('credibility scores: eight NASA-STD-7009A factors, levels 0-4, each with evidence and a next step', () => {
  const F = REP.credibility.factors;
  assert.deepEqual(F.map((f) => f.id), ['verification', 'validation', 'input', 'uncertainty', 'robustness', 'history', 'management', 'people']);
  for (const f of F) { assert.ok(Number.isInteger(f.level) && f.level >= 0 && f.level <= 4, f.id); assert.ok(f.why.length > 30 && f.next.length > 20, f.id); }
  assert.ok(F.every((f) => f.level < 4), 'nothing here earns the top level');
  assert.equal(F.find((f) => f.id === 'history').level, 0);
  assert.match(REP.credibility.use, /NOT good enough for real flight decisions/);
  // validation cannot reach level 3 while a nominal flight fails
  const fake = { predictions: { total: 20, consistent: 20, tension: 0, inconsistent: 0 }, flights: { total: 9, ok: 8 }, notEvidence: 1, medianModelForm: 0 };
  const cases = [1, 2, 3].map((i) => ({ id: `c${i}`, kind: 'mission', rows: [{ evidence: true, verdict: 'consistent', sigmaPub: 1 }] }));
  assert.equal(credibilityScores(cases, fake, {}).factors.find((f) => f.id === 'validation').level, 2);
  assert.equal(credibilityScores(cases, { ...fake, flights: { total: 9, ok: 9 } }, {}).factors.find((f) => f.id === 'validation').level, 3);
});

test('robustness messages explain the cause in plain words', () => {
  const t = robustnessText({ suborbital: false, fitted: true, dispersed: { n: 10, ok: 2, inOrbit: 9 } });
  assert.match(t, /20 %/); assert.match(t, /most misses are the end-of-mission logic/); assert.match(t, /fitted/); assert.match(t, /MAXIMUM payload/);
  assert.match(robustnessText({ suborbital: true, dispersed: { n: 4, ok: 3, inOrbit: 3 } }), /100 km/);
  assert.equal(headline([]).predictions.total, 0);
});
