// Undo / redo / version history over JSON snapshots of the design state (vehicles, missions, environment).
// - Every committed design change is one snapshot (automatic). A change that leaves the design identical to the current snapshot is NOT stored again (dedupe).
// - Named versions ("keep this one") are never dropped by the size cap. The cap removes the oldest unnamed snapshots first.
// - Snapshots that fall off the redo branch (undo, then a new change) are kept in `branches` so the version list never loses work.
// - Restoring any version (also from a branch) is a NEW step on top of the list: nothing is destroyed and the restore itself can be undone.
import { analyzeVehicle } from '../vehicles/analysis.js';

export class History {
  constructor({ limit = 200, branchLimit = 100 } = {}) { this.limit = limit; this.branchLimit = branchLimit; this.stack = []; this.branches = []; this.index = -1; this.counter = 0; }

  /** Record the state *after* a change. `label` is what the user sees in the version list. Returns the version number (the existing one when nothing changed). */
  push(state, label, meta = {}) {
    const json = JSON.stringify(state);
    const cur = this.stack[this.index];
    if (cur && cur.state === json && this.index === this.stack.length - 1 && !meta.force) return cur.n;   // dedupe: nothing changed
    const dropped = this.stack.splice(this.index + 1);                                                        // the redo branch is archived, not deleted
    if (dropped.length) { this.branches.push(...dropped); if (this.branches.length > this.branchLimit) this._trim(this.branches, this.branches.length - this.branchLimit); }
    this.stack.push({ n: ++this.counter, label, ts: new Date().toISOString(), meta, state: json });
    this.index = this.stack.length - 1;
    if (this.stack.length > this.limit) this._trim(this.stack, this.stack.length - this.limit);
    return this.stack[this.index].n;
  }
  /** Remove `count` oldest unnamed entries (never the current one); named versions stay. */
  _trim(list, count) {
    const cur = this.stack[this.index];
    for (let i = 0; i < list.length && count > 0;) { const e = list[i]; if (e.name || e === cur) { i++; continue; } list.splice(i, 1); count--; }
    this.index = this.stack.indexOf(cur);
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  undo() { if (!this.canUndo) return null; this.index--; return this._at(this.index); }
  redo() { if (!this.canRedo) return null; this.index++; return this._at(this.index); }
  /** Jump to an earlier snapshot (moves the pointer; later snapshots stay for redo). Prefer restoreAsNew for the version list. */
  restore(n) { const i = this.stack.findIndex((e) => e.n === n); if (i < 0) return null; this.index = i; return this._at(i); }
  _find(n) { return this.stack.find((e) => e.n === n) ?? this.branches.find((e) => e.n === n) ?? null; }
  _at(i) { const e = this.stack[i]; return { n: e.n, label: e.label, state: JSON.parse(e.state) }; }
  /** The stored design state of version n (a deep copy), also for archived ones. */
  stateOf(n) { const e = this._find(n); return e ? JSON.parse(e.state) : null; }
  /**
   * Restore version n as a NEW step on top of the list. Returns {n: newVersion, from: n, label, state} (apply `state` to the project) or null.
   * Restoring a version identical to the current design adds nothing and returns {unchanged: true}.
   */
  restoreAsNew(n, label) {
    const e = this._find(n); if (!e) return null;
    const lab = label ?? `Restored “${e.name ?? e.label}” (v${e.n})`;
    const state = JSON.parse(e.state);
    const before = this.counter;
    const nn = this.push(state, lab, { restoredFrom: e.n });
    return { n: nn, from: e.n, label: lab, state, unchanged: this.counter === before };
  }
  /** Give a version a name (it is then protected from the size cap). An empty name removes the name. */
  name(n, name) { const e = this._find(n); if (!e) return false; const s = String(name ?? '').trim().slice(0, 80); if (s) e.name = s; else delete e.name; return true; }
  list({ branches = false } = {}) {
    const row = (e, i, branch) => ({ n: e.n, label: e.label, name: e.name ?? null, ts: e.ts, current: !branch && i === this.index, branch, meta: e.meta });
    const rows = this.stack.map((e, i) => row(e, i, false));
    if (branches) rows.push(...this.branches.map((e) => row(e, -1, true)));
    return rows.sort((a, b) => a.n - b.n);
  }
  toJSON() { return { counter: this.counter, index: this.index, stack: this.stack, branches: this.branches }; }
  static fromJSON(j) { const h = new History(); if (j) { h.counter = j.counter ?? 0; h.index = j.index ?? -1; h.stack = j.stack ?? []; h.branches = j.branches ?? []; } return h; }
}

// ------------------------------------------------------------------------------------------------ summaries and comparison
const vehicleOf = (s) => (s?.vehicles ? s.vehicles[s.activeVehicle] ?? Object.values(s.vehicles)[0] ?? null : null);
const missionOf = (s) => (s?.missions ? s.missions[s.activeMission] ?? Object.values(s.missions)[0] ?? null : null);
const partLabel = (c) => c.name ?? c.catalogId ?? c.kind;
const PART_PROPS = ['count', 'mass', 'thrustVac', 'ispVac', 'propellantMass', 'fill', 'group', 'diameter', 'length'];

/** Key numbers of a design snapshot, computed with the real static analysis (not stored, not invented). Missing values are null. */
export function summarizeState(state) {
  const v = vehicleOf(state), m = missionOf(state);
  const out = { vehicle: v?.name ?? null, type: v?.type ?? null, mission: m?.name ?? null, parts: v?.components?.length ?? 0, mass: null, deltaV: null, twr: null, payload: null, stages: null };
  if (!v) return out;
  try {
    const a = analyzeVehicle(v, { body: m?.environment?.body ?? v.meta?.body ?? state.environment?.body ?? 'earth' });
    out.mass = Number.isFinite(a.totalMass) ? a.totalMass : null;
    out.deltaV = a.dvVacuum > 0 ? a.dvVacuum : null;
    out.twr = a.liftoffTWR > 0 ? a.liftoffTWR : null;
    out.payload = a.payloadMass > 0 ? a.payloadMass : null;
    out.stages = a.stages.length;
  } catch { /* leave the numbers empty: some designs cannot be analysed */ }
  return out;
}

/**
 * Compare two snapshots. Returns {parts:{added,removed,changed}, numbers:[{key,label,unit,a,b,delta}], mission:[strings], vehicleChanged}.
 * Parts are matched by id. All numbers come from summarizeState / the stored parts.
 */
export function diffStates(a, b) {
  const va = vehicleOf(a), vb = vehicleOf(b);
  const ca = new Map((va?.components ?? []).map((c) => [c.id, c])), cb = new Map((vb?.components ?? []).map((c) => [c.id, c]));
  const added = [], removed = [], changed = [];
  for (const [id, c] of cb) if (!ca.has(id)) added.push({ id, label: partLabel(c), kind: c.kind, count: c.count ?? 1 });
  for (const [id, c] of ca) {
    const d = cb.get(id);
    if (!d) { removed.push({ id, label: partLabel(c), kind: c.kind, count: c.count ?? 1 }); continue; }
    const props = [];
    for (const k of PART_PROPS) { const x = c[k], y = d[k]; if (x !== y && !(x == null && y == null) && typeof (x ?? y) !== 'object') props.push({ prop: k, a: x ?? null, b: y ?? null }); }
    if (props.length) changed.push({ id, label: partLabel(d), kind: d.kind, props });
  }
  const sa = summarizeState(a), sb = summarizeState(b);
  const ROWS = [['mass', 'Total mass', 'kg'], ['deltaV', 'Delta-v (vacuum)', 'm/s'], ['twr', 'Liftoff thrust-to-weight', ''], ['payload', 'Payload', 'kg'], ['parts', 'Number of parts', ''], ['stages', 'Stages', '']];
  const numbers = ROWS.map(([key, label, unit]) => ({ key, label, unit, a: sa[key], b: sb[key], delta: Number.isFinite(sa[key]) && Number.isFinite(sb[key]) ? sb[key] - sa[key] : null }))
    .filter((r) => r.a != null || r.b != null);
  const ma = missionOf(a), mb = missionOf(b), mission = [];
  if ((ma?.name ?? null) !== (mb?.name ?? null)) mission.push(`Mission: ${ma?.name ?? 'none'} → ${mb?.name ?? 'none'}`);
  if (ma?.objective?.altitude !== mb?.objective?.altitude && (ma || mb)) mission.push(`Target altitude: ${ma?.objective?.altitude != null ? ma.objective.altitude / 1000 + ' km' : '–'} → ${mb?.objective?.altitude != null ? mb.objective.altitude / 1000 + ' km' : '–'}`);
  if ((ma?.events?.length ?? 0) !== (mb?.events?.length ?? 0)) mission.push(`Mission events: ${ma?.events?.length ?? 0} → ${mb?.events?.length ?? 0}`);
  return { vehicleChanged: (va?.id ?? null) !== (vb?.id ?? null), parts: { added, removed, changed }, numbers, mission, same: JSON.stringify(a) === JSON.stringify(b) };
}

/** One short line about what a version changed compared with the one before it (for the list). */
export function changeSummary(prev, cur) {
  if (!prev) return 'First version';
  const d = diffStates(prev, cur);
  const bits = [];
  if (d.parts.added.length) bits.push(`+${d.parts.added.length} part${d.parts.added.length > 1 ? 's' : ''}`);
  if (d.parts.removed.length) bits.push(`−${d.parts.removed.length} part${d.parts.removed.length > 1 ? 's' : ''}`);
  if (d.parts.changed.length) bits.push(`${d.parts.changed.length} edited`);
  if (d.mission.length) bits.push('mission changed');
  if (d.vehicleChanged) bits.push('other vehicle');
  return bits.length ? bits.join(', ') : 'no part changes';
}
