// Browser test for the Optimiser screen (launch path, transfer burns, staging).   node tests/ui-optimize.mjs   (SHOTS=dir saves screenshots)
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright not installed: skipped'); process.exit(0); } }

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const shots = process.env.SHOTS;
const port = 8700 + Math.floor(Math.random() * 200);
await startServer(port);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const tab = async (label) => { await page.click(`#optimize-page .tabs .tab:has-text("${label}")`); await page.waitForTimeout(200); };
try {
  await page.goto(`http://127.0.0.1:${port}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await page.evaluate(async () => { const { TEMPLATE_BY_ID } = await import('/data/templates.js'); await TEMPLATE_BY_ID['small-launcher'].build(window.astraApp); window.astraApp.setSetting('mode', 'engineer'); });
  check('the Optimiser is in the Study menu', await page.locator('.nav-item[data-screen=optimize]').count() === 1);
  await page.click('.nav-item[data-screen=optimize]'); await page.waitForSelector('#optimize-page', { timeout: 8000 });
  check('the screen opens on the launch path tab', await page.locator('#opt-ascent-run').count() === 1);
  // a short launch-path optimisation
  await page.click('#optimize-page button:has-text("15")');
  await page.click('#opt-ascent-run');
  check('progress is shown while flights run', await page.locator('#opt-progress').count() === 1);
  await page.waitForSelector('#opt-ascent-result', { timeout: 120000 });
  const explain = await page.locator('#opt-ascent-explain').innerText();
  check('a result with an explanation is shown', /propellant/i.test(explain), explain.slice(0, 120));
  check('the result table lists the tuned settings', await page.locator('#opt-ascent-table tbody tr').count() >= 4);
  if (shots) await page.screenshot({ path: `${shots}/optimize-ascent.png`, fullPage: true });
  if (await page.locator('#opt-ascent-save').count()) {
    const before = await page.evaluate(() => JSON.stringify(window.astraApp.project.mission.guidance.params));
    await page.click('#opt-ascent-save');
    const after = await page.evaluate(() => JSON.stringify(window.astraApp.project.mission.guidance.params));
    check('saving writes the optimised path into the mission', before !== after);
  } else check('no save offered when nothing improved', /already close|knife/.test(explain));
  // transfer burns
  await tab('Transfer burns');
  await page.click('#opt-orbit-run'); await page.waitForSelector('#opt-orbit-result', { timeout: 5000 });
  check('orbit transfer options are compared and one is marked best', await page.locator('#opt-orbit-result .pro-tag.ok').count() === 1);
  await page.click('#opt-ipl-run'); await page.waitForSelector('#opt-ipl-result', { timeout: 20000 });
  check('the planet-to-planet search finds a window', /leave \d{4}-\d\d-\d\d/.test(await page.locator('#opt-ipl-result .callout').innerText()));
  check('the porkchop plot is drawn', await page.locator('#opt-ipl-chart').count() === 1);
  if (shots) await page.screenshot({ path: `${shots}/optimize-transfer.png`, fullPage: true });
  // staging
  await tab('Staging');
  check('the rocket is compared with the optimum split', await page.locator('#opt-stage-compare table tbody tr').count() === 2);
  await page.click('#opt-stage-run'); await page.waitForSelector('#opt-stage-result', { timeout: 5000 });
  check('the staging trade lists options with a Pareto set', await page.locator('#opt-stage-result .pro-tag.ok').count() >= 1);
  check('your own engines are included in the trade', /Engines of/.test(await page.locator('#opt-stage-result').innerText()));
  if (shots) await page.screenshot({ path: `${shots}/optimize-staging.png`, fullPage: true });
  // beginner mode and the results survive leaving the screen
  await page.evaluate(() => { window.astraApp.setSetting('mode', 'beginner'); window.astraApp.setSetting('showAllTools', true); window.astraApp.navigate('home'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.astraApp.navigate('optimize')); await page.waitForSelector('#optimize-page');
  check('beginner mode shows the plain title', (await page.locator('#optimize-page h1:visible').innerText()).includes('Make it better'));
  check('the staging result is still there after leaving the screen', await page.locator('#opt-stage-result').count() === 1);
  const real = errors.filter((e) => !/favicon|net::ERR|WebGL/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) { check('test ran without crashing', false, e.message); }
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
