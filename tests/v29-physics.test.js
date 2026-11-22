// 2.9 physics: entry heating (convective + radiative, ablation), fin heating, pogo, flight-control loop, two-burn Centaur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DEFAULT_SETTINGS } from '../physics/simulation.js';
import { radiativeHeatFlux, leadingEdgeHeatFlux } from '../physics/heating.js';
import { stagnationHeatFlux, heatingConstant } from '../physics/aero.js';
import { pogoLoopGain } from '../physics/pogo.js';
import { pitchLoopMargins } from '../physics/gnc.js';
import { buildFlight, runValidationFlight } from '../src/core/validation.js';
import { engineStage, rel } from './helpers.js';

const L = { maxQ: 1e9, maxQAlpha: 1e12, maxAccelG: 1e9, tMin: 0 };

function capsuleEntry({ v = 11000, gammaDeg = 6.5, shieldMass = 300, heating = true } = {}) {
  const vehicle = { id: 'cap', name: 'Capsule', type: 'probe', stages: [{ id: 'main', name: 'Capsule', order: 1 }], components: [
    { id: 'hs', kind: 'heat_shield', shieldType: 'ablative', name: 'Heat shield', mount: 'stack', group: 'main', mass: shieldMass, length: 0.3, diameter: 3.9, tMax: 3000, ...L },
    { id: 'cm', kind: 'payload', name: 'Crew module', mount: 'stack', group: 'main', mass: 4800, length: 3.2, diameter: 3.9, tMax: 1e5, ...L },
    { id: 'av', kind: 'avionics', name: 'Flight computer', mount: 'internal', group: 'main', mass: 14, guidance: true, powerDraw: 1, tMin: 0, tMax: 1e5 },
    { id: 'bt', kind: 'battery', name: 'Battery', mount: 'internal', group: 'main', mass: 5, capacityWh: 5000, maxPower: 1000, tMin: 0, tMax: 1e5 },
  ] };
  const g = gammaDeg * Math.PI / 180;
  const mission = { name: 'Entry', objective: { type: 'none' }, initial: { type: 'local', lat: 0, lon: 0, altitude: 121000, vEast: v * Math.cos(g), vUp: -v * Math.sin(g), attitude: 'retrograde' },
    guidance: { mode: 'entry', params: {} }, events: [], faults: [], environment: { body: 'earth' }, maxTime: 500 };
  const sim = new Simulation({ vehicle, mission, settings: { heating } });
  sim.run({ budgetMs: 60000 });
  return sim;
}

function soundingRocket({ heating = true, finTMax } = {}) {
  const v = engineStage({ dry: 150, prop: 1200, thrust: 60000, isp: 250 });
  for (const c of v.components) c.diameter = 0.45;
  v.components.push({ id: 'fins', kind: 'fin', name: 'Fins', mount: 'radial', group: 'main', mass: 8, cnAlpha: 4, count: 1, ...L, ...(finTMax ? { tMax: finTMax } : {}) });
  v.components.push({ id: 'nose', kind: 'nose_cone', name: 'Nose', mount: 'stack', group: 'main', mass: 5, length: 1, diameter: 0.45, shape: 'ogive', tMax: 1e5, ...L });
  const mission = { name: 'Sounding', objective: { type: 'none' }, initial: { type: 'pad', lat: 28.5, lon: -80.6 }, guidance: { mode: 'none', params: {} },
    events: [{ id: 'ign', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'main' }, status: 'pending' }], faults: [], environment: { body: 'earth' }, maxTime: 90 };
  const sim = new Simulation({ vehicle: v, mission, settings: { heating } });
  sim.run({ budgetMs: 30000 });
  return sim;
}

const codes = (sim) => sim.result.failures.map((f) => f.code);

test('2.9 switches are off by default (earlier results do not change)', () => {
  assert.equal(DEFAULT_SETTINGS.heating, false); assert.equal(DEFAULT_SETTINGS.pogo, false); assert.equal(DEFAULT_SETTINGS.gnc, false);
});

test('radiative heating: Tauber-Sutton value at 11 km/s, zero below 9 km/s at Earth, Mars has its own table, airless bodies none', () => {
  // a = 1.072e6 V^-1.88 rho^-0.325 = 0.539 (< 1, Rn = 1 m) -> q = 4.736e4 * 1^a * (1e-4)^1.22 * f(11000) = 151  -> 94.3 W/cm^2
  assert.ok(rel(radiativeHeatFlux('earth', 1e-4, 1, 11000), 94.3e4) < 0.005);
  assert.equal(radiativeHeatFlux('earth', 1e-4, 1, 8500), 0);
  assert.ok(radiativeHeatFlux('earth', 1e-4, 1, 12000) > radiativeHeatFlux('earth', 1e-4, 1, 11000));
  assert.ok(radiativeHeatFlux('mars', 1e-4, 1, 7500) > 0);
  assert.equal(radiativeHeatFlux('moon', 1e-4, 1, 7500), 0);
});

test('fin leading edge: unswept edge gets the sphere value / sqrt(2); sweep lowers it', () => {
  const qs = stagnationHeatFlux(heatingConstant('earth'), 0.01, 0.005, 1500);
  assert.ok(rel(leadingEdgeHeatFlux('earth', 0.01, 0.005, 1500, 0), qs / Math.SQRT2) < 1e-9);
  assert.ok(leadingEdgeHeatFlux('earth', 0.01, 0.005, 1500, 60) < 0.5 * leadingEdgeHeatFlux('earth', 0.01, 0.005, 1500, 0));
});

test('11 km/s capsule entry: radiative heating, heat load and ablation are computed; a thick shield survives', () => {
  const sim = capsuleEntry({ shieldMass: 300 });
  const h = sim.result.summary.heating;
  assert.ok(h.peakRadiative > 1e5, 'shock-layer radiation matters at lunar-return speed');
  assert.ok(h.peakConvective > 1e6 && h.peakConvective < 1e7, `peak convective ${h.peakConvective}`);
  assert.ok(h.heatLoad > 1e8 && h.heatLoad < 1e9, `heat load ${h.heatLoad} J/m2 (Apollo: about 4e8)`);
  assert.ok(h.recession > 0.003 && h.recession < 0.03, `recession ${h.recession} m`);
  assert.ok(!codes(sim).includes('HEAT_SHIELD_BURNTHROUGH'));
  const tel = sim.telemetry;
  assert.ok(Math.max(...tel.column('heatRad')) > 0 && Math.max(...tel.column('heatLoad')) > 0);
});

test('a too-thin ablative shield burns through with detailed heating on; with it off the numbers are only reported', () => {
  const on = capsuleEntry({ shieldMass: 60, heating: true });
  assert.ok(codes(on).includes('HEAT_SHIELD_BURNTHROUGH'), codes(on).join(','));
  assert.equal(on.result.status, 'FAILURE');
  const off = capsuleEntry({ shieldMass: 60, heating: false });
  assert.ok(!codes(off).includes('HEAT_SHIELD_BURNTHROUGH'));
  assert.ok(off.result.summary.heating.recession > 0);
});

test('fin heating: a fast sounding rocket heats its fin edges; an aluminium limit is exceeded only with detailed heating on', () => {
  const s = soundingRocket({ heating: true });
  assert.ok(s.result.summary.heating.peakFinT > 400, `fin edge ${s.result.summary.heating.peakFinT} K`);
  assert.ok(!codes(s).includes('FIN_OVERHEAT'), 'the default 700 K edge holds');
  const al = soundingRocket({ heating: true, finTMax: 420 });
  assert.ok(codes(al).includes('FIN_OVERHEAT'));
  const off = soundingRocket({ heating: false, finTMax: 420 });
  assert.ok(!codes(off).includes('FIN_OVERHEAT'));
});

test('pogo loop gain formula', () => {
  // T G Kf / (M/2 * 4 zs zp) = 1e6 * 0.01 * 0.04 / (5e4 * 4 * 0.02 * 0.08)
  assert.ok(rel(pogoLoopGain({ thrust: 1e6, mass: 1e5, gain: 0.01, kf: 0.04 }), 1.25) < 1e-12);
});

test('pogo: Saturn V shakes late in the first-stage burn (as on Apollo 6); pogo suppressors remove it', () => {
  const fly = (sup) => {
    const { vehicle, mission } = buildFlight('saturn-v');
    if (sup) for (const c of vehicle.components) if (c.kind === 'engine') c.pogoSuppressor = true;
    mission.maxTime = 175;
    const sim = new Simulation({ vehicle, mission, settings: { pogo: true } });
    sim.run({ budgetMs: 60000 });
    return sim;
  };
  const a = fly(false), p = a.result.summary.pogo;
  assert.ok(codes(a).includes('POGO_OSCILLATION'), codes(a).join(','));
  assert.ok(p.t > 120 && p.t < 175 && p.gAmp > 0.3 && p.gAmp < 3, JSON.stringify(p));
  assert.ok(p.structHz > 3 && p.structHz < 10, 'first longitudinal mode of a Saturn V-sized stack: a few Hz');
  const b = fly(true);
  assert.ok(!codes(b).includes('POGO_OSCILLATION'));
  assert.ok(b.result.summary.pogo.gAmp < 0.05);
});

test('pitch-loop margins: a delay costs phase margin; an aerodynamically unstable vehicle also has a low-gain margin', () => {
  const base = { Kp: 1.69, Kd: 2 * 0.85 * 1.3 };
  const a = pitchLoopMargins(base), b = pitchLoopMargins({ ...base, Td: 0.1, tau: 0.05 });
  assert.ok(a.phaseMarginDeg > 60, `PD on a rigid body: ${a.phaseMarginDeg}`);
  assert.ok(b.phaseMarginDeg < a.phaseMarginDeg - 5);
  const u = pitchLoopMargins({ Kp: 1.69 + 3 * 2, Kd: 2 * 0.85 * Math.sqrt(7.69), mA: 2, tau: 0.04, Td: 0.03 });
  assert.ok(u.lowGainMarginDb < 0, 'with an unstable plant, lowering the gain also loses control');
  assert.ok(Number.isFinite(u.gainMarginDb) && u.gainMarginDb > 6);
});

test('flight computer (settings.gnc): Soyuz still reaches orbit; margins, servo lag and drift are reported; runs are deterministic', () => {
  const fly = () => { const { vehicle, mission } = buildFlight('soyuz-2-1a'); const s = new Simulation({ vehicle, mission, settings: { gnc: true } }); s.run({ budgetMs: 90000 }); return s; };
  const s = fly();
  assert.equal(s.result.status, 'SUCCESS', s.result.reason);
  const g = s.result.summary.gnc;
  assert.ok(g.samples > 1000 && g.minPhaseMarginDeg > 30 && g.minGainMarginDb > 6, JSON.stringify(g));
  assert.ok(g.maxNavErrorDeg > 0 && g.maxNavErrorDeg <= 0.5 + 1e-9);
  assert.ok(Math.max(...s.telemetry.column('gimbalCmdErr')) > 0, 'the gimbal servo lags its command');
  const s2 = fly();
  assert.equal(s2.result.summary.finalOrbit.peri, s.result.summary.finalOrbit.peri);
});

test('two-burn Centaur: Atlas V 551 parks, coasts once around and circularises near 185 km (was 182 x 427 km with one burn)', () => {
  const r = runValidationFlight('atlas-v-551');
  assert.equal(r.sim.result.status, 'SUCCESS', r.sim.result.reason);
  const ev = (id) => r.sim.executor.events.find((e) => e.id === id);
  assert.equal(ev('cutoff').status, 'done'); assert.equal(ev('circ').status, 'done');
  assert.ok(ev('circ').tDone - ev('cutoff').tDone > 3000, 'a parking-orbit coast between the two burns');
  assert.ok(r.metrics.orbitPeri > 175e3 && r.metrics.orbitApo < 203.5e3, `${r.metrics.orbitPeri} x ${r.metrics.orbitApo}`);
});
