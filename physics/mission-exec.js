// Mission event engine: evaluates conditions against live simulation state and executes actions through the vehicle model.
import { G0 } from './constants.js';
import { solveCourseCorrection, planTransEarth, solveReturnCorrection } from './lunar-transfer.js';
import { planLiftoff, planRendezvous, planIntercept } from './rendezvous.js';
import { surfacePointInertial, localFrame, sunDirection } from './bodies.js';
import { propagateKepler } from './orbital.js';
import { norm, add, sub, scale, dot, cross, len, qRotate, angleBetween } from './vec.js';

const OPS = {
  '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b,
  '==': (a, b) => Math.abs(a - b) < 1e-9,
};
const VALUE_FIELDS = {
  altitude: 'alt', radarAltitude: 'radarAlt', speed: 'speed', surfaceSpeed: 'surfSpeed', verticalSpeed: 'vSpeed', mach: 'mach',
  dynamicPressure: 'q', gload: 'gload', apoapsis: 'apo', periapsis: 'peri', eccentricity: 'ecc', inclination: 'incl',
  timeToApoapsis: 'tta', timeToPeriapsis: 'ttp', mass: 'mass', twr: 'twr', acceleration: 'accel', missionTime: 't', range: 'tgtRange', relativeSpeed: 'tgtSpeed',
};
export const CONDITION_TYPES = ['planned', 'time', 'always', 'event', 'propellant', 'enginesOut', 'all', 'any', 'inSunlight', 'linkClosed', 'landed', 'inOrbit', 'primary', ...Object.keys(VALUE_FIELDS)];
export const ACTION_TYPES = ['IGNITE', 'SHUTDOWN', 'THROTTLE', 'SEPARATE', 'DEPLOY_PAYLOAD', 'DEPLOY', 'DEPLOY_PARACHUTE', 'SET_GUIDANCE', 'BURN', 'COURSE_CORRECTION',
  'AIM_MOON', 'AIM_EARTH', 'CHOREO', 'EXTRACT_LM', 'UNDOCK', 'DOCK', 'PLAN_DOI', 'PLAN_LIFTOFF', 'ARM_LIFTOFF', 'PLAN_RENDEZVOUS', 'PLAN_TEI', 'MEASURE', 'TRANSMIT', 'LAND', 'DEPLOY_ROVER', 'DRIVE', 'DRIVE_TO', 'STOP_DRIVE', 'LOG', 'END_MISSION'];

export class MissionExecutor {
  constructor(sim, mission) {
    this.sim = sim;
    this.mission = mission;
    this.events = (mission.events ?? []).map((e, i) => ({ ...e, id: e.id ?? `ev${i + 1}`, status: 'pending', tTrigger: null, tDone: null }));
    this.faults = (mission.faults ?? []).map((f, i) => ({ ...f, id: f.id ?? `fault${i + 1}`, status: 'pending' }));
    this.byId = new Map(this.events.map((e) => [e.id, e]));
    this.burn = null;
    this.plans = {};        // burns and times worked out on board during the flight: {key: {t, dv, dir, ...}}
    this.transmitUntil = -1;
    this.ended = null;
  }

  // ---------- condition evaluation ----------
  evalCond(c, ev) {
    if (!c) return true;
    const s = this.sim, n = s.now;
    switch (c.type) {
      case 'always': return true;
      case 'time': return s.t >= c.value;
      case 'planned': { const p = this.plans[c.key]; return !!p && s.t >= p.t - (c.lead ?? 0); }
      case 'all': return (c.conditions ?? []).every((x) => this.evalCond(x, ev));
      case 'any': return (c.conditions ?? []).some((x) => this.evalCond(x, ev));
      case 'event': {
        const e = this.byId.get(c.id);
        return !!e && e.status === 'done' && s.t >= e.tDone + (c.delay ?? 0);
      }
      case 'propellant': {
        const f = s.fv.propellantInGroup(c.group ?? null);
        if (f.capacity <= 0) return (c.op ?? '<=') === '<=';
        return OPS[c.op ?? '<='](f.fraction, c.value ?? 0.001);
      }
      case 'enginesOut': {
        const es = s.fv.activeEngines().filter((e) => !c.group || e.group === c.group);
        return es.length === 0 || es.every((e) => e.state !== 'on');
      }
      case 'inSunlight': return n.sunlit === (c.value ?? true);
      case 'linkClosed': return !!s.fv.commState.link === (c.value ?? true);
      case 'landed': return !!s.landed;
      case 'inOrbit': return n.peri > (s.body.atmosphereModel.height || 0) + 1000 && n.ecc < 1;
      case 'primary': return s.primary.id === c.value;
      default: {
        const f = VALUE_FIELDS[c.type];
        if (!f) return false;
        let val = c.value;
        if (c.halfBurnDv != null) val = 0.5 * s.burnTime(c.burnGroup ?? ev?.action?.group, c.halfBurnDv);
        else if (val === 'halfBurn') val = s.halfBurnTime(c.burnGroup ?? ev?.action?.group);
        else if (val === 'halfBurnCapture') { const dvc = s.captureDv(c.targetAltitude); val = Number.isFinite(dvc) ? 0.5 * s.burnTime(c.burnGroup ?? ev?.action?.group, dvc) : -1; }
        const cur = n[f];
        if (cur === undefined || Number.isNaN(cur)) return false;
        return OPS[c.op ?? '>='](cur, val);
      }
    }
  }

  // ---------- per-step update ----------
  update() {
    const s = this.sim;
    for (const f of this.faults) {
      if (f.status !== 'pending') continue;
      if (this.evalCond(f.condition ?? { type: 'time', value: f.time ?? 0 }, f)) { this.applyFault(f); }
    }
    for (const e of this.events) {
      if (e.status === 'pending') {
        if (this.evalCond(e.condition, e)) {
          e.tTrigger = s.t;
          this.execute(e);
        }
      } else if (e.status === 'active') this.progress(e);
    }
    if (this.burn) this.progressBurn();
  }

  applyFault(f) {
    const s = this.sim, fv = s.fv;
    f.status = 'done'; f.tTrigger = s.t;
    switch (f.type) {
      case 'engine_failure': for (const e of fv.selectEngines(f.engine ? { engine: f.engine } : f.group ? { group: f.group } : null)) { e.failed = true; e.state = 'failed'; e.cmd = 0; } break;
      case 'thrust_degrade': for (const e of fv.selectEngines(f.engine ? { engine: f.engine } : f.group ? { group: f.group } : null)) e.derate = f.factor ?? 0.7; break;
      case 'power_failure': fv.forcedBlackout = true; break;
      case 'comm_failure': fv.commDisabled = true; break;
      case 'guidance_failure': fv.guidanceFailed = true; break;
      case 'battery_drain': fv.batteryWh *= f.factor ?? 0.1; break;
      default: break;
    }
    s.log('FAULT', `Injected fault: ${f.type}${f.group ? ' (' + f.group + ')' : ''}`, { fault: f.type, ...f });
  }

  /** Execute an action immediately (manual command / AI command) and track it like a normal event. */
  runNow(action, name) {
    const ev = { id: `cmd${this.events.length + 1}`, name, condition: { type: 'always' }, action, status: 'pending', tTrigger: this.sim.t, tDone: null, manual: true };
    this.events.push(ev); this.byId.set(ev.id, ev);
    this.execute(ev);
    return ev;
  }

  // ---------- action execution ----------
  execute(ev) {
    const s = this.sim, fv = s.fv, a = ev.action ?? {};
    ev.status = 'active';
    let res = { ok: true, done: true, message: ev.name ?? a.type };
    switch (a.type) {
      case 'IGNITE': {
        const r = fv.ignite(a.engine ? { engine: a.engine } : { group: a.group }, a.throttle ?? 1);
        res = { ok: r.ignited > 0, done: true, message: `${ev.name ?? 'Ignition'}: ${r.ignited} engine(s) lit${r.failed ? `, ${r.failed} could not start (${r.reasons.join('; ')})` : ''}` };
        if (r.ignited > 0) s.markIgnition(a.group);
        break;
      }
      case 'SHUTDOWN': { const n = fv.shutdown(a.engine ? { engine: a.engine } : { group: a.group }); res = { ok: true, done: true, message: `Engine shutdown (${n})` }; break; }
      case 'THROTTLE': fv.setThrottle(a.engine ? { engine: a.engine } : a.group ? { group: a.group } : null, a.value ?? 1); res.message = `Throttle set to ${(100 * (a.value ?? 1)).toFixed(0)}%`; break;
      case 'SEPARATE': {
        const groups = a.groups ?? [a.group];
        const spec = fv.debrisSpec(new Set(groups)); let n = 0; for (const g of groups) n += fv.separate(g);
        s.onSeparation(groups.join('+'), spec, { companion: !!a.companion, push: a.push }); res.message = `Separated ${groups.join(' + ')} (${n} components discarded)`; break;
      }
      case 'UNDOCK': {
        // the command/service module backs away and stays in orbit as a companion; the lunar module (now upside down relative to the old stack axis) is flown on its own
        const groups = a.groups ?? ['sm', 'cm'];
        const spec = fv.debrisSpec(new Set(groups)); for (const g of groups) fv.separate(g);
        fv.setDock(null);
        s.onSeparation(groups.join('+'), spec, { companion: true, push: a.push ?? 0.4 });
        s.turnVehicleAround();
        res.message = 'Undocked: the command/service module stays in lunar orbit, the lunar module flies on its own'; break;
      }
      case 'CHOREO': {
        // a scripted sequence that the 3D view plays back (transposition and docking): the physics keeps one rigid vehicle meanwhile
        s.choreo = { id: a.id, t0: s.t, duration: a.duration ?? 600 };
        res = { ok: true, done: false, message: `${ev.name ?? a.id} (scripted sequence, ${Math.round((a.duration ?? 600) / 60)} min)` }; ev.until = s.t + (a.duration ?? 600); break;
      }
      case 'EXTRACT_LM': {
        // end of the transposition: the command module has docked with the lunar module and pulled it out of the third stage.
        // From here on the stack is service module, command module, lunar module (upside down) and the third stage is left behind.
        const g3 = a.stage ?? 'stage3';
        const spec = fv.debrisSpec(new Set([g3])); fv.separate(g3);
        fv.setDock({ order: a.order ?? ['sm', 'cm', 'lma', 'lmd'], flip: a.flip ?? ['lma', 'lmd'] });
        s.onSeparation(g3, spec, { push: 0.5 }); s.choreo = null;
        res.message = 'Lunar module extracted: command/service module and lunar module now fly docked, third stage left behind'; break;
      }
      case 'DEPLOY_PAYLOAD': { const keep = a.group ?? 'payload'; const spec = fv.debrisSpec(new Set(fv.def.components.map((c) => c.group ?? '__none__').filter((g) => g !== keep && !fv.removedGroups.has(g)))); fv.deployPayload(keep); s.onSeparation('deploy:' + keep, spec); res.message = `Payload deployed (${a.group ?? 'payload'})`; break; }
      case 'DEPLOY': {
        const sel = a.target ?? a.group;
        const all = !sel || sel === 'all';
        const n = fv.deploy(all ? null : sel);
        res = { ok: n > 0 || all, done: true, message: n > 0 ? `Deployed ${n} appendage(s) (${all ? 'all' : sel})` : all ? 'Nothing left to deploy' : `Nothing to deploy for "${sel}"` };
        break;
      }
      case 'DEPLOY_PARACHUTE': { const n = fv.deployParachute(a.id ?? a.group); res = { ok: n > 0, done: true, message: `Parachute deployment commanded (${n})` }; break; }
      case 'DEPLOY_ROVER': {
        // the simulation follows the rover from now on (the lander stays where it is and is no longer simulated)
        fv.deployPayload(a.group ?? 'rover'); s.onSeparation('deploy:rover'); s.attachRover(); s.roverDeployed = true;
        res.message = `Rover deployed and driving on its own power (mass ${fv.mass.toFixed(1)} kg)`; res.ok = !!s.rover; break;
      }
      case 'DRIVE': case 'DRIVE_TO': {
        if (!s.rover) { res = { ok: false, done: true, message: 'This vehicle is not a rover' }; break; }
        if (a.type === 'DRIVE') s.rover.command({ mode: 'heading', heading: a.heading ?? 0, distance: a.distance, duration: a.duration, speed: a.speed ?? 0.5 });
        else s.rover.command({ mode: 'waypoint', lat: a.lat, lon: a.lon, speed: a.speed ?? 0.5, radius: a.radius ?? 1.5 });
        s.rover.lastCompleted = false;
        res = { ok: true, done: false, message: a.type === 'DRIVE' ? `Driving heading ${a.heading ?? 0}° for ${a.distance != null ? a.distance + ' m' : (a.duration ?? '?') + ' s'} at ${a.speed ?? 0.5} m/s` : `Driving to ${a.lat?.toFixed?.(4)}°, ${a.lon?.toFixed?.(4)}°` };
        break;
      }
      case 'STOP_DRIVE': s.rover?.stop(); res.message = 'Drive stopped'; break;
      case 'SET_GUIDANCE': {
        let params = a.params ?? {};
        if (params.fromPlan) { const p = this.plans[params.fromPlan]; if (!p) { res = { ok: false, done: true, message: `No plan "${params.fromPlan}" has been computed yet` }; break; } params = { ...params, ...(p.azimuth != null ? { azimuth: p.azimuth } : {}), ...(p.dir && a.mode === 'inertial' ? { vector: p.dir } : {}) }; }
        s.setGuidance(a.mode, params); res.message = `Guidance mode: ${a.mode}`; break;
      }
      case 'LAND': s.setGuidance('land', { ...(a.params ?? {}), group: a.group }); this.landGroup = a.group; res.message = 'Powered descent guidance armed'; break;
      case 'AIM_MOON': res = this.aimMoon(a); break;
      case 'AIM_EARTH': res = this.aimEarth(a); break;
      case 'PLAN_DOI': res = this.planDoiAction(a); break;
      case 'PLAN_LIFTOFF': res = this.planLiftoffAction(a); break;
      case 'ARM_LIFTOFF': s.armLiftoff(); s.setGuidance('hold', {}); res.message = 'Ascent stage ready to leave the surface'; break;
      case 'PLAN_RENDEZVOUS': res = this.planRendezvousAction(a); break;
      case 'PLAN_TEI': res = this.planTeiAction(a); break;
      case 'DOCK': res = this.dockAction(a); break;
      case 'BURN': case 'COURSE_CORRECTION': res = this.startBurn(ev, a); break;
      case 'MEASURE': {
        const ids = a.instrument && a.instrument !== 'all' ? [a.instrument] : fv.presentComponents('instrument').map((c) => c.id);
        let started = 0;
        for (const id of ids) { const c = fv.byId.get(id); if (c && fv.present(c)) { fv.activeInstruments.set(id, a.duration ?? 60); started++; } }
        res = { ok: started > 0, done: started === 0, message: started ? `Measurement started on ${started} instrument(s)` : 'No instrument available' };
        ev.instruments = ids; if (started) res.done = false;
        break;
      }
      case 'TRANSMIT': this.transmitUntil = s.t + (a.duration ?? 60); s.wantTransmit = true; res = { ok: true, done: false, message: `Downlink window opened (${a.duration ?? 60} s)` }; ev.until = this.transmitUntil; break;
      case 'LOG': res.message = a.message ?? ev.name ?? 'Note'; break;
      case 'END_MISSION': this.ended = a.status ?? 'ended'; res.message = 'Mission ended by command'; break;
      default: res = { ok: false, done: true, message: `Unknown action ${a.type}` };
    }
    if (!res.ok) { ev.status = 'failed'; ev.tDone = s.t; s.log('EVENT_FAILED', `${ev.name ?? ev.id}: ${res.message}`, { event: ev.id }); s.warn('EVENT_FAILED', res.message, { event: ev.id }); return; }
    if (res.done) { ev.status = 'done'; ev.tDone = s.t; } else ev.status = 'active';
    s.log('EVENT', `${ev.name ?? ev.id} — ${res.message}`, { event: ev.id, action: a.type });
  }

  progress(ev) {
    const s = this.sim;
    const a = ev.action;
    if (a.type === 'MEASURE') {
      if (!ev.instruments.some((id) => s.fv.activeInstruments.has(id))) { ev.status = 'done'; ev.tDone = s.t; s.log('EVENT_DONE', `${ev.name ?? ev.id} complete`, { event: ev.id }); }
    } else if (a.type === 'DRIVE' || a.type === 'DRIVE_TO') {
      const R = s.rover;
      if (!R || R.rolledOver) { ev.status = 'failed'; ev.tDone = s.t; return; }
      if (R.stuck) { ev.status = 'failed'; ev.tDone = s.t; s.log('EVENT_FAILED', `${ev.name ?? ev.id}: rover immobilised`, { event: ev.id }); return; }
      if (!R.active && R.lastCompleted) { ev.status = 'done'; ev.tDone = s.t; s.log('EVENT_DONE', `${ev.name ?? ev.id} complete (odometer ${R.odometer.toFixed(1)} m)`, { event: ev.id }); }
    } else if (a.type === 'CHOREO') {
      if (s.t >= ev.until) { ev.status = 'done'; ev.tDone = s.t; if (s.choreo?.id === a.id) s.choreo = null; s.log('EVENT_DONE', `${ev.name ?? ev.id} complete`, { event: ev.id }); }
    } else if (a.type === 'TRANSMIT') {
      if (s.t >= ev.until) { ev.status = 'done'; ev.tDone = s.t; s.wantTransmit = false; s.log('EVENT_DONE', `${ev.name ?? ev.id} complete`, { event: ev.id }); }
    }
  }

  // ---------- course correction towards the Moon (onboard targeting from the true state) ----------
  aimMoon(a) {
    const s = this.sim;
    if (s.primary.id !== 'earth') return { ok: false, done: true, message: 'Course targeting needs the ship to be in the Earth\'s sphere of influence' };
    const y = s.y, tAbs = s.env.epoch + s.t;
    const sol = solveCourseCorrection([y[0], y[1], y[2]], [y[3], y[4], y[5]], tAbs, a.periapsis ?? 110e3, a.inclination != null ? { inclination: a.inclination } : {});
    if (!sol) return { ok: false, done: true, message: 'No small correction makes this trajectory pass the Moon at the target altitude' };
    this.plan = { dir: norm(sol.dv), dv: sol.dvMag, predicted: sol.predicted };
    if (sol.dvMag > 0.05) s.setGuidance('inertial', { vector: this.plan.dir });
    return { ok: true, done: true, message: `Course correction computed: ${sol.dvMag.toFixed(1)} m/s, predicted closest approach ${(sol.predicted.altitude / 1000).toFixed(0)} km above the Moon${a.inclination != null ? `, orbit inclination ${sol.predicted.inclination.toFixed(1)}°` : ''}` };
  }

  // ---------- course correction on the way home ----------
  aimEarth(a) {
    const s = this.sim;
    if (s.primary.id !== 'earth') return { ok: false, done: true, message: 'Return targeting needs the ship to be in the Earth\'s sphere of influence' };
    const y = s.y;
    const sol = solveReturnCorrection([y[0], y[1], y[2]], [y[3], y[4], y[5]], a.perigee ?? 45e3);
    if (!sol) return { ok: false, done: true, message: 'No small correction gives the return path the wanted entry altitude' };
    this.plans[a.key ?? 'mcc'] = { t: s.t, dv: sol.dvMag, dir: norm(sol.dv) };
    if (sol.dvMag > 0.05) s.setGuidance('inertial', { vector: norm(sol.dv) });
    return { ok: true, done: true, message: `Return correction computed: ${sol.dvMag.toFixed(1)} m/s for an entry perigee of ${((sol.predicted.altitude) / 1000).toFixed(0)} km` };
  }
  // ---------- liftoff from the surface, rendezvous and docking ----------
  /** Time of the descent orbit insertion: the landing point (about half an orbit later) should be in the lunar morning, Sun a few degrees above the horizon and rising. */
  planDoiAction(a) {
    const s = this.sim, P = s.primary, y = s.y;
    const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]], rm = len(r);
    const n = norm(cross(r, v)), e1 = norm(r), e2 = cross(n, e1), rate = len(v) / rm;
    const arc = (a.arc ?? 211) * Math.PI / 180, target = (a.sunElevation ?? 8) * Math.PI / 180, t0 = a.minWait ?? 3600;
    const period = 2 * Math.PI / rate;
    let best = null;
    for (let dt = t0; dt <= t0 + period; dt += 10) {
      const th = rate * dt + arc, rh = add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th)));
      const tL = s.t + dt + (a.descentTime ?? 4180), sd = sunDirection(P.id, s.env.epoch + tL);
      const elev = Math.asin(Math.max(-1, Math.min(1, dot(rh, sd))));
      const rising = P.omega * dot(sd, cross([0, 0, 1], rh)) > 0;    // the Moon's rotation carries the landing point towards the Sun
      const score = Math.abs(elev - target) + (rising ? 0 : 10);
      if (!best || score < best.score) best = { score, dt, elev };
    }
    this.plans.doi = { t: s.t + best.dt, elevation: best.elev * 180 / Math.PI };
    return { ok: true, done: true, message: `Descent orbit insertion planned for T+${((s.t + best.dt) / 3600).toFixed(2)} h; the Sun will be about ${(best.elev * 180 / Math.PI).toFixed(0)}° above the horizon at the landing site` };
  }
  planLiftoffAction(a) {
    const s = this.sim, P = s.primary, comp = s.companion;
    if (!comp) return { ok: false, done: true, message: 'There is no ship in orbit to meet' };
    const hSite = s.landedAlt ?? 0;
    const siteAt = (t) => surfacePointInertial(P.id, s.pad.lat, s.pad.lon, s.env.epoch + t, P.radius + hSite);
    const csmAt = (t) => comp.track.stateAt(t);
    const el = comp.track.d, rC = len(comp.track.stateAt(s.t).r);
    const period = 2 * Math.PI * Math.sqrt(rC ** 3 / P.mu);
    const pl = planLiftoff({ siteAt, csmAt, tMin: s.t + (a.minWait ?? 1200), period, ascentTime: a.ascentTime ?? 450, downrange: (a.downrange ?? 7.5) * Math.PI / 180, phaseLead: (a.phaseLead ?? 17) * Math.PI / 180 });
    const fr = localFrame(siteAt(pl.t));
    const az = (Math.atan2(dot(pl.heading, fr.east), dot(pl.heading, fr.north)) * 180 / Math.PI + 360) % 360;
    this.plans.liftoff = { t: pl.t, azimuth: az, planeAngle: pl.planeAngle };
    return { ok: true, done: true, message: `Liftoff planned for T+${(pl.t / 3600).toFixed(2)} h, launch heading ${az.toFixed(1)}° (site ${(pl.planeAngle * 180 / Math.PI).toFixed(1)}° off the ship's orbit plane)` };
  }
  planRendezvousAction(a) {
    const s = this.sim, P = s.primary, comp = s.companion, y = s.y;
    if (!comp) return { ok: false, done: true, message: 'There is no ship in orbit to meet' };
    const csmAt = (t) => comp.track.stateAt(t);
    const offset = a.offset ?? 300;
    const aim = (t) => { const c = csmAt(t); return add(c.r, scale(qRotate(c.q, [1, 0, 0]), offset)); };
    const r = [y[0], y[1], y[2]], v = [y[3], y[4], y[5]];
    if ((a.mode ?? 'search') === 'correct') {
      const p2 = this.plans.rdv2; if (!p2) return { ok: false, done: true, message: 'No rendezvous has been planned yet' };
      const tb = s.t + (a.delay ?? 60), pr = propagateKepler(P.mu, r, v, tb - s.t);   // the burn happens `delay` s after this calculation
      const hC = cross(csmAt(tb).r, csmAt(tb).v);
      const sol = planIntercept({ mu: P.mu, r: pr.r, v: pr.v, t0: tb, t2: p2.tArrival, target: aim(p2.tArrival), normal: hC });
      if (!sol) return { ok: false, done: true, message: 'No correction found' };
      const c2 = csmAt(p2.tArrival), dv2 = sub(c2.v, sol.v2);
      this.plans.rdvc = { t: s.t, dv: len(sol.dv), dir: len(sol.dv) > 1e-9 ? norm(sol.dv) : [1, 0, 0] };
      p2.dv = len(dv2);
      return { ok: true, done: true, message: `Mid-course correction: ${len(sol.dv).toFixed(1)} m/s, braking burn will need ${len(dv2).toFixed(1)} m/s` };
    }
    const sol = planRendezvous({ mu: P.mu, radius: P.radius, r, v, t0: s.t, csmAt, aim, tMin: a.tMin ?? 600, tMax: a.tMax ?? 3600, durMin: a.durMin ?? 1500, durMax: a.durMax ?? 6300 });
    if (!sol) return { ok: false, done: true, message: 'No rendezvous path found from this orbit' };
    this.plans.rdv1 = { t: sol.t1, dv: len(sol.dv1), dir: norm(sol.dv1) };
    this.plans.rdv2 = { t: sol.t2 - 0.5 * s.burnTime('lma', len(sol.dv2)), tArrival: sol.t2, dv: len(sol.dv2), dirMode: 'match_target' };
    return { ok: true, done: true, message: `Rendezvous planned: burn ${len(sol.dv1).toFixed(1)} m/s at T+${(sol.t1 / 3600).toFixed(2)} h, arrival ${Math.round(sol.T / 60)} min later, braking ${len(sol.dv2).toFixed(1)} m/s` };
  }
  dockAction(a) {
    const s = this.sim, fv = s.fv, comp = s.companion, y = s.y;
    if (!comp) return { ok: false, done: true, message: 'There is nothing to dock with' };
    const st = comp.track.stateAt(s.t);
    const range = len(sub([y[0], y[1], y[2]], st.r)), rel = len(sub([y[3], y[4], y[5]], st.v));
    if (range > (a.maxRange ?? 1500) || rel > (a.maxSpeed ?? 3)) return { ok: false, done: true, message: `Docking not possible: ${range.toFixed(0)} m apart, ${rel.toFixed(1)} m/s relative speed` };
    const m1 = fv.mass; fv.reattach(comp.groups);
    fv.setDock({ order: ['sm', 'cm', 'lma', 'lmd'], flip: ['lma', 'lmd'] });
    const m2 = fv.mass - m1, M = m1 + m2;
    for (let i = 0; i < 3; i++) { y[i] = (m1 * y[i] + m2 * st.r[i]) / M; y[3 + i] = (m1 * y[3 + i] + m2 * st.v[i]) / M; }
    y[6] = st.q[0]; y[7] = st.q[1]; y[8] = st.q[2]; y[9] = st.q[3]; y[10] = y[11] = y[12] = 0;
    comp.entry.reattachedAt = s.t; s.companion = null; s.choreo = null;
    s.setGuidance('hold', {}); s._geometry(); s._forceRecord = true;
    return { ok: true, done: true, message: `Docked: command/service module and lunar module are one vehicle again (${(M / 1000).toFixed(1)} t)` };
  }
  planTeiAction(a) {
    const s = this.sim, P = s.primary, y = s.y;
    if (P.id !== 'moon') return { ok: false, done: true, message: 'The trans-Earth burn is planned from lunar orbit' };
    const group = a.group ?? 'sm';
    const sol = planTransEarth([y[0], y[1], y[2]], [y[3], y[4], y[5]], s.env.epoch + s.t, { targetAltitude: a.perigee ?? 45e3, span: a.span ?? 7200, dvTarget: a.dvTarget ?? null, tofTarget: a.tofTarget ?? null });
    if (!sol) return { ok: false, done: true, message: 'No trans-Earth burn found from this orbit' };
    this.plans.tei = { t: s.t + sol.dtBurn - 0.5 * s.burnTime(group, sol.dv), dv: sol.dv, dirMode: 'prograde', tof: sol.tofSeconds };
    return { ok: true, done: true, message: `Trans-Earth injection planned: ${sol.dv.toFixed(0)} m/s at T+${((s.t + sol.dtBurn) / 3600).toFixed(2)} h, estimated Earth perigee ${(sol.perigeeAltitude / 1000).toFixed(0)} km` };
  }

  // ---------- burns ----------
  startBurn(ev, a) {
    const s = this.sim, fv = s.fv;
    if (this.burn) return { ok: false, done: true, message: 'Another burn is in progress' };
    const group = a.group ?? fv.activeEngines().find((e) => e.state !== 'spent' && !e.failed)?.group;
    let dv = a.dv;
    let dirIn = a.direction;
    if (a.plan) {
      const p = this.plans[a.plan];
      if (!p) return { ok: false, done: true, message: `No plan "${a.plan}" has been computed` };
      dv = p.dv; dirIn = p.dirMode ?? { vector: p.dir };
      if (!(dv > 0.05)) return { ok: true, done: true, message: 'No burn needed: already on the planned path' };
    } else if (dv === 'planned' || dirIn === 'planned') {
      if (!this.plan) return { ok: false, done: true, message: 'No course correction has been computed (AIM_MOON must run first)' };
      dv = this.plan.dv; dirIn = { vector: this.plan.dir };
      if (!(dv > 0.05)) { this.plan = null; return { ok: true, done: true, message: 'Course is already on target: no correction burn needed' }; }
    }
    if (dv === 'circularize') dv = s.circularizeDv();
    if (dv === 'escape') dv = Math.max(s.escapeDv(a.vInf ?? 0), 1);
    if (dv == null && !a.until) return { ok: false, done: true, message: 'Burn requires dv or until condition' };
    const engs = fv.selectEngines(group ? { group } : null);
    if (!engs.length) return { ok: false, done: true, message: 'No engines available for burn' };
    const dir = dirIn ?? 'prograde';
    if (typeof dir === 'string') s.setGuidance(dir, {}); else s.setGuidance('inertial', { vector: dir.vector });
    s._lastDirCmd = null;   // so the alignment check below only trusts a direction commanded for THIS burn
    // the engine lights once the vehicle points the right way (at most `alignMax` seconds of waiting)
    this.burn = { ev, group, dvTarget: dv, dvDone: 0, until: a.until, throttle: a.throttle ?? 1, tStart: s.t, direction: dir, maxDuration: a.maxDuration ?? 3600, aligning: true, tAlign: s.t, alignMax: a.align ? (a.alignMax ?? 90) : 0 };
    return { ok: true, done: false, message: `Burn started: ${dir.vector ? 'vector' : dir}${dv != null ? `, target Δv ${dv.toFixed(1)} m/s` : ''}` };
  }
  progressBurn() {
    const s = this.sim, b = this.burn;
    if (b.aligning) {
      const y = s.y, cmd = s._lastDirCmd;
      const err = cmd ? angleBetween(qRotate([y[6], y[7], y[8], y[9]], [1, 0, 0]), cmd) : Infinity;
      if (err > 1.0 * Math.PI / 180 && s.t - b.tAlign < b.alignMax) return;
      const r = s.fv.ignite(b.group ? { group: b.group } : null, b.throttle);
      if (r.ignited === 0) {
        b.ev.status = 'failed'; b.ev.tDone = s.t; this.burn = null;
        s.log('EVENT_FAILED', `${b.ev.name ?? 'Burn'} aborted: ${r.reasons.join('; ') || 'ignition failed'}`, { event: b.ev.id }); s.warn('BURN_INCOMPLETE', `${b.ev.name ?? 'Burn'} aborted: ${r.reasons.join('; ')}`, { event: b.ev.id });
        if (!s.landingActive()) s.setGuidance('hold', {});
        return;
      }
      s.markIgnition(b.group); b.aligning = false; b.tStart = s.t;
      return;
    }
    b.dvDone += s.lastThrustAccel * s.lastDt;
    const engs = s.fv.selectEngines(b.group ? { group: b.group } : null);
    const running = engs.some((e) => e.state === 'on');
    let finished = false, ok = true, why = '';
    if (b.dvTarget != null && b.dvDone >= b.dvTarget) { finished = true; why = 'Δv target reached'; }
    if (b.until && this.evalCond(b.until, b.ev)) { finished = true; why = 'cutoff condition met'; }
    if (!running) { finished = true; ok = (b.dvTarget == null) || b.dvDone >= 0.97 * b.dvTarget; why = 'engines stopped'; }
    if (s.t - b.tStart > b.maxDuration) { finished = true; ok = false; why = 'max duration'; }
    if (!finished) {
      // trim throttle near the end of a Δv-targeted burn to cut off precisely
      if (b.dvTarget != null) {
        const rem = b.dvTarget - b.dvDone;
        const a = Math.max(s.lastThrustAccel / Math.max(s.avgThrottle, 0.05), 1e-6);
        const tRem = rem / a;
        if (tRem < 3) s.fv.setThrottle(b.group ? { group: b.group } : null, Math.max(0.1, Math.min(b.throttle, tRem / 3)));
      }
      return;
    }
    s.fv.shutdown(b.group ? { group: b.group } : null);
    b.ev.status = ok ? 'done' : 'failed'; b.ev.tDone = s.t;
    b.ev.result = { dvDelivered: b.dvDone, dvTarget: b.dvTarget, reason: why };
    s.log(ok ? 'EVENT_DONE' : 'EVENT_FAILED', `${b.ev.name ?? 'Burn'} ${ok ? 'complete' : 'incomplete'}: ${why}, Δv delivered ${b.dvDone.toFixed(1)} m/s`, { event: b.ev.id });
    if (!ok) s.warn('BURN_INCOMPLETE', `${b.ev.name ?? 'Burn'}: delivered ${b.dvDone.toFixed(1)} of ${b.dvTarget?.toFixed?.(1)} m/s (${why})`, { event: b.ev.id });
    this.burn = null;
    if (!s.landingActive()) s.setGuidance('hold', {});
  }

  /** Smallest time (s) until a purely time-based pending event; Infinity if none. Used to limit step size. */
  nextTimedDelta() {
    let best = Infinity;
    if (this.burn?.aligning) best = 1;     // watch the attitude closely while the vehicle turns for a burn
    for (const e of this.events) {
      if (e.status !== 'pending') continue;
      const c = e.condition;
      if (c?.type === 'time') best = Math.min(best, c.value - this.sim.t);
      else if (c?.type === 'planned') { const p = this.plans[c.key]; if (p) best = Math.min(best, p.t - (c.lead ?? 0) - this.sim.t); }
      else if (c?.type === 'event') {
        const d = this.byId.get(c.id);
        if (d && d.status === 'done') best = Math.min(best, d.tDone + (c.delay ?? 0) - this.sim.t);
      }
    }
    for (const f of this.faults) if (f.status === 'pending' && (f.time != null)) best = Math.min(best, f.time - this.sim.t);
    return best;
  }
  pendingEvents() { return this.events.filter((e) => e.status === 'pending' || e.status === 'active'); }
  wantsCoastPrecision() {
    return this.events.some((e) => e.status === 'pending' && JSON.stringify(e.condition ?? {}).match(/timeTo|apoapsis|periapsis|altitude|radarAltitude/));
  }
}
