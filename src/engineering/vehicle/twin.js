// Digital twin: one live record per vehicle, written only by simulation modules. Every field remembers which
// module wrote it, under which model label, and when. Fields that stop being updated are reported as stale
// instead of silently showing old values. Nothing in here invents numbers.
const FIELDS = ['position', 'velocity', 'acceleration', 'orientation', 'angularVelocity', 'mass', 'propellant', 'temperature', 'pressure', 'power', 'battery', 'communications', 'structure', 'engines', 'sensors', 'computer', 'software', 'faults', 'missionPhase', 'components', 'configuration'];

export function configHash(obj) {
  const s = JSON.stringify(obj);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class DigitalTwin {
  constructor(vehicle, { staleAfter = 30, historyLimit = 5000 } = {}) {
    this.id = vehicle.id; this.name = vehicle.name;
    this.fields = {}; this.meta = {};
    this.staleAfter = staleAfter; this.history = []; this.historyLimit = historyLimit; this.t = 0;
    this.write('configuration', 0, { vehicleId: vehicle.id, version: vehicle.version, hash: configHash(vehicle), stages: vehicle.stages.length }, 'vehicle-definition', 'physics');
    this.write('components', 0, (vehicle.components || []).map((c) => ({ id: c.id, name: c.name, subsystem: c.subsystem, status: 'nominal', operatingHours: 0, cycles: 0, failureRate: c.failureRate, lifeUsedFrac: 0, ratedLifeHours: c.ratedLifeHours ?? 1 / Math.max(c.failureRate || 1e-6, 1e-9) / 10 })), 'vehicle-definition', 'physics');
    this.write('faults', 0, [], 'twin', 'physics');
  }
  write(field, t, value, source, model = 'physics') {
    if (!FIELDS.includes(field)) throw new Error(`digital twin has no field ${field}`);
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`refusing to store non-finite ${field} from ${source}`);
    this.fields[field] = value; this.meta[field] = { t, source, model };
    this.t = Math.max(this.t, t);
  }
  // Merge a frame from a simulation module: { field: value } pairs.
  ingest(source, t, frame, model = 'physics') {
    for (const [k, v] of Object.entries(frame)) if (v !== undefined) this.write(k, t, v, source, model);
    this.ageComponents(t);
    if (this.history.length >= this.historyLimit) this.history.splice(0, Math.ceil(this.historyLimit / 10));
    this.history.push({ t, frame: JSON.parse(JSON.stringify(frame)), source });
  }
  ageComponents(t) {
    const dt = t - (this._lastAge ?? t); this._lastAge = t;
    if (dt <= 0) return;
    for (const c of this.fields.components) if (c.status !== 'failed') { c.operatingHours += dt / 3600; c.lifeUsedFrac = c.operatingHours / c.ratedLifeHours; }
  }
  fault(t, componentId, description, severity = 'critical') {
    const c = this.fields.components.find((x) => x.id === componentId);
    if (c) c.status = severity === 'critical' ? 'failed' : 'degraded';
    this.fields.faults.push({ t, component: componentId, description, severity });
    this.meta.faults = { t, source: 'fault-injection', model: 'physics' };
  }
  get(field) {
    const m = this.meta[field];
    if (!m) return { value: null, status: 'unknown', note: 'No simulation module has produced this value.' };
    const stale = this.t - m.t > this.staleAfter && !['configuration', 'components', 'faults'].includes(field);
    return { value: this.fields[field], status: stale ? 'stale' : 'live', ...m };
  }
  snapshot() { const out = {}; for (const f of FIELDS) out[f] = this.get(f); return { id: this.id, t: this.t, fields: out }; }
  coverage() { const s = this.snapshot().fields; return Object.fromEntries(FIELDS.map((f) => [f, s[f].status])); }
}
export const TWIN_FIELDS = FIELDS;
