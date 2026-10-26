// Wheeled-rover dynamics on procedural terrain: drive motors (DC torque-speed with power cap), traction limit (Coulomb friction +
// cohesion), rolling resistance, gravity along the slope, slip, rollover, and electrical load. Runs inside the Simulation when the
// vehicle contains a rover chassis. Everything is derived from the vehicle's component properties and the surface data.
import { getBody } from './bodies.js';
import { terrainSlopeFine } from './terrain.js';
import { clamp } from './vec.js';

const DEG = Math.PI / 180;

export class RoverDynamics {
  constructor(sim) {
    this.sim = sim;
    this.heading = (sim.mission.initial?.heading ?? 0) * DEG; // rad from north, clockwise
    this.speed = 0;
    this.odometer = 0;
    this.slip = 0;
    this.drivePowerW = 0;
    this.cmd = { mode: 'stop' };
    this.stuckTime = 0; this.stuck = false;
    this.rolledOver = false;
    this.slope = 0; this.sideSlope = 0;
    this.maxSlopeSeen = 0; this.maxSlip = 0;
    this.tractionRatio = 0;
    this.status = 'idle';
    this.xLocal = 0; this.yLocal = 0;
    this._configure();
  }
  _configure() {
    const fv = this.sim.fv;
    const chassis = fv.presentComponents('rover_chassis')[0];
    const wheels = fv.presentComponents('wheel');
    const motors = fv.presentComponents('motor');
    this.chassis = chassis;
    this.nWheels = wheels.reduce((s, w) => s + (w.count ?? 1), 0) || 1;
    this.wheelRadius = wheels.length ? wheels.reduce((s, w) => s + (w.radius ?? 0.15), 0) / wheels.length : 0.15;
    this.wheelWidth = wheels.length ? wheels[0].width ?? 0.12 : 0.12;
    this.nMotors = motors.reduce((s, m) => s + (m.count ?? 1), 0);
    this.stallTorque = motors.length ? motors[0].stallTorque ?? 10 : 0; // N m at the wheel
    this.noLoadOmega = motors.length ? motors[0].noLoadSpeed ?? 12 : 0;  // rad/s at the wheel
    this.motorEff = motors.length ? motors[0].efficiency ?? 0.75 : 0.75;
    this.motorMaxW = motors.reduce((s, m) => s + (m.maxPower ?? 60) * (m.count ?? 1), 0);
    this.trackWidth = chassis?.trackWidth ?? chassis?.width ?? 0.8;
    this.cgHeight = (chassis?.groundClearance ?? 0.25) + 0.25 * (chassis?.height ?? 0.5);
    this.driven = Math.min(this.nMotors, this.nWheels);
  }
  /** Maximum speed the drive can hold on level ground. */
  get vMaxNominal() { return this.noLoadOmega * this.wheelRadius; }

  command(c) { this.cmd = { ...c }; this.status = 'driving'; this.cmd.startOdo = this.odometer; }
  stop() { this.cmd = { mode: 'stop' }; }
  get active() { return this.cmd.mode !== 'stop'; }

  bearingTo(lat, lon) {
    const p = this.sim.pad;
    const dl = lon - p.lon;
    const y = Math.sin(dl) * Math.cos(lat), x = Math.cos(p.lat) * Math.sin(lat) - Math.sin(p.lat) * Math.cos(lat) * Math.cos(dl);
    return Math.atan2(y, x);
  }
  distanceTo(lat, lon) {
    const p = this.sim.pad, R = this.sim.primary.radius;
    const dl = lon - p.lon;
    const a = Math.sin((lat - p.lat) / 2) ** 2 + Math.cos(p.lat) * Math.cos(lat) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  step(dt) {
    const sim = this.sim, fv = sim.fv, P = sim.primary;
    const surf = P.surface ?? {};
    const rough = sim.env.terrain?.roughness ?? surf.roughness ?? 0.3;
    const R = P.radius;
    const g = P.mu / (R * R);
    const m = fv.mass;
    // local terrain
    const x = sim.pad.lon * R * Math.cos(sim.pad.lat), y = sim.pad.lat * R;
    const sl = terrainSlopeFine(P.id, x, y, sim.env.terrainSeed, rough);
    this.terrainH = sl.h;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const along = sl.gx * sh + sl.gy * ch;          // rise/run along the heading
    const side = sl.gx * ch - sl.gy * sh;           // rise/run across the heading
    const alpha = Math.atan(along), beta = Math.atan(side);
    this.slope = alpha / DEG; this.sideSlope = beta / DEG; this.terrainNormalEN = [-sl.gx, -sl.gy];
    this.maxSlopeSeen = Math.max(this.maxSlopeSeen, Math.abs(alpha) / DEG, Math.abs(beta) / DEG);
    const powered = !fv.powerState.blackout && fv.hasGuidance(true) && this.driven > 0 && !fv.guidanceFailed;
    // command interpretation
    let vCmd = 0, done = false;
    const c = this.cmd;
    if (powered && c.mode !== 'stop' && !this.rolledOver) {
      if (c.mode === 'heading') {
        this.turnToward(c.heading * DEG, dt);
        const rem = (c.distance ?? Infinity) - (this.odometer - c.startOdo);
        vCmd = Math.min(c.speed ?? 0.5, this.vMaxNominal);
        if (rem <= 0.05) { done = true; vCmd = 0; }
        else if (rem < 3) vCmd = Math.min(vCmd, Math.max(0.05, rem * 0.4));
        if (c.duration != null && sim.t - (c.tStart ?? (c.tStart = sim.t)) >= c.duration) { done = true; vCmd = 0; }
      } else if (c.mode === 'waypoint') {
        const dist = this.distanceTo(c.lat * DEG, c.lon * DEG);
        if (dist < (c.radius ?? 1.5)) { done = true; vCmd = 0; }
        else {
          const brg = this.bearingTo(c.lat * DEG, c.lon * DEG);
          const errH = this.turnToward(brg, dt);
          vCmd = Math.min(c.speed ?? 0.5, this.vMaxNominal) * (Math.abs(errH) > 0.6 ? 0 : 1);
          if (dist < 5) vCmd = Math.min(vCmd, Math.max(0.05, dist * 0.3));
        }
      }
    }
    if (done) { this.stop(); this.status = 'reached'; this.lastCompleted = true; }
    // forces
    const rr0 = surf.rollingResistance ?? 0.12;
    const Crr = rr0 * Math.pow(0.15 / Math.max(this.wheelRadius, 0.05), 0.4);
    const N = m * g * Math.cos(alpha) * Math.cos(beta);
    const Fres = m * g * (Crr * Math.cos(alpha) + Math.sin(alpha)); // + resists forward motion uphill
    const mu = surf.friction ?? 0.5;
    const contactArea = this.nWheels * this.wheelWidth * 0.12;
    const Ftrac = (this.driven / this.nWheels) * (mu * N) + (surf.regolithCohesion ?? 300) * contactArea * (this.driven / this.nWheels);
    // motor force available at the present speed (DC motor torque-speed), limited by electrical power
    const vw = Math.max(this.speed, 0);
    const Fmotor = this.driven * (this.stallTorque / this.wheelRadius) * Math.max(0, 1 - (vw / Math.max(this.vMaxNominal, 1e-6)));
    const FpowerCap = vw > 0.02 ? (this.motorMaxW * this.motorEff) / vw : Infinity;
    const Favail = Math.min(Fmotor, Ftrac, FpowerCap);
    // controller: P-controller on speed with 1 s time constant
    let Fdrive = Fres + (m * (vCmd - this.speed)) / 1.0;
    if (vCmd === 0 && Math.abs(this.speed) < 0.01) Fdrive = Math.min(Fres, 0) * 0; // parked (brakes hold; assume parking brake)
    Fdrive = clamp(Fdrive, -Favail, Favail);
    // traction utilisation and slip
    const rho = Ftrac > 0 ? Math.abs(Fdrive) / Ftrac : 2;
    this.tractionRatio = rho;
    let s = 0;
    const needed = vCmd > 0 ? Math.abs(Fres) / Math.max(Ftrac, 1e-9) : 0;
    if (vCmd > 0 || this.speed > 0.02) s = needed < 1 ? clamp(0.02 + 0.28 * Math.pow(Math.max(rho, needed), 3), 0, 0.6) : 1;
    // stalled when the resistance exceeds the best available force (cannot climb)
    const canMove = Favail > Fres + 1e-9 || vCmd === 0;
    if (!canMove && vCmd > 0) s = 1;
    let a = (Fdrive - Fres * (this.speed > 0.005 || vCmd > 0 ? 1 : 0)) / m;
    if (vCmd === 0 && this.speed <= 0.005) a = 0;
    // slipping wheels lose thrust
    if (s >= 1 && vCmd > 0) a = Math.min(a, -this.speed / Math.max(dt, 1e-3));
    let vNew = this.speed + a * dt;
    if (vCmd === 0) vNew = Math.max(vNew, 0);
    vNew = clamp(vNew, 0, this.vMaxNominal);
    if (s >= 1 || (vCmd > 0 && !canMove)) vNew = Math.min(vNew, 0.02);
    this.slip = s; this.maxSlip = Math.max(this.maxSlip, s);
    // stuck detection: commanded to move but making no progress
    if (vCmd > 0.05 && vNew < 0.03) this.stuckTime += dt; else this.stuckTime = Math.max(0, this.stuckTime - dt);
    if (this.stuckTime > 8 && !this.stuck) {
      this.stuck = true; this.status = 'stuck';
      this.stuckInfo = { slopeDeg: alpha / DEG, sideDeg: beta / DEG, Fres, Ftrac, Favail, mu, mass: m, g };
    }
    // rollover: side slope beyond the static stability angle atan((track/2)/cg height)
    const tip = Math.atan((this.trackWidth / 2) / Math.max(this.cgHeight, 0.05));
    const lateral = Math.abs(beta) + 0.5 * Math.abs(this.speed) * Math.abs(this.turnRate ?? 0) / g;
    this.tipAngle = tip / DEG; this.tipMargin = 1 - lateral / tip;
    if (lateral > tip && !this.rolledOver) { this.rolledOver = true; this.status = 'rolled over'; vNew = 0; }
    this.speed = vNew;
    // electrical load: mechanical power / efficiency + controller overhead; wheel spin under slip wastes power
    const vWheel = this.speed / Math.max(1 - Math.min(s, 0.95), 0.05);
    const Pmech = Math.abs(Fdrive) * Math.max(vWheel, s >= 1 ? this.vMaxNominal * 0.3 : 0);
    this.drivePowerW = powered && (vCmd > 0 || this.speed > 0.01) ? clamp(Pmech / this.motorEff, 0, this.motorMaxW) + 4 * this.driven * 0.25 : 0;
    // advance position along the heading (great-circle step on the sphere)
    const ds = this.speed * dt;
    if (ds > 0) {
      const lat = sim.pad.lat, lon = sim.pad.lon;
      sim.pad = { lat: lat + (ds * Math.cos(this.heading)) / R, lon: lon + (ds * Math.sin(this.heading)) / (R * Math.max(Math.cos(lat), 1e-3)) };
      this.odometer += ds;
    }
    return { done };
  }
  turnToward(target, dt) {
    let err = target - this.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const maxRate = 0.5 * (this.speed > 0.3 ? 0.6 : 1); // rad/s (skid steering)
    const step = clamp(err, -maxRate * dt, maxRate * dt);
    this.heading += step; this.turnRate = step / dt;
    return err;
  }
}
