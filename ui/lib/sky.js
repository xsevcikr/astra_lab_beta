// Sky / atmosphere helpers (pure JS, visual only). The fragment shader in gl.js integrates single scattering along each
// view ray; the functions here evaluate the same model on the CPU for a handful of rays per frame (horizon fog colour,
// sky brightness for fading the stars, sun colour/visibility). Units: km. Simplified, not a physical-accuracy claim.

export const ATMO = {
  earth: { top: 70, hr: 8, hm: 1.2, betaR: [5.8e-3, 13.5e-3, 33.1e-3], betaM: [10e-3, 10e-3, 10e-3], g: 0.76, sun: 6.4, expo: 1.0, haze: [0.62, 0.74, 0.93] },
  mars: { top: 80, hr: 11, hm: 7, betaR: [1.0e-3, 2.3e-3, 5.6e-3], betaM: [14e-3, 10e-3, 7e-3], g: 0.6, sun: 10, expo: 1.0, haze: [0.78, 0.55, 0.38] },
};
export const atmoOf = (id) => ATMO[id] ?? null;

const hg = (c, g) => (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * c, 1.5));

/**
 * One view ray through the atmosphere (single scattering, same model as the GLSL).
 * alt0 = eye altitude [km], R = planet radius [km], mu = cos(angle between ray and local up), sunE = cos(sun zenith angle at the eye),
 * dL = cos(angle between ray and sun). Returns {ins:[r,g,b] (tone-mapped 0..1), T: mean transmittance, hitsGround}.
 */
export function atmoRay(A, R, alt0, mu, sunE, dL, steps = 64) {
  if (alt0 >= A.top) return { ins: [0, 0, 0], T: 1, hitsGround: false };
  const r0 = R + alt0, Ra = R + A.top;
  const c = alt0 * (2 * R + alt0) - A.top * (2 * R + A.top), b = r0 * mu;
  const disc = b * b - c; if (disc <= 0) return { ins: [0, 0, 0], T: 1, hitsGround: false };
  let t1 = -b + Math.sqrt(disc); let hits = false;
  const cp = alt0 * (2 * R + alt0), dp = b * b - cp;
  if (mu < 0 && dp > 0) { const tp = -b - Math.sqrt(dp); if (tp > 0 && tp < t1) { t1 = tp; hits = true; } }
  const ins = [0, 0, 0]; let odR = 0, odM = 0;
  const phR = 0.75 * (1 + dL * dL), phM = hg(dL, A.g) * 4 * Math.PI * 0.08;
  void Ra;
  for (let i = 0; i < steps; i++) {
    const u0 = i / steps, u1 = (i + 1) / steps; // quadratic spacing towards t=0 (the eye) resolves the dense low layers
    const ta = t1 * u0 * u0, tb = t1 * u1 * u1, t = (ta + tb) / 2, ds = tb - ta;
    const rt = Math.sqrt(r0 * r0 + 2 * b * t + t * t), h = Math.max(0, (cp + 2 * b * t + t * t) / (rt + R));
    const dR = Math.exp(-h / A.hr), dM = Math.exp(-h / A.hm);
    odR += dR * ds; odM += dM * ds;
    const ms = (r0 * sunE + t * dL) / rt, dip = Math.sqrt(Math.max(0, 1 - (R / rt) ** 2));
    const vis = smooth(-dip - 0.06, -dip + 0.02, ms), am = 1 / (Math.max(ms, 0) + 0.025);
    for (let k = 0; k < 3; k++) {
      const sunT = Math.exp(-(A.betaR[k] * A.hr * dR + A.betaM[k] * A.hm * dM * 1.1) * am);
      const viewT = Math.exp(-(A.betaR[k] * odR + A.betaM[k] * odM * 1.1));
      ins[k] += sunT * vis * viewT * (A.betaR[k] * dR * phR + A.betaM[k] * dM * phM) * ds;
    }
  }
  const T = [0, 1, 2].reduce((s, k) => s + Math.exp(-(A.betaR[k] * odR + A.betaM[k] * odM * 1.1)), 0) / 3;
  return { ins: ins.map((x, k) => [0.90, 0.95, 1.0][k] * (1 - Math.exp(-x * A.sun * A.expo))), T: hits ? Math.min(T, 1) : T, hitsGround: hits };
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Transmittance of sunlight from the eye to the sun (rgb), or null if the planet blocks it. */
export function sunTransmit(A, R, alt0, sunE) {
  const r0 = R + alt0; if (sunE < 0 && r0 * r0 * (1 - sunE * sunE) < R * R) return null;
  if (alt0 >= A.top) return [1, 1, 1];
  const c = alt0 * (2 * R + alt0) - A.top * (2 * R + A.top), b = r0 * sunE, disc = b * b - c; if (disc <= 0) return [1, 1, 1];
  const t1 = -b + Math.sqrt(disc), cp = alt0 * (2 * R + alt0); let odR = 0, odM = 0; const n = 64;
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n, ta = t1 * u0 * u0, tb = t1 * u1 * u1, t = (ta + tb) / 2, rt = Math.sqrt(r0 * r0 + 2 * b * t + t * t);
    const h = Math.max(0, (cp + 2 * b * t + t * t) / (rt + R)); odR += Math.exp(-h / A.hr) * (tb - ta); odM += Math.exp(-h / A.hm) * (tb - ta);
  }
  return [0, 1, 2].map((k) => Math.exp(-(A.betaR[k] * odR + A.betaM[k] * odM * 1.1)));
}

/** Everything the flight renderer needs about the sky this frame (cheap: three short CPU integrations). */
export function skyState(bodyId, Rm, eyeAltM, sunE) {
  const A = ATMO[bodyId]; if (!A) return null;
  const R = Rm / 1000, alt0 = Math.max(0, eyeAltM) / 1000;
  if (alt0 >= A.top) return { A, horizon: [0, 0, 0], zenith: [0, 0, 0], lum: 0, sunT: sunTransmit(A, R, alt0, sunE) };
  const sinS = Math.sqrt(Math.max(0, 1 - sunE * sunE));
  const hz1 = atmoRay(A, R, alt0, 0, sunE, sinS, 28), hz2 = atmoRay(A, R, alt0, 0, sunE, -sinS, 28);   // horizon toward / away from the sun
  const ze = atmoRay(A, R, alt0, 1, sunE, sunE, 28);                                                     // zenith
  const horizon = [0, 1, 2].map((k) => (hz1.ins[k] * 0.45 + hz2.ins[k] * 0.55));
  const zenith = ze.ins;
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return { A, horizon, zenith, lum: Math.max(lum(zenith), lum(horizon) * 0.7), sunT: sunTransmit(A, R, alt0, sunE) };
}
