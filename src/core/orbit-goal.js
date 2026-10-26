// How an orbit goal is judged and how it is worded, in ONE place (the physics check is physics/simulation.js evaluateObjective).
/**
 * The orbit target as the physics judges it (physics/simulation.js evaluateObjective): periapsis >= target*(1-tol), apoapsis <= target*(1+tol)+slack.
 * @returns {{target:number, tol:number, minPeri:number, maxApo:number, tolKm:number}|null} metres
 */
export function orbitWindow(objective) {
  if (!objective || objective.type !== 'orbit') return null;
  const target = objective.altitude ?? objective.periapsis ?? 200000, tol = objective.tolerance ?? 0.1;
  const minPeri = objective.minPeriapsis ?? (objective.periapsis ?? target) * (1 - tol);
  const maxApo = (objective.apoapsis ?? target) * (1 + tol) + (objective.apoapsisSlack ?? 0);
  return { target, tol, minPeri, maxApo, tolKm: (target * tol) / 1000 };
}
const k1 = (m) => `${(Math.round(m / 100) / 10).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}`;
const k0 = (m) => Math.round(m / 1000).toLocaleString('en-US');
/** "target 200 km, tolerance ±20 km (180 to 220 km)" */
export function orbitTargetText(objective) {
  const w = orbitWindow(objective); if (!w) return '';
  return `target ${k0(w.target)} km, tolerance ±${w.tolKm < 10 ? w.tolKm.toFixed(1).replace(/\.0$/, '') : Math.round(w.tolKm)} km (${k0(w.minPeri)} to ${k0(w.maxApo)} km)`;
}
/** "target 200 km, achieved 199.6 × 201.2 km, tolerance ±20 km" */
export function orbitResultText(objective, peri, apo) {
  const w = orbitWindow(objective); if (!w) return '';
  const ach = Number.isFinite(peri) && Number.isFinite(apo) ? `${k1(peri)} × ${k1(apo)} km` : 'no orbit';
  return `target ${k0(w.target)} km, achieved ${ach}, tolerance ±${w.tolKm < 10 ? w.tolKm.toFixed(1).replace(/\.0$/, '') : Math.round(w.tolKm)} km`;
}
