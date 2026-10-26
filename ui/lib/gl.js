import { qualityOf } from './planets.js';
// Minimal WebGL 1 renderer for ASTRA LAB (no third-party libraries): lit meshes, procedural planets, atmosphere, ground grid, lines, points.
// Rendering never feeds back into the physics; it only draws states that the physics engine or a recording produced.

// ------------------------------------------------------------------------------------------------ matrices (column-major)
export const M4 = {
  identity() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = M4.identity(); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); return m;
  },
  lookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz);
    if (l < 1e-9) { // up parallel to view direction: pick another up
      const alt = Math.abs(zz) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      xx = alt[1] * zz - alt[2] * zy; xy = alt[2] * zx - alt[0] * zz; xz = alt[0] * zy - alt[1] * zx; l = Math.hypot(xx, xy, xz);
    }
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]); m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]); m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]); m[15] = 1;
    return m;
  },
  translate(x, y, z) { const m = M4.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
  scale(x, y, z) { const m = new Float32Array(16); m[0] = x; m[5] = y ?? x; m[10] = z ?? x; m[15] = 1; return m; },
  /** rotation matrix from quaternion [w,x,y,z] */
  fromQuat(q) {
    const [w, x, y, z] = q, m = M4.identity();
    m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + w * z); m[2] = 2 * (x * z - w * y);
    m[4] = 2 * (x * y - w * z); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + w * x);
    m[8] = 2 * (x * z + w * y); m[9] = 2 * (y * z - w * x); m[10] = 1 - 2 * (x * x + y * y);
    return m;
  },
  /** rotation whose columns are the given basis vectors (x,y,z axes expressed in world) */
  fromBasis(ex, ey, ez) { const m = M4.identity(); m[0] = ex[0]; m[1] = ex[1]; m[2] = ex[2]; m[4] = ey[0]; m[5] = ey[1]; m[6] = ey[2]; m[8] = ez[0]; m[9] = ez[1]; m[10] = ez[2]; return m; },
  rotY(a) { const m = M4.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rotZ(a) { const m = M4.identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
};
export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  rotQ(q, v) { // rotate v by quaternion [w,x,y,z]
    const [w, x, y, z] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  },
};

// ------------------------------------------------------------------------------------------------ geometry builders
/** Geometry accumulator: interleaved position(3) normal(3) colour(3). */
export class Geo {
  constructor() { this.v = []; this.i = []; }
  get vertexCount() { return this.v.length / 9; }
  push(p, n, c) { this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); return this.vertexCount - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  /** Append another Geo, optionally transformed by a 4x4 matrix. */
  append(g, m = null) {
    const base = this.vertexCount;
    for (let k = 0; k < g.v.length; k += 9) {
      let p = [g.v[k], g.v[k + 1], g.v[k + 2]], n = [g.v[k + 3], g.v[k + 4], g.v[k + 5]];
      if (m) {
        p = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
        n = V3.norm([m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]);
      }
      this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], g.v[k + 6], g.v[k + 7], g.v[k + 8]);
    }
    for (const j of g.i) this.i.push(j + base);
    return this;
  }
}
/** Solid of revolution about the X axis. profile = [[x, r], ...] from x0 to x1 (r may be 0 at the ends). */
export function revolve(profile, color, seg = 24) {
  const g = new Geo();
  const rings = profile.length;
  const tan = profile.map((p, k) => { // outward normal in (x, r) plane from the profile slope
    const a = profile[Math.max(0, k - 1)], b = profile[Math.min(rings - 1, k + 1)];
    const dx = b[0] - a[0], dr = b[1] - a[1];
    const l = Math.hypot(dx, dr) || 1;
    return [-dr / l, dx / l]; // (nx, nr)
  });
  for (let k = 0; k < rings; k++) {
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      g.push([profile[k][0], profile[k][1] * c, profile[k][1] * sn], V3.norm([tan[k][0], tan[k][1] * c, tan[k][1] * sn]), color);
    }
  }
  for (let k = 0; k < rings - 1; k++) for (let s = 0; s < seg; s++) {
    const a = k * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1;
    g.tri(a, c, b); g.tri(b, c, d);
  }
  return g;
}
const cap = (x, r, dirx, color, seg = 24) => {
  const g = new Geo(); const c = g.push([x, 0, 0], [dirx, 0, 0], color);
  for (let s = 0; s <= seg; s++) { const th = (s / seg) * Math.PI * 2; g.push([x, r * Math.cos(th), r * Math.sin(th)], [dirx, 0, 0], color); }
  for (let s = 0; s < seg; s++) dirx > 0 ? g.tri(c, c + 1 + s, c + 2 + s) : g.tri(c, c + 2 + s, c + 1 + s);
  return g;
};
export function cylinderX(x0, x1, r, color, seg = 24) {
  return revolve([[x0, r], [x1, r]], color, seg).append(cap(x0, r, -1, color, seg)).append(cap(x1, r, 1, color, seg));
}
export function frustumX(x0, x1, r0, r1, color, seg = 24) {
  const g = revolve([[x0, r0], [x1, r1]], color, seg);
  if (r0 > 1e-6) g.append(cap(x0, r0, -1, color, seg));
  if (r1 > 1e-6) g.append(cap(x1, r1, 1, color, seg));
  return g;
}
/** Tangent ogive / cone nose from x0 (radius r) to x1 (tip). */
export function noseX(x0, x1, r, color, shape = 'ogive', seg = 24) {
  const pts = []; const n = 10;
  for (let k = 0; k <= n; k++) {
    const u = k / n; // 0 base -> 1 tip
    const rad = shape === 'cone' ? r * (1 - u) : r * Math.sqrt(Math.max(0, 1 - u * u * (shape === 'ogive' ? 1 : 0.9))) * (shape === 'ogive' ? 1 : 1);
    pts.push([x0 + (x1 - x0) * u, k === n ? 0 : rad]);
  }
  return revolve(pts, color, seg).append(cap(x0, r, -1, color, seg));
}
/** Rocket engine bell nozzle: throat at x0 (small), exit at x1 (wide). */
export function bellX(x0, x1, rExit, color, seg = 20) {
  const pts = []; const n = 8, rt = rExit * 0.32;
  for (let k = 0; k <= n; k++) { const u = k / n; pts.push([x0 + (x1 - x0) * u, rt + (rExit - rt) * Math.pow(u, 0.6)]); }
  return revolve(pts, color, seg).append(cap(x0, rt, -1, color, seg));
}
export function boxGeo(cx, cy, cz, sx, sy, sz, color) {
  const g = new Geo(); const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]], [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]], [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ];
  for (const [n, vs] of faces) { const b = vs.map((p) => g.push([p[0] + cx, p[1] + cy, p[2] + cz], n, color)); g.tri(b[0], b[1], b[2]); g.tri(b[0], b[2], b[3]); }
  return g;
}
export function sphereGeo(r, color, seg = 24, rings = 16) {
  const g = new Geo();
  for (let i = 0; i <= rings; i++) { const phi = (i / rings) * Math.PI; for (let s = 0; s <= seg; s++) { const th = (s / seg) * Math.PI * 2; const n = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]; g.push([n[0] * r, n[1] * r, n[2] * r], n, color); } }
  for (let i = 0; i < rings; i++) for (let s = 0; s < seg; s++) { const a = i * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1; g.tri(a, c, b); g.tri(b, c, d); }
  return g;
}
export function discGeo(r, color, seg = 48, y = 0) { // horizontal disc, normal +Y
  const g = new Geo(); const c = g.push([0, y, 0], [0, 1, 0], color);
  for (let s = 0; s <= seg; s++) { const th = (s / seg) * Math.PI * 2; g.push([r * Math.cos(th), y, r * Math.sin(th)], [0, 1, 0], color); }
  for (let s = 0; s < seg; s++) g.tri(c, c + 2 + s, c + 1 + s);
  return g;
}

/** Unit exhaust plume along -X: bell-shaped profile (radius 1 at the nozzle). */
export function plumeGeo(seg = 18) {
  const prof = [[0, 0.96], [-0.05, 1.06], [-0.15, 1.04], [-0.3, 0.88], [-0.48, 0.66], [-0.66, 0.44], [-0.82, 0.24], [-0.93, 0.1], [-1, 0.0]];
  return revolve(prof, [1, 1, 1], seg);
}
/** Sphere with the pole along +Z and (u = longitude, v = latitude from north) in the colour slot, for textured planets. */
export function planetSphereGeo(seg = 64, rings = 40) {
  const g = new Geo();
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * Math.PI * 2 - Math.PI; // longitude -pi..pi
      const n = [Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th), Math.cos(phi)];
      g.push(n, n, [s / seg, i / rings, 0]);
    }
  }
  for (let i = 0; i < rings; i++) for (let s = 0; s < seg; s++) { const a = i * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1; g.tri(a, c, b); g.tri(b, c, d); }
  return g;
}

// ------------------------------------------------------------------------------------------------ shaders
// Lit meshes: hemisphere ambient + sun + blinn specular + environment reflection on bare-metal parts + rim light.
const LIT_VS = `attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;
uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vN; varying vec3 vC; varying vec3 vP; varying vec3 vW;
void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNrm; vC = aCol; vP = aPos; gl_Position = uMVP * vec4(aPos,1.0); }`;
// Procedural surface detail (panel seams, rivets, frost, soot, solar cells, MLI foil, tiles ...) is evaluated per fragment from the
// object-space position, so no texture files are needed. uMat selects the material; uDims = (x0, x1, radius, seed) of the part.
const LIT_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN; varying vec3 vC; varying vec3 vP; varying vec3 vW;
uniform vec3 uLight; uniform vec3 uTint; uniform float uAmbient; uniform float uEmissive; uniform float uAlpha;
uniform float uMetal; uniform vec3 uEye; uniform vec3 uUp; uniform vec3 uSkyA; uniform vec3 uGndA; uniform vec3 uSunCol; uniform vec3 uGlow; uniform vec3 uGlowDir;
uniform float uMat; uniform vec4 uDims; uniform vec4 uFx; uniform float uPx; uniform float uDetail;
uniform float uHalf; uniform vec3 uFill; uniform vec3 uFillCol; uniform vec3 uPL; uniform vec3 uPLCol; uniform float uPLr; uniform float uMirror;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), f.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), f.x), f.y); }
float ln(float d, float w, float aa){ return 1.0 - smoothstep(w, w + aa, d); }
void main(){
  if (uHalf * vP.z < 0.0) discard;                          // jettisoned fairing: only one half of the shell
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(uLight); vec3 Vv = uEye - vW; float dist = max(length(Vv), 1e-3); vec3 V = Vv / dist;
  float metal = uMetal; vec3 alb = vC * uTint; float ao = 1.0; float sheen = 0.0; vec3 emis = vec3(0.0);
  float aa = max(uPx * dist, 1e-4) * 1.25;                 // one pixel, in metres
  if (uDetail > 0.5 && uMat > 0.5) {
    float ax = vP.x; float R = max(uDims.z, 0.05); float x0 = uDims.x, x1 = uDims.y; float sd = uDims.w;
    float ang = atan(vP.z, vP.y); float u = ang * 0.15915494 + 0.5; float arc = u * 6.2831853 * R;
    if (uMat < 1.5) { // ---- tank: skin panels, welds, rivets, insulation, frost
      float gap = max(1.8 * R, 0.6); float sx = (ax - x0) / gap; float ring = abs(fract(sx + 0.5) - 0.5) * gap;
      float nP = clamp(floor(6.2831853 * R / 1.5 + 0.5), 4.0, 18.0); float su = u * nP; float weld = min(fract(su), 1.0 - fract(su)) * 6.2831853 * R / nP;
      float tone = 0.94 + 0.12 * h21(vec2(floor(sx), floor(su)) + sd);
      float lw = 0.006 + 0.006 * R;
      float seam = max(ln(ring, lw, aa), ln(weld, lw * 0.8, aa));
      alb *= tone * (1.0 - 0.34 * seam);
      float stq = n2(vec2(ax * 0.05, arc * 4.0 / (R + 0.4)) + sd) * 0.6 + n2(vec2(ax * 0.18, arc * 11.0 / (R + 0.4)) + sd * 2.0) * 0.4;   // 2.4: long weathering streaks running down the skin, heavier towards the engine end
      alb *= 1.0 - 0.32 * smoothstep(0.38, 0.8, stq) * (0.35 + 0.65 * (1.0 - smoothstep(x0, x1, ax)));
      sheen += 0.05;
      float rp = 0.11 * R + 0.02; float rv = length(vec2(abs(ring - 0.05 * R - 0.012), (fract(arc / rp) - 0.5) * rp));
      float riv = ln(rv, 0.007 + 0.004 * R, aa) * (1.0 - smoothstep(0.25 * rp, 0.7 * rp, aa));
      alb *= 1.0 - 0.25 * riv; alb += 0.05 * riv * ln(rv, 0.0035, aa);
      float qx = (ax - x0) / R;
      ao = 1.0 - 0.32 * exp(-(ax - x0) / (0.25 * R + 0.06)) - 0.32 * exp(-(x1 - ax) / (0.25 * R + 0.06));
      if (R > 0.4 && uFx.w < 0.5) { // 2.6 livery: a colour band under the top dome, plus a roll pattern or stripes on some stages (picked from the part's seed)
        float lv = floor(fract(sd * 0.7371 + 0.13) * 4.0); float topD = x1 - ax; float len = max(x1 - x0, 0.1);
        float band = smoothstep(0.0, aa * 2.0 + 0.01, topD - 0.04 * len) * (1.0 - smoothstep(0.0, aa * 2.0 + 0.01, topD - 0.04 * len - 0.45 * R));
        vec3 bc = lv < 0.5 ? vec3(0.78, 0.12, 0.10) : lv < 1.5 ? vec3(0.10, 0.22, 0.62) : lv < 2.5 ? vec3(0.92, 0.48, 0.10) : vec3(0.06);
        alb = mix(alb, bc, band * 0.95);
        float rl = smoothstep(0.30, 0.34, abs(cos(ang))) * step(0.1 * len, topD - 0.3 * R) * (1.0 - step(0.78 * len, topD));
        float chk = mod(floor((ax - x0) / (1.5 * R)) + floor(u * 4.0 + 0.5), 2.0) * step(0.2 * len, topD - 0.5 * R) * (1.0 - step(0.55 * len, topD));
        if (lv > 0.5 && lv < 1.5) alb = mix(alb, vec3(0.05), rl * 0.9);
        else if (lv > 1.5 && lv < 2.5) alb = mix(alb, vec3(0.05), chk * 0.9);
        sheen += 0.06;
      }
      float fr = uFx.x;
      if (fr > 0.01) {
        vec2 q = vec2(ax * 0.5, arc * 2.2) / R;
        float f = 0.5 * n2(q * 2.5 + sd) + 0.3 * n2(q * 7.0 + 3.0) + 0.2 * n2(vec2(ax * 0.12, arc * 3.5) / R + 9.0);
        float low = 1.0 - smoothstep(x0, x1, ax);
        float m = smoothstep(0.72 - 0.5 * fr, 0.9 - 0.45 * fr, f + 0.12 * low * fr) * min(1.0, fr * 1.5);
        alb = mix(alb, vec3(0.92, 0.95, 1.0), m * 0.92); metal *= 1.0 - m; sheen += m * 0.12;
      }
    } else if (uMat < 2.5) { // ---- engine bell / chamber: bronze throat, steel skirt, cooling ribs, soot, glowing throat
      float rad = length(vP.yz); float e = clamp((x1 - ax) / max(x1 - x0, 0.05), 0.0, 1.0);
      float band = 0.5 + 0.5 * sin(e * 37.0);
      vec3 bronze = vec3(0.62, 0.35, 0.16), steel = vec3(0.30, 0.31, 0.35);
      vec3 cc = mix(bronze, steel, smoothstep(0.0, 0.55, e));
      cc *= 0.82 + 0.3 * band * smoothstep(0.1, 0.4, e);
      float soot = max(uFx.z, 0.28) * smoothstep(0.25, 1.0, e);   // exhaust staining at the exit, even on a new engine
      cc += vec3(0.22, 0.10, -0.06) * exp(-pow((e - 0.42) / 0.09, 2.0)) + vec3(-0.06, 0.0, 0.14) * exp(-pow((e - 0.58) / 0.07, 2.0));   // straw and blue temper colours from the heat
      cc = mix(cc, vec3(0.06, 0.05, 0.05) + 0.06 * n2(vec2(ax, ang * 3.0) * 6.0), soot * (0.65 + 0.3 * n2(vec2(ax * 9.0, ang * 4.0))));
      float temper = 0.5 + 0.5 * sin(e * 11.0 + ang * 0.5); cc += vec3(0.05, 0.02, -0.03) * temper * (1.0 - e) * 0.4;
      alb = cc * uTint; metal = mix(0.85, 0.55, soot);
      float hot = uFx.y; emis += vec3(1.0, 0.36, 0.08) * hot * 0.55 * (1.0 - smoothstep(0.0, 0.55, e)) * (0.8 + 0.4 * n2(vec2(ax * 5.0, ang * 7.0)));
      ao = 1.0 - 0.25 * exp(-(x1 - ax) / (0.3 * R + 0.05));
    } else if (uMat < 3.5) { // ---- solar array: cells with bus bars, dark glassy blue
      vec2 cp = vP.xz / 0.16; vec2 cf = abs(fract(cp) - 0.5);
      float grid = ln(min((0.5 - cf.x) * 0.16, (0.5 - cf.y) * 0.16), 0.003, aa);
      float bus = ln(abs(fract(cp.x * 3.0) - 0.5) * 0.16 / 3.0, 0.0006, aa) * 0.4;
      vec3 cell = mix(vec3(0.030, 0.055, 0.17), vec3(0.06, 0.09, 0.26), n2(floor(cp) * 1.7));
      cell = mix(cell, vec3(0.10, 0.12, 0.22), bus * 0.5);
      alb = mix(cell, vec3(0.63, 0.65, 0.72), grid * 0.9); metal = mix(0.85, 0.3, grid); sheen += 0.25 * (1.0 - grid);
    } else if (uMat < 4.5) { // ---- MLI foil: crinkled gold
      vec3 p3 = vP * 11.0 + sd;
      float cr = sin(p3.x * 1.7 + 2.0 * sin(p3.y * 1.3)) * sin(p3.z * 1.9 + 1.5 * sin(p3.x)) + 0.6 * sin(p3.y * 3.1 + p3.z * 2.3);
      n = normalize(n + 0.30 * vec3(cos(p3.x * 1.7), 0.6 * cos(p3.y * 3.1), cos(p3.z * 1.9)) * cr);
      alb = mix(vec3(0.86, 0.60, 0.16), vec3(1.0, 0.82, 0.38), 0.5 + 0.5 * cr) * uTint; metal = 0.85;
    } else if (uMat < 5.5) { // ---- heat shield: ablative char or white tiles
      vec2 tp = vec2(ax, arc) / (0.35 * R + 0.15); vec2 tf = abs(fract(tp) - 0.5);
      float g = ln(min(0.5 - tf.x, 0.5 - tf.y) * (0.35 * R + 0.15), 0.008, aa);
      float ch = 0.6 + 0.6 * n2(tp * 1.3 + sd) + 0.25 * h21(floor(tp));
      alb = vec3(0.13, 0.10, 0.085) * ch * (1.0 - 0.6 * g) + vec3(0.03, 0.02, 0.012) * g; metal = 0.0; sheen += 0.02;
    } else if (uMat < 6.5) { // ---- painted fairing / nose: gloss white, separation line, sparse panel lines
      float gap = max(2.4 * R, 1.0); float sx = (ax - x0) / gap; float ring = abs(fract(sx + 0.5) - 0.5) * gap;
      float split = ln(abs(vP.z), 0.004 + 0.003 * R, aa) * step(0.0, vP.y);   // the two shell halves meet along this line
      alb *= 1.0 - 0.22 * ln(ring, 0.004 + 0.004 * R, aa) - 0.3 * split;
      ao = 1.0 - 0.28 * exp(-(ax - x0) / (0.3 * R + 0.06)); sheen += 0.1;
    } else if (uMat < 7.5) { // ---- interstage / skirts: dark corrugated stringers
      float ns = clamp(floor(6.2831853 * R / 0.35), 12.0, 72.0);
      float s = sin(u * ns * 6.2831853);
      alb *= 0.9 + 0.14 * s * (1.0 - smoothstep(0.1, 0.35, aa * ns * 0.16));
      float ring = abs(fract((ax - x0) / max(1.5 * R, 0.5) + 0.5) - 0.5) * max(1.5 * R, 0.5); alb *= 1.0 - 0.3 * ln(ring, 0.006 + 0.004 * R, aa);
      ao = 1.0 - 0.3 * exp(-(ax - x0) / (0.25 * R + 0.06)) - 0.3 * exp(-(x1 - ax) / (0.25 * R + 0.06));
    } else if (uMat < 8.5) { // ---- boxes / instruments / structures: faint panel grid and dirt
      vec3 a3 = abs(vP);
      float pg = 0.2 + 0.3 * R; vec3 gf = abs(fract(vP / pg + 0.5) - 0.5) * pg;
      float ln1 = max(ln(gf.x, 0.004, aa), max(ln(gf.y, 0.004, aa), ln(gf.z, 0.004, aa)));
      alb *= (0.94 + 0.1 * n2(vP.xy * 7.0 + vP.z * 3.0 + sd)) * (1.0 - 0.2 * ln1);
      ao = 0.85 + 0.15 * smoothstep(0.0, 0.5, dot(n, uUp) * 0.5 + 0.5);
    } else { // ---- launch pad / ground structures: weathered steel and concrete
      float dirt = n2(vP.xz * 0.35 + vP.y * 0.2); float hgt = clamp(vP.y / 60.0, 0.0, 1.0);
      alb *= (0.8 + 0.3 * dirt) * (1.0 - 0.3 * (1.0 - hgt) * (1.0 - hgt));
      alb *= 0.93 + 0.14 * n2(vP.xz * 3.1 + vP.y * 1.7);
      ao = 0.7 + 0.3 * hgt;
    }
  }
  float ndl = dot(n, L); float wrap = 0.24 * (1.0 - metal); float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0); diff *= diff * (3.0 - 2.0 * diff) * 0.35 + 0.65; float back = 0.12 * max(-ndl, 0.0);   // soft terminator (paint scatters light a little past the shadow line)
  float hemi = dot(n, uUp) * 0.5 + 0.5;
  vec3 amb = mix(max(uGndA, uSkyA * 0.5), uSkyA, hemi);   // undersides still get scattered sky light, never pure black
  vec3 col = alb * (1.0 - 0.5 * metal) * (amb * uAmbient * 1.45 * ao + uSunCol * (1.0 - 0.45 * metal) * (diff * (1.0 - uAmbient * 0.35)) * mix(1.0, ao, 0.5) + back);
  vec3 H = normalize(L + V); float ns = max(dot(n, H), 0.0);
  float spec = pow(ns, mix(22.0, 110.0, metal)) * (0.14 + 0.85 * metal + sheen) * step(0.0, ndl);
  col += uSunCol * spec * mix(vec3(1.0), clamp(alb * 1.6 + 0.15, 0.0, 1.0), metal);
  if (sheen > 0.03) col += uSunCol * pow(ns, 320.0) * 0.55 * (1.0 - metal) * step(0.0, ndl);   // 2.6 clear-coat: a tight second highlight on painted skin
  vec3 r = reflect(-V, n); float sky = smoothstep(-0.35, 0.45, dot(r, uUp));
  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += mix(uGndA, uSkyA * 1.15, sky) * (metal * (0.22 + 0.4 * fr) + 0.05 * fr) * uTint * ao * mix(vec3(1.0), clamp(alb * 1.8, 0.0, 1.0), metal);   // metals reflect in their own colour
  col += uSkyA * fr * 0.22 * (0.35 + 0.65 * hemi);
  if (uFillCol.r + uFillCol.g + uFillCol.b > 0.0) { // second light: studio key/rim in the designer, floodlights at night
    vec3 F = normalize(uFill); float fd = max(dot(n, F), 0.0); vec3 Hf = normalize(F + V);
    col += uFillCol * (alb * fd * 0.9 * mix(1.0, ao, 0.6) + pow(max(dot(n, Hf), 0.0), mix(18.0, 90.0, metal)) * (0.1 + 0.6 * metal + sheen) * step(0.0, fd));
  }
  if (uPLr > 0.0) { // point light (engine flame): falls off with distance
    vec3 d = uPL - vW; float dd = dot(d, d); float att = 1.0 / (1.0 + dd / (uPLr * uPLr));
    float pd = max(dot(n, d * inversesqrt(dd + 1e-4)), 0.0) * 0.8 + 0.2;
    col += uPLCol * att * att * pd * (alb * 1.2 + 0.25 * metal);
  }
  col += uEmissive * uTint + emis;
  float gl = max(dot(n, uGlowDir), 0.0); col += uGlow * (0.15 + 0.85 * gl * gl);
  col = pow(max(col, vec3(0.0)), vec3(0.82));
  vec3 hi = max(col - 0.8, 0.0); col = min(col, vec3(0.8)) + 0.3 * (1.0 - exp(-hi * 3.3));   // soft shoulder instead of hard clipping
  float a = uAlpha;
  if (uMirror > 0.0) a *= exp(-max(-vW.y, 0.0) / uMirror);                  // floor reflection fades with depth
  gl_FragColor = vec4(col, a);
}`;

const FLAT_VS = `attribute vec3 aPos; uniform mat4 uMVP; uniform float uSize; varying vec3 vP; void main(){ vP = aPos; gl_Position = uMVP * vec4(aPos,1.0); gl_PointSize = uSize; }`;
const FLAT_FS = `precision mediump float; uniform vec4 uColor; uniform float uFade; varying vec3 vP;
void main(){ float a = uColor.a; if (uFade > 0.0) a *= 1.0 - smoothstep(uFade * 0.25, uFade, length(vP.xz)); gl_FragColor = vec4(uColor.rgb, a); }`;

// fullscreen gradient (design view background)
const BG_VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const BG_FS = `precision mediump float; varying vec2 vUv; uniform vec3 uTop; uniform vec3 uBot; uniform float uVig;
void main(){ float t = clamp(vUv.y * 0.5 + 0.5, 0.0, 1.0); vec3 c = mix(uBot, uTop, pow(t, 0.8)); c *= 1.0 - uVig * dot(vUv, vUv) * 0.22; gl_FragColor = vec4(c, 1.0); }`;

// ---- post-processing: bright-pass + separable blur (bloom), composite with soft shoulder, vignette, subtle radial speed blur
const POST_VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const POST_BRIGHT_FS = `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uPx; uniform float uThr;
void main(){ vec3 c = texture2D(uTex, vUv + uPx * vec2(-0.5, -0.5)).rgb + texture2D(uTex, vUv + uPx * vec2(0.5, -0.5)).rgb + texture2D(uTex, vUv + uPx * vec2(-0.5, 0.5)).rgb + texture2D(uTex, vUv + uPx * vec2(0.5, 0.5)).rgb; c *= 0.25;
  float l = max(max(c.r, c.g), c.b); float k = clamp((l - uThr) / (1.0 - uThr + 0.2), 0.0, 1.0); gl_FragColor = vec4(c * k * k * 2.0, 1.0); }`;
const POST_BLUR_FS = `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;
void main(){ vec3 c = texture2D(uTex, vUv).rgb * 0.2270; c += (texture2D(uTex, vUv + uDir * 1.3846).rgb + texture2D(uTex, vUv - uDir * 1.3846).rgb) * 0.3162; c += (texture2D(uTex, vUv + uDir * 3.2308).rgb + texture2D(uTex, vUv - uDir * 3.2308).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }`;
const POST_COMP_FS = `precision mediump float; varying vec2 vUv; uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomK; uniform float uVig; uniform float uBlur; uniform vec3 uTint;
uniform float uFilm; uniform float uTime; uniform float uExpo;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }   // Narkowicz ACES fit (2.0)
float grain(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453) - 0.5; }
void main(){
  vec2 d = vUv - 0.5; vec3 c = texture2D(uScene, vUv).rgb;
  if (uFilm > 0.0) { vec2 ca = d * 0.0035 * uFilm * dot(d, d) * 4.0; c.r = texture2D(uScene, vUv + ca).r; c.b = texture2D(uScene, vUv - ca).b; }   // lens fringing at the edges
  if (uBlur > 0.0) { c += texture2D(uScene, vUv - d * uBlur).rgb + texture2D(uScene, vUv - d * uBlur * 2.0).rgb + texture2D(uScene, vUv - d * uBlur * 3.0).rgb; c *= 0.25; }
  c += texture2D(uBloom, vUv).rgb * uBloomK + uTint;
  if (uFilm > 0.0) {   // 2.0 filmic pipeline: exposure, ACES tone curve blended with the old look, a little saturation
    vec3 f = aces(c * uExpo * 1.35);
    c = mix(min(c, 0.78) + 0.22 * (1.0 - exp(-max(c - 0.78, 0.0) / 0.22)), f, 0.65 * uFilm);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.0 + 0.08 * uFilm);
  } else {
    vec3 over = max(c - 0.78, 0.0); c = min(c, 0.78) + 0.22 * (1.0 - exp(-over / 0.22));      // soft highlight shoulder instead of hard clipping
  }
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);                                                  // gentle contrast curve
  c *= 1.0 - uVig * smoothstep(0.35, 0.95, length(d * vec2(1.15, 1.0)) * 1.25);
  c += grain(gl_FragCoord.xy) * 0.014 * uFilm;                                                 // fine film grain (hides banding in the sky)
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`;
// soft disc on the ground plane (shadow / glow)
const DISC_VS = `attribute vec3 aPos; uniform mat4 uMVP; varying float vR; void main(){ vR = length(aPos.xz); gl_Position = uMVP * vec4(aPos,1.0); }`;
const DISC_FS = `precision mediump float; varying float vR; uniform vec4 uColor; uniform float uInner;
void main(){ float k = 1.0 - smoothstep(uInner, 1.0, vR); gl_FragColor = vec4(uColor.rgb, uColor.a * k * k); }`;

// ---- planets
const PLANET_PROC_VS = `attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vObj; varying vec3 vN;
void main(){ vObj = aPos; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aPos; gl_Position = uMVP * vec4(aPos,1.0); }`;
const PLANET_PROC_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vObj; varying vec3 vN; uniform vec3 uLight; uniform int uKind;
float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int k=0;k<5;k++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 o = normalize(vObj); float n = fbm(o*3.2 + 3.7); float m = fbm(o*11.0);
  vec3 col;
  if (uKind == 0) { float land = smoothstep(0.50, 0.53, n);
    vec3 sea = mix(vec3(0.02,0.09,0.25), vec3(0.05,0.2,0.4), m*0.6);
    vec3 grn = mix(vec3(0.12,0.28,0.10), vec3(0.42,0.36,0.2), smoothstep(0.55,0.72,n)+m*0.3);
    col = mix(sea, grn, land); float ice = smoothstep(0.91, 0.97, abs(o.z)); col = mix(col, vec3(0.92,0.95,0.98), ice);
  } else if (uKind == 1) { float c = fbm(o*18.0); col = vec3(0.42) * (0.55 + 0.6*n) * (0.85+0.3*c);
  } else if (uKind == 2) { col = mix(vec3(0.55,0.24,0.12), vec3(0.78,0.45,0.25), n) * (0.8 + 0.4*m);
    float ice = smoothstep(0.94, 0.985, abs(o.z)); col = mix(col, vec3(0.93), ice);
  } else { col = vec3(0.6, 0.55, 0.5) * (0.6 + 0.6*n); }
  float d = dot(normalize(vN), normalize(uLight)); float lit = smoothstep(-0.08, 0.25, d);
  gl_FragColor = vec4(col * (0.03 + 0.97 * lit * (0.25 + 0.75 * max(d,0.0))), 1.0);
}`;

const PLANET_VS = `attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; uniform mat4 uMVP; uniform mat4 uModel;
varying vec2 vUV; varying vec3 vN; varying vec3 vW;
void main(){ vUV = aCol.xy; vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aPos; gl_Position = uMVP * vec4(aPos,1.0); }`;
const PLANET_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV; varying vec3 vN; varying vec3 vW;
uniform sampler2D uA; uniform sampler2D uB; uniform vec3 uLight; uniform vec3 uEye; uniform int uKind; uniform float uBump; uniform vec2 uTexel; uniform float uSun; uniform float uFill;
void main(){
  vec3 nG = normalize(vN); vec3 L = normalize(uLight); vec3 V = normalize(uEye - vW);
  vec4 a = texture2D(uA, vUV);
  vec3 n = nG;
  if (uBump > 0.0) {
    vec3 east = normalize(vec3(-nG.y, nG.x, 1e-4)); vec3 north = cross(nG, east);
    float hE = texture2D(uA, vUV + vec2(uTexel.x, 0.0)).a; float hS = texture2D(uA, vUV + vec2(0.0, uTexel.y)).a;
    float cl = max(sqrt(max(1.0 - nG.z * nG.z, 0.0)), 0.25);
    n = normalize(nG - uBump * ((hE - a.a) / cl * east - (hS - a.a) * north));
  }
  float nl = dot(nG, L);
  float diff = pow(max(dot(n, L) + 0.04, 0.0) / 1.04, 0.92) * smoothstep(-0.04, 0.10, nl);
  vec3 col;
  if (uKind == 0) {
    vec4 b = texture2D(uB, vUV);
    col = a.rgb * diff * uSun;
    vec3 H = normalize(L + V); float ns = max(dot(n, H), 0.0);
    float spec = (pow(ns, 300.0) * 2.4 + pow(ns, 38.0) * 0.20) * b.b * smoothstep(0.0, 0.15, nl);
    col += vec3(1.0, 0.95, 0.85) * spec;
    float fr = pow(1.0 - max(dot(nG, V), 0.0), 4.0); col += b.b * fr * vec3(0.10, 0.18, 0.30) * max(nl, 0.0);
    float tw = exp(-pow(nl / 0.09, 2.0)); col += vec3(0.85, 0.36, 0.12) * tw * 0.10 * (0.4 + dot(a.rgb, vec3(0.6)));
    float night = 1.0 - smoothstep(-0.10, 0.04, nl);
    col += vec3(1.0, 0.72, 0.38) * b.r * 1.7 * night + a.rgb * vec3(0.010, 0.014, 0.030);
    // 2.6 city glow: a soft halo around the lights, sunlight glitter on the sea, and the aurora ovals around the poles on the night side
    float hl = 0.0; for (int i = 0; i < 8; i++) { float an = float(i) * 0.7853982; hl += texture2D(uB, vUV + vec2(cos(an), sin(an)) * uTexel * 5.0).r; }
    col += vec3(1.0, 0.55, 0.22) * (hl * 0.125) * 0.28 * night;
    col += vec3(1.0, 0.92, 0.78) * pow(ns, 70.0) * 0.35 * b.b * smoothstep(0.0, 0.15, nl) * (0.6 + 0.4 * sin(vUV.x * 900.0 + vUV.y * 700.0));
    float lat = (vUV.y - 0.5) * 3.14159265, lon = vUV.x * 6.2831853;
    float oval = exp(-pow((abs(lat) - 1.20) / 0.065, 2.0));
    float curt = 0.5 + 0.5 * sin(lon * 14.0 + sin(lon * 5.0 + abs(lat) * 20.0) * 2.2) * sin(lon * 31.0 + 1.3);
    float au = oval * (0.35 + 0.65 * curt) * night * (0.7 + 1.6 * fr) * (1.0 - 0.8 * b.g);
    col += mix(vec3(0.10, 1.0, 0.45), vec3(0.65, 0.2, 0.85), smoothstep(0.8, 1.0, curt)) * au * 0.5;
  } else if (uKind == 1) {
    col = a.rgb * diff * uSun * 1.05 + a.rgb * 0.004;
  } else {
    col = a.rgb * diff * uSun + a.rgb * vec3(0.012, 0.008, 0.006);
    float tw = exp(-pow(nl / 0.10, 2.0)); col += vec3(0.25, 0.30, 0.45) * tw * 0.05;
  }
  col += a.rgb * vec3(0.52, 0.66, 1.0) * uFill * (1.0 - smoothstep(-0.06, 0.32, nl));   // earthshine / starlight: the night side is dim but never black
  gl_FragColor = vec4(col, 1.0);
}`;
const CLOUD_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV; varying vec3 vN; varying vec3 vW;
uniform sampler2D uB; uniform vec3 uLight; uniform float uAlpha; uniform vec2 uTexel; uniform float uSun;
void main(){
  vec3 nG = normalize(vN); vec3 L = normalize(uLight);
  float c = texture2D(uB, vUV).g;
  float c2 = texture2D(uB, vUV + vec2(uTexel.x * 1.5, uTexel.y * 1.5 * sign(L.z + 1e-4))).g;
  float nl = dot(nG, L);
  float shade = clamp(1.0 - (c2 - c) * 1.2, 0.55, 1.15);
  float day = smoothstep(-0.05, 0.25, nl) * (0.25 + 0.75 * max(nl, 0.0));
  vec3 col = vec3(1.0, 0.99, 0.97) * (0.80 + 0.2 * c) * shade * uSun * day;
  col += vec3(0.95, 0.42, 0.16) * exp(-pow(nl / 0.10, 2.0)) * 0.22 * c;
  col += vec3(0.006, 0.008, 0.014);
  gl_FragColor = vec4(col, c * uAlpha);
}`;

// ---- atmosphere: single scattering, analytic (works from inside and from space). Units km.
const ATMO_VS = `attribute vec3 aPos; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vW; void main(){ vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; gl_Position = uMVP * vec4(aPos,1.0); }`;
const ATMO_FS = `precision highp float;
varying vec3 vW; uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uUp; uniform float uR; uniform float uTop; uniform float uAlt0;
uniform vec3 uBetaR; uniform vec3 uBetaM; uniform float uHR; uniform float uHM; uniform float uG; uniform float uSun; uniform int uSteps;
const int NS = 6;
void main(){
  vec3 d = normalize(vW - uEye); vec3 L = normalize(uLight);
  float r0 = uR + uAlt0; float mu = dot(d, uUp); float b = r0 * mu;
  float c = uAlt0 * (2.0 * uR + uAlt0) - uTop * (2.0 * uR + uTop);
  float disc = b * b - c; if (disc <= 0.0) discard;
  float sq = sqrt(disc); float t0 = max(-b - sq, 0.0); float t1 = -b + sq;
  float cp = uAlt0 * (2.0 * uR + uAlt0); float dp = b * b - cp;
  if (mu < 0.0 && dp > 0.0) t1 = min(t1, -b - sqrt(dp));
  if (t1 <= t0) discard;
  float tl = clamp(-b, t0, t1);
  float dL = dot(d, L); float sunE = dot(uUp, L);
  float phR = 0.75 * (1.0 + dL * dL);
  float gg = uG * uG; float phM = (1.0 - gg) / (12.566 * pow(1.0 + gg - 2.0 * uG * dL, 1.5)) * 1.0053;
  vec3 ins = vec3(0.0); float odR = 0.0; float odM = 0.0;
  for (int s = 0; s < 2; s++) {
    float a0 = s == 0 ? t0 : tl; float a1 = s == 0 ? tl : t1; float len = a1 - a0;
    if (len <= 0.0) continue;
    for (int j = 0; j < NS; j++) {
      if (j >= uSteps) break;
      float fn = float(uSteps);
      float ja = s == 0 ? (fn - float(j)) : float(j); float jb = s == 0 ? (fn - float(j) - 1.0) : float(j) + 1.0;
      float fa = ja * ja / (fn * fn); float fb = jb * jb / (fn * fn);
      float ta = s == 0 ? tl - fa * len : tl + fa * len; float tb = s == 0 ? tl - fb * len : tl + fb * len;
      float tm = 0.5 * (ta + tb); float ds = abs(tb - ta);
      float rt = sqrt(r0 * r0 + 2.0 * b * tm + tm * tm);
      float h = max((cp + 2.0 * b * tm + tm * tm) / (rt + uR), 0.0);
      float dR = exp(-h / uHR); float dM = exp(-h / uHM);
      float ms = (r0 * sunE + tm * dL) / rt; float q = uR / rt; float dip = sqrt(max(1.0 - q * q, 0.0));
      float vis = smoothstep(-dip - 0.06, -dip + 0.02, ms); float am = 1.0 / (max(ms, 0.0) + 0.025);
      vec3 sunT = exp(-(uBetaR * uHR * dR + uBetaM * uHM * dM * 1.1) * am);
      vec3 viewT = exp(-(uBetaR * (odR + 0.5 * dR * ds) + uBetaM * (odM + 0.5 * dM * ds) * 1.1));
      ins += sunT * vis * viewT * (uBetaR * dR * phR + uBetaM * dM * phM) * ds;
      odR += dR * ds; odM += dM * ds;
    }
  }
  vec3 T = exp(-(uBetaR * odR + uBetaM * odM * 1.1));
  vec3 col = vec3(0.90, 0.95, 1.0) * (1.0 - exp(-ins * uSun));   // haze never quite reaches pure white: keeps a pale blue tint at the horizon
  gl_FragColor = vec4(col, (T.r + T.g + T.b) / 3.0);
}`;
// simple fallback atmosphere (used only if the scattering shader cannot run, e.g. no highp in fragment shaders)
const ATMO_SIMPLE_FS = `precision mediump float; varying vec3 vW; uniform vec3 uEye; uniform vec3 uCentre; uniform vec3 uLight; uniform vec3 uColor; uniform float uStrength; uniform float uInner;
void main(){ vec3 rel = vW - uCentre; float rr = length(rel); vec3 n = rel / rr; vec3 d = normalize(vW - uEye); float f = 1.0 - abs(dot(n, d));
 float lit = clamp(dot(n, normalize(uLight)) + 0.3, 0.0, 1.0); float a = pow(f, 3.0) * uStrength * lit; gl_FragColor = vec4(uColor * a, 1.0); }`;

const SUN_VS = `attribute vec2 aPos; uniform vec2 uCenter; uniform vec2 uHalf; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(uCenter + aPos * uHalf, 0.9999995, 1.0); }`;
const SUN_FS = `precision highp float; varying vec2 vP; uniform vec3 uCol; uniform float uScale; uniform float uHalfH; uniform float uCore; uniform float uGlow;
void main(){
  float r = length(vP) * uHalfH * uScale;                // angular radius [rad]
  float disc = 1.0 - smoothstep(uCore * 0.92, uCore * 1.08, r);
  float g1 = exp(-r / (uCore * 2.6)) * 0.9, g2 = exp(-r / 0.045) * 0.42, g3 = 0.030 / (1.0 + (r / 0.16) * (r / 0.16));
  vec3 c = uCol * (disc * 4.0 + (g1 + g2 + g3) * uGlow);
  gl_FragColor = vec4(1.0 - exp(-c), 1.0);
}`;
// lens flare ghosts: small additive quads placed along the line from the sun through the screen centre (ring ghosts and an anamorphic streak)
const FLARE_VS = `attribute vec2 aPos; uniform vec2 uCenter; uniform vec2 uHalf; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(uCenter + aPos * uHalf, 0.0, 1.0); }`;
const FLARE_FS = `precision mediump float; varying vec2 vP; uniform vec3 uCol; uniform float uA; uniform float uKind;
void main(){
  float r = length(vP); float a;
  if (uKind < 0.5) a = smoothstep(1.0, 0.82, r) * (0.25 + 0.75 * smoothstep(0.35, 0.95, r));
  else if (uKind < 1.5) a = smoothstep(1.0, 0.0, r); 
  else a = exp(-abs(vP.y) * 26.0) * (1.0 - abs(vP.x)) * (1.0 - abs(vP.x));
  gl_FragColor = vec4(uCol * a * uA, 1.0);
}`;
const STAR_VS = `attribute vec3 aPos; attribute vec4 aCol; uniform mat4 uVP; uniform float uScale; uniform float uBright; varying vec3 vCol;
void main(){ vCol = aCol.rgb * uBright; gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = max(1.0, aCol.a * uScale); }`;
const STAR_FS = `precision mediump float; varying vec3 vCol; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.25, 1.0, d); gl_FragColor = vec4(vCol * a, 1.0); }`;
const DOME_VS = `attribute vec3 aPos; uniform mat4 uVP; varying vec3 vDir; void main(){ vDir = aPos; gl_Position = uVP * vec4(aPos * 1000.0, 1.0); }`;
const DOME_FS = `precision highp float; varying vec3 vDir; uniform sampler2D uA; uniform float uBright;
void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.y, d.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(d.z, -1.0, 1.0)) / 3.1415927); gl_FragColor = vec4(texture2D(uA, uv).rgb * uBright, 1.0); }`;

// ---- ground patch near the vehicle: noisy terrain, roads, pad apron with scorch marks, sea, distance fog
const GROUND_VS = `attribute vec3 aPos; uniform mat4 uMVP; uniform vec2 uOffset; uniform float uRadius; varying vec2 vXY; varying vec2 vLoc; varying float vR; varying float vDepth;
void main(){ vLoc = aPos.xz * uRadius; vXY = vLoc + uOffset; vR = length(aPos.xz); gl_Position = uMVP * vec4(aPos,1.0); vDepth = gl_Position.w; }`;
// Noise is periodic (16384 m) so the CPU can keep the offset small and the pattern never swims or quantises far from the origin.
const GROUND_FS = `precision highp float; varying vec2 vXY; varying vec2 vLoc; varying float vR; varying float vDepth;
uniform vec3 uBase; uniform vec3 uBase2; uniform vec3 uFog; uniform vec3 uSunCol; uniform vec3 uAmbCol; uniform float uAlpha; uniform float uFogK; uniform float uWater; uniform float uEdge;
uniform vec2 uPad; uniform float uPadOn; uniform float uPadS; uniform float uKind; uniform float uTime;
uniform float uCamH; uniform vec3 uSunV; uniform vec4 uShA; uniform vec3 uShAp; uniform vec4 uShB; uniform vec3 uShBp;
float segd(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0); return length(pa - ba * t); }
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnp(vec2 p, float N){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); vec2 i0 = mod(i, N), i1 = mod(i + 1.0, N);
  return mix(mix(h(i0), h(vec2(i1.x, i0.y)), f.x), mix(h(vec2(i0.x, i1.y)), h(i1), f.x), f.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float lod(float size){ float foot = vDepth * 0.0024 * max(1.0, vDepth / uCamH); return 1.0 - smoothstep(0.25 * size, 1.1 * size, foot); }   // footprint of a pixel on the ground: long when we look along it from a low camera
void main(){
  vec2 p = vXY;
  float n0 = vnp(p / 2048.0, 8.0), n1 = vnp(p / 512.0 + 7.0, 32.0), n2 = vnp(p / 64.0 + 3.0, 256.0), n3 = vnp(p / 8.0 + 11.0, 2048.0), n4 = vnp(p / 2.0 + 5.0, 8192.0);
  float l2 = lod(64.0), l3 = lod(8.0), l4 = lod(2.0);
  float pat = clamp(n0 * 0.6 + n1 * 0.6 - 0.15, 0.0, 1.0);
  vec3 col = mix(uBase, uBase2, pat);
  col *= 0.78 + 0.40 * mix(0.5, n2, l2) + 0.2 * (n1 - 0.5);
  col *= 1.0 + (mix(0.5, n3, l3) - 0.5) * 0.45 + (mix(0.5, n4, l4) - 0.5) * 0.30;
  float l5 = lod(1.4); if (l5 > 0.0) { float g5 = vnp(p / 0.35, 46811.0), g6 = vnp(p / 0.9 + 3.0, 18204.0); col *= 1.0 + (g5 - 0.5) * 0.42 * l5 + (g6 - 0.5) * 0.22 * l5; }   // blades of grass / grit close to the camera
  if (uKind < 0.5 && uWater <= 0.0) { // farmland: field parcels with their own crop tone, furrows, hedgerows, tree stands
    vec2 q = mat2(0.9, -0.43, 0.43, 0.9) * p / 380.0; vec2 id = floor(q); vec2 fq = fract(q); float hh = h(id + 1.3);
    float fieldM = step(0.3, h(id + 7.0)); float lf = lod(380.0), lf2 = lod(10.0);
    vec3 crop = mix(vec3(0.80, 1.0, 0.62), vec3(1.32, 1.12, 0.66), h(id + 3.0)); crop = mix(crop, vec3(1.1, 0.95, 0.78), step(0.86, hh));
    col = mix(col, col * crop * (0.82 + 0.34 * hh), fieldM * 0.62 * lf);
    float ang = hh * 6.2831853; col *= 1.0 + 0.07 * sin(dot(p, vec2(cos(ang), sin(ang))) * 1.9) * lf2 * fieldM;
    float eg = min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y)); col *= 1.0 - 0.30 * (1.0 - smoothstep(0.0, 0.010, eg)) * lf * (0.5 + 0.5 * fieldM);
    float forest = smoothstep(0.60, 0.72, n1 * 0.7 + n0 * 0.5) * (1.0 - fieldM * 0.6); col = mix(col, col * vec3(0.52, 0.66, 0.46) * (0.7 + 0.6 * mix(0.5, n3, l3)), forest * 0.85 * lf);
  }
  if (uKind > 0.5) {
    float rock = smoothstep(0.78, 0.92, n3) * l3; col = mix(col, col * 1.45, rock); col *= 1.0 - 0.25 * smoothstep(0.55, 0.3, n2) * l2;
    // craters at three scales (bowl + raised rim, shaded by the real sun direction so low sun gives long dark walls) and scattered boulders with cast shadows
    vec2 sd2 = uSunV.xy / (uSunV.z + 0.22); float shade = 1.0; float alb = 1.0;
    for (int k = 0; k < 3; k++) {
      float S = k == 0 ? 70.0 : k == 1 ? 15.0 : 3.6; float lk = lod(S * 0.5);
      if (lk > 0.01) {
        vec2 cp = p / S + float(k) * 17.3; vec2 id = floor(cp); vec2 fq = fract(cp);
        vec2 c = vec2(0.32 + 0.36 * h(id + 1.7), 0.32 + 0.36 * h(id + 4.1)); float Rr = 0.12 + 0.17 * h(id + 8.3); float has = step((k == 0 ? 0.55 : 0.4) + (uKind > 1.5 ? 0.3 : 0.0), h(id + 2.2));
        vec2 d = (fq - c) / Rr; float rr = length(d) + 1e-3; float dh = rr < 1.0 ? 1.7 * rr : -1.1 * exp(-(rr - 1.0) * 3.2);
        float dep = (k == 0 ? 0.9 : 0.8) * Rr * S * 0.06 * 5.0;
        float sl = dh * dot(d / rr, sd2) * min(1.0, dep * 0.35 + 0.35) * (rr < 3.0 ? 1.0 : 0.0);
        shade *= mix(1.0, clamp(1.0 - 0.55 * sl, 0.35, 1.6), has * lk * (1.0 - smoothstep(1.6, 3.0, rr)));
        alb *= mix(1.0, rr < 1.0 ? 0.88 : 1.07, has * lk * (1.0 - smoothstep(1.0, 2.0, rr)));
      }
    }
    float lr = lod(1.2); if (lr > 0.01) { vec2 cp = p / 1.7 + 41.0; vec2 id = floor(cp); vec2 fq = fract(cp); float has = step(0.86, h(id + 5.5));
      vec2 c = vec2(0.3 + 0.4 * h(id + 9.1), 0.3 + 0.4 * h(id + 3.7)); float rr = 0.07 + 0.12 * h(id + 6.2); float dd = length(fq - c);
      float body = smoothstep(rr, rr * 0.6, dd); float shd = smoothstep(rr * 1.1, rr * 0.3, length(fq - c - normalize(-sd2 + 1e-3) * rr * 1.5)) * (1.0 - body);
      shade *= 1.0 - has * lr * (0.5 * shd - 0.3 * body * clamp(dot(normalize(fq - c + 1e-3), sd2) * 0.5 + 0.5, 0.0, 1.0)); alb *= 1.0 + has * lr * 0.2 * body; }
    col *= shade * alb;
    if (uKind > 1.5) { float rip = sin(dot(p, vec2(0.62, 0.34)) * 2.2 + 5.0 * n2 + 2.0 * n3) * 0.5 + 0.5; col *= 1.0 + 0.07 * (rip - 0.5) * lod(3.0) + 0.05 * (n1 - 0.5); }   // wind-blown sand ripples
  }
  if (uWater > 0.0) {
    float w1 = vn(p / 14.0 + vec2(uTime * 0.35, uTime * 0.2)), w2 = vn(p / 4.0 - vec2(uTime * 0.5, 0.0));
    vec3 sea = mix(vec3(0.02, 0.10, 0.22), vec3(0.05, 0.22, 0.38), n1) * (0.85 + 0.35 * mix(0.5, w1, l3) + 0.15 * mix(0.5, w2, l4));
    col = mix(col, sea, uWater);
  } else if (uKind < 0.5 && uPadOn > 0.0) {
    float road = min(abs(vLoc.x - uPad.x), abs(vLoc.y - uPad.y)) / uPadS; float dp = length(vLoc - uPad);
    float roadW = 1.0 - smoothstep(3.0, 4.6, road);
    float roadLen = (1.0 - smoothstep(4000.0, 6500.0, dp)) * smoothstep(60.0, 120.0, dp) * (1.0 - smoothstep(1800.0, 4200.0, vDepth));
    col = mix(col, vec3(0.16, 0.16, 0.17) * (0.9 + 0.2 * n3), roadW * roadLen);
  }
  if (uPadOn > 0.0) {
    vec2 dv = vLoc - uPad; float d = length(dv) / uPadS;
    float apron = 1.0 - smoothstep(62.0, 70.0, d);
    vec3 conc = vec3(0.50, 0.50, 0.48) * (0.88 + 0.22 * mix(0.5, n3, l3) + 0.1 * mix(0.5, n4, l4));
    col = mix(col, conc, apron);
    vec2 tv = dv / uPadS; float tw = abs(tv.x);                                   // flame trench: a dark slot leading away from the pad
    float trench = (1.0 - smoothstep(6.0, 7.2, tw)) * smoothstep(-9.0, -6.0, tv.y) * (1.0 - smoothstep(64.0, 69.0, tv.y));
    float lip = (1.0 - smoothstep(7.2, 9.5, tw)) * (1.0 - trench) * smoothstep(-9.0, -6.0, tv.y) * (1.0 - smoothstep(64.0, 69.0, tv.y));
    col = mix(col * (1.0 + 0.18 * lip), vec3(0.035, 0.03, 0.03) * (0.6 + 0.8 * smoothstep(0.0, 70.0, tv.y)), trench * 0.94);
    float ang = atan(dv.y, dv.x); float streak = vn(vec2(ang * 7.0, d / 26.0));
    float scorch = exp(-pow(d / 28.0, 2.0)) * 0.85 + 0.45 * streak * exp(-d / 38.0) * (1.0 - smoothstep(58.0, 70.0, d));
    col *= 1.0 - clamp(scorch, 0.0, 0.85) * 0.78 * apron;
    float burn = exp(-pow(d / 95.0, 2.0)) * 0.45 * (1.0 - apron) * smoothstep(0.3, 0.7, vn(p / 18.0));
    col *= 1.0 - burn;
  }
  float sh = uShAp.z * (1.0 - smoothstep(uShAp.x, uShAp.x + uShAp.y, segd(vLoc, uShA.xy, uShA.zw)));
  sh = max(sh, uShBp.z * (1.0 - smoothstep(uShBp.x, uShBp.x + uShBp.y, segd(vLoc, uShB.xy, uShB.zw))));
  col *= uAmbCol + uSunCol * (1.0 - sh);
  float hs = max(uCamH, 1.0); float f = 1.0 - exp(-vDepth * uFogK * (3000.0 / hs) * (1.0 - exp(-hs / 3000.0)));   // aerosol haze thins out with height: the mean density along the ray
  f = max(f, 0.45 * smoothstep(uEdge * 0.55, uEdge, vR) * (1.0 - exp(-hs / 1500.0)));
  col = mix(col, uFog, f);
  float a = uAlpha * (1.0 - smoothstep(uEdge, 1.0, vR));
  gl_FragColor = vec4(col, a);
}`;

// ---- soft sprites (smoke puffs, glows): camera-facing quads in one dynamic buffer
const SPRITE_VS = `attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; uniform mat4 uMVP; varying vec2 vUV; varying vec4 vCol; void main(){ vUV = aUV; vCol = aCol; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const SPRITE_FS = `precision mediump float; varying vec2 vUV; varying vec4 vCol; uniform float uAdd;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main(){ float r2 = dot(vUV, vUV); if (r2 >= 1.0) discard; float k = 1.0 - r2; float a = k * k * (0.75 + 0.25 * hh(vCol.rg * 91.0 + vUV * 0.3)) * vCol.a;
  gl_FragColor = vec4(vCol.rgb, a); }`;

// ---- exhaust plume layers (additive)
const PLUME_VS = `attribute vec3 aPos; attribute vec3 aNrm; uniform mat4 uMVP; uniform mat4 uModel; varying vec3 vN; varying vec3 vW; varying vec3 vP;
void main(){ vP = aPos; vec4 w = uModel * vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNrm; gl_Position = uMVP * vec4(aPos,1.0); }`;
const PLUME_FS = `precision mediump float; varying vec3 vN; varying vec3 vW; varying vec3 vP;
uniform vec3 uEye; uniform vec3 uCol0; uniform vec3 uCol1; uniform float uInt; uniform float uRim; uniform float uFall; uniform float uTime; uniform float uDiam; uniform float uColK;
void main(){
  float t = clamp(-vP.x, 0.0, 1.0);
  float fac = abs(dot(normalize(vN), normalize(uEye - vW)));
  float core = pow(fac, uRim);
  float ax = pow(1.0 - t, uFall);
  float fl = 0.86 + 0.10 * sin(t * 36.0 - uTime * 27.0 + vP.y * 6.0) + 0.06 * sin(t * 83.0 - uTime * 44.0 + vP.z * 7.0);
  float dia = 1.0 + uDiam * pow(abs(sin(t * 28.0)), 5.0) * (1.0 - t);
  vec3 c = mix(uCol0, uCol1, clamp(t * uColK, 0.0, 1.0));
  float a = clamp(core * ax * uInt * fl * dia, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs, attribs) {
  const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

// ------------------------------------------------------------------------------------------------ renderer
export class Mesh {
  constructor(gl, geo) {
    this.gl = gl; this.count = geo.i.length;
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.v), gl.STATIC_DRAW);
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const big = geo.vertexCount > 65000;
    if (big && !gl.getExtension('OES_element_index_uint')) throw new Error('Mesh too large for this GPU');
    this.type = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(geo.i) : new Uint16Array(geo.i), gl.STATIC_DRAW);
    this.bounds = null;
  }
  dispose() { this.gl.deleteBuffer(this.vbo); this.gl.deleteBuffer(this.ibo); }
}

const Z3 = [0, 0, 0], Z4 = [0, 0, 0, 0];
const DEFAULT_ENV = { eye: [0, 0, 0], up: [0, 1, 0], sky: [0.55, 0.62, 0.78], ground: [0.30, 0.27, 0.24], sun: [1, 0.97, 0.92], glow: [0, 0, 0], glowDir: [0, 0, 1], px: 0.001, fill: [0, 1, 0], fillCol: Z3, pl: Z3, plCol: Z3, plR: 0 };

export class Renderer {
  constructor(canvas, { antialias = false, quality = 'medium' } = {}) {
    const attrs = { antialias, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'default' };
    const gl = canvas.getContext('webgl', attrs) ?? canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL is not available on this computer (or is disabled). The 3D views need it; all other features still work.');
    this.gl = gl; this.canvas = canvas; this.quality = quality; this.q = qualityOf(quality);
    gl.getExtension('OES_standard_derivatives'); gl.getExtension('OES_element_index_uint');
    this.lit = program(gl, LIT_VS, LIT_FS, ['aPos', 'aNrm', 'aCol']);
    this.flat = program(gl, FLAT_VS, FLAT_FS, ['aPos']);
    const opt = (name, vs, fs, at) => { try { this[name] = program(gl, vs, fs, at); } catch (e) { this[name] = null; (this.shaderErrors ??= []).push(`${name}: ${e.message}`); } };
    opt('planetProc', PLANET_PROC_VS, PLANET_PROC_FS, ['aPos']);
    opt('planet', PLANET_VS, PLANET_FS, ['aPos', 'aNrm', 'aCol']);
    opt('cloud', PLANET_VS, CLOUD_FS, ['aPos', 'aNrm', 'aCol']);
    const hi = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    this.highp = !!hi && hi.precision > 0;
    this.detail = this.highp && this.q.detail ? 1 : 0;       // procedural surface detail on vehicles (needs highp fragment shaders)
    if (this.highp) opt('atmo', ATMO_VS, ATMO_FS, ['aPos']); else this.atmo = null;
    opt('atmoSimple', ATMO_VS, ATMO_SIMPLE_FS, ['aPos']);
    opt('sun', SUN_VS, SUN_FS, ['aPos']);
    opt('flare', FLARE_VS, FLARE_FS, ['aPos']);
    opt('starP', STAR_VS, STAR_FS, ['aPos', 'aCol']);
    opt('dome', DOME_VS, DOME_FS, ['aPos']);
    opt('ground', GROUND_VS, GROUND_FS, ['aPos']);
    opt('sprite', SPRITE_VS, SPRITE_FS, ['aPos', 'aUV', 'aCol']);
    opt('plume', PLUME_VS, PLUME_FS, ['aPos', 'aNrm']);
    opt('bg', BG_VS, BG_FS, ['aPos']);
    opt('disc', DISC_VS, DISC_FS, ['aPos']);
    if (this.q.post) { opt('postBright', POST_VS, POST_BRIGHT_FS, ['aPos']); opt('postBlur', POST_VS, POST_BLUR_FS, ['aPos']); opt('postComp', POST_VS, POST_COMP_FS, ['aPos']); }
    this.postOn = true; this._pt = null;
    this.dyn = gl.createBuffer(); this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const [seg, rings] = this.q.seg;
    this.unitSphere = new Mesh(gl, sphereGeo(1, [1, 1, 1], 48, 32));
    this.planetMesh = new Mesh(gl, planetSphereGeo(seg, rings));
    this.shellMesh = new Mesh(gl, planetSphereGeo(Math.max(48, seg), Math.max(32, rings)));   // atmosphere shell: needs enough facets to hug the planet
    this.groundDisc = new Mesh(gl, discGeo(1, [1, 1, 1], 64));
    this.stars = null; this.starBuf = null; this.spriteData = new Float32Array(9 * 6 * 320);
    this.env = { ...DEFAULT_ENV };
    this.dpr = 1;
  }
  /** Lighting environment used by lit meshes: eye/up (world), ambient sky/ground colours, sun colour, re-entry glow. */
  setEnv(e) { this.env = { ...DEFAULT_ENV, ...e }; }
  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(c.clientWidth * dpr)), h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.gl.viewport(0, 0, w, h); this.dpr = dpr;
    return w / h;
  }
  begin(clear) {
    const gl = this.gl;
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clearDepth(1);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  clearDepth() { this.gl.clear(this.gl.DEPTH_BUFFER_BIT); }

  // ---- post-processing (visual only). The scene is drawn into an off-screen texture, then bloom + vignette + highlight shoulder are applied.
  _tex(w, h) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  _postFree() { const gl = this.gl, T = this._pt; if (!T) return; for (const k of ['scene', 'a', 'b']) { gl.deleteTexture(T[k]); gl.deleteFramebuffer(T[k + 'F']); } gl.deleteRenderbuffer(T.depth); this._pt = null; }
  /** Redirect drawing into the off-screen target. Returns false (and draws straight to the canvas) when post-processing is off or unsupported. */
  postBegin() {
    this._postActive = false;
    if (!this.q.post || !this.postOn || this.postBroken || !this.postBright || !this.postBlur || !this.postComp) return false;
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    try {
      if (!this._pt || this._pt.w !== w || this._pt.h !== h) {
        this._postFree();
        const k = this.q.post > 1 ? 2 : 4, bw = Math.max(2, Math.ceil(w / k)), bh = Math.max(2, Math.ceil(h / k));
        const T = { w, h, bw, bh, scene: this._tex(w, h), a: this._tex(bw, bh), b: this._tex(bw, bh), depth: gl.createRenderbuffer() };
        const fbo = (tex) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; };
        T.aF = fbo(T.a); T.bF = fbo(T.b);
        gl.bindRenderbuffer(gl.RENDERBUFFER, T.depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        T.sceneF = fbo(T.scene); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.depth);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); this._pt = T; this._postFree(); this.postBroken = true; return false; }
        this._pt = T;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._pt.sceneF); gl.viewport(0, 0, w, h); this._postActive = true; return true;
    } catch (e) { this.postBroken = true; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return false; }
  }
  /** Finish the frame: bloom + composite to the canvas. o: {bloom, vignette, blur, tint}. */
  postEnd(o = {}) {
    if (!this._postActive) return; this._postActive = false;
    const gl = this.gl, T = this._pt, w = T.w, h = T.h;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri); this._attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const pass = (P, fbo, vw, vh, tex, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, vw, vh); gl.useProgram(P.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uTex, 0); set?.(P); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    pass(this.postBright, T.aF, T.bw, T.bh, T.scene, (P) => { gl.uniform2f(P.u.uPx, 1 / w, 1 / h); gl.uniform1f(P.u.uThr, o.threshold ?? 0.72); });
    pass(this.postBlur, T.bF, T.bw, T.bh, T.a, (P) => gl.uniform2f(P.u.uDir, 1 / T.bw, 0));
    pass(this.postBlur, T.aF, T.bw, T.bh, T.b, (P) => gl.uniform2f(P.u.uDir, 0, 1 / T.bh));
    if (this.q.post > 1) { pass(this.postBlur, T.bF, T.bw, T.bh, T.a, (P) => gl.uniform2f(P.u.uDir, 2 / T.bw, 0)); pass(this.postBlur, T.aF, T.bw, T.bh, T.b, (P) => gl.uniform2f(P.u.uDir, 0, 2 / T.bh)); }
    const P = this.postComp; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.a); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene);
    gl.uniform1i(P.u.uScene, 0); gl.uniform1i(P.u.uBloom, 1); gl.uniform1f(P.u.uBloomK, o.bloom ?? 0.5); gl.uniform1f(P.u.uVig, o.vignette ?? 0.3); gl.uniform1f(P.u.uBlur, o.blur ?? 0); gl.uniform3fv(P.u.uTint, o.tint ?? Z3);
    gl.uniform1f(P.u.uFilm, o.film ?? (this.q.post > 1 ? 1 : this.q.post ? 0.7 : 0)); gl.uniform1f(P.u.uExpo, o.exposure ?? 1); gl.uniform1f(P.u.uTime, (performance.now() % 100000) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
  }
  _bindMesh(mesh, prog, stride9 = true) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    if (stride9) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24); }
    else { gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); }
  }
  _attribs(n) { const gl = this.gl; for (let i = 0; i < 4; i++) { if (i < n) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i); } }
  /** Fullscreen vertical gradient (design view background). */
  drawBackdrop(top, bottom, vignette = 1) {
    const P = this.bg; if (!P) return; const gl = this.gl;
    gl.useProgram(P.p); gl.uniform3fv(P.u.uTop, top); gl.uniform3fv(P.u.uBot, bottom); gl.uniform1f(P.u.uVig, vignette);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri); this._attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  }
  /** Soft disc on the XZ plane at height y (shadow / glow). */
  drawDisc(centre, radius, vp, { color = [0, 0, 0, 0.5], inner = 0.0, y = 0 } = {}) {
    const P = this.disc; if (!P) return; const gl = this.gl;
    const model = M4.mul(M4.translate(centre[0], y, centre[2]), M4.scale(radius, 1, radius));
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniform4fv(P.u.uColor, color); gl.uniform1f(P.u.uInner, inner);
    this._bindMesh(this.groundDisc, P, false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.groundDisc.count, this.groundDisc.type, 0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  /** Soft elongated shadow on a plane: base = start point, dir/perp = unit axes on the plane, up = its normal, len/wid in metres. */
  drawShadow(base, dir, up, perp, len, wid, vp, alpha = 0.4) {
    const P = this.disc; if (!P) return; const gl = this.gl;
    const m = M4.fromBasis(V3.mul(dir, len * 0.5), up, V3.mul(perp, wid * 0.5));
    m[12] = base[0] + dir[0] * len * 0.5; m[13] = base[1] + dir[1] * len * 0.5; m[14] = base[2] + dir[2] * len * 0.5;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, m)); gl.uniform4fv(P.u.uColor, [0, 0, 0, alpha]); gl.uniform1f(P.u.uInner, 0.0);
    this._bindMesh(this.groundDisc, P, false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.groundDisc.count, this.groundDisc.type, 0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  /** Lit mesh. model: 4x4; vp: view-projection. opts: tint, light (direction to the light in world), ambient, emissive, alpha, additive, doubleSided, glow */
  drawMesh(mesh, model, vp, o = {}) {
    const gl = this.gl, P = this.lit, e = this.env;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uLight, o.light ?? [0.4, 0.8, 0.5]); gl.uniform3fv(P.u.uTint, o.tint ?? [1, 1, 1]);
    gl.uniform1f(P.u.uMetal, o.metal ?? 0.15); gl.uniform1f(P.u.uAmbient, o.ambient ?? 0.3); gl.uniform1f(P.u.uEmissive, o.emissive ?? 0); gl.uniform1f(P.u.uAlpha, o.alpha ?? 1);
    gl.uniform3fv(P.u.uEye, e.eye); gl.uniform3fv(P.u.uUp, e.up); gl.uniform3fv(P.u.uSkyA, e.sky); gl.uniform3fv(P.u.uGndA, e.ground); gl.uniform3fv(P.u.uSunCol, e.sun);
    gl.uniform3fv(P.u.uGlow, o.glow ?? e.glow); gl.uniform3fv(P.u.uGlowDir, e.glowDir);
    gl.uniform1f(P.u.uMat, o.mat ?? 0); gl.uniform4fv(P.u.uDims, o.dims ?? Z4); gl.uniform4fv(P.u.uFx, o.fx ?? Z4); gl.uniform1f(P.u.uPx, e.px); gl.uniform1f(P.u.uDetail, this.detail);
    gl.uniform3fv(P.u.uFill, e.fill); gl.uniform3fv(P.u.uFillCol, e.fillCol); gl.uniform3fv(P.u.uPL, e.pl); gl.uniform3fv(P.u.uPLCol, e.plCol); gl.uniform1f(P.u.uPLr, e.plR); gl.uniform1f(P.u.uMirror, o.mirror ?? 0); gl.uniform1f(P.u.uHalf, o.half ?? 0);
    if (o.alpha != null && o.alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, o.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); } else { gl.disable(gl.BLEND); gl.depthMask(true); }
    if (o.doubleSided) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); if (o.flip) gl.cullFace(gl.FRONT); }
    this._bindMesh(mesh, P);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  }
  /** Polyline / points from Float32Array of xyz (world, already floating-origin relative). fade: radius at which the alpha reaches 0 (XZ distance from the origin of the data). */
  drawLines(pos, vp, { color = [1, 1, 1, 1], mode = 'strip', size = 1, depth = true, fade = 0 } = {}) {
    if (!pos.length) return;
    const gl = this.gl, P = this.flat;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, vp); gl.uniform4fv(P.u.uColor, color); gl.uniform1f(P.u.uSize, size); gl.uniform1f(P.u.uFade, fade);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.bufferData(gl.ARRAY_BUFFER, pos instanceof Float32Array ? pos : new Float32Array(pos), gl.DYNAMIC_DRAW);
    this._attribs(1); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (!depth) gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(mode === 'strip' ? gl.LINE_STRIP : mode === 'lines' ? gl.LINES : mode === 'loop' ? gl.LINE_LOOP : gl.POINTS, 0, pos.length / 3);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  /**
   * Planet sphere. model = translate(centre) * rotation * scale(radius). kind: 0 earth, 1 moon, 2 mars, 3 other.
   * tex = {A, B, size} from PlanetTextures.get(); without it the old pure-shader planet is drawn.
   */
  drawPlanet(model, vp, { kind = 0, light = [1, 0, 0], eye = [0, 0, 0], tex = null, sun = 1.25, fill = 0.05 } = {}) {
    const gl = this.gl;
    if (tex && this.planet) {
      const P = this.planet;
      gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
      gl.uniform3fv(P.u.uLight, light); gl.uniform3fv(P.u.uEye, eye); gl.uniform1i(P.u.uKind, kind); gl.uniform1f(P.u.uSun, sun); gl.uniform1f(P.u.uFill, fill);
      const W = tex.size || 256; gl.uniform2f(P.u.uTexel, 1 / W, 2 / W);
      const bump = !this.q.bump ? 0 : kind === 1 ? 1.0 : kind === 2 ? 0.7 : 0.35;
      gl.uniform1f(P.u.uBump, bump * W / 128);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.A); gl.uniform1i(P.u.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.B ?? tex.A); gl.uniform1i(P.u.uB, 1);
      this._bindMesh(this.planetMesh, P);
      gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.depthMask(true);
      gl.drawElements(gl.TRIANGLES, this.planetMesh.count, this.planetMesh.type, 0);
      gl.activeTexture(gl.TEXTURE0);
      return;
    }
    const P = this.planetProc; if (!P) return;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uLight, light); gl.uniform1i(P.u.uKind, kind);
    this._bindMesh(this.unitSphere, P);
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.depthMask(true);
    gl.drawElements(gl.TRIANGLES, this.unitSphere.count, this.unitSphere.type, 0);
  }
  /** Semi-transparent cloud shell (uses texture B green channel). */
  drawClouds(model, vp, { light, tex, alpha = 0.92, sun = 1.25 }) {
    const P = this.cloud; if (!P || !tex?.B) return; const gl = this.gl;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uLight, light); gl.uniform1f(P.u.uAlpha, alpha); gl.uniform1f(P.u.uSun, sun); const W = tex.size || 256; gl.uniform2f(P.u.uTexel, 1 / W, 1 / W);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.B); gl.uniform1i(P.u.uB, 0);
    this._bindMesh(this.planetMesh, P);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES, this.planetMesh.count, this.planetMesh.type, 0);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  /**
   * Atmosphere. centre/up/eye are in the same (vehicle-relative) world as the camera. a = ATMO entry (km units), R [km], alt0 [km].
   * The shell is drawn from the inside (back faces), no depth test; blending: out = inscatter + behind * transmittance.
   */
  drawAtmosphere(centre, vp, { a, R, alt0, eye, up, light, steps = 5, expo = 1 }) {
    const gl = this.gl; const Ra = (R + a.top) * 1000;
    const model = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.scale(Ra));
    const P = this.atmo; if (!P) return this.drawAtmosphereSimple(centre, vp, { eye, light, a, R });
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uEye, eye); gl.uniform3fv(P.u.uLight, light); gl.uniform3fv(P.u.uUp, up);
    gl.uniform1f(P.u.uR, R); gl.uniform1f(P.u.uTop, a.top); gl.uniform1f(P.u.uAlt0, alt0);
    gl.uniform3fv(P.u.uBetaR, a.betaR); gl.uniform3fv(P.u.uBetaM, a.betaM); gl.uniform1f(P.u.uHR, a.hr); gl.uniform1f(P.u.uHM, a.hm); gl.uniform1f(P.u.uG, a.g); gl.uniform1f(P.u.uSun, a.sun * a.expo * expo);
    gl.uniform1i(P.u.uSteps, steps);
    this._bindMesh(this.shellMesh, P, false);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.SRC_ALPHA); gl.depthMask(false); gl.cullFace(gl.FRONT); gl.enable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, this.shellMesh.count, this.shellMesh.type, 0);
    gl.cullFace(gl.BACK); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
  }
  drawAtmosphereSimple(centre, vp, { eye, light, a, R }) {
    const P = this.atmoSimple; if (!P) return; const gl = this.gl; const Ra = (R + a.top * 1.6) * 1000;
    const model = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.scale(Ra));
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uEye, eye); gl.uniform3fv(P.u.uCentre, centre); gl.uniform3fv(P.u.uLight, light); gl.uniform3fv(P.u.uColor, a.haze); gl.uniform1f(P.u.uStrength, 1.4);
    this._bindMesh(this.shellMesh, P, false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.cullFace(gl.FRONT);
    gl.drawElements(gl.TRIANGLES, this.shellMesh.count, this.shellMesh.type, 0);
    gl.cullFace(gl.BACK); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  /** Sun disc + bloom billboard. dir = direction to the sun (world). vpRot = projection * rotation-only view. */
  drawSun(dir, vpRot, { proj, color = [1, 0.95, 0.85], glow = 1, core = 0.0093 } = {}) {
    const P = this.sun; if (!P) return; const gl = this.gl;
    const x = vpRot[0] * dir[0] + vpRot[4] * dir[1] + vpRot[8] * dir[2], y = vpRot[1] * dir[0] + vpRot[5] * dir[1] + vpRot[9] * dir[2], w = vpRot[3] * dir[0] + vpRot[7] * dir[1] + vpRot[11] * dir[2];
    if (w <= 1e-4) return;
    const aspect = this.canvas.width / this.canvas.height; const halfH = Math.min(2.5, 0.42 * proj[5]);   // quad half-height in NDC: about 0.42 rad of glow
    gl.useProgram(P.p); gl.uniform2f(P.u.uCenter, x / w, y / w); gl.uniform2f(P.u.uHalf, halfH / aspect, halfH);
    gl.uniform3fv(P.u.uCol, color); gl.uniform1f(P.u.uScale, 1 / proj[5]); gl.uniform1f(P.u.uHalfH, halfH); gl.uniform1f(P.u.uCore, core); gl.uniform1f(P.u.uGlow, glow);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); this._attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.depthMask(true);
  }
  /** Lens flare for a visible sun: ghost discs and a streak. strength 0..1. Drawn without depth test after the scene (before post-processing). */
  drawFlare(dir, vpRot, { strength = 1, color = [1, 0.95, 0.85] } = {}) {
    const P = this.flare; if (!P || strength <= 0.01) return; const gl = this.gl;
    const w = vpRot[3] * dir[0] + vpRot[7] * dir[1] + vpRot[11] * dir[2]; if (w <= 1e-4) return;
    const sx = (vpRot[0] * dir[0] + vpRot[4] * dir[1] + vpRot[8] * dir[2]) / w, sy = (vpRot[1] * dir[0] + vpRot[5] * dir[1] + vpRot[9] * dir[2]) / w;
    const edge = Math.max(Math.abs(sx), Math.abs(sy) * 1.2); const vis = 1 - Math.min(1, Math.max(0, (edge - 0.85) / 0.6)); if (vis <= 0.01) return;
    const aspect = this.canvas.width / this.canvas.height;
    const ghosts = [[-0.45, 0.09, 0, [0.5, 0.75, 1.0], 0.10], [-0.8, 0.15, 0, [0.6, 1.0, 0.7], 0.07], [0.5, 0.06, 0, [1.0, 0.6, 0.3], 0.10], [1.35, 0.20, 0, [0.5, 0.6, 1.0], 0.06], [-1.4, 0.07, 0, [1.0, 0.8, 0.5], 0.07], [0.0, 0.5, 2, [0.6, 0.75, 1.0], 0.0]];
    gl.useProgram(P.p); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); this._attribs(1); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    const fade = vis * strength * Math.max(0.0, 1 - Math.hypot(sx, sy) * 0.35);
    for (const [t, size, kind, c, a] of ghosts) {
      const streak = kind === 2;
      gl.uniform2f(P.u.uCenter, sx * t, sy * t); gl.uniform2f(P.u.uHalf, (streak ? 0.9 : size) / (streak ? 1 : aspect), streak ? 0.06 : size);
      if (streak) gl.uniform2f(P.u.uCenter, sx, sy);
      gl.uniform3f(P.u.uCol, c[0] * color[0], c[1] * color[1], c[2] * color[2]); gl.uniform1f(P.u.uA, streak ? 0.30 * fade : a * 2.2 * fade); gl.uniform1f(P.u.uKind, kind);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
  }
  /** Ground patch. model places a unit disc (XZ plane, +Y up) with radius scaling. */
  drawGround(model, vp, o) {
    if (!this.ground) return;
    const { radius, offset = [0, 0], base = [0.3, 0.4, 0.25], base2 = base, alpha = 1, fog = [0.6, 0.7, 0.9], fogK = 1e-4, sunCol = [1, 1, 1], ambCol = [0.2, 0.2, 0.25], water = 0, pad = null, padS = 1, kind = 0, time = 0, edge = 0.5, shadows = null, camH = 1e5, sunV = [0, 0, 1] } = o;
    const gl = this.gl, P = this.ground;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model));
    gl.uniform2fv(P.u.uOffset, offset); gl.uniform1f(P.u.uRadius, radius); gl.uniform3fv(P.u.uBase, base); gl.uniform3fv(P.u.uBase2, base2); gl.uniform1f(P.u.uAlpha, alpha);
    gl.uniform3fv(P.u.uFog, fog); gl.uniform1f(P.u.uFogK, fogK); gl.uniform3fv(P.u.uSunCol, sunCol); gl.uniform3fv(P.u.uAmbCol, ambCol); gl.uniform1f(P.u.uWater, water);
    gl.uniform2fv(P.u.uPad, pad ?? [0, 0]); gl.uniform1f(P.u.uPadOn, pad ? 1 : 0); gl.uniform1f(P.u.uPadS, padS); gl.uniform1f(P.u.uKind, kind); gl.uniform1f(P.u.uTime, time); gl.uniform1f(P.u.uEdge, edge);
    gl.uniform1f(P.u.uCamH, camH); gl.uniform3fv(P.u.uSunV, sunV);
    const sa = shadows?.[0], sb = shadows?.[1];
    gl.uniform4fv(P.u.uShA, sa ? sa.seg : Z4); gl.uniform3fv(P.u.uShAp, sa ? [sa.w, sa.soft, sa.k] : Z3); gl.uniform4fv(P.u.uShB, sb ? sb.seg : Z4); gl.uniform3fv(P.u.uShBp, sb ? [sb.w, sb.soft, sb.k] : Z3);
    this._bindMesh(this.groundDisc, P, false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(true);
    gl.drawElements(gl.TRIANGLES, this.groundDisc.count, this.groundDisc.type, 0);
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  /** Star field (points with magnitude-dependent size and colour). Draw with a rotation-only view matrix. */
  drawStars(vpRot, brightness = 1, starData = null) {
    const gl = this.gl, P = this.starP; if (!P || brightness <= 0.003) return;
    if (!this.starBuf) {
      this.starBuf = gl.createBuffer(); this.starData = starData; gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf); gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW); this.starCount = starData.length / 7;
    }
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, vpRot); gl.uniform1f(P.u.uScale, this.dpr * 0.9 + 0.3); gl.uniform1f(P.u.uBright, brightness);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf); this._attribs(2); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, this.starCount);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  }
  /** Milky way dome. */
  drawSkyDome(vpRot, texture, brightness) {
    const P = this.dome; if (!P || !texture || brightness <= 0.003) return; const gl = this.gl;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, vpRot); gl.uniform1f(P.u.uBright, brightness);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(P.u.uA, 0);
    this._bindMesh(this.unitSphere, P, false);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawElements(gl.TRIANGLES, this.unitSphere.count, this.unitSphere.type, 0);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  }
  /**
   * Camera-facing soft quads. list: [{p:[x,y,z], s: radius, c:[r,g,b,a]}]; right/up: camera axes in world. add: additive blending.
   */
  drawSprites(list, vp, right, up, { add = false, depth = true } = {}) {
    const P = this.sprite; if (!P || !list.length) return; const gl = this.gl;
    const n = Math.min(list.length, 320); const d = this.spriteData; let k = 0;
    const cr = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < n; i++) {
      const it = list[i], p = it.p, s = it.s, c = it.c;
      for (const [u, v] of cr) {
        d[k++] = p[0] + (right[0] * u + up[0] * v) * s; d[k++] = p[1] + (right[1] * u + up[1] * v) * s; d[k++] = p[2] + (right[2] * u + up[2] * v) * s;
        d[k++] = u; d[k++] = v; d[k++] = c[0]; d[k++] = c[1]; d[k++] = c[2]; d[k++] = c[3];
      }
    }
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, vp); gl.uniform1f(P.u.uAdd, add ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn); gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, k), gl.DYNAMIC_DRAW);
    this._attribs(3); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); if (add) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); if (!depth) gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, n * 6);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  /** One additive exhaust plume layer. mesh = plumeGeo(). o: col0 (near nozzle), col1 (far), intensity, rim, fall, time, diamonds, colK. */
  drawPlume(mesh, model, vp, o) {
    const P = this.plume; if (!P) return; const gl = this.gl;
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uMVP, false, M4.mul(vp, model)); gl.uniformMatrix4fv(P.u.uModel, false, model);
    gl.uniform3fv(P.u.uEye, this.env.eye); gl.uniform3fv(P.u.uCol0, o.col0); gl.uniform3fv(P.u.uCol1, o.col1);
    gl.uniform1f(P.u.uInt, o.intensity); gl.uniform1f(P.u.uRim, o.rim ?? 1.5); gl.uniform1f(P.u.uFall, o.fall ?? 1.2); gl.uniform1f(P.u.uTime, o.time ?? 0); gl.uniform1f(P.u.uDiam, o.diamonds ?? 0); gl.uniform1f(P.u.uColK, o.colK ?? 1.5);
    this._bindMesh(mesh, P);
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, o.alphaBlend ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  }
  readPixels() { return this.canvas.toDataURL('image/png'); }
}
