// Aerodynamic coefficient models for slender launch vehicles / capsules (engineering-level, documented approximations).
//
// Axial force coefficient  CA(M)   - tabulated wave + skin-friction drag of an ogive-nosed cylinder
// Normal force             CN(a)   = CNalpha sin(a)cos(a) + eta*Cdc*(A_planform/Sref) sin^2(a)   (linear + crossflow)
// Centre of pressure       from body + fin normal-force slopes (Barrowman-style weighted mean)
const CD_TABLE = [ // Mach, CA0 for ogive nose (zero angle of attack, power off)
  [0.0, 0.29], [0.5, 0.29], [0.8, 0.33], [0.95, 0.44], [1.05, 0.62], [1.2, 0.60], [1.5, 0.50], [2.0, 0.42],
  [3.0, 0.32], [4.0, 0.27], [6.0, 0.22], [10.0, 0.19], [25.0, 0.17],
];
export function axialCoeff(mach) {
  const t = CD_TABLE;
  if (mach <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (mach <= t[i][0]) {
      const f = (mach - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
      return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]);
    }
  }
  return t[t.length - 1][1];
}
export const CROSSFLOW_CD = 1.2; // circular cylinder in crossflow

/** Normal-force coefficient (reference area = Sref) at total angle of attack alpha [rad, 0..pi]. */
export function normalCoeff(alpha, cnAlpha, planformRatio) {
  const s = Math.sin(alpha), c = Math.cos(alpha);
  return cnAlpha * s * c + CROSSFLOW_CD * planformRatio * s * s;
}

/** Axial coefficient of a blunt capsule flying heat shield first (Apollo-type, wind-tunnel/flight values: about 1.3 hypersonic, peak near Mach 1). */
const CAPSULE_TABLE = [[0, 1.15], [0.5, 1.2], [0.9, 1.45], [1.2, 1.6], [2, 1.55], [4, 1.45], [8, 1.35], [25, 1.3]];
export function capsuleCoeff(mach) {
  const t = CAPSULE_TABLE;
  if (mach <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (mach <= t[i][0]) { const f = (mach - t[i - 1][0]) / (t[i][0] - t[i - 1][0]); return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]); }
  return t[t.length - 1][1];
}

/** Nose-shape multipliers on the axial coefficient. */
export const NOSE_FACTORS = { ogive: 1.0, cone: 1.12, blunt: 2.2, flat: 2.6, capsule: 4.5 };

/** Speed-dependent heating constant (Sutton-Graves) by atmosphere composition. */
export function heatingConstant(bodyId) { return bodyId === 'mars' ? 1.9027e-4 : 1.7415e-4; }

/** Stagnation-point convective heat flux [W/m^2] (Sutton-Graves): k sqrt(rho/Rn) v^3. */
export function stagnationHeatFlux(k, rho, noseRadius, v) {
  return k * Math.sqrt(Math.max(rho, 0) / Math.max(noseRadius, 0.01)) * v * v * v;
}
