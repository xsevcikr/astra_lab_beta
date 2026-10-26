// Satellite constellation designer: Walker-delta geometry on circular orbits (two-body, no J2: SIMPLIFICATION),
// with ground coverage, revisit time and inter-satellite spacing sampled over time on a rotating Earth.
import { getBody } from '../core/bodies.js';
import { DEG } from '../core/constants.js';

export function walker({ total = 24, planes = 3, phasing = 1, altitude = 20200e3, inclinationDeg = 55, body = 'earth' } = {}) {
  if (total % planes) throw new Error('total satellites must be divisible by the number of planes');
  const b = getBody(body), a = b.radius + altitude, n = Math.sqrt(b.mu / a ** 3), perPlane = total / planes;
  const sats = [];
  for (let p = 0; p < planes; p++) for (let s = 0; s < perPlane; s++) sats.push({ id: `P${p + 1}-S${s + 1}`, plane: p, raan: 2 * Math.PI * p / planes, u0: 2 * Math.PI * s / perPlane + 2 * Math.PI * phasing * p / total });
  return { total, planes, phasing, altitude, inclination: inclinationDeg * DEG, a, n, period: 2 * Math.PI / n, sats, body };
}
export function satPosition(c, sat, t) {
  const u = sat.u0 + c.n * t, i = c.inclination, O = sat.raan;
  const x = Math.cos(u), y = Math.sin(u);
  return [c.a * (x * Math.cos(O) - y * Math.cos(i) * Math.sin(O)), c.a * (x * Math.sin(O) + y * Math.cos(i) * Math.cos(O)), c.a * y * Math.sin(i)];
}
export function coverage(c, { maskDeg = 10, latStep = 10, lonStep = 15, duration, dt = 120, minSats = 1 } = {}) {
  const b = getBody(c.body), T = duration ?? c.period * 2;
  const pts = [];
  for (let lat = -90 + latStep / 2; lat < 90; lat += latStep) for (let lon = -180; lon < 180; lon += lonStep) pts.push({ lat, lon, w: Math.cos(lat * DEG), covered: 0, samples: 0, gap: 0, maxGap: 0, multi: 0 });
  const sinMask = Math.sin(maskDeg * DEG);
  for (let t = 0; t <= T; t += dt) {
    const pos = c.sats.map((s) => satPosition(c, s, t));
    const rot = b.rotationRate * t;
    for (const p of pts) {
      const la = p.lat * DEG, lo = p.lon * DEG + rot;
      const g = [b.radius * Math.cos(la) * Math.cos(lo), b.radius * Math.cos(la) * Math.sin(lo), b.radius * Math.sin(la)];
      let vis = 0;
      for (const s of pos) { const d = [s[0] - g[0], s[1] - g[1], s[2] - g[2]], dn = Math.hypot(...d); if ((d[0] * g[0] + d[1] * g[1] + d[2] * g[2]) / (dn * b.radius) >= sinMask) vis++; }
      p.samples++;
      if (vis >= minSats) { p.covered++; p.gap = 0; } else { p.gap += dt; p.maxGap = Math.max(p.maxGap, p.gap); }
      p.multi += vis;
    }
  }
  const W = pts.reduce((a, p) => a + p.w, 0);
  const cov = pts.reduce((a, p) => a + p.w * p.covered / p.samples, 0) / W;
  return { coverageFraction: cov, meanVisible: pts.reduce((a, p) => a + p.w * p.multi / p.samples, 0) / W, maxRevisitGap: Math.max(...pts.map((p) => p.maxGap)), meanRevisitGap: pts.reduce((a, p) => a + p.w * p.maxGap, 0) / W, grid: pts.map(({ lat, lon, covered, samples, maxGap }) => ({ lat, lon, fraction: covered / samples, maxGap })) };
}
export function spacing(c) {
  const perPlane = c.total / c.planes;
  return { inPlaneDeg: 360 / perPlane, planeSpacingDeg: 360 / c.planes, phaseOffsetDeg: 360 * c.phasing / c.total, periodMin: c.period / 60 };
}
