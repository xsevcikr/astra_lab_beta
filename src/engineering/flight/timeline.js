// Mission timeline and replay. Events carry mission time, wall time, cause, related component and a
// reference to the recorded state, so selecting an event can seek the replay to that moment.
export class Timeline {
  constructor(epoch = Date.now()) { this.epoch = epoch; this.events = []; }
  add(t, type, text, { cause = null, component = null, severity = 'info', state = null } = {}) {
    const e = { id: this.events.length + 1, t, realTime: new Date(this.epoch + t * 1000).toISOString(), type, text, cause, component, severity, state };
    this.events.push(e);
    return e;
  }
  between(t0, t1) { return this.events.filter((e) => e.t >= t0 && e.t <= t1); }
  ofSeverity(...s) { return this.events.filter((e) => s.includes(e.severity)); }
}

// Replay controller over a recorder. Rate may be negative (reverse), fractional (slow motion) or large.
export class Replay {
  constructor(recorder) {
    this.rec = recorder; this.t = recorder.t[0] ?? 0; this.rate = 1; this.playing = false;
    this.t0 = recorder.t[0] ?? 0; this.t1 = recorder.t[recorder.t.length - 1] ?? 0;
  }
  play(rate = this.rate) { this.rate = rate; this.playing = true; }
  pause() { this.playing = false; }
  seek(t) { this.t = Math.max(this.t0, Math.min(this.t1, t)); return this.frame(); }
  seekEvent(e) { return this.seek(e.t); }
  advance(wallDt) { if (this.playing) { this.seek(this.t + wallDt * this.rate); if (this.t === this.t1 || this.t === this.t0) this.playing = false; } return this.frame(); }
  frame() { return this.rec.frameAt(this.t); }
  // the last N seconds before an event: "what happened before the failure"
  window(t, before = 10, names) {
    const out = {};
    for (const n of names || this.rec.names()) {
      const s = this.rec.series(n);
      out[n] = s.t.map((tt, i) => [tt, s.values[i]]).filter(([tt]) => tt >= t - before && tt <= t);
    }
    return out;
  }
}

// Time warp with stability control: the physics step never grows beyond maxDt; warp drops automatically
// ahead of critical events (staging, ignition, atmospheric interface, landing, docking).
export const WARP_LEVELS = [0.01, 0.1, 0.25, 0.5, 1, 2, 5, 10, 50, 100, 1000];
export class TimeWarp {
  constructor({ maxDt = 0.05, maxSubsteps = 2000 } = {}) { this.warp = 1; this.maxDt = maxDt; this.maxSubsteps = maxSubsteps; this.log = []; }
  set(w) { if (!(w > 0)) throw new Error('warp must be positive'); this.warp = w; }
  // returns how to advance a wall-clock frame: number of substeps and the physics dt
  plan(wallDt, { secondsToCritical = Infinity, critical = 'event' } = {}) {
    let warp = this.warp;
    const simDt = wallDt * warp;
    if (secondsToCritical < simDt * 3 && warp > 1) {
      const safe = WARP_LEVELS.filter((l) => wallDt * l * 3 <= Math.max(secondsToCritical, wallDt)).pop() || 1;
      this.log.push({ from: warp, to: safe, reason: `approaching ${critical}` });
      this.warp = warp = Math.max(1, safe);
    }
    const total = wallDt * warp;
    const n = Math.min(this.maxSubsteps, Math.ceil(total / this.maxDt));
    return { warp, substeps: n, dt: total / n, simAdvanced: total, limited: n === this.maxSubsteps && total / n > this.maxDt };
  }
}
