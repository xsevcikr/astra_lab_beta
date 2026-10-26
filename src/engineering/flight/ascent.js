// Ascent flight simulation: planar 3-DOF point mass (position, velocity, mass) around a rotating planet with
// atmosphere, drag and lift from the aero model, ambient-pressure-dependent thrust, staging, guidance, engine
// failures and environment dispersions. Equations of motion: PHYSICS (RK4). Attitude follows the guidance
// command through a rate limit instead of full rigid-body dynamics: SIMPLIFICATION.
import { getBody } from '../core/bodies.js';
import { atmosphere, windAt } from '../core/atmosphere.js';
import { G0, DEG } from '../core/constants.js';
import { makeRk4, rk4Step } from '../core/integrator.js';
import { MODEL } from '../core/provenance.js';
import { coefficients } from '../aero/aero.js';
import { engineThrust } from '../vehicle/model.js';
import { FlightRecorder } from './recorder.js';
import { Timeline } from './timeline.js';
import { vehicleLoads } from '../structures/structures.js';
import { stagnationHeatFlux } from '../thermal/thermal.js';

const ATM_TOP = { earth: 120000, mars: 125000 };

export class AscentSim {
  constructor(vehicle, opts = {}) {
    this.v = vehicle;
    this.o = {
      body: 'earth', targetAlt: 200e3, launchLatDeg: 28.5, dt: 0.1, maxTime: 1500, kickSpeed: 60, kickDeg: 4, kickDuration: 12,
      coastBeforeIgnition: 2, record: true, sampleInterval: 1, subsystems: true, pitchRateLimit: 5 * DEG, maxQAlpha: 250000 * DEG * 3, ...opts,
    };
    this.env = { densityScale: 1, temperatureOffset: 0, windJet: 0, ...(opts.env || {}) };
    this.disp = { thrustScale: [], ispScale: [], massScale: 1, propScale: [], pitchBiasDeg: 0, ...(opts.dispersions || {}) };
    this.failures = [...(opts.failures || [])].sort((a, b) => a.t - b.t);
    this.body = getBody(this.o.body);
    this.rec = new FlightRecorder({ vehicle: vehicle.name, run: opts.runName || 'ascent', sampleInterval: this.o.sampleInterval });
    this.timeline = new Timeline();
    this.init();
  }
  init() {
    const b = this.body, v = this.v;
    this.stage = 0;
    this.prop = v.stages.map((s, i) => s.propMass * (this.disp.propScale[i] ?? 1));
    this.enginesOut = v.stages.map(() => 0);
    this.engineFailed = v.stages.map(() => false);
    const mass = (v.stages.reduce((a, s, i) => a + s.dryMass + this.prop[i], 0) + v.payload.mass) * this.disp.massScale;
    this.massError = mass - v.stages.reduce((a, s, i) => a + s.dryMass + this.prop[i], 0) - v.payload.mass;
    const lat = this.o.launchLatDeg * DEG;
    this.y = new Float64Array([b.radius, 0, 0, b.rotationRate * b.radius * Math.cos(lat), mass]);
    this.t = 0; this.pitch = 90 * DEG; this.thrusting = true; this.coastUntil = 0;
    this.phase = 'liftoff'; this.done = false; this.outcome = null;
    this.maxQ = { q: 0, t: 0, alt: 0 }; this.maxG = 0; this.maxHeat = 0; this.minStructMargin = Infinity; this.maxQAlpha = 0;
    this.losses = { gravity: 0, drag: 0, steering: 0 };
    this.noseTemp = 290;
    this.w = makeRk4(5);
    this.lastAero = { drag: 0, lift: 0, q: 0, mach: 0, alpha: 0, thrust: 0 };
    this.timeline.add(0, 'liftoff', 'Liftoff', { severity: 'info', component: 'stage1' });
    this.rec.event(0, 'liftoff', 'Liftoff');
  }
  // --- geometry helpers ---
  get r() { return Math.hypot(this.y[0], this.y[1]); }
  get alt() { return this.r - this.body.radius; }
  frame() {
    const [x, yy, vx, vy] = this.y, r = Math.hypot(x, yy);
    const up = [x / r, yy / r], east = [-yy / r, x / r];
    return { up, east, vr: vx * up[0] + vy * up[1], vt: vx * east[0] + vy * east[1], r };
  }
  airVelocity(y = this.y) {
    const lat = this.o.launchLatDeg * DEG, w = this.body.rotationRate * Math.cos(lat);
    const r = Math.hypot(y[0], y[1]), alt = r - this.body.radius;
    const wind = windAt(alt, { jet: this.env.windJet, surface: this.env.windSurface || 0 }); // + = eastward
    const east = [-y[1] / r, y[0] / r];
    return [y[2] - (-w * y[1] + wind * east[0]), y[3] - (w * y[0] + wind * east[1])];
  }
  stageMassAbove(i) { return this.v.stages.slice(i + 1).reduce((a, s, k) => a + s.dryMass + this.prop[i + 1 + k], 0) + this.v.payload.mass; }
  currentThrust(ambient) {
    if (!this.thrusting || this.t < this.coastUntil || this.stage >= this.v.stages.length || this.prop[this.stage] <= 0) return { F: 0, mdot: 0 };
    const s = this.v.stages[this.stage];
    let F = 0, mdot = 0;
    for (const e of s.engines) {
      const n = (e.count ?? 1) - this.enginesOut[this.stage];
      if (n <= 0 || this.engineFailed[this.stage]) continue;
      const ts = this.disp.thrustScale[this.stage] ?? 1, is = this.disp.ispScale[this.stage] ?? 1;
      const f = engineThrust({ ...e, count: n }, ambient) * ts;
      F += f;
      mdot += (e.thrustVac * n * ts) / (e.ispVac * is * G0);
    }
    return { F, mdot };
  }
  guidance(fr, accelT) {
    const t = this.t, alt = this.alt;
    const vAir = this.airVelocity();
    const speedAir = Math.hypot(vAir[0], vAir[1]);
    const inAtm = alt < (ATM_TOP[this.o.body] ?? 0) * 0.5 && atmosphere(this.body.atmosphere, alt).density * 0.5 * speedAir * speedAir > 500;
    if (this.phase === 'liftoff' && speedAir > this.o.kickSpeed) { this.phase = 'pitch-kick'; this.kickStart = t; this.timeline.add(t, 'pitch-kick', 'Pitch program start'); }
    if (this.phase === 'pitch-kick' && t - this.kickStart > this.o.kickDuration) this.phase = 'gravity-turn';
    if (this.phase === 'gravity-turn' && !inAtm && (alt > 20000 || !this.body.atmosphere)) { this.phase = 'closed-loop'; this.timeline.add(t, 'guidance', 'Closed-loop guidance engaged'); }
    if (this.phase === 'liftoff') return 90 * DEG;
    if (this.phase === 'pitch-kick') return (90 - this.o.kickDeg * Math.min(1, (t - this.kickStart) / this.o.kickDuration)) * DEG;
    if (this.phase === 'gravity-turn') {
      // gravity turn flown along the Earth-relative velocity (wind-independent reference), with load relief:
      // the angle of attack the wind would cause is limited to q*alpha <= qAlphaMax, otherwise the vehicle
      // weathervanes into the air-relative velocity. A pure zero-alpha turn lets a head wind tip the
      // trajectory over into the ground; a pure ground-relative turn overloads the structure.
      const lat = this.o.launchLatDeg * DEG, w = this.body.rotationRate * Math.cos(lat);
      const vg = [this.y[2] + w * this.y[1], this.y[3] - w * this.y[0]];
      const ground = Math.atan2(vg[0] * fr.up[0] + vg[1] * fr.up[1], vg[0] * fr.east[0] + vg[1] * fr.east[1]);
      const air = Math.atan2(vAir[0] * fr.up[0] + vAir[1] * fr.up[1], vAir[0] * fr.east[0] + vAir[1] * fr.east[1]);
      const q = 0.5 * atmosphere(this.body.atmosphere, alt, this.env).density * speedAir * speedAir;
      const aMax = (this.o.qAlphaMax ?? 2500) / Math.max(q, 1);
      return air + Math.max(-aMax, Math.min(aMax, ground - air));
    }
    // closed-loop: linear-tangent-like radial channel targeting r = rT, vr = 0 when vt = circular speed
    const rT = this.body.radius + this.o.targetAlt, vT = Math.sqrt(this.body.mu / rT);
    if (accelT <= 0) return this.pitch;
    // time-to-go from the rocket equation across the remaining stages (acceleration grows as mass drops)
    let dvGo = Math.hypot(vT - fr.vt, fr.vr), tgo = 0, m = this.y[4];
    for (let i = this.stage; i < this.v.stages.length && dvGo > 0; i++) {
      const s = this.v.stages[i], F = s.engines.reduce((a, e) => a + e.thrustVac * Math.max(0, (e.count ?? 1) - this.enginesOut[i]), 0);
      if (F <= 0) continue;
      const mdot = s.engines.reduce((a, e) => a + e.thrustVac * Math.max(0, (e.count ?? 1) - this.enginesOut[i]) / (e.ispVac * G0), 0);
      const ve = F / mdot, prop = this.prop[i], dvStage = ve * Math.log(m / (m - prop));
      if (dvStage >= dvGo) { tgo += (m / mdot) * (1 - Math.exp(-dvGo / ve)); dvGo = 0; }
      else { tgo += prop / mdot; dvGo -= dvStage; m -= prop + s.dryMass; }
    }
    tgo = Math.max(8, tgo + (dvGo > 0 ? dvGo / Math.max(accelT, 1) : 0));
    const c0 = 6 * (rT - fr.r - fr.vr * tgo) / (tgo * tgo) - 2 * (0 - fr.vr) / tgo;
    const need = c0 + this.body.mu / (fr.r * fr.r) - fr.vt * fr.vt / fr.r;
    return Math.asin(Math.max(-0.6, Math.min(0.95, need / accelT)));
  }
  deriv = (t, y, out) => {
    const r = Math.hypot(y[0], y[1]), alt = r - this.body.radius;
    const atm = atmosphere(this.body.atmosphere, alt, this.env);
    const g = -this.body.mu / (r * r * r);
    const { F, mdot } = this.currentThrust(atm.pressure);
    const m = y[4];
    const up = [y[0] / r, y[1] / r], east = [-y[1] / r, y[0] / r];
    const dir = [Math.cos(this.pitch) * east[0] + Math.sin(this.pitch) * up[0], Math.cos(this.pitch) * east[1] + Math.sin(this.pitch) * up[1]];
    let ax = g * y[0] + F / m * dir[0], ay = g * y[1] + F / m * dir[1];
    if (atm.density > 0) {
      const va = this.airVelocity(y), sp = Math.hypot(va[0], va[1]);
      if (sp > 0.1) {
        const mach = sp / atm.speedOfSound;
        const flightAngle = Math.atan2(va[0] * up[0] + va[1] * up[1], va[0] * east[0] + va[1] * east[1]);
        const alpha = this.pitch - flightAngle;
        const geo = { kind: 'rocket', diameter: this.v.aero.diameter, length: this.v.aero.length, cd0: this.v.aero.cd0 };
        const c = coefficients(geo, { mach, alpha });
        const q = 0.5 * atm.density * sp * sp, S = Math.PI * (this.v.aero.diameter / 2) ** 2;
        const D = q * S * c.CD, L = q * S * c.CL;
        const ud = [-va[0] / sp, -va[1] / sp], ul = [-ud[1] * Math.sign(alpha || 1), ud[0] * Math.sign(alpha || 1)];
        ax += (D * ud[0] + Math.abs(L) * ul[0]) / m; ay += (D * ud[1] + Math.abs(L) * ul[1]) / m;
        this._aero = { drag: D, lift: L, q, mach, alpha, density: atm.density, speedAir: sp };
      }
    } else this._aero = { drag: 0, lift: 0, q: 0, mach: 0, alpha: 0, density: 0, speedAir: 0 };
    this._thrust = F; this._mdot = mdot;
    out[0] = y[2]; out[1] = y[3]; out[2] = ax; out[3] = ay; out[4] = -mdot;
  };
  applyFailures() {
    while (this.failures.length && this.failures[0].t <= this.t) {
      const f = this.failures.shift();
      const st = f.stage ?? this.stage;
      if (f.type === 'engine-out') { this.enginesOut[st] += f.engines ?? 1; this.timeline.add(this.t, 'failure', `Engine out on ${this.v.stages[st].name}`, { severity: 'critical', component: `${this.v.stages[st].id}.engine` }); }
      if (f.type === 'engine-failure') { this.engineFailed[st] = true; this.timeline.add(this.t, 'failure', `All engines lost on ${this.v.stages[st].name}`, { severity: 'critical' }); }
      if (f.type === 'thrust-loss') { this.disp.thrustScale[st] = (this.disp.thrustScale[st] ?? 1) * (1 - (f.fraction ?? 0.2)); this.timeline.add(this.t, 'failure', `Thrust loss ${(100 * (f.fraction ?? 0.2)).toFixed(0)}% on ${this.v.stages[st].name}`, { severity: 'warning' }); }
      if (f.type === 'propellant-leak') { this.leak = { stage: st, rate: f.rate ?? 20 }; this.timeline.add(this.t, 'failure', `Propellant leak ${f.rate ?? 20} kg/s on ${this.v.stages[st].name}`, { severity: 'critical' }); }
      this.rec.event(this.t, 'failure', f.type);
    }
  }
  step(dt = this.o.dt) {
    if (this.done) return false;
    this.applyFailures();
    const fr = this.frame();
    const atm0 = atmosphere(this.body.atmosphere, this.alt, this.env);
    const th = this.currentThrust(atm0.pressure);
    const cmd = this.guidance(fr, th.F / this.y[4]) + this.disp.pitchBiasDeg * DEG;
    const maxStep = this.o.pitchRateLimit * dt;
    this.pitch += Math.max(-maxStep, Math.min(maxStep, cmd - this.pitch));
    const propBefore = this.prop[this.stage];
    const m0 = this.y[4];
    rk4Step(this.deriv, this.t, this.y, dt, this.w);
    this.t += dt;
    let used = m0 - this.y[4];
    if (this.leak && this.leak.stage === this.stage) { const l = Math.min(this.prop[this.stage] - used, this.leak.rate * dt); if (l > 0) { this.y[4] -= l; used += l; } }
    if (this.stage < this.v.stages.length) this.prop[this.stage] = Math.max(0, propBefore - used);
    // loss accounting
    const a = this._aero || {};
    const fr2 = this.frame();
    const sp = Math.hypot(this.y[2], this.y[3]);
    const gamma = Math.asin(Math.max(-1, Math.min(1, fr2.vr / (sp || 1))));
    if (this._thrust > 0) {
      this.losses.gravity += this.body.mu / (fr2.r * fr2.r) * Math.sin(gamma) * dt;
      this.losses.drag += (a.drag || 0) / this.y[4] * dt;
      const velAngle = Math.atan2(fr2.vr, fr2.vt);
      this.losses.steering += this._thrust / this.y[4] * (1 - Math.cos(this.pitch - velAngle)) * dt;
    }
    if ((a.q || 0) > this.maxQ.q) this.maxQ = { q: a.q, t: this.t, alt: this.alt };
    const accel = this._thrust / this.y[4] + (a.drag || 0) / this.y[4] * -1;
    const sensedG = Math.abs((this._thrust - (a.drag || 0)) / this.y[4]) / G0;
    this.maxG = Math.max(this.maxG, sensedG);
    const qa = (a.q || 0) * Math.abs(a.alpha || 0);
    this.maxQAlpha = Math.max(this.maxQAlpha, qa);
    // nose heating (Sutton-Graves) into a lumped skin node, radiating at emissivity 0.8
    const qdot = a.density ? stagnationHeatFlux(a.density, a.speedAir, this.o.noseRadius ?? 0.5, this.o.body) : 0;
    this.maxHeat = Math.max(this.maxHeat, qdot);
    this.noseTemp += (0.3 * qdot - 0.8 * 5.67e-8 * (this.noseTemp ** 4 - 250 ** 4)) / (8 * 900) * dt * 1; // 8 kg/m^2 skin, cp 900
    // staging
    if (this.stage < this.v.stages.length && this.prop[this.stage] <= 1e-6 && this.thrusting) this.stageEvent();
    if (this.stage < this.v.stages.length && this._thrust === 0 && this.t > this.coastUntil + 1 && this.prop[this.stage] > 0 && (this.engineFailed[this.stage] || this.enginesOut[this.stage] >= (this.v.stages[this.stage].engines[0].count ?? 1)) && this.thrusting) {
      this.timeline.add(this.t, 'staging', `Emergency staging: ${this.v.stages[this.stage].name} has no thrust`, { severity: 'critical' });
      this.stageEvent(true);
    }
    // cutoff on target energy
    const rT = this.body.radius + this.o.targetAlt;
    const energy = sp * sp / 2 - this.body.mu / fr2.r;
    if (this.thrusting && this.phase === 'closed-loop' && energy >= -this.body.mu / (2 * rT)) {
      this.thrusting = false; this.phase = 'coast';
      this.timeline.add(this.t, 'cutoff', 'Engine cutoff: target orbit energy reached', { component: this.v.stages[this.stage]?.id });
      this.rec.event(this.t, 'cutoff', 'Engine cutoff');
    }
    // structural break-up from aerodynamic load (q*alpha)
    if (qa > this.o.maxQAlpha) this.finish('structural-failure', `q·alpha ${(qa / DEG / 1000).toFixed(0)} kPa·deg exceeded the ${(this.o.maxQAlpha / DEG / 1000).toFixed(0)} kPa·deg limit`);
    if (this.alt < -1 && this.t > 5) this.finish('impact', 'Vehicle hit the ground');
    if (this.alt < 0 && this.t > 2 && fr2.vr < 0 && this.t < 30) this.finish('impact', 'Vehicle failed to climb');
    if (!this.thrusting || this.stage >= this.v.stages.length) {
      const el = this.elements();
      const minPeri = this.o.minPeriapsis ?? (this.body.atmosphere ? (ATM_TOP[this.o.body] ?? 100000) + 20000 : 10000);
      if (el.periapsisAlt > minPeri && el.e < 1) this.finish('orbit', `Orbit ${(el.periapsisAlt / 1000).toFixed(0)} x ${(el.apoapsisAlt / 1000).toFixed(0)} km`);
      else if ((fr2.vr < 0 && this.alt < (this.body.atmosphere ? (ATM_TOP[this.o.body] ?? 100000) : minPeri)) || (this.stage >= this.v.stages.length && this.alt > (ATM_TOP[this.o.body] ?? 0))) this.finish('suborbital', `Insufficient velocity: periapsis ${(el.periapsisAlt / 1000).toFixed(0)} km`);
    }
    if (this.t > this.o.maxTime) this.finish('timeout', 'Simulation time limit');
    if (this.o.record && (this.rec.due(this.t) || this.done)) this.record(sensedG, gamma);
    return !this.done;
  }
  stageEvent(emergency = false) {
    const s = this.v.stages[this.stage];
    this.y[4] -= s.dryMass + this.prop[this.stage];
    this.prop[this.stage] = 0;
    this.timeline.add(this.t, 'separation', `${s.name} separation${emergency ? ' (emergency)' : ''}`, { component: s.id });
    this.rec.event(this.t, 'separation', `${s.name} separation`);
    this.stage++;
    if (this.stage < this.v.stages.length) {
      this.coastUntil = this.t + this.o.coastBeforeIgnition;
      this.timeline.add(this.coastUntil, 'ignition', `${this.v.stages[this.stage].name} ignition`, { component: this.v.stages[this.stage].id });
    } else {
      this.thrusting = false;
      this.timeline.add(this.t, 'burnout', 'All stages expended');
    }
  }
  elements() {
    const [x, y, vx, vy] = this.y, r = Math.hypot(x, y), v2 = vx * vx + vy * vy;
    const energy = v2 / 2 - this.body.mu / r, h = x * vy - y * vx;
    const a = -this.body.mu / (2 * energy), e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (this.body.mu ** 2)));
    return { a, e, periapsisAlt: a * (1 - e) - this.body.radius, apoapsisAlt: e < 1 ? a * (1 + e) - this.body.radius : Infinity, energy };
  }
  record(sensedG, gamma) {
    const a = this._aero || {}, el = this.elements(), fr = this.frame();
    const frame = {
      altitude: this.alt, downrange: Math.atan2(this.y[1], this.y[0]) * this.body.radius, speed: Math.hypot(this.y[2], this.y[3]), airspeed: a.speedAir || 0,
      verticalSpeed: fr.vr, horizontalSpeed: fr.vt, accelerationG: sensedG, dynamicPressure: a.q || 0, mach: a.mach || 0, alphaDeg: (a.alpha || 0) / DEG,
      pitchDeg: this.pitch / DEG, flightPathDeg: gamma / DEG, thrust: this._thrust || 0, drag: a.drag || 0, lift: a.lift || 0, mass: this.y[4],
      propellant: this.prop[this.stage] ?? 0, stage: this.stage + 1, apoapsis: el.apoapsisAlt, periapsis: el.periapsisAlt,
      noseHeatFlux: this.maxHeat >= 0 ? stagnationHeatFlux(a.density || 0, a.speedAir || 0, this.o.noseRadius ?? 0.5, this.o.body) : 0, noseTemp: this.noseTemp,
    };
    if (this.o.subsystems && this.stage < this.v.stages.length && a.q !== undefined) {
      const loads = vehicleLoads(this.v, { stageIndex: this.stage, massAbove: (i) => this.stageMassAbove(i), accelAxial: sensedG * G0, q: a.q || 0, alpha: a.alpha || 0, aref: Math.PI * (this.v.aero.diameter / 2) ** 2, drag: a.drag || 0 });
      frame.structuralMargin = loads.minMargin;
      this.minStructMargin = Math.min(this.minStructMargin, loads.minMargin);
      if (loads.minMargin < 0 && !this._structFail) { this._structFail = true; this.timeline.add(this.t, 'structure', `Negative structural margin at ${loads.stations.find((s) => s.margin < 0).station}`, { severity: 'critical' }); if (this.o.structuralFailureEndsFlight !== false) this.finish('structural-failure', 'Structural margin below zero'); }
    }
    for (const [k, u] of Object.entries({ altitude: 'm', downrange: 'm', speed: 'm/s', airspeed: 'm/s', verticalSpeed: 'm/s', horizontalSpeed: 'm/s', accelerationG: 'g', dynamicPressure: 'Pa', mach: '-', alphaDeg: 'deg', pitchDeg: 'deg', flightPathDeg: 'deg', thrust: 'N', drag: 'N', lift: 'N', mass: 'kg', propellant: 'kg', stage: '-', apoapsis: 'm', periapsis: 'm', noseHeatFlux: 'W/m^2', noseTemp: 'K', structuralMargin: '-' })) this.rec.define(k, u);
    this.rec.record(this.t, frame, true);
  }
  finish(outcome, text) {
    if (this.done) return;
    this.done = true; this.outcome = outcome;
    this.timeline.add(this.t, 'end', text, { severity: outcome === 'orbit' ? 'info' : 'critical' });
    this.rec.event(this.t, 'end', text);
    this.endText = text;
  }
  run() { while (this.step()); return this.result(); }
  result() {
    const el = this.elements();
    const propLeft = this.prop.reduce((a, b) => a + b, 0);
    return {
      outcome: this.outcome, success: this.outcome === 'orbit', text: this.endText, time: this.t,
      orbit: { periapsisAlt: el.periapsisAlt, apoapsisAlt: el.apoapsisAlt, e: el.e, a: el.a },
      targetAlt: this.o.targetAlt,
      maxQ: this.maxQ, maxG: this.maxG, maxHeatFlux: this.maxHeat, maxQAlpha: this.maxQAlpha / DEG, minStructuralMargin: this.minStructMargin, maxNoseTemp: this.rec.channels.has('noseTemp') ? this.rec.stats('noseTemp').max : this.noseTemp,
      losses: this.losses, propellantRemaining: propLeft,
      propellantMarginFrac: propLeft / this.v.stages[this.v.stages.length - 1].propMass,
      finalMass: this.y[4], payload: this.v.payload.mass,
      recorder: this.rec, timeline: this.timeline,
      model: MODEL.PHYSICS, modelNote: 'Planar 3-DOF point mass with RK4; attitude follows guidance through a rate limit (simplification); aero coefficients are approximations.',
    };
  }
}

export const simulateAscent = (vehicle, opts) => new AscentSim(vehicle, opts).run();

// Pre-flight trajectory targeting: choose the pitch-kick angle that leaves the most propellant at cutoff
// (golden-section search over fast simulations without recording). Real launchers do this offline as well.
export function tuneAscent(vehicle, opts = {}, { lo = 0.5, hi = 20, iterations = 14 } = {}) {
  const one = (k, env) => {
    const r = new AscentSim(vehicle, { ...opts, kickDeg: k, record: false, subsystems: false, env: { ...(opts.env || {}), ...env } }).run();
    const peri = Math.min(r.orbit.periapsisAlt, opts.targetAlt ?? 200e3);
    return r.success ? 1e7 + r.propellantRemaining : peri; // reaching orbit dominates, then propellant left
  };
  // robust targeting: the trajectory must also survive a 2 deg shallower kick and a 40 m/s head wind,
  // otherwise the optimum sits on the edge of a cliff and small dispersions crash the vehicle
  const score = (k) => Math.min(one(k), one(k + 2), one(k, { windJet: -40 }));
  const gr = (Math.sqrt(5) - 1) / 2;
  // coarse scan first: the score is not unimodal when some kicks crash
  let best = lo, bestS = -Infinity;
  for (let k = lo; k <= hi; k += (hi - lo) / 12) { const s = score(k); if (s > bestS) { bestS = s; best = k; } }
  let a = Math.max(lo, best - (hi - lo) / 12), b = Math.min(hi, best + (hi - lo) / 12);
  let c = b - gr * (b - a), d = a + gr * (b - a), fc = score(c), fd = score(d);
  for (let i = 0; i < iterations; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = score(c); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = score(d); }
  }
  const k = fc > fd ? c : d, s = Math.max(fc, fd);
  return s >= bestS ? { kickDeg: k, score: s, reachesOrbit: s >= 1e7 } : { kickDeg: best, score: bestS, reachesOrbit: bestS >= 1e7 };
}
