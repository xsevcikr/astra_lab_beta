// 3D scene for ASTRA LAB: builds vehicle meshes from a vehicle definition and renders (a) the design view of the Vehicle Designer
// and (b) the flight view (live simulation and replay) from a telemetry frame. Purely visual: nothing here changes any physics value.
import { localPoint } from './dom.js';
import { Renderer, Mesh, Geo, M4, V3, revolve, cylinderX, frustumX, noseX, bellX, boxGeo, sphereGeo, plumeGeo } from './gl.js';
import { PlanetTextures, makeStars, qualityOf } from './planets.js';
import { atmoOf, skyState } from './sky.js';
import { apolloGeometry, apolloLivery, lmLegsGeometry } from './apollo-geo.js';
import { qMul, qFromAxisAngle, qNormalize, qRotate } from '../../physics/vec.js';
import { computeLayout } from '../../physics/vehicle-model.js';
import { getBody, sunDirection, localFrame, surfacePointInertial } from '../../physics/bodies.js';

export const CAMERA_MODES = [
  { id: 'free', label: 'Free orbit', hint: 'Drag to rotate, wheel to zoom' },
  { id: 'cinema', label: 'Director', hint: 'Automatic cameras that cut between shots, like a launch broadcast' },
  { id: 'chase', label: 'Chase', hint: 'Follows behind the vehicle' },
  { id: 'onboard', label: 'Onboard', hint: 'View from the vehicle nose' },
  { id: 'ground', label: 'Ground tracking', hint: 'Fixed camera at the launch site' },
  { id: 'top', label: 'Top-down', hint: 'Looking straight down' },
  { id: 'side', label: 'Side view', hint: 'Perpendicular to the flight path' },
  { id: 'orbit', label: 'Orbital map', hint: 'Planet, trajectory and orbit' },
];

// Exhaust looks by propellant (2.0, visual only). s* = daylight sheath, a* = air plume, v* = vacuum plume, c* = hot core.
const PLUME_STYLES = {
  kerolox: { s0: [1.0, 0.66, 0.30], s1: [0.95, 0.36, 0.10], a0: [1.0, 0.62, 0.22], a1: [1.0, 0.28, 0.05], v0: [0.78, 0.66, 1.0], v1: [0.5, 0.45, 1.0], c0: [1.0, 0.98, 0.9], c1: [1.0, 0.7, 0.3], sheath: 1, glow: 1, core: 1, dia: 1, len: 1, wid: 1, coreLen: 1 },
  hydrolox: { s0: [0.95, 0.85, 1.0], s1: [0.6, 0.55, 0.95], a0: [0.8, 0.75, 1.0], a1: [0.45, 0.42, 0.95], v0: [0.7, 0.68, 1.0], v1: [0.4, 0.4, 1.0], c0: [1.0, 0.98, 1.0], c1: [0.75, 0.7, 1.0], sheath: 0.25, glow: 0.55, core: 1.1, dia: 2.2, len: 1.05, wid: 0.9, coreLen: 0.8 },
  methalox: { s0: [1.0, 0.62, 0.48], s1: [0.85, 0.35, 0.3], a0: [0.62, 0.58, 1.0], a1: [0.95, 0.42, 0.3], v0: [0.6, 0.62, 1.0], v1: [0.4, 0.42, 1.0], c0: [0.92, 0.95, 1.0], c1: [0.55, 0.6, 1.0], sheath: 0.55, glow: 0.85, core: 1.05, dia: 1.6, len: 1, wid: 0.95, coreLen: 0.9 },
  solid: { s0: [1.0, 0.9, 0.7], s1: [1.0, 0.6, 0.25], a0: [1.0, 0.85, 0.55], a1: [1.0, 0.5, 0.15], v0: [1.0, 0.85, 0.7], v1: [0.9, 0.55, 0.4], c0: [1.0, 1.0, 0.95], c1: [1.0, 0.85, 0.55], sheath: 1.3, glow: 1.3, core: 1.25, dia: 0.3, len: 1.15, wid: 1.15, coreLen: 1.2 },
  hypergolic: { s0: [1.0, 0.55, 0.35], s1: [0.8, 0.3, 0.25], a0: [1.0, 0.55, 0.38], a1: [0.85, 0.3, 0.25], v0: [0.95, 0.6, 0.55], v1: [0.6, 0.4, 0.55], c0: [1.0, 0.9, 0.8], c1: [1.0, 0.55, 0.4], sheath: 0.6, glow: 0.65, core: 0.85, dia: 0.8, len: 0.9, wid: 1, coreLen: 0.9 },
  cold: { s0: [0.7, 0.8, 1.0], s1: [0.5, 0.6, 1.0], a0: [0.6, 0.75, 1.0], a1: [0.35, 0.5, 1.0], v0: [0.55, 0.75, 1.0], v1: [0.3, 0.5, 1.0], c0: [0.85, 0.95, 1.0], c1: [0.5, 0.7, 1.0], sheath: 0, glow: 0.45, core: 0.6, dia: 0, len: 0.7, wid: 0.8, coreLen: 0.7 },
};
const STAGE_COLORS = [[0.92, 0.93, 0.96], [0.94, 0.8, 0.66], [0.7, 0.82, 0.94], [0.78, 0.92, 0.7], [0.9, 0.7, 0.85]];
const KIND_COLOR = {
  engine: [0.33, 0.34, 0.38], nose_cone: [0.9, 0.9, 0.93], fairing: [0.96, 0.96, 0.98], interstage: [0.28, 0.29, 0.33], structural_section: [0.55, 0.56, 0.6],
  heat_shield: [0.22, 0.18, 0.16], payload: [0.95, 0.78, 0.2], avionics: [0.2, 0.62, 0.42], guidance: [0.2, 0.6, 0.55], computer: [0.25, 0.6, 0.45], reaction_wheel: [0.55, 0.55, 0.65],
  battery: [0.65, 0.3, 0.3], solar_panel: [0.09, 0.16, 0.5], antenna: [0.85, 0.86, 0.9], instrument: [0.75, 0.45, 0.9], sensor: [0.7, 0.5, 0.85], radiator: [0.92, 0.92, 0.92],
  heater: [0.9, 0.4, 0.2], mli: [0.85, 0.7, 0.25], landing_legs: [0.6, 0.6, 0.62], parachute: [0.95, 0.4, 0.2], fin: [0.5, 0.5, 0.55], rcs: [0.7, 0.7, 0.72],
  decoupler: [0.36, 0.37, 0.41], rover_chassis: [0.75, 0.75, 0.78], wheel: [0.12, 0.12, 0.13], motor: [0.3, 0.3, 0.35],
};
const STAGE_BAND = [[0.20, 0.22, 0.28], [0.62, 0.20, 0.16], [0.18, 0.34, 0.62], [0.22, 0.52, 0.30], [0.58, 0.34, 0.52]];
const tankColor = (c, stageIdx) => { const b = STAGE_COLORS[stageIdx % STAGE_COLORS.length]; return c.kind === 'oxidizer_tank' ? b.map((x) => x * 0.94) : b; };

// how "bare metal" (shiny, reflective) each kind of part looks; everything else is painted
const METAL = { engine: 0.6, interstage: 0.5, structural_section: 0.45, landing_legs: 0.6, antenna: 0.6, solar_panel: 0.75, fin: 0.35, radiator: 0.3, rover_chassis: 0.4, payload: 0.45, heat_shield: 0.0, wheel: 0.0, parachute: 0.0, mli: 0.6, battery: 0.2, motor: 0.6, reaction_wheel: 0.5, rcs: 0.4 };
// procedural surface material ids understood by the lit shader in gl.js (see LIT_FS): 1 tank, 2 engine, 3 solar cells, 4 MLI foil, 5 heat shield,
// 6 painted shell, 7 corrugated skirt, 8 boxes / general hardware, 0 plain
const MATERIAL = { fuel_tank: 1, oxidizer_tank: 1, propellant_tank: 1, engine: 2, solar_panel: 3, radiator: 8, mli: 4, heat_shield: 5, fairing: 6, nose_cone: 6, interstage: 7, structural_section: 7, wheel: 0, parachute: 0 };
// materials of the styled Apollo parts (same ids as MATERIAL)
const STYLE_MATERIAL = { sla: 6, service_module: 6, sm_shell: 6, command_module: 6, les_tower: 6, taper_interstage: 6, lm_descent: 4, lm_ascent: 8, lm_legs: 8, skirt_stage1: 7 };
const isCold = (c) => c?.kind === 'oxidizer_tank' || /lox|oxygen|hydrogen|lh2/i.test(String(c?.propellant ?? ''));
const D2R = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const rotYtoX = () => { // helper: geometry built along X -> lay along Y axis etc. via generic matrices
  const m = M4.identity(); return m;
};
const matFromCols = (a, b, c, t = [0, 0, 0]) => { const m = M4.fromBasis(a, b, c); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; };

// ---- small geometry helpers used by the part builders below (all in vehicle coordinates, +X toward the nose) ----
const rad3 = (d) => V3.norm(d);
/** thin box between two points (a strut / beam / bar) */
function beamGeo(p0, p1, t, t2, col) {
  if (Array.isArray(t2)) { col = t2; t2 = t; }
  const d = V3.sub(p1, p0), len = V3.len(d) || 1e-3, ex = V3.mul(d, 1 / len);
  let ey = V3.cross([0, 0, 1], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 1, 0], ex); ey = V3.norm(ey); const ez = V3.cross(ex, ey);
  return new Geo().append(boxGeo(0, 0, 0, len, t, t2, col), matFromCols(ex, ey, ez, V3.mul(V3.add(p0, p1), 0.5)));
}
/** frame whose local +X axis points along dir (used to aim cones, dishes, nozzles); local Y/Z are perpendicular */
function aimMat(dir, pos) {
  const ex = V3.norm(dir); let ey = V3.cross([0, 1, 0], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 0, 1], ex); ey = V3.norm(ey); const ez = V3.cross(ex, ey);
  return matFromCols(ex, ey, ez, pos);
}
const aroundX = (a, pos = [0, 0, 0]) => matFromCols([1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)], pos);
/** flat prism: polygon given in the (x, y) plane, thickness along z */
function prismGeo(poly, thick, col) {
  const g = new Geo(), h = thick / 2, n = poly.length;
  for (const [z, nz] of [[h, 1], [-h, -1]]) { const b = poly.map((p) => g.push([p[0], p[1], z], [0, 0, nz], col)); for (let i = 1; i < n - 1; i++) nz > 0 ? g.tri(b[0], b[i], b[i + 1]) : g.tri(b[0], b[i + 1], b[i]); }
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n]; const e = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(e[0], e[1]) || 1; const nr = [e[1] / l, -e[0] / l, 0];
    const v0 = g.push([a[0], a[1], h], nr, col), v1 = g.push([b[0], b[1], h], nr, col), v2 = g.push([b[0], b[1], -h], nr, col), v3 = g.push([a[0], a[1], -h], nr, col);
    g.tri(v0, v1, v2); g.tri(v0, v2, v3);
  }
  return g;
}
const darker = (c, k) => c.map((x) => x * k);

/** Nose profile from the base (x0, radius r) to the tip (x1): tangent ogive, cone or blunt (elliptical), with a slightly rounded tip. */
function noseProfile(x0, x1, r, shape, n = 14) {
  const L = x1 - x0, pts = []; const rho = (r * r + L * L) / (2 * r);
  for (let k = 0; k <= n; k++) {
    const t = L * Math.pow(1 - k / n, 1.7);                 // distance from the tip: denser sampling near the tip
    let rad;
    if (shape === 'cone') rad = r * (t / L);
    else if (shape === 'blunt') rad = r * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t / L, 2.2)));
    else rad = Math.sqrt(Math.max(0, rho * rho - (L - t) * (L - t))) + r - rho;
    rad = Math.max(0, rad); if (k === 0) rad = r;
    pts.push([x1 - t, k === n ? 0 : Math.max(rad, r * 0.012 * (1 - k / n))]);
  }
  pts.reverse(); return pts.sort((a, b) => a[0] - b[0]);
}
/** One rocket engine, exit plane at x0 (aft), chamber at x1: flared bell, rim, throat, chamber with turbopump and feed lines. */
function engineGeo(x0, x1, re, col, seg = 22) {
  const L = Math.max(x1 - x0, 0.05), lb = 0.62 * L, xt = x0 + lb, rt = 0.3 * re, rc = Math.max(rt * 1.55, 0.5 * re);
  const prof = [[x0, re * 0.965], [x0 + 0.014 * L, re * 1.03], [x0 + 0.03 * L, re]];
  for (let k = 1; k <= 9; k++) { const u = k / 9; prof.push([x0 + 0.03 * L + (lb - 0.03 * L) * u, rt + (re - rt) * Math.pow(1 - u, 0.56)]); }
  prof.push([xt + 0.07 * L, rt * 1.45], [xt + 0.14 * L, rc], [x1 - 0.09 * L, rc], [x1 - 0.03 * L, rc * 0.8], [x1, 0.001]);
  const g = revolve(prof, col, seg);
  g.append(cylinderX(xt + 0.1 * L, xt + 0.29 * L, rc * 0.42, darker(col, 0.8), 10), M4.translate(0, rc * 1.25, 0));   // turbopump
  g.append(beamGeo([xt + 0.18 * L, rc * 0.9, 0], [xt + 0.16 * L, rc * 1.25, 0], rc * 0.14, darker(col, 1.2)));
  g.append(cylinderX(x1 - 0.05 * L, x1, rc * 0.95, darker(col, 0.65), 12));                                             // gimbal block
  return g;
}
const engineCol = (c) => KIND_COLOR.engine;

/** Geometry (vehicle coordinates: +X toward the nose) for one component. Returns {geo, box:[min,max]} or null.
 *  ctx (optional): {par: placement of the parent part (or first stack part of the same group), len: vehicle length, seg: radial segments} */
export function componentGeometry(c, pl, stageIdx, ctx = {}) {
  const col = KIND_COLOR[c.kind] ?? [0.7, 0.7, 0.7];
  const r = Math.max(pl.r, 0.03), L = Math.max(pl.x1 - pl.x0, 0.02);
  const seg = ctx.seg ?? 24, par = ctx.par ?? null, R = Math.max(par?.r ?? pl.r, 0.1);
  let geo = null, box = null;
  const sc = Math.max(0.15, Math.min(1.8, R * 0.9));                    // size of small external hardware scales with the body it sits on
  if (ctx.apollo && c.style) {   // the Apollo-style Moon rocket has its own shapes (ui/lib/apollo-geo.js)
    if (c.style === 'lm_legs') return lmLegsGeometry(c, pl, ctx.legsOpen !== false);
    const a = apolloGeometry(c, pl, ctx); if (a) return a;
  }
  switch (c.kind) {
    case 'fuel_tank': case 'oxidizer_tank': case 'propellant_tank': {
      const tc = tankColor(c, stageIdx);
      // barrel with slightly domed, darker end skirts (the shader paints seams, welds and rivets on top)
      const e = Math.min(L * 0.05, r * 0.12);
      geo = revolve([[pl.x0, r * 0.955], [pl.x0 + e * 0.5, r * 0.99], [pl.x0 + e, r], [pl.x1 - e, r], [pl.x1 - e * 0.5, r * 0.99], [pl.x1, r * 0.955]], tc, seg);
      const dm = Math.min(r * 0.14, L * 0.12), tcd = darker(tc, 0.85);   // shallow domed ends: they catch sky light instead of looking like black holes from below
      geo.append(revolve([[pl.x0 - dm, 0.002], [pl.x0 - dm * 0.85, r * 0.45], [pl.x0 - dm * 0.45, r * 0.8], [pl.x0, r * 0.955]], tcd, seg)); geo.append(revolve([[pl.x1, r * 0.955], [pl.x1 + dm * 0.45, r * 0.8], [pl.x1 + dm * 0.85, r * 0.45], [pl.x1 + dm, 0.002]], tcd, seg));
      geo.append(revolve([[pl.x0 + L * 0.02, r * 1.006], [pl.x0 + L * 0.06, r * 1.006]], [0.15, 0.15, 0.17], seg));
      const dark = darker(tc, 0.55), nRing = Math.max(0, Math.min(14, Math.floor(L / (1.8 * r)) - 1));
      for (let k = 1; k <= nRing; k++) { const x = pl.x0 + (L * k) / (nRing + 1); geo.append(revolve([[x - 0.006 * r - 0.004, r * 1.004], [x + 0.006 * r + 0.004, r * 1.004]], dark, seg)); }
      const band = STAGE_BAND[stageIdx % STAGE_BAND.length]; if (L > 2.5 * r) geo.append(revolve([[pl.x1 - L * 0.13, r * 1.005], [pl.x1 - L * 0.08, r * 1.005]], band, seg));
      if (L > 1.2 * r) for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.3; // external feed line (a thin raised duct) on two sides
        if (k % 2 === 0) geo.append(boxGeo(0, 0, 0, L * 0.9, 0.025 * r + 0.006, 0.025 * r + 0.006, darker(tc, 0.7)), aroundX(a, [(pl.x0 + pl.x1) / 2, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02])); }
      if (ctx.apollo) { const lv = apolloLivery(c, pl); if (lv) geo.append(lv); }
      box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'engine': {
      const dia = (c.diameter ?? 2 * r);
      if (pl.mount === 'radial') { // strap-on boosters: n identical solid motors on the sides of the parent
        const n = Math.max(1, Math.min(c.count ?? 2, 8)), D = c.diameter ?? 0.5, Lb = c.length ?? 3, rb = D / 2; geo = new Geo();
        const off = (par?.r ?? 0.5) + rb + 0.02;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + (n === 2 ? 0 : Math.PI / n), xb = pl.xc - Lb / 2;
          const b = new Geo();
          b.append(cylinderX(xb + Lb * 0.12, xb + Lb * 0.78, rb, [0.93, 0.93, 0.95], seg));
          b.append(noseX(xb + Lb * 0.78, xb + Lb, rb, [0.93, 0.93, 0.95], 'ogive', seg));
          b.append(revolve([[xb + Lb * 0.3, rb * 1.004], [xb + Lb * 0.36, rb * 1.004]], [0.1, 0.1, 0.12], seg));
          b.append(engineGeo(xb - Lb * 0.02, xb + Lb * 0.16, rb * 0.55, [0.25, 0.25, 0.28], 14));
          geo.append(b, aroundX(a, [0, Math.cos(a) * off, Math.sin(a) * off]));
        }
        box = [[pl.xc - Lb / 2, -off - rb, -off - rb], [pl.xc + Lb / 2, off + rb, off + rb]]; break;
      }
      const n = Math.max(1, Math.min(c.count ?? 1, 19));
      if (c.solid) {
        geo = new Geo(); const cas = [0.9, 0.9, 0.92];
        geo.append(cylinderX(pl.x0 + L * 0.22, pl.x1 - L * 0.04, r * 0.98, cas, seg)); geo.append(noseX(pl.x1 - L * 0.04, pl.x1 + 1e-4 + L * 0.0, r * 0.4, cas, 'blunt', seg));
        geo.append(revolve([[pl.x0 + L * 0.5, r * 0.985], [pl.x0 + L * 0.56, r * 0.985]], [0.1, 0.1, 0.12], seg));
        geo.append(engineGeo(pl.x0, pl.x0 + L * 0.34, r * 0.6, [0.25, 0.25, 0.28], 16));
      } else if (n === 1) { geo = engineGeo(pl.x0, pl.x1, Math.min(r, dia / 2 + 0.02), engineCol(c), seg); }
      else {
        geo = new Geo(); const ring = n <= 4 ? r * 0.5 : r * 0.62, er = n <= 4 ? r * 0.44 : r * 0.28;
        const outer = n <= 1 ? 0 : n === 4 ? 4 : n <= 7 ? n - 1 : n <= 9 ? 8 : Math.min(n - 1, 12);
        geo.append(cylinderX(pl.x1 - L * 0.06, pl.x1, r * 0.97, [0.18, 0.18, 0.2], seg));                         // thrust structure
        for (let k = 0; k < n; k++) {
          const isCentre = k === 0 && n > 4; const a = isCentre ? 0 : ((k - (n > 4 ? 1 : 0)) / (n > 4 ? outer : n)) * Math.PI * 2; const rad = isCentre ? 0 : ring;
          geo.append(engineGeo(pl.x0, pl.x1 - L * 0.05, er, engineCol(c), Math.max(10, seg - 8)), M4.translate(0, rad * Math.cos(a), rad * Math.sin(a)));
        }
      }
      box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'nose_cone': geo = revolve(noseProfile(pl.x0, pl.x1, r, c.shape), col, seg).append(cylinderX(pl.x0 - 1e-4, pl.x0 + 1e-3, r, darker(col, 0.8), seg)); box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    case 'fairing': {
      const cyl = L * 0.52; geo = cylinderX(pl.x0, pl.x0 + cyl, r, col, seg); geo.append(revolve(noseProfile(pl.x0 + cyl, pl.x1, r, 'ogive'), col, seg));
      box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'interstage': {
      geo = revolve([[pl.x0, r], [pl.x0 + L * 0.12, r], [pl.x1 - L * 0.12, r * 0.985], [pl.x1, r * 0.985]], col, seg); geo.append(cylinderX(pl.x0, pl.x0 + 0.005, r, [0.3, 0.31, 0.34], seg), M4.identity());
      geo.append(revolve([[pl.x0, r * 1.003], [pl.x0 + L * 0.06, r * 1.003]], [0.1, 0.1, 0.12], seg));
      if (ctx.apollo) { geo = revolve([[pl.x0, r], [pl.x1, r]], [0.93, 0.93, 0.945], seg); geo.append(revolve([[pl.x0, r * 1.004], [pl.x0 + L * 0.34, r * 1.004]], [0.045, 0.047, 0.055], seg)); geo.append(revolve([[pl.x1 - L * 0.12, r * 1.004], [pl.x1, r * 1.004]], [0.045, 0.047, 0.055], seg)); }
      box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'decoupler': { // separation ring: grey band with an orange stripe (pyro bolts / pusher springs) between two bearing rings
      geo = cylinderX(pl.x0, pl.x1, r * 0.99, [0.36, 0.37, 0.41], seg);
      geo.append(revolve([[pl.x0, r * 1.012], [pl.x0 + L * 0.2, r * 1.012]], [0.16, 0.16, 0.18], seg)); geo.append(revolve([[pl.x1 - L * 0.2, r * 1.012], [pl.x1, r * 1.012]], [0.16, 0.16, 0.18], seg));
      geo.append(revolve([[pl.x0 + L * 0.4, r * 1.006], [pl.x0 + L * 0.6, r * 1.006]], [0.95, 0.5, 0.1], seg));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; geo.append(boxGeo(0, 0, 0, L * 0.3, r * 0.05 + 0.01, r * 0.05 + 0.01, [0.8, 0.8, 0.82]), aroundX(a, [pl.xc, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02])); }
      box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'structural_section': geo = cylinderX(pl.x0, pl.x1, r, ctx.apollo ? [0.93, 0.93, 0.945] : col, seg); if (ctx.apollo) { const lv = apolloLivery(c, pl); if (lv) geo.append(lv); } box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    case 'heat_shield': { // blunt capsule heat shield: rounded face toward -X, rim at the top
      const t = Math.max(L, r * 0.18); const dome = [[pl.x0, 0.001], [pl.x0 + t * 0.06, r * 0.36], [pl.x0 + t * 0.2, r * 0.66], [pl.x0 + t * 0.42, r * 0.88], [pl.x0 + t * 0.7, r * 0.98], [pl.x0 + t, r]];
      geo = revolve(dome, col, seg).append(frustumX(pl.x0 + t, Math.max(pl.x1, pl.x0 + t * 1.2), r, r * 0.9, darker(col, 1.5), seg)); box = [[pl.x0, -r, -r], [pl.x1, r, r]]; break;
    }
    case 'payload': case 'avionics': case 'guidance': case 'computer': case 'battery': case 'instrument': case 'sensor': case 'reaction_wheel': case 'heater': case 'mli': {
      if (pl.mount === 'internal' || pl.mount === 'stack') {
        const rr = Math.max(pl.r, 0.05), xm = (pl.x0 + pl.x1) / 2, ll = Math.max(pl.x1 - pl.x0, 0.05);
        geo = new Geo();
        if (c.kind === 'payload') {
          geo.append(cylinderX(pl.x0, pl.x1, rr, col, seg)); geo.append(revolve([[pl.x0 + ll * 0.08, rr * 1.01], [pl.x0 + ll * 0.14, rr * 1.01]], [0.2, 0.2, 0.24], seg)); geo.append(revolve([[pl.x1 - ll * 0.14, rr * 1.01], [pl.x1 - ll * 0.08, rr * 1.01]], [0.2, 0.2, 0.24], seg));
          geo.append(boxGeo(xm, 0, rr * 0.99, ll * 0.3, rr * 0.5, 0.02, [0.85, 0.86, 0.9]));
        } else if (c.kind === 'battery') { geo.append(cylinderX(pl.x0, pl.x1, rr, col, 14)); geo.append(cylinderX(pl.x1 - 0.01, pl.x1 + 0.012, rr * 0.35, [0.85, 0.85, 0.2], 10)); }
        else if (c.kind === 'reaction_wheel') { geo.append(cylinderX(pl.x0, pl.x1, rr * 1.1, [0.45, 0.46, 0.55], 18)); geo.append(cylinderX(pl.x0 - 0.004, pl.x1 + 0.004, rr * 0.5, [0.8, 0.8, 0.85], 12)); }
        else if (c.kind === 'instrument') { geo.append(boxGeo(xm, 0, 0, ll, rr * 1.5, rr * 1.5, col)); geo.append(cylinderX(0, rr * 0.8, rr * 0.5, [0.05, 0.05, 0.08], 12), aimMat([0, 0, 1], [xm, 0, rr * 0.75])); geo.append(cylinderX(0, 0.01, rr * 0.35, [0.3, 0.5, 0.9], 12), aimMat([0, 0, 1], [xm, 0, rr * 0.75 + rr * 0.8])); }
        else if (c.kind === 'sensor') { geo.append(cylinderX(pl.x0, pl.x1, rr, [0.3, 0.3, 0.34], 14)); geo.append(sphereGeo(rr * 0.8, col, 10, 6), M4.translate(pl.x1, 0, 0)); }
        else geo.append(boxGeo(xm, 0, 0, ll, rr * 1.5, rr * 1.5, col));
        box = [[pl.x0, -rr, -rr], [pl.x1, rr, rr]];
      }
      break;
    }
    case 'solar_panel': case 'radiator': {
      const a = Math.max(c.area ?? 1, 0.05), isRad = c.kind === 'radiator';
      const stowed = !isRad && !!c.deployable && !c.deployed;
      geo = new Geo(); const xm = pl.xc;
      if (!isRad && c.deployable === false) { // body-mounted cells: a curved patch hugging the hull
        const ww = Math.min(Math.sqrt(a), r * 1.6), ll = Math.min(a / ww, Math.max(ctx.len ?? 4, 1) * 0.6);
        for (const sgn of [-1, 1]) geo.append(boxGeo(xm, 0, sgn * (r + 0.008), ll, ww, 0.016, col));
        box = [[xm - ll / 2, -ww / 2, -r - 0.02], [xm + ll / 2, ww / 2, r + 0.02]]; break;
      }
      const w = Math.sqrt(a * 0.5), l = a / w;
      for (const s of [-1, 1]) {
        if (stowed) { geo.append(boxGeo(xm, 0, s * (r + 0.02), l, 0.02, 0.08, col)); continue; }
        const nSeg = Math.max(1, Math.min(6, Math.round(w / (l * 0.8)))), sw = w / nSeg, z0 = r + 0.12;
        geo.append(beamGeo([xm, 0, s * r * 0.98], [xm, 0, s * (z0 + 0.01)], 0.04, 0.04, [0.6, 0.6, 0.64]));
        for (let k = 0; k < nSeg; k++) geo.append(boxGeo(xm, 0, s * (z0 + sw * (k + 0.5)), l, 0.02, sw * 0.97, col));
        if (!isRad) geo.append(beamGeo([xm - l / 2, 0.015, s * z0], [xm - l / 2, 0.015, s * (z0 + w)], 0.03, 0.03, [0.6, 0.6, 0.64])), geo.append(beamGeo([xm + l / 2, 0.015, s * z0], [xm + l / 2, 0.015, s * (z0 + w)], 0.03, 0.03, [0.6, 0.6, 0.64]));
      }
      const ww = stowed ? 0.1 : w + 0.2;
      box = [[xm - l / 2, -0.03, -(r + ww)], [xm + l / 2, 0.03, r + ww]]; break;
    }
    case 'antenna': {
      const kind = c.antennaType ?? 'omni', gain = c.gainDbi ?? 10, s = sc, rb = pl.r; geo = new Geo(); const xm = pl.xc;
      const at = (g, dir, pos) => geo.append(g, aimMat(dir, pos));
      const base = [xm, 0, rb];
      let top = 0.3 * s;
      if (kind === 'dish') {
        const dd = Math.max(0.3, Math.min(3.2 * s + 0.1, s * (0.5 + (gain - 20) * 0.12))), dr = dd / 2, depth = dr * 0.28, tilt = V3.norm([0.4, 0, 1]);
        const prof = []; for (let k = 0; k <= 8; k++) { const u = k / 8; prof.push([depth * u * u, dr * u]); }   // paraboloid, vertex at x=0, opens toward +x
        const dish = revolve(prof, [0.9, 0.9, 0.92], 22);
        const mast = 0.35 * s + dr * 0.4;
        geo.append(beamGeo(base, [xm, 0, rb + mast], 0.04 * s + 0.01, 0.04 * s + 0.01, [0.6, 0.6, 0.64]));
        at(dish, tilt, [xm, 0, rb + mast + dr * 0.15]);
        const fp = V3.add([xm, 0, rb + mast + dr * 0.15], V3.mul(tilt, depth * 0.1 + dr * 0.5));
        geo.append(beamGeo([xm, 0, rb + mast + dr * 0.15], fp, 0.012 * s + 0.004, 0.012 * s + 0.004, [0.7, 0.7, 0.72])); geo.append(sphereGeo(0.035 * s + 0.01, [0.2, 0.2, 0.22], 8, 6), M4.translate(fp[0], fp[1], fp[2]));
        top = mast + dr * 1.2;
      } else if (kind === 'patch' || kind === 'phased') {
        const wdt = kind === 'phased' ? 0.9 * s : 0.5 * s; geo.append(boxGeo(xm, 0, rb + 0.03 * s, wdt, wdt * 0.8, 0.05 * s + 0.01, [0.9, 0.9, 0.92]));
        geo.append(boxGeo(xm, 0, rb + 0.056 * s + 0.01, wdt * 0.85, wdt * 0.65, 0.01, [0.2, 0.22, 0.3])); top = 0.1 * s;
      } else if (kind === 'horn') {
        const hl = 0.5 * s * (0.8 + gain / 30), hr = 0.2 * s * (0.6 + gain / 30);
        at(frustumX(0, hl, hr * 0.25, hr, col, 14), [0, 0, 1], [xm, 0, rb]); top = hl;
      } else if (kind === 'helix') {
        const hl = 0.9 * s; geo.append(beamGeo(base, [xm, 0, rb + hl], 0.06 * s, 0.06 * s, [0.6, 0.6, 0.64]));
        for (let k = 1; k <= 6; k++) geo.append(cylinderX(-0.012, 0.012, 0.14 * s, [0.85, 0.7, 0.3], 12), aimMat([0, 0, 1], [xm, 0, rb + hl * (k / 7.5)])); top = hl;
      } else { // omni / whip: a short mast with a rounded tip, or a long thin whip
        const wl = kind === 'whip' ? 1.1 * s : 0.5 * s; geo.append(cylinderX(0, 0.05 * s, 0.07 * s, [0.5, 0.5, 0.55], 10), aimMat([0, 0, 1], base));
        geo.append(beamGeo([xm, 0, rb + 0.05 * s], [xm, 0, rb + wl], 0.012 * s + 0.004, 0.012 * s + 0.004, col)); geo.append(sphereGeo(0.02 * s + 0.006, col, 8, 6), M4.translate(xm, 0, rb + wl)); top = wl;
      }
      box = [[xm - top * 0.6, -top * 0.6, rb - 0.05], [xm + top * 0.6, top * 0.6, rb + top + 0.1]]; break;
    }
    case 'fin': {
      geo = new Geo(); const x0 = par?.x0 ?? pl.xc - R, Rr = R, cn = Math.max(0.5, c.cnAlpha ?? 3);
      const isGrid = /grid/i.test(c.catalogId ?? c.name ?? ''), swept = /swept/i.test(c.catalogId ?? '');
      const span = Rr * (0.45 + 0.17 * Math.sqrt(cn)), cr = Rr * (isGrid ? 0.8 : 1.5), ct = cr * (swept ? 0.3 : 0.55), sw = Rr * (swept ? 1.1 : 0.5);
      const th = 0.05 * Rr + 0.015, t = 0.02 * Rr + 0.006;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const f = new Geo();
        if (isGrid) { // lattice (grid) fin on a short arm
          const s0 = Rr * 0.98, fw = span * 0.9, gy0 = s0 + span * 0.3, dz = 0.1 * Rr + 0.015;
          f.append(beamGeo([x0 + cr * 0.5, s0, 0], [x0 + cr * 0.5, gy0, 0], 0.05 * Rr + 0.01, [0.45, 0.46, 0.5]));
          f.append(boxGeo(x0 + cr / 2, gy0, 0, cr, t * 1.6, dz, [0.55, 0.56, 0.6])); f.append(boxGeo(x0 + cr / 2, gy0 + fw, 0, cr, t * 1.6, dz, [0.55, 0.56, 0.6]));
          f.append(boxGeo(x0, gy0 + fw / 2, 0, t * 1.6, fw, dz, [0.55, 0.56, 0.6])); f.append(boxGeo(x0 + cr, gy0 + fw / 2, 0, t * 1.6, fw, dz, [0.55, 0.56, 0.6]));
          for (let q = 1; q < 5; q++) { f.append(boxGeo(x0 + (cr * q) / 5, gy0 + fw / 2, 0, t, fw, dz * 0.85, [0.5, 0.5, 0.55])); f.append(boxGeo(x0 + cr / 2, gy0 + (fw * q) / 5, 0, cr, t, dz * 0.85, [0.5, 0.5, 0.55])); }
        } else { // trapezoid fin: root chord on the hull, tip chord swept forward, dark leading edge
          f.append(prismGeo([[x0, Rr * 0.97], [x0 + cr, Rr * 0.97], [x0 + sw + ct, Rr + span], [x0 + sw, Rr + span]], th, col));
          f.append(prismGeo([[x0 + cr - 0.004, Rr * 0.97], [x0 + cr + 0.012, Rr * 0.97], [x0 + sw + ct + 0.012, Rr + span], [x0 + sw + ct - 0.004, Rr + span]], th * 1.3, [0.2, 0.2, 0.23]));
        }
        geo.append(f, aroundX(a));
      }
      const e = Rr + span + 0.1; box = [[x0 - 0.1, -e, -e], [x0 + cr + sw + 0.1, e, e]]; break;
    }
    case 'landing_legs': {
      geo = new Geo(); const ll = c.legLength ?? 1, fp = c.footprintRadius ?? 1.5, n = c.catalogId === 'legs-airbag' ? 6 : 4; const hx = par ? par.x0 + Math.min(Math.max(par.x1 - par.x0, 0.2) * 0.35, ll * 1.5 + 0.4) : pl.xc;
      const t = Math.max(0.05, Math.min(0.12, ll * 0.09)), pad = Math.max(0.14, Math.min(0.5, fp * 0.14));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.PI / n, cy = Math.cos(a), sz = Math.sin(a);
        const hull = [hx, cy * R, sz * R], foot = [hx - ll, cy * (R + fp), sz * (R + fp)], knee = [hx - ll * 0.55, cy * (R + fp * 0.55), sz * (R + fp * 0.55)];
        geo.append(beamGeo(hull, foot, t, t, col));                                                            // main strut
        geo.append(beamGeo([hx + ll * 0.35, cy * R, sz * R], knee, t * 0.7, t * 0.7, darker(col, 0.85)));       // brace to the hull
        geo.append(beamGeo([hx - ll * 0.1, cy * R, sz * R], [hx - ll * 0.6, cy * (R + fp * 0.6) , sz * (R + fp * 0.6)], t * 0.5, t * 0.5, [0.85, 0.85, 0.9])); // inner damper tube
        geo.append(cylinderX(0, pad * 0.18, pad, [0.55, 0.55, 0.58], 14), aimMat([1, 0, 0], [foot[0] - pad * 0.18, foot[1], foot[2]]));   // foot pad
      }
      box = [[hx - ll - 0.1, -R - fp - pad, -R - fp - pad], [hx + ll * 0.4, R + fp + pad, R + fp + pad]]; break;
    }
    case 'parachute': { // stowed pack on the side: orange and white canister with a bridle ring (the canopy is not drawn because it is not deployed)
      geo = new Geo(); const pr = Math.max(0.06, Math.min(0.3, sc * 0.3 * (0.6 + Math.sqrt(c.dragArea ?? 20) / 25))), pL = pr * 4.5, zc = pl.r + pr * 0.9;
      geo.append(cylinderX(pl.xc - pL / 2, pl.xc + pL / 2, pr, [0.97, 0.45, 0.15], 16), M4.translate(0, 0, zc));
      geo.append(revolve([[pl.xc - pL * 0.1, pr * 1.01], [pl.xc + pL * 0.1, pr * 1.01]], [0.95, 0.95, 0.95], 16), M4.translate(0, 0, zc));
      geo.append(sphereGeo(pr, [0.97, 0.45, 0.15], 12, 6), M4.translate(pl.xc + pL / 2, 0, zc)); geo.append(boxGeo(pl.xc, 0, pl.r + 0.02, pL * 0.5, pr * 1.2, 0.04, [0.3, 0.3, 0.33]));
      box = [[pl.xc - pL / 2, -pr, pl.r], [pl.xc + pL / 2 + pr, pr, pl.r + pr * 2]]; break;
    }
    case 'rcs': { // two quad pods on opposite sides: a small block with four little nozzles
      geo = new Geo(); const q = Math.max(0.05, Math.min(0.5, sc * 0.2 * (0.7 + Math.sqrt(c.thrust ?? 90) / 40)));
      for (const sgn of [1, -1]) {
        const z = sgn * (pl.r + q * 0.35); geo.append(boxGeo(pl.xc, 0, z, q * 1.6, q * 1.0, q * 0.7, [0.55, 0.56, 0.6]));
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) {
          const dir = V3.norm([dx * 0.7, dy * 0.7, sgn * 0.7]); geo.append(frustumX(0, q * 0.55, q * 0.07, q * 0.2, [0.2, 0.2, 0.22], 8), aimMat(dir, [pl.xc + dx * q * 0.7, dy * q * 0.45, z + sgn * q * 0.25]));
        }
      }
      box = [[pl.xc - q, -q, -pl.r - q], [pl.xc + q, q, pl.r + q]]; break;
    }
    default: break;
  }
  return geo ? { geo, box } : null;
}

/** Rover drawn in the rover body frame (+X up, +Y right, +Z forward, ground at x=0). */
function roverGeometry(vehicle, q = {}) {
  const ch = vehicle.components.find((c) => c.kind === 'rover_chassis') ?? { length: 1.4, width: 0.9, height: 0.5, groundClearance: 0.25, wheelbase: 1 };
  const wh = vehicle.components.find((c) => c.kind === 'wheel') ?? { count: 6, radius: 0.15, width: 0.12 };
  const L = ch.length ?? 1.4, W = ch.width ?? 0.9, H = ch.height ?? 0.5, gc = ch.groundClearance ?? 0.25;
  const wr = wh.radius ?? 0.15, ww = wh.width ?? 0.12, n = Math.max(2, wh.count ?? 6), rows = n / 2;
  const parts = [], seg = q.seg ?? 16;
  const top = wr + gc + H, body = [0.78, 0.78, 0.8], dark = [0.2, 0.2, 0.22];
  const base = new Geo();
  base.append(boxGeo(wr + gc + H / 2, 0, 0, H, W, L, body));                                                   // main warm-electronics box
  base.append(boxGeo(top + 0.02, 0, 0, 0.04, W * 0.98, L * 0.98, [0.92, 0.92, 0.94]));                          // top deck
  base.append(boxGeo(wr + gc + H * 0.45, 0, L / 2 + 0.01, H * 0.5, W * 0.8, 0.03, [0.45, 0.45, 0.5]));          // front bulkhead
  base.append(boxGeo(wr + gc + H * 0.2, 0, 0, H * 0.12, W * 1.04, L * 0.9, dark));                              // skirt
  const mastH = Math.max(0.35, H * 1.1) + wr * 0.4, mz = L * 0.38;
  base.append(cylinderX(top, top + mastH, Math.max(0.012, W * 0.02), [0.6, 0.6, 0.64], 8), M4.translate(0, 0, mz));          // camera mast
  base.append(boxGeo(top + mastH + 0.05, 0, mz, 0.1, Math.max(0.16, W * 0.22), 0.1, [0.25, 0.25, 0.3]));                    // head
  for (const s of [-1, 1]) base.append(cylinderX(0, 0.05, 0.03, [0.1, 0.12, 0.2], 8), matFromCols([0, 0, 1], [1, 0, 0], [0, 1, 0], [top + mastH + 0.07, s * W * 0.07, mz + 0.05]));  // camera lenses
  parts.push({ id: ch.id ?? 'chassis', geo: base, box: [[wr, -W / 2, -L / 2], [top + mastH + 0.12, W / 2, L / 2]], comp: ch });
  const wg = new Geo(); const wb = ch.wheelbase ?? L * 0.8;
  const tread = Math.max(8, Math.min(18, Math.round(wr * 90))), wcol = [0.12, 0.12, 0.13];
  for (let i = 0; i < rows; i++) {
    const z = rows === 1 ? 0 : -wb / 2 + (wb * i) / (rows - 1);
    for (const s of [-1, 1]) {
      const wy = s * (W / 2 + ww / 2 + 0.03);
      const w1 = new Geo(); w1.append(cylinderX(-ww / 2, ww / 2, wr, wcol, seg)); w1.append(cylinderX(-ww / 2 - 0.004, ww / 2 + 0.004, wr * 0.55, [0.62, 0.64, 0.68], seg));
      for (let k = 0; k < tread; k++) { const a = (k / tread) * Math.PI * 2; w1.append(boxGeo(0, 0, 0, ww * 0.98, wr * 0.09 + 0.005, wr * 0.16 + 0.004, [0.08, 0.08, 0.09]), matFromCols([1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)], [0, Math.cos(a) * wr, Math.sin(a) * wr])); }
      wg.append(w1, matFromCols([0, 1, 0], [-1, 0, 0], [0, 0, 1], [wr, wy, z]));
      wg.append(beamGeo([wr, wy - s * ww * 0.4, z], [wr + gc + H * 0.5, s * W / 2, z * 0.7], Math.max(0.025, wr * 0.18), Math.max(0.025, wr * 0.18), [0.55, 0.56, 0.6]));   // suspension arm
    }
  }
  parts.push({ id: wh.id ?? 'wheels', geo: wg, box: [[0, -W / 2 - ww, -wb / 2 - wr], [2 * wr, W / 2 + ww, wb / 2 + wr]], comp: wh });
  for (const c of vehicle.components) {
    if (c.kind === 'solar_panel') {
      const a = Math.max(c.area ?? 1, 0.1), w = Math.min(W * 0.98, Math.sqrt(a)), l = Math.min(L * 0.95, a / w); const g = new Geo();
      g.append(boxGeo(top + 0.1, 0, 0, 0.03, w, l, KIND_COLOR.solar_panel)); for (const sz of [-0.3, 0.3]) g.append(beamGeo([top + 0.02, 0, sz * l], [top + 0.1, 0, sz * l], 0.03, 0.03, [0.6, 0.6, 0.64]));
      parts.push({ id: c.id, geo: g, box: [[top, -w / 2, -l / 2], [top + 0.14, w / 2, l / 2]], comp: c });
    } else if (c.kind === 'antenna') {
      const g = new Geo(); const dr = Math.max(0.12, Math.min(0.4, W * 0.28)); const az = -L * 0.3;
      g.append(beamGeo([top, 0, az], [top + 0.3, 0, az], 0.025, 0.025, [0.6, 0.6, 0.64]));
      const prof = []; for (let k = 0; k <= 7; k++) { const u = k / 7; prof.push([dr * 0.28 * u * u, dr * u]); }
      g.append(revolve(prof, [0.92, 0.92, 0.94], 16), aimMat(V3.norm([1, 0.2, 0.5]), [top + 0.32, 0, az]));
      parts.push({ id: c.id, geo: g, box: [[top, -dr, az - dr], [top + 0.3 + dr, dr, az + dr]], comp: c });
    } else if (c.kind === 'sensor' || c.kind === 'instrument') {
      const g = new Geo(); g.append(boxGeo(top + 0.15, 0, -L * 0.35, 0.3, 0.03, 0.03, [0.6, 0.6, 0.6])); g.append(boxGeo(top + 0.32, 0, -L * 0.35, 0.1, 0.16, 0.08, KIND_COLOR.instrument));
      g.append(cylinderX(0, 0.03, 0.03, [0.05, 0.05, 0.1], 8), matFromCols([0, 0, 1], [1, 0, 0], [0, 1, 0], [top + 0.32, 0, -L * 0.35 - 0.1]));
      parts.push({ id: c.id, geo: g, box: [[top, -0.1, -L * 0.35 - 0.1], [top + 0.4, 0.1, -L * 0.35 + 0.06]], comp: c });
    }
  }
  return { parts, length: top + mastH + 0.2, radius: Math.hypot(L, W) / 2 };
}

/** Meshes of one vehicle definition, one per component (so a part can be highlighted / picked / hidden after separation). */
/** Parachute canopy in unit-diameter coordinates: +X points up the lines toward the apex, lines converge at the origin. 16 alternating orange/white gores. */
function canopyGeo(infl = 1) {
  const g = new Geo(); const N = 16, M = 7, Rr = 0.5 * (0.35 + 0.65 * infl), H = 0.34 * (0.4 + 0.6 * infl), x0 = 1.15 * (0.55 + 0.45 * infl);
  const P = (a, k) => { const ph = (k / M) * 1.32; const sc = 1 + 0.045 * Math.cos(a * N) * (k / M); return [x0 + H * Math.cos(ph) * 1.0 - H * 0.0, Rr * Math.sin(ph) * sc * Math.cos(a), Rr * Math.sin(ph) * sc * Math.sin(a)]; };
  const Nrm = (a, k) => { const ph = (k / M) * 1.32; const nx = Math.cos(ph) / (H || 1), nr = Math.sin(ph) / Rr; const l = Math.hypot(nx, nr) || 1; return [nx / l, nr / l * Math.cos(a), nr / l * Math.sin(a)]; };
  for (let i = 0; i < N; i++) {
    const c = i % 2 ? [0.96, 0.95, 0.9] : [0.96, 0.42, 0.14]; const a0 = (i / N) * 6.2831853, a1 = ((i + 1) / N) * 6.2831853;
    for (let k = 0; k < M; k++) {
      const v = [P(a0, k), P(a1, k), P(a1, k + 1), P(a0, k + 1)], n = [Nrm(a0, k), Nrm(a1, k), Nrm(a1, k + 1), Nrm(a0, k + 1)];
      const id = v.map((q, j) => g.push(q, n[j], c)); g.tri(id[0], id[1], id[2]); g.tri(id[0], id[2], id[3]);
    }
    const rim = P((a0 + a1) / 2, M);   // suspension line from the skirt to the payload
    g.append(beamGeo([0, 0, 0], rim, 0.0035, 0.0035, [0.9, 0.9, 0.85]));
  }
  return g;
}

export class VehicleModel {
  constructor(gl, vehicle, opts = {}) {
    this.gl = gl; this.vehicle = vehicle; this.parts = [];
    this.isRover = vehicle.type === 'rover' || vehicle.components.some((c) => c.kind === 'rover_chassis');
    const stageIdx = new Map(); let k = 0;
    for (const c of vehicle.components) { const g = c.group ?? ''; if (/^stage\d+$/.test(g) && !stageIdx.has(g)) stageIdx.set(g, k++); }
    if (this.isRover) {
      const rv = roverGeometry(vehicle, { seg: qualityOf(opts.quality).detail ? 16 : 10 });
      this.length = rv.length; this.radius = rv.radius; this.layout = null;
      for (const p of rv.parts) { const mesh = new Mesh(gl, p.geo); this.parts.push({ id: p.id, comp: p.comp, mesh, box: p.box, group: p.comp?.group, dx0: 0, hasLayout: false }); }
      this.maxDiameter = rv.radius * 2;
    } else {
      this.layout = computeLayout(vehicle);
      this.length = Math.max(this.layout.length, 0.5); this.maxDiameter = Math.max(this.layout.maxDiameter, 0.3); this.radius = this.maxDiameter / 2;
      for (const c of vehicle.components) {
        const pl = this.layout.placements.get(c.id); if (!pl) continue;
        const par = (c.parent && this.layout.placements.get(c.parent)) || (() => { const s0 = vehicle.components.find((s) => s.mount === 'stack' && s.group === c.group && this.layout.placements.has(s.id)); return s0 ? this.layout.placements.get(s0.id) : null; })();
        const apollo = !!vehicle.meta?.apollo, cx = { par, len: this.length, seg: opts.quality === 'low' ? 14 : opts.quality === 'high' ? 32 : 24, apollo };
        const built = componentGeometry(c, pl, stageIdx.get(c.group) ?? 0, cx); if (!built) continue;
        const part = { id: c.id, comp: c, mesh: new Mesh(gl, built.geo), box: built.box, group: c.group, pl, hasLayout: true };
        if (apollo && c.style === 'lm_legs') { part.foldedMesh = new Mesh(gl, componentGeometry(c, pl, 0, { ...cx, legsOpen: false }).geo); }   // legs: open by default, folded until the mission opens them
        this.parts.push(part);
      }
    }
    for (const p of this.parts) { // material + extents for the procedural surface shader
      const k = p.comp?.kind, b = p.box, pl = p.pl;
      p.mat = k === 'engine' && p.comp.solid ? 6 : (STYLE_MATERIAL[p.comp?.style] ?? MATERIAL[k] ?? 8);
      p.cold = isCold(p.comp);
      const radial = pl?.mount === 'radial';
      p.dims = [pl && !radial ? pl.x0 : b[0][0], pl && !radial ? pl.x1 : b[1][0], radial && p.comp?.diameter ? p.comp.diameter / 2 : pl ? Math.max(pl.r, 0.03) : Math.max(Math.abs(b[1][1]), Math.abs(b[1][2]), 0.05), (hash1(p.id?.length * 7.7 + (p.id?.charCodeAt?.(p.id.length - 1) ?? 1)) * 40) % 40];
    }
    // flame: unit frustum pointing toward -X
    this.flame = new Mesh(gl, plumeGeo(18));
    this.flameCore = new Mesh(gl, plumeGeo(12));
  }
  dispose() { for (const p of this.parts) { p.mesh.dispose(); p.foldedMesh?.dispose(); } this.flame.dispose(); this.flameCore.dispose(); }
}

// ------------------------------------------------------------------------------------------------ scene view
const bodyKind = (id) => ({ earth: 0, moon: 1, mars: 2 }[id] ?? 3);
const BASE_GROUND = { earth: [0.25, 0.31, 0.17], moon: [0.4, 0.4, 0.41], mars: [0.55, 0.3, 0.18] };
const sqd = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
/** 0..1: fraction of the sun visible from pos (1 = full sun, 0 = inside the planet's shadow; ~10 km wide penumbra). */
function sunVisibility(pos, light, R) {
  const b = V3.dot(pos, light); if (b >= 0) return 1;
  const d = Math.sqrt(Math.max(0, V3.dot(pos, pos) - b * b));
  return smooth(R - 5000, R + 5000, d);
}

function invRigid(m) { // inverse of rotation+translation (no scale)
  const o = new Float32Array(16);
  o[0] = m[0]; o[1] = m[4]; o[2] = m[8]; o[4] = m[1]; o[5] = m[5]; o[6] = m[9]; o[8] = m[2]; o[9] = m[6]; o[10] = m[10];
  o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]); o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]); o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]); o[15] = 1;
  return o;
}
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xfDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
function rayBox(o, d, mn, mx) {
  let t0 = -Infinity, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < mn[a] || o[a] > mx[a]) return null; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t1 < 0 ? null : Math.max(t0, 0);
}

export class SceneView {
  constructor(canvas, { antialias = false, quality = 'medium' } = {}) {
    this.canvas = canvas; this.r = new Renderer(canvas, { antialias, quality }); this.quality = quality; try { this.dayAssist = localStorage.getItem('astra.dayAssist') !== '0'; } catch { this.dayAssist = true; } this.q = qualityOf(quality);
    this.tex = new PlanetTextures(this.r.gl, quality); this._stars = null; this._gOrigin = null; this._padKey = null;
    this.model = null; this.selected = null; this.hover = null; this.mode = 'free';
    this.cam = { yaw: 0.7, pitch: 0.28, zoom: 1, lookYaw: 0, lookPitch: 0, panX: 0, panY: 0 };
    this.showGrid = true; this.showTrajectory = true; this.showLabels = true;
    this._bind();
    this.lastFrameMs = 0; this.fps = 0;
    this.trajCache = null;
  }
  setVehicle(vehicle) {
    this.model?.dispose(); this.model = vehicle ? new VehicleModel(this.r.gl, vehicle, { quality: this.quality }) : null; this.vehicleId = vehicle?.id; this.trajCache = null; this._padKey = null; this._pStyle = null; this._pStyleKey = null;
    if (this.model && this.mode === 'free') { this.cam.zoom = 1; if (!this.flightMode) this.fitDesign(); }
  }
  /** Design view: frame the whole vehicle so it fills the view (does not change the rotation unless reset is true). */
  fitDesign(reset = false) {
    const m = this.model; if (!m) return;
    const L = m.length ?? 5, R = m.radius ?? 1, size = Math.max(L, R * 4, 1);
    this.cam.zoom = Math.max(0.15, Math.min(4, (1.65 * L - 2 * R) / (1.5 * size)));
    this.cam.panX = 0; this.cam.panY = 0;
    if (reset) { this.cam.yaw = 0.7; this.cam.pitch = 0.28; }
    this.onChange?.();
  }
  /** Design view: centre on one component and move the camera close to it. */
  focusPart(id) {
    const m = this.model; const pl = this.layout?.placements?.get(id) ?? m?.layout?.placements?.get(id); if (!m || !pl) return false;
    const L = m.length ?? 5, R = m.radius ?? 1, size = Math.max(L, R * 4, 1);
    const partSize = Math.max((pl.x1 ?? 0) - (pl.x0 ?? 0), (pl.r ?? R) * 2, 0.5);
    this.cam.panY = pl.xc - L / 2; this.cam.panX = 0;
    this.cam.zoom = Math.max(0.12, Math.min(1.2, (2.6 * partSize + 2 * R) / (1.5 * size)));
    this.onChange?.(); return true;
  }
  zoomBy(f) { this.cam.zoom = Math.max(0.05, Math.min(6, this.cam.zoom * f)); this.onChange?.(); }
  setMode(m) { this.mode = m; }
  dispose() { this.model?.dispose(); this._canopy?.dispose(); this._padMesh?.dispose(); this.tex?.dispose(); }

  _bind() {
    const c = this.canvas; let drag = null;
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.button === 1 || e.shiftKey }; try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      // the designer may claim the gesture (dragging the selected part); everything else orbits the camera
      if (this.dragHook && !this.flightMode) { const lp = localPoint(c, e); if (this.dragHook.start(this.pick(lp.x, lp.y), e)) drag.hooked = true; }
    });
    c.addEventListener('pointermove', (e) => {
      if (drag?.hooked) { this.dragHook.move(e); return; }
      if (drag?.pan && !this.flightMode) {
        const kk = localPoint(c, e).k; const dx = (e.clientX - drag.x) / kk, dy = (e.clientY - drag.y) / kk; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        const k = (this._lastCam?.d ?? 10) * 0.0013; this.cam.panX -= dx * k; this.cam.panY += dy * k; this.onChange?.(); return;
      }
      if (drag) {
        const kk = localPoint(c, e).k; const dx = (e.clientX - drag.x) / kk, dy = (e.clientY - drag.y) / kk; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.mode === 'onboard') { this.cam.lookYaw -= dx * 0.004; this.cam.lookPitch = Math.max(-1.2, Math.min(1.2, this.cam.lookPitch + dy * 0.004)); }
        else { this.cam.yaw -= dx * 0.006; this.cam.pitch = Math.max(-1.5, Math.min(1.5, this.cam.pitch + dy * 0.006)); }
        this.onChange?.();
      } else if (this.onHover) { const lp = localPoint(c, e); this.onHover(this.pick(lp.x, lp.y), e); }
    });
    c.addEventListener('pointerup', (e) => {
      if (drag?.hooked) { this.dragHook.end(e); drag = null; return; }
      if (drag && drag.moved < 4 && this.onPick) { const lp = localPoint(c, e); this.onPick(this.pick(lp.x, lp.y), e); }
      drag = null;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); const lo = this.flightMode ? 0.02 : 0.05, hi = this.flightMode ? 5000 : 6; this.cam.zoom = Math.max(lo, Math.min(hi, this.cam.zoom * Math.exp(e.deltaY * 0.0012))); this.onChange?.(); }, { passive: false });
  }

  // ---------------------------------------------------------------------------------------------- design view
  designMatrices(time = 0) {
    const aspect = this.r.resize();
    const m = this.model; const L = m?.length ?? 5, R = m?.radius ?? 1;
    const size = Math.max(L, R * 4, 1);
    const yaw = this.cam.yaw, pitch = this.cam.pitch;
    let eye, target = [0, L / 2, 0], up = [0, 1, 0], fov = 0.8;
    const d = size * 1.5 * this.cam.zoom + R * 2;
    switch (this.mode) {
      case 'chase': eye = [d * 0.55, L * 0.72, d * 0.85]; break;
      case 'onboard': { const ly = this.cam.lookYaw ?? 0; eye = [0, L + 0.6, 0]; target = [Math.sin(ly) * 30, L + 0.6 - 2, Math.cos(ly) * 30]; fov = 1.25; break; }
      case 'ground': eye = [d * 1.2, 1.7, d * 1.2]; target = [0, L * 0.5, 0]; fov = 0.9; break;
      case 'top': eye = [0, L / 2 + d * 1.4, 0]; target = [0, L / 2, 0]; up = [0, 0, -1]; break;
      case 'side': eye = [0, L / 2, d * 1.5]; target = [0, L / 2, 0]; fov = 0.6; break;
      case 'orbit': eye = [Math.cos(time * 0.0003) * d * 1.3, L * 0.9, Math.sin(time * 0.0003) * d * 1.3]; break;
      default: eye = [Math.cos(pitch) * Math.sin(yaw) * d, L / 2 + Math.sin(pitch) * d, Math.cos(pitch) * Math.cos(yaw) * d];
    }
    if (this.mode !== 'onboard' && (this.cam.panX || this.cam.panY)) {
      const f = V3.norm(V3.sub(target, eye)); let rt = V3.cross(f, up); const rl = V3.len(rt); rt = rl > 1e-6 ? V3.mul(rt, 1 / rl) : [1, 0, 0];
      const off = V3.add(V3.mul(rt, this.cam.panX), [0, this.cam.panY, 0]); eye = V3.add(eye, off); target = V3.add(target, off);
    }
    const proj = M4.perspective(fov, aspect, Math.max(0.02, d * 0.01), d * 40 + 200);
    const view = M4.lookAt(eye, target, up);
    return { vp: M4.mul(proj, view), eye, view, proj, aspect, L, d };
  }
  /** Canvas position (CSS px) of a point given in vehicle coordinates, in the design view. null if it is behind the camera. */
  projectDesign(p) {
    const cam = this._lastCam ?? this.designMatrices(); const w = xf(this.designModel(), p); const m = cam.vp;
    const X = m[0] * w[0] + m[4] * w[1] + m[8] * w[2] + m[12], Y = m[1] * w[0] + m[5] * w[1] + m[9] * w[2] + m[13], W = m[3] * w[0] + m[7] * w[1] + m[11] * w[2] + m[15];
    if (W <= 1e-6) return null;
    return { x: (X / W * 0.5 + 0.5) * this.canvas.clientWidth, y: (0.5 - Y / W * 0.5) * this.canvas.clientHeight };
  }
  designModel() { // vehicle X -> world Y
    return M4.rotZ(Math.PI / 2);
  }
  drawDesign(time = 0, opts = {}) {
    this.r.postOn = this.gfx.post; const on = this.r.postBegin(); let res; try { res = this._drawDesign(time, opts); } finally { if (on) this.r.postEnd({ bloom: 0.3, vignette: 0.22, threshold: 0.8 }); } return res;
  }
  /** Builder backdrop: stars, the Earth's bright limb with its blue atmosphere glow, and the Sun, like a rocket photographed in orbit. */
  _designSky(cam, r) {
    try {
      const R = 6371e3, H = 220e3, fov = 2 * Math.atan(1 / cam.proj[5]);
      const sunDir = V3.norm([0.55, 0.62, -0.55]);
      const projF = M4.perspective(fov, cam.aspect, 2e3, 4e7), vpF = M4.mul(projF, cam.view);
      const rot = new Float32Array(cam.view); rot[12] = rot[13] = rot[14] = 0;
      const projS = M4.perspective(fov, cam.aspect, 1, 1e7), vpS = M4.mul(projS, rot);
      r.drawStars(vpS, 1, this._starData()); r.drawSkyDome(vpS, this.tex.sky(), 0.8);
      const centre = [cam.eye[0], cam.eye[1] - (R + H), cam.eye[2]];
      const tex = this.tex.get('earth');
      r.drawPlanet(M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.scale(R)), vpF, { kind: 0, light: sunDir, eye: cam.eye, tex, fill: 0.04 });
      r.drawAtmosphere(centre, vpF, { a: atmoOf('earth'), R: R / 1000, alt0: H / 1000, eye: cam.eye, up: [0, 1, 0], light: sunDir, steps: this.q.atmoSteps, expo: 0.2 });
      r.drawSun(sunDir, vpS, { proj: projS, color: [1, 0.95, 0.85], glow: 1 });
      r.clearDepth();
    } catch (e) { r.drawBackdrop([0.016, 0.034, 0.04], [0.11, 0.22, 0.19], 1); }
  }
  _drawDesign(time = 0, opts = {}) {
    const r = this.r, m = this.model;
    this.flightMode = false;
    const cam = this.designMatrices(time); this._lastCam = cam;
    r.begin(opts.clear ?? [0.035, 0.055, 0.05]);
    if (!opts.clear) {
      if (this.q.stars !== 0) this._designSky(cam, r);
      else r.drawBackdrop([0.016, 0.034, 0.04], [0.11, 0.22, 0.19], 1);   // soft studio gradient instead of a flat colour
    }
    // studio lighting: warm key light from above-front, cool fill from the opposite side, hemisphere ambient with a bright "floor bounce"
    const lightD = V3.norm([cam.eye[0] * 0.6 + 0.4 * cam.d, cam.eye[1] + cam.d, cam.eye[2] * 0.6 + 0.3 * cam.d]);
    const fillD = V3.norm([-lightD[0], 0.3, -lightD[2]]);
    const env = { eye: cam.eye, up: [0, 1, 0], sky: [0.36, 0.375, 0.41], ground: [0.22, 0.215, 0.2], sun: [1.22, 1.1, 0.92], px: 2 / (cam.proj[5] * Math.max(1, this.canvas.height)), fill: fillD, fillCol: [0.30, 0.36, 0.50] };
    r.setEnv(env);
    const half = Math.max(cam.L * 2, 10), step = half > 60 ? 10 : half > 25 ? 5 : 1;
    const hgt = Math.max(cam.L, 1);
    if (m && this.q.reflect && this.showGrid) { // soft floor reflection: the mirrored vehicle, faint and fading with depth
      r.setEnv({ ...env, eye: [cam.eye[0], -cam.eye[1], cam.eye[2]], up: [0, -1, 0], fill: [fillD[0], -fillD[1], fillD[2]] });
      this._drawParts(M4.mul(M4.scale(1, -1, 1), this.designModel()), cam.vp, [lightD[0], -lightD[1], lightD[2]], () => true, { ...opts, ambient: 0.42, alpha: 0.2, flip: true, mirror: hgt * 0.3, frost: 0.0 });
      r.setEnv(env);
    }
    if (this.showGrid) {
      // light pool on the floor, grid that fades out with distance, coloured axes
      r.drawDisc([0, 0, 0], half * 0.8, cam.vp, { color: [0.14, 0.60, 0.46, 0.26], inner: 0.02 });
      r.drawDisc([0, 0, 0], Math.max(cam.L * 0.9, 3), cam.vp, { color: [0.75, 1.0, 0.9, 0.10], inner: 0.0, y: 0.002 });
      const g = [];
      for (let x = -half; x <= half + 1e-6; x += step) { g.push(x, 0, -half, x, 0, half, -half, 0, x, half, 0, x); }
      r.drawLines(new Float32Array(g), cam.vp, { mode: 'lines', color: [0.22, 0.48, 0.40, 0.5], fade: half });
      r.drawLines(new Float32Array([-half, 0, 0, half, 0, 0]), cam.vp, { mode: 'lines', color: [0.9, 0.3, 0.3, 0.6], fade: half });
      r.drawLines(new Float32Array([0, 0, -half, 0, 0, half]), cam.vp, { mode: 'lines', color: [0.3, 0.5, 0.9, 0.6], fade: half });
      r.drawLines(new Float32Array([0, 0, 0, 0, half, 0]), cam.vp, { mode: 'lines', color: [0.3, 0.9, 0.5, 0.35] });
    }
    if (m) {
      r.drawDisc([0, 0, 0], Math.max(m.radius * 3.0, 0.8) + cam.L * 0.05, cam.vp, { color: [0, 0, 0, 0.6], inner: 0.0, y: 0.001 });   // soft contact shadow
      // cast shadow of the key light: a soft streak lying on the floor, pointing away from the light
      const hz = Math.hypot(lightD[0], lightD[2]) || 1e-3, len = Math.min(cam.L * 1.6, cam.L * hz / Math.max(lightD[1], 0.25));
      r.drawShadow([0, 0.003, 0], [-lightD[0] / hz, 0, -lightD[2] / hz], [0, 1, 0], [-lightD[2] / hz, 0, lightD[0] / hz], len, Math.max(m.radius * 2.3, 0.4), cam.vp, 0.32);
    }
    if (!m) return cam;
    const model = M4.mul(this.designModel(), M4.identity());
    this._drawParts(model, cam.vp, lightD, () => true, { ...opts, ghostFairing: true, ambient: 0.42, frost: opts.frost ?? 0.0 });
    if (opts.showCG && opts.cgX != null) {
      const p = xf(model, [opts.cgX, 0, 0]);
      r.drawLines(new Float32Array(p), cam.vp, { mode: 'points', size: 10, color: [1, 0.2, 0.2, 1], depth: false });
    }
    return cam;
  }
  /** The part's own placement matrix without the vehicle model (partModel is model-relative, so factor it out). */
  _partLocal(p, layoutNow) { return this._partModel(p, M4.identity(), layoutNow) ?? M4.identity(); }
  _partModel(p, model, layoutNow) {
    if (!p.hasLayout || !layoutNow) return model;
    const pl = layoutNow.placements.get(p.id); if (!pl) return null;
    if (pl.flip) {   // docked upside down: turn the part half a turn about the Z axis through its old centre, then move it to its new place
      const c0 = (p.pl.x0 + p.pl.x1) / 2, c1 = (pl.x0 + pl.x1) / 2;
      return M4.mul(model, M4.mul(M4.translate(c0 + c1, 0, 0), M4.rotZ(Math.PI)));
    }
    const dx = pl.x0 - p.pl.x0;
    return dx ? M4.mul(model, M4.translate(dx, 0, 0)) : model;
  }
  /** Transposition playback: the command/service module leaves the adapter, turns round, docks with the lunar module and pulls it out. Matrix in vehicle coordinates (identity for other parts). */
  _choreoExtra(p, layoutNow, ch) {
    const g = p.group; const csm = g === 'sm' || g === 'cm', lm = g === 'lma' || g === 'lmd';
    if (!csm && !lm) return null;
    const lay = layoutNow ?? this.model.layout;
    let c0 = Infinity, c1 = -Infinity, l1 = -Infinity;
    for (const q of this.model.parts) { const pl = lay.placements.get(q.id); if (!pl || pl.mount === 'radial') continue; if (q.group === 'sm' || q.group === 'cm') { c0 = Math.min(c0, pl.x0); c1 = Math.max(c1, pl.x1); } else if (q.group === 'lma' || q.group === 'lmd') l1 = Math.max(l1, pl.x1); }
    if (!(c1 > c0)) return null;
    const Lc = c1 - c0, cc = (c0 + c1) / 2, far = Lc * 2.2, pull = Lc * 1.2, e = (t) => t * t * (3 - 2 * t), q = Math.max(0, Math.min(1, ch.p));
    if (lm) return q > 0.75 ? M4.translate(pull * e((q - 0.75) / 0.25), 0, 0) : null;
    let dx = 0, ang = 0;
    if (q < 0.25) dx = far * e(q / 0.25);
    else if (q < 0.5) { dx = far; ang = Math.PI * e((q - 0.25) / 0.25); }
    else if (q < 0.75) { ang = Math.PI; dx = far * (1 - e((q - 0.5) / 0.25)); }
    else { ang = Math.PI; dx = pull * e((q - 0.75) / 0.25); }
    return M4.mul(M4.translate(dx, 0, 0), M4.mul(M4.translate(cc, 0, 0), M4.mul(M4.rotZ(ang), M4.translate(-cc, 0, 0))));
  }
  _drawParts(model, vp, light, filter, o = {}) {
    const m = this.model; if (!m) return;
    const order = o.ghostFairing ? [...m.parts.filter((p) => p.comp?.kind !== 'fairing'), ...m.parts.filter((p) => p.comp?.kind === 'fairing')] : m.parts;
    const r = this.r;
    for (const p of order) {
      if (!filter(p)) continue;
      let pm = this._partModel(p, model, o.layoutNow); if (!pm) continue;
      if (o.choreo?.id === 'transposition') { const ex = this._choreoExtra(p, o.layoutNow, o.choreo); if (ex) pm = M4.mul(model, M4.mul(ex, this._partLocal(p, o.layoutNow))); }
      const sel = this.selected === p.id, hov = this.hover === p.id;
      const kind = p.comp?.kind;
      const eng0 = kind === 'engine';
      const slaGhost = p.comp?.style === 'sla' && o.flight;
      const ghost = (o.ghostFairing && kind === 'fairing' && !sel) || slaGhost;
      const dbl = ghost || kind === 'solar_panel' || kind === 'radiator' || kind === 'fin' || kind === 'antenna' || eng0;
      const eng = kind === 'engine' && !p.comp.solid;
      const d = { light, tint: sel ? [1.5, 1.35, 0.7] : hov ? [1.25, 1.25, 1.4] : [1, 1, 1], ambient: o.ambient ?? 0.38, emissive: sel ? 0.12 : 0, metal: (kind === 'engine' && p.comp.solid) ? 0.3 : (METAL[kind] ?? 0.12), glow: o.glow, alpha: ghost ? 0.28 : (o.alpha ?? 1), doubleSided: dbl,
        mat: p.mat, dims: p.dims, fx: [p.cold ? (o.frost ?? 0) : 0, eng ? (o.hot ?? 0) : 0, eng ? (o.soot ?? 0) : 0, 0], flip: o.flip, mirror: o.mirror };
      if (o.halves && (kind === 'fairing' || (kind === 'nose_cone' && p.group === 'fairing'))) { // jettisoned fairing: two shells swing apart
        const ang = o.halves.ang, off = o.halves.off, hx = p.dims[0];
        for (const s of [-1, 1]) {
          const hinge = M4.mul(M4.translate(hx, 0, s * p.dims[2]), M4.mul(M4.rotY(-s * ang), M4.translate(-hx, 0, -s * p.dims[2])));
          r.drawMesh(p.mesh, M4.mul(pm, M4.mul(M4.translate(0, 0, s * off), hinge)), vp, { ...d, half: s, doubleSided: true });
        }
        continue;
      }
      r.drawMesh(p.foldedMesh && o.deployed && !o.deployed.has(p.id) ? p.foldedMesh : p.mesh, pm, vp, d);
    }
  }
  /** Part under a canvas position (CSS pixels) in the design view. */
  pick(px, py) {
    if (!this.model || this.flightMode) return null;
    const cam = this._lastCam ?? this.designMatrices();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    const inv = invRigid(cam.view);
    const p = cam.proj; const dirView = V3.norm([nx / p[0], ny / p[5], -1]);
    const o = xf(inv, [0, 0, 0]), d = xfDir(inv, dirView);
    const mm = invRigid(this.designModel());
    const ol = xf(mm, o), dl = xfDir(mm, d);
    let best = null, bt = Infinity;
    for (const part of this.model.parts) {
      const t = rayBox(ol, dl, part.box[0], part.box[1]);
      if (t != null && t < bt) { bt = t; best = part.id; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------------- flight view
  /**
   * state: {frame (telemetry row / sim.now), removed:Set, bodyId, time (epoch+t), site:{lat,lon}(deg), traj:{tel, idx}, thrustRef, orbit:{mu, r, v}, flame:bool}
   */
  /** Visual-only effects switches (kept in localStorage 'astra.gfx'): {post:false} turns bloom/vignette off, {shake:false} turns camera shake / speed blur off. */
  get gfx() { if (!this._gfx) { let g = {}; try { g = JSON.parse(localStorage.getItem('astra.gfx') || '{}') || {}; } catch { /* ignore */ } this._gfx = { post: g.post !== false, shake: g.shake !== false }; } return this._gfx; }
  setGfx(o) { Object.assign(this.gfx, o); this.r.postOn = this.gfx.post; try { localStorage.setItem('astra.gfx', JSON.stringify(this.gfx)); } catch { /* ignore */ } }
  drawFlight(state, nowMs = 0) {
    this.r.postOn = this.gfx.post;
    const on = this.r.postBegin(); this._fx = { blur: 0, tint: null }; let res;
    try { res = this._drawFlight(state, nowMs); }
    finally { if (on) this.r.postEnd({ bloom: 0.5, vignette: 0.3, blur: this._fx.blur, tint: this._fx.tint ?? undefined }); }
    return res;
  }
  _drawFlight(state, nowMs = 0) {
    this.flightMode = true;
    const r = this.r, m = this.model;
    const aspect = r.resize();
    const f = state.frame; if (!f) { r.begin([0, 0, 0]); return; }
    const bodyId = state.bodyId ?? 'earth';
    const body = getBody(bodyId); const R = body.radius;
    const pos = [f.x, f.y, f.z], rr = V3.len(pos), upV = V3.mul(pos, 1 / rr);
    // height above the real ground (terrain included) on bodies where the sphere is not the ground: the Moon has hills and craters, so the sphere altitude can be -50 m at a safe touchdown
    const alt = (bodyId !== 'earth' && Number.isFinite(f.radarAlt) && rr - R < 60000) ? f.radarAlt : rr - R;
    const fr = localFrame(pos);
    const q = [f.qw, f.qx, f.qy, f.qz];
    const axis = V3.rotQ(q, [1, 0, 0]);
    const vel = [f.vx, f.vy, f.vz];
    const sd = (() => { try { return sunDirection(bodyId, state.time ?? 0); } catch { return [1, 0, 0]; } })();
    let light = V3.norm(sd);
    // "Always bright": near a surface the scene keeps the Sun at least about 25 degrees up, so launches, landings and surface scenes are never watched in the dark (visual only, the physics keeps the real Sun)
    if (this.dayAssist !== false && alt < 150e3) {
      const want = 0.42, k = 1 - smooth(4e4, 1.5e5, alt);
      if (V3.dot(upV, light) < want && k > 0) {
        let lo = 0, hi = 1; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; V3.dot(upV, V3.norm(V3.add(V3.mul(light, 1 - mid), V3.mul(upV, mid)))) < want ? (lo = mid) : (hi = mid); }
        light = V3.norm(V3.add(V3.mul(light, 1 - hi * k), V3.mul(upV, hi * k)));
      }
    }
    const sunUp = V3.dot(upV, light);
    const removed = state.removed ?? new Set();
    const layoutNow = m && !m.isRover ? computeLayout(m.vehicle, removed) : null;
    const L = layoutNow ? Math.max(layoutNow.length, 1) : (m?.length ?? 10);
    const cgX = layoutNow ? (state.cgX ?? layoutNow.length / 2) : 0;
    const drop = layoutNow ? cgX * (1 - Math.min(1, Math.max(0, (alt - 20) / 1500))) : (m?.isRover ? 0.35 : 0);   // visual only: the physics puts the centre of mass on the ground at rest
    // ---- camera (vehicle-relative inertial coordinates) ----
    const cam = this._flightCamera(state, { pos, rr, upV, fr, axis, vel, alt, R, L, f, drop, light, cgX }, aspect);
    // ---- atmosphere seen from the camera ----
    const A = body.atmosphereModel?.hasAtmosphere ? atmoOf(bodyId) : null;
    const eyeW = V3.add(pos, cam.eye), eyeR = V3.len(eyeW) || 1, eyeAlt = Math.max(0, eyeR - R);
    const eyeUp = V3.mul(eyeW, 1 / eyeR), sunE = V3.dot(eyeUp, light);
    const sky = A ? skyState(bodyId, R, eyeAlt, sunE) : null;
    const tex = this.tex.get(bodyId);                       // generated lazily; null -> procedural shader fallback
    r.begin([0, 0, 0]);
    // ---- far pass: stars, Milky Way, planet, clouds, atmosphere, sun, trajectory ----
    const distSurf = Math.max(eyeAlt, 1);
    const farNear = Math.max(5, Math.min(distSurf * 0.2, 5e5)), farFar = Math.max(R * 8 + V3.len(cam.eye) * 2, 1e7);
    const projFar = M4.perspective(cam.fov, aspect, farNear, farFar);
    const vpFar = M4.mul(projFar, cam.view);
    const rot = new Float32Array(cam.view); rot[12] = rot[13] = rot[14] = 0;
    const projStars = M4.perspective(cam.fov, aspect, 1, 1e7);
    const vpStars = M4.mul(projStars, rot);
    const starB = Math.max(0, Math.min(1, 1 - (sky ? sky.lum : 0) * 4.5));
    if (starB > 0.004) { r.drawStars(vpStars, starB, this._starData()); r.drawSkyDome(vpStars, this.tex.sky(), starB * 0.9); }
    const centre = V3.mul(pos, -1);
    const spin = (body.omega ?? 0) * (state.time ?? 0);
    const planetModel = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.mul(M4.rotZ(spin), M4.scale(R)));
    r.drawPlanet(planetModel, vpFar, { kind: bodyKind(bodyId), light, eye: cam.eye, tex, fill: (this._shot ?? this.mode) === 'orbit' ? 0.6 : 0.05 * smooth(2e4, 2e5, eyeAlt) + 0.012 });
    if (tex?.B && this.q.clouds && tex.final && eyeAlt > 9000) {
      const cm = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.mul(M4.rotZ(spin + 2e-5 * (state.time ?? 0)), M4.scale(R * 1.0018)));
      r.drawClouds(cm, vpFar, { light, tex, alpha: 0.95 * smooth(9e3, 17e3, eyeAlt) * (1 - 0.6 * smooth(3e4, 1e5, eyeAlt) * (1 - smooth(4e5, 1.5e6, eyeAlt))) });   // grazing views from low orbit: keep the cloud deck from bleaching the whole planet
    }
    if (A) r.drawAtmosphere(centre, vpFar, { a: A, R: R / 1000, alt0: eyeAlt / 1000, eye: cam.eye, up: eyeUp, light, steps: this.q.atmoSteps, expo: 1 - 0.82 * smooth(1.5e3, 95e3, eyeAlt) });
    if (!sky || sky.sunT) { // sun disc + bloom, reddened and dimmed by the air between us and it
      const T = sky?.sunT ?? [1, 1, 1];
      r.drawSun(light, vpStars, { proj: projStars, color: [Math.pow(T[0], 0.55), Math.pow(T[1], 0.55) * 0.96, Math.pow(T[2], 0.55) * 0.9], glow: 1 });
    }
    // trajectory + predicted orbit
    if (this.showTrajectory) {
      const tr = this._trajectory(state, pos);
      if (tr) r.drawLines(tr, vpFar, { color: [0.3, 0.85, 1, 0.95] });
      const orb = this._orbitLine(state, pos, R);
      if (orb) r.drawLines(orb, vpFar, { color: [1, 0.65, 0.2, 0.8], mode: 'strip' });
    }
    if (cam.marker) r.drawLines(new Float32Array([0, 0, 0]), vpFar, { mode: 'points', size: 9, color: [1, 0.3, 0.3, 1], depth: false });
    // ---- lighting environment for the vehicle / pad (hemisphere ambient: sky above, planet bounce below) ----
    const tint = this.tex.tint(bodyId, (f.lat ?? 0) * D2R, (f.lon ?? 0) * D2R);
    const groundCol = tint ? tint.rgb : (BASE_GROUND[bodyId] ?? [0.4, 0.4, 0.4]);
    const atm = A ? Math.exp(-eyeAlt / 25e3) : 0;
    const zen = sky?.zenith ?? [0, 0, 0], hor = sky?.horizon ?? [0, 0, 0];
    const illum = Math.max(0, sunUp);
    const skyAmb0 = [0, 1, 2].map((k) => [0.028, 0.034, 0.05][k] * (1 - atm) + atm * (zen[k] * 0.9 + hor[k] * 0.7) + 0.012);
    // scattered sky light is a small fraction of the direct sun and less blue than the sky looks: keeps white paint white in daylight and gives real contrast
    const skyLum = 0.3 * skyAmb0[0] + 0.59 * skyAmb0[1] + 0.11 * skyAmb0[2], dayK = atm * 0.36 * smooth(0.05, 0.6, illum);
    // never black: at night, in the planet's shadow or on the far side the scene keeps a soft moon/earth-shine fill so the mission can always be watched
    const NIGHT = [0.15, 0.17, 0.21];
    const skyAmb = skyAmb0.map((c, k) => { const g = c + (skyLum - c) * 0.3; return Math.max(g * (1 - dayK), NIGHT[k]); });
    const gndAmb = groundCol.map((c, k) => Math.max(c * (0.06 + 1.15 * illum), NIGHT[k] * 0.9 + c * 0.1));   // light bounced up from the ground: undersides are never black
    const sunCol = sky ? (sky.sunT ? sky.sunT.map((t) => Math.pow(t, 0.6) * 1.05) : [0, 0, 0]) : [1.05, 1.02, 0.96].map((c) => c * sunVisibility(pos, light, R));
    const hf = A ? (f.heatFlux ?? 0) : 0, heat = smooth(1.5e5, 2.5e6, hf);
    let glowDir = [0, 0, 1];
    if (heat > 0) { const w = body.omega ?? 0; glowDir = V3.norm([vel[0] + w * pos[1], vel[1] - w * pos[0], vel[2]]); }
    r.setEnv({ eye: cam.eye, up: upV, sky: skyAmb, ground: gndAmb, sun: sunCol, glow: [1.0 * heat * 0.75, 0.42 * heat * 0.75, 0.12 * heat * 0.75], glowDir });
    // ---- near pass: ground, pad, vehicle ----
    r.clearDepth();
    const near = Math.max(0.05, cam.near ?? 0.1);
    const projNear = M4.perspective(cam.fov, aspect, near, cam.farNear ?? 4e5);
    const vp = M4.mul(projNear, cam.view);
    const lightLocal = V3.norm(light);
    // pad position relative to the vehicle (used by the ground shader, the pad mesh and the blast dust)
    let padV = null, padFr = null;
    if (state.site && alt < 20e3) {
      const sp = surfacePointInertial(bodyId, state.site.lat * D2R, state.site.lon * D2R, state.time ?? 0, R);
      padFr = localFrame(sp); padV = V3.sub(V3.sub(sp, pos), V3.mul(padFr.up, drop));
    }
    if (eyeAlt < 90e3 || alt < 90e3) {
      const under = V3.mul(upV, -alt - drop);                  // surface point below the vehicle, relative to the vehicle
      const fade = 1 - smooth(20e3, 85e3, eyeAlt);
      const radiusP = Math.max(3000, Math.min(3e5, eyeAlt * 10 + 4000));
      const gm = M4.mul(M4.translate(under[0], under[1], under[2]), M4.mul(M4.fromBasis(fr.east, fr.up, fr.north), M4.scale(radiusP, 1, radiusP)));
      const o = this._groundOrigin(state, f, bodyId), P = 16384;
      const dLon = ((f.lon ?? 0) - o.lon + 540) % 360 - 180;
      const ox = R * Math.cos(o.lat * D2R) * dLon * D2R, oy = R * ((f.lat ?? 0) - o.lat) * D2R;
      let base = groundCol.slice(), water = 0;
      if (bodyId === 'earth') { water = tint ? smooth(0.45, 0.85, tint.ocean) * smooth(1500, 6000, alt) : 0; if (!tint || tint.ocean > 0.3) base = BASE_GROUND.earth; }
      const base2 = bodyId === 'earth' ? mix3(base, [0.46, 0.39, 0.24], 0.45) : base.map((c) => c * 1.25);
      let pad = null;
      if (padV) { const e = V3.dot(padV, fr.east), n = V3.dot(padV, fr.north); if (Math.hypot(e, n) < 9000) pad = [e, n]; }
      // cast shadows on the ground: the vehicle (a stretched capsule along the sun direction) and the service tower
      const shadows = [];
      const lE = V3.dot(light, fr.east), lN = V3.dot(light, fr.north), lU = V3.dot(light, fr.up);
      if (lU > 0.04 && m && !cam.hideVehicle) {
        const proj = (P, hExtra = 0) => { const hg = Math.max(0, V3.dot(P, fr.up) + alt + drop + hExtra); return { x: V3.dot(P, fr.east) - lE / lU * hg, y: V3.dot(P, fr.north) - lN / lU * hg, h: hg }; };
        if (!m.isRover) {
          const pb = proj(V3.mul(axis, -cgX)), pt = proj(V3.mul(axis, L - cgX)), hh = (pb.h + pt.h) / 2;
          const D0 = layoutNow ? Math.max(0.3, layoutNow.maxDiameter) : m.maxDiameter;
          shadows.push({ seg: [pb.x, pb.y, pt.x, pt.y], w: D0 * 0.42, soft: D0 * 0.2 + 0.014 * hh, k: 0.7 * (1 - smooth(300, 3000, alt)) });
        } else {
          const pb = proj(V3.mul(axis, -0.5), 0.2), pt = proj(V3.mul(axis, 0.5), 0.2), D0 = Math.max(0.6, (m.maxDiameter ?? 1));
          shadows.push({ seg: [pb.x, pb.y, pt.x, pt.y], w: D0 * 0.5, soft: D0 * 0.25, k: 0.6 });
        }
      }
      if (lU > 0.04 && pad && this._padDims) {
        const { tx, Ht, w: tw } = this._padDims, ex = V3.dot(padFr.east, fr.east), nx = V3.dot(padFr.east, fr.north);
        const bx = pad[0] + tx * ex, by = pad[1] + tx * nx;
        shadows.push({ seg: [bx, by, bx - lE / lU * Ht, by - lN / lU * Ht], w: tw * 0.32, soft: tw * 0.25 + 0.012 * Ht, k: 0.55 });
      }
      r.drawGround(gm, vp, {
        shadows, sunV: [lE, lN, Math.max(lU, 0.05)], camH: Math.max(1.5, V3.dot(cam.eye, fr.up) + alt + drop),
        radius: radiusP, offset: [((ox % P) + P) % P, ((oy % P) + P) % P], base, base2, alpha: fade, water,
        sunCol: sunCol.map((c) => c * illum), ambCol: skyAmb.map((c) => c * 0.75), fog: sky ? sky.horizon : [0, 0, 0], fogK: sky ? 1 / 26000 : 0,
        pad, padS: Math.max(0.35, Math.min(1.6, L / 45)), kind: bodyId === 'earth' ? 0 : bodyId === 'mars' ? 2 : 1, time: nowMs * 0.001, edge: A ? 0.5 : 0.92,
      });
    }
    if (padV) this._drawPad(state, padV, padFr, vp, lightLocal, L);
    if (m && !cam.hideVehicle) {
      const model = this._flightModel(q, layoutNow, cgX, m.isRover);
      this._drawParts(model, vp, lightLocal, () => true, { layoutNow, flight: true, choreo: state.choreo, deployed: state.deployed, ambient: 0.38 + (padV && alt < 500 && illum < 0.4 ? 0.34 * (1 - alt / 500) * (1 - illum / 0.4) : 0) });
      if (state.flame && (f.thrust ?? 0) > 1 && !m.isRover) this._drawFlame(model, vp, f, state, layoutNow, nowMs);
      this._chuteCdA = state.chuteCdA ?? 0;
      if (state.chute > 0.02 && !m.isRover) this._drawChute(state.chute, { pos, vel, upV, axis, cgX, L, layoutNow, body }, vp, lightLocal);
    }
    if (m && !m.isRover && state.debris) this._drawDebris(state.debris, pos, vp, vpFar, lightLocal, r, { choreo: state.choreo, q, cgX, layoutNow });
    // ---- smoke trail, blast dust and glows (camera-facing soft sprites) ----
    if (m && !m.isRover && !cam.hideVehicle) {
      const V = cam.view, right = [V[0], V[4], V[8]], upC = [V[1], V[5], V[9]];
      const sp = this._exhaustSprites({ state, f, body, pos, alt, R, layoutNow, padV, sunCol: sunCol.map((c) => c * illum), skyAmb, eye: cam.eye, cgX, axis, vel, heat, L, nowMs });
      if (sp.smoke.length) { sp.smoke.sort((p1, p2) => sqd(p2.p, cam.eye) - sqd(p1.p, cam.eye)); r.drawSprites(sp.smoke, vp, right, upC, { add: false }); }
      if (sp.glow.length) r.drawSprites(sp.glow, vp, right, upC, { add: true });
    }
    // lens flare: only while the sun is really visible (not blocked by the planet, dimmed by thick air)
    if (this.q.flare && !cam.marker) {
      const vis = A ? (sky?.sunT ? (sky.sunT[0] + sky.sunT[1] + sky.sunT[2]) / 3 : 0) : sunVisibility(pos, light, R);
      if (vis > 0.05) r.drawFlare(light, vpStars, { strength: Math.min(1, vis) * (A ? Math.min(1, 0.25 + eyeAlt / 30e3) : 1) * 0.85, color: [1, 0.96, 0.88] });
    }
    // 2D overlay info returned to the caller
    this.lastInfo = { alt, eyeAlt, mode: this.mode, distance: V3.len(cam.eye) };
    return this.lastInfo;
  }
  _starData() { return (this._stars ??= makeStars(this.q.stars)); }
  /** Fixed local map origin (launch site when known) so the ground texture is a fixed function of latitude/longitude and never slides. */
  _groundOrigin(state, f, bodyId) {
    if (!this._gOrigin || this._gOrigin.body !== bodyId) this._gOrigin = { body: bodyId, lat: state.site?.lat ?? f.lat ?? 0, lon: state.site?.lon ?? f.lon ?? 0 };
    return this._gOrigin;
  }
  /** Jettisoned stages / fairings, flown on by physics/debris.js. Near objects are drawn as real geometry, far ones as markers. */
  _drawDebris(deb, pos, vp, vpFar, light, r, ctx = {}) {
    const m = this.model; const pts = [];
    const allGroups = [...new Set(m.vehicle.components.map((c) => c.group ?? '__none__'))];
    for (const tr of deb.tracks) {
      if (tr.reattachedAt != null && deb.t >= tr.reattachedAt) continue;
      const st = tr.stateAt(deb.t); if (!st) continue;
      if (st.impact && deb.t - st.impact.t > 90) continue;              // wreck disappears from the view after 90 s
      let rel = V3.sub(st.r, pos); let qd = st.q;
      const d = tr.d;
      if (d.companion && ctx.choreo?.id === 'docking' && ctx.q) {   // final approach and docking: the command module glides in nose to nose with the lunar module (scripted playback)
        const lay = ctx.layoutNow ?? m.layout, c = solo0(m, d, allGroups);
        let top = -Infinity; for (const q of m.parts) { const pl = lay?.placements.get(q.id); if (pl && pl.mount !== 'radial' && (q.group === 'lma' || q.group === 'lmd')) top = Math.max(top, pl.x1); }
        if (top > -Infinity && c) {
          const e = ctx.choreo.p * ctx.choreo.p * (3 - 2 * ctx.choreo.p), qT = qNormalize(qMul(ctx.q, qFromAxisAngle([0, 0, 1], Math.PI)));
          const tgt = V3.add(qRotate(ctx.q, [top - ctx.cgX + c.Lc / 2 + 0.6, 0, 0]), [0, 0, 0]);
          rel = rel.map((v, i) => v + (tgt[i] - v) * e);
          const sg = (qd[0] * qT[0] + qd[1] * qT[1] + qd[2] * qT[2] + qd[3] * qT[3]) < 0 ? -1 : 1;
          qd = qNormalize(qd.map((v, i) => v * (1 - e) + sg * qT[i] * e));
        }
      }
      const dist = V3.len(rel);
      if (dist < 4e5) {
        const solo = (tr._solo ??= computeLayout(m.vehicle, new Set(allGroups.filter((g) => !d.groups.includes(g)))));
        const model = M4.mul(M4.translate(rel[0], rel[1], rel[2]), M4.mul(M4.fromQuat(qd), M4.translate(-d.cgSolo, 0, 0)));
        this._drawParts(model, vp, light, (p) => solo.placements.has(p.id), { layoutNow: solo });
      }
      pts.push(rel[0], rel[1], rel[2]);
    }
    if (pts.length) r.drawLines(new Float32Array(pts), vpFar, { mode: 'points', size: 6, color: [1, 0.85, 0.3, 1], depth: false });
  }
  _flightModel(q, layoutNow, cgX, isRover) {
    const R = M4.fromQuat(q);
    return M4.mul(R, M4.translate(isRover ? -0.35 : -cgX, 0, 0));   // rover: body origin is the ground contact point
  }
  /** Open parachute: canopy up-wind of the vehicle's nose end, size from the real drag area of the parachute component, inflating with state.chute (0..1). */
  _drawChute(infl, C, vp, light) {
    const { pos, vel, upV, axis, cgX, L, body } = C; const m = this.model;
    const comp = m.vehicle.components.find((c) => c.kind === 'parachute'); const cda = this._chuteCdA > 0 ? this._chuteCdA : (comp?.dragArea ?? 20);   // the open canopies' real drag area (drogues first, then the mains)
    const D = Math.max(2, Math.sqrt(4 * (cda / 1.5) / Math.PI));               // canopy diameter from CdA with Cd ~ 1.5
    const w = body.omega ?? 0, air = [vel[0] + w * pos[1], vel[1] - w * pos[0], vel[2]];
    const sp = V3.len(air); const dir = sp > 2 ? V3.mul(air, -1 / sp) : upV;
    const key = Math.round(infl * 12) / 12; if (this._canopyKey !== key || !this._canopy) { this._canopy?.dispose(); this._canopy = new Mesh(this.r.gl, canopyGeo(key)); this._canopyKey = key; }
    const attach = V3.mul(axis, L - cgX);
    const model = M4.mul(matFromCols(...(() => { const ex = V3.norm(dir); let ey = V3.cross([0, 1, 0], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 0, 1], ex); ey = V3.norm(ey); return [ex, ey, V3.cross(ex, ey), attach]; })()), M4.scale(D));
    this.r.drawMesh(this._canopy, model, vp, { light, ambient: 0.5, metal: 0, doubleSided: true });
  }
  _flameGeom(f, state, layoutNow) {
    const m = this.model; const D = layoutNow ? Math.max(0.3, layoutNow.maxDiameter) : m.maxDiameter;
    let rAft = D / 2; if (layoutNow) { const first = layoutNow.stackIds[0]; const pl = layoutNow.placements.get(first); if (pl) rAft = Math.max(pl.r, 0.15); }
    const ref = Math.max(state.thrustRef ?? f.thrust, 1);
    const k = Math.min(3, Math.max(0.05, f.thrust / ref));
    const p = Math.min(1, Math.max(0, (f.rho ?? 0) / 1.225));
    return { rAft, k, vac: 1 - Math.pow(p, 0.35), p };
  }
  /** Which propellant is burning now (engine of the aft-most stage still attached). Cached per stack. */
  _plumeStyle(layoutNow) {
    const m = this.model, first = layoutNow?.stackIds?.[0] ?? '';
    if (this._pStyleKey === first && this._pStyle) return this._pStyle;
    const comps = m.vehicle.components, aft = comps.find((c) => c.id === first);
    const eng = comps.find((c) => c.kind === 'engine' && (!aft || c.group === aft.group)) ?? comps.find((c) => c.kind === 'engine');
    const pr = (eng?.propellants ?? []).join('+');
    const key = /SOLID/.test(pr) || eng?.solid ? 'solid' : /LH2/.test(pr) ? 'hydrolox' : /CH4/.test(pr) ? 'methalox' : /MMH|UDMH|N2H4|NTO/.test(pr) ? 'hypergolic' : /XENON|GN2/.test(pr) ? 'cold' : 'kerolox';
    this._pStyleKey = first; this._pStyle = PLUME_STYLES[key];
    return this._pStyle;
  }
  /**
   * Exhaust plume: length/brightness follow the actual thrust, it balloons and pales in thin air. 2.0: the colour and look follow the
   * propellant (kerolox orange and sooty, hydrogen almost invisible with bright shock diamonds, methane blue, solids white-hot ...).
   */
  _drawFlame(model, vp, f, state, layoutNow, nowMs) {
    const m = this.model; const { rAft, k, vac, p } = this._flameGeom(f, state, layoutNow);
    const S = this._plumeStyle(layoutNow);
    const len = rAft * 2 * (2.4 + 6.0 * Math.sqrt(Math.min(k, 2.5))) * (1 + 0.4 * vac) * S.len;
    const wid = rAft * 0.62 * (1 + 1.9 * vac) * (0.7 + 0.3 * Math.min(1.2, k)) * S.wid;
    const flick = 1 + 0.05 * Math.sin(nowMs * 0.05) + 0.035 * Math.sin(nowMs * 0.13);
    const t = nowMs * 0.001, x0 = 0.05, pw = Math.min(1.2, 0.35 + 0.75 * k);
    const dia = Math.min(1, (2 * vac * (1 - vac) + 0.25 * p) * S.dia);   // shock diamonds: strongest at intermediate pressures, also visible at the pad for clean-burning fuels
    const mm = M4.mul(model, M4.mul(M4.translate(x0, 0, 0), M4.scale(len * flick, wid, wid)));
    if (p > 0.3 && S.sheath > 0) this.r.drawPlume(m.flame, mm, vp, { col0: S.s0, col1: S.s1, intensity: 0.8 * pw * S.sheath * Math.min(1, (p - 0.3) * 3), rim: 1.1, fall: 1.0, time: t, colK: 1.0, alphaBlend: true });   // opaque sheath: stays visible against a bright daytime sky
    this.r.drawPlume(m.flame, mm, vp, { col0: mix3(S.a0, S.v0, vac), col1: mix3(S.a1, S.v1, vac), intensity: (0.85 - 0.45 * vac) * pw * S.glow, rim: 1.3 + 0.8 * vac, fall: 1.3, time: t, diamonds: dia, colK: 1.2 });
    const mc = M4.mul(model, M4.mul(M4.translate(x0, 0, 0), M4.scale(len * 0.5 * flick * S.coreLen, wid * 0.55, wid * 0.55)));
    this.r.drawPlume(m.flameCore, mc, vp, { col0: S.c0, col1: mix3(S.c1, [0.8, 0.8, 1.0], vac), intensity: (1.1 - 0.4 * vac) * pw * S.core, rim: 1.0, fall: 0.9, time: t * 1.3, diamonds: dia * 0.8, colK: 1.0 });
  }
  /** Soft sprites: smoke trail from the recorded path, blast dust at the pad, nozzle/ground glow, re-entry plasma. */
  _exhaustSprites(C) {
    const { state, f, body, pos, alt, layoutNow, padV, sunCol, skyAmb, eye, cgX, axis, vel, heat, L } = C;
    const smoke = [], glow = [];
    const lit = [0, 1, 2].map((k) => Math.min(1, 0.9 * (skyAmb[k] * 0.55 + sunCol[k] * 0.85) + 0.03));
    const { rAft, k, vac } = this._flameGeom(f, state, layoutNow);
    const thrusting = (f.thrust ?? 0) > 1;
    const tel = state.traj?.tel;
    if (tel && f.t != null && alt < 45e3 && tel.count > 2) {
      const T = tel.times(), TH = tel.column('thrust'), RHO = tel.column('rho'), X = tel.column('x'), Y = tel.column('y'), Z = tel.column('z'), SPD = tel.column('surfSpeed');
      const span = 55, dt = 0.3, omega = body.omega ?? 0, ref = Math.max(state.thrustRef ?? 1, 1);
      let cnt = 0;
      for (let age = 0.2; age < span && cnt < 190; age += dt) {
        const ti = f.t - age; if (ti < T[0]) break;
        const i = tel.indexAt(ti); if (i < 0) break;
        const rho = RHO[i]; if (TH[i] < 1 || rho < 3e-3) continue;
        const th = omega * (f.t - T[i]), c = Math.cos(th), s = Math.sin(th);
        const px = X[i] * c - Y[i] * s - pos[0], py = X[i] * s + Y[i] * c - pos[1], pz = Z[i] - pos[2];
        const j = cnt++; const rj = 0.25 * age + 1.5;
        const jx = (hash1(j * 3.1) - 0.5) * rj, jy = (hash1(j * 5.7 + 1) - 0.5) * rj, jz = (hash1(j * 9.3 + 2) - 0.5) * rj;
        const size = Math.min(90, Math.max(rAft * 2.4 + 0.85 * age, 0.5 * (SPD[i] || 0) * dt));
        const a = 0.36 * Math.pow(1 - age / span, 1.6) * smooth(3e-3, 0.25, rho) * Math.min(1, 0.4 + TH[i] / ref);
        smoke.push({ p: [px + jx, py + jy, pz + jz], s: size, c: [lit[0], lit[1], lit[2], a] });
      }
    }
    // condensation cloud: the air cools as it flows round the shoulders near Mach 1 in humid low air
    const mach = f.mach ?? 0, rho0 = f.rho ?? 0;
    if (body.atmosphereModel?.hasAtmosphere && !this.model.isRover && mach > 0.8 && mach < 1.6 && rho0 > 0.15 && alt < 14e3) {
      const I = smooth(0.8, 0.96, mach) * (1 - smooth(1.12, 1.6, mach)) * smooth(0.15, 0.5, rho0);
      if (I > 0.02) {
        const Dv = layoutNow ? Math.max(0.3, layoutNow.maxDiameter) : this.model.maxDiameter, len = layoutNow ? layoutNow.length : L;
        let ux = V3.cross(axis, V3.norm(pos)); if (V3.len(ux) < 0.1) ux = V3.cross(axis, [1, 0, 0]); ux = V3.norm(ux); const uy = V3.cross(axis, ux);
        const x0 = Math.max(len * 0.6, len - 2.4 * Dv) - cgX;
        for (let k = 0; k < 22; k++) {
          const a = k * 2.39996, xx = x0 - (k % 5) * Dv * 0.5, rad = Dv * (0.62 + 0.25 * hash1(k * 3.3));
          const p = V3.add(V3.mul(axis, xx), V3.add(V3.mul(ux, Math.cos(a) * rad), V3.mul(uy, Math.sin(a) * rad)));
          smoke.push({ p, s: Dv * (0.5 + 0.35 * hash1(k * 5.1)), c: [Math.min(1, lit[0] + 0.1), Math.min(1, lit[1] + 0.1), Math.min(1, lit[2] + 0.1), 0.36 * I] });
        }
      }
    }
    if (body.atmosphereModel?.hasAtmosphere && !this.model.isRover && mach > 0.93 && mach < 1.12 && rho0 > 0.15 && alt < 14e3) { // 2.6 Prandtl-Glauert ring: a thin bright vapour disc at the shoulder just as the shock forms
      const I = smooth(0.93, 0.99, mach) * (1 - smooth(1.04, 1.12, mach)) * smooth(0.15, 0.5, rho0);
      const Dv = layoutNow ? Math.max(0.3, layoutNow.maxDiameter) : this.model.maxDiameter, len = layoutNow ? layoutNow.length : L;
      let ux = V3.cross(axis, V3.norm(pos)); if (V3.len(ux) < 0.1) ux = V3.cross(axis, [1, 0, 0]); ux = V3.norm(ux); const uy = V3.cross(axis, ux);
      const xx = Math.max(len * 0.55, len - 3.2 * Dv) - cgX;
      for (let k = 0; k < 18; k++) {
        const a = k * 0.349066, rad = Dv * 0.58;
        smoke.push({ p: V3.add(V3.mul(axis, xx), V3.add(V3.mul(ux, Math.cos(a) * rad), V3.mul(uy, Math.sin(a) * rad))), s: Dv * 0.34, c: [1, 1, 1, 0.5 * I] });
      }
    }
    if (padV && thrusting && alt < 300) { // blast: dust and steam thrown out along the ground
      const I = smooth(300, 40, alt) * Math.min(1, k * 1.2 + 0.2), grow = 0.5 + 1.6 * smooth(0, 160, alt);
      const up = V3.norm(pos), east = V3.norm(V3.cross([0, 0, 1], up)), north = V3.cross(up, east);
      for (let n = 0; n < 26; n++) {
        const ang = n * 2.39996 + 0.4, rad = (8 + 62 * hash1(n * 1.7)) * grow, sz = (9 + 20 * hash1(n * 2.9 + 4)) * (0.7 + 0.5 * grow);
        const h0 = sz * 0.45 + 6 * hash1(n * 4.1) * grow;
        const off = V3.add(V3.add(V3.mul(east, Math.cos(ang) * rad), V3.mul(north, Math.sin(ang) * rad)), V3.mul(up, h0));
        const warm = 0.25 + 0.3 * hash1(n * 7.7);
        smoke.push({ p: V3.add(padV, off), s: sz, c: [Math.min(1, lit[0] * (0.95 + warm * 0.15)), lit[1] * 0.93, lit[2] * (0.84 + warm * 0.05), 0.46 * I] });
      }
      glow.push({ p: V3.add(padV, V3.mul(up, 3)), s: 34 * (1 - smooth(0, 120, alt) * 0.7), c: [1.0, 0.55, 0.2, 0.42 * I * smooth(120, 10, alt)] });
    }
    if (thrusting && !this.model.isRover) { // glare at the nozzle exit
      const nz = V3.add(V3.mul(axis, -cgX + 0.05), [0, 0, 0]);
      glow.push({ p: nz, s: rAft * (2.2 + 1.3 * Math.sqrt(k)) * (1 + 0.6 * vac), c: [1.0, 0.72, 0.4, (0.42 - 0.22 * vac) * Math.min(1, 0.4 + k)] });
    }
    if (heat > 0.05) { // re-entry plasma in front of the vehicle
      const vd = V3.norm(vel.map((v, i) => v + (i === 0 ? (body.omega ?? 0) * pos[1] : i === 1 ? -(body.omega ?? 0) * pos[0] : 0)));
      const len = layoutNow ? layoutNow.length : L, c0 = V3.mul(axis, (len * 0.5 - cgX));
      glow.push({ p: V3.add(c0, V3.mul(vd, len * 0.22)), s: Math.max(len * 0.55, 3) * (0.7 + heat), c: [1.0, 0.42, 0.12, 0.30 * heat] });
      glow.push({ p: V3.add(c0, V3.mul(vd, len * 0.3)), s: Math.max(len * 0.28, 1.5) * (0.7 + heat), c: [1.0, 0.85, 0.6, 0.30 * heat] });
    }
    return { smoke, glow };
  }
  _padParts(L, D) {
    const g = new Geo(); const Ht = Math.max(30, Math.min(150, L * 1.12 + 8));
    const STEEL = [0.60, 0.27, 0.17], GREY = [0.56, 0.57, 0.6], CONC = [0.5, 0.5, 0.48], WHITE = [0.92, 0.92, 0.94], DARK = [0.2, 0.2, 0.22];
    const beam = (p0, p1, t, col) => {
      const d = V3.sub(p1, p0), len = V3.len(d) || 1e-3, ex = V3.mul(d, 1 / len);
      let ey = V3.cross([0, 0, 1], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 1, 0], ex); ey = V3.norm(ey); const ez = V3.cross(ex, ey);
      g.append(boxGeo(0, 0, 0, len, t, t, col), matFromCols(ex, ey, ez, V3.mul(V3.add(p0, p1), 0.5)));
    };
    const yAxis = (geo) => matFromCols([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
    // hold-down plate and posts
    const rp = D * 0.75 + 2.5;
    g.append(cylinderX(0, 0.25, rp, [0.3, 0.3, 0.32], 28), yAxis());
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.append(cylinderX(0, 1.4, 0.22, DARK, 8), matFromCols([0, 1, 0], [-1, 0, 0], [0, 0, 1], [Math.cos(a) * (D * 0.5 + 0.5), 0, Math.sin(a) * (D * 0.5 + 0.5)])); }
    // service tower: lattice of four columns with rings and zig-zag bracing, beside the vehicle (east)
    const w = Math.max(4, Math.min(9, D * 0.9 + 2)), tx = D / 2 + w / 2 + 6, t = Math.max(0.35, w * 0.085);
    this._padDims = { tx, Ht, w };
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) beam([tx + sx * w / 2, 0, sz * w / 2], [tx + sx * w / 2, Ht, sz * w / 2], t, STEEL);
    const seg = Math.max(4, w * 1.25); let flip = 0;
    for (let y = 0; y + seg <= Ht + 0.01; y += seg) {
      const y1 = y + seg; flip ^= 1;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
        if (y > 0) beam([tx + ax * w / 2, y, az * w / 2], [tx + bx * w / 2, y, bz * w / 2], t * 0.6, STEEL);
        const fwd = (i + flip) % 2 === 0;
        beam([tx + (fwd ? ax : bx) * w / 2, y, (fwd ? az : bz) * w / 2], [tx + (fwd ? bx : ax) * w / 2, y1, (fwd ? bz : az) * w / 2], t * 0.5, STEEL);
      }
    }
    g.append(boxGeo(tx, Ht + 0.6, 0, w + 1.2, 1.2, w + 1.2, GREY)); beam([tx, Ht + 1.2, 0], [tx, Ht + 7, 0], 0.25, GREY);
    // umbilical arms (short, at the tower; they swing away at liftoff in reality, here they just stop short of the vehicle)
    for (const hy of [0.32, 0.6, 0.86]) g.append(boxGeo(D / 2 + 2.2, Ht * hy, 0, 4.2, 0.45, 0.7, GREY));
    // lightning masts, tanks, buildings: scaled with the vehicle so a small rocket does not sit next to an 18 m sphere
    const k = Math.max(0.4, Math.min(1.4, L / 45)); const per = new Geo();
    const pbeam = (p0, p1, t, col) => { const d = V3.sub(p1, p0), len = V3.len(d) || 1e-3, ex = V3.mul(d, 1 / len); let ey = V3.cross([0, 0, 1], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 1, 0], ex); ey = V3.norm(ey); const ez = V3.cross(ex, ey); per.append(boxGeo(0, 0, 0, len, t, t, col), matFromCols(ex, ey, ez, V3.mul(V3.add(p0, p1), 0.5))); };
    for (const [mx, mz] of [[-95, -95], [95, -95], [95, 95], [-95, 95]]) beam([mx * k, 0, mz * k], [mx * k, Ht * 1.3, mz * k], 0.5 + 0.2 * k, GREY);
    per.append(sphereGeo(9, WHITE, 24, 14), M4.translate(-150, 9, 120)); per.append(sphereGeo(9, WHITE, 24, 14), M4.translate(-118, 9, 150));
    per.append(cylinderX(0, 12, 6, [0.88, 0.88, 0.9], 20), matFromCols([0, 1, 0], [-1, 0, 0], [0, 0, 1], [-110, 24, -150]));
    for (const [lx, lz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) pbeam([-110 + lx, 0, -150 + lz], [-110 + lx * 0.8, 24, -150 + lz * 0.8], 0.6, GREY);
    per.append(boxGeo(170, 6, -70, 36, 12, 22, [0.82, 0.82, 0.8])); per.append(boxGeo(215, 4, -130, 44, 8, 26, [0.72, 0.74, 0.76])); per.append(boxGeo(-200, 5, -60, 30, 10, 20, [0.8, 0.78, 0.74]));
    per.append(boxGeo(120, 1.5, 130, 18, 3, 8, [0.3, 0.32, 0.36]));
    // pad furniture near the vehicle: fuel farm tanks, a water tower, cable ducts
    g.append(per, M4.scale(k));
    return g;
  }
  _drawPad(state, padV, padFr, vp, light, L) {
    const D = this.model?.maxDiameter ?? 2;
    const key = `${this.model?.vehicle?.id ?? ''}|${Math.round(L)}|${D.toFixed(1)}`;
    if (this._padKey !== key || !this._padMesh) { this._padMesh?.dispose(); this._padMesh = new Mesh(this.r.gl, this._padParts(L, D)); this._padKey = key; }
    const base = M4.mul(M4.translate(padV[0], padV[1], padV[2]), M4.fromBasis(padFr.east, padFr.up, padFr.north));
    this.r.drawMesh(this._padMesh, base, vp, { light, ambient: 0.36, metal: 0.3 });
  }
  _trajectory(state, pos) {
    const tr = state.traj; if (!tr || !tr.tel || tr.idx < 1) return null;
    const tel = tr.tel; const n = tr.idx + 1;
    const X = tel.column('x'), Y = tel.column('y'), Z = tel.column('z');
    const stepN = Math.max(1, Math.floor(n / 1500)); const out = [];
    for (let i = 0; i < n; i += stepN) out.push(X[i] - pos[0], Y[i] - pos[1], Z[i] - pos[2]);
    out.push(0, 0, 0);
    return new Float32Array(out);
  }
  _orbitLine(state, pos, R) {
    const o = state.orbit; if (!o || !o.mu) return null;
    const r = pos, v = [state.frame.vx, state.frame.vy, state.frame.vz];
    const rm = V3.len(r), h = V3.cross(r, v), hm = V3.len(h); if (hm < 1e-6) return null;
    const ev = V3.sub(V3.mul(V3.cross(v, h), 1 / o.mu), V3.mul(r, 1 / rm)); const e = V3.len(ev);
    if (e >= 0.999) return null;
    const p = hm * hm / o.mu; const P = e > 1e-8 ? V3.mul(ev, 1 / e) : V3.norm(r); const Q = V3.cross(V3.norm(h), P);
    const pts = [];
    for (let k = 0; k <= 160; k++) { const th = (k / 160) * Math.PI * 2; const rad = p / (1 + e * Math.cos(th)); const w = V3.add(V3.mul(P, rad * Math.cos(th)), V3.mul(Q, rad * Math.sin(th))); pts.push(w[0] - pos[0], w[1] - pos[1], w[2] - pos[2]); }
    return new Float32Array(pts);
  }
  /**
   * Director camera (2.0): picks a shot that suits the moment (pad, climb through the air, burn in space, coast, landing) and cuts to the
   * next one every 8-13 s, like a launch broadcast. Visual only.
   */
  _directorShot(state, s) {
    const now = performance.now(), v = state.frame, thrust = v.thrust ?? 0, rho = v.rho ?? 0, alt = s.alt;
    const onEarth = (state.bodyId ?? 'earth') === 'earth';
    let shots;
    if (this.model?.isRover) shots = ['chase', 'ground', 'free'];
    else if (alt < 3000 && thrust > 0 && onEarth) shots = ['ground', 'chase', 'free'];       // liftoff: tracking camera first
    else if (alt < 3000) shots = ['ground', 'chase', 'side'];                              // landing or touchdown
    else if (rho > 1e-5 && thrust > 0) shots = ['chase', 'ground', 'free', 'side'];         // climb through the air
    else if (thrust > 0) shots = ['chase', 'free', 'side'];                                // burn in space
    else shots = ['free', 'chase', 'orbit'];                                               // coast
    const key = shots.join();
    const D = this._dir;
    if (!D || D.key !== key || now - D.t0 > D.len) {
      const i = D && D.key === key ? (D.i + 1) % shots.length : 0;
      this._dir = { key, i, t0: now, len: 8000 + 5000 * ((Math.sin(now) + 1) / 2), yaw: (D?.yaw ?? 0.6) + 1.1 };
    }
    return shots[this._dir.i];
  }
  _flightCamera(state, s, aspect) {
    const { pos, upV, fr, axis, vel, alt, R, L } = s;
    const cinema = this.mode === 'cinema';
    const mode = cinema ? this._directorShot(state, s) : this.mode; this._shot = mode; const zoom = this.cam.zoom * (cinema && mode === 'chase' ? 0.85 : 1);
    const v = state.frame;
    const vRel = [v.vx, v.vy, v.vz];
    const vh = V3.norm(V3.sub(vRel, V3.mul(upV, V3.dot(vRel, upV))));
    const goodVh = V3.len(V3.sub(vRel, V3.mul(upV, V3.dot(vRel, upV)))) > 1 ? vh : fr.north;
    const size = Math.max(L, 2);
    let eye, target = [0, 0, 0], up = upV, fov = 0.85, near = Math.max(0.05, size * 0.01), marker = false, hideVehicle = false;
    const dist = size * 3.2 * zoom;
    switch (mode) {
      case 'chase': {
        let side = V3.cross(upV, axis); if (V3.len(side) < 0.2) side = V3.mul(fr.north, -1); side = V3.norm(side);
        { // film the sunlit side of the vehicle (with hysteresis so the camera does not flip back and forth)
          const sl = V3.dot(side, s.light ?? [0, 0, 0]); if (this._sideSign == null || Math.abs(sl) > 0.25) this._sideSign = sl < 0 ? -1 : 1; side = V3.mul(side, this._sideSign);
        }
        const back = V3.norm(V3.add(V3.mul(axis, -0.32), V3.add(V3.mul(side, 0.8), V3.mul(upV, 0.18))));
        eye = V3.mul(back, dist * 0.95); break;
      }
      case 'onboard': {
        const fwd = V3.rotQ([Math.cos(this.cam.lookYaw) , 0, 0], [1, 0, 0]);
        void fwd;
        const right = V3.norm(V3.cross(axis, upV)); const upA = V3.norm(V3.cross(right, axis));
        const dir = V3.norm(V3.add(V3.mul(axis, Math.cos(this.cam.lookYaw) * Math.cos(this.cam.lookPitch)), V3.add(V3.mul(right, Math.sin(this.cam.lookYaw) * Math.cos(this.cam.lookPitch)), V3.mul(upA, -Math.sin(this.cam.lookPitch)))));
        eye = V3.mul(axis, this.model?.isRover ? L * 0.5 + 0.3 : Math.max(0.5, L - (s.cgX ?? L * 0.5)) + 0.4);   // at the tip of the nose, looking out (the old fixed spot sat inside the hull of a docked stack) target = V3.add(eye, V3.mul(dir, 100)); up = upA; fov = 1.2; near = 0.05; break;
      }
      case 'ground': {
        const sp0 = state.site ? surfacePointInertial(state.bodyId ?? 'earth', state.site.lat * Math.PI / 180, state.site.lon * Math.PI / 180, state.time ?? 0, R) : V3.mul(V3.norm(pos), R);
        const sfr = localFrame(sp0);
        const site = V3.add(V3.add(sp0, V3.mul(sfr.up, 3 + 0 * s.drop)), V3.mul(V3.add(sfr.east, V3.mul(sfr.north, -0.6)), -320 * zoom));
        const rel = V3.sub(site, pos); const d = V3.len(rel);
        eye = V3.sub(rel, V3.mul(sfr.up, s.drop)); up = sfr.up;
        fov = Math.max(0.006, Math.min(0.9, 2 * Math.atan((size * 3) / Math.max(d, 1))));
        const offSite = (state.bodyId ?? 'earth') !== 'earth' || d > 3e6;   // far from the launch site (Moon, deep space): film from the ground right below the vehicle instead
        if (offSite && alt < 3000) {   // a fixed camera on the surface a little way off, so a landing can be watched from the ground
          eye = V3.add(V3.mul(upV, -alt + 1.7), V3.mul(V3.norm(fr.east), Math.max(40, size * 4) * zoom)); up = upV;
          fov = Math.max(0.05, Math.min(0.9, 2 * Math.atan((size * 3) / Math.max(V3.len(eye), 1)))); near = 0.3; break;
        }
        if (alt > 400e3 || offSite) { eye = V3.add(V3.mul(upV, -alt - 2), V3.mul(V3.norm(fr.east), 5)); up = upV; fov = Math.max(0.006, Math.min(0.9, 2 * Math.atan((size * 3) / Math.max(alt, 1)))); }
        near = Math.max(0.5, d * 0.001); break;
      }
      case 'top': eye = V3.mul(upV, Math.max(dist * 1.5, size * 5 * zoom)); up = goodVh; break;
      case 'side': { const side = V3.norm(V3.cross(upV, goodVh)); eye = V3.mul(side, Math.max(dist * 2, size * 6 * zoom)); fov = 0.6; break; }
      case 'orbit': {
        const rApo = Math.max(R * 1.6, (state.frame.apo != null && Number.isFinite(state.frame.apo) ? state.frame.apo + R : 0) * 1.25, s.rr * 1.4);
        // 2.0: the map starts looking at the vehicle's side of the planet (it used to start at a fixed direction, often the far side)
        const rp = V3.len(pos) || 1, az0 = Math.atan2(pos[1], pos[0]), el0 = Math.asin(Math.max(-1, Math.min(1, pos[2] / rp)));
        const yawM = this.cam.yaw + az0 + 0.15, pitM = Math.max(-1.3, Math.min(1.3, this.cam.pitch + 0.75 * el0 + 0.15));
        const d = rApo * 2.6 * zoom; const cy = Math.cos(yawM), sy = Math.sin(yawM), cp = Math.cos(pitM), sp = Math.sin(pitM);
        const centre = V3.mul(pos, -1);
        eye = V3.add(centre, [d * cp * cy, d * cp * sy, d * sp]); target = centre; up = [0, 0, 1]; fov = 0.7; near = d * 0.001; marker = true; hideVehicle = true; break;
      }
      default: {
        const yaw = cinema ? this._dir.yaw + (performance.now() - this._dir.t0) * 0.00007 : this.cam.yaw, pitch = cinema ? 0.12 : this.cam.pitch;   // slow dolly around the vehicle
        const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
        eye = V3.add(V3.add(V3.mul(fr.east, sy * cp * dist), V3.mul(fr.north, cy * cp * dist)), V3.mul(upV, sp * dist));
      }
    }
    // keep the camera above the ground near the surface
    if (alt < 1000 && mode !== 'ground' && mode !== 'orbit') { const hgt = V3.dot(eye, upV) + alt + s.drop; const minH = mode === 'chase' ? Math.max(2, dist * 0.14) : 2; if (hgt < minH) eye = V3.add(eye, V3.mul(upV, minH - hgt)); }
    // subtle camera shake under heavy thrust in air (visual only; switch off with setGfx({shake:false}))
    if (this.q.shake && this.gfx.shake && mode !== 'orbit' && mode !== 'top' && mode !== 'ground' && (v.thrust ?? 0) > 1000 && !this.model?.isRover) {
      const ref = Math.max(state.thrustRef ?? v.thrust, 1), tk = Math.min(1.5, (v.thrust ?? 0) / ref), air = Math.min(1, (v.rho ?? 0) / 0.6) * 0.6 + 0.4 * Math.min(1, alt / 200);
      const amp = 0.0012 * tk * Math.min(1, air + 0.15) * Math.min(1, dist / 4), t = performance.now() * 0.001;
      const sh = [Math.sin(t * 61.3) + 0.6 * Math.sin(t * 107.1), Math.sin(t * 47.7 + 1.3) + 0.6 * Math.sin(t * 89.9 + 0.7), Math.sin(t * 53.1 + 2.1)];
      const dv = V3.sub(target, eye), dl = V3.len(dv) || 1, ex = V3.norm(V3.cross(dv, up));
      target = V3.add(target, V3.add(V3.mul(ex, sh[0] * amp * dl), V3.mul(up, sh[1] * amp * dl)));
      if (this._fx && this.r.postOn && this.q.post > 1 && (mode === 'chase' || mode === 'onboard')) this._fx.blur = Math.min(0.02, 0.012 * tk * Math.min(1, V3.len(vRel) / 400)) * Math.min(1, (v.rho ?? 0) / 0.05);   // speed blur only in air: in vacuum it smeared the stars into dashes
    }
    const view = M4.lookAt(eye, target, up);
    const farNear = Math.max(4e5, V3.len(eye) * 4);
    return { eye, target, up, fov, near, view, marker, hideVehicle, farNear };
  }
}

/** Length of a companion's solo stack (cached on the track data). */
function solo0(m, d, allGroups) {
  if (d._soloLc) return d._soloLc;
  const lay = computeLayout(m.vehicle, new Set(allGroups.filter((g) => !d.groups.includes(g))));
  return (d._soloLc = { Lc: lay.length });
}
