// Browser test for the Credibility page: headline tiles, failures in red, the eight credibility factors, error-bar plots, filters.   node tests/ui-credibility.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('Playwright not installed: skipped'); process.exit(0); }

const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const port = 8900 + Math.floor(Math.random() * 90);
await startServer(port);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(`http://127.0.0.1:${port}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await page.evaluate(() => { window.astraApp.setSetting('mode', 'engineer'); window.astraApp.navigate('credibility'); });
  await page.waitForSelector('#cred-page #cred-headline', { timeout: 15000 });
  const head = await page.locator('#cred-headline .v').innerText();
  check('the headline counts predictions inside the error bars', /^\d+ of \d+$/.test(head), head);
  check('failures are listed', await page.locator('#cred-failures li').count() >= 3);
  check('a failed rocket flight is shown in red', await page.locator('#cred-failures li.failure').count() >= 1);
  check('eight credibility factors with meters', await page.locator('#cred-factors .cred-factor').count() === 8 && await page.locator('#cred-factors .cred-meter').count() === 8);
  check('the "what it is good for" warning is shown', /NOT good enough/.test(await page.locator('#cred-use').innerText()));
  check('one card per rocket and mission case', await page.locator('.cred-case').count() === 13);
  const evRows = await page.locator('.cred-plot g[data-row]').count();
  await page.click('#cred-filter-all');
  const allRows = await page.locator('.cred-plot g[data-row]').count();
  check('"All rows" shows the calibration and build rows too', allRows > evRows && evRows > 0, `${evRows} -> ${allRows}`);
  check('the Saturn V card says its nominal flight succeeds', /succeeds/.test(await page.locator('#cred-saturn-v [data-testid="cred-outcome"]').innerText()));
  check('the Vega card says its nominal flight fails', /FAILS/.test(await page.locator('#cred-vega [data-testid="cred-outcome"]').innerText()));
  check('the sidebar has a Credibility entry', await page.locator('#nav [data-screen="credibility"], #nav [data-id="credibility"], #nav >> text=Credibility').count() >= 1);
  // live re-run of the quickest rocket
  await page.click('#cred-run-new-shepard');
  await page.waitForFunction(() => /Flown just now/.test(document.querySelector('#cred-new-shepard')?.innerText ?? ''), null, { timeout: 120000 }).catch(() => {});
  check('"Fly again" recomputes a rocket live', /Flown just now/.test(await page.locator('#cred-new-shepard').innerText()));
  await page.evaluate(() => window.astraApp.setSetting('look', 'daylight')); await page.waitForTimeout(200);
  await page.screenshot({ path: process.env.SHOT ?? 'build/ui-credibility.png', fullPage: false }).catch(() => {});
  const real = errors.filter((e) => !/favicon|net::ERR|WebGL/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) { check('test ran without crashing', false, e.message); }
await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
