// Reliability engineering: exponential component failure model, k-of-n redundancy, fault trees with
// minimal cut sets, Birnbaum importance, single-point-failure detection and automatic FMEA.
// Failure rates are generic order-of-magnitude values (APPROXIMATION); the probability algebra is exact for
// independent failures.
import { MODEL, tagged } from '../core/provenance.js';

export const componentReliability = (lambdaPerHour, hours) => Math.exp(-lambdaPerHour * hours);
// probability that at least k of n identical units survive
export function kOfN(r, n, k) {
  let p = 0;
  for (let i = k; i <= n; i++) p += binom(n, i) * r ** i * (1 - r) ** (n - i);
  return p;
}
function binom(n, k) { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; }

// Mission reliability for a vehicle: each component exposed for its phase hours (default whole mission).
export function vehicleReliability(vehicle, { missionHours = 200, exposure = {} } = {}) {
  const rows = (vehicle.components || []).map((c) => {
    const hours = exposure[c.id] ?? exposure[c.subsystem] ?? missionHours;
    const r1 = componentReliability(c.failureRate, hours);
    const n = c.redundancy?.n ?? 1, k = c.redundancy?.k ?? 1;
    const r = kOfN(r1, n, k);
    return { id: c.id, name: c.name, subsystem: c.subsystem, critical: c.critical !== false, n, k, unitReliability: r1, reliability: r, failureProbability: 1 - r, singlePointFailure: c.critical !== false && n - k === 0 && !c.backupOf && !(vehicle.components || []).some((o) => o.backupOf === c.id) };
  });
  const critical = rows.filter((r) => r.critical);
  const R = critical.reduce((a, r) => a * r.reliability, 1);
  // criticality = share of total unreliability (Birnbaum importance for a series system ~ R / R_i)
  for (const r of rows) r.importance = r.critical ? (R / r.reliability) * (1 - r.reliability) / Math.max(1e-12, 1 - R) : 0;
  rows.sort((a, b) => b.importance - a.importance);
  return tagged(MODEL.APPROXIMATION, 'Independent exponential failures; common-cause failures are not modelled.', { missionReliability: R, failureProbability: 1 - R, components: rows, singlePointFailures: rows.filter((r) => r.singlePointFailure) });
}

// Redundancy trade: what adding units does to mass, power, reliability and complexity.
export function redundancyTrade(component, hours, maxUnits = 4) {
  const r1 = componentReliability(component.failureRate, hours);
  return Array.from({ length: maxUnits }, (_, i) => {
    const n = i + 1;
    return { units: n, reliability: kOfN(r1, n, component.redundancy?.k ?? 1), mass: component.mass * n + (n > 1 ? 0.15 * component.mass : 0), power: (component.power || 0) * n, complexity: n + (n > 1 ? 1 : 0) };
  });
}

// ---- Fault tree ----
// node: { id, label, gate: 'OR'|'AND'|'KOFN', k?, children: [...] } or basic event { id, label, p }
export function evaluateFaultTree(node, overrides = {}) {
  if (!node.children) return overrides[node.id] ?? node.p;
  const ps = node.children.map((c) => evaluateFaultTree(c, overrides));
  if (node.gate === 'AND') return ps.reduce((a, p) => a * p, 1);
  if (node.gate === 'OR') return 1 - ps.reduce((a, p) => a * (1 - p), 1);
  if (node.gate === 'KOFN') { // fails if at least k children fail (identical p approximation uses actual product terms)
    const n = ps.length, k = node.k; let total = 0;
    for (let mask = 0; mask < 1 << n; mask++) { let bits = 0, pr = 1; for (let i = 0; i < n; i++) { if (mask & (1 << i)) { bits++; pr *= ps[i]; } else pr *= 1 - ps[i]; } if (bits >= k) total += pr; }
    return total;
  }
  throw new Error(`unknown gate ${node.gate}`);
}
export function minimalCutSets(node) {
  if (!node.children) return [[node.id]];
  const sets = node.children.map(minimalCutSets);
  let out;
  if (node.gate === 'OR') out = sets.flat();
  else if (node.gate === 'AND') out = sets.reduce((acc, s) => acc.flatMap((a) => s.map((b) => [...new Set([...a, ...b])])), [[]]);
  else { // KOFN: combinations of k children
    const combos = []; const n = sets.length;
    const rec = (start, chosen) => { if (chosen.length === node.k) { combos.push(chosen.reduce((acc, i) => acc.flatMap((a) => sets[i].map((b) => [...new Set([...a, ...b])])), [[]])); return; } for (let i = start; i < n; i++) rec(i + 1, [...chosen, i]); };
    rec(0, []); out = combos.flat();
  }
  out = out.map((s) => s.sort());
  return out.filter((s, i) => !out.some((o, j) => j !== i && o.length < s.length && o.every((x) => s.includes(x))) && out.findIndex((o) => o.join() === s.join()) === i);
}
export function birnbaum(tree, basicIds) {
  return basicIds.map((id) => ({ id, importance: evaluateFaultTree(tree, { [id]: 1 }) - evaluateFaultTree(tree, { [id]: 0 }) })).sort((a, b) => b.importance - a.importance);
}

// Build a fault tree for "loss of mission" from a vehicle's component list, grouping by subsystem.
export function faultTreeFromVehicle(vehicle, hours = 200) {
  const groups = {};
  for (const c of vehicle.components || []) {
    if (c.critical === false) continue;
    const p1 = 1 - componentReliability(c.failureRate, hours);
    const n = c.redundancy?.n ?? 1, k = c.redundancy?.k ?? 1;
    const backup = (vehicle.components || []).find((o) => o.backupOf === c.id);
    let node;
    if (n === 1 && !backup) node = { id: c.id, label: c.name, p: p1 };
    else if (backup) node = { id: `${c.id}+backup`, label: `${c.name} and backup`, gate: 'AND', children: [{ id: c.id, label: c.name, p: p1 }, { id: backup.id, label: backup.name, p: 1 - componentReliability(backup.failureRate, hours) }] };
    else node = { id: `${c.id}xN`, label: `${c.name} (${k} of ${n} needed)`, gate: 'KOFN', k: n - k + 1, children: Array.from({ length: n }, (_, i) => ({ id: `${c.id}#${i + 1}`, label: `${c.name} #${i + 1}`, p: p1 })) };
    (groups[c.subsystem] ||= []).push(node);
  }
  return { id: 'mission-loss', label: 'Loss of mission', gate: 'OR', children: Object.entries(groups).map(([sub, ch]) => ({ id: `${sub}-failure`, label: `${sub} failure`, gate: 'OR', children: ch })) };
}

// ---- FMEA ----
const MODES = {
  propulsion: [['Fails to ignite', 'Igniter or valve failure', 'Loss of the burn', 9, 3], ['Thrust shortfall', 'Turbopump or injector degradation', 'Underperformance, reduced delta-v margin', 7, 4], ['Uncontained failure', 'Combustion instability', 'Loss of vehicle', 10, 6]],
  avionics: [['Processor reset', 'Radiation upset or software fault', 'Temporary loss of control', 7, 2], ['Permanent failure', 'Hardware failure', 'Loss of guidance', 9, 2]],
  gnc: [['Sensor bias or drift', 'Calibration error, ageing', 'Navigation error grows', 6, 5], ['Sensor dropout', 'Connector or electronics failure', 'Loss of measurement', 7, 3]],
  power: [['Capacity loss', 'Cell degradation', 'Reduced mission time, load shedding', 6, 3], ['Short circuit', 'Insulation damage', 'Bus loss', 8, 4]],
  comms: [['Link loss', 'Pointing error or transmitter failure', 'No telemetry or commands', 5, 3]],
  structures: [['Separation failure', 'Pyrotechnic or mechanism failure', 'Stage cannot separate: loss of mission', 10, 6]],
  thermal: [['Over-temperature', 'Radiator degradation, attitude', 'Component damage', 7, 3], ['Heat shield burn-through', 'Ablator flaw, steep entry', 'Loss of crew', 10, 7]],
  eclss: [['Oxygen leak', 'Seal or tank failure', 'Consumables depleted early', 10, 4]],
  recovery: [['Parachute fails to open', 'Deployment mechanism', 'High-speed impact unless redundant chutes', 10, 5]],
};
// Severity, occurrence and detection on 1-10 scales; RPN = S x O x D.
export function generateFMEA(vehicle, { missionHours = 200 } = {}) {
  const rel = vehicleReliability(vehicle, { missionHours });
  const rows = [];
  for (const c of vehicle.components || []) {
    const r = rel.components.find((x) => x.id === c.id);
    const occ = Math.max(1, Math.min(10, Math.round(10 + Math.log10(Math.max(1e-9, r.failureProbability)) * 1.5)));
    for (const [mode, cause, effect, sev0, det] of MODES[c.subsystem] || [['Failure', 'Unspecified', 'Loss of function', 6, 5]]) {
      const sev = c.critical === false ? Math.max(1, sev0 - 4) : r.n - r.k > 0 ? Math.max(1, sev0 - 2) : sev0;
      const rpn = sev * occ * det;
      rows.push({ component: c.name, componentId: c.id, subsystem: c.subsystem, failureMode: mode, cause, effect, severity: sev, occurrence: occ, detection: det, rpn,
        risk: rpn >= 200 || sev >= 9 && occ >= 4 ? 'HIGH' : rpn >= 80 ? 'MEDIUM' : 'LOW',
        mitigation: r.singlePointFailure ? `Add redundancy (currently single string) or qualify to lower failure rate` : r.n > 1 ? `Redundant (${r.k} of ${r.n}); verify failure detection and switchover` : 'Inspect and test before flight' });
    }
  }
  return tagged(MODEL.APPROXIMATION, 'Generic failure-mode library scored from component reliability; review with subsystem engineers.', { rows: rows.sort((a, b) => b.rpn - a.rpn) });
}
