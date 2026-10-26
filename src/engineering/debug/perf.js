// Engineering/debug mode counters: timesteps, solver statistics, numerical error, entity counts, memory, AI actions.
export class PerfMonitor {
  constructor() { this.frames = []; this.counters = {}; this.maxFrames = 300; }
  frame({ wallMs, physicsDt, simDt, substeps, entities, physicsObjects, collisions = 0, aiActions = 0, energyError = null }) {
    this.frames.push({ t: Date.now(), wallMs, physicsDt, simDt, substeps, entities, physicsObjects, collisions, aiActions, energyError });
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }
  count(name, n = 1) { this.counters[name] = (this.counters[name] || 0) + n; }
  summary() {
    const f = this.frames, last = f[f.length - 1] || {};
    const avg = (k) => f.reduce((a, x) => a + (x[k] || 0), 0) / Math.max(1, f.length);
    let mem = null;
    if (typeof performance !== 'undefined' && performance.memory) mem = { usedMB: performance.memory.usedJSHeapSize / 1048576, limitMB: performance.memory.jsHeapSizeLimit / 1048576 };
    else if (typeof process !== 'undefined' && process.memoryUsage) { const m = process.memoryUsage(); mem = { usedMB: m.heapUsed / 1048576, rssMB: m.rss / 1048576 }; }
    return { fps: f.length > 1 ? (f.length - 1) / ((last.t - f[0].t) / 1000 || 1) : null, avgFrameMs: avg('wallMs'), cpuBudgetUsed: avg('wallMs') / 16.7, physicsDt: last.physicsDt, simDt: last.simDt, substeps: last.substeps, entities: last.entities, physicsObjects: last.physicsObjects,
      collisions: f.reduce((a, x) => a + x.collisions, 0), aiActions: f.reduce((a, x) => a + x.aiActions, 0), energyError: last.energyError, memory: mem, counters: this.counters,
      gpu: 'GPU timing is reported by the 3D renderer; the headless engine does not use the GPU.' };
  }
}
