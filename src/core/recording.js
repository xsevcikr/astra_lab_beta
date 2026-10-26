// Replay of recorded simulations + exact deterministic re-simulation.
import { Simulation } from '../../physics/simulation.js';

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 1000, 10000, 100000];   // the top speeds are for multi-day flights (Moon trip); a slow computer simply reaches less than the asked speed
export const clampSpeed = (s) => Math.min(100000, Math.max(0.1, Number(s) || 1));

/** Plays back stored telemetry: play / pause / restart / scrub / 0.1x .. 100x. Pure logic, no rendering, no wall clock. */
export class Replay {
  constructor({ telemetry, events = [], result = null }) {
    this.telemetry = telemetry; this.events = events; this.result = result;
    this.t0 = telemetry.count ? telemetry.column('t')[0] : 0;
    this.duration = telemetry.count ? telemetry.column('t')[telemetry.count - 1] : 0;
    this.t = this.t0; this.speed = 1; this.playing = false; this.loop = false;
  }
  play() { if (this.t >= this.duration) this.t = this.t0; this.playing = true; }
  pause() { this.playing = false; }
  toggle() { this.playing ? this.pause() : this.play(); }
  restart() { this.t = this.t0; this.playing = true; }
  seek(t) { this.t = Math.min(this.duration, Math.max(this.t0, t)); }
  seekFraction(f) { this.seek(this.t0 + f * (this.duration - this.t0)); }
  setSpeed(s) { this.speed = clampSpeed(s); }
  /** Advance by `wallSeconds` of real time (e.g. a requestAnimationFrame delta). Returns true while still playing. */
  tick(wallSeconds) {
    if (!this.playing) return false;
    this.t += wallSeconds * this.speed;
    if (this.t >= this.duration) { if (this.loop) this.t = this.t0; else { this.t = this.duration; this.playing = false; } }
    return this.playing;
  }
  get fraction() { return this.duration > this.t0 ? (this.t - this.t0) / (this.duration - this.t0) : 0; }
  frame() { return this.telemetry.sample(this.t); }
  eventsUpTo(t = this.t) { return this.events.filter((e) => e.t <= t + 1e-9); }
  /** Mission markers for the scrub bar: events + failures. */
  markers() {
    const m = this.events.filter((e) => !['MISSION_START', 'EVENT_DONE'].includes(e.kind)).map((e) => ({ t: e.t, kind: e.kind, label: e.message }));
    return m;
  }
}

/** Re-run a stored run from its exact inputs (the engine is deterministic) up to time `untilT`. Gives full-resolution state at any time. */
export function resimulate(record, untilT = Infinity, { onStep } = {}) {
  const sim = new Simulation({ vehicle: record.vehicle, mission: record.mission, environment: record.environment, settings: record.settings });
  const cmds = [...(record.commands ?? [])].sort((a, b) => a.t - b.t);
  let ci = 0;
  while (!sim.finished && sim.t < untilT) {
    while (ci < cmds.length && cmds[ci].t <= sim.t + 1e-9) { const { t, ...c } = cmds[ci++]; sim.command(c); }
    sim.step();
    onStep?.(sim);
  }
  return sim;
}
/** Verify that a stored run is reproduced bit-for-bit by the current engine. */
export function verifyReproducible(record, tel) {
  const sim = resimulate(record);
  const a = sim.telemetry, b = tel;
  if (a.count !== b.count) return { ok: false, reason: `sample count ${a.count} vs ${b.count}` };
  for (const id of ['t', 'x', 'y', 'z', 'mass']) {
    const ca = a.column(id), cb = b.column(id);
    for (let i = 0; i < a.count; i++) if (ca[i] !== cb[i]) return { ok: false, reason: `${id}[${i}] differs` };
  }
  return { ok: true };
}
