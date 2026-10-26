// Browser test for the 2.1 features: weather and precise gravity in the planner, weather in the reliability study, run fingerprints and
// "Re-run and verify" in Replay, Python / MATLAB scripts, the orbit-drift (J2) validation card.   node tests/ui-v21.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(process.env.CI ? 1 : 0); } }

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const port = 8300 + Math.floor(Math.random() * 400);
const server = await startServer(port);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const go = async (id, arg) => { await page.evaluate(([i, a]) => window.astraApp.navigate(i, a), [id, arg]); await page.waitForTimeout(400); };
try {
  await page.goto(`http://127.0.0.1:${port}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await page.evaluate(async () => { window.astraApp.setSetting('mode', 'advanced'); const { TEMPLATE_BY_ID } = await import('/data/templates.js'); await TEMPLATE_BY_ID['sounding-rocket'].build(window.astraApp); });
  // ---- weather and gravity in the planner
  await go('planner');
  await page.waitForSelector('#weather-editor', { timeout: 8000 }).catch(() => {});
  check('planner has the weather and gravity editor', await page.locator('#weather-editor').count() === 1);
  check('2.5: the sounding button, warm-day switch and second slosh mode are there', await page.locator('#sounding-import').count() === 1 && await page.locator('#env-tropical').count() === 1 && await page.locator('#env-slosh2').count() === 1);
  const inputs = page.locator('#weather-editor input[type=number]');
  await inputs.nth(0).fill('12'); await inputs.nth(0).press('Tab'); await page.waitForTimeout(300);
  check('wind speed is stored in the project environment', await page.evaluate(() => window.astraApp.project.environment.wind?.speed === 12));
  await page.locator('#env-j2').check(); await page.waitForTimeout(300);
  check('precise gravity is stored in the project settings', await page.evaluate(() => window.astraApp.project.settings.j2 === true));
  await page.evaluate(() => { window.astraApp.project.environment.wind.speed = 10; });
  // ---- a flight with weather is recorded with its fingerprints
  const r = await page.evaluate(() => window.astraApp.api.execute('RUN_SIMULATION', { name: 'weather flight' }));
  check('a flight in wind with precise gravity runs', r.ok === true, r.message?.slice(0, 80));
  const rec = await page.evaluate(async () => { const id = window.astraApp.project.runs.at(-1).id; return (await window.astraApp.getRun(id)).record; });
  check('the run record names its gravity and weather', rec.engine.gravity === 'point mass + J2' && rec.engine.weather === true && rec.environment.wind.speed === 10);
  check('the run record carries input and result fingerprints', /^[0-9a-f]{14}$/.test(rec.fingerprint?.inputs ?? '') && /^[0-9a-f]{14}$/.test(rec.fingerprint?.results ?? ''));
  // ---- replay: fingerprints and re-run and verify
  await go('replay', { runId: rec.id });
  await page.waitForSelector('#rp-fp', { timeout: 20000 });
  check('Replay shows the fingerprints', (await page.locator('#rp-fp').innerText()).includes(rec.fingerprint.inputs));
  await page.click('#rp-verify');
  await page.waitForFunction(() => /Verified|Not identical/.test(document.body.innerText), null, { timeout: 120000 });
  check('"Re-run and verify" confirms an identical re-run', /Verified: the re-run is identical/.test(await page.evaluate(() => document.body.innerText)));
  // ---- analysis exports
  await go('analysis', { runId: rec.id, tab: 'report' }); await page.waitForSelector('#exp-tel-csv', { timeout: 20000 });
  check('analysis offers Python and MATLAB scripts', await page.locator('#exp-tel-py').count() === 1 && await page.locator('#exp-tel-m').count() === 1);
  // ---- reliability study with weather
  await go('experiments');
  const wind = page.locator('#mc-panel label', { hasText: 'Wind speed' }).locator('input[type=checkbox]');
  check('the reliability study lists wind and air density as weather inputs', await wind.count() === 1 && await page.locator('#mc-panel label', { hasText: 'Air density' }).count() === 1);
  check('weather inputs start switched off', !(await wind.isChecked()));
  await wind.check(); await page.waitForTimeout(100);
  await page.fill('#mc-runs', '5'); await page.press('#mc-runs', 'Tab'); await page.fill('#mc-seed', '3'); await page.press('#mc-seed', 'Tab');
  await page.click('#mc-run'); await page.waitForSelector('#mc-result', { timeout: 280000 });
  const txt = await page.locator('#mc-result').innerText();
  check('the study ran 5 weather flights and reports a probability', /5/.test(txt) && /%/.test(txt), txt.slice(0, 80).replace(/\n/g, ' '));
  const mc = await page.evaluate(() => window.astraApp.api.ctx.lastMonteCarlo);
  check('every flight drew its own wind', mc.rows.length === 5 && mc.rows.every((x) => Number.isFinite(x.factors['Wind speed (random direction)'])) && new Set(mc.rows.map((x) => x.factors['Wind speed (random direction)'])).size > 1);
  // ---- validation: orbit drift
  await go('validation');
  check('validation lists the orbit-drift (J2) check', await page.locator('#valm-run-precession').count() === 1);
  await page.click('#valm-run-precession'); await page.waitForSelector('#valm-precession .val-verdict', { timeout: 120000 });
  check('both orbit-drift numbers match', /2 of 2/.test(await page.locator('#valm-precession .val-verdict').innerText()), (await page.locator('#valm-precession .val-verdict').innerText()).replace(/\n/g, ' ').slice(0, 80));
} catch (e) { check(`unexpected error: ${e.message}`, false); }
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close?.();
const passed = results.filter(Boolean).length;
console.log(`\n2.1 UI test: ${passed} passed, ${results.length - passed} failed`);
process.exit(passed === results.length ? 0 : 1);
