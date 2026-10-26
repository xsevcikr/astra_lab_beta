// Thrust that changes over a burn (2.3). A flat thrust is still the default; an engine opts in with
//   thrustCurve:     [[x, f], ...]  f = thrust relative to the rated thrust, x = fraction of the propellant already burned (0..1). Solid motors:
//                                   the total impulse stays the same, so a high start means a shorter burn there and a long, low tail.
//   thrustCurveTime: [[s, f], ...]  f against seconds since ignition (start-up transients, a planned throttle-down, shut-down tail-off on any engine).
//   thrustShape:    'name' of one of the shapes below (the Designer's "Thrust shape" list); thrustCurve / thrustCurveTime override it.
// The mass flow follows the thrust (the Isp stays what it is), as it does in a real motor.
export const THRUST_SHAPES = {
  flat: { label: 'Flat (constant)', curve: null },
  'solid-booster': { label: 'Shuttle-style booster: strong start, throttle bucket, tail-off', curve: [[0, 1.04], [0.08, 1.13], [0.3, 1.0], [0.5, 0.8], [0.68, 0.86], [0.9, 0.97], [0.955, 0.8], [0.985, 0.35], [1, 0.12]] },
  progressive: { label: 'Progressive (thrust grows)', curve: [[0, 0.75], [0.5, 1.0], [0.95, 1.25], [0.985, 0.4], [1, 0.1]] },
  regressive: { label: 'Regressive (thrust fades)', curve: [[0, 1.3], [0.5, 1.0], [0.95, 0.72], [0.985, 0.35], [1, 0.1]] },
  neutral: { label: 'Neutral with tail-off', curve: [[0, 1.0], [0.95, 1.0], [0.985, 0.4], [1, 0.1]] },
};
export const THRUST_SHAPE_IDS = Object.keys(THRUST_SHAPES);

function interp(t, x) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const f = (x - t[i - 1][0]) / Math.max(t[i][0] - t[i - 1][0], 1e-12); return t[i - 1][1] + f * (t[i][1] - t[i - 1][1]); }
  return t[t.length - 1][1];
}

/** Thrust factor of engine component `c` after burning `burned` kg of its own propellant, `tBurn` seconds after ignition. 1 when it has no curve. */
export function thrustFactor(c, burned, tBurn) {
  let f = 1;
  const curve = c.thrustCurve ?? (c.thrustShape ? THRUST_SHAPES[c.thrustShape]?.curve : null);
  if (curve && c.solid) { const cap = (c.propellantMass ?? 0) * (c.count ?? 1); if (cap > 0) f *= interp(curve, Math.min(1, burned / cap)); }
  if (c.thrustCurveTime && tBurn != null) f *= interp(c.thrustCurveTime, Math.max(0, tBurn));
  return Math.max(f, 0.02);
}
