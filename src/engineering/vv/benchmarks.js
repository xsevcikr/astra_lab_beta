// Verification & Validation center: benchmark problems with analytical or published reference solutions.
// Each benchmark returns expected, actual, tolerance and PASS/FAIL. These also run as the automated test suite.
import { getBody, registerBody, listBodies } from '../core/bodies.js';
import { atmosphere, registerAtmosphere } from '../core/atmosphere.js';
import { hohmann, propagateKepler, circularSpeed, cwPropagate, cwTarget, period } from '../core/orbit.js';
import { G0, SIGMA, SOLAR_CONSTANT } from '../core/constants.js';
import { World } from '../world/world.js';
import { stageDeltaV, performance } from '../vehicle/model.js';
import { loadVehicle } from '../vehicle/library.js';
import { runTestStand, makeEngine, operatingPoint } from '../propulsion/engine.js';
import { coefficients } from '../aero/aero.js';
import { simulateDescent } from '../flight/descent.js';
import { simulateEntry } from '../flight/entry.js';
import { AscentSim } from '../flight/ascent.js';
import { RendezvousSim } from '../flight/rendezvous.js';
import { PowerSystem } from '../power/eps.js';
import { ThermalNetwork } from '../thermal/thermal.js';
import { fsplDb, lightTime } from '../comms/comms.js';
import { Sensor } from '../sensors/sensor.js';
import { FlightComputer } from '../avionics/flightComputer.js';
import { stepResponse, PLANTS, closedLoopAnalysis } from '../gnc/pid.js';
import { KalmanPV } from '../gnc/navigation.js';
import { verify, makeRequirement } from '../requirements/requirements.js';
import { FlightRecorder } from '../flight/recorder.js';
import { MissionDirector } from '../ai/director.js';
import { VersionStore } from '../vehicle/versions.js';
import { snapshotSim, restoreSim, saveProject, loadProject } from '../project/persistence.js';
import { makeRng } from '../core/rng.js';
import { translunar } from '../workflow/lunarMission.js';
import { DescentSim } from '../flight/descent.js';
import { describe } from '../analysis/stats.js';
import { kOfN, evaluateFaultTree } from '../reliability/reliability.js';

const B = (id, category, name, reference, fn) => ({ id, category, name, reference, fn });
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

export const BENCHMARKS = [
  B('gravity-surface', 'Gravity', 'Surface gravity from mu/R^2', 'Earth 9.798 m/s^2 (equatorial, no rotation); Moon 1.624 m/s^2', () => { const e = getBody('earth'), m = getBody('moon'); return [{ expected: 9.798, actual: e.mu / e.radius ** 2, tolerance: 0.002 }, { expected: 1.624, actual: m.mu / m.radius ** 2, tolerance: 0.002 }]; }),
  B('two-body-energy', 'Orbital mechanics', 'Energy conservation, 10 elliptical orbits (RK4)', 'Specific orbital energy is constant in the two-body problem', () => {
    const w = new World({ moon: false }); const E = getBody('earth'); const rp = E.radius + 400e3, ra = E.radius + 4000e3, a = (rp + ra) / 2;
    w.add('s', { r: [rp, 0, 0], v: [0, Math.sqrt(E.mu * (2 / rp - 1 / a)), 0] }); const e0 = w.energy('s');
    const T = period(E.mu, a); for (let t = 0; t < 10 * T; t += 10) w.step(10, 10);
    return [{ expected: 0, actual: Math.abs((w.energy('s') - e0) / e0), tolerance: 1e-7, unit: 'relative' }];
  }),
  B('circular-orbit', 'Orbital mechanics', 'Circular orbit closes after one period', 'Position after one period equals the initial position', () => {
    const w = new World({ moon: false }); const E = getBody('earth'), r = E.radius + 500e3; w.add('s', { r: [r, 0, 0], v: [0, circularSpeed(E.mu, r), 0] });
    const T = period(E.mu, r); const n = Math.ceil(T / 5); for (let i = 0; i < n; i++) w.step(T / n, 5);
    const y = w.vehicles.get('s').y; return [{ expected: 0, actual: Math.hypot(y[0] - r, y[1], y[2]), tolerance: 1, unit: 'm' }];
  }),
  B('kepler-vs-rk4', 'Orbital mechanics', 'Analytical Kepler propagation matches numerical integration', 'f and g functions vs RK4 over 0.37 periods', () => {
    const w = new World({ moon: false }); const E = getBody('earth'); const r0 = [E.radius + 300e3, 0, 0], v0 = [0, 8600, 900]; w.add('s', { r: r0, v: v0 });
    const dt = 2500; for (let i = 0; i < 500; i++) w.step(dt / 500, 5); const k = propagateKepler(E.mu, r0, v0, dt); const y = w.vehicles.get('s').y;
    return [{ expected: 0, actual: Math.hypot(y[0] - k.r[0], y[1] - k.r[1], y[2] - k.r[2]), tolerance: 5, unit: 'm' }];
  }),
  B('hohmann-leo-geo', 'Orbital mechanics', 'Hohmann transfer LEO (191 km) to GEO', 'Vallado, Fundamentals of Astrodynamics: total 3.935 km/s', () => { const E = getBody('earth'); const h = hohmann(E.mu, 6569.48e3, 42164.17e3); return [{ expected: 3935.1, actual: h.total, tolerance: 5, unit: 'm/s' }]; }),
  B('rocket-equation', 'Propulsion', 'Tsiolkovsky equation, single stage', 'Isp 300 s, mass ratio 2.5: 300*g0*ln(2.5) = 2695.6 m/s', () => { const v = { stages: [{ dryMass: 400, propMass: 600, engines: [{ thrustVac: 1e4, ispVac: 300 }] }], payload: { mass: 0 } }; return [{ expected: 300 * G0 * Math.log(2.5), actual: stageDeltaV(v)[0].dv, tolerance: 1e-6, unit: 'm/s' }]; }),
  B('staging', 'Staging', 'Two-stage delta-v equals the sum of each stage on its own stack', 'Rocket equation applied stage by stage', () => {
    const v = loadVehicle('small-launcher'); const st = stageDeltaV(v); const m2 = v.stages[1].dryMass + v.stages[1].propMass + v.payload.mass;
    const dv2 = v.stages[1].engines[0].ispVac * G0 * Math.log(m2 / (m2 - v.stages[1].propMass));
    return [{ expected: dv2, actual: st[1].dv, tolerance: 1e-6, unit: 'm/s' }, { expected: st[0].dv + st[1].dv, actual: performance(v).totalDv, tolerance: 1e-6, unit: 'm/s' }];
  }),
  B('stage-separation', 'Staging', 'Mass drops by exactly the spent stage at separation', 'Conservation of mass at separation', () => {
    const v = loadVehicle('small-launcher'); const s = new AscentSim(v, { kickDeg: 16, record: false, subsystems: false, targetAlt: 200e3 });
    let before = null; while (!s.done && s.stage === 0) { before = s.y[4]; s.step(); }
    return [{ expected: v.stages[0].dryMass, actual: before - s.y[4] - (before - s.y[4] - v.stages[0].dryMass), tolerance: 1e-9, unit: 'kg' }, { expected: 1, actual: s.stage, tolerance: 0, unit: 'stage' }];
  }),
  B('propellant-consumption', 'Propulsion', 'Test stand propellant use equals mass flow x burn time', 'm = F t / (Isp g0) within start/stop transients', () => {
    const e = { thrustVac: 100000, ispVac: 300, ispSL: 270, restarts: 0 }; const r = runTestStand(e, { profile: 'full-duration', ambient: 0 });
    return [{ expected: 100000 * 150 / (300 * G0), actual: r.summary.propellantUsed, tolerance: 0.01 * 100000 * 150 / (300 * G0), unit: 'kg' }];
  }),
  B('engine-thrust', 'Propulsion', 'Sea-level thrust ratio equals Isp ratio', 'Pressure thrust: F_SL/F_vac = Isp_SL/Isp_vac at constant mass flow', () => { const e = makeEngine({ thrustVac: 1e6, ispVac: 311, ispSL: 282 }); const sl = operatingPoint(e, 1, 101325), vac = operatingPoint(e, 1, 0); return [{ expected: 282 / 311, actual: sl.thrust / vac.thrust, tolerance: 1e-9 }]; }),
  B('atmosphere-us76', 'Atmospheric flight', 'US Standard Atmosphere 1976', 'NOAA/NASA/USAF 1976 tables (geometric altitude): 11 km 22700 Pa, 20 km 5529.3 Pa, 32 km 889.06 Pa, 0 km 1.2250 kg/m^3', () => [
    { expected: 1.225, actual: atmosphere('earth', 0).density, tolerance: 0.001, unit: 'kg/m^3' },
    { expected: 22700, actual: atmosphere('earth', 11000).pressure, tolerance: 0.003 * 22700, unit: 'Pa' },
    { expected: 5529.3, actual: atmosphere('earth', 20000).pressure, tolerance: 0.003 * 5529.3, unit: 'Pa' },
    { expected: 889.06, actual: atmosphere('earth', 32000).pressure, tolerance: 0.003 * 889.06, unit: 'Pa' },
    { expected: 216.65, actual: atmosphere('earth', 15000).temperature, tolerance: 0.1, unit: 'K' }]),
  B('mars-atmosphere', 'Atmospheric flight', 'Mars surface conditions', 'NASA Glenn Mars model: 699 Pa, ~242 K at datum', () => [{ expected: 699, actual: atmosphere('mars', 0).pressure, tolerance: 1, unit: 'Pa' }, { expected: 242.15, actual: atmosphere('mars', 0).temperature, tolerance: 0.5, unit: 'K' }]),
  B('lift-thin-airfoil', 'Atmospheric flight', 'Lift slope of a very high aspect-ratio wing', 'Thin airfoil theory: CL = 2 pi alpha', () => { const c = coefficients({ kind: 'aircraft', aspectRatio: 1e6, oswald: 1, cd0: 0, stallDeg: 20 }, { mach: 0, alpha: 5 * Math.PI / 180 }); return [{ expected: 2 * Math.PI * 5 * Math.PI / 180, actual: c.CL, tolerance: 0.001 }]; }),
  B('ballistic-entry-peak-g', 'Re-entry', 'Peak deceleration of a ballistic entry', 'Allen-Eggers: a_max = V^2 sin(gamma) / (2 e H) in an isothermal exponential atmosphere, H = 7 km', () => {
    const v = { name: 'ballistic probe', mass: 500, diameter: 1, cd: 1, liftToDrag: 0, noseRadius: 0.5, gLimit: 1e9, heatShield: { maxTemp: 1e5, ablatorMass: 1e6 }, chutes: [], touchdownLimit: 1e9, surface: 'ground' };
    // isothermal exponential atmosphere, as the analytic solution assumes
    registerAtmosphere('exp-7km', (h) => ({ temperature: 240, pressure: 101325 * Math.exp(-h / 7000), density: 1.225 * Math.exp(-h / 7000), speedOfSound: 310, gamma: 1.4, gasConstant: 287 }));
    if (!listBodies().some((b) => b.id === 'earth-exp')) registerBody({ ...getBody('earth'), id: 'earth-exp', name: 'Earth (exponential atmosphere)', atmosphere: 'exp-7km' });
    const r = simulateEntry(v, { body: 'earth-exp', entrySpeed: 7000, gammaDeg: -30, record: false, dt: 0.02 });
    const expected = 7000 ** 2 * Math.sin(30 * Math.PI / 180) / (2 * Math.E * 7000) / G0;
    return [{ expected, actual: r.maxG, tolerance: 0.1 * expected, unit: 'g' }];
  }),
  B('apollo-entry', 'Re-entry', 'Lunar-return crew capsule entry loads', 'Apollo lunar returns peaked near 6-7 g; nominal splashdown about 8.5-10 m/s', () => { const r = simulateEntry('crew-capsule', { record: false }); return [{ expected: 7, actual: r.maxG, tolerance: 2, unit: 'g' }, { expected: 1, actual: r.success ? 1 : 0, tolerance: 0 }]; }),
  B('lunar-transfer', 'Orbital mechanics', 'Trans-lunar injection delta-v from 185 km', 'Apollo TLI burns were about 3.05-3.2 km/s', () => [{ expected: 3125, actual: translunar(185e3, 110e3).tli, tolerance: 80, unit: 'm/s' }]),
  B('powered-landing', 'Landing', 'Nominal lunar landing', 'Touchdown below 3 m/s with 5-20% propellant left (Apollo-class lander)', () => { const r = simulateDescent(loadVehicle('lunar-lander'), { record: false, seed: 3 }); return [{ expected: 1, actual: r.success ? 1 : 0, tolerance: 0 }, { expected: 0.125, actual: r.propellantMarginFrac, tolerance: 0.075 }]; }),
  B('cw-closed-form', 'Docking', 'Clohessy-Wiltshire closed form matches numerical integration', 'Analytic CW state transition vs RK4 on the CW equations, 2000 s', () => {
    const s = new RendezvousSim({ record: false, initial: [-1000, -5000, 100, 0.5, 1.2, -0.1] }); const s0 = Array.from(s.s);
    for (let i = 0; i < 4000; i++) s.integrate(0.5); const a = cwPropagate(s.n, s0, 2000);
    return [{ expected: 0, actual: Math.hypot(s.s[0] - a[0], s.s[1] - a[1], s.s[2] - a[2]), tolerance: 0.01, unit: 'm' }];
  }),
  B('rendezvous-targeting', 'Docking', 'CW two-impulse targeting reaches the target', 'Propagating with the targeted velocity ends at the origin', () => { const n = 0.00113, s0 = [-2000, -15000, 300]; const v = cwTarget(n, s0, 2400); const f = cwPropagate(n, [...s0, ...v], 2400); return [{ expected: 0, actual: Math.hypot(f[0], f[1], f[2]), tolerance: 1e-3, unit: 'm' }]; }),
  B('docking', 'Docking', 'Nominal rendezvous and docking', 'Capture within mechanism limits', () => { const r = new RendezvousSim({ seed: 2, record: false }).run(); return [{ expected: 1, actual: r.success ? 1 : 0, tolerance: 0 }]; }),
  B('battery-energy', 'Power', 'Battery energy balance', '1000 W for 1 h from 10 kWh: charge drops by 10%', () => { const p = new PowerSystem({ batteryWh: 10000, batteryMaxC: 1, cycleFade: 0, loads: [{ id: 'x', name: 'Load', power: 1000, priority: 1 }], safeModeSoc: 0 }); for (let i = 0; i < 3600; i++) p.step(1, { inEclipse: true }); return [{ expected: 0.9, actual: p.soc, tolerance: 1e-6 }]; }),
  B('thermal-equilibrium', 'Thermal', 'Radiative equilibrium of a sun-facing plate', 'T = (alpha S / (epsilon sigma))^(1/4) = 393.6 K for alpha = epsilon', () => { const n = new ThermalNetwork([{ id: 'p', mass: 1, cp: 900, area: 1, emissivity: 0.5, absorptivity: 0.5, sunFacing: 1, T: 300 }]); for (let i = 0; i < 2000; i++) n.step(60, { sinkTemp: 0 }); return [{ expected: Math.pow(SOLAR_CONSTANT / SIGMA, 0.25), actual: n.node('p').T, tolerance: 0.5, unit: 'K' }]; }),
  B('comms-fspl', 'Communications', 'Free-space path loss and light time', 'FSPL(1 km, 1 GHz) = 92.45 dB; Earth-Moon light time 1.282 s', () => [{ expected: 92.45, actual: fsplDb(1000, 1e9), tolerance: 0.01, unit: 'dB' }, { expected: 1.2822, actual: lightTime(3.844e8), tolerance: 0.001, unit: 's' }]),
  B('sensor-noise', 'Sensors', 'Sensor noise and bias statistics', 'Sample standard deviation and mean match the configuration', () => {
    const s = new Sensor('a', { noiseSd: 0.5, bias: 0.2, rate: 1e9 }, 9); const v = []; for (let i = 0; i < 20000; i++) v.push(s.update(i, 10).value); const d = describe(v);
    return [{ expected: 0.5, actual: d.sd, tolerance: 0.02 }, { expected: 10.2, actual: d.mean, tolerance: 0.02 }];
  }),
  B('flight-computer-failover', 'Flight computer', 'Boot time and redundant failover', 'Boot sequence 9.0 s; backup takes over within one cycle', () => {
    const fc = new FlightComputer(); fc.powerOn(); let t = 0; while (fc.mode === 'BOOT' && t < 20) { fc.step(0.01); t += 0.01; }
    fc.setMode('LAUNCH'); fc.inject('computer-failure'); fc.step(0.01);
    return [{ expected: 9.0, actual: t, tolerance: 0.05, unit: 's' }, { expected: 1, actual: fc.active, tolerance: 0 }];
  }),
  B('pid-overshoot', 'GNC', 'PD attitude loop overshoot', 'Second-order system zeta = 0.7: overshoot exp(-pi zeta / sqrt(1 - zeta^2)) = 4.60%', () => { const r = stepResponse({ controller: { kp: 1, kd: 1.4 }, plant: PLANTS['double-integrator'](), duration: 30, dt: 0.001 }); return [{ expected: 100 * Math.exp(-Math.PI * 0.7 / Math.sqrt(1 - 0.49)), actual: r.metrics.overshootPct, tolerance: 0.3, unit: '%' }]; }),
  B('pid-poles', 'GNC', 'Closed-loop poles of a PD loop', 'Characteristic equation s^2 + 1.4 s + 1 = 0: poles -0.7 +/- 0.714i', () => { const a = closedLoopAnalysis({ kp: 1, kd: 1.4 }, PLANTS['double-integrator']()); return [{ expected: -0.7, actual: a.poles[0].re, tolerance: 1e-6 }, { expected: Math.sqrt(1 - 0.49), actual: Math.abs(a.poles[0].im), tolerance: 1e-6 }]; }),
  B('kalman-averaging', 'GNC', 'Kalman filter on repeated measurements', 'Posterior sigma = sigma / sqrt(N) for a static state with a flat prior', () => { const k = new KalmanPV({ posSd: 1e6, velSd: 1e-9, accelNoiseSd: 0 }); for (let i = 0; i < 100; i++) k.update(5, 2, 'pos', 1e9); return [{ expected: 0.2, actual: k.sigma[0], tolerance: 1e-3, unit: 'm' }]; }),
  B('reliability-algebra', 'Reliability', 'k-of-n redundancy and fault-tree OR gate', '2-of-3 with R = 0.9 gives 0.972; OR of 0.1 and 0.2 gives 0.28', () => [{ expected: 0.972, actual: kOfN(0.9, 3, 2), tolerance: 1e-9 }, { expected: 0.28, actual: evaluateFaultTree({ gate: 'OR', children: [{ id: 'a', p: 0.1 }, { id: 'b', p: 0.2 }] }), tolerance: 1e-9 }]),
  B('requirements-logic', 'Requirements', 'Requirement verification states', 'PASS, MARGIN, FAIL and UNKNOWN per the definitions', () => {
    const r = makeRequirement({ id: 'x', text: 't', metric: 'm', op: '<=', threshold: 10 });
    const s = (v) => ['PASS', 'MARGIN', 'FAIL', 'UNKNOWN'].indexOf(verify(r, { m: v }).status);
    return [{ expected: 0, actual: s(5), tolerance: 0 }, { expected: 1, actual: s(9.5), tolerance: 0 }, { expected: 2, actual: s(11), tolerance: 0 }, { expected: 3, actual: s(undefined), tolerance: 0 }];
  }),
  B('telemetry-stats', 'Telemetry', 'Recorder statistics and CSV export', 'Min/max/mean of a known channel; CSV row count', () => { const r = new FlightRecorder({ sampleInterval: 0 }); for (let i = 0; i <= 10; i++) r.record(i, { x: i * i }, true); const s = r.stats('x'); return [{ expected: 100, actual: s.max, tolerance: 0 }, { expected: 35, actual: s.mean, tolerance: 1e-12 }, { expected: 12, actual: r.toCSV().split('\n').length, tolerance: 0 }]; }),
  B('ai-permissions', 'AI tool execution', 'AI permission gates and confirmation', 'Modify is denied below its level, waits for confirmation, then creates a new version', () => {
    const P = { vehicles: { sl: loadVehicle('small-launcher') }, requirements: [], versions: new VersionStore() };
    P.versions.commit(P.vehicles.sl, 'baseline');
    const d = new MissionDirector(P, { level: 'simulate' });
    const denied = d.call('modify_vehicle', { vehicleId: 'sl', path: 'stages.1.propMass', value: 2200, reason: 'test' }).status === 'denied';
    d.setLevel('modify'); const pend = d.call('modify_vehicle', { vehicleId: 'sl', path: 'stages.1.propMass', value: 2200, reason: 'test' });
    const unchanged = P.vehicles.sl.stages[1].propMass === 2050; const done = d.confirm(pend.id);
    return [{ expected: 1, actual: denied ? 1 : 0, tolerance: 0 }, { expected: 1, actual: pend.status === 'needs-confirmation' && unchanged ? 1 : 0, tolerance: 0 }, { expected: 2200, actual: P.vehicles.sl.stages[1].propMass, tolerance: 0 }, { expected: 1, actual: done.result.newVersion === '1.1' ? 1 : 0, tolerance: 0 }];
  }),
  B('save-load', 'Save/load', 'Mid-flight snapshot resumes bit-for-bit; project file round-trips', 'Resumed run equals uninterrupted run exactly', () => {
    const v = loadVehicle('lunar-lander'); const full = new DescentSim(v, { seed: 4, record: false }).run();
    const b = new DescentSim(v, { seed: 4, record: false }); for (let i = 0; i < 2500; i++) b.step();
    const c = restoreSim(new DescentSim(v, { seed: 4, record: false }), JSON.parse(JSON.stringify(snapshotSim(b))), makeRng).run();
    const proj = loadProject(saveProject({ name: 'p', vehicles: { l: v }, requirements: [] }), { rngFactory: makeRng });
    return [{ expected: full.propellantRemaining, actual: c.propellantRemaining, tolerance: 0, unit: 'kg' }, { expected: v.stages[0].propMass, actual: proj.vehicles.l.stages[0].propMass, tolerance: 0, unit: 'kg' }];
  }),
];

export function runBenchmark(b) {
  const t0 = Date.now();
  try {
    const checks = b.fn().map((c) => { const error = c.actual - c.expected; return { ...c, error, status: Number.isFinite(c.actual) && Math.abs(error) <= c.tolerance ? 'PASS' : 'FAIL' }; });
    return { id: b.id, category: b.category, name: b.name, reference: b.reference, checks, status: checks.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL', ms: Date.now() - t0 };
  } catch (e) { return { id: b.id, category: b.category, name: b.name, reference: b.reference, checks: [], status: 'FAIL', error: e.message, ms: Date.now() - t0 }; }
}
export function runVV(filter = () => true) {
  const rows = BENCHMARKS.filter(filter).map(runBenchmark);
  return { rows, passed: rows.filter((r) => r.status === 'PASS').length, failed: rows.filter((r) => r.status === 'FAIL').length, ran: new Date().toISOString() };
}
