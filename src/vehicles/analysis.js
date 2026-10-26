// Static vehicle analysis: mass budget, per-stage delta-v via the rocket equation, thrust-to-weight, plausibility validation.
import { computeMassProperties, computeLayout, capacityOf, indexById } from '../../physics/vehicle-model.js';
import { getBody } from '../../physics/bodies.js';
import { G0 } from '../../physics/constants.js';
import { circularSpeed } from '../../physics/orbital.js';
import { PROPELLANTS } from '../../physics/propellants.js';

const isTank = (c) => c.kind === 'fuel_tank' || c.kind === 'oxidizer_tank' || c.kind === 'propellant_tank';

/** Firing order of the stages ({id, name, jettisonBefore}). */
export function stageOrder(vehicle) {
  let st = [...(vehicle.stages ?? [])].sort((a, b) => a.order - b.order);
  if (!st.length) {
    const groups = [...new Set(vehicle.components.filter((c) => c.kind === 'engine').map((c) => c.group ?? 'main'))];
    st = groups.map((g, i) => ({ id: g, name: g, order: i + 1 }));
  }
  const out = [];
  st.forEach((s, i) => {
    const before = [];
    if (i > 0) before.push(st[i - 1].id);
    // the fairing is jettisoned early in the last stage
    if (i === st.length - 1 && st.length > 1 && vehicle.components.some((c) => c.group === 'fairing')) before.push('fairing');
    out.push({ id: s.id, name: s.name, jettisonBefore: before });
  });
  return out;
}

export function analyzeVehicle(vehicle, { body = 'earth' } = {}) {
  const B = getBody(body);
  const g = B.gravity;
  const full = computeMassProperties(vehicle);
  const stages = stageOrder(vehicle);
  const removed = new Set();
  const outStages = [];
  let dvVacTotal = 0, dvSlTotal = 0, dvEst = 0;
  const layoutFull = full.layout;
  stages.forEach((s, idx) => {
    for (const j of s.jettisonBefore) removed.add(j);
    const mp0 = computeMassProperties(vehicle, { removedGroups: removed });
    const engs = vehicle.components.filter((c) => c.kind === 'engine' && c.group === s.id && !removed.has(c.group));
    let Fvac = 0, Fsl = 0, IspNum = 0, IspSlNum = 0, mdot = 0;
    for (const e of engs) {
      const n = e.count ?? 1;
      Fvac += e.thrustVac * n; Fsl += e.thrustVac * n * (e.ispSl / e.ispVac);
      IspNum += e.thrustVac * n * e.ispVac; IspSlNum += e.thrustVac * n * (e.ispSl ?? e.ispVac);
      mdot += (e.thrustVac * n) / (e.ispVac * G0);
    }
    const ispVac = Fvac > 0 ? IspNum / Fvac : 0, ispSl = Fvac > 0 ? IspSlNum / Fvac : 0;
    let prop = 0;
    for (const c of vehicle.components) {
      if (c.group !== s.id) continue;
      if (isTank(c)) prop += (c.propellantMass ?? 0) * (c.fill ?? 1);
      if (c.kind === 'engine' && c.solid) prop += (c.propellantMass ?? 0) * (c.count ?? 1) * (c.fill ?? 1);
    }
    const m0 = mp0.mass, mf = Math.max(m0 - prop, 1e-6);
    const dvVac = ispVac > 0 && prop > 0 ? ispVac * G0 * Math.log(m0 / mf) : 0;
    const dvSl = ispSl > 0 && prop > 0 ? ispSl * G0 * Math.log(m0 / mf) : 0;
    dvVacTotal += dvVac; dvSlTotal += dvSl;
    dvEst += idx === 0 && vehicle.type === 'rocket' ? 0.5 * (dvVac + dvSl) : dvVac;
    outStages.push({
      id: s.id, name: s.name, engines: engs.length, ignitionMass: m0, burnoutMass: mf, propellant: prop, thrustVac: Fvac, thrustSl: Fsl, ispVac, ispSl,
      dvVac, dvSl, burnTime: mdot > 0 ? prop / mdot : 0, twrStart: Fsl > 0 && idx === 0 ? Fsl / (m0 * g) : Fvac / (m0 * g), twrVacStart: Fvac / (m0 * g), twrEnd: Fvac / (mf * g),
    });
    removed.add(s.id);
  });
  const stage1 = outStages[0];
  return {
    body, totalMass: full.mass, dryMass: full.dryMass, propellantMass: full.propellantMass, cgX: full.cg, length: full.length, diameter: full.maxDiameter,
    stages: outStages, dvVacuum: dvVacTotal, dvSeaLevel: dvSlTotal, dvEstimate: dvEst,
    liftoffTWR: stage1 ? (stage1.thrustSl || stage1.thrustVac) / (full.mass * g) : 0,
    payloadMass: vehicle.components.filter((c) => c.group === 'payload').reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1) + (capacityOf(c) * (c.fill ?? 1)), 0),
  };
}

/** Rough ascent Δv requirement to a circular orbit, including typical gravity/drag/steering losses. */
export function ascentDvRequired(body, altitude, latitudeDeg = 28.5, extraLoss = 1500) {
  const B = getBody(body);
  const vc = circularSpeed(B.mu, B.radius + altitude);
  const vrot = B.omega * B.radius * Math.cos((latitudeDeg * Math.PI) / 180);
  const atm = B.atmosphereModel.hasAtmosphere;
  const losses = atm ? extraLoss : 0.1 * vc; // airless bodies: only gravity loss (~ small for high TWR)
  return { vCircular: vc, vRotation: vrot, losses, total: vc - vrot + losses };
}

export function validateVehicle(vehicle, { body = 'earth' } = {}) {
  const issues = [];
  const add = (severity, code, message, componentId) => issues.push({ severity, code, message, componentId });
  const comps = vehicle.components;
  if (!comps.length) { add('error', 'EMPTY', 'The vehicle has no components.'); return issues; }
  const ids = new Set();
  for (const c of comps) { if (ids.has(c.id)) add('error', 'DUP_ID', `Duplicate component id ${c.id}`, c.id); ids.add(c.id); }
  const byId = indexById(vehicle);
  const engines = comps.filter((c) => c.kind === 'engine');
  const isRocketLike = ['rocket', 'lander', 'spacecraft', 'probe', 'satellite'].includes(vehicle.type);
  if (['rocket', 'lander'].includes(vehicle.type) && !engines.length) add('error', 'NO_ENGINE', `A ${vehicle.type} needs at least one engine.`);
  // engine feed
  for (const e of engines) {
    if (e.solid) continue;
    const groups = e.feedGroups ?? [e.group];
    for (const p of e.propellants ?? []) {
      const ok = comps.some((t) => isTank(t) && t.propellant === p && groups.includes(t.group) && (t.propellantMass ?? 0) > 0);
      if (!ok) add('error', 'NO_FEED', `${e.name} (${e.id}) burns ${p} but there is no ${p} tank in ${e.group ?? 'its'} group.`, e.id);
    }
    if (!(e.propellants ?? []).length) add('error', 'NO_PROPELLANT_DEF', `${e.name} declares no propellants.`, e.id);
    if (e.propellants?.length === 2) {
      const roles = e.propellants.map((p) => PROPELLANTS[p]?.role);
      if (!(roles.includes('fuel') && roles.includes('oxidizer'))) add('warning', 'BAD_PROPELLANT_PAIR', `${e.name}: propellants ${e.propellants.join('+')} are not a fuel/oxidizer pair.`, e.id);
    }
  }
  for (const t of comps.filter(isTank)) {
    const used = engines.some((e) => (e.propellants ?? []).includes(t.propellant) && (e.feedGroups ?? [e.group]).includes(t.group)) || comps.some((c) => c.kind === 'rcs');
    if (!used) add('warning', 'TANK_UNUSED', `${t.name} (${t.id}) holds ${t.propellant} but no engine in group ${t.group ?? '-'} uses it.`, t.id);
  }
  // fairing / payload fit
  for (const f of comps.filter((c) => c.kind === 'fairing' || comps.some((x) => x.parent === c.id && x.mount === 'internal'))) {
    const kids = comps.filter((c) => c.parent === f.id && c.mount === 'internal');
    if (!kids.length) continue;
    const interiorD = (f.diameter ?? 0) - 0.06;
    const interiorL = (f.length ?? 0) - 0.06;
    const vol = (c) => (Math.PI / 4) * (c.diameter ?? 0) ** 2 * (c.length ?? 0) * (c.count ?? 1);
    const usedVol = kids.reduce((s, c) => s + vol(c), 0);
    const freeVol = (Math.PI / 4) * interiorD * interiorD * interiorL;
    // a container holding a single item (payload in a fairing) must fit lengthwise; packed equipment is checked by volume
    if (kids.length === 1 && (kids[0].length ?? 0) > interiorL + 1e-9) add('error', 'PAYLOAD_TOO_LONG', `${kids[0].name} (${kids[0].length.toFixed(2)} m) is longer than the interior of ${f.name} (${interiorL.toFixed(2)} m).`, f.id);
    else if (usedVol > 0.75 * freeVol) add('error', 'PAYLOAD_TOO_BIG', `Contents of ${f.name} (${usedVol.toFixed(2)} m³ of equipment) do not fit its ${freeVol.toFixed(2)} m³ interior.`, f.id);
    for (const k of kids) if ((k.diameter ?? 0) > interiorD + 1e-9) add('error', 'PAYLOAD_TOO_WIDE', `${k.name} (${k.diameter.toFixed(2)} m) is wider than the interior of ${f.name} (${interiorD.toFixed(2)} m).`, k.id);
  }
  for (const c of comps) if (c.mount === 'internal' && c.parent && !byId.has(c.parent)) add('error', 'ORPHAN', `${c.name} is mounted in ${c.parent}, which does not exist.`, c.id);
  // exposed payload
  const fairing = comps.find((c) => c.kind === 'fairing');
  const stackPayloads = comps.filter((c) => c.kind === 'payload' && c.mount === 'stack' && vehicle.type === 'rocket');
  if (stackPayloads.length && !fairing) add('info', 'EXPOSED_PAYLOAD', 'The payload is not enclosed in a fairing and will experience aerodynamic loads and heating.');
  // diameters along the stack
  const stack = comps.filter((c) => c.mount === 'stack');
  for (let i = 1; i < stack.length; i++) {
    const a = stack[i - 1].diameter ?? 0, b = stack[i].diameter ?? 0;
    if (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > 0.4 && stack[i].kind !== 'nose_cone') add('warning', 'DIAMETER_STEP', `Large diameter step between ${stack[i - 1].name} (${a.toFixed(2)} m) and ${stack[i].name} (${b.toFixed(2)} m).`, stack[i].id);
  }
  // guidance / power
  if (isRocketLike && !comps.some((c) => c.guidance)) add(engines.length ? 'warning' : 'info', 'NO_GUIDANCE', 'No guidance computer (avionics/guidance/computer): the vehicle cannot control its attitude.');
  const draw = comps.reduce((s, c) => s + (c.powerDraw && ['avionics', 'guidance', 'computer'].includes(c.kind) ? c.powerDraw : 0), 0);
  const hasBat = comps.some((c) => c.kind === 'battery'), hasSol = comps.some((c) => c.kind === 'solar_panel');
  if (draw > 0 && !hasBat && !hasSol) add('error', 'NO_POWER', `Avionics draw ${draw} W but the vehicle has no battery or solar panel.`);
  // TWR
  if (engines.length) {
    const a = analyzeVehicle(vehicle, { body });
    const s1 = a.stages[0];
    if (vehicle.type === 'rocket' && s1) {
      if (a.liftoffTWR < 1) add('error', 'LOW_TWR', `Liftoff thrust-to-weight is ${a.liftoffTWR.toFixed(2)} (< 1): the vehicle cannot leave the pad.`);
      else if (a.liftoffTWR < 1.2) add('warning', 'MARGINAL_TWR', `Liftoff thrust-to-weight is only ${a.liftoffTWR.toFixed(2)}; high gravity losses expected (target ≥ 1.3).`);
      if (engines.some((e) => e.group === s1.id && e.vacuumOptimised)) add('warning', 'VAC_ENGINE_SL', 'A vacuum-optimised engine is used in the first stage: thrust and Isp collapse at sea level.');
    }
    for (const s of a.stages) if (s.propellant > 0 && s.engines === 0) add('warning', 'STAGE_NO_ENGINE', `${s.name} has propellant but no engine.`);
  }
  if (vehicle.type === 'lander') {
    const lb = vehicle.meta?.body ?? body;
    let atm = false; try { atm = getBody(lb).atmosphere?.model && getBody(lb).atmosphere.model !== 'none'; } catch { /* unknown body */ }
    if (atm) add('warning', 'ATMOSPHERIC_ENTRY', `Landing on ${lb} needs an entry, descent and landing system (heat shield, parachute, retro-propulsion). The powered-descent guidance starts from a low periapsis and does not model a full entry sequence, so a landing from orbit will very likely fail.`);
    if (!comps.some((c) => c.kind === 'landing_legs')) add('warning', 'NO_LEGS', 'A lander without landing legs can only survive very gentle touchdowns.');
  }
  if (vehicle.type === 'rover') {
    for (const [k, msg] of [['rover_chassis', 'chassis'], ['wheel', 'wheels'], ['motor', 'drive motors'], ['battery', 'a battery']]) if (!comps.some((c) => c.kind === k)) add('error', `ROVER_NO_${k.toUpperCase()}`, `A rover needs ${msg}.`);
  }
  if (comps.some((c) => c.kind === 'solar_panel' && c.deployable)) add('info', 'PANELS_STOWED', 'Deployable solar panels generate no power until a DEPLOY event is executed.');
  if (comps.some((c) => c.kind === 'antenna' && c.antennaType === 'dish')) add('info', 'DISH_POINTING', 'The high-gain dish is body-fixed along +X: use earth_point guidance while transmitting.');
  return issues;
}
