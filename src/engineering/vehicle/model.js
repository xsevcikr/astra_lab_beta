// Vehicle definition and static engineering calculations (mass budget, delta-v, TWR).
// Stages are listed in firing order: stages[0] burns first. Payload sits on top of the last stage.
import { G0 } from '../core/constants.js';
import { MODEL, tagged } from '../core/provenance.js';

export function engineThrust(e, pressure = 0) {
  // thrust rises with lower ambient pressure: F = F_vac - p_a * A_e (PHYSICS for a fixed nozzle)
  const exitArea = e.exitArea ?? (e.ispSL && e.ispSL < e.ispVac ? (e.thrustVac * (1 - e.ispSL / e.ispVac)) / 101325 : 0);
  return Math.max(0, e.thrustVac - pressure * exitArea) * (e.count ?? 1);
}
export function engineIsp(e, pressure = 0) {
  const f = engineThrust({ ...e, count: 1 }, pressure);
  return e.ispVac * (f / e.thrustVac);
}
export const stageThrustVac = (s) => s.engines.reduce((a, e) => a + e.thrustVac * (e.count ?? 1), 0);
export function stageIspVac(s) {
  // thrust-weighted mass flow average
  let F = 0, mdot = 0;
  for (const e of s.engines) { const n = e.count ?? 1; F += e.thrustVac * n; mdot += (e.thrustVac * n) / (e.ispVac * G0); }
  return mdot > 0 ? F / (mdot * G0) : 0;
}
export const stageMdot = (s) => s.engines.reduce((a, e) => a + (e.thrustVac * (e.count ?? 1)) / (e.ispVac * G0), 0);

export function validateVehicle(v) {
  const errors = [];
  if (!v || !Array.isArray(v.stages) || v.stages.length === 0) errors.push('vehicle needs at least one stage');
  (v?.stages || []).forEach((s, i) => {
    if (!(s.dryMass > 0)) errors.push(`stage ${i + 1} dry mass must be positive`);
    if (!(s.propMass >= 0)) errors.push(`stage ${i + 1} propellant mass must be zero or more`);
    if (!s.engines?.length) errors.push(`stage ${i + 1} has no engines`);
    for (const e of s.engines || []) {
      if (!(e.thrustVac > 0)) errors.push(`stage ${i + 1} engine ${e.id || ''} thrust must be positive`);
      if (!(e.ispVac > 50 && e.ispVac < 10000)) errors.push(`stage ${i + 1} engine ${e.id || ''} Isp ${e.ispVac} s is outside 50-10000 s`);
    }
  });
  if (!(v?.payload?.mass >= 0)) errors.push('payload mass must be zero or more');
  return errors;
}

export function massBudget(v) {
  const comp = v.components || [];
  const rows = v.stages.map((s, i) => ({ item: s.name || `Stage ${i + 1}`, dry: s.dryMass, prop: s.propMass, total: s.dryMass + s.propMass }));
  rows.push({ item: 'Payload', dry: v.payload.mass, prop: 0, total: v.payload.mass });
  const gross = rows.reduce((a, r) => a + r.total, 0);
  const dry = rows.reduce((a, r) => a + r.dry, 0);
  return tagged(MODEL.PHYSICS, 'Sum of declared masses.', {
    rows, gross, dry, prop: gross - dry,
    componentMass: comp.reduce((a, c) => a + (c.mass || 0) * (c.redundancy?.n || 1), 0),
    payloadFraction: v.payload.mass / gross,
  });
}

// Ideal (vacuum, no losses) delta-v per stage using the Tsiolkovsky equation.
export function stageDeltaV(v, payloadOverride) {
  const payload = payloadOverride ?? v.payload.mass;
  const out = [];
  for (let i = 0; i < v.stages.length; i++) {
    const above = v.stages.slice(i + 1).reduce((a, s) => a + s.dryMass + s.propMass, 0) + payload;
    const s = v.stages[i];
    const m0 = s.dryMass + s.propMass + above, mf = s.dryMass + above;
    const isp = stageIspVac(s);
    const thrust = stageThrustVac(s);
    out.push({
      stage: s.name || `Stage ${i + 1}`, m0, mf, isp, thrust,
      dv: isp * G0 * Math.log(m0 / mf),
      burnTime: s.propMass / stageMdot(s),
      twrStart: thrust / (m0 * G0), twrEnd: thrust / (mf * G0),
      massRatio: m0 / mf,
    });
  }
  return out;
}

export function performance(v, opts = {}) {
  const st = stageDeltaV(v, opts.payload);
  const mb = massBudget(v);
  const s0 = v.stages[0];
  const liftoffThrust = s0.engines.reduce((a, e) => a + engineThrust(e, 101325), 0);
  return tagged(MODEL.PHYSICS, 'Ideal rocket equation, no gravity or drag losses.', {
    stages: st,
    totalDv: st.reduce((a, s) => a + s.dv, 0),
    gross: mb.gross, dry: mb.dry,
    liftoffTwr: liftoffThrust / (mb.gross * (opts.g ?? G0)),
    maxAccelG: Math.max(...st.map((s) => s.twrEnd)),
  });
}

// Largest payload for a required ideal delta-v (bisection).
export function maxPayloadFor(v, dvRequired) {
  let lo = 0, hi = v.stages.reduce((a, s) => a + s.propMass, 0);
  const dvAt = (p) => stageDeltaV(v, p).reduce((a, s) => a + s.dv, 0);
  if (dvAt(0) < dvRequired) return 0;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (dvAt(m) >= dvRequired) lo = m; else hi = m; }
  return lo;
}

export const cloneVehicle = (v) => JSON.parse(JSON.stringify(v));

// Resolve a dotted path like "stages.0.engines.0.thrustVac" on a vehicle (used by sweeps, MC and AI tools).
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) throw new Error(`path ${path} does not exist at ${keys[i]}`);
    o = o[keys[i]];
  }
  if (!(keys[keys.length - 1] in o)) throw new Error(`path ${path} does not exist`);
  o[keys[keys.length - 1]] = value;
  return obj;
}
