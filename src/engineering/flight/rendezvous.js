// Rendezvous, proximity operations and docking in the target's local frame using the Clohessy-Wiltshire
// equations (PHYSICS for near-circular target orbits; error grows for large separations). Impulsive targeting
// burns with navigation errors, closed-loop proximity control on RCS, and docking-mechanism contact limits.
import { cwTarget } from '../core/orbit.js';
import { getBody } from '../core/bodies.js';
import { G0 } from '../core/constants.js';
import { makeRng } from '../core/rng.js';
import { MODEL } from '../core/provenance.js';
import { FlightRecorder } from './recorder.js';
import { Timeline } from './timeline.js';

export const DOCKING_LIMITS = { minClosing: 0.03, maxClosing: 0.35, lateral: 0.15, angleDeg: 4, collision: 0.6 };

export class RendezvousSim {
  constructor(opts = {}) {
    this.o = { body: 'moon', targetAlt: 110e3, dt: 0.5, sampleInterval: 5, transferTime: null, corrections: 3, navSd: 20, navVelSd: 0.05, rcsThrust: 445 * 2, rcsIsp: 280, chaserMass: 4800, rcsProp: 280, limits: DOCKING_LIMITS, seed: 1, record: true, ...opts };
    // initial relative state [x radial, y along-track, z cross-track, vx, vy, vz] in m and m/s
    this.s = Float64Array.from(opts.initial || [-15000, -60000, 200, 0, 22, 0]);
    const b = getBody(this.o.body), r = b.radius + this.o.targetAlt;
    this.n = Math.sqrt(b.mu / r ** 3);
    this.rng = makeRng(this.o.seed);
    this.t = 0; this.prop = this.o.rcsProp; this.mass = this.o.chaserMass; this.dvUsed = 0;
    this.rec = new FlightRecorder({ vehicle: 'chaser', run: 'rendezvous', sampleInterval: this.o.sampleInterval });
    this.timeline = new Timeline();
    this.phase = 'transfer'; this.done = false; this.burns = [];
  }
  navEstimate() { const s = this.s; const k = Math.min(1, Math.hypot(s[0], s[1], s[2]) / 5000); return [0, 1, 2].map((i) => s[i] + this.rng.normal(0, this.o.navSd * k + 0.02)).concat([3, 4, 5].map((i) => s[i] + this.rng.normal(0, this.o.navVelSd * k + 0.002))); }
  impulse(dv, label) {
    const mag = Math.hypot(...dv);
    const need = this.mass * (1 - Math.exp(-mag / (this.o.rcsIsp * G0)));
    if (need > this.prop) { this.timeline.add(this.t, 'alarm', `${label}: not enough RCS propellant (${need.toFixed(1)} kg needed, ${this.prop.toFixed(1)} kg left)`, { severity: 'critical', component: 'rcs' }); return false; }
    // execution error: 1% magnitude, 0.5 deg pointing
    const err = 1 + this.rng.normal(0, 0.01);
    for (let i = 0; i < 3; i++) this.s[3 + i] += dv[i] * err + this.rng.normal(0, mag * 0.009);
    this.prop -= need; this.mass -= need; this.dvUsed += mag;
    this.burns.push({ t: this.t, dv: mag, label });
    this.timeline.add(this.t, 'maneuver', `${label}: ${mag.toFixed(2)} m/s`, { component: 'rcs' });
    return true;
  }
  derivCW(s, a) { const n = this.n; return [s[3], s[4], s[5], 3 * n * n * s[0] + 2 * n * s[4] + a[0], -2 * n * s[3] + a[1], -n * n * s[2] + a[2]]; }
  integrate(dt, a = [0, 0, 0]) {
    const s = Array.from(this.s), f = (x) => this.derivCW(x, a);
    const k1 = f(s), k2 = f(s.map((v, i) => v + dt / 2 * k1[i])), k3 = f(s.map((v, i) => v + dt / 2 * k2[i])), k4 = f(s.map((v, i) => v + dt * k3[i]));
    for (let i = 0; i < 6; i++) this.s[i] += dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  run() {
    const period = 2 * Math.PI / this.n;
    const T = this.o.transferTime ?? 0.45 * period;
    // aim for a station-keeping point 300 m behind the target, then fly the final approach
    const aim = [0, -300, 0];
    const plan = (tgo) => { const est = this.navEstimate(); const rel = [est[0] - aim[0], est[1] - aim[1], est[2] - aim[2]]; const v = cwTarget(this.n, rel, tgo); return [v[0] - est[3], v[1] - est[4], v[2] - est[5]]; };
    this.impulse(plan(T), 'Terminal phase initiation');
    const corr = this.o.corrections;
    let tNext = T / (corr + 1);
    while (this.t < T && !this.done) {
      this.integrate(this.o.dt); this.t += this.o.dt; this.sample();
      if (corr && this.t >= tNext && T - this.t > 60) { this.impulse(plan(T - this.t), `Mid-course correction ${this.burns.length}`); tNext += T / (corr + 1); }
    }
    // braking at station-keeping point
    const est = this.navEstimate();
    this.impulse([-est[3], -est[4], -est[5]], 'Braking');
    this.phase = 'proximity';
    this.timeline.add(this.t, 'phase', `Station-keeping ${Math.hypot(this.s[0], this.s[1], this.s[2]).toFixed(0)} m from target`);
    // final approach: PD on lateral offset, closing-speed schedule along -y axis (docking axis = +y)
    const aMax = this.o.rcsThrust / this.mass;
    const dt = 0.1;
    const tEnd = this.t + 3600;
    while (!this.done && this.t < tEnd) {
      const e = this.navEstimate();
      const range = -e[1];
      const vClose = Math.max(this.o.limits.minClosing * 2, Math.min(1.0, range / 100));
      const cmd = [-0.02 * e[0] - 0.3 * e[3], 0.2 * (vClose - e[4]), -0.02 * e[2] - 0.3 * e[5]];
      // RCS thrusters are on/off: quantize to full thrust with a deadband
      const a = cmd.map((c) => (Math.abs(c) > 0.002 ? Math.sign(c) * Math.min(aMax, Math.abs(c) > aMax ? aMax : aMax * Math.min(1, Math.abs(c) / aMax)) : 0));
      const amag = Math.hypot(...a);
      const used = this.mass * amag * dt / (this.o.rcsIsp * G0);
      if (used > this.prop) { this.finish('fuel-out', 'RCS propellant exhausted during proximity operations'); break; }
      this.prop -= used; this.mass -= used; this.dvUsed += amag * dt;
      this.integrate(dt, a); this.t += dt; this.sample();
      if (this.s[1] >= 0) this.contact();
    }
    if (!this.done) this.finish('timeout', 'Docking not achieved within an hour of station-keeping');
    return this.result();
  }
  contact() {
    const L = this.o.limits, closing = this.s[4], lateral = Math.hypot(this.s[0], this.s[2]);
    const angle = Math.abs(this.rng.normal(0, 1.2)) + Math.hypot(this.s[3], this.s[5]) * 20; // attitude + lateral-rate misalignment, deg
    if (closing > L.collision) return this.finish('collision', `Contact at ${closing.toFixed(2)} m/s: structural damage`);
    const issues = [];
    if (closing < L.minClosing) issues.push(`closing speed ${closing.toFixed(3)} m/s too low to trigger capture latches`);
    if (closing > L.maxClosing) issues.push(`closing speed ${closing.toFixed(2)} m/s > ${L.maxClosing}`);
    if (lateral > L.lateral) issues.push(`lateral offset ${lateral.toFixed(2)} m > ${L.lateral} m`);
    if (angle > L.angleDeg) issues.push(`misalignment ${angle.toFixed(1)} deg > ${L.angleDeg} deg`);
    this.dock = { closing, lateral, angle };
    if (issues.length) this.finish('missed', `Capture failed: ${issues.join('; ')}`);
    else this.finish('docked', `Hard dock: ${closing.toFixed(2)} m/s, ${(lateral * 100).toFixed(0)} cm offset, ${angle.toFixed(1)} deg`);
  }
  sample() {
    if (!this.o.record || !this.rec.due(this.t)) return;
    for (const [k, u] of Object.entries({ radial: 'm', alongTrack: 'm', crossTrack: 'm', range: 'm', rangeRate: 'm/s', rcsPropellant: 'kg', dvUsed: 'm/s' })) this.rec.define(k, u);
    const r = Math.hypot(this.s[0], this.s[1], this.s[2]);
    this.rec.record(this.t, { radial: this.s[0], alongTrack: this.s[1], crossTrack: this.s[2], range: r, rangeRate: (this.s[0] * this.s[3] + this.s[1] * this.s[4] + this.s[2] * this.s[5]) / (r || 1), rcsPropellant: this.prop, dvUsed: this.dvUsed }, true);
  }
  finish(outcome, text) { if (this.done) return; this.done = true; this.outcome = outcome; this.endText = text; this.timeline.add(this.t, 'end', text, { severity: outcome === 'docked' ? 'info' : 'critical' }); this.rec.event(this.t, 'end', text); }
  result() {
    return { outcome: this.outcome, success: this.outcome === 'docked', text: this.endText, time: this.t, dvUsed: this.dvUsed, rcsPropellantRemaining: this.prop, rcsMarginFrac: this.prop / this.o.rcsProp, burns: this.burns, docking: this.dock || null,
      recorder: this.rec, timeline: this.timeline, model: MODEL.PHYSICS, modelNote: 'Clohessy-Wiltshire relative motion about a circular target orbit (valid for close range); RCS modelled as bang-bang thrust (approximation).' };
  }
}
export const simulateRendezvous = (o) => new RendezvousSim(o).run();
