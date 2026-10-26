// Night-sky backdrop (2.2): a slowly drifting starfield with a soft nebula, drawn on a canvas behind the whole app.
// Visual only. localStorage 'astra.sky' = '0' turns it off; it also stays off for reduced-motion users and pauses when the window is hidden.
const COLORS = ['255,255,255', '255,255,255', '255,255,255', '120,225,240', '120,225,240', '255,170,120'];
export function installSky(root = document.body) {
  let off = false; try { off = localStorage.getItem('astra.sky') === '0'; } catch { /* storage blocked */ }
  if (off || typeof document === 'undefined') return () => {};
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas'); cv.id = 'sky'; cv.setAttribute('aria-hidden', 'true'); root.prepend(cv);
  const ctx = cv.getContext('2d'); if (!ctx) { cv.remove(); return () => {}; }
  let W = 0, H = 0, stars = [], raf = 0, last = 0, neb = null;
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = 12345; const n = Math.round(Math.min(320, (W * H) / 5200));
    stars = Array.from({ length: n }, () => ({ x: rnd() * W, y: rnd() * H, r: 0.4 + rnd() ** 3 * 1.8, c: COLORS[Math.floor(rnd() * COLORS.length)], a: 0.25 + rnd() * 0.65, ph: rnd() * 6.28, sp: 0.4 + rnd() * 1.4, vx: 0.4 + rnd() * 1.6 }));
    // the nebula is painted once and reused every frame
    neb = document.createElement('canvas'); neb.width = Math.round(W / 2); neb.height = Math.round(H / 2); const g = neb.getContext('2d');
    const blob = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, neb.width, neb.height); };
    const w = neb.width, h = neb.height;
    blob(w * 0.52, h * 0.5, h * 0.75, '70,120,180', 0.22); blob(w * 0.4, h * 0.62, h * 0.5, '60,170,170', 0.14); blob(w * 0.66, h * 0.4, h * 0.42, '120,90,170', 0.12);
    for (let i = 0; i < 260; i++) { const a = rnd() * 6.28, d = (rnd() ** 0.7) * h * 0.55; g.fillStyle = `rgba(190,230,255,${0.04 + rnd() * 0.09})`; g.fillRect(w * 0.5 + Math.cos(a) * d * 1.3, h * 0.52 + Math.sin(a) * d, 1.2, 1.2); }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || now - last < 66) return;     // about 15 frames a second is enough for a slow drift
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(neb, 0, 0, W, H);
    const t = now / 1000;
    for (const s of stars) {
      if (!reduce) { s.x += s.vx * dt; if (s.x > W + 3) s.x = -3; }
      const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(t * s.sp + s.ph);
      ctx.fillStyle = `rgba(${s.c},${(s.a * tw).toFixed(3)})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      if (s.r > 1.5) { ctx.fillStyle = `rgba(${s.c},${(s.a * tw * 0.12).toFixed(3)})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3.2, 0, 6.2832); ctx.fill(); }
    }
  }
  build(); let rt = 0; const onResize = () => { clearTimeout(rt); rt = setTimeout(build, 150); };
  window.addEventListener('resize', onResize); raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); cv.remove(); };
}
