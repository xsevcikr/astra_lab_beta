// Flight data recorder: columnar telemetry channels with units and provenance, event markers,
// statistics, run comparison and export. Everything here is written by the simulation, never by the UI.
export class FlightRecorder {
  constructor({ vehicle = 'vehicle', run = 'run', sampleInterval = 0.5 } = {}) {
    this.meta = { vehicle, run, created: new Date().toISOString(), sampleInterval };
    this.channels = new Map(); // name -> { unit, source, values: [] }
    this.t = [];
    this.events = [];
    this.lastSample = -Infinity;
  }
  define(name, unit, source = 'physics') { if (!this.channels.has(name)) this.channels.set(name, { unit, source, values: [] }); return this; }
  due(t) { return t - this.lastSample >= this.meta.sampleInterval - 1e-9; }
  record(t, frame, force = false) {
    if (!force && !this.due(t)) return false;
    this.lastSample = t;
    this.t.push(t);
    const n = this.t.length;
    for (const [k, v] of Object.entries(frame)) {
      if (!this.channels.has(k)) this.define(k, '', 'physics');
      const ch = this.channels.get(k);
      while (ch.values.length < n - 1) ch.values.push(null);
      ch.values.push(typeof v === 'boolean' ? +v : v);
    }
    for (const ch of this.channels.values()) while (ch.values.length < n) ch.values.push(null);
    return true;
  }
  event(t, type, text, data = {}) { const e = { t, type, text, ...data }; this.events.push(e); return e; }
  names() { return [...this.channels.keys()]; }
  series(name) { const ch = this.channels.get(name); if (!ch) throw new Error(`no channel ${name}`); return { t: this.t, values: ch.values, unit: ch.unit, source: ch.source }; }
  stats(name, t0 = -Infinity, t1 = Infinity) {
    const { values } = this.series(name);
    let min = Infinity, max = -Infinity, sum = 0, n = 0, tMin = null, tMax = null;
    for (let i = 0; i < values.length; i++) {
      const t = this.t[i], v = values[i];
      if (t < t0 || t > t1 || v === null || !Number.isFinite(v)) continue;
      if (v < min) { min = v; tMin = t; }
      if (v > max) { max = v; tMax = t; }
      sum += v; n++;
    }
    return n ? { min, max, mean: sum / n, tMin, tMax, count: n, final: values[values.length - 1] } : { min: null, max: null, mean: null, count: 0 };
  }
  valueAt(name, t) {
    const { values } = this.series(name);
    let lo = 0, hi = this.t.length - 1;
    if (hi < 0) return null;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.t[m] <= t) lo = m; else hi = m - 1; }
    return values[lo];
  }
  frameAt(t) { const f = { t }; for (const k of this.channels.keys()) f[k] = this.valueAt(k, t); return f; }
  toCSV(names = this.names()) {
    const head = ['t [s]', ...names.map((n) => `${n} [${this.channels.get(n).unit}]`)].join(',');
    const rows = this.t.map((t, i) => [t, ...names.map((n) => { const v = this.channels.get(n).values[i]; return v === null ? '' : v; })].join(','));
    return [head, ...rows].join('\n');
  }
  toJSON() {
    const channels = {};
    for (const [k, v] of this.channels) channels[k] = v;
    return { meta: this.meta, t: this.t, channels, events: this.events };
  }
  static fromJSON(j) {
    const r = new FlightRecorder(j.meta);
    r.meta = j.meta; r.t = j.t; r.events = j.events;
    for (const [k, v] of Object.entries(j.channels)) r.channels.set(k, v);
    return r;
  }
}

// Compare two runs channel by channel: max difference and where it happens.
export function compareRuns(a, b, names) {
  return (names || a.names().filter((n) => b.channels.has(n))).map((name) => {
    let maxDiff = 0, at = null;
    for (let i = 0; i < a.t.length; i++) {
      const va = a.channels.get(name).values[i], vb = b.valueAt(name, a.t[i]);
      if (va === null || vb === null) continue;
      const d = Math.abs(va - vb);
      if (d > maxDiff) { maxDiff = d; at = a.t[i]; }
    }
    return { name, maxDiff, at, statsA: a.stats(name), statsB: b.stats(name) };
  });
}
