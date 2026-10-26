// Browser test for the 2.6 look and motion: cockpit, looks, T-minus intro, hologram builder, no shader errors.   node tests/ui-v26.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright not installed: skipped'); process.exit(0); } }

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const port = 8700 + Math.floor(Math.random() * 200);
await startServer(port);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await page.evaluate(async () => { const { TEMPLATE_BY_ID } = await import('/data/templates.js'); await TEMPLATE_BY_ID['sounding-rocket'].build(window.astraApp); window.astraApp.setSetting('mode', 'engineer'); });
  check('a star field sits behind the menus', await page.locator('#starfield').count() === 1);
  // looks
  for (const look of ['daylight', 'contrast', 'space']) { await page.evaluate((l) => window.astraApp.setSetting('look', l), look); check(`look "${look}" is applied to the page`, await page.evaluate(() => document.body.dataset.look) === look); }
  await page.evaluate(() => window.astraApp.setSetting('fx', false)); check('animations can be switched off', await page.evaluate(() => document.body.dataset.fx) === 'off');
  await page.evaluate(() => window.astraApp.setSetting('fx', true));
  await page.evaluate(() => window.astraApp.navigate('settings')); await page.waitForSelector('#set-look', { timeout: 8000 }).catch(() => {});
  check('Settings has the look picker and the animation switch', await page.locator('#set-look').count() === 1 && await page.locator('#set-fx').count() === 1);
  // cockpit and T-minus intro
  await page.evaluate(() => { globalThis.__forceIntro = true; window.astraApp.navigate('control'); }); await page.waitForTimeout(500);
  await page.click('#live-start');
  await page.waitForSelector('#launch-intro', { timeout: 3000 }).catch(() => {});
  const iv = await page.locator('#launch-intro').count(), t0 = await page.evaluate(() => window.astraApp.live.sim.t); check('the T-minus intro shows and holds the flight', iv === 1 && t0 < 0.5, `intro=${iv} t=${t0}`);
  await page.waitForFunction(() => window.astraApp.live.sim.t > 1.5, null, { timeout: 15000 }).catch(() => {});
  check('after the intro the flight runs', await page.evaluate(() => window.astraApp.live.sim.t > 0));
  check('the cockpit is shown with dials, horizon and event ribbon', await page.locator('#cockpit .ck-dial').count() === 2 && await page.locator('#cockpit .ck-adi-svg').count() === 1 && await page.locator('#cockpit .ck-ribbon').count() === 1);
  check('the cockpit clock reads T+', /^T\+/.test(await page.locator('#cockpit .ck-clock b').innerText()));
  const spd = await page.locator('#cockpit .ck-dialread b').first().innerText(); check('the speed dial shows a number', /\d/.test(spd), spd);
  await page.click('#view-cockpit'); check('the cockpit can be switched off', await page.evaluate(() => document.getElementById('cockpit').hidden === true));
  await page.click('#view-cockpit');
  // designer hologram
  await page.evaluate(() => window.astraApp.navigate('designer')); await page.waitForTimeout(500);
  check('the builder has the hologram layer', await page.locator('.holo .holo-sweep').count() === 1);
  const real = errors.filter((e) => !/favicon|net::ERR|WebGL.*(swift|GPU stall)/i.test(e));
  check('no page errors or shader errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) { check('test ran without crashing', false, e.message); }
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
