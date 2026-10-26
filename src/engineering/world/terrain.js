// Procedural planetary terrain: deterministic from a seed, with craters following a power-law size
// distribution, rolling relief (maria smoother than highlands), rilles/valleys and rock abundance.
// It is a statistically plausible SIMPLIFICATION, not real elevation data (no LOLA/MOLA maps are bundled).
import { makeRng } from '../core/rng.js';

const TERRAIN_TYPES = {
  mare: { relief: 60, craterDensity: 0.6, rocks: 0.004, label: 'Mare (smooth basalt plain)' },
  highlands: { relief: 250, craterDensity: 1.6, rocks: 0.012, label: 'Highlands (rough, heavily cratered)' },
  'mars-plains': { relief: 80, craterDensity: 0.5, rocks: 0.008, label: 'Martian plains' },
  'mars-valley': { relief: 600, craterDensity: 0.4, rocks: 0.02, label: 'Martian valley floor' },
};

export class Terrain {
  constructor({ type = 'mare', seed = 42, extent = 20000, craters = 400 } = {}) {
    this.type = type; this.p = TERRAIN_TYPES[type] || TERRAIN_TYPES.mare;
    const rng = makeRng(seed);
    this.waves = Array.from({ length: 6 }, (_, i) => ({ kx: rng.normal(0, 1) * 2 * Math.PI / (3000 / (i + 1)), ky: rng.normal(0, 1) * 2 * Math.PI / (3000 / (i + 1)), a: 1.5 * this.p.relief / ((i + 1.5) * (i + 1.5)), ph: rng.uniform(0, 6.28) }));
    const n = Math.round(craters * this.p.craterDensity);
    // size distribution N(>D) ~ D^-2 between 10 m and 2 km
    this.craters = Array.from({ length: n }, () => {
      const D = 10 / Math.sqrt(1 - rng.next() * (1 - (10 / 2000) ** 2));
      return { x: rng.uniform(-extent, extent), y: rng.uniform(-extent, extent), r: D / 2, depth: 0.2 * D };
    });
    // spatial hash so elevation() only visits nearby craters (max crater radius 1 km -> 2 km cells)
    this.cell = 2000; this.grid = new Map();
    for (const c of this.craters) {
      const k = `${Math.floor(c.x / this.cell)},${Math.floor(c.y / this.cell)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    this.rille = type === 'mare' || type === 'mars-valley' ? { y0: rng.uniform(-extent / 2, extent / 2), width: 300, depth: 120 * (type === 'mars-valley' ? 3 : 1) } : null;
    this.rockSeed = seed * 7919;
  }
  elevation(x, y = 0) {
    let h = 0;
    for (const w of this.waves) h += w.a * Math.sin(w.kx * x + w.ky * y + w.ph);
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of this.grid.get(`${cx + i},${cy + j}`) || []) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d > 1.5 * c.r) continue;
      const u = d / c.r;
      h += u < 1 ? -c.depth * (1 - u * u) + 0.04 * c.depth : 0.04 * c.depth * Math.max(0, (1.5 - u) / 0.5) ** 2; // bowl + raised rim
    }
    if (this.rille) { const d = Math.abs(y - this.rille.y0 - 200 * Math.sin(x / 2000)); if (d < this.rille.width) h -= this.rille.depth * (1 - (d / this.rille.width) ** 2); }
    return h;
  }
  slopeDeg(x, y = 0, step = 2) {
    const dx = (this.elevation(x + step, y) - this.elevation(x - step, y)) / (2 * step);
    const dy = (this.elevation(x, y + step) - this.elevation(x, y - step)) / (2 * step);
    return Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
  }
  // probability that a lander footprint (radius r) contains a rock taller than clearance
  rockHazard(x, y = 0, footprint = 4, clearance = 0.5) {
    const cell = (Math.floor(x / 10) * 73856093) ^ (Math.floor(y / 10) * 19349663) ^ this.rockSeed;
    const local = this.p.rocks * (1 + ((cell >>> 0) % 1000) / 500);
    const densityTall = local * Math.exp(-clearance / 0.3);
    return 1 - Math.exp(-densityTall * Math.PI * footprint * footprint);
  }
  assessSite(x, y = 0, { maxSlopeDeg = 12, footprint = 4 } = {}) {
    const slope = this.slopeDeg(x, y, footprint), rock = this.rockHazard(x, y, footprint);
    return { elevation: this.elevation(x, y), slopeDeg: slope, rockHazard: rock, safe: slope <= maxSlopeDeg && rock < 0.2, reasons: [slope > maxSlopeDeg ? `slope ${slope.toFixed(1)} deg exceeds ${maxSlopeDeg} deg` : null, rock >= 0.2 ? `rock hazard ${(rock * 100).toFixed(0)}%` : null].filter(Boolean) };
  }
  // rover traverse cost: slope-limited speed along a path
  traverse(path, { maxSlopeDeg = 20, speedFlat = 0.1 } = {}) {
    let time = 0, dist = 0, blocked = null;
    for (let i = 1; i < path.length; i++) {
      const [x0, y0] = path[i - 1], [x1, y1] = path[i];
      const d = Math.hypot(x1 - x0, y1 - y0), dz = this.elevation(x1, y1) - this.elevation(x0, y0);
      const slope = Math.atan2(Math.abs(dz), d) * 180 / Math.PI;
      if (slope > maxSlopeDeg) { blocked = { at: path[i], slope }; break; }
      const v = speedFlat * Math.cos(slope * Math.PI / 180) * (dz > 0 ? 1 - slope / (maxSlopeDeg * 1.5) : 1);
      time += d / v; dist += d;
    }
    return { time, distance: dist, blocked };
  }
}
export { TERRAIN_TYPES };
