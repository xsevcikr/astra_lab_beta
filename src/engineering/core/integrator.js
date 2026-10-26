// Fixed-step RK4 on flat Float64Array state. deriv(t, y, out) writes dy/dt into out.
export function makeRk4(n) {
  return { k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), tmp: new Float64Array(n) };
}
export function rk4Step(deriv, t, y, dt, w = makeRk4(y.length)) {
  const n = y.length, { k1, k2, k3, k4, tmp } = w;
  deriv(t, y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k1[i];
  deriv(t + 0.5 * dt, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k2[i];
  deriv(t + 0.5 * dt, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt * k3[i];
  deriv(t + dt, tmp, k4);
  for (let i = 0; i < n; i++) y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return y;
}
