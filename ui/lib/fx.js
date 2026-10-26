// Motion and polish (2.6): parallax stars behind the menus, count-up numbers, the T-minus launch intro and the look (Space / Daylight / High contrast).
// All of it follows app settings `fx` (animations, default on) and `look`; nothing here changes any result.
import { h } from './dom.js';
import { playSound, setRumble, stopRumble } from './sound.js';

export const LOOKS = [['space', 'Deep space (dark)'], ['daylight', 'Daylight (light)'], ['contrast', 'High contrast']];

/** Apply look and animation switches to <body>. Safe to call again whenever the settings change. */
export function applyLookFx(app) {
  const b = document.body; if (!b) return;
  b.dataset.look = LOOKS.some((l) => l[0] === app.settings.look) ? app.settings.look : 'space';
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  b.dataset.fx = app.settings.fx === false || reduce ? 'off' : 'on';
}

function installStars() {
  if (document.getElementById('starfield')) return () => {};
  const sf = h('div', { id: 'starfield', 'aria-hidden': 'true' }, h('i', { class: 's1' }), h('i', { class: 's2' }), h('i', { class: 's3' }));
  document.body.prepend(sf);
  const layers = [...sf.children], depth = [6, 14, 26];
  const move = (e) => { const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5; layers.forEach((l, i) => { l.style.transform = `translate(${(-x * depth[i]).toFixed(1)}px, ${(-y * depth[i]).toFixed(1)}px)`; }); };
  window.addEventListener('pointermove', move, { passive: true });
  return () => { window.removeEventListener('pointermove', move); sf.remove(); };
}

/** Smoothly count a number element from its old value to a new one (used for the big stat numbers). Respects the animation switch. */
export function countUp(el, to, { digits = 0, ms = 700, suffix = '' } = {}) {
  const fx = document.body?.dataset.fx !== 'off';
  const from = Number(el.dataset.v ?? 0); el.dataset.v = String(to);
  if (!fx || !Number.isFinite(to) || from === to) { el.textContent = to.toFixed(digits) + suffix; return; }
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3; el.textContent = (from + (to - from) * e).toFixed(digits) + suffix; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
/** Count every `[data-countup]` element inside root. */
export function runCounters(root) {
  for (const el of root.querySelectorAll?.('[data-countup]') ?? []) { const v = parseFloat(el.dataset.countup); if (Number.isFinite(v)) countUp(el, v, { digits: +(el.dataset.digits ?? 0), suffix: el.dataset.suffix ?? '' }); }
}

/** T-minus 3-2-1-LIFTOFF over the 3D view. Resolves when finished. Skipped (resolves at once) when animations are off or an automated browser runs. */
export function launchIntro(host, { seconds = 3 } = {}) {
  const skip = document.body.dataset.fx === 'off' || (navigator.webdriver && !globalThis.__forceIntro);
  if (skip) return Promise.resolve(false);
  return new Promise((done) => {
    const num = h('b', null, String(seconds)), lab = h('span', null, 'T-minus'), box = h('div', { class: 'launch-intro', id: 'launch-intro' }, lab, num);
    host.append(box); let n = seconds; playSound('tick');
    const iv = setInterval(() => {
      n -= 1;
      if (n > 0) { num.textContent = String(n); num.style.animation = 'none'; void num.offsetWidth; num.style.animation = ''; playSound('tick'); return; }
      clearInterval(iv); box.classList.add('go'); lab.textContent = 'Main engine start'; num.textContent = 'LIFTOFF'; num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
      playSound('go'); setTimeout(() => { box.remove(); }, 1300); done(true);
    }, 900);
  });
}

/** Keep the engine rumble tied to the throttle of a live flight. Call every UI tick with the frame; stopRumbleNow() on leaving. */
export function rumbleFollow(frame, running) {
  if (!running || !frame) { stopRumble(); return; }
  const thr = (frame.throttle ?? 0) * Math.min(1, (frame.thrust ?? 0) > 0 ? 1 : 0), air = Math.exp(-(frame.alt ?? 0) / 25000);
  setRumble(thr * (0.35 + 0.65 * air));
}
export const stopRumbleNow = stopRumble;

/** Install once from main.js. */
export function installFx(app) {
  applyLookFx(app);
  const offStars = installStars();
  app.on('settings', (k) => { if (k === 'look' || k === 'fx') applyLookFx(app); });
  return offStars;
}
