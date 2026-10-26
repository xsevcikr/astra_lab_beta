// Engineering version control for vehicle designs: immutable snapshots, semantic version bumps,
// human-readable diffs of parameters and derived performance.
import { diffObjects } from '../requirements/requirements.js';
import { performance, massBudget } from './model.js';
import { configHash } from './twin.js';

export class VersionStore {
  constructor() { this.versions = []; }
  commit(vehicle, message = '', { bump = 'minor', author = 'user' } = {}) {
    const prev = this.latest(vehicle.id);
    let version = vehicle.version || '1.0';
    if (prev) { const [maj, min] = prev.version.split('.').map(Number); version = bump === 'major' ? `${maj + 1}.0` : `${maj}.${min + 1}`; }
    const snap = JSON.parse(JSON.stringify({ ...vehicle, version }));
    const entry = { id: vehicle.id, version, message, author, time: new Date().toISOString(), hash: configHash({ ...snap, version: undefined }), vehicle: snap, parent: prev?.version ?? null };
    if (prev && prev.hash === entry.hash) return prev; // nothing changed
    this.versions.push(entry);
    return entry;
  }
  history(id) { return this.versions.filter((v) => v.id === id); }
  latest(id) { const h = this.history(id); return h[h.length - 1] || null; }
  get(id, version) { const v = this.versions.find((x) => x.id === id && x.version === version); if (!v) throw new Error(`no version ${version} of ${id}`); return JSON.parse(JSON.stringify(v.vehicle)); }
  compare(id, va, vb) {
    const a = this.get(id, va), b = this.get(id, vb);
    const changes = diffObjects(a, b).filter((d) => d.path !== 'version');
    const pa = performance(a), pb = performance(b), ma = massBudget(a), mb = massBudget(b);
    const derived = [
      { name: 'Gross mass', unit: 'kg', from: ma.gross, to: mb.gross }, { name: 'Dry mass', unit: 'kg', from: ma.dry, to: mb.dry },
      { name: 'Ideal delta-v', unit: 'm/s', from: pa.totalDv, to: pb.totalDv }, { name: 'Liftoff thrust-to-weight', unit: '-', from: pa.liftoffTwr, to: pb.liftoffTwr },
    ].filter((d) => Math.abs(d.to - d.from) > 1e-9);
    return { from: va, to: vb, changes, derived };
  }
  toJSON() { return this.versions; }
  static fromJSON(list) { const s = new VersionStore(); s.versions = list; return s; }
}
