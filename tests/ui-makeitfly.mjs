// Browser test of "Fix it and fly again": honest test flights in the Rocket Builder, the Launch it result, the New rocket check flight and the slow-computer banner.
//   node tests/ui-makeitfly.mjs   (needs Playwright + Chromium; not part of `npm test`)
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8179);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
const build300 = () => page.evaluate(async () => { const a = window.astraApp; const { rocketBuildPlan } = await import('/ai/design.js'); const { applyPlan } = await import('/ai/plan.js'); await applyPlan(a.session, rocketBuildPlan({ payloadMass: 300, altitude: 200000, dvMargin: 1.05 })); a.emit('design', 'test'); });
try {
  await page.goto('http://127.0.0.1:8179/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await build300();
  // ---- Rocket Builder: honest card
  await page.evaluate(() => window.astraApp.navigate('designer')); await page.waitForSelector('#fly-checks');
  check('builder: says "Not test flown yet" with a Test fly button', /Not test flown yet/.test(await page.locator('#fly-untested').innerText()) && (await page.locator('#fly-test-btn').count()) === 1);
  check('builder: "Green means the checks pass. Only a flight proves it."', /Only a flight proves it/.test(await page.locator('#fly-green-note').innerText()));
  await page.click('#fly-test-btn'); await page.waitForSelector('#fly-test-stop');
  check('builder: Test fly shows progress and a Stop button', true);
  await page.waitForFunction(() => !document.querySelector('#fly-test-stop'), null, { timeout: 120000 });
  const failText = await page.locator('#fly-test-result').innerText();
  check('builder: a failed test flight says "Failed: ..." in plain words and offers "Fix it and fly again"', /Failed: /.test(failText) && (await page.locator('#fly-fix').count()) === 1 && /Fix it and fly again/.test(await page.locator('#fly-fix').innerText()), failText.replace(/\n/g, ' '));
  check('builder: the verdict follows the flight', /Test flight failed/.test(await page.locator('#fly-verdict-text').innerText()) && (await page.getAttribute('#fly-verdict', 'data-state')) === 'bad');
  // editing invalidates the result
  await page.click('#engine-plus-stage2').catch(() => {}); await page.waitForTimeout(500);
  check('builder: changing the design brings back "Not test flown yet"', (await page.locator('#fly-untested').count()) === 1 && (await page.locator('#fly-test-result').count()) === 0);
  await page.click('#engine-minus-stage2').catch(() => {}); await page.waitForTimeout(400);
  check('builder: the same design shows its flight result again', /Failed: /.test(await page.locator('#fly-test-result').innerText()));
  // ---- Fix it and fly again in the builder
  await page.click('#fly-fix'); await page.waitForSelector('#fly-test-stop');
  await page.waitForFunction(() => !document.querySelector('#fly-test-stop'), null, { timeout: 240000 });
  const fixed = await page.locator('#fly-test-result').innerText();
  check('builder: Fix it and fly again ends with a real success', /Fixed: it flies now/.test(fixed) && /flew/i.test(fixed), fixed.replace(/\n/g, ' '));
  const st = await page.evaluate(async () => { const a = window.astraApp; const { record } = await a.getRun('last'); return { status: record.result.status, saved: record.meta?.scheduleSaved, same: JSON.stringify(record.meta?.schedule) === JSON.stringify(a.project.mission.guidance.params.schedule), need: a.needsLaunchPath() }; });
  check('the last run is a SUCCESS and its launch path is saved in the mission', st.status === 'SUCCESS' && st.saved && st.same && st.need === false, JSON.stringify(st));
  // ---- Launch it: a failed result offers the fix button
  await page.evaluate(() => window.astraApp.api.execute('MODIFY_STAGE', { stage: 'stage1', propellantScale: 0.6 }).then(() => window.astraApp.api.execute('MODIFY_STAGE', { stage: 'stage2', propellantScale: 0.6 })).then(() => { window.astraApp.commit('test'); }));
  await page.evaluate(() => window.astraApp.navigate('simulation')); await page.waitForSelector('#run-fast');
  check('launch: the ready check says it is a prediction', /Only a flight proves it/.test(await page.locator('#rr-note').innerText()));
  await page.click('#run-fast'); await page.waitForFunction(() => !document.querySelector('.progress'), null, { timeout: 180000 }); await page.waitForTimeout(600);
  const why = await page.locator('#fixit-why').innerText();
  check('launch: a failed flight shows one primary "Fix it and fly again" button and a one-line cause', (await page.locator('#fix-it.primary').count()) === 1 && why.length > 8 && why.length < 110, why);
  await page.click('#fix-it'); await page.waitForSelector('#fix-stop');
  check('launch: Fix it shows progress with Stop', (await page.locator('#fix-progress .progress').count()) === 1);
  await page.waitForSelector('#fix-result', { timeout: 240000 });
  check('launch: Fix it ends with a recorded SUCCESS', /flew/i.test(await page.locator('#fix-result').innerText()) && (await page.locator('.badge:has-text("SUCCESS"), .status-badge:has-text("SUCCESS")').count()) >= 1);
  // ---- Live Flight uses the saved path and warns when the computer is slow
  await page.evaluate(() => window.astraApp.navigate('control', { autostart: true })); await page.waitForSelector('#live-pause:not([disabled])', { timeout: 60000 });
  check('live: no "slow computer" banner on a normal start', (await page.locator('#live-slow').isVisible()) === false);
  await page.evaluate(() => { window.astraApp.live.advance = () => false; });      // pretend the computer cannot keep up
  await page.waitForSelector('#live-slow', { state: 'visible', timeout: 15000 });
  check('live: slow computer banner with 20x and Run fast', /Your computer is slow\. Press 20x or Run fast\./.test(await page.locator('#live-slow').innerText()) && (await page.locator('#live-slow-fast').count()) === 1);
  await page.click('#live-slow-20'); check('live: 20x button speeds it up and hides the banner', (await page.evaluate(() => window.astraApp.live.speed)) === 20 && !(await page.locator('#live-slow').isVisible()));
  await page.evaluate(() => window.astraApp.stopLive()); await page.waitForTimeout(300);
  // ---- New rocket: a real test flight with progress and Skip
  await page.evaluate(() => { window.__then = 0; window.astraApp.navigate('home'); });
  await page.evaluate(async () => { const { createVehicleDialog } = await import('/ui/lib/create.js'); createVehicleDialog(window.astraApp, 'rocket', { then: () => { window.__then++; } }); });
  await page.click('.modal-foot .btn.primary'); await page.waitForSelector('#tf-progress');
  check('new rocket: "Test flying your rocket..." with a Skip button', /Test flying your rocket/.test(await page.locator('.modal-head h3').innerText()) && (await page.locator('#tf-skip').count()) === 1);
  await page.waitForSelector('#tf-open', { timeout: 120000 });
  check('new rocket: the check flight ends with a plain result', /flew|works|does not work/i.test(await page.locator('#tf-result').innerText()), (await page.locator('#tf-result').innerText()).replace(/\n/g, ' '));
  await page.click('#tf-open'); await page.waitForTimeout(300);
  check('new rocket: the builder opens after the check flight', (await page.evaluate(() => window.__then)) === 1);
  await page.evaluate(async () => { const { createVehicleDialog } = await import('/ui/lib/create.js'); createVehicleDialog(window.astraApp, 'rocket', { then: () => { window.__then++; } }); });
  await page.click('.modal-foot .btn.primary'); await page.waitForSelector('#tf-skip'); await page.click('#tf-skip'); await page.waitForTimeout(500);
  check('new rocket: Skip stops at once and opens the builder', (await page.evaluate(() => window.__then)) === 2 && (await page.locator('#tf-progress').count()) === 0 && !!(await page.evaluate(() => window.astraApp.project.vehicle)));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
