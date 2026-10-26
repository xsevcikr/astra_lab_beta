// Browser test of Challenges, the Launch Readiness Review and the flight phase ribbon (needs Playwright + Chromium; not part of `npm test`).
//   node tests/ui-challenges.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8153);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep}) ${(e.stack || "").split("\n").slice(1, 4).join(" <- ")}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
try {
  await page.goto('http://127.0.0.1:8153/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  // ---- challenge list
  await page.click('.nav-item[data-screen=challenges]'); await page.waitForTimeout(500);
  check('Challenges is in the Beginner sidebar', (await page.locator('.nav-item[data-screen=challenges]').count()) === 1);
  check('16 challenge cards are shown', (await page.locator('.ch-card').count()) === 16);
  check('total stars start at 0', /0 \/ 48/.test(await page.locator('#ch-total').innerText()) && (await page.evaluate(() => window.astraApp.settings.challenges ? Object.keys(window.astraApp.settings.challenges).length : 0)) === 0);
  // no rocket yet: setting up hands over to the AI Helper, which builds one (Approve is still the student's click)
  await page.click('[data-challenge=reach-orbit]'); await page.click('#ch-setup');
  await page.waitForFunction(() => document.querySelector('.plan-foot .btn.primary'), null, { timeout: 60000 });
  check('without a rocket, "Set up" asks the AI Helper to propose one', true);
  await page.click('.plan-foot .btn.primary'); await page.waitForFunction(() => !document.querySelector('#typing') && window.astraApp.project.vehicle, null, { timeout: 60000 }); await page.waitForTimeout(500);
  // ---- back to the challenge, set up, read the readiness review, launch
  await page.click('.nav-item[data-screen=challenges]'); await page.waitForTimeout(400);
  if (!(await page.locator('#ch-setup').count())) await page.click('[data-challenge=reach-orbit]');
  await page.click('#ch-setup'); await page.waitForTimeout(500);
  check('the challenge mission is created (200 km orbit)', await page.evaluate(() => window.astraApp.project.mission?.objective?.altitude === 200000));
  await page.click('#ch-launch'); await page.waitForTimeout(600);
  check('readiness review shows 7 stations', (await page.locator('.rr-station').count()) === 7);
  check('readiness review says GO for the AI rocket', /GO for launch/.test(await page.locator('#rr-summary').innerText()));
  await page.click('[data-station=power]'); await page.waitForTimeout(200);
  check('clicking a light shows its reason', /Enough electricity/.test(await page.locator('#rr-detail').innerText()));
  await page.click('#rr-learn'); await page.waitForTimeout(500);
  check('"Learn why" opens the Academy parts guide', /Battery/i.test(await page.locator('#screen h1, #screen h2').first().innerText()));
  await page.evaluate(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(500);
  await page.evaluate(() => window.astraApp.api.execute('CREATE_MISSION', { kind: 'launch', altitude: 1e6 })); await page.evaluate(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(500);
  check('a 1,000 km mission turns Propulsion red but the launch buttons stay usable', /NO-GO/.test(await page.locator('#rr-summary').innerText()) && !(await page.locator('#run-fast').isDisabled()));
  await page.evaluate(() => window.astraApp.navigate('challenges', { id: 'reach-orbit' })); await page.waitForTimeout(400);
  await page.click('#ch-setup'); await page.waitForTimeout(300);
  await page.evaluate(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(400);
  await page.click('#run-fast'); await page.waitForFunction(() => !document.querySelector('.progress'), null, { timeout: 180000 }); await page.waitForTimeout(500);
  // ---- check the result
  await page.evaluate(() => window.astraApp.navigate('challenges', { id: 'reach-orbit' })); await page.waitForTimeout(400);
  await page.click('#ch-check'); await page.waitForSelector('#ch-stars', { timeout: 20000 });
  check('"Check my result" shows a per-goal checklist', (await page.locator('.ch-row').count()) === 3);
  check('the orbit challenge earns stars from the recorded run', await page.evaluate(() => window.astraApp.settings.challenges['reach-orbit']?.stars >= 1), await page.locator('#ch-stars').innerText());
  // a run flown for another mission is refused
  await page.click('#ch-back'); await page.click('[data-challenge=station-orbit]'); await page.click('#ch-check'); await page.waitForTimeout(600);
  check('a run of another mission is not credited', /needs 400 km|400 km/.test(await page.locator('#ch-result').innerText()) && !(await page.evaluate(() => window.astraApp.settings.challenges['station-orbit'])));
  // ---- live flight: phase ribbon + callouts
  await page.evaluate(() => window.astraApp.navigate('control')); await page.waitForTimeout(500);
  check('control screen keeps its buttons', (await page.locator('#live-start, #live-pause, #live-speed, #live-step, #live-rtf').count()) === 5);
  check('phase ribbon exists before the flight', (await page.locator('#phase-ribbon').count()) === 1);
  await page.evaluate(async () => { await window.astraApp.api.execute('CREATE_MISSION', { kind: 'launch', altitude: 200000 }); window.astraApp.navigate('control'); });
  await page.waitForTimeout(400); await page.click('#live-start'); await page.evaluate(() => window.astraApp.live.setSpeed(25));
  await page.waitForFunction(() => document.querySelectorAll('.pr-chip.done, .pr-chip.current').length >= 3, null, { timeout: 60000 });
  check('ribbon phases come from the flight (Pre-launch, Liftoff, Max-Q ...)', await page.evaluate(() => { const t = [...document.querySelectorAll('.pr-chip')].map((c) => c.textContent); return /Liftoff/.test(t.join()) && /Max-Q/.test(t.join()) && /Mission end/.test(t.join()); }));
  check('a plain-language callout appears with a "What is this?" link', await page.waitForFunction(() => document.querySelector('#flight-callout')?.style.display === 'block' && document.querySelector('#fc-what'), null, { timeout: 30000 }).then(() => true, () => false));
  await page.click('#fc-what'); await page.waitForTimeout(500);
  check('"What is this?" opens an Academy lesson', /Academy/i.test(await page.locator('#screen h1').first().innerText()) || (await page.locator('.lesson').count()) > 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
