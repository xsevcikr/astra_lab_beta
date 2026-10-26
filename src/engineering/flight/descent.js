// Powered descent and landing: inertial planar dynamics around an airless body (PHYSICS, RK4), Apollo-style
// explicit guidance through braking, approach and terminal phases, navigation from an imperfect IMU and initial
// state corrected by radar altimeter and landing radar through Kalman filters, procedural terrain and touchdown
// assessment. Body rotation (4.6 m/s at the lunar equator) is neglected: SIMPLIFICATION.
import { getBody } from '../core/bodies.js';
import { G0 } from '../core/constants.js';
import { makeRk4, rk4Step } from '../core/integrator.js';
import { makeRng } from '../core/rng.js';
import { MODEL } from '../core/provenance.js';
import { visViva } from '../core/orbit.js';
import { KalmanPV } from '../gnc/navigation.js';
import { FlightRecorder } from './recorder.js';
import { Timeline } from './timeline.js';
import { Terrain } from '../world/terrain.js';

export const LANDING_LIMITS = { vertical: 3.0, horizontal: 1.2, crash: 5.0, maxSlopeDeg: 12 };

// E-guidance acceleration to reach (rf, vf) in tgo seconds (minimum-energy, linear-in-time acceleration).
export function eGuidance(r, v, rf, vf, tgo) {
  return [0, 1].map((i) => 6 * (rf[i] - r[i] - v[i] * tgo) / (tgo * tgo) - 2 * (vf[i] - v[i]) / tgo);
}

// Pre-mission site selection: nearest point to the nominal site whose 500 m approach strip is gentle.
export function selectLandingSite(terrain, x0 = 0, maxSlopeDeg = 12, search = 6000) {
  // the approach corridor must also stay 100 m below the nominal glide path from high gate to low gate
  const clear = (x, y) => { const h0 = terrain.elevation(x, y); for (let d = -7000; d <= -300; d += 100) { const glide = 150 + (2200 - 150) * (-d - 350) / (7000 - 350); if (terrain.elevation(x + d, y) - h0 > glide - 100) return false; } return true; };
  const score = (x, y) => { let worst = 0; for (let d = -250; d <= 250; d += 25) worst = Math.max(worst, terrain.slopeDeg(x + d, y, 10)); return clear(x, y) ? worst : Infinity; };
  for (let r = 0; r <= search; r += 250)
    for (const [x, y] of [[x0 + r, 0], [x0 - r, 0], [x0, r], [x0, -r], [x0 + r, r], [x0 - r, -r], [x0 + r, -r], [x0 - r, r]])
      if (score(x, y) < maxSlopeDeg * 0.6) return { x, y };
  return { x: x0, y: 0, unsafe: true };
}

export class DescentSim {
  constructor(lander, opts = {}) {
    this.L = lander;
    this.o = {
      body: 'moon', orbitAlt: 100e3, pdiAlt: 15e3, dt: 0.1, maxTime: 1200, sampleInterval: 1, record: true,
      highGate: { x: -7000, z: 2200, vx: 150, vz: -45 }, lowGate: { x: -350, z: 150, vx: 12, vz: -4 }, terminalRate: -1,
      terrain: { type: 'mare', seed: 42 }, seed: 1, limits: LANDING_LIMITS, bingoFraction: 0.02, ...opts,
    };
    this.d = { thrustScale: 1, ispScale: 1, massScale: 1, navScale: 1, accelBias: [0.0005, 0.0005], radarBias: 0, pdiError: [0, 0, 0, 0], ...(opts.dispersions || {}) };
    this.failures = [...(opts.failures || [])].sort((a, b) => a.t - b.t);
    this.body = getBody(this.o.body);
    this.rng = makeRng(this.o.seed);
    this.terrain = new Terrain(this.o.terrain);
    // pre-mission site selection: nearest point to the nominal site whose 500 m neighbourhood is gentle
    this.site = this.o.siteX !== undefined ? { x: this.o.siteX, y: this.o.siteY ?? 0 } : selectLandingSite(this.terrain, 0, this.o.limits.maxSlopeDeg);
    // site-centred view of the terrain along the ground track: local x = 0 is the selected landing site
    const T = this.terrain, off = this.site.x, cy = this.site.y;
    this.terr = { elevation: (x) => T.elevation(x + off, cy), slopeDeg: (x, y, st) => T.slopeDeg(x + off, cy, st), assessSite: (x, y, o) => T.assessSite(x + off, cy, o), rockHazard: (x) => T.rockHazard(x + off, cy) };
    this.siteX = 0;
    this.siteElevation = this.terr.elevation(0);
    this.rec = new FlightRecorder({ vehicle: lander.name, run: opts.runName || 'descent', sampleInterval: this.o.sampleInterval });
    this.timeline = new Timeline();
    this.init();
  }
  init() {
    const b = this.body, ds = this.L.stages[0], as = this.L.stages[1];
    const e = ds.engines[0];
    this.Tmax = e.thrustVac * this.d.thrustScale; this.Tmin = this.Tmax * (e.throttleMin ?? 0.1);
    this.isp = e.ispVac * this.d.ispScale;
    this.prop0 = ds.propMass;
    this.dryOther = (ds.dryMass + (as ? as.dryMass + as.propMass : 0) + this.L.payload.mass) * this.d.massScale;
    const rp = b.radius + this.o.pdiAlt, ra = b.radius + this.o.orbitAlt;
    const vp = visViva(b.mu, rp, (rp + ra) / 2);
    // braking-phase range is not known in advance; start where the planned guidance needs ~ 480 km
    this.rangeAtPdi = this.o.pdiRange ?? 480e3;
    this.siteAngle = 0;
    const th0 = -(this.rangeAtPdi + this.d.pdiError[0]) / b.radius;
    const r0 = rp + this.d.pdiError[1];
    this.y = new Float64Array([r0 * Math.cos(th0), r0 * Math.sin(th0), -Math.sin(th0) * (vp + this.d.pdiError[2]) + Math.cos(th0) * this.d.pdiError[3], Math.cos(th0) * (vp + this.d.pdiError[2]) + Math.sin(th0) * this.d.pdiError[3], this.dryOther + this.prop0]);
    this.t = 0; this.phase = 'braking'; this.done = false; this.outcome = null; this.thrustVec = [0, 0]; this.throttle = 0;
    this.w = makeRk4(5); this.maxG = 0; this.engineOn = true;
    // navigation: initial knowledge from ground tracking, with errors
    const truth = this.local();
    const ns = this.d.navScale;
    this.navX = new KalmanPV({ pos: truth.x + this.rng.normal(0, 300 * ns), vel: truth.vx + this.rng.normal(0, 0.3 * ns), posSd: 300 * ns, velSd: 0.3 * ns, accelNoiseSd: 0.002 });
    this.navZ = new KalmanPV({ pos: truth.z + this.rng.normal(0, 100 * ns), vel: truth.vz + this.rng.normal(0, 0.3 * ns), posSd: 100 * ns, velSd: 0.3 * ns, accelNoiseSd: 0.002 });
    this.radarOk = true; this.radarValid = false;
    this.retarget(this.o.highGate);
    this.timeline.add(0, 'ignition', 'Powered descent initiation', { component: 'dps' });
    this.rec.event(0, 'ignition', 'Powered descent initiation');
  }
  get prop() { return this.y[4] - this.dryOther; }
  local(y = this.y) {
    const r = Math.hypot(y[0], y[1]), th = Math.atan2(y[1], y[0]);
    const up = [y[0] / r, y[1] / r], east = [-up[1], up[0]];
    const vt = y[2] * east[0] + y[3] * east[1], vr = y[2] * up[0] + y[3] * up[1];
    const x = (th - this.siteAngle) * this.body.radius; // negative before the site
    return { x, z: r - this.body.radius - this.siteElevation, vx: vt * this.body.radius / r, vz: vr, r, up, east, vt, ground: this.terr.elevation(x) - this.siteElevation };
  }
  gEff(l) { return this.body.mu / (l.r * l.r) - l.vt * l.vt / l.r; }
  retarget(gate) {
    // Pick the time-to-go that uses the least propellant while keeping the commanded thrust inside
    // [Tmin, 92% Tmax] along the whole planned arc (acceleration is linear in time under E-guidance).
    const l = this.est(), g = this.gEff(this.local()), m = this.y[4];
    let best = null;
    for (let tgo = 10; tgo <= 1200; tgo += 2) {
      const dr = [gate.x - l.x - l.vx * tgo, gate.z - l.z - l.vz * tgo], dv = [gate.vx - l.vx, gate.vz - l.vz];
      const c0 = [0, 1].map((i) => 6 * dr[i] / (tgo * tgo) - 2 * dv[i] / tgo);
      const c1 = [0, 1].map((i) => 2 * (dv[i] - c0[i] * tgo) / (tgo * tgo));
      let cost = 0, violation = 0;
      for (let k = 0; k <= 10; k++) {
        const tau = tgo * k / 10;
        const T = Math.hypot(c0[0] + c1[0] * tau, c0[1] + c1[1] * tau + g) * m;
        violation += Math.max(0, T - (this.phase === 'braking' ? 1.0 : 0.92) * this.Tmax) + Math.max(0, this.Tmin - T);
        cost += T * tgo / 10;
      }
      const score = violation > 0 ? 1e12 + violation : cost;
      if (!best || score < best.score) best = { tgo, score };
    }
    this.tgo = best.tgo; this.gate = gate; this.targetFeasible = best.score < 1e12;
    if (!this.targetFeasible) this.timeline?.add(this.t, 'guidance', `No thrust-feasible path to ${this.phase === 'braking' ? 'high' : 'low'} gate; flying the closest solution`, { severity: 'warning' });
  }
  // Landing point designation: search the area around the estimated position for terrain that passes the
  // slope and rock checks (crew or hazard-detection lidar in reality). Uses the true terrain map: SIMPLIFICATION.
  designateLandingPoint() {
    if (this.o.hazardAvoidance === false) { this.terminalX = this.siteX; return; }
    const e = this.est(), l = this.local();
    // the vehicle will touch down where it believes the site is: true point = site - navigation error
    const trueAim = this.siteX - (e.x - l.x);
    const lim = this.o.limits.maxSlopeDeg;
    const here = this.terr.assessSite(trueAim, 0, { maxSlopeDeg: lim - 2 });
    if (here.safe) { this.terminalX = this.siteX; return; }
    for (let d = 5; d <= (this.o.designationRange ?? 300); d += 5) {
      for (const sgn of [1, -1]) { // prefer long (downrange) redesignations, as crews did
        const site = this.terr.assessSite(trueAim + sgn * d, 0, { maxSlopeDeg: lim - 2 });
        if (site.safe) { this.terminalX = this.siteX + sgn * d; this.timeline.add(this.t, 'guidance', `Landing point redesignated ${sgn > 0 ? '+' : ''}${sgn * d} m to avoid ${here.reasons.join(', ')}`); return; }
      }
    }
    this.terminalX = this.siteX;
    this.timeline.add(this.t, 'alarm', 'No safe landing point within designation range', { severity: 'warning' });
  }
  est() { return { x: this.navX.x[0], vx: this.navX.x[1], z: this.navZ.x[0], vz: this.navZ.x[1] }; }
  deriv = (t, y, out) => {
    const r = Math.hypot(y[0], y[1]), g = -this.body.mu / (r * r * r);
    const m = y[4];
    const T = this.engineOn && m > this.dryOther ? this.thrustMag : 0;
    out[0] = y[2]; out[1] = y[3];
    out[2] = g * y[0] + T / m * this.thrustDir[0]; out[3] = g * y[1] + T / m * this.thrustDir[1];
    out[4] = -T / (this.isp * G0);
  };
  guidance(dt) {
    const l = this.local(), e = this.est(), g = this.gEff(l);
    let a;
    if (this.phase === 'terminal') {
      // translate to the designated point, then descend at the terminal rate (hover while still translating)
      const dx = (this.terminalX ?? e.x) - e.x;
      const vxCmd = Math.max(-6, Math.min(6, 0.08 * dx));
      const ax = Math.max(-0.8, Math.min(0.8, 0.5 * (vxCmd - e.vx)));
      // height above ground from the onboard map; keep 30 m clearance while still translating
      const hAgl = this.radarValid && this.lastRadarAgl !== undefined ? this.lastRadarAgl : e.z - (this.terr.elevation(e.x) - this.siteElevation);
      const translating = Math.abs(dx) > 8 || Math.abs(e.vx) > 0.8;
      const vzCmd = translating ? (hAgl > 30 ? -Math.min(4, Math.max(0.5, (hAgl - 30) / 15)) : Math.min(2, (30 - hAgl) / 5)) : Math.max(-3, Math.min(this.o.terminalRate, -(hAgl - 10) / 10));
      a = [ax, 1.2 * (vzCmd - e.vz)];
    } else {
      this.tgo -= dt;
      if (this.tgo > 4) this.lastA = eGuidance([e.x, e.z], [e.vx, e.vz], [this.gate.x, this.gate.z], [this.gate.vx, this.gate.vz], this.tgo);
      a = this.lastA;
      if (this.tgo <= 1) {
        if (this.phase === 'braking') { this.phase = 'approach'; this.timeline.add(this.t, 'phase', 'High gate: approach phase'); this.retarget(this.o.lowGate); }
        else if (this.phase === 'approach') { this.phase = 'terminal'; this.timeline.add(this.t, 'phase', 'Low gate: terminal descent'); this.designateLandingPoint(); }
      }
    }
    let ax = a[0], az = a[1] + g;
    if (az < 0.2 * g) az = 0.2 * g; // never command thrust pointing down
    let T = Math.hypot(ax, az) * this.y[4];
    T = Math.max(this.Tmin, Math.min(this.Tmax, T));
    const n = Math.hypot(ax, az);
    // convert local (downrange, up) direction to inertial
    const dirLocal = [ax / n, az / n];
    this.thrustDir = [dirLocal[0] * l.east[0] + dirLocal[1] * l.up[0], dirLocal[0] * l.east[1] + dirLocal[1] * l.up[1]];
    this.thrustMag = T; this.throttle = T / (this.Tmax / this.d.thrustScale);
    this.tiltDeg = Math.atan2(dirLocal[0], dirLocal[1]) * 180 / Math.PI;
    return { T, dirLocal };
  }
  navigation(dt) {
    const l = this.local();
    // IMU specific force (thrust/m) in local axes with bias and noise; nav adds modelled gravity
    const f = this.engineOn ? this.thrustMag / this.y[4] : 0;
    const dirL = [this.thrustDir[0] * l.east[0] + this.thrustDir[1] * l.east[1], this.thrustDir[0] * l.up[0] + this.thrustDir[1] * l.up[1]];
    const g = this.gEff(l);
    // polar-frame kinematics: d(vx)/dt = a_t R/r - 2 vz vx / r (transport terms of the curved local frame)
    const e = this.est();
    const ax = (f * dirL[0] + this.d.accelBias[0] + this.rng.normal(0, 0.002)) * this.body.radius / l.r - 2 * e.vz * e.vx / l.r;
    const az = f * dirL[1] - g + this.d.accelBias[1] + this.rng.normal(0, 0.002);
    this.navX.predict(ax, dt); this.navZ.predict(az, dt);
    const hRadar = l.z - l.ground, e0 = this.est();
    this.radarValid = this.radarOk && hRadar < 12000;
    if (this.radarValid && Math.round(this.t / dt) % (this.phase === 'terminal' ? 1 : 5) === 0) {
      // radar measures height above local ground; the onboard terrain map (with its own error) converts it to
      // height above the landing site, as the Apollo LGC terrain model did
      const mapError = (this.d.mapErrorSd ?? 5) * Math.sin(e0.x / 1500 + this.o.seed);
      const aglMeas = hRadar * (1 + this.rng.normal(0, 0.005)) + this.d.radarBias;
      this.lastRadarAgl = aglMeas;
      const zMeas = aglMeas + l.ground + mapError;
      const sd = Math.max(1, 0.01 * hRadar);
      const r = this.navZ.update(zMeas, sd);
      if (!this._radarAcq) { this._radarAcq = true; this.timeline.add(this.t, 'nav', `Landing radar altitude lock at ${(hRadar / 1000).toFixed(1)} km`); }
      if (!r.accepted) this.radarRejects = (this.radarRejects || 0) + 1;
      if (hRadar < 7000) { this.navZ.update(l.vz + this.rng.normal(0, 0.1), 0.2, 'vel'); this.navX.update(l.vx + this.rng.normal(0, 0.1), 0.2, 'vel'); }
    }
  }
  applyFailures() {
    while (this.failures.length && this.failures[0].t <= this.t) {
      const f = this.failures.shift();
      if (f.type === 'radar-failure') { this.radarOk = false; this.timeline.add(this.t, 'failure', 'Landing radar data lost', { severity: 'critical', component: 'lr' }); }
      if (f.type === 'thrust-loss') { this.Tmax *= 1 - (f.fraction ?? 0.2); this.Tmin = Math.min(this.Tmin, this.Tmax); this.timeline.add(this.t, 'failure', `Descent engine thrust loss ${(100 * (f.fraction ?? 0.2)).toFixed(0)}%`, { severity: 'critical', component: 'dps' }); }
      if (f.type === 'engine-failure') { this.engineOn = false; this.timeline.add(this.t, 'failure', 'Descent engine shutdown', { severity: 'critical', component: 'dps' }); }
      if (f.type === 'imu-bias') { this.d.accelBias = [this.d.accelBias[0] + (f.bias ?? 0.05), this.d.accelBias[1] + (f.bias ?? 0.05)]; this.timeline.add(this.t, 'failure', 'IMU accelerometer bias shift', { severity: 'warning', component: 'imu' }); }
      this.rec.event(this.t, 'failure', f.type);
    }
  }
  step(dt = this.o.dt) {
    if (this.done) return false;
    this.applyFailures();
    this.guidance(dt);
    if (this.prop <= 0) this.engineOn = false;
    rk4Step(this.deriv, this.t, this.y, dt, this.w);
    if (this.y[4] < this.dryOther) this.y[4] = this.dryOther;
    this.t += dt;
    this.navigation(dt);
    const l = this.local();
    this.maxG = Math.max(this.maxG, (this.engineOn ? this.thrustMag : 0) / this.y[4] / G0);
    if (!this._bingo && this.prop < this.o.bingoFraction * this.prop0) { this._bingo = true; this.timeline.add(this.t, 'alarm', 'Propellant low: bingo call', { severity: 'warning', component: 'ds.tanks' }); }
    if (!this.engineOn && !this._fuelOut && this.prop <= 0) { this._fuelOut = true; this.timeline.add(this.t, 'failure', 'Descent propellant exhausted', { severity: 'critical' }); }
    if (l.z - l.ground <= 0) this.touchdown(l);
    else if (this.t > this.o.maxTime) this.finish('timeout', 'Did not land within the time limit');
    if (this.o.record && (this.rec.due(this.t) || this.done)) this.record(l);
    return !this.done;
  }
  touchdown(l) {
    const lim = this.o.limits;
    const vz = -l.vz, vh = Math.abs(l.vx);
    const site = this.terr.assessSite(l.x, 0, { maxSlopeDeg: lim.maxSlopeDeg });
    const err = l.x - this.siteX;
    let outcome = 'landed', text;
    const issues = [];
    if (vz > lim.vertical) issues.push(`vertical speed ${vz.toFixed(2)} m/s > ${lim.vertical}`);
    if (vh > lim.horizontal) issues.push(`horizontal speed ${vh.toFixed(2)} m/s > ${lim.horizontal}`);
    issues.push(...site.reasons);
    if (vz > lim.crash || vh > 3 * lim.horizontal) outcome = 'crash';
    else if (issues.length) outcome = 'hard-landing';
    text = outcome === 'landed' ? `Touchdown ${vz.toFixed(2)} m/s down, ${vh.toFixed(2)} m/s across, ${Math.abs(err).toFixed(0)} m from target` : `${outcome === 'crash' ? 'Crash' : 'Hard landing'}: ${issues.join('; ')}`;
    this.touch = { vz, vh, error: err, site, issues };
    this.finish(outcome, text);
  }
  finish(outcome, text) {
    if (this.done) return;
    this.done = true; this.outcome = outcome; this.endText = text;
    this.timeline.add(this.t, 'end', text, { severity: outcome === 'landed' ? 'info' : 'critical' });
    this.rec.event(this.t, 'end', text);
  }
  record(l) {
    const e = this.est();
    const units = { altitude: 'm', altitudeAboveGround: 'm', altitudeEstimate: 'm', downrangeToGo: 'm', horizontalSpeed: 'm/s', verticalSpeed: 'm/s', throttle: '-', thrust: 'N', mass: 'kg', propellant: 'kg', tiltDeg: 'deg', navErrorDownrange: 'm', navErrorAltitude: 'm', nav3SigmaDownrange: 'm', nav3SigmaAltitude: 'm', radarValid: '-', accelerationG: 'g', tgo: 's' };
    for (const [k, u] of Object.entries(units)) this.rec.define(k, u, k.startsWith('nav') || k === 'altitudeEstimate' ? 'derived' : 'physics');
    this.rec.record(this.t, {
      altitude: l.z, altitudeAboveGround: l.z - l.ground, altitudeEstimate: e.z, downrangeToGo: -l.x, horizontalSpeed: l.vx, verticalSpeed: l.vz,
      throttle: this.engineOn ? this.throttle : 0, thrust: this.engineOn ? this.thrustMag : 0, mass: this.y[4], propellant: this.prop, tiltDeg: this.tiltDeg,
      navErrorDownrange: e.x - l.x, navErrorAltitude: e.z - l.z, nav3SigmaDownrange: 3 * this.navX.sigma[0], nav3SigmaAltitude: 3 * this.navZ.sigma[0], radarValid: this.radarValid, accelerationG: (this.engineOn ? this.thrustMag : 0) / this.y[4] / G0, tgo: this.phase === 'terminal' ? 0 : this.tgo,
    }, true);
  }
  run() { while (this.step()); return this.result(); }
  result() {
    return {
      outcome: this.outcome, success: this.outcome === 'landed', text: this.endText, time: this.t,
      touchdown: this.touch || null, landingError: this.touch ? Math.abs(this.touch.error) : null,
      propellantRemaining: Math.max(0, this.prop), propellantMarginFrac: Math.max(0, this.prop) / this.prop0, propellantUsed: this.prop0 - Math.max(0, this.prop),
      maxG: this.maxG, radarRejects: this.radarRejects || 0,
      recorder: this.rec, timeline: this.timeline,
      model: MODEL.PHYSICS, modelNote: 'Planar point-mass powered descent (RK4) with explicit guidance and Kalman navigation; body rotation and attitude dynamics neglected (simplification); terrain is procedural.',
    };
  }
}
export const simulateDescent = (lander, opts) => new DescentSim(lander, opts).run();
