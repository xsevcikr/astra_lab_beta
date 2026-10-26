// Layout test: every screen, in all three detail modes, with and without a flown demo rocket, at 800x700 (narrow), 1024x768, 1280x720, 1366x768 and 1920x1080.
// Asserts: no horizontal page overflow, the sidebar can be scrolled to its last item, nothing is clipped (cut off by an ancestor that cannot scroll),
// and nothing is outside the window. (needs Playwright + Chromium; not part of `npm test`)
//   node tests/ui-layout.mjs            env: LAYOUT_SHOTS=dir (save screenshots), LAYOUT_ONLY=designer,telemetry  LAYOUT_VIEWPORTS=1366x768
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

const VIEWPORTS = (process.env.LAYOUT_VIEWPORTS ?? '800x700,1024x768,1280x720,1366x768,1920x1080').split(',').map((s) => s.split('x').map(Number));
const ALL = ['home', 'academy', 'ai', 'designer', 'simulation', 'challenges', 'telemetry', 'control', 'replay', 'analysis', 'experiments', 'planner', 'projects', 'settings', 'validation', 'requirements', 'failure', 'trade', 'history', 'teacher'];
const SCREENS = process.env.LAYOUT_ONLY ? process.env.LAYOUT_ONLY.split(',') : ALL;
const MODES = ['beginner', 'standard', 'advanced'];
const shots = process.env.LAYOUT_SHOTS;

// Runs inside the page. Returns a list of strings describing every problem found.
function inspect() {
  const out = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) out.push(`page scrolls horizontally (${de.scrollWidth} > ${vw})`);
  const app = document.getElementById('app');
  const ar = app.getBoundingClientRect();
  if (ar.right > vw + 2 || ar.bottom > vh + 2) out.push(`app is bigger than the window (${Math.round(ar.right)}x${Math.round(ar.bottom)} vs ${vw}x${vh})`);
  const nav = document.getElementById('nav');
  const navOv = getComputedStyle(nav).overflowY;
  if (nav.scrollHeight > nav.clientHeight + 1 && !['auto', 'scroll'].includes(navOv)) out.push('sidebar is cut off and cannot scroll');
  const last = nav.querySelector('.nav-item:last-of-type, .nav-item:last-child');
  if (nav.scrollHeight > nav.clientHeight + 1) { nav.scrollTop = nav.scrollHeight; const r = last?.getBoundingClientRect(); const nr = nav.getBoundingClientRect(); if (r && r.bottom > nr.bottom + 2) out.push('sidebar: last item unreachable'); nav.scrollTop = 0; }
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const scr = document.getElementById('screen');
  // 1. clipped content: an element whose box leaves an ancestor that clips (hidden) on that axis
  const seen = new Set();
  const els = [...app.querySelectorAll('*')].filter((e) => !/^(SCRIPT|STYLE|OPTION|CANVAS|SVG|PATH|G|LINE|CIRCLE|RECT|TEXT|TSPAN|POLYLINE|POLYGON|DEFS|LINEARGRADIENT|STOP|TITLE)$/i.test(e.tagName) && !e.closest('svg, canvas, .modal-back, #toasts, .toast, [hidden]'));
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const meaningful = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'IMG', 'TABLE'].includes(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!meaningful) continue;
    if (cs.textOverflow === 'ellipsis') continue;
    let a = e.parentElement, hid = false;
    let L = r.left, R = r.right, T = r.top, B = r.bottom;      // the part of the element that has to stay visible, narrowed by each scroller we pass
    while (a && a !== document.body) {
      const ac = getComputedStyle(a);
      if (ac.display === 'none') { hid = true; break; }
      const ar2 = a.getBoundingClientRect();
      const clipX = ['hidden', 'clip'].includes(ac.overflowX), clipY = ['hidden', 'clip'].includes(ac.overflowY);
      const scrX = ['auto', 'scroll'].includes(ac.overflowX), scrY = ['auto', 'scroll'].includes(ac.overflowY);
      const t = 3;
      const hx = R > ar2.right + t || L < ar2.left - t, vy = B > ar2.bottom + t || T < ar2.top - t;
      if ((clipX && hx) || (clipY && vy)) {
        const key = name(a) + '>' + name(e); if (!seen.has(key)) { seen.add(key); out.push(`clipped: ${name(e)} "${(e.textContent || e.value || '').trim().slice(0, 24)}" leaves ${name(a)} (${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}-${Math.round(r.bottom)} vs ${Math.round(ar2.left)}-${Math.round(ar2.right)}x${Math.round(ar2.top)}-${Math.round(ar2.bottom)})`); }
        break;
      }
      if (scrX) { L = Math.max(ar2.left, Math.min(L, ar2.right)); R = Math.max(L, Math.min(R, ar2.right)); }
      if (scrY) { T = Math.max(ar2.top, Math.min(T, ar2.bottom)); B = Math.max(T, Math.min(B, ar2.bottom)); }
      a = a.parentElement;
    }
    if (hid) continue;
    // 2. outside the window and not reachable by any scroller
    if (r.right > vw + 3 || r.bottom > vh + 3 || r.left < -3) {
      let s = e.parentElement, scroll = false;
      while (s && s !== document.body) { const sc2 = getComputedStyle(s); if (['auto', 'scroll'].includes(sc2.overflowX) || ['auto', 'scroll'].includes(sc2.overflowY)) { const sr = s.getBoundingClientRect(); if (r.right <= sr.right + 3 || ['auto', 'scroll'].includes(sc2.overflowX)) { scroll = true; break; } } s = s.parentElement; }
      if (!scroll) { const key = 'off>' + name(e); if (!seen.has(key)) { seen.add(key); out.push(`outside the window: ${name(e)} "${(e.textContent || '').trim().slice(0, 24)}"`); } }
    }
  }
  // 3. main containers must not hide horizontal overflow
  for (const e of [scr, ...scr.querySelectorAll('.page, .split, .side, .panel, .panel-body, .main, .center, .col, .grid')]) {
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && ['hidden', 'clip'].includes(cs.overflowX) && e.clientWidth > 0 && cs.textOverflow !== 'ellipsis') { const key = 'sw>' + name(e); if (!seen.has(key)) { seen.add(key); out.push(`container clips width: ${name(e)} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`); } }
  }
  for (const e of [scr, ...scr.querySelectorAll('.page, .side, .simple-body, .center-col')]) {
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && ['auto', 'scroll'].includes(cs.overflowX) && e.clientWidth > 0) { const key = 'hs>' + name(e); if (!seen.has(key)) { seen.add(key); out.push(`main container scrolls sideways: ${name(e)} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`); } }
  }
  return out;
}

const server = await startServer(8175);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; let where = 'start';
page.on('pageerror', (e) => errors.push(`${e.message} (at ${where})`));
page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|swiftshader/i.test(m.text())) errors.push(`${m.text().slice(0, 140)} (at ${where})`); });
let total = 0, bad = 0; const problems = [];
const sweep = async (label) => {
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const mode of MODES) {
      await page.evaluate((m) => window.astraApp.setSetting('mode', m), mode);
      for (const s of SCREENS) {
        where = `${label} ${w}x${h} ${mode} ${s}`;
        await page.evaluate((id) => { document.querySelectorAll('.modal-back').forEach((m) => m.remove()); window.astraApp.navigate(id); }, s);
        await page.waitForTimeout(s === 'academy' || s === 'designer' ? 450 : 250);
        const found = await page.evaluate(inspect); total++;
        if (shots) await page.screenshot({ path: `${shots}/${label}-${w}x${h}-${mode}-${s}.png` });
        if (found.length) { bad++; problems.push([where, found]); console.log(`FAIL  ${where}`); for (const f of found.slice(0, 8)) console.log(`        ${f}`); }
      }
    }
  }
};
try {
  await page.goto('http://127.0.0.1:8175/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await sweep('empty');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); await a.ask('Test it.'); });
  await page.waitForFunction(() => window.astraApp.project.runs.length > 0, null, { timeout: 120000 });
  await sweep('flown');
} catch (e) { console.log('SCRIPT ERROR', e.stack); bad++; }
console.log(`\n${total - bad} of ${total} screen layouts clean; page errors: ${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ', e);
await browser.close(); server.close();
process.exit(bad || errors.length ? 1 : 0);
