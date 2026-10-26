// Structural margins for thin-walled cylindrical stage structures.
// Membrane stress from axial load + bending: PHYSICS (beam theory). Shell buckling with a 0.33 knockdown
// (NASA SP-8007 style) and lumped load paths: APPROXIMATION.
import { MODEL, tagged } from '../core/provenance.js';

export const MATERIALS = {
  al2219: { name: 'Aluminium 2219-T87', E: 73e9, yield: 290e6, ultimate: 400e6, density: 2840, maxTemp: 450 },
  al2014: { name: 'Aluminium 2014-T6', E: 73e9, yield: 414e6, ultimate: 483e6, density: 2800, maxTemp: 420 },
  al2195: { name: 'Al-Li 2195', E: 76e9, yield: 490e6, ultimate: 560e6, density: 2710, maxTemp: 420 },
  cfrp: { name: 'Carbon fibre composite (quasi-isotropic)', E: 70e9, yield: 500e6, ultimate: 600e6, density: 1600, maxTemp: 400 },
  steel304: { name: 'Stainless steel 304', E: 193e9, yield: 215e6, ultimate: 505e6, density: 8000, maxTemp: 1000 },
  ti6al4v: { name: 'Titanium Ti-6Al-4V', E: 114e9, yield: 880e6, ultimate: 950e6, density: 4430, maxTemp: 650 },
};

export const DESIGN_FACTOR = 1.4; // ultimate factor of safety typical for crewed launch structures

export function cylinderSection(diameter, thickness) {
  const r = diameter / 2;
  return { area: 2 * Math.PI * r * thickness, inertia: Math.PI * r ** 3 * thickness, r, t: thickness };
}

// loads: { axial (N, compression positive), bending (N·m), pressure (Pa internal, optional) }
// section.stiffening multiplies the effective buckling thickness (skin-stringer ~2, isogrid ~2.5; monocoque 1).
export function stationMargin(section, material, loads, factor = DESIGN_FACTOR) {
  const { area, inertia, r, t } = section;
  const tBuckle = t * (section.stiffening || 1);
  const axialStress = loads.axial / area;
  const bendingStress = Math.abs(loads.bending) * r / inertia;
  const hoop = (loads.pressure || 0) * r / t;
  const compression = axialStress + bendingStress - (loads.pressure || 0) * r / (2 * t); // internal pressure stabilizes
  const tension = Math.max(hoop, -axialStress + bendingStress);
  const bucklingStress = 0.33 * 0.605 * material.E * tBuckle / r; // classical shell buckling * knockdown
  const allowCompression = Math.min(material.yield, bucklingStress);
  const marginCompression = compression > 0 ? allowCompression / (compression * factor) - 1 : Infinity;
  const marginTension = tension > 0 ? material.yield / (tension * factor) - 1 : Infinity;
  const margin = Math.min(marginCompression, marginTension);
  return {
    axialStress, bendingStress, hoopStress: hoop, compression, bucklingStress, allowCompression,
    marginCompression, marginTension, margin,
    governing: marginCompression <= marginTension ? (bucklingStress < material.yield ? 'shell buckling' : 'compressive yield') : 'tension/hoop',
    safetyFactor: compression > 0 ? allowCompression / compression : Infinity,
    status: margin < 0 ? 'FAIL' : margin < 0.1 ? 'MARGINAL' : 'PASS',
  };
}

// Loads at the base of each stage, given the current flight condition.
// accelAxial: sensed axial acceleration (m/s^2); q: dynamic pressure; alpha: angle of attack (rad).
export function vehicleLoads(vehicle, state) {
  const { stageIndex = 0, massAbove, accelAxial, q, alpha = 0, cnAlpha = 2.5, aref, cpFromNose, lengths, drag = 0 } = state;
  const stations = [];
  let noseDist = 0;
  const L = lengths || vehicle.stages.map((s) => s.length || 10);
  const totalLen = L.slice(stageIndex).reduce((a, b) => a + b, 0) + (vehicle.payloadLength || 8);
  for (let i = vehicle.stages.length - 1; i >= stageIndex; i--) {
    noseDist += L[i];
    const s = vehicle.stages[i];
    const above = massAbove(i);
    const normalForce = q * aref * cnAlpha * Math.sin(alpha);
    const arm = Math.max(0, (vehicle.payloadLength || 8) + noseDist - (cpFromNose ?? 0.4 * totalLen));
    const loads = { axial: above * accelAxial + drag * ((vehicle.payloadLength || 8) + noseDist) / totalLen, bending: normalForce * arm * 0.5, pressure: s.structure?.ullagePressure ?? 2e5 };
    const mat = MATERIALS[s.structure?.material || 'al2219'];
    const sec = { ...cylinderSection(s.diameter || vehicle.aero?.diameter || 3, s.structure?.wallThickness || 0.005), stiffening: s.structure?.stiffening || 1 };
    stations.push({ station: `${s.name || 'Stage ' + (i + 1)} base`, stage: i, loads, material: mat.name, ...stationMargin(sec, mat, loads) });
  }
  return tagged(MODEL.APPROXIMATION, 'Lumped axial and bending loads on thin cylindrical shells; no local stress concentrations, joints or dynamic amplification.', { stations, minMargin: Math.min(...stations.map((s) => s.margin)) });
}
