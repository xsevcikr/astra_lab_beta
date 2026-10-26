// Classical 4th-order Runge-Kutta integrator for autonomous-or-time-dependent ODE systems y' = f(t, y).
// `f(t, y, dy)` must fill the pre-allocated `dy` array. States are plain arrays or Float64Arrays.
export function rk4Step(f, t, y, h, work) {
  const n = y.length;
  const w = work || makeRk4Work(n);
  const { k1, k2, k3, k4, tmp } = w;
  f(t, y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k1[i];
  f(t + 0.5 * h, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k2[i];
  f(t + 0.5 * h, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i];
  f(t + h, tmp, k4);
  for (let i = 0; i < n; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return y;
}
export function makeRk4Work(n) {
  return { k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), tmp: new Float64Array(n) };
}
/** Semi-implicit (symplectic) Euler, provided only for comparison tests of numerical order. */
export function eulerStep(f, t, y, h, work) {
  const n = y.length; const w = work || makeRk4Work(n);
  f(t, y, w.k1);
  for (let i = 0; i < n; i++) y[i] += h * w.k1[i];
  return y;
}
