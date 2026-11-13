// Pogo (2.9): the longitudinal oscillation of a liquid rocket in which the structure and the propellant feed system drive each other.
// (Titan II / Gemini, Saturn V on Apollo 6 and the S-II centre engine on Apollo 13.)
//
// Two coupled oscillators, integrated with small sub-steps:
//   STRUCTURE, first free-free longitudinal mode of the stack, modal displacement x at the engine:
//       x'' + 2 zs ws x' + ws^2 x = dT / Mg,          ws = (pi / L) sqrt(EA / m'),  EA = E 2 pi R t,  m' = m / L,  Mg = m / 2
//   FEED LINE, fractional pressure perturbation p at the pump inlet (the oxidizer column, a quarter-wave organ pipe):
//       p'' + 2 zp wp p' + wp^2 p = wp^2 Kf x'',      wp = 2 pi a / (4 h),  Kf = rho_ox h / p_inlet
//   THRUST: dT = T G p (G = effective pump/combustion gain).
// At equal frequencies the loop gain is  T G Kf / (Mg 4 zs zp): above 1 the oscillation grows until the pump inlet cavitates
// (|p| saturates). The structure stiffens and the propellant column shortens as the tanks drain, so the two frequencies drift and can
// cross late in a burn: that is when real vehicles had pogo.
// A POGO SUPPRESSOR (gas accumulator at the pump inlet: engine.pogoSuppressor = true) adds compliance: wp drops to 35% and zp rises to 0.3.
//
// Defaults (engineering values, the engine or vehicle can override): wall thickness as in flex-slosh.js, E = 72 GPa, zs = 0.02,
// a = 400 m/s (LOX with pump-inlet compliance), zp = 0.08, p_inlet = 3 bar, G = 0.01, |p| <= 0.5. h = engine to oxidizer surface + 2 m of line.
// OFF by default (settings.pogo). It reports the oscillation (g at the engine, thrust oscillation) and warns; it does not change the
// trajectory (the oscillation averages to zero over a cycle).
import { clamp } from './vec.js';

const E_MOD = 72e9;
const DENSITY = { LOX: 1141, N2O4: 1440, H2O2: 1450, LH2: 71, RP1: 810, CH4: 423, UDMH: 790, MMH: 880 };

function makeRng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Linear loop gain at equal frequencies (for reports / tests). */
export function pogoLoopGain({ thrust, mass, gain = 0.01, kf, zetaS = 0.02, zetaP = 0.08 }) {
  return (thrust * gain * kf) / ((mass / 2) * 4 * zetaS * zetaP);
}

export class PogoModel {
  constructor(sim) {
    this.sim = sim;
    this.x = 0; this.vx = 0; this.p = 0; this.vp = 0;
    this.rng = makeRng(sim.settings.pogoSeed ?? 11);
    this.out = { structHz: 0, feedHz: 0, gAmp: 0, thrustOsc: 0, loopGain: 0, group: null };
    this.peak = { gAmp: 0, t: null, structHz: 0, feedHz: 0 };
    this._env = 0; this._timer = 0; this._warned = false; this._failed = false;
  }

  /** frequencies and coupling of the stage that is burning now; null if no liquid engine burns */
  params() {
    const sim = this.sim, fv = sim.fv, lay = fv._layout;
    let best = null;
    for (const e of fv.activeEngines()) {
      if (e.comp.solid || !(e.thrust > 0)) continue;
      if (!best || e.thrust > best.thrust) best = e;
    }
    if (!best) return null;
    const comp = best.comp, group = best.group;
    let T = 0; for (const e of fv.activeEngines()) if (e.group === group && !e.comp.solid) T += e.thrust;
    const L = Math.max(lay.length, 1), R = Math.max(lay.maxDiameter / 2, 0.1);
    const wall = fv.def.meta?.wallThickness ?? clamp(0.0012 * 2 * R, 0.0006, 0.008);
    const EA = fv.def.meta?.axialEA ?? E_MOD * 2 * Math.PI * R * wall;
    const m = Math.max(fv.mass, 1), ws = (Math.PI / L) * Math.sqrt(EA / (m / L));
    // oxidizer column: from the engine to the liquid surface of the same stage's oxidizer (or any) tank
    const pe = lay.placements.get(comp.id);
    let h = 4, rhoOx = 1000;
    const tanks = fv.presentComponents().filter((c) => (c.kind === 'oxidizer_tank' || c.kind === 'propellant_tank') && c.group === group);
    const tank = tanks.find((c) => c.kind === 'oxidizer_tank') ?? tanks[0];
    if (tank && pe) {
      const pt = lay.placements.get(tank.id);
      const cap = tank.propellantMass ?? 0, f = cap > 0 ? clamp((fv.propMass[tank.id] ?? 0) / cap, 0, 1) : 0;
      if (pt) h = Math.max(1, Math.abs(pt.x0 - pe.x1) + f * (pt.x1 - pt.x0) + 2);
      rhoOx = DENSITY[tank.propellant] ?? DENSITY[comp.propellants?.[0]] ?? 1000;
    }
    const sup = !!comp.pogoSuppressor;
    const a = comp.feedWaveSpeed ?? 400;
    const wp = (2 * Math.PI * a) / (4 * h) * (sup ? 0.35 : 1);
    const zp = sup ? 0.3 : (comp.feedDamping ?? 0.08), zs = fv.def.meta?.structDamping ?? 0.02;
    const kf = (rhoOx * h) / (comp.pumpInletPressure ?? 3e5), G = comp.pogoGain ?? 0.01;
    return { group, T, m, ws, wp, zs, zp, kf, G, sup, Mg: m / 2 };
  }

  update(dt) {
    const S = this.sim.settings, o = this.out;
    if (!S.pogo) return o;
    const P = this.params();
    if (!P) { this.x = this.vx = this.p = this.vp = 0; o.gAmp = 0; o.thrustOsc = 0; o.structHz = 0; o.feedHz = 0; o.loopGain = 0; this._env = 0; return o; }
    if (P.group !== o.group) { this.x = this.vx = this.p = this.vp = 0; this._env = 0; }   // a new stage starts quiet
    const wmax = Math.max(P.ws, P.wp), n = Math.min(400, Math.max(1, Math.ceil(dt * wmax / 0.15))), h = dt / n;
    let peakA = 0;
    for (let i = 0; i < n; i++) {
      const noise = (this.rng() - 0.5) * 2e-3;                                 // combustion roughness keeps a little excitation in the line
      const ax = (P.T * P.G * this.p) / P.Mg - 2 * P.zs * P.ws * this.vx - P.ws * P.ws * this.x;
      const ap = P.wp * P.wp * (P.kf * ax + noise) - 2 * P.zp * P.wp * this.vp - P.wp * P.wp * this.p;
      this.vx += ax * h; this.x += this.vx * h;                                // semi-implicit Euler (energy-stable for oscillators)
      this.vp += ap * h; this.p += this.vp * h;
      if (Math.abs(this.p) > 0.5) { this.p = Math.sign(this.p) * 0.5; this.vp *= -0.2; }   // the pump inlet cavitates: the pressure swing cannot grow further
      peakA = Math.max(peakA, Math.abs(ax));
    }
    // amplitude envelope of the acceleration at the engine (decays with a 0.5 s time constant)
    this._env = Math.max(peakA, this._env * Math.exp(-dt / 0.5));
    o.group = P.group; o.structHz = P.ws / (2 * Math.PI); o.feedHz = P.wp / (2 * Math.PI);
    o.gAmp = this._env / 9.80665; o.thrustOsc = Math.abs(P.G * this.p) * P.T;
    o.loopGain = pogoLoopGain({ thrust: P.T, mass: P.m, gain: P.G, kf: P.kf, zetaS: P.zs, zetaP: P.zp });
    o.suppressor = P.sup;
    if (o.gAmp > this.peak.gAmp) { this.peak = { gAmp: o.gAmp, t: this.sim.t, structHz: o.structHz, feedHz: o.feedHz }; }
    return o;
  }

  /** warning / failure records (settings.pogo only) */
  check(dt) {
    const sim = this.sim, o = this.out;
    if (!sim.settings.pogo) return;
    if (o.gAmp > 0.25) this._timer += dt; else this._timer = 0;
    if (o.gAmp > 0.25 && !this._warned) { this._warned = true; sim.warn('POGO', `Pogo: ${o.gAmp.toFixed(2)} g oscillation at ${o.structHz.toFixed(1)} Hz (feed line ${o.feedHz.toFixed(1)} Hz).`, { t: sim.t }); }
    if (this._timer > 2 && o.gAmp > 0.5 && !this._failed) {
      this._failed = true;
      sim.monitor.add({ code: 'POGO_OSCILLATION', title: 'Pogo oscillation', severity: 'major', confidence: 'CONFIRMED',
        primaryCause: `The ${o.group} stage shook along its length at ${o.structHz.toFixed(1)} Hz with ±${o.gAmp.toFixed(2)} g for more than 2 s.`,
        contributing: [`Structure ${o.structHz.toFixed(1)} Hz and feed line ${o.feedHz.toFixed(1)} Hz are close`, `Loop gain at resonance ${o.loopGain.toFixed(1)} (above 1 grows)`, o.suppressor ? 'A pogo suppressor is fitted' : 'No pogo suppressor on the engine'],
        evidence: [{ label: 'Oscillation', value: o.gAmp, unit: 'g', t: sim.t }, { label: 'Structural mode', value: o.structHz, unit: 'Hz' }, { label: 'Feed-line mode', value: o.feedHz, unit: 'Hz' }],
        consequences: 'Crew and payload are shaken hard; engines can shut down (Apollo 13 lost its S-II centre engine this way).',
        solutions: ['Fit a pogo suppressor (gas accumulator) at the pump inlet', 'Shut the centre engine down early, as Saturn V did', 'Change the stiffness of the structure or the length of the feed line so the frequencies do not cross'],
        equation: { name: 'Pogo loop gain', formula: 'G = T·g_p·K_f / (M·4ζ_sζ_p)', values: `G = ${o.loopGain.toFixed(1)}` } });
    }
  }
}
