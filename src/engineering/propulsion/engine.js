// Liquid rocket engine model and test stand.
// Thrust/Isp vs ambient pressure: PHYSICS (fixed nozzle momentum + pressure thrust).
// Chamber pressure ~ throttle, chamber temperature and low-throttle Isp loss: APPROXIMATION.
import { G0 } from '../core/constants.js';
import { MODEL, tagged } from '../core/provenance.js';
import { Sensor } from '../sensors/sensor.js';

export const PROPELLANTS = {
  kerolox: { name: 'LOX / RP-1', mixtureRatio: 2.56, chamberTemp: 3670 },
  hydrolox: { name: 'LOX / LH2', mixtureRatio: 5.5, chamberTemp: 3500 },
  methalox: { name: 'LOX / CH4', mixtureRatio: 3.6, chamberTemp: 3550 },
  hypergolic: { name: 'N2O4 / Aerozine-50', mixtureRatio: 1.6, chamberTemp: 3300 },
  solid: { name: 'APCP solid', mixtureRatio: 0, chamberTemp: 3300 },
};

export function makeEngine(spec) {
  const e = { propellant: 'kerolox', chamberPressure: 7e6, throttleMin: 0.4, throttleMax: 1.0, gimbalDeg: 5, restarts: 0, ignitionTau: 0.25, shutdownTau: 0.15, ...spec };
  if (!(e.thrustVac > 0) || !(e.ispVac > 0)) throw new Error('engine needs thrustVac and ispVac');
  if (e.exitArea === undefined) e.exitArea = e.ispSL ? (e.thrustVac * (1 - e.ispSL / e.ispVac)) / 101325 : 0.002 * e.thrustVac / 1e4;
  e.mixtureRatio ??= PROPELLANTS[e.propellant]?.mixtureRatio ?? 2.5;
  return e;
}

// Steady-state operating point for a given throttle and ambient pressure.
export function operatingPoint(e, throttle, ambient = 0, health = {}) {
  const th = Math.max(0, Math.min(e.throttleMax, throttle));
  if (th <= 0) return { thrust: 0, isp: 0, mdot: 0, chamberPressure: 0, chamberTemp: 0, fuelFlow: 0, oxFlow: 0, efficiency: 0, flowSeparation: false };
  const eff = (health.efficiency ?? 1) * (1 - 0.04 * Math.max(0, (0.6 - th) / 0.6)); // low-throttle injector loss (approx.)
  const pc = e.chamberPressure * th * (health.pcFactor ?? 1);
  const mdot = (e.thrustVac * th) / (e.ispVac * G0 * eff) * (health.pcFactor ?? 1);
  const vacThrust = mdot * e.ispVac * eff * G0;
  const thrust = Math.max(0, vacThrust - ambient * e.exitArea);
  // nozzle flow separation when exit pressure falls far below ambient (Summerfield, approx.: pe < 0.4 pa)
  const peRated = e.exitPressure ?? (e.ispSL && e.ispSL / e.ispVac > 0.8 ? 0.7 * 101325 : e.chamberPressure / 1000);
  const pe = peRated * th; // exit pressure scales with chamber pressure
  const mr = e.mixtureRatio * (health.mrFactor ?? 1);
  const tcBase = PROPELLANTS[e.propellant]?.chamberTemp ?? 3400;
  const mrDev = Math.abs(mr / e.mixtureRatio - 1);
  return {
    thrust, mdot, isp: thrust / (mdot * G0), chamberPressure: pc,
    chamberTemp: tcBase * (1 - 0.5 * mrDev * mrDev) * (0.85 + 0.15 * th),
    fuelFlow: mdot / (1 + mr), oxFlow: mdot * mr / (1 + mr), mixtureRatio: mr,
    efficiency: thrust / (e.thrustVac * th), flowSeparation: ambient > 0 && pe < 0.4 * ambient,
  };
}

export const TEST_PROFILES = {
  'acceptance': [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 30, cmd: 'throttle', throttle: e => e.throttleMin }, { at: 45, cmd: 'throttle', throttle: 1 }, { at: 60, cmd: 'shutdown' }],
  'full-duration': [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 150, cmd: 'shutdown' }],
  'restart': [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 10, cmd: 'shutdown' }, { at: 20, cmd: 'ignite', throttle: 1 }, { at: 30, cmd: 'shutdown' }],
  'gimbal-sweep': [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 5, cmd: 'gimbal', deg: 1 }, { at: 10, cmd: 'gimbal', deg: -1 }, { at: 15, cmd: 'gimbal', deg: 0 }, { at: 20, cmd: 'shutdown' }],
  'throttle-ladder': [{ at: 0, cmd: 'ignite', throttle: 1 }, { at: 10, cmd: 'throttle', throttle: 0.8 }, { at: 20, cmd: 'throttle', throttle: 0.6 }, { at: 30, cmd: 'throttle', throttle: e => e.throttleMin }, { at: 40, cmd: 'throttle', throttle: 1 }, { at: 50, cmd: 'shutdown' }],
};

// Run a test profile on the stand. Every channel is computed from the engine model; the "measured" channels
// pass through sensor models so the test data looks like real instrumentation.
export function runTestStand(spec, { profile = 'acceptance', ambient = 101325, dt = 0.01, propellant = Infinity, faults = [], seed = 7, sampleEvery = 0.05 } = {}) {
  const e = makeEngine(spec);
  const steps = typeof profile === 'string' ? TEST_PROFILES[profile] : profile;
  if (!steps) throw new Error(`unknown test profile ${profile}`);
  const end = steps[steps.length - 1].at + 3;
  const pcSensor = new Sensor('pc', { type: 'chamberPressure' }, seed);
  const thrustSensor = new Sensor('loadcell', { noiseSd: 0.002 * e.thrustVac, rate: 200, resolution: 10 }, seed + 1);
  let on = false, cmdThrottle = 0, level = 0, gimbal = 0, starts = 0, used = 0, burn = 0, nextSample = 0;
  const series = { t: [], thrust: [], thrustMeasured: [], isp: [], chamberPressure: [], chamberPressureMeasured: [], mdot: [], mixtureRatio: [], chamberTemp: [], throttle: [], gimbal: [], propellantUsed: [], efficiency: [] };
  const events = [], anomalies = [];
  let k = 0;
  for (let t = 0; t <= end + 1e-9; t += dt) {
    while (k < steps.length && steps[k].at <= t + 1e-9) {
      const s = steps[k++];
      const thr = typeof s.throttle === 'function' ? s.throttle(e) : s.throttle;
      if (s.cmd === 'ignite') {
        if (starts > e.restarts) { anomalies.push({ t, issue: 'restart-limit', text: `Ignition refused: engine rated for ${e.restarts} restart(s).` }); continue; }
        on = true; starts++; cmdThrottle = thr; events.push({ t, type: 'ignition', text: `Ignition ${starts}` });
      } else if (s.cmd === 'throttle') {
        if (thr < e.throttleMin) anomalies.push({ t, issue: 'below-min-throttle', text: `Commanded ${(thr * 100).toFixed(0)}% is below the ${(e.throttleMin * 100).toFixed(0)}% minimum; held at minimum.` });
        cmdThrottle = Math.max(thr, e.throttleMin); events.push({ t, type: 'throttle', text: `Throttle ${(cmdThrottle * 100).toFixed(0)}%` });
      } else if (s.cmd === 'gimbal') {
        if (Math.abs(s.deg) > e.gimbalDeg) anomalies.push({ t, issue: 'gimbal-limit', text: `Gimbal ${s.deg} deg exceeds ${e.gimbalDeg} deg limit.` });
        gimbal = Math.max(-e.gimbalDeg, Math.min(e.gimbalDeg, s.deg)); events.push({ t, type: 'gimbal', text: `Gimbal ${gimbal} deg` });
      } else if (s.cmd === 'shutdown') { on = false; events.push({ t, type: 'shutdown', text: 'Shutdown' }); }
    }
    const health = {};
    for (const f of faults) if (t >= f.at) Object.assign(health, f.effect);
    if (used >= propellant && on) { on = false; events.push({ t, type: 'depletion', text: 'Propellant depleted' }); }
    const target = on ? cmdThrottle : 0;
    const tau = target > level ? e.ignitionTau : e.shutdownTau;
    level += (target - level) * Math.min(1, dt / tau);
    if (level < 1e-4) level = 0;
    const op = operatingPoint(e, level, ambient, health);
    used += op.mdot * dt;
    if (op.thrust > 0.05 * e.thrustVac) burn += dt;
    if (op.flowSeparation && on && level > 0.95 * cmdThrottle && !anomalies.some((a) => a.issue === 'flow-separation')) anomalies.push({ t, issue: 'flow-separation', text: 'Nozzle exit pressure far below ambient: flow separation and side loads likely.' });
    const pcm = pcSensor.update(t, op.chamberPressure), fm = thrustSensor.update(t, op.thrust);
    if (t >= nextSample - 1e-9) {
      nextSample += sampleEvery;
      series.t.push(+t.toFixed(4)); series.thrust.push(op.thrust); series.isp.push(op.isp); series.chamberPressure.push(op.chamberPressure);
      series.thrustMeasured.push(fm?.value ?? thrustSensor.last?.value ?? 0); series.chamberPressureMeasured.push(pcm?.value ?? pcSensor.last?.value ?? 0);
      series.mdot.push(op.mdot); series.mixtureRatio.push(op.mixtureRatio || 0); series.chamberTemp.push(op.chamberTemp); series.throttle.push(level);
      series.gimbal.push(gimbal); series.propellantUsed.push(used); series.efficiency.push(op.efficiency);
    }
  }
  const full = operatingPoint(e, 1, ambient);
  const peak = Math.max(...series.thrust);
  const checks = [
    { name: 'Rated thrust at 100%', expected: full.thrust, actual: peak, tolerance: 0.03 * full.thrust },
    { name: 'No anomalies', expected: 0, actual: anomalies.length, tolerance: 0 },
  ].map((c) => ({ ...c, error: c.actual - c.expected, status: Math.abs(c.actual - c.expected) <= c.tolerance ? 'PASS' : 'FAIL' }));
  return tagged(MODEL.APPROXIMATION, 'Steady-state engine balance with first-order start/stop transients; no combustion dynamics.', {
    engine: e, profile, ambient, series, events, anomalies, checks,
    summary: { peakThrust: peak, propellantUsed: used, burnTime: burn, starts, ispAtFull: full.isp, avgIsp: used > 0 ? series.thrust.reduce((a, f, i) => a + f * (series.t[i + 1] - series.t[i] || 0), 0) / (used * G0) : 0 },
  });
}
