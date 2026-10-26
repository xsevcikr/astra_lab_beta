// Spacecraft subsystem models: electrical power, thermal balance, communications link budget.
import { SIGMA, K_B, C_LIGHT, G0 } from './constants.js';
import { getBody, bodyStateAbs, surfacePointInertial } from './bodies.js';
import { dot, len, sub, scale, norm, angleBetween, qRotate } from './vec.js';

const dB = (x) => 10 * Math.log10(Math.max(x, 1e-300));

/** Cylindrical-shadow eclipse test: returns true if the vehicle at r (body-centred) is in the sun. */
export function isSunlit(r, sunDir, bodyRadius) {
  const d = dot(r, sunDir);
  if (d >= 0) return true;
  const perp = Math.sqrt(Math.max(len(r) ** 2 - d * d, 0));
  return perp > bodyRadius;
}

/** Update electrical power: generation, consumption, battery integration. */
export function updatePower(fv, dt, env) {
  const p = fv.powerState;
  let gen = 0, use = 0;
  const comps = fv.presentComponents();
  const q = env.q;
  for (const c of comps) {
    const n = c.count ?? 1;
    if (c.kind === 'solar_panel' && env.sunlit && (fv.deployed.has(c.id) || !c.deployable)) {
      let cosInc = 1;
      if (!c.tracking) {
        const axis = c.normalAxis ?? [1, 0, 0];
        const nInertial = qRotate(q, axis);
        cosInc = Math.max(0, dot(nInertial, env.sunDir));
      }
      const temp = fv.thermal.body.T;
      const tempDerate = 1 - 0.0035 * Math.max(0, temp - 301); // ~0.35%/K above 28 C
      gen += (c.area ?? 0) * (c.efficiency ?? 0.28) * env.solarFlux * cosInc * tempDerate * (1 - (c.degradation ?? 0)) * n;
    }
    if (c.powerDraw) {
      let draw = 0;
      switch (c.kind) {
        case 'avionics': case 'guidance': case 'computer': draw = c.powerDraw; break;
        case 'instrument': draw = fv.activeInstruments.has(c.id) ? c.powerDraw : (c.standbyPower ?? 0); break;
        case 'antenna': draw = fv.commState.transmitting ? c.powerDraw : (c.standbyPower ?? 0.05 * c.powerDraw); break;
        case 'reaction_wheel': draw = c.powerDraw * Math.min(1, fv.attitudeTorqueUse.wheels / Math.max(c.torque ?? 1e-9, 1e-9)) + 0.1 * c.powerDraw; break;
        case 'heater': draw = fv.thermal.heaterOn ? c.powerDraw : 0; break;
        case 'engine': draw = (fv.engines.find((e) => e.id === c.id)?.state === 'on') ? c.powerDraw : 0; break; // electric thrusters
        case 'sensor': draw = c.powerDraw; break;
        default: draw = c.powerDraw * (c.active === false ? 0 : 1);
      }
      use += draw * n;
    }
  }
  if (env.extraLoad) use += env.extraLoad;
  // fuel cells (Apollo-era): follow the load, up to their rating, while hydrogen/oxygen reactants last
  let fcRated = 0;
  for (const c of comps) if (c.kind === 'fuel_cell' && (fv.reactant?.[c.id] ?? 0) > 0) fcRated += (c.powerW ?? 1400) * (c.count ?? 1);
  if (fcRated > 0) {
    const out = Math.min(fcRated, Math.max(0, use - gen));
    gen += out;
    if (out > 0) for (const c of comps) if (c.kind === 'fuel_cell' && (fv.reactant[c.id] ?? 0) > 0) {
      const share = ((c.powerW ?? 1400) * (c.count ?? 1)) / fcRated;
      fv.reactant[c.id] = Math.max(0, fv.reactant[c.id] - (out * share * dt) / 3.6e6 / (c.kWhPerKg ?? 2.2));
    }
  }
  const cap = fv.batteryCapacityWh();
  p.generation = gen; p.consumption = use;
  const net = gen - use; p.net = net; p.sunlit = env.sunlit;
  if (cap > 0) {
    const eff = net > 0 ? 0.95 : 1.0;
    fv.batteryWh = Math.min(cap, Math.max(0, fv.batteryWh + (net * eff * dt) / 3600));
    if (fv.batteryWh <= 0 && net < 0) p.blackout = true;
    else if (fv.batteryWh > 0.02 * cap || net >= 0) p.blackout = false;
  } else {
    p.blackout = gen < use * 0.999 && use > 0 && fv.presentComponents().some((c) => c.powerDraw > 0);
    if (gen <= 0 && use > 0) p.blackout = true; else if (gen >= use) p.blackout = false;
  }
  p.batteryFraction = cap > 0 ? fv.batteryWh / cap : 0;
  return p;
}

/**
 * Thermal update. Two lumped nodes:
 *  - lead node (nose/fairing): aerodynamic heating (Sutton-Graves stagnation flux, cold/hot-wall corrected) minus radiation
 *  - body node: solar + planetary IR + albedo + internal dissipation minus radiation to space (through radiators/MLI)
 */
export function updateThermal(fv, dt, env) {
  const th = fv.thermal;
  const comps = fv.presentComponents();
  // --- lead node (aero-heating) ---
  fv.updateLeadNode();
  const lead = th.lead;
  if (env.heatFlux > 0) {
    const Taw = env.ambientT + 0.9 * (env.speed * env.speed) / (2 * 1005);
    const hotWall = Math.max(0, 1 - lead.T / Math.max(Taw, 1));
    const qin = env.heatFlux * 0.12 * lead.area * hotWall; // average over the nose surface ~12% of stagnation flux
    lead.absorbed = qin;
    lead.T += (qin * dt) / lead.C;
  } else lead.absorbed = 0;
  lead.T += (-(0.85 * SIGMA * lead.area * (Math.pow(lead.T, 4) - Math.pow(3, 4))) * dt) / lead.C; // radiation, eps 0.85, to 3 K space
  lead.T = Math.max(lead.T, 3);

  // --- body node ---
  const b = th.body;
  let area = 0, massTot = 0, radiatorArea = 0, mliFactor = 1, heater = null, alphaMli = null;
  // Vehicles that say so (meta.thermalOuterSurface) count only their OUTER skin: equipment inside a bay or an adapter has no skin of its own
  const outerOnly = !!fv.def.meta?.thermalOuterSurface;
  for (const c of comps) {
    massTot += (c.mass ?? 0) * (c.count ?? 1) + (fv.propMass[c.id] ?? 0);
    if (outerOnly && c.mount === 'internal' && c.parent && fv.byId.has(c.parent) && fv.present(fv.byId.get(c.parent))) { /* inside a present container */ }
    else if (c.mount === 'stack' || c.mount === 'internal' || c.mount === 'body') area += Math.PI * (c.diameter ?? 0.3) * (c.length ?? 0.3) + (c.mount === 'body' ? (c.width ?? 1) * (c.length ?? 1) * 2 : 0);
    if (c.kind === 'radiator' && (fv.deployed.has(c.id) || !c.deployable)) radiatorArea += (c.area ?? 0) * (c.count ?? 1);
    if (c.kind === 'mli') { mliFactor = Math.min(mliFactor, c.insulationFactor ?? 0.05); if (c.solarAbsorptivity != null) alphaMli = Math.min(alphaMli ?? 1, c.solarAbsorptivity); }
    if (c.kind === 'heater') heater = c;
  }
  area = Math.max(area, 0.05);
  b.C = Math.max(massTot * 900, 1);
  const eps = 0.8, alpha = alphaMli ?? 0.6;   // blankets with a reflective outer layer (solarAbsorptivity) absorb less sunlight
  let q = 0;
  const projected = area / 4; // average projected area of a tumbling convex body
  if (env.sunlit) q += alpha * env.solarFlux * projected * (env.inAtmosphere ? 0.6 : 1);
  q += env.planetIR ?? 0;
  q += env.albedoFlux ?? 0;
  q += env.internalPower ?? 0;
  const radArea = area * mliFactor + radiatorArea;
  // radiative environment: on a surface half of the view is ground (surface temperature), half is cold sky
  const Tenv = env.surfaceT != null ? (env.onSurface ? Math.pow(0.5 * Math.pow(env.surfaceT, 4) + 0.5 * Math.pow(env.skyT ?? 3, 4), 0.25) : env.surfaceT) : 3;
  const conv = env.convectionW ?? 0; // W/K convection to ambient gas
  q -= eps * SIGMA * radArea * (Math.pow(b.T, 4) - Math.pow(Tenv, 4));
  q -= conv * (b.T - env.ambientT);
  // thermostat heater
  if (heater) {
    const set = heater.setpointK ?? 280;
    th.heaterOn = b.T < set - 2 ? true : b.T > set + 2 ? false : !!th.heaterOn;
    if (th.heaterOn && !fv.powerState.blackout) q += heater.powerDraw;
  }
  // Water sublimator (meta.thermalSink): boils off water to keep the cabin loop at its setpoint, as the Apollo environmental control did
  const sink = fv.def.meta?.thermalSink;
  if (sink) {
    th.sinkWater ??= sink.waterKg;
    const hot = (b.T - sink.setpointK) * b.C / Math.max(dt, 1e-6) + q;
    if (hot > 0 && th.sinkWater > 0) { const w = Math.min(sink.maxW, hot); q -= w; th.sinkWater = Math.max(0, th.sinkWater - w * dt / 2.8e6); }
  }
  b.T += (q * dt) / b.C;
  b.T = Math.max(b.T, 3);
  // limits
  let worst = 0, worstId = null, worstKind = null;
  for (const c of comps) {
    const tmax = c.tMax, tmin = c.tMin;
    const isLead = c.id === lead.id;
    const T = isLead ? lead.T : b.T;
    if (c.mount === 'radial' && c.kind !== 'solar_panel') continue;
    if (tmax) { const r = T / tmax; if (r > worst) { worst = r; worstId = c.id; worstKind = 'hot'; } }
    if (tmin && !isLead) { const r = tmin / Math.max(T, 1); if (r > worst) { worst = r; worstId = c.id; worstKind = 'cold'; } }
  }
  th.maxRatio = worst; th.worstId = worstId; th.worstKind = worstKind;
  return th;
}

/** Communications link budget (Friis) to the ground station / Earth. */
export function updateComms(fv, dt, env) {
  const cs = fv.commState;
  cs.transmitting = false;
  const ants = fv.presentComponents('antenna').filter((a) => fv.deployed.has(a.id) || !a.deployable);
  if (!ants.length || fv.powerState.blackout || !fv.presentComponents().some((c) => c.guidance)) {
    cs.link = false; cs.margin = -99; cs.dataRate = 0; cs.reason = !ants.length ? 'no antenna' : 'no power/computer';
    return cs;
  }
  if (!env.commTargetDir || env.commOccluded) { cs.link = false; cs.margin = -99; cs.range = env.commRange ?? 0; cs.dataRate = 0; cs.reason = 'no line of sight'; return cs; }
  if (env.commElevationDeg != null && env.commElevationDeg < (env.groundStation.minElevationDeg ?? 5)) {
    cs.link = false; cs.margin = -99; cs.range = env.commRange; cs.dataRate = 0; cs.reason = 'below elevation mask'; cs.elevation = env.commElevationDeg; return cs;
  }
  let best = null;
  const bodyAxis = qRotate(env.q, [1, 0, 0]);
  const off = angleBetween(bodyAxis, env.commTargetDir);
  for (const a of ants) {
    const lambda = C_LIGHT / ((a.frequencyGHz ?? 2.2) * 1e9);
    let gain = a.gainDbi ?? 0, pointLoss = 0;
    if (!a.steerable) {
      const bw = ((a.beamwidthDeg ?? 180) * Math.PI) / 180;
      if (bw < 3.1) { const x = off / (bw / 2); pointLoss = 12 * x * x * 0.25; if (pointLoss > 40) pointLoss = 40; }
      else if (off > (100 * Math.PI) / 180) pointLoss = 15; // omni blocked by body
    }
    const fsl = 20 * Math.log10((4 * Math.PI * env.commRange) / lambda);
    const prx = dB(a.txPowerW ?? 2) + gain - pointLoss - fsl - 2 /* misc */ + env.groundStation.gainDbi;
    const rate = fv.commRateOverride ?? a.dataRateBps ?? 1000;
    const noise = dB(K_B * (env.groundStation.noiseTempK ?? 100) * rate);
    const margin = prx - noise - (a.requiredSnrDb ?? 6);
    if (!best || margin > best.margin) best = { margin, ant: a, rate, pointLoss, fsl };
  }
  cs.margin = best.margin; cs.range = env.commRange; cs.pointingLoss = best.pointLoss; cs.elevation = env.commElevationDeg ?? 90;
  cs.link = best.margin >= 0; cs.dataRate = cs.link ? best.rate : 0; cs.antenna = best.ant.id;
  if (cs.link && (env.wantTransmit ?? true)) {
    cs.transmitting = true;
    const bits = Math.min(fv.dataStored, cs.dataRate * dt);
    fv.dataStored -= bits; fv.dataDownlinked += bits;
  }
  return cs;
}

/** Instruments produce data while active. */
export function updateInstruments(fv, dt) {
  for (const [id, remaining] of [...fv.activeInstruments]) {
    const c = fv.byId.get(id);
    if (!c || !fv.present(c) || fv.powerState.blackout) continue;
    fv.dataStored += (c.dataRateBps ?? 0) * dt;
    if (Number.isFinite(remaining)) {
      const left = remaining - dt;
      if (left <= 0) { fv.activeInstruments.delete(id); fv.completedMeasurements = (fv.completedMeasurements ?? 0) + 1; }
      else fv.activeInstruments.set(id, left);
    }
  }
}
