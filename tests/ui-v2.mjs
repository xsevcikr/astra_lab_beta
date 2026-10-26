// Browser test for the 2.0 features: "Will it work?" test bench, sharing designs, real-mission validation, Director camera and cinema view.
// Needs Playwright + Chromium:  node tests/ui-v2.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: 2.0 UI test skipped.'); process.exit(0); } }

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const port = 8300 + Math.floor(Math.random() * 400);
const server = await startServer(port);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  check('Beginner sidebar has "Will it work?"', await page.locator('.nav-item[data-screen=testbench]').count() === 1);
  check('Home has a "Will it work?" button', await page.locator('#hero-test').count() === 1);
  // ---- test bench
  await page.click('#hero-test'); await page.waitForSelector('#tb-page');
  check('test bench lists at least 10 examples', (await page.locator('.tb-card').count()) >= 10);
  await page.click('#tb-run-sounding-rocket'); await page.waitForSelector('#tb-sounding-rocket .tb-verdict', { timeout: 90000 });
  check('a working example gets PASS with a reason', /PASS/.test(await page.locator('#tb-sounding-rocket .tb-big').innerText()) && (await page.locator('#tb-sounding-rocket .tb-reason').innerText()).length > 10);
  await page.click('#tb-run-heavy-launcher'); await page.waitForSelector('#tb-heavy-launcher .tb-verdict', { timeout: 90000 });
  check('a broken example gets FAIL with a plain reason', /FAIL/.test(await page.locator('#tb-heavy-launcher .tb-big').innerText()) && /fuel|speed|orbit/i.test(await page.locator('#tb-heavy-launcher .tb-reason').innerText()));
  check('testing examples does not change the project', await page.evaluate(() => Object.keys(window.astraApp.project.vehicles).length === 0));
  await page.click('[data-filter=rover]'); check('filter shows only rovers', (await page.locator('.tb-card').count()) === (await page.locator('.tb-card[data-kind=rover]').count()));
  await page.click('[data-filter=all]');
  await page.click('#tb-open-small-launcher'); await page.waitForTimeout(600);
  check('"Open it" loads the example into the builder', await page.evaluate(() => window.astraApp.screenId === 'designer' && /launcher/i.test(window.astraApp.project.vehicle?.name ?? '')));
  await page.click('.nav-item[data-screen=testbench]'); await page.waitForSelector('#tb-run-mine:not([disabled])');
  await page.click('#tb-run-mine'); await page.waitForSelector('#tb-mine .tb-verdict', { timeout: 90000 });
  check('"Test my design" gives a verdict for the project design', /PASS|FAIL/.test(await page.locator('#tb-mine .tb-big').innerText()));
  // ---- share
  await page.click('#tb-share'); await page.waitForTimeout(800);
  const link = await page.locator('#share-out').inputValue();
  check('share dialog makes an astralab:// link', link.startsWith('astralab://design/') && link.length > 200);
  await page.fill('#share-in', link); await page.click('#share-open'); await page.waitForSelector('#share-confirm');
  await page.locator('.modal-foot .btn.primary').last().click(); await page.waitForTimeout(500);
  check('pasting the link adds the shared design as a new vehicle', await page.evaluate(() => Object.keys(window.astraApp.project.vehicles).length === 2 && /\(shared\)$/.test(window.astraApp.project.vehicle.name)));
  await page.evaluate(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));
  await page.click('.nav-item[data-screen=testbench]'); await page.click('#tb-share'); await page.waitForTimeout(300);
  await page.fill('#share-in', 'astralab://design/not-a-real-code'); await page.click('#share-open'); await page.waitForTimeout(500);
  check('a damaged link is refused with a message', await page.evaluate(() => /damaged|look like/i.test(document.body.innerText)));
  await page.evaluate(() => document.querySelectorAll('.modal-back').forEach((m) => m.remove()));
  // ---- real-mission validation
  await page.evaluate(() => window.astraApp.setSetting('mode', 'advanced')); await page.waitForTimeout(300);
  await page.click('.nav-item[data-screen=validation]'); await page.waitForSelector('#valm-orbits');
  await page.click('#valm-run-orbits'); await page.waitForSelector('#valm-orbits .val-verdict', { timeout: 30000 });
  check('orbit checks: 8 of 8 match', /8 of 8/.test(await page.locator('#valm-orbits .val-big').innerText()));
  await page.click('#valm-run-msl'); await page.waitForSelector('#valm-msl .val-verdict', { timeout: 30000 });
  check('Curiosity landing card shows its rows with sources', (await page.locator('#valm-msl .val-row').count()) === 4 && (await page.locator('#valm-msl a[href^="https://"]').count()) >= 4);
  // ---- Director camera + cinema view
  await page.click('.nav-item[data-screen=control]'); await page.waitForTimeout(500);
  check('Mission Control offers the Director camera', await page.locator('.camera-bar .chip[data-mode=cinema]').count() === 1);
  await page.click('.camera-bar .chip[data-mode=cinema]');
  await page.click('#live-start'); await page.waitForFunction(() => window.astraApp.live?.sim?.t > 3, null, { timeout: 60000 });
  await page.click('#view-cinema'); await page.waitForTimeout(600);
  check('cinema view hides the side panel and charts', await page.evaluate(() => getComputedStyle(document.querySelector('.split.cinema > .side')).display === 'none'));
  const big = await page.evaluate(() => document.querySelector('.stage canvas').getBoundingClientRect().width);
  check('the 3D view gets the full width in cinema view', big > 1000, `${Math.round(big)} px`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Esc leaves cinema view', await page.evaluate(() => !document.querySelector('.split.cinema')));
  await page.evaluate(() => window.astraApp.live?.setSpeed?.(20)); await page.waitForTimeout(2500);
  check('Director camera renders without errors while flying', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.evaluate(() => { try { localStorage.removeItem('astra.cinema'); } catch {} });
} catch (e) { check(`unexpected error: ${e.message}`, false); }
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); server.close?.();
const passed = results.filter(Boolean).length;
console.log(`\n2.0 UI test: ${passed} passed, ${results.length - passed} failed`);
process.exit(passed === results.length ? 0 : 1);
