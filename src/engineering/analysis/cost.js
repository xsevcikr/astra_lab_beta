// Rough-order-of-magnitude cost estimate from mass-based cost estimating relationships in the style of
// TRANSCOST. APPROXIMATION for comparing designs against each other only; it is not a price quote.
import { MODEL, tagged } from '../core/provenance.js';
export function costEstimate(vehicle, { reusable = false } = {}) {
  const engines = vehicle.stages.flatMap((s) => s.engines.map((e) => ({ n: e.count ?? 1, thrust: e.thrustVac })));
  const engineCost = engines.reduce((a, e) => a + e.n * 0.6 * Math.pow(e.thrust / 1e3, 0.5), 0); // $M
  const structureCost = vehicle.stages.reduce((a, s) => a + 1.1 * Math.pow(s.dryMass / 1000, 0.6) * 10, 0);
  const avionics = 8 + (vehicle.components || []).filter((c) => ['avionics', 'gnc'].includes(c.subsystem)).reduce((a, c) => a + 0.5 * (c.redundancy?.n || 1), 0);
  const unit = engineCost + structureCost + avionics;
  const development = 25 * Math.pow(unit, 0.9);
  return tagged(MODEL.APPROXIMATION, 'Mass-based CER for relative comparison only (millions of USD, not a quote).', { unit, development, perFlight: reusable ? unit * 0.2 : unit, breakdown: { engines: engineCost, structure: structureCost, avionics } });
}
