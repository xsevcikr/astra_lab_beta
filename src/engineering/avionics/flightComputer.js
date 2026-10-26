// Simulated flight computer: boot sequence, software modes, scheduled processes, watchdog, command and
// telemetry queues, memory with EDAC, redundant units with failover, and fault detection/isolation/recovery
// (FDIR) rules. This is a behavioural SIMPLIFICATION of real flight software (no instruction-level emulation).
import { MODEL } from '../core/provenance.js';

export const MODES = ['OFF', 'BOOT', 'PRELAUNCH', 'LAUNCH', 'ASCENT', 'ORBIT', 'CRUISE', 'APPROACH', 'DESCENT', 'LANDING', 'SURFACE', 'SURFACE_ASCENT', 'RENDEZVOUS', 'DOCKED', 'RETURN', 'REENTRY', 'RECOVERY', 'SAFE', 'ABORT'];
// Modes in which safe mode is not survivable (vehicle is under powered flight near terrain or in atmosphere)
export const CRITICAL_MODES = new Set(['LAUNCH', 'ASCENT', 'DESCENT', 'LANDING', 'SURFACE_ASCENT', 'REENTRY']);
const TRANSITIONS = {
  OFF: ['BOOT'], BOOT: ['PRELAUNCH', 'SAFE', 'CRUISE', 'ORBIT', 'SURFACE'],
  PRELAUNCH: ['LAUNCH', 'SAFE'], LAUNCH: ['ASCENT', 'ABORT'], ASCENT: ['ORBIT', 'ABORT'],
  ORBIT: ['CRUISE', 'APPROACH', 'DESCENT', 'RENDEZVOUS', 'RETURN', 'REENTRY', 'SAFE'], CRUISE: ['APPROACH', 'ORBIT', 'RETURN', 'SAFE'],
  APPROACH: ['ORBIT', 'DESCENT', 'RENDEZVOUS', 'REENTRY', 'SAFE'], DESCENT: ['LANDING', 'ABORT'], LANDING: ['SURFACE', 'ABORT'],
  SURFACE: ['SURFACE_ASCENT', 'SAFE'], SURFACE_ASCENT: ['ORBIT', 'RENDEZVOUS', 'ABORT'], RENDEZVOUS: ['DOCKED', 'ORBIT', 'SAFE'],
  DOCKED: ['ORBIT', 'RETURN', 'SAFE'], RETURN: ['REENTRY', 'CRUISE', 'SAFE'], REENTRY: ['RECOVERY'], RECOVERY: [],
  SAFE: ['ORBIT', 'CRUISE', 'SURFACE', 'RETURN', 'APPROACH'], ABORT: ['ORBIT', 'REENTRY', 'SAFE', 'RECOVERY'],
};

const BOOT_SEQUENCE = [
  { step: 'power-on-self-test', duration: 1.0 }, { step: 'load-boot-rom', duration: 0.5 },
  { step: 'memory-scrub', duration: 1.5 }, { step: 'load-flight-software', duration: 2.0 },
  { step: 'initialize-sensors', duration: 1.0 }, { step: 'align-navigation', duration: 3.0 },
];

const DEFAULT_PROCESSES = [
  { id: 'nav', name: 'Navigation', period: 0.02, cpu: 0.18, memKb: 512, critical: true },
  { id: 'guid', name: 'Guidance', period: 0.1, cpu: 0.10, memKb: 256, critical: true },
  { id: 'ctrl', name: 'Control', period: 0.01, cpu: 0.15, memKb: 128, critical: true },
  { id: 'fdir', name: 'Fault management', period: 0.1, cpu: 0.05, memKb: 128, critical: true },
  { id: 'tlm', name: 'Telemetry', period: 0.1, cpu: 0.08, memKb: 1024, critical: false },
  { id: 'cmd', name: 'Command handler', period: 0.05, cpu: 0.03, memKb: 64, critical: false },
  { id: 'eps', name: 'Power manager', period: 1.0, cpu: 0.02, memKb: 64, critical: false },
  { id: 'tcs', name: 'Thermal control', period: 1.0, cpu: 0.02, memKb: 64, critical: false },
];

class ComputerUnit {
  constructor(id, cfg) {
    this.id = id; this.cfg = cfg;
    this.state = 'OFF'; // OFF, BOOTING, RUNNING, FAILED
    this.bootStep = 0; this.bootTimer = 0;
    this.processes = DEFAULT_PROCESSES.map((p) => ({ ...p, status: 'stopped', lastRun: 0, heartbeat: 0, crashes: 0 }));
    this.memory = { totalKb: cfg.memoryKb, edac: cfg.edac, singleBitErrors: 0, uncorrectable: 0 };
    this.restarts = 0;
  }
  cpuLoad() { return this.state !== 'RUNNING' ? 0 : this.processes.reduce((a, p) => a + (p.status === 'running' ? p.cpu : 0), 0) / this.cfg.cpuScale; }
  memUsedKb() { return this.processes.reduce((a, p) => a + (p.status === 'running' ? p.memKb : 0), 0) + 2048; }
}

export class FlightComputer {
  constructor(cfg = {}) {
    this.cfg = { units: 2, memoryKb: 16384, cpuScale: 1, edac: true, watchdogTimeout: 0.5, telemetryCapacity: 2000, hotStandby: true, ...cfg };
    this.units = Array.from({ length: this.cfg.units }, (_, i) => new ComputerUnit(`FC-${String.fromCharCode(65 + i)}`, this.cfg));
    this.active = 0;
    this.mode = 'OFF';
    this.events = [];
    this.commandQueue = [];
    this.telemetryQueue = [];
    this.droppedTelemetry = 0;
    this.navValid = true; this.navLostSince = null;
    this.sensorRejects = 0;
    this.t = 0;
    this.model = MODEL.SIMPLIFICATION;
  }
  log(type, text, extra = {}) { this.events.push({ t: this.t, type, text, mode: this.mode, unit: this.units[this.active]?.id, ...extra }); }
  get unit() { return this.units[this.active]; }

  powerOn() {
    for (const u of this.units) { u.state = 'BOOTING'; u.bootStep = 0; u.bootTimer = 0; }
    this.mode = 'BOOT';
    this.log('boot', 'Flight computers powered on');
  }
  setMode(next, reason = 'command') {
    if (next === this.mode) return true;
    if (next === 'SAFE' && CRITICAL_MODES.has(this.mode)) { this.log('mode-reject', `Safe mode not allowed during ${this.mode}; abort logic takes over`); return this.setMode('ABORT', reason); }
    if (!(TRANSITIONS[this.mode] || []).includes(next) && next !== 'SAFE') { this.log('mode-reject', `Illegal transition ${this.mode} -> ${next}`); return false; }
    this.log('mode', `${this.mode} -> ${next} (${reason})`, { from: this.mode, to: next });
    this.mode = next;
    return true;
  }
  // Commands are validated against the current mode before execution.
  enqueue(cmd) { this.commandQueue.push({ ...cmd, receivedAt: this.t }); }
  pushTelemetry(frame) {
    if (this.telemetryQueue.length >= this.cfg.telemetryCapacity) { this.telemetryQueue.shift(); this.droppedTelemetry++; }
    this.telemetryQueue.push(frame);
  }
  drainTelemetry(n = Infinity) { return this.telemetryQueue.splice(0, n); }

  inject(fault, params = {}) {
    const u = this.units[params.unit ?? this.active];
    this.log('fault-injected', `${fault} on ${u.id}`, { fault });
    switch (fault) {
      case 'computer-restart': u.state = 'BOOTING'; u.bootStep = 0; u.bootTimer = 0; u.restarts++; u.processes.forEach((p) => (p.status = 'stopped')); break;
      case 'computer-failure': u.state = 'FAILED'; break;
      case 'memory-fault':
        if (u.memory.edac && !params.multiBit) { u.memory.singleBitErrors++; this.log('edac', 'Single-bit memory error corrected by EDAC'); }
        else { u.memory.uncorrectable++; const p = u.processes.find((x) => x.id === (params.process || 'nav')); p.status = 'crashed'; p.crashes++; }
        break;
      case 'process-failure': { const p = u.processes.find((x) => x.id === (params.process || 'guid')); p.status = 'hung'; break; }
      case 'lost-navigation': this.navValid = false; this.navLostSince = this.t; break;
      case 'sensor-corruption': this.sensorCorruption = params; break;
      default: throw new Error(`unknown flight computer fault ${fault}`);
    }
  }

  // Validate a sensor value against a predicted value; FDIR rejects inconsistent inputs.
  checkSensor(name, measured, predicted, tolerance) {
    if (measured === null || measured === undefined || !Number.isFinite(measured)) { this.sensorRejects++; return { accepted: false, reason: 'invalid' }; }
    if (Math.abs(measured - predicted) > tolerance) { this.sensorRejects++; this.log('sensor-reject', `${name} rejected: ${measured.toPrecision(4)} vs predicted ${predicted.toPrecision(4)}`); return { accepted: false, reason: 'inconsistent' }; }
    return { accepted: true };
  }

  step(dt) {
    this.t += dt;
    for (const u of this.units) {
      if (u.state === 'BOOTING') {
        u.bootTimer += dt;
        const s = BOOT_SEQUENCE[u.bootStep];
        if (u.bootTimer >= s.duration) { u.bootTimer = 0; u.bootStep++; if (u === this.unit) this.log('boot-step', `${u.id}: ${s.step} complete`); }
        if (u.bootStep >= BOOT_SEQUENCE.length) { u.state = 'RUNNING'; u.processes.forEach((p) => { p.status = 'running'; p.heartbeat = this.t; }); this.log('boot', `${u.id} running`); }
      }
      if (u.state !== 'RUNNING') continue;
      for (const p of u.processes) {
        if (p.status === 'running') { p.lastRun = this.t; p.heartbeat = this.t; }
        // watchdog: a process that stops heart-beating is restarted; repeated failure escalates
        if (p.status !== 'running' && this.t - p.heartbeat > this.cfg.watchdogTimeout) {
          p.crashes++;
          if (p.crashes <= 2) { p.status = 'running'; p.heartbeat = this.t; if (u === this.unit) this.log('watchdog', `${p.name} restarted by watchdog (${p.crashes})`); }
          else if (p.critical && u === this.unit) { this.log('watchdog', `${p.name} keeps failing on ${u.id}; switching computer`); this.failover(`${p.name} unrecoverable`); }
        }
      }
    }
    if (this.mode === 'BOOT' && this.unit.state === 'RUNNING') this.setMode(this.cfg.initialMode || 'PRELAUNCH', 'boot complete');
    // active unit lost -> failover
    if (this.mode !== 'OFF' && this.mode !== 'BOOT' && this.unit.state !== 'RUNNING') this.failover(`${this.unit.id} ${this.unit.state.toLowerCase()}`);
    // navigation loss handling
    if (!this.navValid && this.navLostSince !== null && this.t - this.navLostSince > 5 && !this._navEscalated) {
      this._navEscalated = true;
      this.setMode('SAFE', 'navigation solution lost for 5 s');
    }
    // commands
    const ready = this.commandQueue.splice(0);
    for (const c of ready) {
      if (this.unit.state !== 'RUNNING') { this.log('cmd-reject', `${c.name} rejected: computer not running`); continue; }
      if (c.allowedModes && !c.allowedModes.includes(this.mode)) { this.log('cmd-reject', `${c.name} rejected in ${this.mode}`); continue; }
      if (c.name === 'set-mode') this.setMode(c.mode, 'ground command'); else this.log('cmd', `Executed ${c.name}`);
      c.onExecute?.(this);
    }
    return this.status();
  }

  failover(reason) {
    const next = this.units.findIndex((u, i) => i !== this.active && u.state === 'RUNNING');
    const booting = this.units.findIndex((u, i) => i !== this.active && u.state === 'BOOTING');
    if (next >= 0 && this.cfg.hotStandby) { this.log('failover', `Switched to ${this.units[next].id}: ${reason}`); this.active = next; return true; }
    if (booting >= 0) { this.log('failover', `Waiting for ${this.units[booting].id} to boot: ${reason}`); this.active = booting; return false; }
    if (!this._noComputer) { this._noComputer = true; this.log('loss-of-control', `No healthy flight computer: ${reason}`); }
    return false;
  }

  status() {
    const u = this.unit;
    return {
      mode: this.mode, activeUnit: u.id, unitState: u.state, cpuLoad: u.cpuLoad(), memoryUsedKb: u.memUsedKb(), memoryTotalKb: u.memory.totalKb,
      processes: u.processes.map((p) => ({ id: p.id, status: p.status, crashes: p.crashes })),
      units: this.units.map((x) => ({ id: x.id, state: x.state, restarts: x.restarts })),
      navValid: this.navValid, commandsQueued: this.commandQueue.length, telemetryQueued: this.telemetryQueue.length, telemetryDropped: this.droppedTelemetry,
      healthy: u.state === 'RUNNING' && u.processes.filter((p) => p.critical).every((p) => p.status === 'running'),
    };
  }
}
