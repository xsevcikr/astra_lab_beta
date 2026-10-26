// 2.4: warm-day (tropical) atmosphere, Saturn V Max-Q altitude, Atlas V throttle, Soyuz-2.1a validation flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../physics/atmosphere.js';
import { runValidationFlight, VALIDATION_VEHICLES } from '../src/core/validation.js';

const std = new Atmosphere({ model: 'us76', height: 150000 }), hot = new Atmosphere({ model: 'us76', height: 150000, profile: 'tropical' });

test('the tropical atmosphere is a warm day: thinner at the ground, thicker at 13 km, identical to the standard one above 50 km', () => {
  assert.ok(hot.query(0).rho < std.query(0).rho, 'warm air is thinner at sea level');
  assert.ok(hot.query(0).T > 295 && hot.query(0).T < 305);
  assert.ok(hot.query(13200).rho > 1.05 * std.query(13200).rho, 'near the tropopause the warm column holds the air up');
  for (const h of [50000, 60000, 90000]) assert.equal(hot.query(h).rho, std.query(h).rho);
  let prev = Infinity; for (let h = 0; h <= 60000; h += 500) { const r = hot.query(h).rho; assert.ok(r < prev, `density falls with height at ${h} m`); prev = r; }
  for (let h = 24000; h < 46000; h += 1000) { const a = hot.query(h).rho, b = hot.query(h + 1).rho; assert.ok(Math.abs(Math.log(a / b)) < 0.005, `no jump near ${h} m`); }
});

test('Saturn V: Max-Q altitude now matches the published 13.2 km (it was 16% low in the standard atmosphere)', { timeout: 120000 }, () => {
  const r = runValidationFlight('saturn-v', { quick: true });
  const row = r.rows.find((x) => x.id === 'maxQAlt');
  assert.equal(row.status, 'pass', `${(row.err * 100).toFixed(1)}%`);
  assert.ok(Math.abs(row.err) < 0.05);
  assert.equal(r.rows.filter((x) => x.status === 'fail').length, 0, 'all Saturn V rows pass');
});

test('the standard atmosphere still puts the Saturn V Max-Q at about 11 km, whatever the pitch table', { timeout: 120000 }, () => {
  const V = VALIDATION_VEHICLES.find((x) => x.id === 'saturn-v'), keep = V.flight.atmosphereProfile;
  try { V.flight.atmosphereProfile = undefined; const r = runValidationFlight('saturn-v', { quick: true }); assert.ok(r.metrics.maxQAlt < 12000 && r.metrics.maxQAlt > 10000, `${r.metrics.maxQAlt}`); }
  finally { V.flight.atmosphereProfile = keep; }
});

test('Soyuz-2.1a: the published payload reaches a 240 km orbit and every graded row passes', { timeout: 120000 }, () => {
  const r = runValidationFlight('soyuz-2-1a', { quick: true });
  assert.equal(r.sim.result.status, 'SUCCESS', r.sim.result.reason);
  assert.equal(r.rows.filter((x) => x.kind === 'graded' && x.status !== 'pass').length, 0);
  assert.ok(Math.abs(r.rows.find((x) => x.id === 'liftoffMassCtx').err) < 0.02, 'liftoff mass within 2% of the published 312 t');
});

import { parseSounding, describeSounding } from '../src/core/sounding.js';
import { Simulation } from '../physics/simulation.js';
import { TEMPLATE_BY_ID } from '../data/templates.js';

const WYO = `72201 KEY Key West Observations at 12Z 04 Jul 2023
-----------------------------------------------------------------------------
   PRES   HGHT   TEMP   DWPT   RELH   MIXR   DRCT   SKNT   THTA   THTE   THTV
    hPa     m      C      C      %    g/kg    deg   knot     K      K      K 
-----------------------------------------------------------------------------
 1012.0      6   26.4   24.2     88  19.27    110      8  299.3  356.1  302.8
 1000.0    110   25.6   23.5     89  18.90    115      9  299.5  355.0  302.9
  850.0   1500   17.6   14.4     82  11.33    100     14  304.0  345.0  306.2
  700.0   3150    8.6    1.6     58   5.13     90     12  308.1  329.6  309.2
  500.0   5880   -6.1  -15.9     34   1.30     80     10  315.2  320.4  315.5
  300.0   9620  -33.3  -44.0     22   0.15    250     25  329.0  330.0  329.1
  200.0  12380  -54.7  -62.4     27   0.03    260     40  341.3  341.6  341.3
  100.0  16620  -76.5  -83.0     20   0.00    240     12  376.3  376.3  376.3
   50.0  20800  -64.1  -90.0      3   0.00    210      8  436.4  436.4  436.4

Station information and sounding indices
`;

test('a University of Wyoming text sounding is read: levels, units and a plain description', () => {
  const s = parseSounding(WYO);
  assert.equal(s.points.length, 9); assert.equal(s.points[0].h, 6); assert.equal(s.topM, 20800);
  assert.ok(Math.abs(s.points[0].T - 299.55) < 0.01, 'temperature in kelvin');
  assert.ok(Math.abs(s.winds[4].speed - 10 * 0.514444) < 0.01, 'knots become m/s');
  assert.equal(s.winds[4].fromDeg, 80);
  assert.match(describeSounding(s), /9 levels up to 20\.8 km/);
});

test('a CSV sounding works and bad files give plain errors', () => {
  const csv = 'height_m,temp_c,wind_ms,from_deg\n0,20,3,90\n2000,6,8,100\n5000,-17,15,250\n9000,-45,30,260\n12000,-56,45,265\n16000,-70,10,240\n';
  const s = parseSounding(csv); assert.equal(s.points.length, 6); assert.equal(s.winds[3].speed, 30);
  assert.throws(() => parseSounding(''), /empty/);
  assert.throws(() => parseSounding('hello world'), /Could not find a sounding table/);
  assert.throws(() => parseSounding('height_m,temp_c\n0,20\n1000,10\n2000,0\n3000,-5\n4000,-10\n5000,-15\n'), /at least 10 km/);
  assert.throws(() => parseSounding(csv.replace('-45', '-450')), /not plausible/);
});

test('a sounding made from the standard atmosphere gives back the standard density (the method is consistent)', () => {
  const std = new Atmosphere({ model: 'us76', height: 150000 });
  const pts = []; for (let h = 0; h <= 30000; h += 500) pts.push({ h, T: std.query(h).T, pres: h === 0 ? 101325 : null });
  const day = new Atmosphere({ model: 'us76', height: 150000, profile: 'sounding', sounding: { points: pts } });
  for (const h of [0, 3000, 8000, 11000, 15000, 20000, 28000, 35000, 60000]) assert.ok(Math.abs(day.query(h).rho / std.query(h).rho - 1) < 0.01, `density at ${h} m`);
});

test('the simulation flies in the sounding\'s air and wind: wind from the sounding pushes the right way, and the day changes the flight', async () => {
  const { vehicle, mission } = TEMPLATE_BY_ID['sounding-rocket'].make();
  const snd = parseSounding(WYO);
  const sim = new Simulation({ vehicle, mission, environment: { sounding: snd } });
  assert.ok(sim.primary.atmosphereModel.query(12380).T < 225, 'the air is the sounding\'s air');
  const R = 6378137, w = (alt) => sim._windAt(R + alt, 0, 0, R + alt, alt);
  const w5 = w(5880); assert.ok(Math.abs(Math.hypot(...w5) - 10 * 0.514444) < 0.3, 'about 5 m/s at 5.9 km (+-gust)');
  assert.ok(w5[1] < 0, 'wind from 80 degrees blows towards the west (negative east) at 0 deg longitude');
  assert.ok(Math.hypot(...w(12380)) > Math.hypot(...w(5880)) * 2, 'the jet is stronger');
  assert.equal(Math.hypot(...w(60000)), 0, 'nothing far above the data');
});

import { buildProReport } from '../src/core/report.js';
import { buildAssurance, assuranceToPDF, modelsUsed } from '../src/core/assurance.js';
import { buildRunRecord } from '../src/core/project.js';
import { runSimulation } from '../src/core/runner.js';
import { runMetrics } from '../src/core/run-analysis.js';
import { runMonteCarlo, defaultFactors } from '../src/core/montecarlo.js';

test('the assurance review is a real PDF, lists the validation table and the open items, and says so when there is no Monte Carlo run', { timeout: 200000 }, async () => {
  const { vehicle, mission } = TEMPLATE_BY_ID['sounding-rocket'].make();
  const sim = await runSimulation({ vehicle, mission, environment: { wind: { speed: 15, seed: 3 } }, settings: { slosh: true } });
  const rec = buildRunRecord(sim), m = runMetrics(rec, sim.telemetry);
  const rep = buildProReport(rec, sim.telemetry, { requirements: [], version: 'test', units: 'metric' });
  const a = buildAssurance(rep, rec);
  assert.ok(a.models.some((x) => /Wind/.test(x.name)) && a.models.some((x) => /slosh/i.test(x.name) && x.status === 'not'));
  assert.ok(a.open.some((t) => /Monte Carlo/.test(t)), 'no Monte Carlo: an open item');
  assert.ok(a.open.some((t) => /slosh/i.test(t)), 'an unvalidated model that is switched on is an open item');
  const pdf = assuranceToPDF(a), head = typeof pdf === 'string' ? pdf.slice(0, 8) : String.fromCharCode(...pdf.slice(0, 8));
  assert.match(head, /^%PDF-1/); assert.ok(pdf.length > 3000);
  assert.deepEqual(modelsUsed({ environment: {}, settings: {}, vehicle: { components: [] }, mission }).map((x) => x.status), ['checked']);
});

test('second slosh mode: about twice the first mode\'s frequency, off unless asked, flight stays sound', { timeout: 120000 }, () => {
  const make = (set) => { const { vehicle, mission } = TEMPLATE_BY_ID['sounding-rocket'].make(); return new Simulation({ vehicle, mission, settings: set }); };
  const peaks = (sim) => { let h1 = 0, h2 = 0; while (!sim.finished && sim.t < 60) { sim.step(); h1 = Math.max(h1, sim.sfInfo?.sloshHz ?? 0); h2 = Math.max(h2, sim.sfInfo?.slosh2Hz ?? 0); } return [h1, h2]; };
  const [a1, a2] = peaks(make({ slosh: true })), [b1, b2] = peaks(make({ slosh: true, slosh2: true }));
  assert.ok(a1 > 0.5 && a2 === 0, 'one mode by default');
  assert.ok(b2 > 1.6 * b1 && b2 < 2.6 * b1, `second mode ${b2.toFixed(2)} Hz vs first ${b1.toFixed(2)} Hz`);
  const full = make({ slosh: true, slosh2: true }); full.run({ budgetMs: 60000 });
  assert.equal(full.result.status, 'SUCCESS', full.result.reason);
});

test('PSLV-XL: burn times and the published payload reach a low point at 200 km; the single-burn flight overshoots its high point (documented)', { timeout: 120000 }, () => {
  const r = runValidationFlight('pslv-xl', { quick: true });
  assert.equal(r.rows.filter((x) => x.kind === 'graded' && x.status !== 'pass').length, 0, 'all graded rows pass');
  assert.ok(r.metrics.peakPeriapsis >= 0.95 * 200e3);
  assert.ok(Math.abs(r.rows.find((x) => x.id === 'liftoffMassCtx').err) < 0.02);
});

test('Vega: the three solid stages burn for their published times; the published payload does NOT reach 700 km (documented miss)', { timeout: 120000 }, () => {
  const r = runValidationFlight('vega', { quick: true });
  for (const id of ['s1Burn', 's2Burn', 's3Burn']) assert.equal(r.rows.find((x) => x.id === id).status, 'pass', id);
  assert.equal(r.rows.find((x) => x.id === 'reachedOrbit').status, 'fail', 'the page must keep saying it is not matched');
  assert.ok(Math.abs(r.rows.find((x) => x.id === 'liftoffMassCtx').err) < 0.03);
});
