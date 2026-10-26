// Browser test of the "what is missing?" panel and the launch gate (needs Playwright + Chromium; not part of `npm test`).
//   node tests/ui-needs.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8171);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`));
const ev = (f, a) => page.evaluate(f, a);
const shots = process.env.NEEDS_SHOTS;
const snap = async (n) => { if (shots) await page.screenshot({ path: `${shots}/${n}.png` }); };
let good;
const reset = async (mutate) => {
  await ev((g) => { const v = window.astraApp.project.vehicle; for (const k of Object.keys(v)) delete v[k]; Object.assign(v, JSON.parse(g)); }, good);
  await ev(`(${mutate.toString()})(window.astraApp.project.vehicle)`);
  await ev(() => window.astraApp.commit('Test: break the design', { silent: true }));
  await ev(() => { document.querySelectorAll('.modal-back').forEach((m) => m.remove()); window.astraApp.navigate('home'); }); await ev(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(500);
};
const runs = () => ev(() => window.astraApp.project.runs.length);
try {
  await page.goto('http://127.0.0.1:8171/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await ev(async () => { const A = window.astraApp; await A.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await A.ask('yes, apply it'); });
  good = await ev(() => JSON.stringify(window.astraApp.project.vehicle));
  await ev(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(500);
  check('a complete rocket shows no missing-panel', (await page.locator('#sim-needs').count()) === 0);

  // ---- no engine
  await reset((v) => { v.components = v.components.filter((c) => !(c.kind === 'engine' && c.group === 'stage1')); });
  check('no engine: panel lists "Stage 1 has no engine" with a place', /Stage 1 has no engine/.test(await page.locator('#sim-needs').innerText()) && /Rocket Builder > Stage 1 > Engine/.test(await page.locator('#sim-needs').innerText()));
  await snap('no-engine');
  await page.click('#run-fast'); await page.waitForTimeout(400);
  check('Launch with a blocker does not run; no run is recorded', (await runs()) === 0 && (await page.locator('.progress').count()) === 0);
  await page.click('.need-item[data-need^="stage-no-engine"] .need-show'); await page.waitForTimeout(1000);
  check('"Show me where" opens the Rocket Builder with a note about Stage 1', (await ev(() => window.astraApp.screenId)) === 'designer' && /Stage 1 needs an engine/.test(await page.locator('.ed-note-t').innerText()));
  await ev(() => { document.querySelectorAll('.modal-back').forEach((m) => m.remove()); window.astraApp.navigate('simulation'); }); await page.waitForTimeout(500); // the part picker opened by the deep link is a dialog; close it
  await page.click('.need-item[data-need^="stage-no-engine"] .need-fix'); await page.waitForTimeout(1200);
  check('"Fix it" adds an engine and the red item disappears', (await page.locator('.need-item[data-need^="stage-no-engine"]').count()) === 0 && (await ev(() => window.astraApp.project.vehicle.components.some((c) => c.kind === 'engine' && c.group === 'stage1'))));
  await page.click('#run-fast'); await page.waitForFunction(() => !document.querySelector('.progress'), null, { timeout: 180000 }); await page.waitForTimeout(400);
  check('the fixed rocket runs', (await runs()) === 1);
  await ev(() => window.astraApp.project.undo());
  check('the fix is one undo step (engine gone again)', !(await ev(() => window.astraApp.project.vehicle.components.some((c) => c.kind === 'engine' && c.group === 'stage1'))));

  // ---- no fuel (both stages)
  await reset((v) => { v.components = v.components.filter((c) => !/tank/.test(c.kind) || c.group === 'payload'); });
  const txt = await page.locator('#sim-needs').innerText();
  check('no fuel: both stages are reported', /Stage 1 has no fuel tank/.test(txt) && /Stage 2 has no fuel tank/.test(txt));
  await snap('no-fuel');
  await page.click('#need-fix-all'); await page.waitForTimeout(2000);
  check('"Fix everything for me" clears every red item', (await page.locator('#sim-needs').count()) === 0);

  // ---- too heavy
  await reset((v) => { v.components.push({ id: 'ballast', kind: 'payload', name: 'Ballast', mount: 'stack', group: 'payload', mass: 25000, length: 1, diameter: 1, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 }); });
  check('too heavy: reported in plain words', /too heavy to lift/.test(await page.locator('#sim-needs').innerText()));
  await snap('too-heavy');
  await page.click('.need-item[data-need="low-twr"] .need-fix'); await page.waitForTimeout(1500);
  check('too heavy: fix adds thrust and the item disappears', (await page.locator('.need-item[data-need="low-twr"]').count()) === 0);

  // ---- no payload is only a tip: launch stays possible
  await reset((v) => { v.components = v.components.filter((c) => c.group !== 'payload'); });
  check('no payload is a tip, not a blocker (no panel, button enabled)', (await page.locator('#sim-needs').count()) === 0 && !(await page.locator('#run-fast').isDisabled()));

  // ---- Mission Control gate
  await reset((v) => { v.components = v.components.filter((c) => !(c.kind === 'engine' && c.group === 'stage1')); });
  await ev(() => window.astraApp.navigate('control')); await page.waitForTimeout(800);
  await page.click('#live-start'); await page.waitForTimeout(500);
  check('Mission Control: Start shows the panel in a dialog', /Not ready to launch yet/.test(await page.locator('.modal').innerText()) && (await page.locator('.modal .need-item').count()) >= 1);
  await snap('control-gate');
  await page.click('.modal #need-fix-all, .modal .need-fix'); await page.waitForTimeout(1500);
  check('after the fix, "Launch now" appears in the dialog', (await page.locator('.modal #need-go').count()) === 1);
  await page.click('.modal #need-go'); await page.waitForTimeout(1500);
  check('"Launch now" starts the live flight', await ev(() => !!window.astraApp.live && !window.astraApp.live.finished));
  await ev(() => window.astraApp.stopLive());
} catch (e) { check(`script error after "${lastStep}"`, false, e.message.split('\n')[0]); }
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close();
const failed = results.filter(([, ok]) => !ok).length; console.log(`${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
