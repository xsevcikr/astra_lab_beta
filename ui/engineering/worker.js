// Web Worker host for engineering jobs (Monte Carlo, missions, V&V) so the interface stays responsive.
import { JOBS } from './jobs.js';
self.onmessage = async ({ data: { id, job, args } }) => {
  try {
    const result = await JOBS[job](args || {}, (p) => self.postMessage({ id, progress: p }));
    self.postMessage({ id, result });
  } catch (e) { self.postMessage({ id, error: e.message, stack: e.stack }); }
};
