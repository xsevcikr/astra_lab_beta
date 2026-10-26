// Engineering logic of the offline AI engineer: sizing (rocket equation + the real mass model) and fix planning.
// Everything here produces *plans* (structured tool calls). Nothing is applied without approval, and no simulation result
// is ever predicted: the sizing numbers are engineering estimates, the outcome is decided by the simulator.
import { Plan } from './plan.js';
import { designLauncher, buildProbe, buildRover } from '../src/vehicles/builders.js';
import { analyzeVehicle, ascentDvRequired } from '../src/vehicles/analysis.js';
import { modifyComponent, cloneVehicle, totalMass } from '../src/vehicles/vehicle.js';
import { byCatalogId, CATALOG } from '../data/components.js';

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const TANKS = ['fuel_tank', 'oxidizer_tank', 'propellant_tank'];

// ------------------------------------------------------------------------------------------------------------
// building
// ------------------------------------------------------------------------------------------------------------
/** Required ascent delta-v estimate (circular orbit speed - Earth rotation + typical losses) used for sizing. */
export function requiredAscentDv({ body = 'earth', altitude = 200000, latitude = 28.573, losses = 1500, margin = 1 }) {
  const r = ascentDvRequired(body, altitude, latitude, losses);
  return { ...r, margin, required: r.total * margin };
}

export function payloadDefaults(text = {}) {
  return { payloadMass: text.payloadMass ?? 100, payloadName: text.payloadName ?? 'Space probe' };
}

const PAYLOAD_LABEL = { probe: 'space probe', satellite: 'satellite', rover: 'rover', capsule: 'capsule stand-in' };
/** Plan that builds the payload (probe, satellite, rover or capsule stand-in), an N-stage rocket, puts the payload in the fairing and creates the launch mission. */
export function rocketBuildPlan(spec) {
  const s = { payloadMass: 100, payloadKind: 'probe', altitude: 200000, dvMargin: 1.05, body: 'earth', stages: 2, name: null, ...spec };
  const kind = s.payloadKind;
  s.payloadName = spec?.payloadName ?? (kind === 'rover' ? 'Rover' : kind === 'satellite' ? 'Satellite' : kind === 'capsule' ? 'Capsule stand-in' : 'Space probe');
  const payloadVehicle = kind === 'rover' ? buildRover({ name: s.payloadName, mass: s.payloadMass }) : buildProbe({ name: s.payloadName, mass: s.payloadMass });
  const sized = designLauncher({ payloadVehicle, targetAltitude: s.altitude, dvMargin: s.dvMargin, body: s.body, diameter: s.diameter, name: s.name ?? undefined });
  const cfg = sized.meta.cfg;
  const req = requiredAscentDv({ body: s.body, altitude: s.altitude, margin: s.dvMargin });
  const name = s.name ?? (kind === 'probe' ? `Two-stage launcher (${s.payloadMass} kg to ${round(s.altitude / 1000, 0)} km)` : `Two-stage launcher (${s.payloadMass} kg ${PAYLOAD_LABEL[kind]} to ${round(s.altitude / 1000, 0)} km)`);
  const e1 = byCatalogId(cfg.e1), e2 = byCatalogId(cfg.e2);
  const first = kind === 'rover'
    ? { tool: 'CREATE_ROVER', args: { name: s.payloadName, mass: s.payloadMass }, why: `The payload: a ${s.payloadMass} kg rover with chassis, wheels, battery, solar panel and radio. It rides inside the fairing.` }
    : { tool: 'CREATE_PROBE', args: { name: s.payloadName, mass: s.payloadMass, destination: 'mars' }, why: `The payload: a ${s.payloadMass} kg ${kind === 'probe' ? 'probe' : kind === 'capsule' ? 'uncrewed capsule stand-in (mass only, no crew systems)' : 'satellite bus'} with batteries, solar panels, antennas and instruments.` };
  const calls = [
    first,
    { tool: 'CREATE_VEHICLE', args: { type: 'rocket', name, diameter: cfg.D, targetAltitude: s.altitude, body: s.body }, why: `Empty launcher skeleton, ${cfg.D} m diameter (wide enough for the engine cluster and the payload).` },
    { tool: 'CREATE_STAGE', args: { order: 1, name: 'Stage 1', engine: cfg.e1, engineCount: cfg.n1, propellantMass: cfg.p1, diameter: cfg.D }, why: `First stage: ${cfg.n1} × ${e1.name}, ${cfg.p1} kg kerosene/LOX; sized for a liftoff thrust-to-weight of about 1.4.` },
    { tool: 'CREATE_STAGE', args: { order: 2, name: 'Stage 2', engine: cfg.e2, engineCount: cfg.n2, propellantMass: cfg.p2, diameter: cfg.D }, why: `Second stage: ${cfg.n2} × ${e2.name}, ${cfg.p2} kg propellant; restartable for the circularisation burn.` },
    { tool: 'ADD_PAYLOAD', args: { payloadVehicle: s.payloadName }, why: `Adds the avionics section, payload fairing and nose cone, and places the ${PAYLOAD_LABEL[kind]} inside the fairing (its mass counts in the rocket).` },
    { tool: 'CREATE_MISSION', args: { kind: 'launch', altitude: s.altitude, name: `Launch to ${round(s.altitude / 1000, 0)} km orbit` }, why: 'Mission timeline: ignition, staging, fairing jettison, apoapsis cut-off, circularisation, payload release.' },
  ];
  return new Plan({
    title: `Build ${name}`, kind: 'build', calls, builder: { kind: 'rocket', spec: s },
    rationale: `Sized with the rocket equation for ${round(req.required, 0)} m/s (circular speed ${round(req.vCircular, 0)} − Earth rotation ${round(req.vRotation, 0)} + ${round(req.losses, 0)} m/s allowance for gravity, drag and steering losses; margin factor ${s.dvMargin}). This is an estimate: only a simulation shows whether it works.`,
    expected: { dvRequired: req.required },
  });
}

export function probeBuildPlan({ mass = 100, name = 'Space probe', destination = 'mars' } = {}) {
  return new Plan({ title: `Build probe (${mass} kg)`, kind: 'build', builder: { kind: 'probe', spec: { mass, name, destination } },
    calls: [
      { tool: 'CREATE_PROBE', args: { name, mass, destination }, why: 'Bus, batteries, solar arrays, antennas, instruments and a small thruster.' },
      { tool: 'CREATE_MISSION', args: { kind: 'probe_operations', name: 'Probe operations in orbit' }, why: 'Deploy arrays, point at the Sun, run the instruments and downlink data (tests power, thermal and communications).' },
    ] });
}
export function roverBuildPlan({ mass = 150, name = 'Rover', body = 'moon', distance = 200 } = {}) {
  return new Plan({ title: `Build rover (${mass} kg) for ${body === 'mars' ? 'Mars' : 'the Moon'}`, kind: 'build', builder: { kind: 'rover', spec: { mass, name, body, distance } },
    calls: [
      { tool: 'CREATE_ROVER', args: { name, mass }, why: 'Chassis, six wheels with motors, battery, solar panel, radio, instruments, thermal control.' },
      { tool: 'CREATE_MISSION', args: { kind: 'rover', body, distance, name: `${body === 'mars' ? 'Mars' : 'Moon'} rover traverse (${distance} m)` }, why: `Drive ${distance} m, take measurements and downlink the data on the ${body}.` },
    ] });
}
export function landerBuildPlan({ payloadMass = 150, name = 'Lander', body = 'moon', withRoverMass = null } = {}) {
  const calls = [];
  if (withRoverMass) calls.push({ tool: 'CREATE_ROVER', args: { name: 'Rover', mass: withRoverMass }, why: 'The rover the lander will carry and deploy after touchdown.' });
  calls.push({ tool: 'CREATE_LANDER', args: { name, body, payloadMass, ...(withRoverMass ? { carryRover: 'Rover' } : {}) }, why: `Powered lander sized for ~${body === 'moon' ? 2150 : 1300} m/s of deorbit + descent delta-v with a throttleable engine and landing legs.` });
  calls.push({ tool: 'CREATE_MISSION', args: { kind: 'landing', body, name: `${body === 'mars' ? 'Mars' : 'Moon'} powered landing` }, why: 'Deorbit burn, powered descent guidance, leg deployment, touchdown and (if carried) rover deployment.' });
  return new Plan({ title: `Build ${body} lander`, kind: 'build', builder: { kind: 'lander', spec: { payloadMass, name, body, withRoverMass } }, calls });
}
export function spacecraftBuildPlan({ type = 'spacecraft', dv = null, mass = null, name = null } = {}) {
  return new Plan({ title: `Build ${type}`, kind: 'build', builder: { kind: 'spacecraft', spec: { type, dv, mass, name } },
    calls: [
      { tool: 'CREATE_VEHICLE', args: { type, ...(name ? { name } : {}), ...(dv ? { dv } : {}), ...(mass ? { mass } : {}) }, why: 'Bus with reaction wheels, solar arrays, antennas, computer, thermal control and a hypergolic engine sized for the delta-v.' },
      { tool: 'CREATE_MISSION', args: { kind: 'orbit_raise', name: 'Orbit raise (Hohmann transfer)' }, why: 'Two-burn Hohmann transfer from 300 km to 800 km.' },
    ] });
}

// ------------------------------------------------------------------------------------------------------------
// helpers on vehicles
// ------------------------------------------------------------------------------------------------------------
export function stageNumbers(v) { return v.stages.filter((s) => /^stage\d+$/.test(s.id)).map((s) => s.order).sort((a, b) => a - b); }
export function stageDesignDv(v, body = 'earth') {
  const an = analyzeVehicle(v, { body });
  const s = an.stages;
  if (!s.length) return { total: 0, an };
  return { total: (v.type === 'rocket' ? 0.6 * s[0].dvSl + 0.4 * s[0].dvVac : s[0].dvVac) + s.slice(1).reduce((t, x) => t + x.dvVac, 0), an };
}
export function payloadMassOf(v) {
  return v.meta?.payloadMass ?? v.components.filter((c) => c.group === 'payload').reduce((s, c) => s + (c.mass ?? 0) * (c.count ?? 1) + (c.propellantMass ?? 0), 0);
}
export function stagePropellant(v, stageId) { return v.components.filter((c) => c.group === stageId && TANKS.includes(c.kind)).reduce((s, c) => s + c.propellantMass, 0); }

/** Propellant mass of one stage at which its vacuum delta-v reaches `targetDv` (real mass model, bisection). */
export function solveStagePropellant(v, stageId, targetDv, body = 'earth') {
  const idx = v.stages.filter((s) => true).sort((a, b) => a.order - b.order).findIndex((s) => s.id === stageId);
  const cur = stagePropellant(v, stageId);
  const dvAt = (p) => {
    const c = cloneVehicle(v);
    const f = p / Math.max(cur, 1e-9);
    for (const t of c.components) if (t.group === stageId && TANKS.includes(t.kind)) modifyComponent(c, t.id, { propellantMass: Math.max(1, t.propellantMass * f) });
    return analyzeVehicle(c, { body }).stages[idx]?.dvVac ?? 0;
  };
  let lo = cur * 0.2, hi = cur * 8;
  if (dvAt(hi) < targetDv) return hi;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (dvAt(mid) < targetDv) lo = mid; else hi = mid; if (hi - lo < 0.2) break; }
  return hi;
}

// ------------------------------------------------------------------------------------------------------------
// fixing
// ------------------------------------------------------------------------------------------------------------
export function probeNameOf(v) { const p = v.components.find((c) => c.group === 'payload' && c.kind === 'payload'); return v.meta?.payloadName ?? 'Space probe'; }

export function pickRoot(failures) {
  const f = [...failures].sort((a, b) => a.t - b.t);
  return f.find((x) => x.rootCause) ?? f.find((x) => !x.causedBy && x.severity !== 'minor') ?? f[0] ?? null;
}

/** Re-size a two-stage launcher (same payload, same orbit) with a different delta-v margin; returns MODIFY_STAGE calls or null. */
export function resizeLauncherCalls(v, { dvMargin, body = 'earth' }) {
  if (v.type !== 'rocket' || v.meta?.role !== 'launcher' && !v.meta?.cfg) return null;
  const nums = stageNumbers(v);
  if (nums.length !== 2) return null;
  const alt = v.meta?.targetAltitude ?? 200000;
  const payload = payloadMassOf(v);
  const probe = buildProbe({ mass: Math.max(payload, 5) });
  const sized = designLauncher({ payloadVehicle: probe, targetAltitude: alt, dvMargin, body, diameter: v.meta?.cfg?.D });
  const c = sized.meta.cfg;
  const oldD = v.meta?.cfg?.D ?? 0;
  if (Math.abs(c.D - oldD) > 0.02) return { rebuild: true, cfg: c, sized };
  const calls = [];
  const s1 = v.components.find((x) => x.group === 'stage1' && x.kind === 'engine'), s2 = v.components.find((x) => x.group === 'stage2' && x.kind === 'engine');
  const sameFuel = (a, b) => a && b && [...a.propellants].sort().join() === [...b.propellants].sort().join();
  const e1n = byCatalogId(c.e1), e2n = byCatalogId(c.e2);
  if (!sameFuel(s1, e1n) || !sameFuel(s2, e2n)) return { rebuild: true, cfg: c, sized };
  calls.push({ tool: 'MODIFY_STAGE', args: { stage: 'stage1', propellantMass: c.p1, ...(s1.catalogId !== c.e1 ? { engine: c.e1 } : {}), engineCount: c.n1 }, why: `Stage 1: ${c.n1} × ${e1n.name}, ${c.p1} kg propellant (was ${round(stagePropellant(v, 'stage1'), 0)} kg).` });
  calls.push({ tool: 'MODIFY_STAGE', args: { stage: 'stage2', propellantMass: c.p2, ...(s2.catalogId !== c.e2 ? { engine: c.e2 } : {}), engineCount: c.n2 }, why: `Stage 2: ${c.n2} × ${e2n.name}, ${c.p2} kg propellant (was ${round(stagePropellant(v, 'stage2'), 0)} kg).` });
  return { calls, cfg: c, sized };
}

/**
 * Propose a fix for the most fundamental failure of a run. Returns {plan|null, advisory, investigation[]}.
 * `probe(tool,args)` executes a read-only tool (real simulations for what-if investigation).
 */
export async function planFix({ vehicle, mission, analysis, probe, body = 'earth', attempt = 0 }) {
  const failures = analysis.failures ?? [];
  const root = pickRoot(failures);
  if (!root) return { plan: null, advisory: 'The run has no failure record to fix.', investigation: [] };
  const inv = [];
  const rocket = vehicle.type === 'rocket';
  const obj = mission.objective ?? {};
  const wrap = (title, calls, rationale, expected) => new Plan({ title, kind: 'fix', calls, rationale, expected });
  const dvShort = root.dvShortfall ?? root.evidence?.find((e) => /still required/.test(e.label))?.value ?? null;

  const tuned = (analysis.tunedCount ?? 0) > 1;      // the failing flight already used the best of several pitch programmes: the profile is not the problem
  let code = root.code;
  if (code === 'INCORRECT_ORBIT' && rocket && obj.type === 'orbit' && vehicle.meta?.cfg && tuned) code = 'INSUFFICIENT_DELTA_V';
  switch (code) {
    case 'INSUFFICIENT_DELTA_V': {
      if (rocket && obj.type === 'orbit' && vehicle.meta?.cfg) {
        const { total } = stageDesignDv(vehicle, body);
        const base = requiredAscentDv({ body, altitude: obj.altitude ?? 200000, margin: 1 }).required, baseDv = base;
        const grow = 1.6 + 0.5 * attempt;                      // losses grow with the extra mass; each further attempt asks for more
        const targetMargin = Math.max((total + (dvShort ?? 0.1 * base) * grow + 0.01 * base) / base, total / base + 0.05 + 0.03 * attempt);   // each iteration is verified by a real flight; thin margins are not monotonic, so always step up by at least 5%
        const r = resizeLauncherCalls(vehicle, { dvMargin: round(targetMargin, 4), body });
        if (r?.calls) {
          const before = round(total, 0);
          return { plan: wrap('Add propellant to close the delta-v gap', r.calls,
            `The simulation ended ${dvShort != null ? round(dvShort, 0) + ' m/s short' : 'short'} of the ${round((obj.altitude ?? 0) / 1000, 0)} km orbit. The design delta-v (${before} m/s by the sizing convention) is raised to ${round(targetMargin * base, 0)} m/s: ${round(grow, 1)}× the shortfall, because every extra kilogram of propellant also has to be lifted and adds gravity and drag loss, plus 1% of the ascent budget as margin. The stages are re-sized with the real mass model.`,
            { newDesignDv: round(targetMargin * base, 0), margin: round(targetMargin, 4) }), advisory: null, investigation: inv };
        }
        if (r?.rebuild) {
          const payload = payloadMassOf(vehicle);
          const rev = (vehicle.name.match(/rev ([A-Z])\)?$/)?.[1] ?? 'A').charCodeAt(0) + 1;
          const base = vehicle.name.replace(/\s*\(rev [A-Z]\)$/, '');
          const plan = rocketBuildPlan({ payloadMass: payload, altitude: obj.altitude ?? 200000, dvMargin: round(targetMargin, 4), name: `${base} (rev ${String.fromCharCode(rev)})`, payloadName: probeNameOf(vehicle) });
          plan.kind = 'fix'; plan.title = `Rebuild the launcher with ${round(targetMargin * baseDv, 0)} m/s of design delta-v`;
          plan.rationale = `The simulation ended ${dvShort != null ? round(dvShort, 0) + ' m/s short' : 'short'} of the ${round((obj.altitude ?? 0) / 1000, 0)} km orbit. Closing that gap needs more engine thrust than the current ${vehicle.meta.cfg.D} m stage can hold, so patching propellant alone is not enough: the launcher is re-sized as a new vehicle (${r.cfg.D} m diameter, ${r.cfg.n1} first-stage engines, ${r.cfg.p1} kg + ${r.cfg.p2} kg propellant) for ${round(targetMargin * baseDv, 0)} m/s of design delta-v (${round(grow, 1)}× the shortfall, because extra propellant adds its own gravity and drag losses). The original vehicle stays in the project for comparison. `+plan.rationale;
          plan.expected = { newDesignDv: round(targetMargin * baseDv, 0), margin: round(targetMargin, 4) };
          return { plan, advisory: null, investigation: inv };
        }
      }
      // generic: raise the propellant of the last stage that carries the burn
      const nums = vehicle.stages.map((s) => s).sort((a, b) => b.order - a.order);
      const st = nums[0];
      if (!st) return { plan: null, advisory: 'This vehicle has no stage whose propellant can be increased automatically.', investigation: inv };
      const curDv = analyzeVehicle(vehicle, { body }).stages.find((s) => s.id === st.id)?.dvVac ?? 0;
      const p = solveStagePropellant(vehicle, st.id, curDv + (dvShort ?? 0.15 * curDv) * 1.25, body);
      return { plan: wrap(`Increase ${st.name} propellant`, [{ tool: 'MODIFY_STAGE', args: { stage: st.id, propellantMass: round(p, 0) }, why: `Propellant ${round(stagePropellant(vehicle, st.id), 0)} → ${round(p, 0)} kg gives about ${round((dvShort ?? 0) * 1.25, 0)} m/s more delta-v than the shortfall.` }],
        `The vehicle ran out of usable delta-v. The ${st.name} propellant is increased using the rocket equation on the real mass model.`), advisory: null, investigation: inv };
    }
    case 'PROPELLANT_DEPLETION': {
      const st = vehicle.stages[vehicle.stages.length - 1];
      const f = 1.3 + 0.25 * attempt;
      return { plan: wrap('Carry more propellant', [{ tool: 'MODIFY_STAGE', args: { stage: st.id, propellantScale: f }, why: `Propellant × ${f}: the lander ran out of propellant before touchdown.` }],
        `The propellant ran out during descent. I raise it by ${round((f - 1) * 100, 0)}% and re-fly; if it still fails, the next iteration will add more (each real simulation decides).`), advisory: null, investigation: inv };
    }
    case 'LOW_TWR': {
      const st1 = vehicle.stages.slice().sort((a, b) => a.order - b.order)[0];
      const eng = vehicle.components.find((c) => c.group === st1.id && c.kind === 'engine');
      let n = eng.count ?? 1;
      const c = cloneVehicle(vehicle);
      for (; n < 40; n++) { c.components.find((x) => x.id === eng.id).count = n; if (analyzeVehicle(c, { body }).liftoffTWR >= 1.3) break; }
      return { plan: wrap('Add engines for liftoff thrust', [{ tool: 'MODIFY_STAGE', args: { stage: st1.id, engineCount: n }, why: `${eng.count ?? 1} → ${n} engines gives a liftoff thrust-to-weight of about ${round(analyzeVehicle(c, { body }).liftoffTWR, 2)} (target 1.3).` }],
        'The vehicle could not leave the pad because thrust was lower than weight.'), advisory: null, investigation: inv };
    }
    case 'OVERTEMPERATURE': case 'UNDERTEMPERATURE': {
      const hf = root.evidence?.find((e) => /heat flux/i.test(e.label))?.value ?? 0;
      if (hf < 5000) {   // not aerodynamic heating: the vehicle's own dissipation / the environment
        const cold = root.code === 'UNDERTEMPERATURE';
        const mli = !cold ? vehicle.components.find((c) => c.kind === 'mli') : null;
        if (mli) return { plan: wrap('Remove the insulation blanket', [{ tool: 'REMOVE_COMPONENT', args: { id: mli.id }, why: `${mli.name} cuts the radiating area to ${round((mli.insulationFactor ?? 0.05) * 100, 0)}% while sunlight and internal dissipation still heat the body, so heat cannot escape.` }],
          `${(root.cause ?? root.primaryCause)} There was no aerodynamic heating: the vehicle is heated by the Sun and its own power use and the insulation stops it from radiating that heat away.`), advisory: null, investigation: inv };
        const item = CATALOG.find((c) => c.kind === (cold ? 'heater' : 'radiator'));
        if (item) return { plan: wrap(cold ? 'Add a heater' : 'Add a radiator', [{ tool: 'ADD_COMPONENT', args: { catalogId: item.catalogId }, why: `${item.name} (catalog, ${item.dataSource ?? 'estimated'}) gives the ${cold ? 'cold' : 'overheating'} component a ${cold ? 'heat source' : 'way to reject heat'}.` }],
          `${(root.cause ?? root.primaryCause)} There was no aerodynamic heating, so this is a thermal-control problem, not a trajectory problem.`), advisory: null, investigation: inv };
      }
      // aerodynamic heating: fall through to the trajectory investigation below
    }
    // eslint-disable-next-line no-fallthrough
    case 'MAX_Q_EXCEEDED': case 'STRUCTURAL_OVERLOAD': case 'LOSS_OF_CONTROL': case 'EXCESSIVE_ACCELERATION': case 'INCORRECT_ORBIT': {
      if (rocket && mission.guidance?.mode === 'ascent' && mission.initial?.type === 'pad') {
        // real investigation: fly candidate pitch programmes and keep the best one that reaches the orbit
        const r = await probe('RUN_SIMULATION', { tune: true, name: 'Investigation: pitch programme search' });
        if (r.ok && r.data.status === 'SUCCESS' && r.data.schedule) {
          inv.push(`Flew ${r.data.tuned?.length ?? 1} candidate pitch programme(s); ${JSON.stringify(r.data.schedule)} reached the orbit.`);
          return { plan: wrap('Use a pitch programme that works', [{ tool: 'MODIFY_MISSION', args: { schedule: r.data.schedule }, why: `Pitch programme (altitude at horizontal ${round(r.data.schedule.hF / 1000, 0)} km, shape ${r.data.schedule.n}) verified by a simulation that reached the orbit.` }],
            `${root.title} was caused by the flight profile, not by missing delta-v: with this pitch programme the same vehicle reached the orbit in a real simulation (run ${r.data.runId}).`, { verifiedRun: r.data.runId }), advisory: null, investigation: inv, investigationRun: r.data.runId };
        }
        inv.push(`Flew ${r.data?.tuned?.length ?? 0} candidate pitch programme(s); none reached the orbit (best: ${r.data?.status}).`);
      }
      return { plan: null, advisory: `${root.title}: ${(root.cause ?? root.primaryCause)} I have no automatic design change for this cause. Suggested actions: ${(root.solutions ?? []).join('; ')}.`, investigation: inv };
    }
    case 'POWER_FAILURE': {
      const calls = [];
      for (const c of vehicle.components.filter((x) => x.kind === 'solar_panel')) calls.push({ tool: 'MODIFY_COMPONENT', args: { id: c.id, changes: { area: round((c.area ?? 1) * 1.6, 2), mass: round((c.mass ?? 1) * 1.6, 1) } }, why: `${c.name}: area ×1.6 (mass scaled with it).` });
      for (const c of vehicle.components.filter((x) => x.kind === 'battery')) calls.push({ tool: 'MODIFY_COMPONENT', args: { id: c.id, changes: { capacityWh: round((c.capacityWh ?? 500) * 1.6, 0), mass: round((c.mass ?? 5) * 1.6, 1) } }, why: `${c.name}: capacity ×1.6 (mass scaled with it).` });
      return calls.length ? { plan: wrap('Add power generation and storage', calls, `${(root.cause ?? root.primaryCause)}`), advisory: null, investigation: inv } : { plan: null, advisory: 'The vehicle has no solar panels or batteries to enlarge; add some with ADD_COMPONENT.', investigation: inv };
    }
    case 'COMM_FAILURE': return { plan: null, advisory: `${(root.cause ?? root.primaryCause)} ${(root.contributing ?? []).join(' ')} Suggested: ${(root.solutions ?? []).join('; ')}.`, investigation: inv };
    case 'ROVER_IMMOBILISED': {
      const calls = [];
      const m = vehicle.components.find((c) => c.kind === 'motor'); if (m) calls.push({ tool: 'MODIFY_COMPONENT', args: { id: m.id, changes: { stallTorque: round((m.stallTorque ?? 20) * 1.6, 1), mass: round((m.mass ?? 1) * 1.4, 2) } }, why: 'Motors: stall torque ×1.6.' });
      const w = vehicle.components.find((c) => c.kind === 'wheel'); if (w) calls.push({ tool: 'MODIFY_COMPONENT', args: { id: w.id, changes: { radius: round((w.radius ?? 0.2) * 1.25, 3), width: round((w.width ?? 0.15) * 1.25, 3) } }, why: 'Wheels: radius and width ×1.25 (better traction and slope capability).' });
      return calls.length ? { plan: wrap('Improve traction', calls, (root.cause ?? root.primaryCause)), advisory: null, investigation: inv } : { plan: null, advisory: (root.cause ?? root.primaryCause), investigation: inv };
    }
    case 'ROVER_ROLLOVER': {
      const ch = vehicle.components.find((c) => c.kind === 'rover_chassis');
      return ch ? { plan: wrap('Widen the track', [{ tool: 'MODIFY_COMPONENT', args: { id: ch.id, changes: { width: round((ch.width ?? 0.8) * 1.3, 2), wheelbase: round((ch.wheelbase ?? 0.8) * 1.15, 2), groundClearance: round((ch.groundClearance ?? 0.2) * 0.85, 2) } }, why: 'Chassis width ×1.3 and ground clearance ×0.85 raise the static rollover angle atan(track/2 / h_cg).' }], (root.cause ?? root.primaryCause)), advisory: null, investigation: inv } : { plan: null, advisory: (root.cause ?? root.primaryCause), investigation: inv };
    }
    default:
      return { plan: null, advisory: `${root.title}: ${(root.cause ?? root.primaryCause)} I have no automatic design change for this cause. Suggested actions: ${(root.solutions ?? []).join('; ') || 'review the mission timeline and the vehicle design'}.`, investigation: inv };
  }
}


/** Improvement plan for a launcher that worked but with thin margins: re-size it with a larger delta-v margin (still verified only by a simulation). */
export function marginPlan({ vehicle, mission, body = 'earth', step = 0.05 }) {
  const obj = mission.objective ?? {};
  if (!(vehicle.type === 'rocket' && obj.type === 'orbit' && vehicle.meta?.cfg)) return null;
  const { total } = stageDesignDv(vehicle, body);
  const base = requiredAscentDv({ body, altitude: obj.altitude ?? 200000, margin: 1 }).required;
  const target = round(total / base + step, 4);
  const r = resizeLauncherCalls(vehicle, { dvMargin: target, body });
  const why = `Only a thin propellant reserve was left. The design delta-v is raised from ${round(total, 0)} to ${round(target * base, 0)} m/s (+${round(step * 100, 0)}% of the ascent budget) with the same payload and orbit.`;
  if (r?.calls) return new Plan({ title: 'Add propellant margin', kind: 'fix', calls: r.calls, rationale: why + ' The stages are re-sized with the real mass model.', expected: { newDesignDv: round(target * base, 0) } });
  if (r?.rebuild) {
    const rev = (vehicle.name.match(/rev ([A-Z])\)?$/)?.[1] ?? 'A').charCodeAt(0) + 1;
    const nm = vehicle.name.replace(/\s*\(rev [A-Z]\)$/, '');
    const plan = rocketBuildPlan({ payloadMass: payloadMassOf(vehicle), altitude: obj.altitude ?? 200000, dvMargin: target, name: `${nm} (rev ${String.fromCharCode(rev)})`, payloadName: probeNameOf(vehicle) });
    plan.kind = 'fix'; plan.title = 'Rebuild the launcher with more propellant margin';
    plan.rationale = why + ' The larger propellant load needs a wider vehicle, so it is built as a new revision; the original stays in the project for comparison. ' + plan.rationale;
    return plan;
  }
  return null;
}

/** Ideas when nothing failed but margins are thin. */
export function marginIdeas(analysis, vehicle) {
  const m = analysis.metrics; const ideas = [];
  if (m.lastStageReserveFrac != null) { if (m.lastStageReserveFrac < 0.02) ideas.push({ id: 'margin', text: `Only ${round(m.lastStageReserve, 0)} kg (${round(100 * m.lastStageReserveFrac, 1)}%) of the last stage's propellant was left when it was discarded, a thin margin. A real design keeps several percent for dispersions.` }); }
  else if (m.initialPropellant > 0 && m.finalPropellant / m.initialPropellant < 0.01) ideas.push({ id: 'margin', text: `Only ${round((100 * m.finalPropellant) / m.initialPropellant, 2)}% of the propellant (${round(m.finalPropellant, 0)} kg) was left, a very thin margin. A real design keeps several percent.` });
  if (m.maxStructRatio > 0.8) ideas.push({ id: 'structure', text: `Peak structural load reached ${round(100 * m.maxStructRatio, 0)}% of the limit.` });
  if (m.minBatteryFrac != null && m.minBatteryFrac < 0.3) ideas.push({ id: 'battery', text: `The battery fell to ${round(100 * m.minBatteryFrac, 0)}% charge.` });
  return ideas;
}
export { totalMass };
