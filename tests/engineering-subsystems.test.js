import test from 'node:test';
import assert from 'node:assert/strict';
import { Sensor, diagnoseSensor, voteRedundant, SENSOR_PRESETS } from '../src/engineering/sensors/sensor.js';
import { PowerSystem } from '../src/engineering/power/eps.js';
import { ThermalNetwork, defaultSpacecraftNetwork, stagnationHeatFlux } from '../src/engineering/thermal/thermal.js';
import { DelayedLink, linkBudget, dishGainDb, segmentClear, networkAccess, DEFAULT_GROUND_STATIONS } from '../src/engineering/comms/comms.js';
import { FlightComputer } from '../src/engineering/avionics/flightComputer.js';
import { DigitalTwin } from '../src/engineering/vehicle/twin.js';
import { stationMargin, cylinderSection, MATERIALS, vehicleLoads } from '../src/engineering/structures/structures.js';
import { windTunnel, AERO_MODELS, alphaSweep, machSweep } from '../src/engineering/aero/aero.js';
import { runTestStand } from '../src/engineering/propulsion/engine.js';
import { loadVehicle } from '../src/engineering/vehicle/library.js';
import { makeRng } from '../src/engineering/core/rng.js';
import { atmosphere, reynolds } from '../src/engineering/core/atmosphere.js';
import { attitudeManeuver } from '../src/engineering/gnc/attitude.js';
import { navigationExperiment } from '../src/engineering/gnc/navigation.js';
import { stepResponse, PLANTS, closedLoopAnalysis } from '../src/engineering/gnc/pid.js';

const series = (sensor, n, truth = (t) => Math.sin(t / 10) * 5) => { const out = []; for (let i = 0; i < n; i++) { const r = sensor.update(i * 0.1, truth(i * 0.1)); if (r) out.push(r); } return out; };

test('sensor: rate, latency and resolution are applied', () => {
  const s = new Sensor('alt', { type: 'radarAltimeter', dropoutProb: 0 }, 1);
  const out = series(s, 1000, () => 1234.567);
  assert.ok(out.length >= 999 && out.length <= 1001, `20 Hz sensor sampled ${out.length} times in 100 s of 0.1 s steps (sim step limits it to 10 Hz)`);
  for (const r of out) assert.ok(Math.abs(r.value / 0.1 - Math.round(r.value / 0.1)) < 1e-6);
});
test('sensor diagnosis finds stuck, dropouts, drift and corruption from telemetry alone', () => {
  const spec = SENSOR_PRESETS.temperature;
  const ok = new Sensor('t', { type: 'temperature' }, 2); assert.deepEqual(diagnoseSensor(series(ok, 600, (t) => 300 + t / 10), spec).map((f) => f.issue), []);
  const stuck = new Sensor('t', { type: 'temperature' }, 3); stuck.inject('stuck');
  assert.ok(diagnoseSensor(series(stuck, 600, (t) => 300 + t / 10), spec, series(new Sensor('r', { type: 'temperature' }, 4), 600, (t) => 300 + t / 10)).some((f) => f.issue === 'stuck'));
  const drop = new Sensor('t', { type: 'temperature' }, 5); drop.inject('dropout');
  assert.ok(diagnoseSensor(series(drop, 600), spec).some((f) => f.issue === 'dropouts'));
  const drift = new Sensor('t', { type: 'temperature' }, 6); drift.inject('drift-runaway', { rate: 0.05 });
  const ref = series(new Sensor('r', { type: 'temperature' }, 7), 3000, (t) => 300);
  assert.ok(diagnoseSensor(series(drift, 3000, () => 300), spec, ref).some((f) => f.issue === 'drift'));
  const bad = new Sensor('t', { type: 'temperature' }, 8); bad.inject('corrupt', { rate: 0.1 });
  assert.ok(diagnoseSensor(series(bad, 600, () => 300), spec).some((f) => f.issue === 'corrupt-data'));
});
test('redundant sensors: voting excludes the outlier', () => {
  const v = voteRedundant([{ valid: true, value: 10 }, { valid: true, value: 10.1 }, { valid: true, value: 55 }], 1);
  assert.deepEqual(v.excluded, [2]); assert.ok(Math.abs(v.value - 10.05) < 1e-9);
});
test('power: load shedding by priority and safe-mode request', () => {
  const p = new PowerSystem({ batteryWh: 1000, loads: [{ id: 'a', name: 'Critical', power: 200, priority: 1 }, { id: 'b', name: 'Science', power: 300, priority: 3 }, { id: 'c', name: 'Heaters', power: 100, priority: 2 }] });
  for (let i = 0; i < 3600 * 2; i++) p.step(1, { t: i, inEclipse: true });
  assert.ok(p.events.some((e) => e.type === 'load-shed' && e.text.includes('Science')));
  assert.ok(p.safeModeRequested);
  assert.equal(p.loads.find((l) => l.id === 'a').on, true);
});
test('power: faults change generation and buses', () => {
  const p = new PowerSystem({ solarArea: 10, batteryWh: 5000, loads: [{ id: 'x', name: 'X', power: 100, priority: 2 }] });
  const g0 = p.step(1, { t: 0, sunCos: 1 }).generation; p.inject('solar-panel-failure', { fraction: 0.5 });
  assert.ok(Math.abs(p.step(1, { t: 1, sunCos: 1 }).generation - g0 / 2) < 1);
  p.inject('short-circuit'); p.step(1, { t: 2 }); assert.equal(p.buses.B.ok, false);
});
test('thermal: status levels and ablation', () => {
  const n = defaultSpacecraftNetwork(); n.node('avionics').internalHeat = 20000;
  for (let i = 0; i < 100; i++) n.step(10, {});
  assert.equal(n.status().find((s) => s.id === 'avionics').status, 'FAILURE');
  const hs = new ThermalNetwork([{ id: 'hs', mass: 100, cp: 1000, area: 1, emissivity: 0.8, T: 900, ablator: { pyrolysisTemp: 800, heatOfAblation: 3e7, mass: 10 } }]);
  hs.step(10, { aeroHeatFlux: { hs: 2e6 } }); assert.ok(hs.node('hs').ablated > 0);
  assert.ok(stagnationHeatFlux(3e-4, 11000, 4.7) > 1e6);
});
test('comms: Mars commands cannot arrive instantly', () => {
  const link = new DelayedLink(makeRng(1)); const d = 2.25e11; const delay = d / 299792458;
  link.send('uplink', 0, { cmd: 'drive' }, delay);
  assert.equal(link.receive('uplink', delay - 1).length, 0); assert.equal(link.receive('uplink', delay + 1).length, 1);
  assert.ok(delay > 700);
  const lb = linkBudget({ powerW: 20, gainDb: 25 }, { gainDb: dishGainDb(34, 8.4e9), systemNoiseTempK: 30 }, d, 8.4e9, 1e6);
  assert.ok(lb.margin < 0, 'a 20 W, 25 dBi radio cannot send 1 Mbit/s from Mars');
});
test('comms: line of sight blocked by a planet; ground network visibility', () => {
  assert.equal(segmentClear([-2e7, 0, 0], [2e7, 0, 0], [0, 0, 0], 6.4e6), false);
  assert.equal(segmentClear([-2e7, 1e7, 0], [2e7, 1e7, 0], [0, 0, 0], 6.4e6), true);
  const acc = networkAccess(DEFAULT_GROUND_STATIONS, [4.2e7, 0, 0], 0);
  assert.ok(acc.some((s) => s.visible) && acc.some((s) => !s.visible));
});
test('flight computer: modes, illegal transitions, watchdog, safe mode in critical phases becomes abort', () => {
  const fc = new FlightComputer(); fc.powerOn(); for (let i = 0; i < 1000; i++) fc.step(0.01);
  assert.equal(fc.mode, 'PRELAUNCH');
  assert.equal(fc.setMode('SURFACE'), false);
  fc.setMode('LAUNCH'); fc.setMode('ASCENT'); fc.setMode('SAFE');
  assert.equal(fc.mode, 'ABORT');
  fc.inject('process-failure', { process: 'guid' }); for (let i = 0; i < 100; i++) fc.step(0.01);
  assert.ok(fc.events.some((e) => e.type === 'watchdog'));
  fc.inject('memory-fault'); assert.ok(fc.events.some((e) => e.type === 'edac'));
  fc.inject('computer-failure', { unit: 0 }); fc.inject('computer-failure', { unit: 1 }); fc.step(0.01);
  assert.ok(fc.events.some((e) => e.type === 'loss-of-control'));
});
test('flight computer: lost navigation in orbit leads to safe mode', () => {
  const fc = new FlightComputer({ initialMode: 'ORBIT' }); fc.powerOn(); for (let i = 0; i < 1000; i++) fc.step(0.01);
  fc.inject('lost-navigation'); for (let i = 0; i < 600; i++) fc.step(0.01);
  assert.equal(fc.mode, 'SAFE');
});
test('digital twin: provenance, stale detection, refuses non-finite values', () => {
  const tw = new DigitalTwin(loadVehicle('lunar-lander'), { staleAfter: 10 });
  tw.ingest('descent-sim', 1, { mass: 15000, propellant: 8000 });
  tw.ingest('descent-sim', 30, { propellant: 7000 });
  assert.equal(tw.get('mass').status, 'stale'); assert.equal(tw.get('propellant').status, 'live');
  assert.equal(tw.get('pressure').status, 'unknown');
  assert.throws(() => tw.ingest('x', 31, { mass: NaN }));
  assert.equal(tw.get('propellant').source, 'descent-sim');
});
test('structures: margins fall with load and buckling governs thin shells', () => {
  const sec = cylinderSection(3, 0.003);
  const a = stationMargin(sec, MATERIALS.al2219, { axial: 1e6, bending: 0 });
  const b = stationMargin(sec, MATERIALS.al2219, { axial: 5e6, bending: 1e6 });
  assert.ok(b.margin < a.margin); assert.equal(a.governing, 'shell buckling');
  const loads = vehicleLoads(loadVehicle('heavy-lunar'), { massAbove: () => 6e5, accelAxial: 40, q: 30000, alpha: 0.05, aref: 80 });
  assert.equal(loads.stations.length, 3);
});
test('wind tunnel: drag rises through Mach 1; stall reduces lift; Reynolds number positive', () => {
  const ms = machSweep(AERO_MODELS['slender-rocket'], {}, 0.5, 2, 0.05);
  const cd = (m) => ms.find((r) => Math.abs(r.mach - m) < 1e-6).CD;
  assert.ok(cd(1.1) > 1.5 * cd(0.5));
  const as = alphaSweep(AERO_MODELS['trainer-aircraft'], { mach: 0.2 }, 0, 25, 1);
  const peak = as.reduce((a, r) => (r.CL > a.CL ? r : a)); assert.ok(peak.alphaDeg >= 14 && peak.alphaDeg <= 16);
  assert.ok(windTunnel(AERO_MODELS['slender-rocket'], { mach: 0.5 }).flow.reynolds > 1e6);
  assert.ok(reynolds(100, 1, atmosphere('earth', 0)) > 6e6);
});
test('test stand: throttle below minimum and restart limits are reported, not hidden', () => {
  const r = runTestStand({ thrustVac: 1e5, ispVac: 300, ispSL: 270, throttleMin: 0.5, restarts: 0 }, { profile: [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 5, cmd: 'throttle', throttle: 0.2 }, { at: 10, cmd: 'shutdown' }, { at: 12, cmd: 'ignite', throttle: 1 }, { at: 14, cmd: 'shutdown' }] });
  const issues = r.anomalies.map((a) => a.issue);
  assert.ok(issues.includes('below-min-throttle') && issues.includes('restart-limit'));
  assert.ok(r.series.thrustMeasured.some((v, i) => v !== r.series.thrust[i]), 'measured channel carries instrument noise');
});
test('GNC: actuators, navigation aiding and unstable controller detection', () => {
  assert.ok(attitudeManeuver({ actuator: 'rcs', gains: { kp: 2000, kd: 20000 } }).summary.achieved);
  const wheelSat = attitudeManeuver({ actuator: 'reaction-wheel', inertia: 50000, act: { maxMomentum: 5 }, duration: 60 });
  assert.ok(wheelSat.summary.wheelSaturations > 0);
  const nav = navigationExperiment({ duration: 600, aid: 'gnss' }, makeRng), ins = navigationExperiment({ duration: 600, aid: 'none' }, makeRng);
  assert.ok(Math.abs(nav.kfError.at(-1)) < 20 && Math.abs(ins.insError.at(-1)) > 100);
  const unstable = stepResponse({ controller: { kp: 1, kd: -0.3 }, plant: PLANTS['double-integrator'](), duration: 40 });
  assert.equal(unstable.metrics.stable, false);
  assert.equal(closedLoopAnalysis({ kp: 1, kd: -0.3 }, PLANTS['double-integrator']()).stable, false);
});
