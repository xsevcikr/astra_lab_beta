// Requirements management, verification against simulation results, traceability and change impact.
// A requirement binds to a metric produced by a physics run; it never takes a value typed into the UI.
export const STATUS = { PASS: 'PASS', FAIL: 'FAIL', MARGIN: 'MARGIN', UNKNOWN: 'UNKNOWN' };

// req: { id, text, metric, op: '<='|'>='|'<'|'>'|'==', threshold, unit, marginBand (fraction, default 0.1),
//        subsystem, components: [...], verification: 'analysis'|'simulation'|'test'|'inspection', parent, rationale }
export function makeRequirement(r) {
  for (const k of ['id', 'text', 'metric', 'op', 'threshold']) if (r[k] === undefined) throw new Error(`requirement ${r.id || '?'} missing ${k}`);
  if (!['<=', '>=', '<', '>', '=='].includes(r.op)) throw new Error(`requirement ${r.id} has invalid operator ${r.op}`);
  return { marginBand: 0.1, verification: 'simulation', components: [], ...r };
}

export function verify(req, results) {
  const v = results?.[req.metric];
  if (v === undefined || v === null || !Number.isFinite(v)) return { id: req.id, status: STATUS.UNKNOWN, value: null, margin: null, note: `No simulation result for ${req.metric} yet.` };
  const t = req.threshold;
  let pass, margin;
  switch (req.op) {
    case '<=': case '<': pass = req.op === '<=' ? v <= t : v < t; margin = (t - v) / (Math.abs(t) || 1); break;
    case '>=': case '>': pass = req.op === '>=' ? v >= t : v > t; margin = (v - t) / (Math.abs(t) || 1); break;
    case '==': pass = Math.abs(v - t) <= (req.tolerance ?? 1e-9); margin = -(Math.abs(v - t)) / (Math.abs(t) || 1); break;
  }
  const status = !pass ? STATUS.FAIL : margin < req.marginBand ? STATUS.MARGIN : STATUS.PASS;
  return { id: req.id, status, value: v, margin, note: status === STATUS.MARGIN ? `Passes with only ${(margin * 100).toFixed(1)}% margin (band ${(req.marginBand * 100).toFixed(0)}%).` : null };
}

// Probabilistic requirement against Monte Carlo output: e.g. P(success) >= 0.99 at 95% confidence (Wilson lower bound)
export function verifyProbability(req, mc) {
  if (!mc) return { id: req.id, status: STATUS.UNKNOWN, value: null, margin: null, note: 'Run a Monte Carlo analysis first.' };
  const lo = mc.successProbability.lo, p = mc.successProbability.p;
  const status = lo >= req.threshold ? STATUS.PASS : p >= req.threshold ? STATUS.MARGIN : STATUS.FAIL;
  return { id: req.id, status, value: p, lowerBound: lo, margin: p - req.threshold, note: status === STATUS.MARGIN ? `Estimate ${(p * 100).toFixed(1)}% meets ${(req.threshold * 100).toFixed(1)}% but the 95% lower bound ${(lo * 100).toFixed(1)}% does not: run more cases.` : null };
}

export function verifyAll(reqs, results, mc) {
  const rows = reqs.map((r) => ({ ...r, result: r.probabilistic ? verifyProbability(r, mc) : verify(r, results) }));
  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, rows.filter((r) => r.result.status === s).length]));
  return { rows, counts, allPass: counts.FAIL === 0 && counts.UNKNOWN === 0 };
}

// The Apollo-style lunar mission requirement set used by the integrated workflow.
export const LUNAR_REQUIREMENTS = [
  makeRequirement({ id: 'MR-1', text: 'The mission shall land crew on the Moon and return them safely to Earth.', metric: 'mission.success', op: '>=', threshold: 1, marginBand: 0, subsystem: 'system', components: [], verification: 'simulation' }),
  makeRequirement({ id: 'MR-2', text: 'Probability of mission success shall be at least 95% (95% confidence).', metric: 'mission.success', op: '>=', threshold: 0.95, probabilistic: true, subsystem: 'system', verification: 'analysis' }),
  makeRequirement({ id: 'PR-1', text: 'The third stage shall retain at least 100 m/s delta-v after trans-lunar injection.', metric: 'tli.dvMargin', op: '>=', threshold: 100, unit: 'm/s', subsystem: 'propulsion', components: ['s3.eng'], parent: 'MR-1' }),
  makeRequirement({ id: 'PR-2', text: 'The service module shall keep at least 10% propellant after trans-Earth injection.', metric: 'tei.propReserveFrac', op: '>=', threshold: 0.10, subsystem: 'propulsion', components: ['sps'], parent: 'MR-1' }),
  makeRequirement({ id: 'PR-3', text: 'The lander shall keep at least 5% descent propellant at touchdown.', metric: 'landing.propellantMarginFrac', op: '>=', threshold: 0.05, subsystem: 'propulsion', components: ['dps'], parent: 'MR-1' }),
  makeRequirement({ id: 'GN-1', text: 'Touchdown vertical speed shall be below 3.0 m/s.', metric: 'landing.touchdownVz', op: '<=', threshold: 3.0, unit: 'm/s', subsystem: 'gnc', components: ['lr', 'imu', 'pgns', 'dps'], parent: 'MR-1' }),
  makeRequirement({ id: 'GN-2', text: 'Touchdown horizontal speed shall be below 1.2 m/s.', metric: 'landing.touchdownVh', op: '<=', threshold: 1.2, unit: 'm/s', subsystem: 'gnc', components: ['lr', 'imu', 'pgns'], parent: 'MR-1' }),
  makeRequirement({ id: 'GN-3', text: 'Landing shall be within 1 km of the target site.', metric: 'landing.error', op: '<=', threshold: 1000, unit: 'm', subsystem: 'gnc', components: ['imu', 'lr', 'pgns'], parent: 'MR-1' }),
  makeRequirement({ id: 'CR-1', text: 'Crew acceleration shall not exceed 10 g in any phase.', metric: 'crew.maxG', op: '<=', threshold: 10, unit: 'g', subsystem: 'crew', components: ['heatshield'], parent: 'MR-1' }),
  makeRequirement({ id: 'ST-1', text: 'Launch structure shall keep a positive margin of at least 0.25 at the 1.4 ultimate factor.', metric: 'launch.minStructuralMargin', op: '>=', threshold: 0.25, subsystem: 'structures', components: ['sep12', 'sep23'], parent: 'MR-1' }),
  makeRequirement({ id: 'TH-1', text: 'At least 30% of the heat-shield ablator shall remain after entry.', metric: 'entry.ablatorMarginFrac', op: '>=', threshold: 0.30, subsystem: 'thermal', components: ['heatshield'], parent: 'MR-1' }),
  makeRequirement({ id: 'EP-1', text: 'Lander battery charge shall stay above 20% during surface operations.', metric: 'surface.minBatterySoc', op: '>=', threshold: 0.20, subsystem: 'power', components: ['batt'], parent: 'MR-1' }),
  makeRequirement({ id: 'CO-1', text: 'Earth link margin shall stay above 3 dB throughout the mission.', metric: 'comms.minLinkMarginDb', op: '>=', threshold: 3, unit: 'dB', subsystem: 'comms', components: ['sband', 'hga'], parent: 'MR-1' }),
  makeRequirement({ id: 'RV-1', text: 'At least 20% of rendezvous RCS propellant shall remain after docking.', metric: 'rendezvous.rcsMarginFrac', op: '>=', threshold: 0.20, subsystem: 'gnc', components: ['rcs'], parent: 'MR-1' }),
];

// Which simulations and telemetry channels produce each metric (traceability: requirement -> simulation -> telemetry)
export const METRIC_SOURCES = {
  'mission.success': { simulation: 'lunar-mission', telemetry: ['phase'] },
  'tli.dvMargin': { simulation: 'impulsive-burn (TLI)', telemetry: ['propellant'] },
  'tei.propReserveFrac': { simulation: 'impulsive-burn (TEI)', telemetry: ['propellant'] },
  'landing.propellantMarginFrac': { simulation: 'powered-descent', telemetry: ['propellant'] },
  'landing.touchdownVz': { simulation: 'powered-descent', telemetry: ['verticalSpeed', 'altitude'] },
  'landing.touchdownVh': { simulation: 'powered-descent', telemetry: ['horizontalSpeed'] },
  'landing.error': { simulation: 'powered-descent', telemetry: ['downrangeToGo', 'navErrorDownrange'] },
  'crew.maxG': { simulation: 'ascent, descent, entry', telemetry: ['accelerationG'] },
  'launch.minStructuralMargin': { simulation: 'ascent', telemetry: ['structuralMargin', 'dynamicPressure'] },
  'entry.ablatorMarginFrac': { simulation: 'entry', telemetry: ['ablatorUsed', 'heatShieldTemp'] },
  'surface.minBatterySoc': { simulation: 'surface-subsystems', telemetry: ['batterySoc'] },
  'comms.minLinkMarginDb': { simulation: 'coast/surface link budget', telemetry: ['linkMargin'] },
  'rendezvous.rcsMarginFrac': { simulation: 'rendezvous', telemetry: ['rcsPropellant'] },
};

export function traceabilityMatrix(reqs, vehicles, verification, tests = []) {
  const compIndex = new Map();
  for (const v of vehicles) for (const c of v.components || []) compIndex.set(c.id, { ...c, vehicle: v.name });
  return reqs.map((r) => {
    const src = METRIC_SOURCES[r.metric] || { simulation: 'unassigned', telemetry: [] };
    const vr = verification?.rows.find((x) => x.id === r.id)?.result;
    return { requirement: r.id, text: r.text, subsystem: r.subsystem, components: r.components.map((id) => compIndex.get(id)?.name || `${id} (not in any vehicle)`), simulation: src.simulation, telemetry: src.telemetry,
      tests: tests.filter((t) => (t.requirements || []).includes(r.id)).map((t) => `${t.id}: ${t.status}`), status: vr?.status ?? STATUS.UNKNOWN, value: vr?.value ?? null };
  });
}

// Change impact: given two vehicle versions, which components changed and which requirements need re-verification.
export function changeImpact(oldV, newV, reqs) {
  const changed = new Set();
  const diffs = diffObjects(oldV, newV);
  for (const d of diffs) {
    const m = d.path.match(/^stages\.(\d+)/);
    if (m) { const st = oldV.stages[+m[1]] || newV.stages[+m[1]]; for (const c of [...(oldV.components || []), ...(newV.components || [])]) if (c.stage === +m[1] || (c.id || '').startsWith(st.id)) changed.add(c.id); }
    const c = d.path.match(/^components\.(\d+)/);
    if (c) changed.add((newV.components[+c[1]] || oldV.components[+c[1]]).id);
    if (d.path.startsWith('payload')) changed.add('payload');
  }
  const affected = reqs.filter((r) => r.components.some((id) => changed.has(id)) || r.subsystem === 'system' || (changed.has('payload') && ['propulsion', 'gnc'].includes(r.subsystem)));
  return { diffs, changedComponents: [...changed], retest: affected.map((r) => ({ id: r.id, text: r.text, reason: r.subsystem === 'system' ? 'system-level requirement' : `traces to changed ${r.components.filter((id) => changed.has(id)).join(', ') || 'mass properties'}` })) };
}

export function diffObjects(a, b, path = '') {
  const out = [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) { if (a !== b) out.push({ path: path.slice(1), from: a, to: b }); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) out.push(...diffObjects(a[k], b[k], `${path}.${k}`));
  return out;
}
