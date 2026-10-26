// Browser test of the Flight data dashboard, the report card, the simple live HUD, What-if cards and the simple replay (needs Playwright + Chromium; not part of `npm test`).
//   node tests/ui-flightdata.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8172);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep}) ${(e.stack || "").split("\n").slice(1, 4).join(" <- ")}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
try {
  await page.goto('http://127.0.0.1:8172/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  // ---- challenge list
  const nav = (id) => page.evaluate((s) => window.astraApp.navigate(s), id);
  await page.evaluate(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); await a.ask('Test it.'); });
  check('a real run was recorded', await page.evaluate(() => window.astraApp.project.runs.length >= 1));
  // ---- Flight data dashboard (Beginner)
  await nav('telemetry'); await page.waitForTimeout(1200);
  check('Flight data shows 6 cards', (await page.locator('[data-card]').count()) === 6);
  check('every card has a mini chart and a big number', await page.evaluate(() => [...document.querySelectorAll('[data-card]')].every((c) => c.querySelector('canvas.chart') && c.querySelector('.fd-big').textContent.trim().length > 0 && c.querySelector('.fd-mean').textContent.length > 10)));
  const topSpeed = await page.locator('[data-card=speed] .fd-big').innerText();
  const real = await page.evaluate(async () => { const a = window.astraApp; const r = await a.getRun(a.project.runs.at(-1).id); const c = r.telemetry.column('speed'); let m = 0; for (const v of c) m = Math.max(m, v); return Math.round(m * 3.6).toLocaleString('en-US'); });
  check('top speed card equals the recorded maximum (km/h)', topSpeed === real, `${topSpeed} vs ${real}`);
  check('a comparison with the speed of sound is shown', /times the speed of sound/.test(await page.locator('[data-card=speed] .fd-cmp').innerText()));
  check('Beginner hides the "More charts" button', !(await page.locator('#fd-more-btn').isVisible()));
  check('key moments are listed', (await page.locator('#fd-moments .fd-moment').count()) >= 3);
  // ---- More charts (Standard)
  await page.evaluate(() => window.astraApp.setSetting('mode', 'standard')); await page.waitForTimeout(600);
  await page.click('#fd-more-btn'); await page.waitForTimeout(600);
  check('More charts lists every recorded value with plain names', (await page.locator('.chan-list label').count()) >= 76);
  check('plain names are used instead of raw channel names', /Air pressure on the rocket/.test(await page.locator('.chan-list').innerText()));
  check('each graph explains itself (meaning and good range)', /Good:/.test(await page.locator('.fd-cap').first().innerText()));
  // ---- report card
  await page.evaluate(() => window.astraApp.setSetting('mode', 'beginner')); await nav('analysis'); await page.waitForTimeout(1200);
  check('report card is shown', (await page.locator('#fd-report').count()) === 1);
  const repSpeed = await page.locator('#fd-report [data-tile=speed] .fd-tile-v').innerText();
  check('report card top speed matches the dashboard', repSpeed.startsWith(real), repSpeed);
  check('report card has measured goals and a star rating', (await page.locator('#fd-report .fd-goal').count()) >= 3 && (await page.locator('#fd-stars').count()) === 1);
  check('analysis keeps its plain-language buttons', await page.locator('#why-btn').isVisible());
  // ---- live flight HUD
  await nav('control'); await page.waitForTimeout(500);
  await page.click('#live-start'); await page.click('[data-speed="20"]');
  await page.waitForFunction(() => window.astraApp.live?.sim.t > 70, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  check('simple HUD shows speed, height, fuel, push, phase', (await page.locator('#fd-hud .fd-hud-cell').count()) === 5 && await page.locator('#fd-hud').isVisible());
  check('speed buttons 1x 5x 20x exist and 20x is active', (await page.locator('.fd-speeds button').count()) === 3 && (await page.locator('.fd-speeds button.active').innerText()) === '20×');
  check('key moments feed lists Liftoff! and Max-Q from the real flight', await page.evaluate(() => { const t = document.querySelector('#fd-feed').innerText; return /Liftoff!/.test(t) && /Max-Q/.test(t); }));
  check('live speed select still works', await page.evaluate(() => !!document.querySelector('#live-speed')));
  await page.click('button:has-text("Stop")'); await page.waitForTimeout(800);
  // ---- Flight data while live data exists (recorded run just stored)
  // ---- What-if cards
  await nav('experiments'); await page.waitForTimeout(800);
  check('What-if cards are shown for Beginners', (await page.locator('.fd-wcard').count()) >= 3);
  await page.click('#wi-run-fuel');
  await page.waitForFunction(() => document.querySelector('#wi-take-fuel'), null, { timeout: 280000 });
  const take = await page.locator('#wi-take-fuel').innerText();
  check('what-if result has a chart and a computed sentence', (await page.locator('#wi-chart-fuel').count()) === 1 && /test flights/.test(take), take);
  // ---- Replay
  await nav('replay'); await page.waitForTimeout(1500);
  check('replay lists key moments and keeps its controls', (await page.locator('#rp-moments .item').count()) >= 3 && (await page.locator('#rp-play, #rp-speed, #rp-restart, #rp-scrub').count()) === 4);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
