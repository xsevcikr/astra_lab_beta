// Imperfect sensor model. The sensor sees the simulation's true value and returns what an instrument would
// report: noise, bias, random-walk drift, scale-factor (calibration) error, quantization, latency, sample rate,
// dropouts, saturation and failures. APPROXIMATION of real instrument error budgets.
import { makeRng } from '../core/rng.js';
import { MODEL } from '../core/provenance.js';

export const SENSOR_PRESETS = {
  accelerometer: { units: 'm/s^2', noiseSd: 0.02, bias: 0.005, driftRate: 0.0005, resolution: 0.001, latency: 0.002, rate: 100, range: [-160, 160], scaleError: 0.0005, failureRate: 2e-6 },
  gyroscope: { units: 'rad/s', noiseSd: 1e-4, bias: 2e-5, driftRate: 5e-6, resolution: 1e-6, latency: 0.002, rate: 100, range: [-7, 7], scaleError: 0.0003, failureRate: 2e-6 },
  magnetometer: { units: 'uT', noiseSd: 0.1, bias: 0.5, driftRate: 0.001, resolution: 0.01, latency: 0.01, rate: 10, range: [-100, 100], scaleError: 0.01, failureRate: 1e-6 },
  gps: { units: 'm', noiseSd: 3, bias: 0, driftRate: 0.05, resolution: 0.01, latency: 0.1, rate: 1, range: [-1e8, 1e8], scaleError: 0, dropoutProb: 0.01, failureRate: 5e-6, maxAltitude: 3.0e7 },
  radarAltimeter: { units: 'm', noiseSd: 0.5, noiseFrac: 0.01, bias: 0, driftRate: 0, resolution: 0.1, latency: 0.05, rate: 20, range: [0, 15000], scaleError: 0.005, dropoutProb: 0.005, failureRate: 1e-5 },
  landingRadar: { units: 'm/s', noiseSd: 0.1, noiseFrac: 0.01, bias: 0, driftRate: 0, resolution: 0.01, latency: 0.05, rate: 10, range: [-600, 600], scaleError: 0.005, dropoutProb: 0.01, failureRate: 1e-5 },
  starTracker: { units: 'rad', noiseSd: 2.4e-5, bias: 5e-6, driftRate: 0, resolution: 1e-7, latency: 0.2, rate: 5, range: [-Math.PI, Math.PI], scaleError: 0, dropoutProb: 0.02, failureRate: 3e-6 },
  opticalNav: { units: 'm', noiseSd: 50, noiseFrac: 0.002, bias: 0, driftRate: 0, resolution: 1, latency: 1, rate: 0.2, range: [0, 1e10], scaleError: 0, dropoutProb: 0.05, failureRate: 5e-6 },
  temperature: { units: 'K', noiseSd: 0.3, bias: 0.5, driftRate: 0.0002, resolution: 0.1, latency: 0.5, rate: 1, range: [3, 2500], scaleError: 0.002, failureRate: 1e-6 },
  pressure: { units: 'Pa', noiseSd: 50, noiseFrac: 0.002, bias: 0, driftRate: 0.01, resolution: 1, latency: 0.01, rate: 50, range: [0, 3e7], scaleError: 0.002, failureRate: 2e-6 },
  fuelGauge: { units: 'kg', noiseSd: 5, noiseFrac: 0.005, bias: 0, driftRate: 0, resolution: 1, latency: 0.5, rate: 2, range: [0, 1e7], scaleError: 0.01, failureRate: 2e-6 },
  chamberPressure: { units: 'Pa', noiseSd: 2e4, noiseFrac: 0.003, bias: 0, driftRate: 0, resolution: 1000, latency: 0.005, rate: 200, range: [0, 3e7], scaleError: 0.003, failureRate: 3e-6 },
  camera: { units: 'px', noiseSd: 0.5, bias: 0, driftRate: 0, resolution: 1, latency: 0.05, rate: 10, range: [0, 4096], scaleError: 0, dropoutProb: 0.01, failureRate: 3e-6 },
};

export const FAILURE_MODES = ['stuck', 'zero', 'noisy', 'bias-jump', 'drift-runaway', 'dropout', 'corrupt'];

export class Sensor {
  constructor(id, cfg = {}, seed = 1) {
    const preset = cfg.type ? SENSOR_PRESETS[cfg.type] : {};
    if (cfg.type && !preset) throw new Error(`unknown sensor type ${cfg.type}`);
    this.id = id;
    this.cfg = { noiseSd: 0, noiseFrac: 0, bias: 0, driftRate: 0, resolution: 0, latency: 0, rate: 1e9, range: [-Infinity, Infinity], scaleError: 0, dropoutProb: 0, failureRate: 0, ...preset, ...cfg };
    this.rng = makeRng(seed);
    this.drift = 0;
    this.lastSampleT = -Infinity;
    this.lastT = null;
    this.buffer = []; // [t, truth] for latency
    this.fault = null;
    this.stuckValue = null;
    this.last = null;
    this.model = MODEL.APPROXIMATION;
  }
  inject(mode, params = {}) {
    if (!FAILURE_MODES.includes(mode)) throw new Error(`unknown sensor failure ${mode}`);
    this.fault = { mode, ...params };
    this.stuckValue = null;
  }
  clearFault() { this.fault = null; this.stuckValue = null; }

  // Feed the true value at sim time t. Returns a new reading when the sensor samples, otherwise null.
  update(t, truth) {
    const c = this.cfg;
    if (this.lastT !== null) {
      const dt = t - this.lastT;
      if (dt > 0 && c.driftRate) this.drift += this.rng.normal(0, c.driftRate * Math.sqrt(dt));
      if (dt > 0 && c.failureRate && !this.fault && this.rng.next() < c.failureRate * dt / 3600) this.inject(FAILURE_MODES[this.rng.int(0, 4)], { random: true });
    }
    this.lastT = t;
    this.buffer.push([t, truth]);
    if (t - this.lastSampleT < 1 / c.rate - 1e-9) return null;
    this.lastSampleT = t;
    // latency: report the newest truth at least `latency` old
    let delayed = this.buffer[0];
    while (this.buffer.length > 1 && this.buffer[1][0] <= t - c.latency) { this.buffer.shift(); delayed = this.buffer[0]; }
    if (c.latency === 0) { delayed = this.buffer[this.buffer.length - 1]; this.buffer = [delayed]; }
    const value = this._measure(delayed[1]);
    this.last = { t, value: value.value, valid: value.valid, flags: value.flags, truthTime: delayed[0] };
    return this.last;
  }

  _measure(x) {
    const c = this.cfg, f = this.fault, flags = [];
    if (f?.mode === 'dropout' || (c.dropoutProb && this.rng.next() < c.dropoutProb)) return { value: null, valid: false, flags: ['dropout'] };
    if (c.maxAltitude !== undefined && this.altitude !== undefined && this.altitude > c.maxAltitude) return { value: null, valid: false, flags: ['out-of-coverage'] };
    let sd = c.noiseSd + c.noiseFrac * Math.abs(x);
    let bias = c.bias;
    let drift = this.drift;
    if (f?.mode === 'noisy') sd *= f.factor ?? 20;
    if (f?.mode === 'bias-jump') bias += f.amount ?? (10 * (c.noiseSd || 1));
    if (f?.mode === 'drift-runaway') drift += (f.rate ?? 50 * (c.driftRate || c.noiseSd || 1)) * (this.lastT - (f.since ?? (f.since = this.lastT)));
    let y = x * (1 + c.scaleError) + bias + drift + (sd ? this.rng.normal(0, sd) : 0);
    if (f?.mode === 'stuck') { if (this.stuckValue === null) this.stuckValue = this.last?.value ?? y; y = this.stuckValue; flags.push('fault'); }
    if (f?.mode === 'zero') { y = 0; }
    if (f?.mode === 'corrupt' && this.rng.next() < (f.rate ?? 0.2)) y = (this.rng.next() - 0.5) * 2 * Math.min(1e6, Math.abs(c.range[1]) || 1e6);
    if (c.resolution) y = Math.round(y / c.resolution) * c.resolution;
    if (y > c.range[1]) { y = c.range[1]; flags.push('saturated'); }
    if (y < c.range[0]) { y = c.range[0]; flags.push('saturated'); }
    return { value: y, valid: true, flags };
  }
}

// ---- Diagnosis from telemetry only (no access to truth) ----
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function linfit(t, y) {
  const n = t.length; let st = 0, sy = 0, stt = 0, sty = 0;
  for (let i = 0; i < n; i++) { st += t[i]; sy += y[i]; stt += t[i] * t[i]; sty += t[i] * y[i]; }
  const slope = (n * sty - st * sy) / (n * stt - st * st || 1);
  return { slope, intercept: (sy - slope * st) / n };
}

// samples: [{t, value, valid}], spec: sensor cfg (expected noise/range), reference: optional samples of an
// independent measurement of the same quantity (redundant sensor or physics prediction).
export function diagnoseSensor(samples, spec = {}, reference = null) {
  const findings = [];
  const n = samples.length;
  if (!n) return [{ issue: 'no-data', severity: 'critical', evidence: 'No samples received.' }];
  const valid = samples.filter((s) => s.valid && s.value !== null);
  const dropFrac = 1 - valid.length / n;
  if (dropFrac > Math.max(0.05, 3 * (spec.dropoutProb || 0))) findings.push({ issue: 'dropouts', severity: dropFrac > 0.5 ? 'critical' : 'warning', evidence: `${(dropFrac * 100).toFixed(1)}% of samples missing (spec ${(100 * (spec.dropoutProb || 0)).toFixed(1)}%).` });
  if (valid.length < 5) return findings;
  const v = valid.map((s) => s.value), t = valid.map((s) => s.t);
  const sat = valid.filter((s) => (s.flags || []).includes('saturated') || (spec.range && (s.value >= spec.range[1] || s.value <= spec.range[0]))).length;
  if (sat / valid.length > 0.02) findings.push({ issue: 'saturation', severity: 'warning', evidence: `${sat} samples at the range limit [${spec.range}].` });
  // stuck: a long run of identical values while the reference (if any) is changing
  let run = 1, maxRun = 1;
  for (let i = 1; i < v.length; i++) { run = v[i] === v[i - 1] ? run + 1 : 1; if (run > maxRun) maxRun = run; }
  const refMoving = reference ? new Set(reference.filter((s) => s.valid).map((s) => s.value)).size > 3 : true;
  if (maxRun >= Math.max(10, v.length * 0.2) && refMoving && (spec.noiseSd || 0) > 0) findings.push({ issue: 'stuck', severity: 'critical', evidence: `${maxRun} consecutive identical readings although the sensor should show noise of ${spec.noiseSd} ${spec.units || ''}.` });
  // spikes: points far from local median (MAD)
  const diffs = v.slice(1).map((x, i) => x - v[i]);
  const mad = median(diffs.map((d) => Math.abs(d - median(diffs)))) || 1e-12;
  const spikes = diffs.filter((d) => Math.abs(d) > 12 * 1.4826 * mad + 6 * (spec.noiseSd || 0)).length;
  if (spikes > Math.max(2, 0.01 * v.length)) findings.push({ issue: 'corrupt-data', severity: 'critical', evidence: `${spikes} jumps larger than 12 robust standard deviations.` });
  // noise level from successive differences (removes slow trends)
  const noise = 1.4826 * mad / Math.SQRT2;
  const expected = (spec.noiseSd || 0) + (spec.noiseFrac || 0) * Math.abs(median(v));
  if (expected > 0 && noise > 4 * expected) findings.push({ issue: 'excess-noise', severity: 'warning', evidence: `Measured noise ${noise.toPrecision(3)} vs expected ${expected.toPrecision(3)} ${spec.units || ''}.` });
  if (reference) {
    // align by nearest time, then look at the residual's mean (bias) and slope (drift)
    const ref = reference.filter((s) => s.valid && s.value !== null);
    if (ref.length > 5) {
      let j = 0; const rt = [], rr = [];
      for (const s of valid) {
        while (j < ref.length - 1 && Math.abs(ref[j + 1].t - s.t) <= Math.abs(ref[j].t - s.t)) j++;
        if (Math.abs(ref[j].t - s.t) < 2) { rt.push(s.t); rr.push(s.value - ref[j].value); }
      }
      if (rr.length > 5) {
        const fit = linfit(rt, rr);
        const span = rt[rt.length - 1] - rt[0];
        const meanRes = rr.reduce((a, b) => a + b, 0) / rr.length;
        const tol = 5 * (expected || 1e-9) + Math.abs(spec.bias || 0) * 3;
        if (Math.abs(fit.slope * span) > tol) findings.push({ issue: 'drift', severity: 'warning', evidence: `Disagrees with reference by a trend of ${fit.slope.toPrecision(3)} ${spec.units || ''}/s over ${span.toFixed(0)} s.` });
        else if (Math.abs(meanRes) > tol) findings.push({ issue: 'bias', severity: 'warning', evidence: `Mean offset ${meanRes.toPrecision(3)} ${spec.units || ''} against the reference (tolerance ${tol.toPrecision(3)}).` });
      }
    }
  }
  return findings;
}

// Majority voting across redundant sensors; flags the outlier (fault isolation).
export function voteRedundant(readings, tolerance) {
  const ok = readings.filter((r) => r && r.valid && r.value !== null);
  if (ok.length === 0) return { value: null, valid: false, excluded: readings.map((_, i) => i) };
  if (ok.length < 3) return { value: ok.reduce((a, r) => a + r.value, 0) / ok.length, valid: true, excluded: [], degraded: true };
  const med = median(ok.map((r) => r.value));
  const excluded = [];
  readings.forEach((r, i) => { if (!r || !r.valid || Math.abs(r.value - med) > tolerance) excluded.push(i); });
  const kept = readings.filter((_, i) => !excluded.includes(i));
  return { value: kept.reduce((a, r) => a + r.value, 0) / kept.length, valid: true, excluded, degraded: excluded.length > 0 };
}
