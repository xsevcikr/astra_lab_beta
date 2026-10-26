// Automated design review: rule-based checks that actively search for engineering problems.
// Each finding cites the calculated evidence; the reviewer never returns an empty "looks good" without
// listing which checks were run and passed.
import { performance, massBudget, stageDeltaV, validateVehicle } from '../vehicle/model.js';
import { vehicleReliability } from '../reliability/reliability.js';
import { G0 } from '../core/constants.js';

export function designReview(vehicle, { dvRequired, body = 'earth', missionHours = 100, sim } = {}) {
  const findings = [], passed = [];
  const add = (severity, area, title, evidence, recommendation) => findings.push({ severity, area, title, evidence, recommendation });
  const ok = (area, text) => passed.push({ area, text });
  const errors = validateVehicle(vehicle);
  for (const e of errors) add('critical', 'definition', 'Invalid vehicle definition', e, 'Fix the definition before analysis.');
  if (errors.length) return { findings, passed };
  const perf = performance(vehicle), mb = massBudget(vehicle), st = stageDeltaV(vehicle);
  const g = body === 'moon' ? 1.62 : body === 'mars' ? 3.71 : G0;
  const twr = vehicle.stages[0].engines.reduce((a, e) => a + e.thrustVac * (e.count ?? 1), 0) / (mb.gross * g);
  if (dvRequired) {
    const margin = perf.totalDv / dvRequired - 1;
    if (margin < 0) add('critical', 'propulsion', 'Insufficient delta-v', `Ideal ${perf.totalDv.toFixed(0)} m/s vs required ${dvRequired.toFixed(0)} m/s (${(margin * 100).toFixed(1)}%).`, 'Add propellant, raise Isp, reduce dry mass or add a stage.');
    else if (margin < 0.05) add('major', 'propulsion', 'Thin delta-v margin', `Only ${(margin * 100).toFixed(1)}% above the requirement before dispersions.`, 'Target at least 5% ideal delta-v margin, then confirm with Monte Carlo.');
    else ok('propulsion', `Delta-v margin ${(margin * 100).toFixed(1)}%.`);
  }
  if (vehicle.kind === 'rocket' && body !== 'moon') {
    if (twr < 1.15) add(twr < 1 ? 'critical' : 'major', 'propulsion', 'Low liftoff thrust-to-weight', `Liftoff T/W ${twr.toFixed(2)} (vacuum thrust).`, 'Aim for 1.2-1.5 to limit gravity losses.');
    else if (twr > 2.2) add('minor', 'structures', 'High liftoff thrust-to-weight', `T/W ${twr.toFixed(2)} raises max-q and loads.`, 'Throttle down through max-q or reduce first-stage thrust.');
    else ok('propulsion', `Liftoff T/W ${twr.toFixed(2)}.`);
  }
  st.forEach((s, i) => {
    if (s.twrEnd > 5) add('major', 'crew', `Stage ${i + 1} burnout acceleration high`, `${s.twrEnd.toFixed(1)} g at burnout.`, 'Throttle down or shut down engines near burnout.');
    if (i > 0 && s.twrStart < 0.4 && vehicle.kind === 'rocket') add('major', 'propulsion', `Stage ${i + 1} underpowered`, `Ignition T/W ${s.twrStart.toFixed(2)} causes gravity losses.`, 'Increase upper-stage thrust or loft the trajectory.');
    const sf = vehicle.stages[i].dryMass / (vehicle.stages[i].dryMass + vehicle.stages[i].propMass);
    if (sf > 0.15) add('major', 'structures', `Stage ${i + 1} structural fraction high`, `Dry mass is ${(sf * 100).toFixed(1)}% of stage mass.`, 'Lighter tanks, common bulkheads or composite structure.');
    else if (sf < 0.04) add('major', 'structures', `Stage ${i + 1} structural fraction implausibly low`, `${(sf * 100).toFixed(1)}% is beyond current technology.`, 'Check dry mass; real stages are 5-12%.');
  });
  // staging balance: ideal split for similar Isp is roughly equal delta-v per stage
  if (st.length > 1) {
    const dvs = st.map((s) => s.dv), mx = Math.max(...dvs), mn = Math.min(...dvs);
    if (mx / mn > 2.5) add('minor', 'propulsion', 'Unbalanced staging', `Stage delta-v ranges ${mn.toFixed(0)} to ${mx.toFixed(0)} m/s.`, 'Re-split propellant between stages to reduce gross mass for the same payload.');
  }
  // center of mass vs aerodynamic stability (rockets in atmosphere)
  if (vehicle.aero?.finArea === 0 && vehicle.kind === 'rocket' && body === 'earth') ok('gnc', 'No fins: stability relies on thrust-vector control (gimbal present).');
  for (const s of vehicle.stages) if (vehicle.kind === 'rocket' && s.engines.every((e) => !e.gimbalDeg)) add('critical', 'gnc', `${s.name} has no attitude control authority`, 'No engine gimbal declared.', 'Add gimbal, vernier engines or RCS roll control.');
  // reliability
  const rel = vehicleReliability(vehicle, { missionHours });
  for (const s of rel.singlePointFailures) add(s.subsystem === 'propulsion' ? 'major' : 'minor', 'reliability', `Single-point failure: ${s.name}`, `Failure probability ${(s.failureProbability * 100).toFixed(2)}% over ${missionHours} h with no redundancy.`, 'Add redundancy or a backup mode; record the accepted risk if not.');
  if (rel.missionReliability < 0.95) add('major', 'reliability', 'Low predicted reliability', `Series reliability ${(rel.missionReliability * 100).toFixed(1)}%.`, 'Attack the top contributors in the importance ranking.');
  else ok('reliability', `Predicted reliability ${(rel.missionReliability * 100).toFixed(2)}%.`);
  // power / thermal / comms if systems are defined
  const sys = vehicle.systems;
  if (sys?.power) {
    const load = sys.power.loads.reduce((a, l) => a + l.power, 0), gen = (sys.power.fuelCellW || 0) + 1361 * (sys.power.solarArea || 0) * (sys.power.solarEfficiency || 0.28) * 0.7;
    const hours = sys.power.batteryWh / Math.max(1, load - gen);
    if (gen < load && hours < 24) add('major', 'power', 'Power deficit', `Generation ${gen.toFixed(0)} W vs load ${load.toFixed(0)} W; battery lasts ${hours.toFixed(1)} h.`, 'Add generation or battery capacity, or shed loads.');
    else ok('power', `Generation ${gen.toFixed(0)} W vs load ${load.toFixed(0)} W.`);
  }
  if (sys?.thermal && sys.thermal.radiatorArea < 2 && sys.power && sys.power.loads.reduce((a, l) => a + l.power, 0) > 1000) add('major', 'thermal', 'Radiator undersized', `${sys.thermal.radiatorArea} m^2 for more than 1 kW of dissipation.`, 'About 2-3 m^2 per kW at 300 K.');
  if (sys?.comms && sys.comms.antennaGainDb < 10) add('minor', 'comms', 'Low antenna gain', `${sys.comms.antennaGainDb} dBi limits data rate beyond lunar distance.`, 'Add a high-gain antenna for cruise.');
  // simulation evidence, if provided
  if (sim && !sim.success) add('critical', 'simulation', 'Simulation failed', sim.text, 'Diagnose the failure in the replay before redesigning.');
  if (sim?.minStructuralMargin !== undefined && sim.minStructuralMargin < 0.25) add(sim.minStructuralMargin < 0 ? 'critical' : 'major', 'structures', 'Low structural margin in flight', `Minimum margin ${(sim.minStructuralMargin * 100).toFixed(0)}%.`, 'Thicken the governing section or reduce max-q.');
  const order = { critical: 0, major: 1, minor: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, passed, checksRun: findings.length + passed.length, verdict: findings.some((f) => f.severity === 'critical') ? 'NOT READY' : findings.some((f) => f.severity === 'major') ? 'READY WITH ACTIONS' : 'NO MAJOR FINDINGS' };
}
