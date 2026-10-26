// Deterministic procedural terrain (multi-octave value noise) used by landers and rovers.
// height(lat, lon) is a pure function of (bodyId, seed, lat, lon), so simulations remain reproducible.
import { getBody } from './bodies.js';

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  const u = smooth(fx), v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Terrain height [m] relative to the reference sphere at local tangent-plane coordinates (x east, y north) in metres. */
export function terrainHeightLocal(bodyId, x, y, seed = 1) {
  const b = getBody(bodyId);
  const amp = b.surface?.terrainAmplitude ?? 0;
  if (!amp) return 0;
  const wl = b.surface.terrainWavelength ?? 20000;
  let h = 0, a = 1, f = 1 / wl, sum = 0;
  for (let o = 0; o < 6; o++) {
    h += a * (valueNoise(x * f, y * f, seed + o * 17) - 0.5) * 2;
    sum += a; a *= 0.5; f *= 2.1;
  }
  return (h / sum) * amp;
}
export function terrainHeight(bodyId, lat, lon, seed = 1) {
  const b = getBody(bodyId);
  return terrainHeightLocal(bodyId, lon * b.radius * Math.cos(lat), lat * b.radius, seed);
}
/** Terrain gradient (rise over run) in the east and north directions via central differences. */
export function terrainSlope(bodyId, x, y, seed = 1, d = 5) {
  const hx = (terrainHeightLocal(bodyId, x + d, y, seed) - terrainHeightLocal(bodyId, x - d, y, seed)) / (2 * d);
  const hy = (terrainHeightLocal(bodyId, x, y + d, seed) - terrainHeightLocal(bodyId, x, y - d, seed)) / (2 * d);
  return { gx: hx, gy: hy, angle: Math.atan(Math.hypot(hx, hy)) };
}

/** Small-scale surface roughness (rocks, ripples): 3 octaves, wavelengths ~40 m, 15 m, 6 m; `rough` is the RMS-scale amplitude in metres. */
export function terrainFineLocal(x, y, seed = 1, rough = 0) {
  if (!rough) return 0;
  let h = 0, a = 1, f = 1 / 40;
  for (let o = 0; o < 3; o++) { h += a * (valueNoise(x * f, y * f, seed + 101 + o * 31) - 0.5) * 2; a *= 0.5; f *= 2.6; }
  return h * rough;
}
/** Gradient of the total (large + fine scale) terrain at a rover: {gx, gy, angle}. */
export function terrainSlopeFine(bodyId, x, y, seed = 1, rough = 0, d = 1) {
  const H = (xx, yy) => terrainHeightLocal(bodyId, xx, yy, seed) + terrainFineLocal(xx, yy, seed, rough);
  const gx = (H(x + d, y) - H(x - d, y)) / (2 * d), gy = (H(x, y + d) - H(x, y - d)) / (2 * d);
  return { gx, gy, angle: Math.atan(Math.hypot(gx, gy)), h: H(x, y) };
}
