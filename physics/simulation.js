// ASTRA LAB flight simulation engine.
//
// State vector (13): position r (3), velocity v (3) in the primary body's inertial frame, attitude quaternion q (4, body->inertial),
// body angular rate w (3). Integrated with classical RK4. Mass is prescribed linear over each step from the mass flow of the engines.
// The engine is deterministic: identical (vehicle, mission, environment, settings, commands) give identical results.
import { G0, SIGMA } from './constants.js';
import { add, sub, scale, dot, cross, len, norm, clamp, qMul, qConj, qNormalize, qRotate, qFromXAxis, qFromTwoVectors, qFromAxisAngle, angleBetween, madd } from './vec.js';
import { rk4Step, makeRk4Work } from './integrator.js';
import { getBody, bodyStateRelParent, bodyStateAbs, rotationAngle, surfacePointInertial, corotationVelocity, latLonFromInertial, localFrame, sunDirection, solarFlux, listBodies } from './bodies.js';
import { Atmosphere } from './atmosphere.js';
import { elementsFromState, circularOrbitState, circularSpeed } from './orbital.js';
import { ispAtPressure } from './propulsion.js';
import { thrustFactor } from './thrust-curves.js';
import { SloshFlex } from './flex-slosh.js';
import { axialCoeff, capsuleCoeff, normalCoeff, NOSE_FACTORS, heatingConstant, stagnationHeatFlux } from './aero.js';
import { terrainHeight, terrainSlope } from './terrain.js';
import { FlightVehicle } from './flight-vehicle.js';
import { computeMassProperties } from './vehicle-model.js';
import { updatePower, updateThermal, updateComms, updateInstruments, isSunlit } from './subsystems.js';
import { guidanceStep, initGuidanceState, launchAzimuth } from './guidance.js';
import { MissionExecutor } from './mission-exec.js';
import { TelemetryRecorder } from './telemetry.js';
import { FailureMonitor, assessFailures, CONFIDENCE } from './failures.js';
import { RoverDynamics } from './rover.js';
import { makeDebris, DebrisTrack } from './debris.js';

const DEG = Math.PI / 180;
function makeRngLocal(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const DEFAULT_SETTINGS = {
  dt: 0.02,                       // physics timestep while thrusting / in atmosphere [s]
  accuracy: 'standard',           // 'high' | 'standard' | 'fast' -> coast step cap
  coastCap: { high: 0.5, standard: 2, fast: 10 },
  maxTime: 43200,                 // s
  recordMax: 20000,               // telemetry samples kept (decimated in place beyond this)
  attitudeBandwidth: 1.3,         // rad/s, attitude controller natural frequency
  attitudeDamping: 0.85,
  j2: false,
  slosh: false,                   // 2.3: propellant slosh (spring-mass model per partly filled tank)
  slosh2: false,                  // 2.5: second slosh mode per tank (needs slosh)
  flex: false,                    // 2.3: first bending mode of the structure and the bent-sensor error
};

export class Simulation {
  constructor({ vehicle, mission, environment = {}, settings = {} }) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.vehicleDef = JSON.parse(JSON.stringify(vehicle));
    this.mission = normalizeMission(mission);
    if (this.mission.maxTime > this.settings.maxTime) this.settings.maxTime = this.mission.maxTime;   // multi-day missions (Moon): the step limiter must not stop at the default 12 h
    this.env = {
      body: 'earth', epoch: 0, site: { lat: 28.573, lon: -80.649 }, terrainSeed: 1,
      groundStation: { lat: 28.573, lon: -80.649, gainDbi: 45, noiseTempK: 100, minElevationDeg: 5 },
      ...environment, ...(this.mission.environment ?? {}),
    };
    this.home = getBody(this.env.body);
    const snd = this.env.sounding;                                                                                                    // 2.5: a real weather-balloon day (src/core/sounding.js)
    if (snd?.points?.length > 5 && this.home.atmosphere?.model === 'us76') this.home = { ...this.home, atmosphereModel: new Atmosphere({ ...this.home.atmosphere, profile: 'sounding', sounding: snd }) };
    else if (this.env.atmosphereProfile === 'tropical' && this.home.atmosphere?.model === 'us76') this.home = { ...this.home, atmosphereModel: new Atmosphere({ ...this.home.atmosphere, profile: 'tropical' }) };   // 2.4: a warm tropical day instead of the standard atmosphere
    // 2.1 environment: wind and air-density scaling (both off by default, so existing results do not change)
    const wd = this.env.wind, dsc = Number(this.env.densityScale);
    this._densityScale = Number.isFinite(dsc) && dsc > 0 ? dsc : 1;
    this._wind = wd && Number(wd.speed) ? (() => {
      const rr = makeRngLocal(wd.seed ?? 1), toDeg = ((wd.fromDeg ?? 270) + 180) * DEG;                    // direction the wind blows TOWARD
      return { speed: Number(wd.speed), te: Math.sin(toDeg), tn: Math.cos(toDeg), gust: Math.max(0, Math.min(1, wd.gustFraction ?? 0.25)), ph: [rr() * 6.283, rr() * 6.283],
        turn: (Number(wd.turnDeg) || 0) * DEG, shearAlt: Number(wd.shearAlt) || 0, shearSpeed: Number(wd.shearSpeed) || 0 };   // 2.4: the wind direction turns with height; one sharp shear layer
    })() : null;
    if (snd?.winds?.length > 1 && this.home.atmosphere?.model === 'us76') {                                                           // the sounding's winds replace the simple jet-stream profile
      const tab = snd.winds.map((w) => { const to = (w.fromDeg + 180) * DEG; return [w.h, w.speed * Math.sin(to), w.speed * Math.cos(to)]; }), gf = Number(wd?.gustFraction);
      this._wind = { table: tab, speed: 1, te: 0, tn: 0, gust: Number.isFinite(gf) ? Math.max(0, Math.min(1, gf)) : 0.1, ph: [makeRngLocal(wd?.seed ?? 1)() * 6.283, makeRngLocal((wd?.seed ?? 1) + 7)() * 6.283] };
    }
    this.primary = this.home;
    this.fv = new FlightVehicle(this.vehicleDef);
    this.t = 0;
    this.finished = false;
    this.result = null;
    this.events = []; this.warnings = []; this.commands = [];
    this.pendingCommands = [];
    this.telemetry = new TelemetryRecorder({ maxSamples: this.settings.recordMax });
    this.separations = []; // {t, group}
    this.budget = { ideal: 0, gravity: 0, drag: 0, steering: 0 };
    this.commStats = { linkTime: 0, bestMargin: -99, reason: null };
    this.summaryMax = {};
    this.guidance = initGuidanceState('none');
    this.wantTransmit = false;
    this.onGround = false; this.landed = false; this.landedSafe = false; this.landedHard = false; this.crashed = false;
    this.lastThrustAccel = 0; this.lastDt = 0; this.avgThrottle = 0;
    this.stepCount = 0; this.tLiftoff = null; this.limitsDirty = true;
    this.work = makeRk4Work(13);
    this.y = new Float64Array(13);
    this.now = {};
    this.objectiveMetAt = null;
    this.lastRecordT = -1e9;
    this.soiPending = null;
    this.terrainDatum = 0;
    this.attErrTime = 0;
    this.tmpOut = {};
    this._initState();
    this.attachRover();
    this.executor = new MissionExecutor(this, this.mission);
    this.monitor = new FailureMonitor(this);
    this.setGuidance(this.mission.guidance?.mode ?? 'none', this.mission.guidance?.params ?? {});
    this._geometry();
    this.fv.refreshMass();
    this._refreshNow(this._evalForces(0, this.y, this.tmpOut, 0.0));
    this._record(true);
    this.log('MISSION_START', `Mission "${this.mission.name}" initialised at ${this.home.name}`, {});
  }

  // ---------------------------------------------------------------------------------------------------------
  // initial conditions
  // ---------------------------------------------------------------------------------------------------------
  _initState() {
    const ini = this.mission.initial ?? { type: 'pad' };
    const b = this.home, epoch = this.env.epoch;
    const y = this.y;
    let r, v, q = null;
    const site = this.env.site;
    if (ini.type === 'pad' || ini.type === 'surface') {
      const lat = (ini.lat ?? site.lat) * DEG, lon = (ini.lon ?? site.lon) * DEG;
      this.pad = { lat, lon };
      this.terrainDatum = terrainHeight(b.id, lat, lon, this.env.terrainSeed);
      r = surfacePointInertial(b.id, lat, lon, epoch, b.radius + (ini.altitude ?? 0));
      v = corotationVelocity(b.id, r);
      this.onGround = true;
      if (ini.type === 'surface') { this.landed = true; this.landedSafe = true; }
    } else if (ini.type === 'orbit') {
      const inc = (ini.inclination ?? 0) * DEG, raan = (ini.raan ?? 0) * DEG, u = (ini.u ?? 0) * DEG;
      if (ini.periapsis != null && ini.apoapsis != null) {
        const rp = b.radius + ini.periapsis, ra = b.radius + ini.apoapsis;
        const a = (rp + ra) / 2, vp = Math.sqrt(b.mu * (2 / rp - 1 / a));
        const s = circularOrbitState(b.mu, rp, inc, raan, u);
        r = s.r; v = scale(norm(s.v), vp);
      } else {
        const s = circularOrbitState(b.mu, b.radius + (ini.altitude ?? 200000), inc, raan, u);
        r = s.r; v = s.v;
      }
    } else if (ini.type === 'local') {
      const lat = (ini.lat ?? site.lat) * DEG, lon = (ini.lon ?? site.lon) * DEG;
      this.terrainDatum = terrainHeight(b.id, lat, lon, this.env.terrainSeed);
      r = surfacePointInertial(b.id, lat, lon, epoch, b.radius + (ini.altitude ?? 1000));
      const fr = localFrame(r);
      v = add(corotationVelocity(b.id, r), add(scale(fr.up, ini.vUp ?? 0), add(scale(fr.east, ini.vEast ?? 0), scale(fr.north, ini.vNorth ?? 0))));
      this.pad = { lat, lon };
    } else if (ini.type === 'state') {
      r = [...ini.r]; v = [...ini.v];
      if (ini.body) { this.primary = getBody(ini.body); }
    } else throw new Error(`Unknown initial condition type ${ini.type}`);
    if (ini.datum != null) this.terrainDatum = ini.datum;
    // attitude
    const fr = localFrame(r);
    const att = ini.attitude ?? (ini.type === 'orbit' ? 'prograde' : 'up');
    let dir;
    switch (att) {
      case 'prograde': dir = norm(v); break;
      case 'retrograde': dir = scale(norm(v), -1); break;
      case 'nadir': dir = scale(fr.up, -1); break;
      default: dir = fr.up;
    }
    q = qFromXAxis(dir, fr.north);
    y.set([...r, ...v, ...q, 0, 0, 0]);
    this.padQ = null;
  }

  // ---------------------------------------------------------------------------------------------------------
  // logging helpers
  // ---------------------------------------------------------------------------------------------------------
  log(kind, message, data = {}) {
    const e = { t: this.t, kind, message, data };
    this.events.push(e);
    if (this.telemetry && this.telemetry.count > 0 && kind !== 'MISSION_START') this._forceRecord = true;
    return e;
  }
  warn(code, message, data = {}) { this.warnings.push({ t: this.t, code, message, data }); }
  onSeparation(group, spec = null, opts = {}) {
    const entry = { t: this.t, group };
    if (spec) {
      // the jettisoned hardware keeps flying: remember its state so that it can be propagated and drawn (physics/debris.js)
      entry.debris = makeDebris(spec, { t: this.t, body: this.primary.id, r: [this.y[0], this.y[1], this.y[2]], v: [this.y[3], this.y[4], this.y[5]], q: [this.y[6], this.y[7], this.y[8], this.y[9]] }, group, opts);
    }
    this.separations.push(entry);
    if (opts.companion && entry.debris) this.companion = { entry, track: new DebrisTrack(entry.debris), groups: spec.groups };
    this.limitsDirty = true;
    this._geometry();
    this.fv.refreshMass();
    this._forceRecord = true;
  }
  markIgnition(group) { this.lastIgnitionGroup = group; }
  /** The lunar module on the surface is ready to leave again: it is no longer 'landed', so thrust above its weight lifts it off. */
  armLiftoff() {
    this.liftoffArmed = true; this.tLiftoffArm = this.t; this.landed = false; this.landedUpright = true;
    this.tLiftoff = null;
  }
  /** Undocking: the remaining vehicle was docked upside down, so its axis (the direction its engines push) swings round by 180 degrees. */
  turnVehicleAround() {
    const y = this.y, q = qMul([y[6], y[7], y[8], y[9]], qFromAxisAngle([0, 1, 0], Math.PI));
    y[6] = q[0]; y[7] = q[1]; y[8] = q[2]; y[9] = q[3]; y[10] = y[11] = y[12] = 0;
    this.setGuidance('hold', {});
  }
  /** (Re)create the rover dynamics when the simulated vehicle contains a rover chassis (at start, or after a rover is deployed). */
  attachRover() {
    // the rover only drives on its own once nothing but the rover is left (a lander carrying a rover keeps landing first)
    const only = this.fv.presentComponents().every((c) => c.group === 'rover');
    this.rover = this.fv.presentComponents('rover_chassis').length && only ? new RoverDynamics(this) : null;
    if (this.rover) { this.limitsDirty = true; }
  }
  landingActive() { return this.guidance.mode === 'land'; }
  /**
   * Fuel and push of the stage or vehicle that is active now: the one burning, otherwise the next one to burn. Only for vehicles that name
   * their groups (meta.groupNames, the Apollo-style rocket); null for the others (the HUD then shows the whole-vehicle share).
   */
  activeFuel() {
    const fv = this.fv, names = this.vehicleDef?.meta?.groupNames;
    if (!names || !fv) return null;
    const engs = fv.activeEngines().filter((e) => e.group && !e.failed);
    const order = Object.keys(names);
    const withFuel = (g) => fv.groupPropellant(g).left > 0.5;
    let g = engs.find((e) => e.state === 'on')?.group;
    if (!g) g = [...new Set(engs.map((e) => e.group))].filter(withFuel).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    if (!g) return null;
    const p = fv.groupPropellant(g), thrustNow = this.now?.thrust ?? 0;
    const rated = engs.filter((e) => e.group === g).reduce((s, e) => s + e.comp.thrustVac * (e.comp.count ?? 1), 0);
    const burning = engs.some((e) => e.group === g && e.state === 'on');
    return { group: g, label: names[g] ?? g, left: p.left, initial: p.initial, frac: p.initial > 0 ? p.left / p.initial : NaN, burning, pushG: (burning ? thrustNow : rated) / Math.max(fv.mass, 1) / 9.80665 };
  }
  /**
   * How fast may the live view run right now? Burns, separations, docking and landing are slowed down automatically so nothing happens
   * between two screen frames. Returns { maxWarp, why } (maxWarp is Infinity in a quiet coast).
   */
  attention() {
    if (this.finished || !((this.mission?.maxTime ?? 0) > 86400)) return { maxWarp: Infinity, why: '' };   // short flights keep the plain speed buttons
    let cap = Infinity, why = '';
    const lim = (c, w) => { if (c < cap) { cap = c; why = w; } };
    const n = this.now ?? {}, ex = this.executor;
    if (this.choreo) lim(20, 'docking manoeuvre');
    if (this.landingActive()) { const ra = n.radarAlt ?? 1e9; if (ra < 1500) lim(1, 'landing'); else if (ra < 30000) lim(4, 'landing'); }
    if (this.companion) {
      const st = this.companion.track.stateAt(this.t), y = this.y;
      const range = Math.hypot(y[0] - st.r[0], y[1] - st.r[1], y[2] - st.r[2]);
      if (range < 3000) lim(2, 'docking approach'); else if (range < 40000) lim(10, 'rendezvous');
    }
    if (ex?.burn) lim(ex.burn.aligning ? 20 : 10, ex.burn.aligning ? 'turning for a burn' : 'engine burning');
    if ((n.thrust ?? 0) > 0 || (this.fv?.activeEngines?.().some((e) => e.state === 'on'))) lim(10, 'engine burning');
    if (this.onGround && this.t < 120) lim(10, 'liftoff');
    const d = ex?.nextTimedDelta?.() ?? Infinity;
    if (d < 20) lim(4, 'next manoeuvre'); else if (d < 120) lim(25, 'next manoeuvre');
    return { maxWarp: cap, why };
  }
  get body() { return this.primary; }

  command(cmd) { this.pendingCommands.push(cmd); }
  setGuidance(mode, params = {}) {
    this.guidance = initGuidanceState(mode, params);
    this.guidance.tStart = this.t;
  }

  // ---------------------------------------------------------------------------------------------------------
  // geometry & aerodynamic constants (updated on layout change)
  // ---------------------------------------------------------------------------------------------------------
  _geometry() {
    const fv = this.fv;
    fv.refreshMass();
    const lay = fv._layout;
    const comps = fv.presentComponents();
    const D = Math.max(lay.maxDiameter, 0.05), L = Math.max(lay.length, 0.1);
    let cnFins = 0, xFins = 0, finArea = 0;
    let noseKey = 'flat', hasShield = false, liftToDrag = 0, capsuleShield = false;
    for (const c of comps) {
      if (c.kind === 'fin') { const cn = (c.cnAlpha ?? 2.5) * (c.count ?? 1); cnFins += cn; xFins += cn * (lay.placements.get(c.id)?.xc ?? 0); }
      if (c.kind === 'heat_shield') { hasShield = true; if (c.liftToDrag > 0) { liftToDrag = Math.max(liftToDrag, c.liftToDrag); capsuleShield = true; } }
    }
    const topId = lay.stackIds[lay.stackIds.length - 1];
    const top = topId ? fv.byId.get(topId) : null;
    if (top) noseKey = top.kind === 'nose_cone' ? (top.shape ?? 'ogive') : top.kind === 'fairing' ? 'cone' : top.kind === 'payload' ? 'flat' : 'flat';
    const cnBody = 2.0, xcpBody = 0.5 * L;
    const cnTot = cnBody + cnFins;
    this.geom = {
      Sref: (Math.PI * D * D) / 4, length: L, diameter: D,
      cnAlpha: cnTot, xcp: (cnBody * xcpBody + xFins) / cnTot,
      planform: (L * D) / ((Math.PI * D * D) / 4),
      noseFactor: NOSE_FACTORS[noseKey] ?? 2.6,
      baseFactor: hasShield ? NOSE_FACTORS.capsule : 3.0,
      liftToDrag, capsuleShield,
    };
    this.fv.updateLeadNode();
  }

  // ---------------------------------------------------------------------------------------------------------
  // force / torque evaluation (shared by the RK4 derivative and post-step diagnostics)
  // ---------------------------------------------------------------------------------------------------------
  /**
   * Wind at a point (inertial x, y, z of the planet-centred frame) in m/s. environment.wind = {speed, fromDeg, gustFraction?, seed?}:
   * a jet-stream style profile (20 % at the ground, peak at 12 km, gone by 26 km) blowing FROM the compass direction `fromDeg`,
   * plus smooth gusts. The gust phases come from the seed, so the same seed always gives the same wind.
   */
  _windAt(rx, ry, rz, rm, alt) {
    const W = this._wind, ux = rx / rm, uy = ry / rm, uz = rz / rm;
    let ex = -uy, ey = ux, ez = 0; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;           // east = z x up
    const nx = uy * ez - uz * ey, ny = uz * ex - ux * ez, nz = ux * ey - uy * ex;                      // north = up x east
    if (W.table) {                                                                                                                       // measured wind: east/north components interpolated by height, fading out over 10 km above the last level
      const T = W.table; let e, n;
      if (alt <= T[0][0]) { e = T[0][1]; n = T[0][2]; }
      else { let i = 1; while (i < T.length && T[i][0] < alt) i++; if (i >= T.length) { const f = Math.max(0, 1 - (alt - T[T.length - 1][0]) / 10000); e = T[T.length - 1][1] * f; n = T[T.length - 1][2] * f; } else { const f = (alt - T[i - 1][0]) / Math.max(T[i][0] - T[i - 1][0], 1); e = T[i - 1][1] + f * (T[i][1] - T[i - 1][1]); n = T[i - 1][2] + f * (T[i][2] - T[i - 1][2]); } }
      const g = 1 + W.gust * (0.6 * Math.sin(this.t / 7 + W.ph[0]) + 0.4 * Math.sin(this.t / 3.1 + W.ph[1]));
      return [g * (e * ex + n * nx), g * (e * ey + n * ny), g * (e * ez + n * nz)];
    }
    const prof = alt < 12000 ? 0.2 + 0.8 * Math.max(0, alt) / 12000 : Math.max(0, 1 - (alt - 12000) / 14000);
    if (prof <= 0 && !(W.shearSpeed && alt < W.shearAlt + 6000)) return [0, 0, 0];
    const t = this.t, g = 1 + W.gust * (0.6 * Math.sin(t / 7 + W.ph[0]) + 0.4 * Math.sin(t / 3.1 + W.ph[1]));
    let sp = W.speed * prof * g, te = W.te, tn = W.tn;
    if (W.turn) { const a = W.turn * Math.min(1, Math.max(0, alt) / 12000), c = Math.cos(a), s = Math.sin(a); [te, tn] = [te * c + tn * s, tn * c - te * s]; }   // 2.4 Ekman-style turning of the wind with height (full turn reached at 12 km)
    if (W.shearSpeed && W.shearAlt) { const z = (alt - W.shearAlt) / 1500; sp += W.shearSpeed * Math.exp(-z * z); }                                   // 2.4 a thin layer of extra wind (a sharp shear the rocket flies through in a second or two)
    return [sp * (te * ex + tn * nx), sp * (te * ey + tn * ny), sp * (te * ez + tn * nz)];
  }

  _evalForces(tau, y, out, _unused) {
    const c = this._ctx;
    const P = this.primary;
    const mu = P.mu;
    const rx = y[0], ry = y[1], rz = y[2];
    const r2 = rx * rx + ry * ry + rz * rz, rm = Math.sqrt(r2), r3 = r2 * rm;
    let gx = (-mu * rx) / r3, gy = (-mu * ry) / r3, gz = (-mu * rz) / r3;
    if (this.settings.j2 && P.j2) {
      const k = (1.5 * P.j2 * mu * P.radius * P.radius) / (r2 * r2), z2 = (rz * rz) / r2;   // acceleration magnitude 1.5 J2 mu R^2 / r^4 (2.1 fix: it was divided by one more r, which made J2 ~7 orders of magnitude too weak)
      gx += -k * (rx / rm) * (1 - 5 * z2) * 1; gy += -k * (ry / rm) * (1 - 5 * z2); gz += -k * (rz / rm) * (3 - 5 * z2);
    }
    const q = [y[6], y[7], y[8], y[9]];
    const w = [y[10], y[11], y[12]];
    const m = c ? c.m0 - c.mdot * tau : this.fv.mass;
    const ax = qRotate(q, [1, 0, 0]);
    // --- atmosphere & aerodynamics ---
    const alt = rm - P.radius;
    const atmM = P.atmosphereModel;
    let rho = 0, aSound = 300, pAmb = 0, Tamb = 0;
    if (atmM.hasAtmosphere && alt < atmM.height) { const a = atmM.query(alt); rho = a.rho; aSound = a.a; pAmb = a.p; Tamb = a.T; }
    const om = P.omega;
    let vax = y[3] + om * ry, vay = y[4] - om * rx, vaz = y[5];
    if (rho > 0) {
      if (this._densityScale !== 1) { rho *= this._densityScale; pAmb *= this._densityScale; }
      if (this._wind) { const wv = this._windAt(rx, ry, rz, rm, alt); vax -= wv[0]; vay -= wv[1]; vaz -= wv[2]; }   // air-relative velocity: the vehicle is pushed by the wind
    }
    const speed = Math.sqrt(vax * vax + vay * vay + vaz * vaz);
    let Fx = 0, Fy = 0, Fz = 0, torqueAero = [0, 0, 0], qd = 0, mach = 0, alpha = 0, drag = 0, lift = 0;
    if (rho > 0 && speed > 0.1) {
      const g = this.geom;
      const u = [vax / speed, vay / speed, vaz / speed];
      const cosA = clamp(dot(u, ax), -1, 1);
      alpha = Math.acos(cosA);
      mach = speed / aSound; qd = 0.5 * rho * speed * speed;
      const CA0 = axialCoeff(mach);
      const powered = c && c.Tvac > 0;
      const CA = (g.capsuleShield && cosA < 0) ? capsuleCoeff(mach) : CA0 * (cosA >= 0 ? g.noseFactor : g.baseFactor) * (powered ? 0.88 : 1);
      const fa = -qd * g.Sref * CA * cosA;
      const up = [u[0] - cosA * ax[0], u[1] - cosA * ax[1], u[2] - cosA * ax[2]];
      const sinA = len(up);
      let fnMag = 0, nHat = [0, 0, 0];
      if (sinA > 1e-9) {
        nHat = [up[0] / sinA, up[1] / sinA, up[2] / sinA];
        fnMag = qd * g.Sref * normalCoeff(alpha, g.cnAlpha, g.planform);
      }
      Fx += fa * ax[0] - fnMag * nHat[0]; Fy += fa * ax[1] - fnMag * nHat[1]; Fz += fa * ax[2] - fnMag * nHat[2];
      // torque about CG from normal force acting at the centre of pressure
      const arm = c ? g.xcp - c.cg : 0;
      // F_N = -fnMag * nHat, r = arm * ax  =>  tau = arm * (ax x F_N)
      const tN = cross(ax, [-fnMag * nHat[0], -fnMag * nHat[1], -fnMag * nHat[2]]);
      torqueAero = [arm * tN[0], arm * tN[1], arm * tN[2]];
      // pitch damping (small aerodynamic rate damping)
      drag = -(Fx * u[0] + Fy * u[1] + Fz * u[2]);
      const lx = Fx + drag * u[0], ly = Fy + drag * u[1], lz = Fz + drag * u[2];
      lift = Math.sqrt(lx * lx + ly * ly + lz * lz);
      // capsule trimmed at an angle of attack (Apollo: L/D about 0.3): lift acts at right angles to the airflow, turned by the bank angle the entry guidance commands
      if (g.liftToDrag > 0 && cosA < -0.5 && !(c && c.chuteCdA > 0)) {
        const ux = rx / rm, uy = ry / rm, uz = rz / rm, du = ux * u[0] + uy * u[1] + uz * u[2];
        let e1x = ux - du * u[0], e1y = uy - du * u[1], e1z = uz - du * u[2];
        const e1l = Math.hypot(e1x, e1y, e1z);
        if (e1l > 1e-6) {
          e1x /= e1l; e1y /= e1l; e1z /= e1l;
          const e2x = u[1] * e1z - u[2] * e1y, e2y = u[2] * e1x - u[0] * e1z, e2z = u[0] * e1y - u[1] * e1x;
          const bank = this._bank ?? 0, cb = Math.cos(bank), sb = Math.sin(bank);
          const Lf = g.liftToDrag * drag * Math.min(1, speed / 80);
          Fx += Lf * (cb * e1x + sb * e2x); Fy += Lf * (cb * e1y + sb * e2y); Fz += Lf * (cb * e1z + sb * e2z);
          lift += Lf;
        }
      }
      // parachutes
      if (c && c.chuteCdA > 0) {
        const fp = -0.5 * rho * speed * speed * c.chuteCdA;
        Fx += fp * u[0]; Fy += fp * u[1]; Fz += fp * u[2]; drag += -fp;
      }
    }
    // --- thrust ---
    let thrust = 0, Tg = 0, Tf = 0, ty = 0, tz = 0, gimbalAngle = 0;
    let tauCtl = [0, 0, 0], attErr = 0, dirB = [1, 0, 0];
    let usedRcs = 0, usedWheel = 0, usedGimbal = 0;
    const pf = clamp(pAmb / 101325, 0, 1);
    if (c) {
      Tg = Math.max(c.TgVac - pf * c.TgLoss, 0); Tf = Math.max(c.TfVac - pf * c.TfLoss, 0);
      // attitude control law (PD on pointing error in body frame)
      let tcy = 0, tcz = 0, tcx = 0;
      if (c.controlDir) {
        const cb = qRotate(qConj(q), c.controlDir); // desired direction in body frame
        if (c.sensY || c.sensZ) { cb[1] += c.sensY; cb[2] += c.sensZ; }   // bent structure: the sensor sees a slightly wrong attitude (settings.flex)
        dirB = cb;
        const cx = clamp(cb[0], -1, 1);
        const th = Math.acos(cx);
        attErr = th;
        const sn = Math.hypot(cb[1], cb[2]);
        let ey = 0, ez = 0;
        if (sn > 1e-9) { const k = Math.min(th, 0.9) / sn; ey = -cb[2] * k; ez = cb[1] * k; }
        else if (cx < 0) { ey = 0.9; }
        const Kp = c.Kp, Kd = c.Kd;
        tcy = c.Ilat * (Kp * ey - Kd * w[1]); tcz = c.Ilat * (Kp * ez - Kd * w[2]);
        tcx = -c.Iax * Kd * 0.5 * w[0]; // roll damping
      }
      // gimbal torque (thrust vectoring): tau_y = -dx*Tz, tau_z = dx*Ty  (dx = x_gimbal - x_cg < 0)
      if (Tg > 1 && c.dxg < -1e-3 && c.controlDir) {
        let Ty = tcz / c.dxg, Tz = -tcy / c.dxg;
        const lim = Tg * c.sinGimbal, mag = Math.hypot(Ty, Tz);
        if (mag > lim) { const s = lim / mag; Ty *= s; Tz *= s; }
        ty = Ty; tz = Tz;
        gimbalAngle = Math.asin(clamp(Math.hypot(Ty, Tz) / Math.max(Tg, 1e-9), 0, 1));
      }
      const tgY = -c.dxg * tz, tgZ = c.dxg * ty;
      usedGimbal = Math.hypot(tgY, tgZ);
      // auxiliary (RCS / reaction wheels) supply the remainder up to their authority
      let remY = tcy - tgY, remZ = tcz - tgZ;
      const auth = c.auxAuthority;
      const mg = Math.hypot(remY, remZ);
      if (mg > auth) { const s = auth / Math.max(mg, 1e-12); remY *= s; remZ *= s; }
      if (!c.controlDir) { remY = 0; remZ = 0; }
      tauCtl = [Math.max(Math.min(tcx, auth), -auth), tgY + remY, tgZ + remZ];
      usedRcs = Math.hypot(remY, remZ) * c.rcsShare; usedWheel = Math.hypot(remY, remZ) * (1 - c.rcsShare);
      const Txb = Math.sqrt(Math.max(Tg * Tg - ty * ty - tz * tz, 0)) + Tf;
      thrust = Txb;
      const Fb = qRotate(q, [Txb, ty, tz]);
      Fx += Fb[0]; Fy += Fb[1]; Fz += Fb[2];
      if (c.slFy || c.slFz) { const Fs = qRotate(q, [0, c.slFy, c.slFz]); Fx += Fs[0]; Fy += Fs[1]; Fz += Fs[2]; }   // slosh: the sloshing liquid pushes on the tank walls
    }
    // --- outputs ---
    const invm = 1 / Math.max(m, 1e-6);
    out.ax = gx + Fx * invm; out.ay = gy + Fy * invm; out.az = gz + Fz * invm;
    out.Fx = Fx; out.Fy = Fy; out.Fz = Fz;
    // rotational dynamics in the body frame
    const tauA_b = qRotate(qConj(q), torqueAero);
    const Ilat = c ? c.Ilat : 1, Iax = c ? c.Iax : 1;
    const tx = tauA_b[0] + tauCtl[0], ty2 = tauA_b[1] + tauCtl[1] + (c?.slTy ?? 0), tz2 = tauA_b[2] + tauCtl[2] + (c?.slTz ?? 0);
    out.dwx = tx / Iax;
    out.dwy = (ty2 + (Ilat - Iax) * w[2] * w[0]) / Ilat;
    out.dwz = (tz2 + (Iax - Ilat) * w[0] * w[1]) / Ilat;
    out.thrust = thrust; out.qd = qd; out.mach = mach; out.alpha = alpha; out.drag = drag; out.lift = lift; out.rho = rho; out.pAmb = pAmb; out.Tamb = Tamb;
    out.speedAir = speed; out.attErr = attErr; out.gimbal = gimbalAngle; out.m = m; out.axis = ax; out.alt = alt;
    out.vAir = [vax, vay, vaz]; out.usedRcs = usedRcs; out.usedWheel = usedWheel; out.usedGimbal = usedGimbal;
    out.thrustVec = c ? qRotate(q, [thrust, ty, tz]) : [0, 0, 0];
    return out;
  }

  /** 2.3: slosh and bending of the structure for this step (physics/flex-slosh.js); the forces and the sensor error go into the step context */
  _applySloshFlex(ctx, dt) {
    const sf = (this.sf ??= new SloshFlex(this)), o = this.tmpOut, y = this.y, q = [y[6], y[7], y[8], y[9]], qc = qConj(q);
    const m = Math.max(o.m ?? this.fv.mass, 1), Fb = qRotate(qc, [o.Fx ?? 0, o.Fy ?? 0, o.Fz ?? 0]);
    const Tb = o.thrustVec ? qRotate(qc, o.thrustVec) : [0, 0, 0];
    const prev = { aAxial: Fb[0] / m, aLatY: Fb[1] / m, aLatZ: Fb[2] / m, alphaY: o.dwy ?? 0, alphaZ: o.dwz ?? 0, thrustY: Tb[1], thrustZ: Tb[2], aeroY: Fb[1] - Tb[1], aeroZ: Fb[2] - Tb[2] };
    const r = sf.update(dt, prev);
    ctx.slFy = r.Fy; ctx.slFz = r.Fz; ctx.slTy = r.Ty; ctx.slTz = r.Tz; ctx.sensY = r.sensY; ctx.sensZ = r.sensZ;
    this.sfInfo = r;
  }

  _derivative = (tau, y, dy) => {
    const o = this._dtmp;
    this._evalForces(tau, y, o, 0);
    dy[0] = y[3]; dy[1] = y[4]; dy[2] = y[5];
    dy[3] = o.ax; dy[4] = o.ay; dy[5] = o.az;
    const w0 = y[10], w1 = y[11], w2 = y[12];
    dy[6] = 0.5 * (-y[7] * w0 - y[8] * w1 - y[9] * w2);
    dy[7] = 0.5 * (y[6] * w0 + y[8] * w2 - y[9] * w1);
    dy[8] = 0.5 * (y[6] * w1 - y[7] * w2 + y[9] * w0);
    dy[9] = 0.5 * (y[6] * w2 + y[7] * w1 - y[8] * w0);
    dy[10] = o.dwx; dy[11] = o.dwy; dy[12] = o.dwz;
  };
  _dtmp = {};

  // ---------------------------------------------------------------------------------------------------------
  // per-step context construction
  // ---------------------------------------------------------------------------------------------------------
  _buildContext(dt, dirCmd) {
    const fv = this.fv, mp = fv.mp, lay = fv._layout;
    const P = this.primary;
    const y = this.y;
    const r = [y[0], y[1], y[2]];
    const alt = len(r) - P.radius;
    const pAmb = P.atmosphereModel.hasAtmosphere && alt < P.atmosphereModel.height ? P.atmosphereModel.query(alt).p : 0;
    // engines: spool, feed, thrust clusters
    let TgVac = 0, TgLoss = 0, TfVac = 0, TfLoss = 0, mdotTot = 0, xgW = 0, gimbalW = 0;
    let ispSum = 0, ispW = 0, thrustAnyOn = false, avgThr = 0, nOn = 0;
    const m0 = mp.mass;
    for (const e of fv.activeEngines()) {
      const comp = e.comp;
      if (e.state === 'failed' || e.state === 'spent') { e.throttle = 0; e.thrust = 0; e.mdot = 0; continue; }
      const target = e.state === 'on' ? e.cmd : 0;
      if (comp.solid) e.throttle = e.state === 'on' ? 1 : 0;
      else {
        const rate = 1 / Math.max(comp.spoolTime ?? 0.5, 0.05);
        if (e.throttle < target) e.throttle = Math.min(target, e.throttle + rate * dt);
        else if (e.throttle > target) e.throttle = Math.max(target, e.throttle - rate * 2 * dt);
      }
      if (e.throttle <= 1e-6) { e.thrust = 0; e.mdot = 0; continue; }
      const derate = e.derate ?? 1;
      const n = comp.count ?? 1;
      const prof = (comp.thrustCurve || comp.thrustShape || comp.thrustCurveTime) ? thrustFactor(comp, e.burned, e.ignitionTime != null ? this.t - e.ignitionTime : 0) : 1;   // thrust that changes over the burn (physics/thrust-curves.js)
      const mdot = (e.throttle * prof * n * comp.thrustVac * derate) / (comp.ispVac * G0);
      const duty = fv.consume(e, mdot, dt);
      if (duty < 0.999999) {
        e.state = 'spent'; e.cmd = 0; e.throttle = 0;
        this.lastPropellantDepletionT = this.t + dt * duty;
        this.log('ENGINE_SPENT', `${comp.name} (${e.group}) out of propellant`, { engine: e.id, group: e.group });
        this._forceRecord = true;
      }
      const md = mdot * duty;
      const Fvac = md * comp.ispVac * G0;
      const Floss = md * ((comp.ispVac - (comp.ispSl ?? comp.ispVac)) * G0);
      e.thrust = Fvac - Floss * (pAmb / 101325); e.mdot = md; e.burned += md * dt;
      mdotTot += md; thrustAnyOn = true; avgThr += e.throttle; nOn++;
      ispSum += comp.ispVac * Fvac; ispW += Fvac;
      const pl = lay.placements.get(comp.id);
      const xg = pl ? pl.x0 + 0.25 * (pl.x1 - pl.x0) : 0;
      if ((comp.gimbal ?? 0) > 0) { TgVac += Fvac; TgLoss += Floss; xgW += xg * Fvac; gimbalW += (comp.gimbal * DEG) * Fvac; }
      else { TfVac += Fvac; TfLoss += Floss; }
    }
    if (ispW > 0) this.lastIspVac = ispSum / ispW;
    this.avgThrottle = nOn ? avgThr / nOn : 0;
    // rcs propellant use handled after the step; authority now
    const auth = fv.attitudeAuthority();
    const rcsOn = auth.rcs > 0;
    const controlOk = !!dirCmd && fv.hasGuidance(true) && !fv.guidanceFailed;
    const xg = TgVac > 0 ? xgW / TgVac : (lay.placements.size ? 0 : 0);
    const ctx = {
      m0, mdot: mdotTot, cg: mp.cg, Ilat: mp.Ilat, Iax: mp.Iax, Tvac: TgVac + TfVac,
      TgVac, TgLoss, TfVac, TfLoss, dxg: xg - mp.cg, sinGimbal: Math.sin(TgVac > 0 ? gimbalW / TgVac : 0),
      controlDir: controlOk ? dirCmd : null,
      ...this._attitudeGains(mp),
      auxAuthority: auth.rcs + auth.wheels, rcsShare: auth.rcs + auth.wheels > 0 ? auth.rcs / (auth.rcs + auth.wheels) : 0,
      chuteCdA: this._chuteCdA(),
    };
    this.lastAuthorityNote = TgVac > 0 ? `gimbal ±${((TgVac > 0 ? gimbalW / TgVac : 0) / DEG).toFixed(1)}° with ${(ctx.auxAuthority).toFixed(0)} N·m aux` : `${ctx.auxAuthority.toFixed(1)} N·m aux only (no thrust vectoring)`;
    this.cpMinusCg = this.geom.xcp - mp.cg;
    this._thrustAnyOn = thrustAnyOn;
    return ctx;
  }

  /**
   * Attitude-controller gains. The base bandwidth is a setting; in the atmosphere the flight computer schedules the proportional
   * gain on dynamic pressure so that the closed loop stays stable against the (unstable) aerodynamic moment M_alpha / I
   * (standard gain scheduling). Authority limits (gimbal, RCS, wheels) still apply, so under-actuated vehicles do lose control.
   */
  _attitudeGains(mp) {
    const bw = this.settings.attitudeBandwidth, zeta = this.settings.attitudeDamping;
    const q = this.now?.q ?? 0;
    let aeroK = 0;
    if (q > 1 && this.geom) {
      const arm = this.geom.xcp - mp.cg;
      if (arm > 0) aeroK = (q * this.geom.Sref * this.geom.cnAlpha * arm) / Math.max(mp.Ilat, 1e-3);
    }
    const Kp = bw * bw + 3 * aeroK;
    return { Kp, Kd: 2 * zeta * Math.sqrt(Kp) };
  }

  _chuteCdA() {
    let cda = 0;
    for (const p of this.fv.parachutes) {
      const c = this.fv.byId.get(p.id);
      if (!c || !this.fv.present(c)) continue;
      if (p.state === 'deploying') {
        const f = clamp((this.t - p.tDeploy) / Math.max(c.deployTime ?? 4, 0.5), 0, 1);
        p.inflation = f * f;
        if (f >= 1) p.state = 'open';
        cda += (c.dragArea ?? 10) * p.inflation;
      } else if (p.state === 'open') { p.inflation = 1; cda += c.dragArea ?? 10; }
    }
    return cda;
  }

  // ---------------------------------------------------------------------------------------------------------
  // helpers used by mission executor / guidance
  // ---------------------------------------------------------------------------------------------------------
  _elements() { return elementsFromState(this.primary.mu, [this.y[0], this.y[1], this.y[2]], [this.y[3], this.y[4], this.y[5]]); }
  circularizeDv() {
    const el = this._elements();
    if (!(el.e < 1)) return Math.max(circularSpeed(this.primary.mu, len(this.y)) - Math.hypot(this.y[3], this.y[4], this.y[5]), 0);
    return circularSpeed(this.primary.mu, el.ra) - el.h / el.ra;
  }
  escapeDv(vInf) {
    const r = Math.hypot(this.y[0], this.y[1], this.y[2]);
    const v = Math.hypot(this.y[3], this.y[4], this.y[5]);
    return Math.sqrt(vInf * vInf + (2 * this.primary.mu) / r) - v;
  }
  /** Velocity change [m/s] that captures the ship into a circular orbit at its periapsis (for a hyperbolic or elliptic approach). */
  captureDv(apoAltitude = null) {
    const el = this._elements();
    if (!(el.rp > 0)) return NaN;
    const mu = this.primary.mu;
    const vp = Math.sqrt(2 * (el.energy + mu / el.rp));
    // capture into an ellipse with the given apoapsis altitude (or a circle when none is given)
    const ra = apoAltitude != null ? Math.max(this.primary.radius + apoAltitude, el.rp) : el.rp;
    const vTarget = Math.sqrt(mu * (2 / el.rp - 2 / (el.rp + ra)));
    return Math.max(vp - vTarget, 0);
  }
  /** Burn time [s] for a velocity change dv with the engines of a group (rocket equation at the current mass). */
  burnTime(group, dv) {
    const engs = this.fv.activeEngines().filter((e) => (!group || e.group === group) && !e.failed);
    if (!engs.length) return 0;
    let F = 0, I = 0;
    for (const e of engs) { const f = e.comp.thrustVac * (e.comp.count ?? 1); F += f; I += f * e.comp.ispVac; }
    const isp = I / F, m0 = this.fv.mass, mdot = F / (isp * G0), mf = m0 * Math.exp(-dv / (isp * G0));
    return (m0 - mf) / mdot;
  }
  halfBurnTime(group) {
    const dv = Math.max(this.circularizeDv(), 1);
    const engs = this.fv.activeEngines().filter((e) => (!group || e.group === group) && !e.failed);
    if (!engs.length) return 0;
    let F = 0, I = 0;
    for (const e of engs) { const f = e.comp.thrustVac * (e.comp.count ?? 1); F += f; I += f * e.comp.ispVac; }
    const isp = I / F, m0 = this.fv.mass, mdot = F / (isp * G0), mf = m0 * Math.exp(-dv / (isp * G0));
    return (0.5 * (m0 - mf)) / mdot;
  }
  propulsionExhausted() {
    const fv = this.fv;
    return !fv.activeEngines().some((e) => !e.failed && e.state !== 'spent' && (e.state === 'on' || e.ignitionsLeft > 0) && (fv.feedAvailable ? fv.feedAvailable(e) : this._engineHasPropellant(e)));
  }
  /** Ideal delta-v [m/s] still available from the engines that can currently burn (rocket equation on the propellant they can reach). */
  remainingDeltaV(groups = null) {
    const fv = this.fv;
    let best = 0;
    for (const e of fv.activeEngines()) {
      if (groups && !groups.includes(e.group)) continue;
      if (e.failed || e.state === 'spent' || (e.state !== 'on' && e.ignitionsLeft <= 0)) continue;
      const c = e.comp;
      let prop = 0;
      if (c.solid) prop = fv.propMass[c.id] ?? 0;
      else { const feeds = fv.feedTanks(e); prop = Math.min(...(c.propellants ?? []).map((p) => (feeds[p] ?? []).reduce((sum, t) => sum + (fv.propMass[t.id] ?? 0), 0) / (c.mixtureFraction?.[p] ?? 1))); if (!Number.isFinite(prop)) prop = 0; }
      const m = fv.mass;
      if (prop <= 0 || m <= prop) continue;
      // propellant is drawn in mixture ratio, so the usable mass is at most the sum over the feeding tanks
      const usable = Math.min(prop * (c.propellants?.length ?? 1), fv.totalPropellant().mass);
      best = Math.max(best, (c.ispVac ?? 300) * G0 * Math.log(m / Math.max(m - usable, 1e-6)));
    }
    return best;
  }
  _engineHasPropellant(e) {
    const fv = this.fv, c = e.comp;
    if (c.solid) return (fv.propMass[c.id] ?? 0) > 1e-6;
    const feeds = fv.feedTanks(e);
    return (c.propellants ?? []).every((p) => (feeds[p] ?? []).reduce((s, t) => s + (fv.propMass[t.id] ?? 0), 0) > 1e-3);
  }
  pendingBurns() { return this.executor.pendingEvents().some((e) => ['IGNITE', 'BURN', 'COURSE_CORRECTION'].includes(e.action?.type)); }

  // ---------------------------------------------------------------------------------------------------------
  // time step selection
  // ---------------------------------------------------------------------------------------------------------
  _chooseDt() {
    const s = this.settings, base = s.dt;
    const n = this.now;
    const fv0 = this.fv;
    const thrusting = fv0.activeEngines().some((e) => e.state === 'on');   // engines of separated stages do not count
    const cmdAccel = n.mass > 0 ? fv0.activeEngines().reduce((sum, e) => sum + (e.state === 'on' ? e.comp.thrustVac * (e.comp.count ?? 1) * Math.max(e.cmd, e.throttle) : 0), 0) / n.mass : 0;
    const accelThrust = cmdAccel;
    const inAtm = n.q > 0.05;
    const cap = s.coastCap[s.accuracy] ?? 2;
    let dt;
    if (this.onGround) dt = thrusting ? base : Math.min(cap, 0.5);
    else if (thrusting && accelThrust > 0.05) dt = base;
    else if (inAtm || (this.landingActive() && n.radarAlt < 5000)) dt = base;
    else if (this.landed) dt = Math.min(cap * 5, 10);
    else {
      const r = Math.hypot(this.y[0], this.y[1], this.y[2]);
      const dyn = 0.01 * Math.sqrt((r * r * r) / this.primary.mu);
      const primaryCap = this.primary.id === 'sun' ? 21600 : (thrusting ? 5 : cap);
      dt = clamp(dyn, base, Math.max(primaryCap, base));
      if (this.primary.id === 'sun' || (this.primary.parent && r > 20 * this.primary.radius && !thrusting)) dt = clamp(dyn, base, Math.max(cap * 30, 600)); // far-field coast
    }
    // do not overshoot timed events
    const nd = this.executor.nextTimedDelta();
    if (nd < dt) dt = Math.max(nd, 1e-3);
    // converge on conditional events during coast
    if (dt > base) {
      for (const e of this.executor.events) {
        if (e.status !== 'pending') continue;
        const c = e.condition;
        if (!c) continue;
        const conds = c.type === 'all' || c.type === 'any' ? c.conditions : [c];
        for (const cc of conds) {
          if (cc.type === 'timeToApoapsis' && Number.isFinite(n.tta)) {
            const th = cc.value === 'halfBurn' ? this.halfBurnTime(cc.burnGroup ?? e.action?.group) : cc.value;
            const gap = n.tta - th;
            if (gap > 0) dt = Math.min(dt, Math.max(gap * 0.5, base)); else if (gap > -5) dt = Math.min(dt, base);
          }
          if (cc.type === 'timeToPeriapsis' && Number.isFinite(n.ttp)) {
            let th = cc.value ?? 0;
            if (cc.halfBurnDv != null) th = 0.5 * this.burnTime(cc.burnGroup ?? e.action?.group, cc.halfBurnDv);
            if (th === 'halfBurnCapture') { const dvc = this.captureDv(cc.targetAltitude); th = Number.isFinite(dvc) ? 0.5 * this.burnTime(cc.burnGroup ?? e.action?.group, dvc) : 0; }
            const gap = n.ttp - th;
            if (gap > 0) dt = Math.min(dt, Math.max(gap * 0.5, base));
          }
          if ((cc.type === 'altitude' || cc.type === 'radarAltitude') && Math.abs(n.vSpeed) > 1) {
            const cur = cc.type === 'altitude' ? n.alt : n.radarAlt;
            const gap = Math.abs(cc.value - cur) / Math.abs(n.vSpeed);
            dt = Math.min(dt, Math.max(gap * 0.5, base));
          }
        }
      }
    }
    return Math.max(Math.min(dt, this.settings.maxTime - this.t + 1e-9), 1e-4);
  }

  // ---------------------------------------------------------------------------------------------------------
  // the step
  // ---------------------------------------------------------------------------------------------------------
  step() {
    if (this.finished) return false;
    // manual commands (recorded for deterministic replay)
    if (this.pendingCommands.length) {
      for (const cmd of this.pendingCommands.splice(0)) {
        this.commands.push({ t: this.t, ...cmd });
        this.executor.runNow(cmd.action ?? cmd, `Manual: ${(cmd.action ?? cmd).type}`);
      }
    }
    this.executor.update();
    if (this.executor.ended) { this._finish(this.executor.ended === 'success' ? 'SUCCESS' : 'ABORTED', 'Mission ended by command'); return false; }
    const dt = this._chooseDt();
    this._advance(dt);
    this.stepCount++;
    this._afterStep(dt);
    return !this.finished;
  }

  _advance(dt) {
    const fv = this.fv, y = this.y;
    const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]];
    fv.time = this.t;
    fv.refreshMass();
    // guidance
    const P = this.primary;
    const q = [y[6], y[7], y[8], y[9]];
    const fr = localFrame(r);
    const vAir = sub(v, [-P.omega * y[1], P.omega * y[0], 0]);
    const info = this.now;
    // guidance that names an engine group (the lunar module's descent stage) sees only that group's thrust and throttle limit
    const gGroup = this.guidance.params?.group ?? null;
    const gEngines = gGroup ? fv.activeEngines().filter((e) => e.group === gGroup) : fv.activeEngines();
    const thrustMax = gEngines.reduce((s, e) => s + (e.failed || e.state === 'spent' ? 0 : e.comp.thrustVac * (e.comp.count ?? 1) * (e.derate ?? 1)), 0);
    const gctx = {
      t: this.t, r, v, vAir, vRel: vAir, alt: info.alt ?? 0, radarAlt: info.radarAlt ?? info.alt ?? 0, qdyn: info.q ?? 0, radius: P.radius, mu: P.mu, mass: fv.mass,
      dirBody: qRotate(q, [1, 0, 0]), sunDir: this._sunDir ?? [1, 0, 0], earthDir: this._earthDir ?? null, thrustMax, gLocal: P.mu / (len(r) ** 2), omega: P.omega,
      surfacePoint: (lat, lon, tt, hh) => surfacePointInertial(P.id, lat, lon, this.env.epoch + tt, P.radius + hh),
      latLon: (rr, tt) => latLonFromInertial(P.id, rr, this.env.epoch + tt), terrainAt: (lat, lon) => this._terrainAlt(lat, lon),
      target: (this.companion && this.companion.track.body.id === P.id) ? this.companion.track.stateAt(this.t) : null,
      dragAccel: (info.drag ?? 0) / fv.mass, liftToDrag: this.geom?.liftToDrag ?? 0, minThrottle: Math.max(...gEngines.map((e) => e.comp.minThrottle ?? 0), 0), thrustAccel: (info.thrust ?? 0) > 0 ? info.thrust / fv.mass : thrustMax / fv.mass,
    };
    const gout = guidanceStep(this.guidance, gctx);
    this.guidanceInfo = gout.info ?? null;
    this._bank = gout.bank ?? 0;
    fv.shieldForward = this.guidance.mode === 'entry' || this.guidance.mode === 'lifting_entry';
    if (gout.ignite) {
      const grp = this.guidance.params.group;
      const lit = fv.activeEngines().filter((e) => e.state === 'on' && (!grp || e.group === grp));
      if (!lit.length && !this._landingIgnitionFailed) {
        const res = fv.ignite(grp ? { group: grp } : null, gout.throttle ?? 1);
        if (res.ignited === 0) { this._landingIgnitionFailed = true; if (!res.reasons.every((x) => /no propellant/.test(x))) this.monitor.ignitionProblem(res.reasons.join('; ') || 'Descent engine could not ignite'); }
        else this.log('EVENT', 'Descent engine ignition', {});
      }
    }
    if (gout.throttle != null) fv.setThrottle(this.guidance.params.group ? { group: this.guidance.params.group } : null, gout.throttle);
    const dirCmd = gout.dir;
    this._lastDirCmd = dirCmd;

    // ---------------- ground handling ----------------
    if (this.onGround) { this._advanceOnGround(dt, dirCmd); return; }

    // ---------------- flight integration ----------------
    const ctx = this._buildContext(dt, dirCmd);
    this._ctx = ctx;
    if (this.settings.slosh || this.settings.flex) this._applySloshFlex(ctx, dt);
    const mdotTot = ctx.mdot;
    const m0 = ctx.m0;
    const tauRcsBefore = { rcs: 0, wheel: 0 };
    this._dtmp = {};
    const thrusting = ctx.Tvac > 0;
    const kinematic = dt > 0.08 && ctx.Tvac < 1 && (this.now.q ?? 0) < 0.5 && !ctx.chuteCdA;
    if (kinematic) {
      // large coast step: integrate translation with RK4, attitude with a rate-limited kinematic slew
      const fy = new Float64Array(13); fy.set(y);
      const w0 = this.work;
      const f = (tt, yy, dy) => {
        const rr = Math.hypot(yy[0], yy[1], yy[2]);
        const k = -this.primary.mu / (rr * rr * rr);
        dy[0] = yy[3]; dy[1] = yy[4]; dy[2] = yy[5];
        dy[3] = k * yy[0]; dy[4] = k * yy[1]; dy[5] = k * yy[2];
        if (this.settings.j2 && this.primary.j2) {
          const P2 = this.primary, r2 = rr * rr, kk = (1.5 * P2.j2 * P2.mu * P2.radius * P2.radius) / (r2 * r2), z2 = (yy[2] * yy[2]) / r2;
          dy[3] += -kk * (yy[0] / rr) * (1 - 5 * z2); dy[4] += -kk * (yy[1] / rr) * (1 - 5 * z2); dy[5] += -kk * (yy[2] / rr) * (3 - 5 * z2);
        }
        for (let i = 6; i < 13; i++) dy[i] = 0;
      };
      rk4Step(f, this.t, y, dt, w0);
      this._slewAttitude(dt, ctx, dirCmd);
      this._evalForces(dt, y, this.tmpOut, 0);
    } else {
      rk4Step(this._derivative, 0, y, dt, this.work);
      const qn = qNormalize([y[6], y[7], y[8], y[9]]);
      y[6] = qn[0]; y[7] = qn[1]; y[8] = qn[2]; y[9] = qn[3];
      // clamp absurd body rates (numerical safety in tumbles)
      for (let i = 10; i < 13; i++) y[i] = clamp(y[i], -30, 30);
      this._evalForces(dt, y, this.tmpOut, 0);
    }
    this.lastThrustAccel = m0 > 0 ? this.tmpOut.thrust / Math.max(m0 - mdotTot * dt, 1) : 0;
    // RCS propellant use
    this._consumeRcs(dt, this.tmpOut.usedRcs);
    this._lastCtx = ctx;
  }

  _slewAttitude(dt, ctx, dirCmd) {
    const y = this.y;
    y[10] = y[11] = y[12] = 0;
    if (!dirCmd || !ctx.controlDir) return;
    const q = [y[6], y[7], y[8], y[9]];
    const a = qRotate(q, [1, 0, 0]);
    const th = angleBetween(a, dirCmd);
    if (th < 1e-9) return;
    const wmax = clamp(Math.sqrt(ctx.auxAuthority / ctx.Ilat) * 0.7, 0.003, 0.08);
    const ang = Math.min(th, wmax * dt);
    const ax = cross(a, dirCmd);
    const dq = qFromAxisAngle(ax.every((x) => Math.abs(x) < 1e-12) ? [0, 1, 0] : ax, ang);
    const qn = qNormalize(qMul(dq, q));
    y[6] = qn[0]; y[7] = qn[1]; y[8] = qn[2]; y[9] = qn[3];
    this._consumeRcs(dt, (ctx.auxAuthority > 0 ? 0.15 * ctx.rcsShare * ctx.auxAuthority * (ang / (wmax * dt)) : 0));
  }

  _consumeRcs(dt, torqueUsed) {
    if (torqueUsed <= 0) return;
    const fv = this.fv;
    const rcs = fv.presentComponents('rcs').filter((c) => (fv.propMass[c.id] ?? 0) > 0);
    if (!rcs.length) return;
    const total = rcs.reduce((s, c) => s + (c.torque ?? 1), 0);
    for (const c of rcs) {
      const share = (c.torque ?? 1) / total;
      const frac = Math.min(torqueUsed / Math.max(total, 1e-9), 1) * share * 2; // duty (both sides of a couple)
      const mdotMax = (c.thrust ?? 100) / ((c.isp ?? 220) * G0);
      fv.propMass[c.id] = Math.max(0, fv.propMass[c.id] - mdotMax * frac * dt * 0.5);
    }
    fv.attitudeTorqueUse.rcs = torqueUsed;
  }

  _advanceOnGround(dt, dirCmd) {
    const fv = this.fv, P = this.primary, y = this.y;
    const ctx = this._buildContext(dt, null);
    this._ctx = ctx;
    // rover driving updates the position (this.pad) and the terrain height under the wheels
    if (this.rover && this.landed) { this.rover.step(dt); this.landedAlt = this.rover.terrainH; }
    // position on the rotating surface
    const tNew = this.t + dt;
    const h = (this.landed || this.liftoffArmed) ? (this.landedAlt ?? 0) : (this.mission.initial?.altitude ?? 0);
    const pos = surfacePointInertial(P.id, this.pad.lat, this.pad.lon, this.env.epoch + tNew, P.radius + h);
    const up = norm(pos);
    // available thrust along local vertical at sea-level pressure (pad)
    const pAmb = P.atmosphereModel.hasAtmosphere ? P.atmosphereModel.query(h).p : 0;
    const pf = clamp(pAmb / 101325, 0, 1);
    const T = Math.max(ctx.TgVac - pf * ctx.TgLoss, 0) + Math.max(ctx.TfVac - pf * ctx.TfLoss, 0);
    const m = ctx.m0 - ctx.mdot * dt;
    const rm = len(pos);
    const gEff = P.mu / (rm * rm) - P.omega * P.omega * Math.hypot(pos[0], pos[1]) * (Math.hypot(pos[0], pos[1]) / rm);
    if (!this.landed && T > m * gEff) {
      // liftoff: release hold-down and start free flight from the current pad state next step
      this.onGround = false; this.tLiftoff = this.t;
      this.log('LIFTOFF', `Liftoff at T+${this.t.toFixed(2)} s, thrust/weight ${(T / (m * gEff)).toFixed(2)}`, { twr: T / (m * gEff) });
      this._forceRecord = true;
    }
    // hold state on surface
    const v = corotationVelocity(P.id, pos);
    y[0] = pos[0]; y[1] = pos[1]; y[2] = pos[2]; y[3] = v[0]; y[4] = v[1]; y[5] = v[2];
    if (this.rover && this.landed) {
      // body +X follows the terrain normal; rotation about it follows the heading (solar panels and antennas see the real tilt)
      const fr = localFrame(pos), R = this.rover;
      const [nx, ny] = R.terrainNormalEN ?? [0, 0];
      const nrm = norm([fr.up[0] + fr.east[0] * nx + fr.north[0] * ny, fr.up[1] + fr.east[1] * nx + fr.north[1] * ny, fr.up[2] + fr.east[2] * nx + fr.north[2] * ny]);
      const hs = Math.sin(R.heading), hc = Math.cos(R.heading);
      const hd = [fr.north[0] * hc + fr.east[0] * hs, fr.north[1] * hc + fr.east[1] * hs, fr.north[2] * hc + fr.east[2] * hs];
      const qn = qFromXAxis(nrm, hd);
      y[6] = qn[0]; y[7] = qn[1]; y[8] = qn[2]; y[9] = qn[3];
    } else if (!this.landed || this.landedUpright !== false) {
      const fr = localFrame(pos);
      const qn = qFromXAxis(fr.up, fr.north);
      y[6] = qn[0]; y[7] = qn[1]; y[8] = qn[2]; y[9] = qn[3];
    }
    y[10] = y[11] = y[12] = 0;
    this.lastThrustAccel = 0;
    this._evalForces(dt, y, this.tmpOut, 0);
    this.tmpOut.thrust = T; this.tmpOut.drag = 0; this.tmpOut.lift = 0;
    this._groundThrust = T;
  }

  // ---------------------------------------------------------------------------------------------------------
  // post-step processing
  // ---------------------------------------------------------------------------------------------------------
  _afterStep(dt) {
    const fv = this.fv, y = this.y;
    this.t += dt; this.lastDt = dt;
    fv.time = this.t;
    // delta-v budget (from the state used to end the step)
    const o = this.tmpOut;
    const m = Math.max(o.m, 1);
    if (!this.onGround) {
      const v = [y[3], y[4], y[5]], vm = len(v);
      if (vm > 1e-6 && o.thrust > 0) {
        const aT = o.thrust / m;
        this.budget.ideal += aT * dt;
        const vh = scale(v, 1 / vm);
        const tv = o.thrustVec; const tvm = Math.max(len(tv), 1e-9);
        this.budget.steering += aT * (1 - dot(scale(tv, 1 / tvm), vh)) * dt;
        const rm = Math.hypot(y[0], y[1], y[2]);
        this.budget.gravity += ((this.primary.mu / (rm * rm)) * dot([y[0] / rm, y[1] / rm, y[2] / rm], vh)) * dt;
        const aeroF = [o.Fx - o.thrustVec[0], o.Fy - o.thrustVec[1], o.Fz - o.thrustVec[2]];
        this.budget.drag += (-dot(aeroF, vh) / m) * dt;
      }
    }
    // topical subsystems
    this._environmentForSubsystems(dt);
    updateInstruments(fv, dt);
    // check chutes
    this._chuteLoads();
    if (this.onGround === false) this._soiTransitions();
    if (!this.onGround) this._contact();
    fv.refreshMass();
    this._refreshNow(o);
    this._structuralLoads(o);
    // comm stats
    if (fv.commState.link) this.commStats.linkTime += dt;
    this.commStats.bestMargin = Math.max(this.commStats.bestMargin, fv.commState.margin);
    if (!fv.commState.link) this.commStats.reason = fv.commState.reason;
    const destroyed = this.monitor.check(dt) ?? (this.rover ? this.monitor.checkRover(dt) : null);
    this._record(false);
    if (destroyed) { this.crashed = true; this._finish('FAILURE', destroyed); return; }
    this._checkEnd();
  }

  _environmentForSubsystems(dt) {
    const fv = this.fv, y = this.y, P = this.primary;
    const r = [y[0], y[1], y[2]];
    const tabs = this.env.epoch + this.t;
    const abs = bodyStateAbs(P.id, tabs).r;
    const posAbs = add(abs, r);
    const d = len(posAbs) || 1;
    const sunDir = scale(posAbs, -1 / d);
    this._sunDir = sunDir;
    const flux = 1361 * (1.495978707e11 / d) ** 2;
    const sunlit = isSunlit(r, sunDir, P.radius);
    const o = this.tmpOut;
    const q = [y[6], y[7], y[8], y[9]];
    // comms geometry
    let commTargetDir = null, commRange = 0, commOccluded = false, commElev = null;
    const gs = this.env.groundStation;
    const earth = getBody('earth');
    if (P.id === 'earth') {
      const gsPos = surfacePointInertial('earth', gs.lat * DEG, gs.lon * DEG, tabs, earth.radius);
      const rel = sub(gsPos, r);
      commRange = len(rel); commTargetDir = norm(rel);
      const upG = norm(gsPos);
      // elevation of the vehicle as seen from the station
      commElev = Math.asin(clamp(dot(norm(sub(r, gsPos)), upG), -1, 1)) / DEG;
    } else {
      const earthAbs = bodyStateAbs('earth', tabs).r;
      const rel = sub(earthAbs, posAbs);
      commRange = len(rel); commTargetDir = norm(rel);
      // occultation by the primary (line of sight from vehicle to Earth blocked by the body)
      if (P.id !== 'sun') {
        const dr = dot(r, commTargetDir);
        if (dr < 0) { const perp = Math.sqrt(Math.max(len(r) ** 2 - dr * dr, 0)); commOccluded = perp < P.radius; }
      }
    }
    this._earthDir = commTargetDir;
    // planetary IR + albedo (view factor of the primary from the vehicle)
    const rm = len(r), alt = rm - P.radius;
    let ar = 0;
    for (const c of fv.presentComponents()) if (c.mount === 'stack' || c.mount === 'internal' || c.mount === 'body') ar += Math.PI * (c.diameter ?? 0.3) * (c.length ?? 0.3);
    const projected = Math.max(ar / 4, 0.01);
    const view = alt >= 0 && alt < 50 * P.radius ? (P.radius / rm) ** 2 : 0;
    const planetIR = (P.surface?.irFlux ?? 0) * view * 0.8 * projected;
    const albedoFlux = sunlit ? (P.surface?.albedo ?? 0) * flux * view * 0.6 * projected * Math.max(dot(norm(r), sunDir), 0) : 0;
    const dense = (o.rho ?? 0) > 1e-3;
    const env = {
      q, sunDir, solarFlux: flux, sunlit, inAtmosphere: (o.rho ?? 0) > 1e-6,
      heatFlux: o.rho > 0 ? stagnationHeatFlux(heatingConstant(P.id), o.rho, fv.thermal.lead.noseRadius || 0.2, o.speedAir) : 0,
      speed: o.speedAir, ambientT: dense ? o.Tamb : 3, surfaceT: dense ? o.Tamb : 3,
      convectionW: dense ? 12 * Math.min(o.rho, 1.2) * Math.max(ar, 0.1) * (this.landed ? 1 : 0.3) : 0,
      planetIR, albedoFlux, internalPower: fv.powerState.consumption * 0.9,
      commTargetDir, commRange, commOccluded, commElevationDeg: commElev, groundStation: gs, wantTransmit: this.wantTransmit || (fv.dataStored > 0),
    };
    if (this.onGround || this.landed) {
      const sinEl = dot(norm(r), sunDir);
      env.sunElevation = Math.asin(clamp(sinEl, -1, 1)) / DEG;
      if (P.surface?.temperature) {
        const tD = P.surface.tDay ?? P.surface.temperature, tN = P.surface.tNight ?? P.surface.temperature;
        env.surfaceT = tN + (tD - tN) * Math.pow(Math.max(sinEl, 0), 0.25);
      }
      env.onSurface = true; env.skyT = dense ? (o.Tamb ?? 3) - 10 : 3;
      if (this.rover) env.extraLoad = this.rover.drivePowerW;
    }
    updatePower(fv, dt, env);
    if (fv.forcedBlackout) fv.powerState.blackout = true;
    updateThermal(fv, dt, env);
    if (fv.commDisabled) { fv.commState.link = false; fv.commState.margin = -99; fv.commState.dataRate = 0; fv.commState.reason = 'antenna failed'; }
    else updateComms(fv, dt, env);
    this._env = env;
  }

  _chuteLoads() {
    const fv = this.fv, o = this.tmpOut;
    for (const p of fv.parachutes) {
      const c = fv.byId.get(p.id);
      if (!c || !fv.present(c)) continue;
      if (p.state === 'deploying' && this.t - p.tDeploy < 0.05 && !p.checked) {
        p.checked = true;
        if (o.qd > (c.maxDeployQ ?? 1e9) || o.speedAir > (c.maxDeploySpeed ?? 1e9)) {
          p.state = 'failed';
          this.monitor.add({ code: 'PARACHUTE_FAILURE', title: 'Parachute failure', severity: 'major', confidence: CONFIDENCE.CONFIRMED,
            primaryCause: `Parachute deployed at ${o.qd.toFixed(0)} Pa dynamic pressure / ${o.speedAir.toFixed(0)} m/s, above its ${((c.maxDeployQ ?? 0)).toFixed(0)} Pa / ${(c.maxDeploySpeed ?? 0).toFixed(0)} m/s limit.`,
            contributing: ['Deployment triggered too early or too fast'], evidence: [{ label: 'Dynamic pressure', value: o.qd, unit: 'Pa' }, { label: 'Airspeed', value: o.speedAir, unit: 'm/s' }],
            consequences: 'Canopy tore during inflation; no deceleration.', solutions: ['Deploy later (lower speed / dynamic pressure)', 'Use a drogue stage or stronger canopy'] });
        }
      }
      if (p.state === 'open') {
        const load = 0.5 * o.rho * o.speedAir * o.speedAir * (c.dragArea ?? 10);
        if (load > (c.maxLoad ?? 1e12)) p.state = 'failed';
      }
    }
  }

  _structuralLoads(o) {
    const fv = this.fv, lay = fv._layout, n = this.now;
    if (!this.geom) return;
    let axial = 0, bending = 0;
    const m = Math.max(o.m ?? fv.mass, 1);
    const nAx = (o.thrust + dot([o.Fx - o.thrustVec[0], o.Fy - o.thrustVec[1], o.Fz - o.thrustVec[2]], o.axis)) / m; // proper accel along +X
    const ids = lay.stackIds;
    const masses = ids.map((id) => {
      const c = fv.byId.get(id);
      let mm = (c.mass ?? 0) * (c.count ?? 1) + (fv.propMass[id] ?? 0);
      return mm;
    });
    // add internal and radial masses to their host stack element
    const host = new Map(ids.map((id, i) => [id, i]));
    for (const c of fv.presentComponents()) {
      if (c.mount === 'stack') continue;
      const pl = lay.placements.get(c.id);
      if (!pl) continue;
      const mm = (c.mass ?? 0) * (c.count ?? 1) + (fv.propMass[c.id] ?? 0);
      let hi = c.parent && host.has(c.parent) ? host.get(c.parent) : ids.findIndex((id) => { const p = lay.placements.get(id); return p && pl.xc >= p.x0 && pl.xc <= p.x1; });
      if (hi >= 0) masses[hi] += mm;
    }
    let above = 0;
    for (let i = ids.length - 1; i >= 0; i--) {
      const c = fv.byId.get(ids[i]);
      const strength = c.strength ?? (c.kind === 'engine' ? Infinity : 1.2e6 * (c.diameter ?? 1) ** 2);
      if (Number.isFinite(strength)) axial = Math.max(axial, Math.abs(above * nAx) / strength);
      above += masses[i];
    }
    const qa = o.qd * Math.min(o.alpha, Math.PI - o.alpha);
    const qaLim = this.monitor.limits?.qaLimit ?? Infinity;
    bending = Number.isFinite(qaLim) ? qa / qaLim : 0;
    n.structAxial = axial; n.structBending = bending; n.structRatio = axial + bending;
  }

  // ---------------------------------------------------------------------------------------------------------
  // sphere-of-influence transitions
  // ---------------------------------------------------------------------------------------------------------
  _soiTransitions() {
    const y = this.y, P = this.primary;
    const rm = Math.hypot(y[0], y[1], y[2]);
    const tabs = this.env.epoch + this.t;
    if (P.parent && rm > P.soi) {
      const s = bodyStateRelParent(P.id, tabs);
      for (let i = 0; i < 3; i++) { y[i] += s.r[i]; y[3 + i] += s.v[i]; }
      const parent = getBody(P.parent);
      this.log('SOI', `Left ${P.name} sphere of influence, now in ${parent.name} frame`, { from: P.id, to: parent.id });
      this.primary = parent; this._forceRecord = true; this.limitsDirty = true;
      this.visited ??= new Set(); this.visited.add(parent.id);
      return;
    }
    for (const cid of P.children ?? []) {
      const C = getBody(cid);
      if (!C.soi || !Number.isFinite(C.soi)) continue;
      const s = bodyStateRelParent(cid, tabs);
      const rel = [y[0] - s.r[0], y[1] - s.r[1], y[2] - s.r[2]];
      if (Math.hypot(...rel) < C.soi) {
        for (let i = 0; i < 3; i++) { y[i] -= s.r[i]; y[3 + i] -= s.v[i]; }
        this.log('SOI', `Entered ${C.name} sphere of influence`, { from: P.id, to: C.id });
        this.primary = C; this._forceRecord = true; this.limitsDirty = true;
        this.visited ??= new Set(); this.visited.add(C.id);
        this.closestApproach = { body: C.id, alt: Infinity };
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // surface contact / landing classification
  // ---------------------------------------------------------------------------------------------------------
  _terrainAlt(lat, lon) { return terrainHeight(this.primary.id, lat, lon, this.env.terrainSeed) - (this.primary.id === this.home.id ? this.terrainDatum : 0); }
  _contact() {
    const y = this.y, P = this.primary;
    const r = [y[0], y[1], y[2]];
    const rm = len(r);
    const alt = rm - P.radius;
    if (alt > 60000 && P.radius > 1e5) { this._radarAlt = alt; return; }
    const ll = latLonFromInertial(P.id, r, this.env.epoch + this.t);
    const th = this._terrainAlt(ll.lat, ll.lon);
    this._radarAlt = alt - th;
    if (this.tLiftoff != null && this.t - this.tLiftoff < 1.5) return;
    if (this._radarAlt > 0) return;
    // touchdown
    const up = norm(r);
    const vRel = sub([y[3], y[4], y[5]], corotationVelocity(P.id, r));
    const vUp = dot(vRel, up);
    if (vUp >= 0.05 && !this.landed) { return; }
    this._touchdown(r, up, vRel, ll, th);
  }

  landingCapabilities() {
    const fv = this.fv;
    const legs = fv.presentComponents('landing_legs').filter((c) => fv.deployed.has(c.id) || !c.deployable);
    const stowed = fv.presentComponents('landing_legs').length - legs.length;
    const mp = fv.mp;
    if (legs.length) {
      const vmax = Math.min(...legs.map((c) => c.maxImpactVelocity ?? 3));
      const foot = Math.max(...legs.map((c) => c.footprintRadius ?? 1));
      const legLen = Math.max(...legs.map((c) => c.legLength ?? 0.5));
      const hCg = mp.cg + legLen;
      return { hasLegs: true, stowed, vMaxVert: vmax, vMaxHoriz: legs[0].maxHorizontal ?? 1.5, tip: Math.atan(foot / Math.max(hCg, 0.1)), foot, hCg };
    }
    const splash = fv.presentComponents().filter((c) => c.splashdown);
    if (splash.length) return { hasLegs: false, splash: true, stowed, vMaxVert: Math.max(...splash.map((c) => c.impactTolerance ?? 9)), vMaxHoriz: 20, tip: Math.PI / 2, foot: mp.maxDiameter / 2, hCg: mp.cg };   // a capsule on its parachutes lands in water, in any attitude
    return { hasLegs: false, stowed, vMaxVert: Math.max(...fv.presentComponents().map((c) => c.impactTolerance ?? 0), 0.8), vMaxHoriz: 0.5, tip: Math.atan((mp.maxDiameter / 2) / Math.max(mp.cg, 0.1)), foot: mp.maxDiameter / 2, hCg: mp.cg };
  }

  _touchdown(r, up, vRel, ll, terrainAlt) {
    const y = this.y, fv = this.fv, P = this.primary;
    const vVert = -dot(vRel, up), vHoriz = len(sub(vRel, scale(up, dot(vRel, up))));
    const axis = qRotate([y[6], y[7], y[8], y[9]], [1, 0, 0]);
    const tilt = angleBetween(axis, up);
    const x = ll.lon * P.radius * Math.cos(ll.lat), yy = ll.lat * P.radius;
    const slope = terrainSlope(P.id, x, yy, this.env.terrainSeed).angle;
    const cap = this.landingCapabilities();
    const info = { vVert, vHoriz, tilt: tilt / DEG, slope: slope / DEG, vMaxVert: cap.vMaxVert, vMaxHoriz: cap.vMaxHoriz, tipAngle: cap.tip / DEG, legs: cap.hasLegs, t: this.t };
    this.touchdown = info;
    fv.shutdown(null);
    const isLandingMission = this.mission.objective?.type === 'landing';
    let outcome = 'landed', title = '', cause = '', severity = 'major';
    if (vVert > cap.vMaxVert * 2.2 || vHoriz > 8 + cap.vMaxHoriz) { outcome = 'crash'; title = isLandingMission ? 'Landing failure: crash' : 'Surface impact'; severity = 'catastrophic'; cause = `Touchdown at ${vVert.toFixed(1)} m/s vertical / ${vHoriz.toFixed(1)} m/s horizontal far exceeded the ${cap.vMaxVert.toFixed(1)} m/s vertical rating${cap.hasLegs ? '' : ' (no landing legs deployed)'}.`; }
    else if (vVert > cap.vMaxVert) { outcome = 'hard'; title = 'Landing failure: hard landing'; cause = `Vertical touchdown speed ${vVert.toFixed(2)} m/s exceeded the ${cap.vMaxVert.toFixed(2)} m/s leg impact rating.`; }
    else if (tilt + slope > cap.tip || vHoriz > cap.vMaxHoriz) {
      outcome = 'tipover'; title = 'Landing failure: tip-over';
      cause = tilt + slope > cap.tip ? `Combined tilt (${(tilt / DEG).toFixed(1)}°) and terrain slope (${(slope / DEG).toFixed(1)}°) exceeded the ${(cap.tip / DEG).toFixed(1)}° static tip-over angle.` : `Horizontal velocity ${vHoriz.toFixed(2)} m/s exceeded the ${cap.vMaxHoriz.toFixed(2)} m/s limit; the lander toppled.`;
    }
    if (outcome === 'landed') {
      this.landed = true; this.landedSafe = true; this.onGround = true; this.landedAlt = terrainAlt + this.terrainDatum * 0 + (P.id === this.home.id ? 0 : 0);
      this.pad = { lat: ll.lat, lon: ll.lon }; this.landedAlt = terrainAlt; this.landedUpright = true;
      this.mission.initial = { ...(this.mission.initial ?? {}), altitude: terrainAlt };
      this.log('LANDED', `${cap.splash ? 'Splashdown' : 'Soft landing'} at ${(ll.lat / DEG).toFixed(3)}°, ${(ll.lon / DEG).toFixed(3)}°: ${vVert.toFixed(2)} m/s vertical, ${vHoriz.toFixed(2)} m/s horizontal, tilt ${(tilt / DEG).toFixed(1)}°`, info);
      this._forceRecord = true;
      // snap to surface next step
      this.setGuidance('hold', {});
      return;
    }
    this.landedHard = outcome !== 'crash' ? true : this.landedHard; this.crashed = outcome === 'crash';
    this.monitor.add({ code: isLandingMission ? 'LANDING_FAILURE' : 'SURFACE_IMPACT', title, severity, confidence: CONFIDENCE.CONFIRMED, t: this.t, primaryCause: cause,
      contributing: [`Legs ${cap.hasLegs ? 'deployed' : cap.stowed ? 'were still stowed at touchdown' : 'not fitted'}`, `Propellant remaining: ${fv.totalPropellant().mass.toFixed(1)} kg`,
        this.now.thrust > 0 ? 'Engines were still firing at contact' : 'Engines were off at contact'],
      evidence: [{ label: 'Vertical speed', value: vVert, unit: 'm/s', t: this.t }, { label: 'Horizontal speed', value: vHoriz, unit: 'm/s' }, { label: 'Tilt', value: tilt / DEG, unit: 'deg' }, { label: 'Terrain slope', value: slope / DEG, unit: 'deg' }, { label: 'Impact rating', value: cap.vMaxVert, unit: 'm/s' }],
      consequences: outcome === 'crash' ? 'Vehicle destroyed.' : 'Vehicle damaged or overturned; mission objective not met.',
      solutions: ['Increase descent-engine thrust margin and ignite earlier (suicide-burn timing)', 'Deploy landing legs before touchdown', 'Carry more propellant for the terminal descent', 'Reduce horizontal velocity to <1 m/s before contact'],
      equation: { name: 'Stopping distance', formula: 'd = v² / (2 (a_max − g))', values: `v=${vVert.toFixed(1)} m/s` } });
    this._finish('FAILURE', title);
  }

  // ---------------------------------------------------------------------------------------------------------
  // derived quantities ("now") and telemetry
  // ---------------------------------------------------------------------------------------------------------
  _refreshNow(o) {
    const y = this.y, P = this.primary, fv = this.fv;
    const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]];
    const rm = len(r), vm = len(v);
    const up = [r[0] / rm, r[1] / rm, r[2] / rm];
    const el = elementsFromState(P.mu, r, v);
    const ll = latLonFromInertial(P.id, r, this.env.epoch + this.t);
    const vAir = o.vAir ?? [0, 0, 0];
    const vRel = sub(v, corotationVelocity(P.id, r));
    const vUp = dot(vRel, up);
    const hSpeed = len(sub(vRel, scale(up, vUp)));
    const mp = fv.mp;
    const n = this.now;
    const alt = rm - P.radius;
    const properAccel = o.m > 0 ? len([o.Fx, o.Fy, o.Fz]) / Math.max(o.m, 1e-6) : 0;
    const groundThrust = this.onGround ? (this._groundThrust ?? 0) : 0;
    const thrust = this.onGround ? groundThrust : (o.thrust ?? 0);
    const localG = P.mu / (rm * rm);
    n.t = this.t; n.alt = alt; n.radarAlt = this._radarAlt ?? alt; n.speed = vm; n.surfSpeed = len(vRel); n.vSpeed = vUp; n.hSpeed = hSpeed;
    n.accel = this.onGround ? Math.max(0, thrust / mp.mass) : properAccel; n.gload = n.accel / G0;
    n.mass = mp.mass; n.propMass = fv.totalPropellant().mass; n.propFrac = fv.totalPropellant().fraction;
    n.thrust = thrust; n.twr = mp.mass > 0 ? thrust / (mp.mass * localG) : 0;
    n.sloshN = this.sfInfo?.sloshN ?? 0; n.flexAmp = this.sfInfo?.flexAmp ?? 0; n.bank = this.guidanceInfo?.bank ?? 0;
    n.throttle = fv.activeEngines().reduce((mx, e) => Math.max(mx, e.throttle), 0);
    n.gimbal = (o.gimbal ?? 0) / DEG;
    n.mach = o.mach ?? 0; n.q = o.qd ?? 0; n.aoa = (o.alpha ?? 0) / DEG; n.drag = o.drag ?? 0; n.lift = o.lift ?? 0; n.rho = o.rho ?? 0;
    n.apo = el.e < 1 ? el.ra - P.radius : Infinity; n.peri = el.rp - P.radius; n.ecc = el.e; n.incl = el.i / DEG; n.sma = el.a; n.period = el.e < 1 ? el.period : NaN;
    n.energy = el.energy; n.hmom = el.h; n.tta = el.e < 1 ? el.tApo : NaN; n.ttp = el.e < 1 ? el.tPeri : el.tPeri;
    n.tempLead = fv.thermal.lead.T; n.tempBody = fv.thermal.body.T; n.heatFlux = this._env?.heatFlux ?? 0;
    n.thermRatio = fv.thermal.maxRatio;
    n.powerGen = fv.powerState.generation; n.powerUse = fv.powerState.consumption; n.battery = fv.batteryWh; n.batteryFrac = fv.powerState.batteryFraction ?? 0;
    n.commMargin = fv.commState.margin; n.commLink = fv.commState.link ? 1 : 0; n.commRange = fv.commState.range; n.data = fv.dataStored;
    n.lat = ll.lat / DEG; n.lon = ll.lon / DEG;
    n.downrange = this.pad ? this._downrange(ll) : 0;
    n.x = r[0]; n.y = r[1]; n.z = r[2]; n.vx = v[0]; n.vy = v[1]; n.vz = v[2];
    n.qw = y[6]; n.qx = y[7]; n.qy = y[8]; n.qz = y[9]; n.wx = y[10]; n.wy = y[11]; n.wz = y[12];
    n.attErr = (o.attErr ?? 0) / DEG;
    if (this.onGround || !this._lastDirCmd) n.attErr = this._lastDirCmd && !this.onGround ? n.attErr : 0;
    n.pitch = 90 - angleBetween(qRotate([y[6], y[7], y[8], y[9]], [1, 0, 0]), up) / DEG;
    n.dvIdeal = this.budget.ideal; n.dvGrav = this.budget.gravity; n.dvDrag = this.budget.drag; n.dvSteer = this.budget.steering;
    n.stage = this.separations.length; n.primary = listBodies().findIndex((b) => b.id === P.id);
    n.sunlit = this._env?.sunlit ?? true;
    n.structRatio ??= 0; n.structAxial ??= 0; n.structBending ??= 0;
    n.dirCmdErr = n.attErr;
    const R = this.rover;
    n.groundSpeed = R ? R.speed : 0; n.odometer = R ? R.odometer : 0; n.slip = R ? R.slip : 0; n.terrainSlope = R ? R.slope : 0; n.sideSlope = R ? R.sideSlope : 0;
    n.heading = R ? ((R.heading / DEG) % 360 + 360) % 360 : 0; n.drivePower = R ? R.drivePowerW : 0; n.tipMargin = R ? (R.tipMargin ?? 1) : 0;
    n.sunElev = this._env?.sunElevation ?? 0; n.surfTemp = this._env?.surfaceT ?? 0;
    // distance and relative speed to the companion spacecraft (the command/service module while the lunar module flies alone)
    const cst = this.companion && this.companion.track.body.id === P.id ? this.companion.track.stateAt(this.t) : null;
    if (cst) { const dr = sub(r, cst.r), dw = sub(v, cst.v); n.tgtRange = len(dr); n.tgtSpeed = len(dw); } else { n.tgtRange = NaN; n.tgtSpeed = NaN; }
    // closest approach tracking when inside a child sphere of influence
    if (this.closestApproach && this.closestApproach.body === P.id) this.closestApproach.alt = Math.min(this.closestApproach.alt, alt);
    this.summaryMax.alt = Math.max(this.summaryMax.alt ?? 0, alt);
  }

  _downrange(ll) {
    const p = this.pad, P = this.home;
    const dl = ll.lon - p.lon;
    const a = Math.sin((ll.lat - p.lat) / 2) ** 2 + Math.cos(p.lat) * Math.cos(ll.lat) * Math.sin(dl / 2) ** 2;
    return 2 * P.radius * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  _record(force) {
    const n = this.now;
    const powered = this._thrustAnyOn || (n.thrust ?? 0) > 0;
    const inAtm = (n.rho ?? 0) > 1e-10;
    let interval = powered || inAtm || this.landingActive() ? 0.1 : clamp((Number.isFinite(n.period) ? n.period : 600) / 300, 1, 30);
    if (this.onGround && !powered) interval = 1;
    if (force || this._forceRecord || this.t - this.lastRecordT >= interval - 1e-9) {
      this.telemetry.push(n);
      this.lastRecordT = this.t; this._forceRecord = false;
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // objective + termination
  // ---------------------------------------------------------------------------------------------------------
  evaluateObjective() {
    const o = this.mission.objective ?? { type: 'none' };
    const n = this.now, P = this.primary;
    const details = [];
    let success = false;
    const tol = o.tolerance ?? 0.10;
    switch (o.type) {
      case 'orbit': {
        const target = o.altitude ?? o.periapsis ?? 200000;
        const minPeri = o.minPeriapsis ?? (o.periapsis ?? target) * (1 - tol);
        const maxApo = (o.apoapsis ?? target) * (1 + tol) + (o.apoapsisSlack ?? 0);
        const atmSafe = P.atmosphereModel.hasAtmosphere ? Math.min(P.atmosphereModel.height * 0.7, minPeri) : 0;
        const okBody = P.id === (o.body ?? this.home.id);
        const okPeri = n.peri >= Math.max(minPeri, atmSafe);
        const okApo = n.apo <= maxApo && n.ecc < 1;
        const okInc = o.inclination == null || Math.abs(n.incl - o.inclination) <= (o.inclinationTolerance ?? 3);
        details.push({ label: 'Primary body', ok: okBody, value: P.name }, { label: 'Periapsis', ok: okPeri, value: n.peri, unit: 'm', target: minPeri, cmp: '>=' }, { label: 'Apoapsis', ok: okApo, value: n.apo, unit: 'm', target: maxApo, cmp: '<=' });
        if (o.inclination != null) details.push({ label: 'Inclination', ok: okInc, value: n.incl, unit: 'deg', target: o.inclination });
        success = okBody && okPeri && okApo && okInc && !this.crashed;
        break;
      }
      case 'suborbital': case 'altitude': {
        const ok = (this.summaryMax.alt ?? 0) >= (o.altitude ?? 100000);
        details.push({ label: 'Maximum altitude', ok, value: this.summaryMax.alt ?? 0, unit: 'm', target: o.altitude, cmp: '>=' });
        success = ok && !(this.crashed && o.survive);
        break;
      }
      case 'landing': {
        const okBody = this.landedSafe && this.primary.id === (o.body ?? this.home.id);
        details.push({ label: 'Soft landing', ok: this.landedSafe, value: this.landedSafe ? 'yes' : 'no' });
        success = okBody;
        break;
      }
      case 'escape': {
        const ok = n.ecc >= 1 || this.primary.id !== (o.body ?? this.home.id) || (this.visited?.has('sun'));
        details.push({ label: 'On escape trajectory', ok, value: n.ecc });
        success = ok;
        break;
      }
      case 'reach_body': case 'flyby': {
        const tgt = o.target ?? o.body;
        const entered = this.visited?.has(tgt);
        let ok = !!entered;
        details.push({ label: `Entered ${tgt} sphere of influence`, ok: !!entered, value: entered ? 'yes' : 'no' });
        if (o.type === 'flyby' && o.maxPeriapsis != null) {
          const ca = this.closestApproach;
          const okP = !!ca && ca.body === tgt && ca.alt <= o.maxPeriapsis;
          details.push({ label: 'Closest approach altitude', ok: okP, value: ca?.alt ?? Infinity, unit: 'm', target: o.maxPeriapsis, cmp: '<=' });
          ok = ok && okP;
        }
        success = ok;
        break;
      }
      case 'traverse': {
        const R = this.rover;
        let ok = false;
        if (o.target && R) { const d = R.distanceTo(o.target.lat * DEG, o.target.lon * DEG); ok = d <= (o.target.radius ?? 5); details.push({ label: 'Distance to target', ok, value: d, unit: 'm', target: o.target.radius ?? 5, cmp: '<=' }); }
        else { ok = !!R && R.odometer >= (o.distance ?? 100); details.push({ label: 'Distance driven', ok, value: R?.odometer ?? 0, unit: 'm', target: o.distance ?? 100, cmp: '>=' }); }
        if (o.minBatteryFrac != null) { const okB = this.fv.powerState.batteryFraction >= o.minBatteryFrac; details.push({ label: 'Battery reserve', ok: okB, value: this.fv.powerState.batteryFraction, target: o.minBatteryFrac, cmp: '>=' }); ok = ok && okB; }
        success = ok && !(R?.rolledOver);
        break;
      }
      case 'milestones': {
        // a mission with many stages: it succeeds when every listed step has really happened (the steps are events of the mission)
        let all = !this.crashed;
        for (const id of o.requires ?? []) {
          const e = this.executor.byId.get(id), ok = !!e && e.status === 'done';
          details.push({ label: e?.name ?? id, ok, value: ok ? 'done' : 'not yet' }); all = all && ok;
        }
        success = all;
        break;
      }
      case 'survive': success = !this.crashed && this.t >= (o.duration ?? 0); details.push({ label: 'Survive', ok: success, value: this.t, unit: 's', target: o.duration }); break;
      default: success = true;
    }
    return { success, details, type: o.type };
  }

  _checkEnd() {
    if (this.finished) return;
    const s = this.settings;
    const ex = this.executor;
    if (this.t >= (this.mission.maxTime ?? s.maxTime) - 1e-9) { this._finish(null, 'Time limit reached'); return; }
    const obj = this.evaluateObjective();
    const pending = ex.pendingEvents();
    const stable = this.now.peri > (this.primary.atmosphereModel.height || 0) && this.now.ecc < 1;
    if (obj.success && ['orbit', 'landing', 'escape', 'reach_body', 'flyby', 'suborbital', 'altitude', 'traverse'].includes(obj.type)) {
      this.objectiveMetAt ??= this.t;
      const holdTime = this.mission.settleTime ?? 30;
      const allDone = pending.length === 0;
      const activeBurn = !!ex.burn;
      if (!activeBurn && (allDone ? this.t - this.objectiveMetAt >= Math.min(holdTime, 30) : this.t - this.objectiveMetAt >= (this.mission.postObjectiveTime ?? 600))) { this._finish('SUCCESS', 'Mission objective achieved'); return; }
    } else if (obj.success && obj.type === 'survive') { this._finish('SUCCESS', 'Survived required duration'); return; }
    else this.objectiveMetAt = null;
    // quiescent failure: propulsion gone and trajectory can no longer change
    if (this.propulsionExhausted() && !this.onGround && !ex.burn) {
      const nothingCanBurn = !pending.some((e) => ['IGNITE', 'BURN', 'COURSE_CORRECTION', 'LAND'].includes(e.action?.type)) || true;
      if (nothingCanBurn && (stable || this.now.ecc >= 1) && !this.landingActive() && obj.type !== 'survive' && obj.type !== 'none' && obj.type !== 'milestones') { this._finish(obj.success ? 'SUCCESS' : 'FAILURE', obj.success ? 'Objective achieved' : 'Propulsion exhausted; objective not achieved'); return; }
    }
    // stuck on the ground with no way to move (liftoff never achieved)
    if (this.onGround && !this.landed && this.t - (this.tLiftoffArm ?? 0) > 12 && this.fv.totalPropellant().mass <= 1e-6) { this._finish('FAILURE', 'Never lifted off; all propellant burned on the pad'); return; }
    if (this.onGround && !this.landed && this.t - (this.tLiftoffArm ?? 0) > 120 && !this.fv.engines.some((e) => e.state === 'on')) { this._finish('FAILURE', 'No launch attempted'); return; }
  }

  _finish(status, reason) {
    if (this.finished) return;
    this.finished = true;
    this._record(true);
    const obj = this.evaluateObjective();
    if (status == null) status = obj.success ? 'SUCCESS' : 'FAILURE';
    if (status === 'SUCCESS' && !obj.success) status = 'FAILURE';
    // liftoff diagnostics
    if (this.tLiftoff == null && this.executor.events.some((e) => e.action?.type === 'IGNITE' && e.status !== 'pending') && !this.landed && this.mission.initial?.type !== 'orbit' && this.mission.initial?.type !== 'local' && this.mission.initial?.type !== 'state') {
      const w = this.fv.mass * G0;
      const twr = (this._groundThrust ?? 0) / Math.max(w * (this.home.gravity / G0), 1);
      this.monitor.add({ code: 'LOW_TWR', title: 'Insufficient thrust-to-weight at liftoff', severity: 'major', confidence: CONFIDENCE.CONFIRMED, t: this.t,
        primaryCause: `Thrust-to-weight ratio was ${twr.toFixed(2)} (< 1), so the vehicle could not leave the pad.`,
        contributing: ['Thrust is lower than weight: F_thrust < m·g', 'The vehicle burned propellant on the pad without accelerating'],
        evidence: [{ label: 'Thrust (sea level)', value: this._groundThrust ?? 0, unit: 'N' }, { label: 'Weight', value: w, unit: 'N' }, { label: 'TWR', value: twr, unit: '' }],
        consequences: 'No liftoff.', solutions: ['Add engines or choose a higher-thrust engine for the first stage', 'Remove mass / propellant so that thrust exceeds weight (target TWR ≥ 1.3)'],
        equation: { name: 'Thrust-to-weight', formula: 'TWR = F / (m g)', values: `${(this._groundThrust ?? 0).toFixed(0)} N / ${w.toFixed(0)} N = ${twr.toFixed(2)}` } });
    }
    const extra = assessFailures(this, obj);
    for (const f of extra) this.monitor.add(f);
    const failures = [...this.monitor.records.values()].sort((a, b) => a.t - b.t);
    // causal annotation: an earlier delta-v / thrust shortfall explains later destruction of a vehicle that never reached its orbit
    const root = failures.find((f) => f.code === 'INSUFFICIENT_DELTA_V' || f.code === 'LOW_TWR' || f.code === 'PROPELLANT_DEPLETION' || f.code === 'UPPER_STAGE_TWR');
    if (root) for (const f of failures) {
      if (f !== root && f.t >= root.t && ['OVERTEMPERATURE', 'INCORRECT_ORBIT', 'STRUCTURAL_OVERLOAD', 'LANDING_FAILURE', 'LOSS_OF_CONTROL', 'MAX_Q_EXCEEDED', 'EXCESSIVE_ACCELERATION', 'SURFACE_IMPACT'].includes(f.code) && !f.causedBy) {
        f.causedBy = root.code; f.rootCause = false;
        f.contributing = [`Consequence of "${root.title}" at T+${root.t.toFixed(0)} s: the planned trajectory could not be completed`, ...(f.contributing ?? [])];
      }
    }
    if (root) root.rootCause = true;
    const n = this.now;
    this.result = {
      status, reason, endTime: this.t, objective: obj, failures, warnings: this.warnings,
      summary: {
        maxQ: this.monitor.maxes.q, maxG: this.monitor.maxes.gload, maxAlt: this.summaryMax.alt ?? 0, maxMach: this.monitor.maxes.mach, maxAoA: this.monitor.maxes.aoa, maxQAlpha: this.monitor.maxes.qAlpha,
        maxStructRatio: this.monitor.maxes.structRatio, maxHeatFlux: this.monitor.maxes.heatFlux, maxNoseTemp: this.monitor.maxes.tempLead,
        finalMass: n.mass, propellantLeft: n.propMass, finalOrbit: { apo: n.apo, peri: n.peri, ecc: n.ecc, incl: n.incl, period: n.period, primary: this.primary.id },
        deltaV: { ...this.budget }, separations: [...this.separations], stageReserves: [...(this.fv.discardLog ?? [])], touchdown: this.touchdown ?? null,
        liftoffTime: this.tLiftoff, dataDownlinkedBits: this.fv.dataDownlinked, linkTimeS: this.commStats.linkTime, steps: this.stepCount,
      },
    };
    this.log(status === 'SUCCESS' ? 'MISSION_SUCCESS' : 'MISSION_END', `${status}: ${reason}`, {});
  }

  /** Run until finished or `maxSteps`/`maxSeconds` (wall-clock ms) are consumed. Returns true when finished. */
  run({ maxSteps = Infinity, budgetMs = Infinity, untilT = Infinity } = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    let k = 0;
    while (!this.finished && k < maxSteps && this.t < untilT) {
      this.step(); k++;
      if ((k & 63) === 0 && ((typeof performance !== 'undefined' ? performance : Date).now() - t0) > budgetMs) break;
    }
    return this.finished;
  }
  vehicleSummary() { return this.fv.mp; }
}

// -------------------------------------------------------------------------------------------------------------
export function normalizeMission(m) {
  const mission = JSON.parse(JSON.stringify(m ?? {}));
  mission.name ??= 'Untitled mission';
  mission.objective ??= { type: 'none' };
  mission.events ??= [];
  mission.faults ??= [];
  mission.initial ??= { type: 'pad' };
  return mission;
}
