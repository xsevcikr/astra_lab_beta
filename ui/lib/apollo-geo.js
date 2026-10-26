// Shapes of the Apollo-style Moon rocket (ASTRA LAB 1.9): Saturn V livery and fins, instrument unit, tapered interstages and adapter, service module,
// command module, launch escape tower and the lunar module (descent stage, ascent stage, folded and open legs).
// Purely visual: nothing here changes a physics value. Parts are picked by the `style` tag that src/vehicles/apollo.js puts on them.
// Coordinates are vehicle coordinates: +X toward the nose, the parts are built around the X axis.
import { Geo, revolve, cylinderX, frustumX, noseX, boxGeo, sphereGeo, M4, V3 } from './gl.js';

export const WHITE = [0.93, 0.93, 0.945], BLACK = [0.045, 0.047, 0.055], GREY = [0.56, 0.57, 0.61], SILVER = [0.78, 0.8, 0.84], DARK = [0.2, 0.21, 0.24];
export const GOLD = [0.84, 0.62, 0.2], FOIL = [0.7, 0.5, 0.16], CMW = [0.86, 0.87, 0.9];
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const darker = (c, k) => c.map((x) => x * k);

/** Part of a frustum surface between two angles (a0..a1, radians): a painted stripe or panel, raised a hair above the surface. */
function sectorX(x0, x1, r0, r1, a0, a1, col, steps = 5) {
  const g = new Geo(), slope = (r1 - r0) / Math.max(x1 - x0, 1e-6), ids = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps), c = Math.cos(a), s = Math.sin(a), n = V3.norm([-slope, c, s]);
    ids.push([g.push([x0, r0 * c, r0 * s], n, col), g.push([x1, r1 * c, r1 * s], n, col)]);
  }
  for (let i = 0; i < steps; i++) { const [A, C] = ids[i], [B, D] = ids[i + 1]; g.tri(A, C, B); g.tri(B, C, D); }
  return g;
}
/** n equal stripes of angular width `w` (degrees) starting at angle `phase` (degrees). */
function stripesX(n, w, phase, x0, x1, r0, r1, col) {
  const g = new Geo(); for (let k = 0; k < n; k++) { const a = (phase + (360 / n) * k) * D2R; g.append(sectorX(x0, x1, r0, r1, a - (w / 2) * D2R, a + (w / 2) * D2R, col, 4)); } return g;
}
const band = (x0, x1, r, col, seg = 32) => revolve([[x0, r], [x1, r]], col, seg);

/** Prism with `n` flat faces around the X axis (flat shading), radius rA at x0 and rB at x1. `phase` turns it about X. */
export function polyPrismX(n, x0, x1, rA, rB, col, phase = 0, caps = true) {
  const g = new Geo(), slope = (rB - rA) / Math.max(x1 - x0, 1e-6), cosH = Math.cos(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const a0 = phase + (TAU * k) / n, a1 = phase + (TAU * (k + 1)) / n, am = (a0 + a1) / 2, nn = V3.norm([-slope * cosH, Math.cos(am), Math.sin(am)]);
    const A = g.push([x0, rA * Math.cos(a0), rA * Math.sin(a0)], nn, col), B = g.push([x0, rA * Math.cos(a1), rA * Math.sin(a1)], nn, col);
    const C = g.push([x1, rB * Math.cos(a0), rB * Math.sin(a0)], nn, col), D = g.push([x1, rB * Math.cos(a1), rB * Math.sin(a1)], nn, col);
    g.tri(A, C, B); g.tri(B, C, D);
  }
  if (caps) for (const [x, r, dx] of [[x0, rA, -1], [x1, rB, 1]]) {
    const c = g.push([x, 0, 0], [dx, 0, 0], col), ring = [];
    for (let k = 0; k <= n; k++) { const a = phase + (TAU * k) / n; ring.push(g.push([x, r * Math.cos(a), r * Math.sin(a)], [dx, 0, 0], col)); }
    for (let k = 0; k < n; k++) dx > 0 ? g.tri(c, ring[k], ring[k + 1]) : g.tri(c, ring[k + 1], ring[k]);
  }
  return g;
}
/** Thin bar between two points. */
function bar(p0, p1, t, col, t2 = t) {
  const d = V3.sub(p1, p0), len = V3.len(d) || 1e-3, ex = V3.mul(d, 1 / len);
  let ey = V3.cross([0, 0, 1], ex); if (V3.len(ey) < 0.2) ey = V3.cross([0, 1, 0], ex); ey = V3.norm(ey); const ez = V3.cross(ex, ey);
  const m = M4.fromBasis(ex, ey, ez); const mid = V3.mul(V3.add(p0, p1), 0.5); m[12] = mid[0]; m[13] = mid[1]; m[14] = mid[2];
  return new Geo().append(boxGeo(0, 0, 0, len, t, t2, col), m);
}
const aroundX = (a) => { const m = M4.identity(); m[5] = Math.cos(a); m[6] = Math.sin(a); m[9] = -Math.sin(a); m[10] = Math.cos(a); return m; };

/** Paint that goes on top of a Saturn V stage part (stripes, bands, the instrument-unit ring). Returns a Geo to append, or null. */
export function apolloLivery(c, pl) {
  const r = pl.r, x0 = pl.x0, x1 = pl.x1, L = x1 - x0, g = new Geo();
  const isTank = c.kind === 'fuel_tank' || c.kind === 'oxidizer_tank';
  if (c.style === 'instrument_unit') {   // white ring with a black belt and a ring of alternating black panels
    g.append(band(x0, x0 + L * 0.14, r * 1.004, BLACK)); g.append(band(x1 - L * 0.14, x1, r * 1.004, BLACK));
    for (let k = 0; k < 24; k += 2) { const a = (k / 24) * TAU; g.append(sectorX(x0 + L * 0.3, x0 + L * 0.7, r * 1.005, r * 1.005, a, a + TAU / 24, BLACK, 2)); }
    return g;
  }
  if (c.group === 'stage1' && isTank) {   // the S-IC roll pattern: four black stripes up the RP-1 tank and the lower LOX tank
    const rp1 = c.kind === 'fuel_tank';
    g.append(stripesX(4, 24, 45, x0 + L * 0.02, rp1 ? x1 - L * 0.02 : x0 + L * 0.42, r * 1.004, r * 1.004, BLACK));
    if (!rp1) g.append(band(x1 - L * 0.1, x1 - L * 0.04, r * 1.004, BLACK));
    return g;
  }
  if (c.group === 'stage2' && isTank) { g.append(band(x0 + L * 0.02, x0 + L * 0.07, r * 1.004, BLACK)); if (c.kind === 'oxidizer_tank') g.append(band(x1 - L * 0.12, x1 - L * 0.02, r * 1.004, BLACK)); return g; }
  if (c.group === 'stage3' && isTank) { if (c.kind === 'fuel_tank') g.append(stripesX(4, 18, 45, x0 + L * 0.03, x1 - L * 0.03, r * 1.004, r * 1.004, BLACK)); else g.append(band(x1 - L * 0.12, x1 - L * 0.03, r * 1.004, BLACK)); return g; }
  return null;
}

/** Geometry of a styled part. Returns {geo, box} or null when the style is not one of ours. */
export function apolloGeometry(c, pl, ctx = {}) {
  const seg = ctx.seg ?? 24, r = Math.max(pl.r, 0.05), x0 = pl.x0, x1 = pl.x1, L = Math.max(x1 - x0, 0.02);
  const rb = (c.diameterBottom ?? 2 * r) / 2, rt = (c.diameterTop ?? 2 * r) / 2;
  const box = [[x0, -Math.max(rb, rt), -Math.max(rb, rt)], [x1, Math.max(rb, rt), Math.max(rb, rt)]];
  let geo = null;
  switch (c.style) {
    case 'taper_interstage': {   // S-II / S-IVB interstage: a cone from 10.1 m to 6.6 m
      geo = frustumX(x0, x1, rb, rt, WHITE, seg); geo.append(band(x0, x0 + L * 0.1, rb * 1.004, BLACK)); geo.append(stripesX(4, 20, 45, x0 + L * 0.15, x1 - L * 0.1, rb * 1.004 - 0.0, rt * 1.004, BLACK)); break;
    }
    case 'skirt_stage1': {   // thrust structure of the S-IC with its four fins and engine fairings
      geo = new Geo(); geo.append(cylinderX(x0, x1, r, WHITE, seg)); geo.append(band(x0, x0 + L * 0.3, r * 1.004, BLACK));
      const R = r, base = 0.4;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + Math.PI / 4, f = new Geo();
        // fin: swept trapezoid, root on the hull, tip out at about 4.5 m beyond the hull; thick leading edge
        const y0 = R * 0.97, y1 = R + 4.5, poly = [[base, y0], [base + 8.4, y0], [base + 8.4 - 0.2, y0 + 1.6], [base + 3.4, y1], [base + 1.3, y1]];
        const th = 0.55, gg = new Geo();
        for (const [z, nz] of [[th / 2, 1], [-th / 2, -1]]) { const ids = poly.map((p) => gg.push([p[0], p[1], z], [0, 0, nz], WHITE)); for (let i = 1; i < poly.length - 1; i++) nz > 0 ? gg.tri(ids[0], ids[i], ids[i + 1]) : gg.tri(ids[0], ids[i + 1], ids[i]); }
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length], e = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(e[0], e[1]) || 1, nr = [e[1] / l, -e[0] / l, 0];
          const a1 = gg.push([p[0], p[1], th / 2], nr, i === 0 || i === 3 ? BLACK : GREY), b1 = gg.push([q[0], q[1], th / 2], nr, i === 0 || i === 3 ? BLACK : GREY), b2 = gg.push([q[0], q[1], -th / 2], nr, GREY), a2 = gg.push([p[0], p[1], -th / 2], nr, GREY);
          gg.tri(a1, b1, b2); gg.tri(a1, b2, a2);
        }
        f.append(gg);
        // engine fairing: a long teardrop over each outboard engine
        f.append(revolve([[0.0, 0.4], [1.2, 1.15], [3.2, 1.3], [6.3, 1.05], [8.0, 0.0]], WHITE, 14), M4.translate(0.1, R * 0.78, 0));
        geo.append(f, aroundX(a));
      }
      break;
    }
    case 'sla': {   // adapter panels: a white cone with four seams
      geo = frustumX(x0, x1, rb, rt, WHITE, seg);
      for (let k = 0; k < 4; k++) { const a = ((k + 0.5) / 4) * TAU; geo.append(sectorX(x0, x1, rb * 1.004, rt * 1.004, a - 0.012, a + 0.012, BLACK, 1)); }
      geo.append(band(x0, x0 + L * 0.05, rb * 1.004, GREY)); break;
    }
    case 'sm_shell': { geo = cylinderX(x0, x1, r, [0.84, 0.85, 0.88], seg); geo.append(band(x0 + L * 0.02, x0 + L * 0.06, r * 1.004, GREY)); break; }
    case 'service_module': {   // six radial bays with dark panels, white ends
      geo = new Geo(); geo.append(cylinderX(x0, x1, r, [0.83, 0.84, 0.87], seg)); geo.append(band(x0, x0 + L * 0.08, r * 1.005, WHITE)); geo.append(band(x1 - L * 0.08, x1, r * 1.005, WHITE));
      geo.append(stripesX(6, 34, 0, x0 + L * 0.16, x1 - L * 0.16, r * 1.005, r * 1.005, [0.28, 0.29, 0.33]));
      geo.append(stripesX(2, 18, 90, x0 + L * 0.2, x1 - L * 0.2, r * 1.006, r * 1.006, [0.92, 0.92, 0.94]));   // two bright radiator panels
      break;
    }
    case 'command_module': {   // the cone: 3.9 m at the base, 0.9 m docking ring on top, rounded shoulder, windows
      const R0 = rb, h = L, prof = [[x0, R0 * 0.96], [x0 + h * 0.02, R0], [x0 + h * 0.08, R0 * 0.985], [x0 + h * 0.84, rt * 1.25], [x0 + h * 0.9, rt * 1.1], [x0 + h * 0.95, rt]];
      geo = revolve(prof, CMW, seg); geo.append(cylinderX(x0 + h * 0.94, x1, rt, SILVER, 16));
      geo.append(band(x0 + h * 0.08, x0 + h * 0.12, R0 * 0.975, [0.3, 0.3, 0.34]));
      for (const s of [-1, 1]) geo.append(boxGeo(x0 + h * 0.52, 0, s * (R0 - (R0 - rt * 1.25) * 0.52 + 0.02) * 0.985, h * 0.16, h * 0.1, 0.06, [0.05, 0.07, 0.11]));
      geo.append(boxGeo(x0 + h * 0.52, (R0 - (R0 - rt * 1.25) * 0.52) * 0.985, 0, h * 0.16, 0.06, h * 0.12, [0.05, 0.07, 0.11]));
      break;
    }
    case 'les_tower': {   // escape tower: four struts, rocket motor, pitch-control motor, canards, nose
      const R = 0.52, tx = x0, top = x1;
      geo = new Geo();
      geo.append(frustumX(tx, tx + 0.4, 0.75, 0.62, WHITE, 16));
      const m0 = tx + L * 0.5, m1 = tx + L * 0.82;
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; geo.append(bar([tx + 0.3, Math.cos(a) * 0.62, Math.sin(a) * 0.62], [m0, Math.cos(a) * 0.3, Math.sin(a) * 0.3], 0.07, SILVER)); }
      for (let q = 1; q < 4; q++) { const xx = tx + 0.3 + (m0 - tx - 0.3) * (q / 4), rr = 0.62 - (0.32 * q) / 4; for (let k = 0; k < 4; k++) { const a0 = (k / 4) * TAU + Math.PI / 4, a1 = ((k + 1) / 4) * TAU + Math.PI / 4; geo.append(bar([xx, Math.cos(a0) * rr, Math.sin(a0) * rr], [xx, Math.cos(a1) * rr, Math.sin(a1) * rr], 0.04, SILVER)); } }
      geo.append(cylinderX(m0, m1, 0.32, WHITE, 20)); geo.append(band(m0 + 0.2, m0 + 0.55, 0.325, BLACK, 20));
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; geo.append(frustumX(0, 0.5, 0.05, 0.13, DARK, 8), M4.mul(M4.translate(m0 - 0.2, Math.cos(a) * 0.24, Math.sin(a) * 0.24), M4.rotZ(0))); }
      geo.append(noseX(m1, top, 0.32, WHITE, 'ogive', 20)); geo.append(band(m1 + 0.05, m1 + 0.4, 0.321, BLACK, 20));
      geo.append(boxGeo(m1 + 0.8, 0, 0.5, 0.45, 0.05, 0.4, BLACK)); geo.append(boxGeo(m1 + 0.8, 0, -0.5, 0.45, 0.05, 0.4, BLACK));
      void R; break;
    }
    case 'lm_descent': {   // octagonal descent stage wrapped in gold foil, the engine bell shows below it
      const s0 = x0 + 0.7;
      geo = new Geo(); geo.append(polyPrismX(8, s0, x1, r, r, GOLD, Math.PI / 8));
      geo.append(polyPrismX(8, s0 - 0.05, s0 + 0.3, r * 1.01, r * 1.01, FOIL, Math.PI / 8, false)); geo.append(polyPrismX(8, x1 - 0.3, x1 + 0.02, r * 1.01, r * 1.01, FOIL, Math.PI / 8, false));
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, d = r * 1.008; geo.append(boxGeo((s0 + x1) / 2, Math.cos(a) * d * 0.93, Math.sin(a) * d * 0.93, (x1 - s0) * 0.5, 0.05, 0.05, BLACK), aroundX(0)); }
      geo.append(cylinderX(x0 + 0.3, s0 + 0.1, r * 0.34, [0.25, 0.25, 0.28], 14));
      break;
    }
    case 'lm_ascent': {   // crew cabin and equipment stage: faceted, silver and gold, two triangular windows, docking tunnel on top
      const b0 = x0 + 0.1, b1 = x1 - 0.85;
      geo = new Geo(); geo.append(polyPrismX(8, b0, b1, r * 0.97, r * 0.97, SILVER, Math.PI / 8)); geo.append(polyPrismX(8, b0 + 0.5, b1 - 0.5, r * 0.99, r * 0.99, GOLD, Math.PI / 8, false));
      geo.append(polyPrismX(8, b0 - 0.02, b0 + 0.18, r * 0.99, r * 0.99, GREY, Math.PI / 8, false)); geo.append(polyPrismX(8, b1 - 0.18, b1 + 0.02, r * 0.99, r * 0.99, GREY, Math.PI / 8, false));
      for (const s of [-1, 1]) geo.append(boxGeo((b0 + b1) / 2 + 0.2, s * r * 0.34, r * 0.955, 0.55, 0.22, 0.05, [0.05, 0.07, 0.11]));
      geo.append(cylinderX(b1, x1 - 0.1, r * 0.4, SILVER, 16)); geo.append(band(x1 - 0.34, x1 - 0.24, r * 0.405, DARK, 16)); geo.append(cylinderX(x1 - 0.12, x1, r * 0.3, GREY, 14));
      geo.append(cylinderX(b0 - 0.3, b0, r * 0.28, [0.3, 0.3, 0.33], 12));
      break;
    }
    default: return null;
  }
  return { geo, box };
}

/** Landing legs of the lunar module, in the two states the 3D view switches between: folded against the descent stage, or open. */
export function lmLegsGeometry(c, pl, open) {
  const g = new Geo(), R = 2.12, hTop = pl.xc + 0.5, ll = c.legLength ?? 1.6, fp = c.footprintRadius ?? 4.7, footX = pl.xc - 1.6 - ll + 0.1;
  const T = 0.14;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, cy = Math.cos(a), sz = Math.sin(a), at = (rad, x) => [x, cy * rad, sz * rad], f = new Geo();
    if (open) {
      const foot = at(fp - 0.35, footX), knee = at(R + (fp - R) * 0.55, footX + (hTop - footX) * 0.55);
      f.append(bar(at(R, hTop), foot, T, GOLD, T * 1.2));                                    // main strut
      f.append(bar(at(R, hTop - 1.25), knee, T * 0.65, SILVER));                           // lower brace
      f.append(bar(at(R * 0.98, hTop - 0.25), at(fp * 0.5, footX + (hTop - footX) * 0.3), T * 0.5, SILVER));
      f.append(new Geo().append(cylinderX(0, 0.16, 0.5, GREY, 16), M4.translate(foot[0] - 0.08, foot[1], foot[2])));   // footpad
      f.append(new Geo().append(frustumX(0, 0.4, 0.5, 0.12, FOIL, 12), M4.translate(foot[0] + 0.08, foot[1], foot[2])));
    } else {
      const foot = at(R + 0.18, footX + 1.25);
      f.append(bar(at(R, hTop), foot, T, GOLD, T * 1.2)); f.append(bar(at(R, hTop - 1.1), at(R + 0.14, hTop - 0.4), T * 0.6, SILVER));
      f.append(new Geo().append(cylinderX(0, 0.14, 0.42, GREY, 14), M4.mul(M4.translate(foot[0], foot[1], foot[2]), M4.rotZ(0))));
    }
    g.append(f);
  }
  const ext = open ? fp + 0.6 : R + 0.7;
  return { geo: g, box: [[footX - 0.2, -ext, -ext], [hTop + 0.2, ext, ext]] };
}
export { sphereGeo };
