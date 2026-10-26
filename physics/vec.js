// Small allocation-friendly vector / quaternion helpers. Vectors are [x,y,z]; quaternions are [w,x,y,z].
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const len2 = (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
export const norm = (a) => { const l = len(a); return l > 1e-300 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; // a + b*s
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const angleBetween = (a, b) => {
  const la = len(a), lb = len(b);
  if (la < 1e-300 || lb < 1e-300) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (la * lb))));
};
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const projectOnPlane = (a, n) => sub(a, scale(n, dot(a, n)));

// ---- quaternions [w,x,y,z] ----
export const qIdentity = () => [1, 0, 0, 0];
export const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qConj = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qNormalize = (q) => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
/** Rotate vector v by quaternion q (body -> parent frame). */
export const qRotate = (q, v) => {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};
/** Inverse rotation (parent frame -> body). */
export const qRotateInv = (q, v) => qRotate(qConj(q), v);
export const qFromAxisAngle = (axis, angle) => {
  const n = norm(axis); const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), n[0] * s, n[1] * s, n[2] * s];
};
/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export const qFromTwoVectors = (a, b) => {
  const d = dot(a, b);
  if (d > 0.999999999) return [1, 0, 0, 0];
  if (d < -0.999999999) {
    let ax = cross([1, 0, 0], a);
    if (len(ax) < 1e-6) ax = cross([0, 1, 0], a);
    return qFromAxisAngle(ax, Math.PI);
  }
  const c = cross(a, b);
  return qNormalize([1 + d, c[0], c[1], c[2]]);
};
export const qSlerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qNormalize([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return [a[0] * w1 + bb[0] * w2, a[1] * w1 + bb[1] * w2, a[2] * w1 + bb[2] * w2, a[3] * w1 + bb[3] * w2];
};
/** Build the quaternion whose body +X axis points along dir (roll chosen so body +Z is as close to `up` as possible). */
export const qFromXAxis = (dir, up = [0, 0, 1]) => {
  const x = norm(dir);
  let y = cross(up, x);
  if (len(y) < 1e-6) y = cross([0, 1, 0], x);
  y = norm(y);
  const z = cross(x, y);
  // rotation matrix columns are x,y,z (body axes in parent frame)
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s]; }
  return qNormalize(q);
};
/** Column-major 4x4 (as used by WebGL) rotation matrix from quaternion. */
export const qToMat4 = (q) => {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
};
/** Euler angles (deg) of the body X axis relative to local frame: returns {pitch, yaw}. Helper for display. */
export const rad2deg = (r) => (r * 180) / Math.PI;
