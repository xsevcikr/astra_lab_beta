// The 3D Earth behind the first page (2.3). Visual only, and used by the Home screen ONLY: a slowly turning Earth with its blue atmosphere
// glow, stars and the Sun, drawn with the same renderer and NASA textures as the flight views. If WebGL is missing the Home page shows the
// painted CSS Earth instead. localStorage 'astra.sky' = '0' (the same switch as the starfield) turns the motion off; reduced-motion users get a still Earth.
import { Renderer, M4, V3 } from './gl.js';
import { PlanetTextures, makeStars, qualityOf } from './planets.js';
import { atmoOf } from './sky.js';

const R = 6371e3;
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** @returns {{stop: Function, ok: boolean}} */
export function installHomeEarth(canvas, { quality = 'medium' } = {}) {
  let r, tex, raf = 0, stopped = false;
  try { r = new Renderer(canvas, { antialias: true, quality }); tex = new PlanetTextures(r.gl, quality); } catch (e) { return { ok: false, stop() {} }; }
  const q = qualityOf(quality);
  let still = false, calm = false;
  try { calm = localStorage.getItem('astra.sky') === '0'; } catch { /* storage blocked */ }
  still = calm || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const stars = makeStars(q.stars);
  const axis = norm3([-0.28, 1, 0.12]);
  const e0 = norm3(cross3(axis, [0, 0, 1])), e1 = cross3(axis, e0);
  const sunDir = norm3(globalThis.__homeSun ?? [0.6, 0.4, 0.5]);
  let t0 = performance.now(), last = 0, spin = 4.2, drift = 0;      // start with the Atlantic and Europe turning into the light
  function draw(now) {
    if (stopped) return;
    raf = requestAnimationFrame(draw);
    if (document.hidden) { t0 = now; return; }
    if (now - last < 33) return; last = now;
    const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
    if (!still) { spin += dt * 0.035; drift += dt * 0.006; }   // 2.5: the cloud deck slides slowly over the ground (about one degree every 3 s)                       // one turn in about three minutes: calm, but you can see it move
    const aspect = r.resize();
    const eye = [0, 0, 0];
    const view = M4.lookAt(eye, [0, -0.2, -1], [0, 1, 0]);
    const fov = 0.9;
    const centre = [R * 0.06, -(R + 1.15e6), -R * 1.1];     // a huge globe rising from the bottom of the window, limb across the lower third
    const proj = M4.perspective(fov, aspect, 4e5, 4e7), vp = M4.mul(proj, view);
    const rot = new Float32Array(view); rot[12] = rot[13] = rot[14] = 0;
    const projS = M4.perspective(fov, aspect, 1, 1e7), vpS = M4.mul(projS, rot);
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const ex = [cs * e0[0] + sn * e1[0], cs * e0[1] + sn * e1[1], cs * e0[2] + sn * e1[2]];
    const ey = [-sn * e0[0] + cs * e1[0], -sn * e0[1] + cs * e1[1], -sn * e0[2] + cs * e1[2]];
    const model = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.mul(M4.fromBasis(ex, ey, axis), M4.scale(R)));
    try {
      r.begin([0.004, 0.008, 0.02]);
      r.drawStars(vpS, 1, stars);
      const sky = tex.sky?.(); if (sky) r.drawSkyDome(vpS, sky, 0.7);
      const earth = tex.get('earth');
      r.drawPlanet(model, vp, { kind: 0, light: sunDir, eye, tex: earth, fill: 0.1, sun: 1.0 });
      if (earth?.B && q.clouds && earth.final) {
        const cm = M4.mul(M4.translate(centre[0], centre[1], centre[2]), M4.mul(M4.fromBasis(ex, ey, axis), M4.mul(M4.rotZ(drift), M4.scale(R * 1.004))));
        r.drawClouds(cm, vp, { light: sunDir, tex: earth, alpha: 0.8, sun: 1.0 });
      }
      const up = norm3([eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]);
      r.drawAtmosphere(centre, vp, { a: atmoOf('earth'), R: R / 1000, alt0: Math.hypot(centre[0], centre[1], centre[2]) / 1000 - R / 1000, eye, up, light: sunDir, steps: q.atmoSteps, expo: 0.55 });
      r.drawSun(sunDir, vpS, { proj: projS, color: [1, 0.95, 0.85], glow: 1 });
    } catch (e) { stopped = true; cancelAnimationFrame(raf); canvas.dispatchEvent(new Event('homeearth-failed')); }
  }
  raf = requestAnimationFrame(draw);
  return {
    ok: true,
    stop() { stopped = true; cancelAnimationFrame(raf); try { r.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ } },
  };
}
