// Engineering failure detection and root-cause analysis. Every failure carries evidence taken from the simulated telemetry.
import { G0 } from './constants.js';
import { circularSpeed, hohmann } from './orbital.js';

export const CONFIDENCE = { CONFIRMED: 'CONFIRMED', LIKELY: 'LIKELY', POSSIBLE: 'POSSIBLE' };

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

/** Smallest propellant addition (kg) to a stage so its delta-v rises by `dv`. Tankage of 6% is assumed. */
export function propellantForExtraDv(isp, m0, mf, dv, tankage = 0.06) {
  const target = isp * G0 * Math.log(m0 / mf) + dv;
  let lo = 0, hi = m0 * 5;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = isp * G0 * Math.log((m0 + mid * (1 + tankage)) / (mf + mid * tankage));
    if (v < target) lo = mid; else hi = mid;
  }
  return hi;
}
/** Approximate delta-v still needed to reach a circular orbit of radius rT from an orbit with apsis radii rp, ra. */
export function dvToCircular(mu, ra, rT) {
  const vap = Math.sqrt(mu * (2 / ra - 1 / ((ra + Math.min(ra, rT)) / 2 + 0)));
  return { ra, rT };
}
export function dvNeededFromOrbit(mu, rp, ra, rT) {
  if (!Number.isFinite(ra)) return Infinity;
  const a = (rp + ra) / 2;
  const vap = Math.sqrt(mu * (2 / ra - 1 / a));
  const dv1 = Math.abs(circularSpeed(mu, ra) - vap);
  if (ra >= rT) return dv1;
  return dv1 + hohmann(mu, ra, rT).dvTotal;
}

export class FailureMonitor {
  constructor(sim) {
    this.sim = sim;
    this.records = new Map();
    this.timers = {};
    this.maxes = { q: 0, gload: 0, aoa: 0, qAlpha: 0, structRatio: 0, thermRatio: 0, heatFlux: 0, tempLead: 0, alt: 0, mach: 0, accel: 0 };
    this.limits = null;
    this.prevBlackout = false;
    this.warned = new Set();
  }

  computeLimits() {
    const fv = this.sim.fv;
    let qLimit = Infinity, gLimit = Infinity, qaLimit = Infinity;
    const pls = fv._layout?.placements;
    for (const c of fv.presentComponents()) {
      // aerodynamic pressure loads act on exposed hardware only; equipment inside a fairing/bus is shielded until it is exposed
      const shielded = pls?.get(c.id)?.mount === 'internal';
      if (c.maxQ && !shielded) qLimit = Math.min(qLimit, c.maxQ);
      if (c.maxAccelG) gLimit = Math.min(gLimit, c.maxAccelG);
      if (c.maxQAlpha && !shielded) qaLimit = Math.min(qaLimit, c.maxQAlpha);
    }
    this.limits = { qLimit, gLimit, qaLimit };
  }

  add(rec) {
    const prev = this.records.get(rec.code);
    if (prev) {
      // upgrade confidence / keep earliest time
      const order = { POSSIBLE: 0, LIKELY: 1, CONFIRMED: 2 };
      if (order[rec.confidence] > order[prev.confidence]) { rec.t = Math.min(prev.t, rec.t); this.records.set(rec.code, rec); }
      return prev;
    }
    rec.t = rec.t ?? this.sim.t;
    this.records.set(rec.code, rec);
    this.sim.log(rec.severity === 'warning' ? 'WARNING' : 'FAILURE', `${rec.title}${rec.confidence ? ' [' + rec.confidence + ']' : ''}: ${rec.primaryCause}`, { code: rec.code });
    if (rec.severity === 'warning') this.sim.warn(rec.code, rec.primaryCause, { t: rec.t });
    return rec;
  }
  warnOnce(code, message, data) {
    if (this.warned.has(code)) return;
    this.warned.add(code);
    this.sim.warn(code, message, data);
  }

  /** Called every step after `sim.now` has been refreshed. Returns 'destroyed' if a catastrophic failure ended the flight. */
  check(dt) {
    const s = this.sim, n = s.now, fv = s.fv;
    if (!this.limits || s.limitsDirty) { this.computeLimits(); s.limitsDirty = false; }
    const L = this.limits;
    const M = this.maxes;
    M.q = Math.max(M.q, n.q); M.gload = Math.max(M.gload, n.gload); M.aoa = Math.max(M.aoa, Math.abs(n.aoa)); M.alt = Math.max(M.alt, n.alt);
    M.mach = Math.max(M.mach, n.mach); M.accel = Math.max(M.accel, n.accel);
    M.heatFlux = Math.max(M.heatFlux, n.heatFlux); M.tempLead = Math.max(M.tempLead, n.tempLead);
    const qAlpha = n.q * Math.abs(n.aoa) * Math.PI / 180;
    M.qAlpha = Math.max(M.qAlpha, qAlpha);
    M.structRatio = Math.max(M.structRatio, n.structRatio); M.thermRatio = Math.max(M.thermRatio, n.thermRatio);
    let destroyed = null;

    // ---- dynamic pressure / g-load warnings and failures ----
    if (n.q > L.qLimit) {
      this.timers.q = (this.timers.q ?? 0) + dt;
      if (this.timers.q > 0.5) this.add({ code: 'MAX_Q_EXCEEDED', title: 'Excessive dynamic pressure', severity: 'major', confidence: 'CONFIRMED',
        primaryCause: `Dynamic pressure reached ${fmt(n.q / 1000)} kPa, above the ${fmt(L.qLimit / 1000)} kPa structural rating.`,
        contributing: [`Mach ${fmt(n.mach, 2)} at ${fmt(n.alt / 1000)} km altitude`, `Throttle ${fmt(n.throttle * 100, 0)}% while in dense atmosphere`],
        evidence: [{ label: 'Dynamic pressure', value: n.q, unit: 'Pa', t: s.t }, { label: 'Limit', value: L.qLimit, unit: 'Pa' }, { label: 'Mach', value: n.mach, unit: '' }],
        consequences: 'Airframe loads exceed design margins; risk of buckling or panel failure.',
        solutions: ['Throttle down through the max-Q region (q = ½ρv²)', 'Fly a lower-drag ascent (less steering) or accelerate more gently near 10–15 km', 'Use a stronger structural section'],
        equation: { name: 'Dynamic pressure', formula: 'q = ½ ρ v²', values: `ρ=${n.rho.toExponential(2)} kg/m³, v=${fmt(n.surfSpeed)} m/s → q=${fmt(n.q)} Pa` } });
    } else this.timers.q = 0;
    if (n.q > 0.85 * L.qLimit && Number.isFinite(L.qLimit)) this.warnOnce('MAX_Q_HIGH', `Dynamic pressure at ${fmt((100 * n.q) / L.qLimit, 0)}% of limit (${fmt(n.q / 1000)} kPa).`, { t: s.t });
    if (n.gload > L.gLimit) {
      this.timers.g = (this.timers.g ?? 0) + dt;
      if (this.timers.g > 0.5) this.add({ code: 'EXCESSIVE_ACCELERATION', title: 'Excessive acceleration', severity: 'major', confidence: 'CONFIRMED',
        primaryCause: `Sensed acceleration ${fmt(n.gload)} g exceeded the ${fmt(L.gLimit)} g component rating.`,
        contributing: [`Thrust-to-weight ${fmt(n.twr, 2)}`, `Vehicle mass ${fmt(n.mass)} kg near burnout (lighter vehicle → higher g for the same thrust)`],
        evidence: [{ label: 'G-load', value: n.gload, unit: 'g', t: s.t }, { label: 'Limit', value: L.gLimit, unit: 'g' }, { label: 'Thrust', value: n.thrust, unit: 'N' }, { label: 'Mass', value: n.mass, unit: 'kg' }],
        consequences: 'Payload or avionics damage.', solutions: ['Throttle down late in the stage burn', 'Use a lower-thrust engine or shut engines down earlier', 'Select payload/components with a higher g rating'],
        equation: { name: 'Acceleration', formula: 'a = F/m', values: `${fmt(n.thrust)} N / ${fmt(n.mass)} kg = ${fmt(n.accel)} m/s²` } });
    } else this.timers.g = 0;

    // ---- structural load ----
    if (n.structRatio > 0.9) this.warnOnce('STRUCTURE_HIGH', `Structural load reached ${fmt(n.structRatio * 100, 0)}% of the limit at T+${fmt(s.t)} s.`, { t: s.t });
    if (n.structRatio >= 1) {
      this.timers.struct = (this.timers.struct ?? 0) + dt;
      if (this.timers.struct > 0.15) {
        const bending = n.structBending, axial = n.structAxial;
        const primary = bending > axial ? `Bending load from aerodynamic normal force (q·α = ${fmt(qAlpha)} Pa·rad vs limit ${fmt(L.qaLimit)}) exceeded the structure.` : `Axial compressive load exceeded the strength of the weakest stack element.`;
        this.add({ code: 'STRUCTURAL_OVERLOAD', title: 'Structural overload (vehicle breakup)', severity: 'catastrophic', confidence: 'CONFIRMED', primaryCause: primary,
          contributing: [`Angle of attack ${fmt(n.aoa)}°`, `Dynamic pressure ${fmt(n.q / 1000)} kPa`, `Axial load fraction ${fmt(axial * 100, 0)}%, bending fraction ${fmt(bending * 100, 0)}%`,
            s.controlLostAt != null ? 'Attitude control had been lost before breakup' : 'Guidance kept attitude but loads still exceeded capacity'],
          evidence: [{ label: 'Load ratio', value: n.structRatio, unit: '', t: s.t }, { label: 'q·α', value: qAlpha, unit: 'Pa·rad' }, { label: 'Angle of attack', value: n.aoa, unit: 'deg' }, { label: 'G-load', value: n.gload, unit: 'g' }, { label: 'Dynamic pressure', value: n.q, unit: 'Pa' }],
          consequences: 'The airframe broke apart; the mission ended.', solutions: ['Strengthen the limiting structural sections or increase diameter', 'Reduce angle of attack (fly a gentler gravity turn / smaller kick angle)', 'Throttle down through max-Q'],
          equation: { name: 'Aerodynamic bending load', formula: 'M ∝ q·α·S·(x_cp − x_cg)', values: `q=${fmt(n.q)} Pa, α=${fmt(n.aoa)}°` } });
        destroyed = 'structural failure';
      }
    } else this.timers.struct = 0;

    // ---- thermal ----
    if (n.thermRatio > 0.85) {
      const wc = fv.byId.get(fv.thermal.worstId);
      const Tw = fv.thermal.worstId === fv.thermal.lead.id ? n.tempLead : n.tempBody;
      const cold = fv.thermal.worstKind === 'cold';
      const margin = wc ? (cold ? Tw - (wc.tMin ?? 0) : (wc.tMax ?? Infinity) - Tw) : Infinity;
      // a warning means a *temperature margin* of under 12 K to a component limit (ratios of absolute temperatures are ~0.9 at room temperature)
      if (margin < 12) this.warnOnce('THERMAL_HIGH', `${wc?.name ?? 'A component'} is only ${fmt(margin, 0)} K from its ${cold ? 'minimum' : 'maximum'} operating temperature (${fmt(Tw)} K, limit ${fmt(cold ? wc.tMin : wc.tMax)} K).`, { t: s.t });
    }
    if (n.thermRatio >= 1) {
      const hot = fv.thermal.worstKind !== 'cold';
      const comp = fv.byId.get(fv.thermal.worstId);
      const aero = n.heatFlux > 5000;   // aerodynamic heating only counts as the cause when there was any
      this.add({ code: hot ? 'OVERTEMPERATURE' : 'UNDERTEMPERATURE', title: hot ? 'Excessive temperature' : 'Component too cold', severity: n.thermRatio > 1.25 ? 'catastrophic' : 'major', confidence: 'CONFIRMED',
        primaryCause: `${comp?.name ?? 'Component'} reached ${fmt(fv.thermal.worstId === fv.thermal.lead.id ? n.tempLead : n.tempBody)} K (${hot ? 'max' : 'min'} operating limit ${fmt(hot ? comp?.tMax : comp?.tMin)} K).`,
        contributing: hot ? (aero ? [`Peak stagnation heat flux ${fmt(M.heatFlux / 1000)} kW/m²`, `Speed ${fmt(n.surfSpeed)} m/s at density ${n.rho.toExponential(2)} kg/m³`] : [`No aerodynamic heating (heat flux ${fmt(n.heatFlux)} W/m²): the heat came from the vehicle's own power dissipation and the environment`, `Power consumption ${fmt(n.powerUse)} W, power generation ${fmt(n.powerGen)} W`, `Solar heating: ${n.sunlit ? 'sunlit' : 'in eclipse'}`]) : [`Solar heating: ${n.sunlit ? 'sunlit' : 'in eclipse'}`, `Power available ${fmt(n.powerGen)} W`],
        evidence: [{ label: 'Nose temperature', value: n.tempLead, unit: 'K', t: s.t }, { label: 'Body temperature', value: n.tempBody, unit: 'K' }, { label: 'Heat flux', value: n.heatFlux, unit: 'W/m2' }],
        consequences: hot ? (aero ? 'Thermal protection failure; structure/payload damaged.' : 'The component exceeded its operating temperature; it can fail or degrade.') : 'Electronics and batteries fall below operating range.',
        solutions: hot ? (aero ? ['Add a heat shield or thicker thermal protection', 'Reduce speed in dense air (steeper/lower-drag trajectory)', 'Jettison the fairing only after heating has dropped'] : ['Add a radiator or increase the radiator area', 'Add multilayer insulation or a reflective coating against solar heating', 'Reduce dissipation (lower drive power / duty-cycle the motors) or work in cooler periods', 'Move the component away from heat sources']) : ['Add a heater and multilayer insulation', 'Reduce eclipse exposure or add battery capacity to power heaters'],
        equation: hot ? (aero ? { name: 'Stagnation heating (Sutton–Graves)', formula: 'q̇ = k √(ρ/Rn) v³', values: `peak ${fmt(M.heatFlux / 1000)} kW/m²` } : { name: 'Radiative balance', formula: 'P_diss + Q_sun = ε σ A T⁴', values: '' }) : { name: 'Radiative balance', formula: 'Q_in = ε σ A T⁴', values: '' } });
      if (n.thermRatio > 1.25) destroyed = destroyed ?? 'thermal destruction';
    }

    // ---- loss of control ----
    const controlNeeded = n.thrust > 1 || n.q > 500;
    const attErrBad = n.attErr > 30 && controlNeeded;
    const aoaEff = s.geom?.capsuleShield && Math.abs(n.aoa) > 90 ? 180 - Math.abs(n.aoa) : Math.abs(n.aoa);   // a capsule flies heat shield first: 180 degrees from its nose is the right way round
    const aoaBad = n.q > 3000 && aoaEff > 40;
    if (attErrBad || aoaBad) {
      this.timers.loc = (this.timers.loc ?? 0) + dt;
      if (this.timers.loc > 2.0) {
        s.controlLostAt ??= s.t;
        const noGuidance = !fv.hasGuidance(false);
        const unpowered = fv.hasGuidance(false) && !fv.hasGuidance(true);
        const authority = s.lastAuthorityNote;
        this.add({ code: 'LOSS_OF_CONTROL', title: 'Loss of control', severity: 'major', confidence: 'CONFIRMED',
          primaryCause: noGuidance ? 'The vehicle has no guidance computer / avionics, so no attitude control was applied.' : unpowered ? 'Guidance was unpowered (electrical blackout).' :
            `Control torque was insufficient: attitude error grew to ${fmt(n.attErr)}° and AoA to ${fmt(n.aoa)}° in ${fmt(n.q / 1000)} kPa dynamic pressure.`,
          contributing: [`Gimbal authority ${authority ?? 'n/a'}`, `Static stability: centre of pressure ${s.cpMinusCg > 0 ? 'ahead of' : 'behind'} the CG by ${fmt(Math.abs(s.cpMinusCg), 2)} m`, `Thrust ${fmt(n.thrust / 1000)} kN`],
          evidence: [{ label: 'Attitude error', value: n.attErr, unit: 'deg', t: s.t }, { label: 'Angle of attack', value: n.aoa, unit: 'deg' }, { label: 'Dynamic pressure', value: n.q, unit: 'Pa' }, { label: 'Gimbal command', value: n.gimbal, unit: 'deg' }],
          consequences: 'The vehicle tumbled; aerodynamic loads typically exceed structural limits within seconds.',
          solutions: ['Add or repair the guidance/avionics package', 'Add fins (moves CP aft) or shift mass forward for static stability', 'Increase engine gimbal range/thrust or add RCS for control authority', 'Reduce the pitch-over kick angle to limit angle of attack'],
          equation: { name: 'Control torque', formula: 'τ = F_thrust · L_arm · sin(δ_gimbal)', values: '' } });
      }
    } else this.timers.loc = 0;

    // ---- power ----
    const bo = fv.powerState.blackout;
    if (bo && !this.prevBlackout) {
      this.add({ code: 'POWER_FAILURE', title: 'Power failure', severity: 'major', confidence: 'CONFIRMED',
        primaryCause: fv.forcedBlackout ? 'A power-system fault was injected.' : `Battery depleted: consumption ${fmt(n.powerUse)} W exceeded generation ${fmt(n.powerGen)} W.`,
        contributing: [n.sunlit ? 'Vehicle was in sunlight but panels were stowed/undersized' : 'Vehicle was in eclipse', `Battery capacity ${fmt(fv.batteryCapacityWh())} Wh`],
        evidence: [{ label: 'Power generation', value: n.powerGen, unit: 'W', t: s.t }, { label: 'Power consumption', value: n.powerUse, unit: 'W' }, { label: 'Battery', value: n.battery, unit: 'Wh' }],
        consequences: 'Avionics, guidance and communications lost.', solutions: ['Add solar-panel area or deploy panels earlier', 'Add battery capacity for eclipse periods', 'Reduce instrument duty cycle / power-hungry loads'],
        equation: { name: 'Energy balance', formula: 'E(t+dt) = E(t) + (P_gen − P_use)·dt', values: '' } });
    }
    this.prevBlackout = bo;

    // ---- engine failures / depletion ----
    for (const e of fv.engines) {
      if (e.failed && !e.reported) { e.reported = true; this.add({ code: 'ENGINE_FAILURE', title: 'Engine failure', severity: 'major', confidence: 'CONFIRMED', primaryCause: `${e.comp.name} (${e.group}) stopped producing thrust.`,
        contributing: ['Fault injected by mission definition or engine ignition failure'], evidence: [{ label: 'Failed engine', value: e.comp.name, unit: '' }, { label: 'Time', value: s.t, unit: 's' }],
        consequences: 'Loss of thrust reduces achievable delta-v; the vehicle may not reach its target orbit.', solutions: ['Add engine redundancy (more engines in the cluster)', 'Add margin propellant in the following stage', 'Use a restartable engine for recovery burns'] }); }
    }
    return destroyed;
  }

  /** Rover-specific failure detection. Returns a reason string when the rover is lost. */
  checkRover(dt) {
    const s = this.sim, R = s.rover, n = s.now;
    if (!R) return null;
    let lost = null;
    if (R.rolledOver) {
      this.add({ code: 'ROVER_ROLLOVER', title: 'Rover rollover', severity: 'catastrophic', confidence: 'CONFIRMED', t: s.t,
        primaryCause: `The side slope (${fmt(Math.abs(R.sideSlope))}°) exceeded the static stability angle of ${fmt(R.tipAngle)}° (track width ${fmt(R.trackWidth, 2)} m, CG height ${fmt(R.cgHeight, 2)} m).`,
        contributing: [`Heading ${fmt(n.heading, 0)}°, speed ${fmt(R.speed, 2)} m/s`, `Turn rate contributes lateral acceleration`],
        evidence: [{ label: 'Side slope', value: R.sideSlope, unit: 'deg', t: s.t }, { label: 'Tip-over angle', value: R.tipAngle, unit: 'deg' }, { label: 'Track width', value: R.trackWidth, unit: 'm' }, { label: 'CG height', value: R.cgHeight, unit: 'm' }],
        consequences: 'The rover overturned and cannot continue.', solutions: ['Widen the track / lower the centre of gravity', 'Plan the route to avoid steep side slopes', 'Reduce speed and turn rate on slopes'],
        equation: { name: 'Static rollover angle', formula: 'θ_tip = atan( (track/2) / h_cg )', values: `atan(${fmt(R.trackWidth / 2, 2)} / ${fmt(R.cgHeight, 2)}) = ${fmt(R.tipAngle)}°` } });
      lost = 'rover rolled over';
    }
    if (R.stuck) {
      const i = R.stuckInfo ?? {};
      this.add({ code: 'ROVER_IMMOBILISED', title: 'Rover immobilised (wheel slip / insufficient traction)', severity: 'major', confidence: 'CONFIRMED', t: s.t,
        primaryCause: `Resistance force ${fmt(i.Fres, 0)} N (slope ${fmt(i.slopeDeg)}° plus rolling resistance) exceeded the traction/drive force available (${fmt(Math.min(i.Ftrac, i.Favail), 0)} N); wheel slip reached ${fmt(R.slip * 100, 0)}%.`,
        contributing: [`Friction coefficient ${fmt(i.mu, 2)}`, `Traction limit ${fmt(i.Ftrac, 0)} N vs motor limit ${fmt(R.driven * R.stallTorque / R.wheelRadius, 0)} N (stall)`, `Rover mass ${fmt(i.mass, 0)} kg in ${fmt(i.g, 2)} m/s² gravity`],
        evidence: [{ label: 'Wheel slip', value: R.slip, unit: '', t: s.t }, { label: 'Slope', value: i.slopeDeg, unit: 'deg' }, { label: 'Resisting force', value: i.Fres, unit: 'N' }, { label: 'Traction limit', value: i.Ftrac, unit: 'N' }],
        consequences: 'The rover stopped making progress.', solutions: ['Add drive motors / driven wheels or larger wheels', 'Route around slopes steeper than the traction limit', 'Reduce mass or use a higher-friction wheel design'],
        equation: { name: 'Traction limit', formula: 'F_max = μ m g cosθ', values: `μ=${fmt(i.mu, 2)}` } });
      lost = 'rover immobilised';
    }
    if (R.maxSlip > 0.35 && !this.warned.has('SLIP_HIGH')) this.warnOnce('SLIP_HIGH', `Wheel slip reached ${fmt(R.maxSlip * 100, 0)}% (traction utilisation ${fmt(R.tractionRatio * 100, 0)}%).`, { t: s.t });
    return lost;
  }

  /** Register ignition attempt problems as failures. */
  ignitionProblem(msg) {
    this.add({ code: 'IGNITION_FAILURE', title: 'Engine ignition failure', severity: 'major', confidence: 'CONFIRMED', primaryCause: msg, contributing: [], evidence: [], consequences: 'Stage did not start.', solutions: ['Check ignitions remaining on the engine', 'Use a restartable engine'] });
  }
}


/**
 * Measured from the recorded flight: a stage that is thrusting with thrust < weight while the vehicle is still far below
 * orbital speed and is losing altitude cannot hold up its own weight. Returns null when the flight shows no such phase.
 */
export function thrustDeficitPhase(sim) {
  const tel = sim.telemetry; if (!tel || tel.count < 20) return null;
  const col = (c) => tel.column(c);
  const t = col('t'), th = col('thrust'), tw = col('twr'), vs = col('vSpeed'), alt = col('alt'), sp = col('speed'), st = col('stage');
  const mu = sim.body.mu, R = sim.body.radius;
  let cur = null, best = null;
  for (let i = 0; i < tel.count; i++) {
    const vc = Math.sqrt(mu / (R + alt[i]));
    const bad = st[i] >= 1 && th[i] > 0 && tw[i] < 1 && vs[i] < -1 && sp[i] < 0.9 * vc && alt[i] > 10000;
    if (bad) { if (!cur) cur = { i0: i, i1: i, minTwr: tw[i], altStart: alt[i] }; cur.i1 = i; cur.minTwr = Math.min(cur.minTwr, tw[i]); cur.altEnd = alt[i]; }
    else if (cur) { if (!best || cur.i1 - cur.i0 > best.i1 - best.i0) best = cur; cur = null; }
  }
  if (cur && (!best || cur.i1 - cur.i0 > best.i1 - best.i0)) best = cur;
  if (!best) return null;
  const dur = t[best.i1] - t[best.i0], lost = best.altStart - best.altEnd;
  if (dur < 8 || lost < 2000) return null;
  return { t0: t[best.i0], t1: t[best.i1], duration: dur, altLost: lost, minTwr: best.minTwr, speedAt: sp[best.i0], stageCount: st[best.i0] };
}

function massAtLastBurn(sim) {
  const tel = sim.telemetry; if (!tel || tel.count < 5) return null;
  const th = tel.column('thrust'), ms = tel.column('mass');
  let mx = 0; for (let i = 0; i < tel.count; i++) mx = Math.max(mx, th[i]);
  for (let i = tel.count - 1; i >= 0; i--) if (th[i] > 0.02 * mx) return ms[i];
  return null;
}

/**
 * Post-mission root-cause analysis. Adds INSUFFICIENT_DELTA_V / INCORRECT_ORBIT / etc. using the recorded budgets.
 */
export function assessFailures(sim, objectiveResult) {
  const mon = sim.monitor, n = sim.now, fv = sim.fv;
  const out = [];
  const body = sim.body;
  const obj = sim.mission.objective ?? {};
  const rT = body.radius + (obj.altitude ?? obj.periapsis ?? 200000);
  const budget = sim.budget;

  if (!objectiveResult.success) {
    const dvLeft = sim.remainingDeltaV();
    let plannedLeft = dvLeft;
    let exhausted = sim.propulsionExhausted();
    const impacted = sim.crashed || sim.landedHard;
    if (obj.type === 'orbit') {
      const rp = body.radius + n.peri, ra = body.radius + n.apo;
      const dvNeed = dvNeededFromOrbit(body.mu, rp, ra, rT);
      // a small payload thruster with a few m/s left is not what the mission plan relied on: judge by delta-v, not by 'has any propellant'
      if (!exhausted && Number.isFinite(dvNeed)) {
        // delta-v that the *planned* burns can still draw on (their engine groups), or all engines when no burn is pending
        const pend = sim.executor.pendingEvents().filter((e) => ['IGNITE', 'BURN', 'COURSE_CORRECTION'].includes(e.action?.type) && e.action.group);
        const done = sim.executor.events.filter((e) => ['IGNITE', 'BURN', 'COURSE_CORRECTION'].includes(e.action?.type) && e.action.group && (e.status === 'done' || e.status === 'active' || e.status === 'failed')).sort((a, b) => (a.tTrigger ?? 0) - (b.tTrigger ?? 0));
        const lastGroup = done.length ? done[done.length - 1].action.group : null;   // no burn pending: the stage that flew the last burn is the one whose propellant matters (not a payload thruster)
        const planned = pend.length ? sim.remainingDeltaV([...new Set(pend.map((e) => e.action.group))]) : (lastGroup ? sim.remainingDeltaV([lastGroup]) : dvLeft);
        if (planned < 0.5 * dvNeed) { exhausted = true; plannedLeft = planned; }
      }
      const lastIsp = sim.lastIspVac ?? 330;
      const massAtEnd = massAtLastBurn(sim) ?? fv.mass;   // mass when the last main burn ended (the spent stage may have been discarded since)
      const conf = exhausted ? CONFIDENCE.CONFIRMED : CONFIRMED_IF(sim.pendingBurns());
      if (exhausted && Number.isFinite(dvNeed)) {
        const extra = propellantForExtraDv(lastIsp, massAtEnd + 1, massAtEnd, dvNeed * 1.05);
        out.push({ code: 'INSUFFICIENT_DELTA_V', title: 'Insufficient delta-v', severity: 'major', confidence: conf, t: sim.lastPropellantDepletionT ?? sim.t,
          primaryCause: `The vehicle ran out of usable delta-v: ${fmt(dvNeed)} m/s were still needed to reach the target orbit (${fmt((obj.altitude ?? 0) / 1000, 0)} km circular) but only ${fmt(plannedLeft)} m/s remained for the planned burns.`,
          contributing: [
            `Delta-v delivered by engines: ${fmt(budget.ideal)} m/s (rocket equation, ideal)`,
            `Gravity loss ${fmt(budget.gravity)} m/s, drag loss ${fmt(budget.drag)} m/s, steering loss ${fmt(budget.steering)} m/s`,
            `Orbit achieved at engine cutoff: periapsis ${fmt(n.peri / 1000)} km, apoapsis ${fmt(n.apo / 1000)} km`,
            budget.gravity > 0.22 * budget.ideal ? 'High gravity loss suggests low thrust-to-weight or a slow pitch-over' : 'Losses were in a normal range – the shortfall is mainly from propellant capacity',
          ],
          evidence: [{ label: 'Δv delivered', value: budget.ideal, unit: 'm/s' }, { label: 'Gravity loss', value: budget.gravity, unit: 'm/s' }, { label: 'Drag loss', value: budget.drag, unit: 'm/s' }, { label: 'Steering loss', value: budget.steering, unit: 'm/s' },
            { label: 'Δv still required', value: dvNeed, unit: 'm/s' }, { label: 'Final periapsis', value: n.peri, unit: 'm' }, { label: 'Final apoapsis', value: n.apo, unit: 'm' }],
          consequences: 'The vehicle could not reach a stable orbit at the target altitude.',
          solutions: [`Add about ${fmt(extra, 0)} kg of propellant to the final stage (rocket-equation estimate, Isp ${fmt(lastIsp, 0)} s)`, 'Reduce payload or structural mass', 'Use a higher-Isp upper-stage engine', 'Reduce gravity loss with a shorter vertical phase and earlier pitch-over'],
          equation: { name: 'Tsiolkovsky rocket equation', formula: 'Δv = Isp · g0 · ln(m0 / mf)', values: `Isp≈${fmt(lastIsp, 0)} s` }, dvShortfall: dvNeed, propellantSuggested: extra });
      } else if (!exhausted) {
        out.push({ code: 'INCORRECT_ORBIT', title: 'Incorrect orbit', severity: 'major', confidence: CONFIDENCE.LIKELY, t: sim.t,
          primaryCause: `The final orbit (periapsis ${fmt(n.peri / 1000)} km, apoapsis ${fmt(n.apo / 1000)} km) does not match the target ${fmt((obj.altitude ?? 0) / 1000, 0)} km, while propellant remained.`,
          contributing: [
            'Mission sequence ended or cut off engines before the orbit was reached',
            'Circularisation burn missing, mistimed or too short',
            ...sim.events.filter((e) => e.kind === 'ENGINE_SPENT').map((e) => `${e.message} at T+${fmt(e.t, 0)} s — a burn that runs out of propellant ends short of its planned delta-v`),
            ...(Number.isFinite(dvNeed) ? [`Remaining orbit correction needed: about ${fmt(dvNeed)} m/s; the engines that can still fire hold about ${fmt(dvLeft)} m/s`] : []),
          ],
          evidence: [{ label: 'Periapsis', value: n.peri, unit: 'm' }, { label: 'Apoapsis', value: n.apo, unit: 'm' }, { label: 'Eccentricity', value: n.ecc, unit: '' }, { label: 'Propellant left', value: fv.totalPropellant().mass, unit: 'kg' }],
          consequences: 'Objective not met.', solutions: ['Add a circularisation burn at apoapsis', 'Review engine cutoff conditions in the mission timeline'] });
      }
    }
    const def = obj.type === 'orbit' ? thrustDeficitPhase(sim) : null;
    if (def) {
      out.push({ code: 'UPPER_STAGE_TWR', title: 'Upper stage too weak to hold its altitude', severity: 'major', confidence: CONFIDENCE.CONFIRMED, t: def.t0,
        primaryCause: `After stage separation the thrust-to-weight ratio fell to ${fmt(def.minTwr, 2)} (< 1) while the vehicle was still at only ${fmt(def.speedAt)} m/s, far below orbital speed. Thrust could not cancel gravity, so the vehicle lost ${fmt(def.altLost / 1000, 0)} km of altitude in ${fmt(def.duration, 0)} s while the engine was firing.`,
        contributing: ['A thrust-to-weight ratio below 1 at low speed means the engine only slows the fall; the orbit is reached later and with large gravity losses', `Gravity loss over the flight: ${fmt(budget.gravity)} m/s`, 'The cut-off at the target apoapsis then happens on a steeply descending path, so the circularisation burn is never reached'],
        evidence: [{ label: 'Minimum thrust/weight', value: def.minTwr, unit: '' }, { label: 'Altitude lost while thrusting', value: def.altLost, unit: 'm' }, { label: 'Duration', value: def.duration, unit: 's' }, { label: 'Speed when it began', value: def.speedAt, unit: 'm/s' }, { label: 'Gravity loss', value: budget.gravity, unit: 'm/s' }],
        consequences: 'The trajectory fell back into the atmosphere; heating and dynamic pressure failures follow from that.',
        solutions: ['Give the upper stage more thrust (more or larger engines) so that thrust-to-weight is about 0.9 or higher at ignition', 'Stage later or with a lower flight-path angle so the stage separates closer to orbital speed', 'Split the delta-v differently between the stages'],
        equation: { name: 'Thrust-to-weight', formula: 'TWR = F / (m g)', values: `min ${fmt(def.minTwr, 2)}` }, minTwr: def.minTwr });
    }
    if (obj.type === 'landing' && !sim.landedSafe && !impacted && exhausted) {
      out.push({ code: 'PROPELLANT_DEPLETION', title: 'Propellant depletion', severity: 'major', confidence: CONFIDENCE.CONFIRMED, t: sim.lastPropellantDepletionT ?? sim.t, primaryCause: 'The lander ran out of propellant before touching down.', contributing: [], evidence: [{ label: 'Propellant left', value: fv.totalPropellant().mass, unit: 'kg' }], consequences: 'Uncontrolled descent.', solutions: ['Carry more propellant', 'Reduce the mass to be landed', 'Ignite later to reduce gravity losses'] });
    }
  }
  // link/communication check for missions that require comms
  if (obj.requireComms && sim.commStats.linkTime <= 0) {
    out.push({ code: 'COMM_FAILURE', title: 'Communication failure', severity: 'major', confidence: CONFIDENCE.CONFIRMED, t: sim.t,
      primaryCause: 'No ground link was established during the mission.', contributing: [sim.commStats.reason ?? 'unknown'],
      evidence: [{ label: 'Best link margin', value: sim.commStats.bestMargin, unit: 'dB' }, { label: 'Data stored (undelivered)', value: fv.dataStored, unit: 'bit' }],
      consequences: 'No telemetry or science data returned.', solutions: ['Add or deploy an antenna', 'Increase transmitter power or antenna gain', 'Point the high-gain antenna at Earth (earth_point guidance)'],
      equation: { name: 'Friis link budget', formula: 'P_r = P_t G_t G_r (λ / 4πd)²', values: '' } });
  }
  return out;
}
const CONFIRMED_IF = (pending) => (pending ? CONFIDENCE.POSSIBLE : CONFIDENCE.LIKELY);
