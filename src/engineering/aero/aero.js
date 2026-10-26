// Aerodynamic coefficients and a virtual wind tunnel.
// Rocket: slender-body + Barrowman-style fins + Jorgensen crossflow; transonic drag rise is a fitted curve.
// Aircraft: finite-wing lift slope with stall and parabolic polar. Capsule: modified Newtonian.
// All are APPROXIMATIONS suitable for preliminary design, not CFD.
import { MODEL, tagged } from '../core/provenance.js';
import { atmosphere, reynolds } from '../core/atmosphere.js';
import { DEG } from '../core/constants.js';

export function machDragFactor(M) {
  if (M < 0.8) return 1;
  if (M < 1.05) return 1 + 0.8 * Math.pow((M - 0.8) / 0.25, 2);
  if (M < 1.2) return 1.8;
  return 1 + 0.8 * Math.pow(1.2 / M, 1.3);
}

export function refArea(g) { return g.refArea ?? Math.PI * (g.diameter / 2) ** 2; }

export function coefficients(g, { mach = 0.3, alpha = 0, beta = 0 }) {
  const kind = g.kind || 'rocket';
  if (kind === 'aircraft') {
    const AR = g.aspectRatio ?? 8, e = g.oswald ?? 0.8, a0 = 2 * Math.PI;
    const beta_c = mach < 0.95 ? Math.sqrt(1 - mach * mach) : Math.sqrt(1 - 0.95 * 0.95); // Prandtl-Glauert, capped
    const cla = a0 / (1 + a0 / (Math.PI * AR * e)) / beta_c;
    const stall = (g.stallDeg ?? 15) * DEG;
    const a = alpha + (g.incidenceDeg ?? 0) * DEG;
    let CL = Math.abs(a) <= stall ? cla * a : Math.sign(a) * cla * stall * Math.max(0.55, 1 - 2.5 * (Math.abs(a) - stall));
    const CD = (g.cd0 ?? 0.025) * machDragFactor(mach) + CL * CL / (Math.PI * AR * e) + (Math.abs(a) > stall ? 1.2 * Math.sin(Math.abs(a)) ** 2 : 0);
    const Cm = (g.cm0 ?? 0.02) - (g.staticMargin ?? 0.1) * CL;
    const CY = -cla * 0.3 * beta, Cn = (g.yawStability ?? 0.08) * beta;
    return { CL, CD, CY, Cm, Cn, stalled: Math.abs(a) > stall };
  }
  if (kind === 'capsule') {
    // Modified Newtonian for a blunt heat shield flying base-first
    const cd0 = g.cd0 ?? 1.3, ld = g.liftToDrag ?? 0.3;
    const CA = cd0 * Math.cos(alpha) ** 2;
    const CN = cd0 * ld * Math.sin(2 * alpha) / Math.sin(2 * 20 * DEG) * 0.5 + (g.trimLift ? 0 : 0);
    const CL = CN * Math.cos(alpha) - CA * Math.sin(alpha);
    const CD = CN * Math.sin(alpha) + CA * Math.cos(alpha);
    return { CL: -CL, CD: Math.abs(CD), CY: -cd0 * 0.1 * beta, Cm: -0.08 * (alpha - (g.trimAlphaDeg ?? 20) * DEG), Cn: 0.08 * beta, stalled: false };
  }
  // rocket / slender body
  const Aref = refArea(g);
  const L = g.length ?? 10 * g.diameter;
  const finArea = g.finArea ?? 0;
  const span = g.finSpan ?? Math.sqrt(finArea || 0);
  // Barrowman fin normal-force slope with body interference factor (1 + r/(s + r))
  const chord = Math.max(0.1, g.finChord ?? span);
  const finCNa = finArea > 0 ? (1 + g.diameter / 2 / (span + g.diameter / 2)) * 4 * (g.finCount ?? 4) * (span / g.diameter) ** 2 / (1 + Math.sqrt(1 + (2 * span / (1.5 * chord)) ** 2)) : 0;
  const cnaBody = 2; // per rad, slender-body theory
  const planform = g.diameter * L;
  const ca = (g.cd0 ?? 0.3) * machDragFactor(mach);
  const nForce = (ang) => (cnaBody + finCNa) * Math.sin(ang) * Math.cos(ang) + 1.2 * (planform / Aref) * Math.sin(ang) * Math.abs(Math.sin(ang));
  const CN = nForce(alpha), CYb = -nForce(beta);
  const xcpBody = 0.466 * (g.noseLength ?? 2 * g.diameter);
  const xcpFin = g.finPosition ?? 0.95 * L;
  const xcp = (cnaBody * xcpBody + finCNa * xcpFin) / (cnaBody + finCNa);
  const xcg = g.cgPosition ?? 0.55 * L;
  const arm = (xcp - xcg) / g.diameter; // positive = stable (cp behind cg)
  const CL = CN * Math.cos(alpha) - ca * Math.sin(alpha);
  const CD = CN * Math.sin(alpha) + ca * Math.cos(alpha);
  return { CL, CD, CY: CYb, Cm: -CN * arm, Cn: -CYb * arm, CN, CA: ca, xcp, xcg, staticMarginCalibers: arm, stalled: false };
}

// Virtual wind tunnel: set the flow either directly (density, velocity, temperature) or from a body/altitude.
export function windTunnel(g, opts = {}) {
  const { alphaDeg = 0, betaDeg = 0, body = 'earth' } = opts;
  const atm = opts.altitude !== undefined ? atmosphere(body, opts.altitude) : atmosphere(body, 0);
  const temperature = opts.temperature ?? atm.temperature;
  const gamma = atm.gamma || 1.4, Rg = atm.gasConstant || 287.053;
  const a = Math.sqrt(gamma * Rg * temperature);
  const pressure = opts.pressure ?? (opts.density !== undefined ? opts.density * Rg * temperature : atm.pressure);
  const density = opts.density ?? pressure / (Rg * temperature);
  const velocity = opts.velocity ?? (opts.mach ?? 0.5) * a;
  const mach = velocity / a;
  const c = coefficients(g, { mach, alpha: alphaDeg * DEG, beta: betaDeg * DEG });
  const q = 0.5 * density * velocity * velocity;
  const S = g.kind === 'aircraft' ? g.wingArea ?? 20 : refArea(g);
  const lref = g.kind === 'aircraft' ? g.chord ?? 2 : g.diameter;
  return tagged(MODEL.APPROXIMATION, 'Preliminary-design aerodynamic coefficients; no viscous separation modelling beyond stall/crossflow terms.', {
    flow: { density, velocity, mach, temperature, pressure, speedOfSound: a, dynamicPressure: q, reynolds: reynolds(velocity, g.length ?? lref, { density, temperature }, body === 'mars' ? 'co2' : 'air') },
    coefficients: c,
    forces: { lift: q * S * c.CL, drag: q * S * c.CD, side: q * S * c.CY, pitchingMoment: q * S * lref * c.Cm, yawingMoment: q * S * lref * c.Cn },
    liftToDrag: c.CD > 0 ? c.CL / c.CD : 0,
  });
}

export function alphaSweep(g, opts = {}, from = -10, to = 20, step = 1) {
  const rows = [];
  for (let a = from; a <= to + 1e-9; a += step) {
    const r = windTunnel(g, { ...opts, alphaDeg: a });
    rows.push({ alphaDeg: +a.toFixed(3), CL: r.coefficients.CL, CD: r.coefficients.CD, Cm: r.coefficients.Cm, LD: r.liftToDrag, lift: r.forces.lift, drag: r.forces.drag });
  }
  return rows;
}
export function machSweep(g, opts = {}, from = 0.1, to = 5, step = 0.05) {
  const rows = [];
  for (let m = from; m <= to + 1e-9; m += step) {
    const r = windTunnel(g, { ...opts, mach: m, velocity: undefined });
    rows.push({ mach: +m.toFixed(3), CD: r.coefficients.CD, drag: r.forces.drag, q: r.flow.dynamicPressure });
  }
  return rows;
}

export const AERO_MODELS = {
  'slender-rocket': { kind: 'rocket', diameter: 1.2, length: 18, noseLength: 2.4, cd0: 0.3, finArea: 1.2, finSpan: 1.0, finChord: 1.2, finPosition: 17, cgPosition: 9.5 },
  'trainer-aircraft': { kind: 'aircraft', wingArea: 16, chord: 1.5, aspectRatio: 7.5, cd0: 0.028, oswald: 0.8, stallDeg: 15, length: 8 },
  'capsule': { kind: 'capsule', diameter: 3.9, cd0: 1.3, liftToDrag: 0.3, trimAlphaDeg: 20 },
};
