// Atmospheric entry, descent and landing: planar point mass with lift and drag around a rotating-free planet
// (PHYSICS, RK4), bank-angle guidance for range control, Sutton-Graves stagnation heating into an ablative heat
// shield node (APPROXIMATION), drogue and main parachutes with deployment limits, and Mars-style supersonic
// parachute + terminal descent engines. Planet rotation in the entry frame is neglected: SIMPLIFICATION.
import { getBody } from '../core/bodies.js';
import { atmosphere } from '../core/atmosphere.js';
import { G0, DEG } from '../core/constants.js';
import { makeRk4, rk4Step } from '../core/integrator.js';
import { MODEL } from '../core/provenance.js';
import { stagnationHeatFlux, ThermalNetwork } from '../thermal/thermal.js';
import { FlightRecorder } from './recorder.js';
import { Timeline } from './timeline.js';

export const ENTRY_VEHICLES = {
  'crew-capsule': { name: 'Crew command module', mass: 5560, diameter: 3.9, cd: 1.3, liftToDrag: 0.3, noseRadius: 4.7, gLimit: 12, heatShield: { maxTemp: 2900, ablatorMass: 300 },
    chutes: [{ name: 'Drogues', deployAlt: 7300, maxMach: 0.9, maxQ: 12000, cdA: 2 * 26, count: 2, needed: 1 }, { name: 'Mains', deployAlt: 3000, maxMach: 0.5, maxQ: 5000, cdA: 3 * 590, count: 3, needed: 2 }],
    touchdownLimit: 10.5, surface: 'water' },
  'mars-lander': { name: 'Mars entry capsule (rover)', mass: 3300, diameter: 4.5, cd: 1.6, liftToDrag: 0.24, noseRadius: 1.125, gLimit: 15, heatShield: { maxTemp: 2400, ablatorMass: 150 },
    chutes: [{ name: 'Supersonic parachute', deployMach: 1.8, deployAlt: 3000, maxMach: 2.2, maxQ: 850, cdA: 0.6 * Math.PI * 10.75 ** 2, count: 1, needed: 1 }],
    // Curiosity: heat shield dropped about 20 s after the parachute opens (about 385 kg), backshell separation about 1.6 km up (2.0)
    heatShieldJettison: { afterChute: 20, mass: 385 },
    poweredDescent: { startAlt: 1600, thrust: 3100 * 8, isp: 220, prop: 390, dryAfterBackshell: 1050 }, touchdownLimit: 1.0, surface: 'ground' },
};

export class EntrySim {
  constructor(vehicle, opts = {}) {
    this.v = typeof vehicle === 'string' ? ENTRY_VEHICLES[vehicle] : vehicle;
    this.o = { body: 'earth', entryAlt: 121920, entrySpeed: 11000, gammaDeg: -6.5, dt: 0.1, maxTime: 3000, sampleInterval: 1, record: true, bankDeg: 60, guidance: 'constant-bank', targetRange: null, ...opts };
    this.d = { densityScale: 1, cdScale: 1, ldScale: 1, massScale: 1, chuteFailures: [], gammaErrorDeg: 0, ...(opts.dispersions || {}) };
    this.body = getBody(this.o.body);
    this.rec = new FlightRecorder({ vehicle: this.v.name, run: opts.runName || 'entry', sampleInterval: this.o.sampleInterval });
    this.timeline = new Timeline();
    this.shield = new ThermalNetwork([{ id: 'heatshield', name: 'Heat shield', mass: 400, cp: 1500, area: Math.PI * (this.v.diameter / 2) ** 2, emissivity: 0.85, absorptivity: 0, T: 250,
      ablator: { pyrolysisTemp: 800, heatOfAblation: 2.5e7, mass: this.v.heatShield.ablatorMass }, limits: { min: 100, hot: 1800, critical: this.v.heatShield.maxTemp - 300, failure: this.v.heatShield.maxTemp } }]);
    const r0 = this.body.radius + this.o.entryAlt, g = (this.o.gammaDeg + this.d.gammaErrorDeg) * DEG;
    this.y = new Float64Array([r0, 0, this.o.entrySpeed * Math.sin(g), this.o.entrySpeed * Math.cos(g), this.v.mass * this.d.massScale]);
    this.t = 0; this.done = false; this.w = makeRk4(5); this.bank = this.o.bankDeg * DEG;
    this.chuteState = this.v.chutes.map(() => 'stowed'); this.maxG = 0; this.maxHeat = 0; this.heatLoad = 0; this.maxQ = 0;
    this.pd = null; this.exited = false;
    this.timeline.add(0, 'entry-interface', `Entry interface at ${(this.o.entryAlt / 1000).toFixed(0)} km, ${(this.o.entrySpeed / 1000).toFixed(2)} km/s, ${(this.o.gammaDeg + this.d.gammaErrorDeg).toFixed(2)} deg`);
  }
  polar(y = this.y) {
    const r = Math.hypot(y[0], y[1]), up = [y[0] / r, y[1] / r], east = [-up[1], up[0]];
    return { r, alt: r - this.body.radius, vr: y[2] * up[0] + y[3] * up[1], vt: y[2] * east[0] + y[3] * east[1], up, east, range: Math.atan2(y[1], y[0]) * this.body.radius };
  }
  dragArea() {
    let cdA = this.v.cd * this.d.cdScale * Math.PI * (this.v.diameter / 2) ** 2;
    this.v.chutes.forEach((c, i) => { if (this.chuteState[i] === 'open') cdA += c.cdA * (this.chutesWorking?.[i] ?? c.count) / c.count; });
    return cdA;
  }
  deriv = (t, y, out) => {
    const p = this.polar(y), atm = atmosphere(this.body.atmosphere, p.alt, { densityScale: this.d.densityScale });
    const sp = Math.hypot(y[2], y[3]), m = y[4];
    const g = -this.body.mu / (p.r ** 3);
    let ax = g * y[0], ay = g * y[1];
    if (atm.density > 0 && sp > 0.1) {
      const q = 0.5 * atm.density * sp * sp, D = q * this.dragArea();
      const chutesOpen = this.chuteState.some((s) => s === 'open');
      const L = chutesOpen ? 0 : D / this.dragArea() * this.v.cd * this.d.cdScale * Math.PI * (this.v.diameter / 2) ** 2 * this.v.liftToDrag * this.d.ldScale * Math.cos(this.bank);
      const ud = [-y[2] / sp, -y[3] / sp];
      // lift perpendicular to velocity in the trajectory plane, "up" side
      let ul = [-ud[1], ud[0]];
      if (ul[0] * p.up[0] + ul[1] * p.up[1] < 0) ul = [-ul[0], -ul[1]];
      ax += (D * ud[0] + L * ul[0]) / m; ay += (D * ud[1] + L * ul[1]) / m;
      this._q = q; this._D = D; this._L = L; this._rho = atm.density; this._mach = sp / (atm.speedOfSound || 1);
    } else { this._q = 0; this._D = 0; this._L = 0; this._rho = 0; this._mach = 0; }
    let mdot = 0;
    if (this.pd?.on && this.pd.prop > 0) { const T = this.pd.throttle * this.v.poweredDescent.thrust; ax += T / m * p.up[0]; ay += T / m * p.up[1]; mdot = T / (this.v.poweredDescent.isp * G0); }
    out[0] = y[2]; out[1] = y[3]; out[2] = ax; out[3] = ay; out[4] = -mdot;
  };
  guidance(p) {
    if (this.o.guidance === 'range-control' && this.o.targetRange && this._rho > 0) {
      // predictor-free range control: steer bank so remaining range matches a simple equilibrium-glide estimate
      const sp = Math.hypot(this.y[2], this.y[3]), g = this.body.mu / p.r ** 2;
      const ld = this.v.liftToDrag;
      const glideRange = ld * (p.r / 2) * Math.log(Math.max(1.01, 1 / Math.max(0.01, 1 - sp * sp / (g * p.r))));
      const togo = this.o.targetRange - p.range;
      const ratio = Math.max(-1, Math.min(1, togo / Math.max(1, glideRange)));
      this.bank = Math.acos(Math.max(-0.9, Math.min(0.95, ratio)));
    }
  }
  step(dt = this.o.dt) {
    if (this.done) return false;
    let p = this.polar();
    this.guidance(p);
    // powered descent (Mars) after backshell separation
    if (this.v.poweredDescent && !this.pd && this.chuteState[0] === 'open' && p.alt < this.v.poweredDescent.startAlt) {
      this.y[4] = this.v.poweredDescent.dryAfterBackshell + this.v.poweredDescent.prop;
      this.chuteState[0] = 'released';
      this.pd = { on: true, prop: this.v.poweredDescent.prop, throttle: 0 };
      this.timeline.add(this.t, 'separation', 'Backshell separation, powered descent');
    }
    if (this.pd?.on) {
      // braking curve: descend at the speed that can still be stopped with half the spare acceleration
      const g = this.body.mu / p.r ** 2;
      const aNet = (this.v.poweredDescent.brakeFraction ?? 0.5) * (this.v.poweredDescent.thrust / this.y[4] - g);
      const vzCmd = -Math.max(0.75, Math.min(this.v.poweredDescent.maxDescentRate ?? 120, Math.sqrt(2 * Math.max(0, aNet) * Math.max(0, p.alt - 20))));
      const a = 2 * (vzCmd - p.vr) + g;
      this.pd.throttle = Math.max(0.1, Math.min(1, a * this.y[4] / this.v.poweredDescent.thrust));
      if (this.pd.prop <= 0) { this.pd.on = false; this.timeline.add(this.t, 'failure', 'Descent propellant exhausted', { severity: 'critical' }); }
    }
    const hsj = this.v.heatShieldJettison;
    if (hsj && !this.hsDropped && this.chuteState[0] === 'open' && this.tChute != null && this.t >= this.tChute + hsj.afterChute) {
      this.hsDropped = true; this.y[4] -= hsj.mass;
      this.timeline.add(this.t, 'heatshield', `Heat shield separation (${hsj.mass} kg dropped)`);
    }
    const m0 = this.y[4];
    rk4Step(this.deriv, this.t, this.y, dt, this.w);
    if (this.pd) this.pd.prop -= m0 - this.y[4];
    this.t += dt;
    p = this.polar();
    const sp = Math.hypot(this.y[2], this.y[3]);
    const gl = this._D && this.y[4] ? Math.hypot(this._D, this._L) / this.y[4] / G0 : 0;
    this.maxG = Math.max(this.maxG, gl); this.maxQ = Math.max(this.maxQ, this._q);
    const qdot = stagnationHeatFlux(this._rho, sp, this.v.noseRadius, this.o.body);
    this.maxHeat = Math.max(this.maxHeat, qdot); this.heatLoad += qdot * dt;
    this.shield.step(dt, { inEclipse: true, aeroHeatFlux: { heatshield: this.chuteState.some((s) => s === 'open') ? 0 : 0.6 * qdot }, sinkTemp: 250 });
    const hs = this.shield.status()[0];
    // parachutes
    this.v.chutes.forEach((c, i) => {
      if (this.chuteState[i] !== 'stowed' || p.vr > 0) return;
      // trigger on Mach when the chute has a Mach trigger (with an altitude floor), otherwise on altitude
      if (c.deployMach ? !(this._mach <= c.deployMach || p.alt <= c.deployAlt) : p.alt > c.deployAlt) return;
      if (i > 0 && this.chuteState[i - 1] === 'stowed') return;
      if (this.d.chuteFailures.includes(c.name) || this.d.chuteFailures.includes(i)) { this.chuteState[i] = 'failed'; this.timeline.add(this.t, 'failure', `${c.name} failed to deploy`, { severity: 'critical', component: 'chutes' }); return; }
      const overLimit = this._mach > c.maxMach || this._q > c.maxQ;
      if (overLimit) { this.chuteState[i] = 'failed'; this.timeline.add(this.t, 'failure', `${c.name} shredded: deployed at Mach ${this._mach.toFixed(2)}, q ${(this._q / 1000).toFixed(1)} kPa (limits Mach ${c.maxMach}, ${(c.maxQ / 1000).toFixed(1)} kPa)`, { severity: 'critical', component: 'chutes' }); return; }
      this.chuteState[i] = 'open'; if (this.tChute == null) this.tChute = this.t; this.chutesWorking = this.chutesWorking || {}; this.chutesWorking[i] = c.count - (this.d.chuteFailures.filter((x) => x === `${c.name}:1`).length);
      if (i > 0 && this.chuteState[i - 1] === 'open') this.chuteState[i - 1] = 'released';
      this.timeline.add(this.t, 'parachute', `${c.name} deployed at ${(p.alt / 1000).toFixed(1)} km, ${sp.toFixed(0)} m/s`, { component: 'chutes' });
    });
    if (!this.exited && p.alt > this.o.entryAlt + 1000 && p.vr > 0) { this.exited = true; this.finish('skip-out', 'Capsule skipped out of the atmosphere'); }
    if (gl > this.v.gLimit * 1.5) this.finish('overload', `Deceleration ${gl.toFixed(1)} g exceeds structural/crew limit ${this.v.gLimit} g by 50%`);
    if (hs.status === 'FAILURE' || (this.shield.nodes[0].ablated >= this.v.heatShield.ablatorMass - 1e-6)) this.finish('burn-through', `Heat shield failure: ${hs.T.toFixed(0)} K, ablator used ${this.shield.nodes[0].ablated.toFixed(0)} kg`);
    if (p.alt <= 0) {
      const vz = -p.vr;
      const ok = vz <= this.v.touchdownLimit && this.maxG <= this.v.gLimit;
      this.touch = { vz, vh: Math.abs(p.vt) };
      this.finish(ok ? (this.v.surface === 'water' ? 'splashdown' : 'landed') : 'impact', ok ? `${this.v.surface === 'water' ? 'Splashdown' : 'Touchdown'} at ${vz.toFixed(1)} m/s, max ${this.maxG.toFixed(1)} g` : `Impact at ${vz.toFixed(1)} m/s${this.maxG > this.v.gLimit ? `, max ${this.maxG.toFixed(1)} g over the ${this.v.gLimit} g limit` : ''}`);
    }
    if (this.t > this.o.maxTime) this.finish('timeout', 'Time limit');
    if (this.o.record && (this.rec.due(this.t) || this.done)) {
      for (const [k, u] of Object.entries({ altitude: 'm', speed: 'm/s', verticalSpeed: 'm/s', range: 'm', accelerationG: 'g', dynamicPressure: 'Pa', mach: '-', heatFlux: 'W/m^2', heatShieldTemp: 'K', ablatorUsed: 'kg', bankDeg: 'deg', mass: 'kg' })) this.rec.define(k, u);
      this.rec.record(this.t, { altitude: p.alt, speed: sp, verticalSpeed: p.vr, range: p.range, accelerationG: gl, dynamicPressure: this._q, mach: this._mach, heatFlux: qdot, heatShieldTemp: hs.T, ablatorUsed: this.shield.nodes[0].ablated, bankDeg: this.bank / DEG, mass: this.y[4] }, true);
    }
    return !this.done;
  }
  finish(outcome, text) { if (this.done) return; this.done = true; this.outcome = outcome; this.endText = text; this.timeline.add(this.t, 'end', text, { severity: ['splashdown', 'landed'].includes(outcome) ? 'info' : 'critical' }); this.rec.event(this.t, 'end', text); }
  run() { while (this.step()); return this.result(); }
  result() {
    const p = this.polar();
    return { outcome: this.outcome, success: ['splashdown', 'landed'].includes(this.outcome), text: this.endText, time: this.t, maxG: this.maxG, maxHeatFlux: this.maxHeat, heatLoad: this.heatLoad, maxDynamicPressure: this.maxQ,
      maxHeatShieldTemp: this.shield.nodes[0].peakT, ablatorUsed: this.shield.nodes[0].ablated, ablatorMarginFrac: 1 - this.shield.nodes[0].ablated / this.v.heatShield.ablatorMass, range: p.range, touchdown: this.touch || null,
      recorder: this.rec, timeline: this.timeline, model: MODEL.PHYSICS, modelNote: 'Planar lifting entry (RK4) with exponential/standard atmosphere; heating by Sutton-Graves into a lumped ablator (approximation); planet rotation neglected (simplification).' };
  }
}
export const simulateEntry = (v, o) => new EntrySim(v, o).run();

// Corridor: scan flight-path angle for the steepest and shallowest angles that land safely.
export function entryCorridor(vehicle, opts = {}, { from = -2, to = -12, step = -0.1 } = {}) {
  const rows = [];
  for (let g = from; g >= to - 1e-9; g += step) {
    const r = simulateEntry(vehicle, { ...opts, gammaDeg: +g.toFixed(3), record: false, dt: 0.2 });
    rows.push({ gammaDeg: +g.toFixed(3), outcome: r.outcome, maxG: r.maxG, maxHeatFlux: r.maxHeatFlux, heatLoad: r.heatLoad });
  }
  const ok = rows.filter((r) => ['splashdown', 'landed'].includes(r.outcome));
  return { rows, shallow: ok.length ? Math.max(...ok.map((r) => r.gammaDeg)) : null, steep: ok.length ? Math.min(...ok.map((r) => r.gammaDeg)) : null };
}
