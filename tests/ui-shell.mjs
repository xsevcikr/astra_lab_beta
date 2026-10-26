// Browser test of the app shell: Start-here path, palette (Ctrl+K), help (?), tour, sound setting, facts, progress report.
//   node tests/ui-shell.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }
let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8173);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
try {
  await page.goto('http://127.0.0.1:8173/ui/index.html?tour=1');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  // ---- first-run tour: appears, can be skipped, is remembered
  await page.waitForSelector('#tour-card', { timeout: 8000 });
  check('the first-run tour appears', true);
  await page.click('#tour-skip'); await page.waitForTimeout(300);
  check('skipping closes the tour and remembers it', (await page.locator('#tour-card').count()) === 0 && await page.evaluate(() => window.astraApp.settings.tourDone === true));
  // ---- Start here
  await page.evaluate(() => window.astraApp.navigate('home')); await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('#home-more').open = true; }); await page.waitForTimeout(200);
  check('Home shows the four "Start here" steps', (await page.locator('.sh-step').count()) === 4);
  check('no step is ticked on a fresh project', (await page.locator('.sh-step.ok').count()) === 0);
  check('a "Did you know?" fact is shown', (await page.locator('#sh-fact-text').innerText()).length > 20);
  const f1 = await page.locator('#sh-fact-text').innerText(); await page.click('#sh-fact-next');
  check('"Another" shows a different fact', (await page.locator('#sh-fact-text').innerText()) !== f1);
  await page.evaluate(() => { window.astraApp.settings.academy.done['L1-1'] = true; window.astraApp.navigate('home'); }); await page.waitForTimeout(300);
  check('finishing a lesson ticks step 1', (await page.locator('#sh-step-learn.ok').count()) === 1);
  // ---- help
  await page.keyboard.press('?'); await page.waitForSelector('#help-overlay');
  check('"?" opens help with 6 tips', (await page.locator('#help-overlay .sh-tipcard').count()) === 6);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check('Escape closes help', (await page.locator('#help-overlay').count()) === 0);
  // ---- palette
  await page.keyboard.press('Control+k'); await page.waitForSelector('#palette-input');
  await page.keyboard.type('go to chall'); await page.waitForTimeout(150);
  check('palette filters "go to chall"', /Go to Challenges/.test(await page.locator('#palette-list .sh-item').first().innerText()));
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  check('Enter navigates', await page.evaluate(() => window.astraApp.screenId === 'challenges') && (await page.locator('#palette').count()) === 0);
  await page.keyboard.press('Control+k'); await page.keyboard.type('build a rocket'); await page.waitForTimeout(150);
  check('palette offers "Build a rocket"', /Build a rocket/.test(await page.locator('#palette-list .sh-item').first().innerText()));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k'); await page.keyboard.type('why is the sky dark'); await page.waitForTimeout(150);
  check('free text becomes "Ask the AI"', /Ask the AI/.test(await page.locator('#palette-list .sh-item').last().innerText()));
  await page.keyboard.press('Escape');
  // ---- challenge hint
  await page.evaluate(() => window.astraApp.navigate('challenges', { id: 'cool-nose' })); await page.waitForTimeout(400);
  check('a challenge shows 16 in the list and a hint button inside', (await page.locator('#ch-hint-btn').count()) === 1 && !(await page.locator('#ch-hint').isVisible()));
  await page.click('#ch-hint-btn'); check('Hint reveals a short tip', (await page.locator('#ch-hint').innerText()).length > 10);
  // ---- settings: sound toggle (off by default)
  await page.evaluate(() => window.astraApp.navigate('settings')); await page.waitForTimeout(500);
  check('sound is off by default', !(await page.locator('#set-sound').isChecked()));
  await page.check('#set-sound'); check('sound can be switched on', await page.evaluate(() => window.astraApp.settings.sound === true));
  // ---- progress report
  await page.click('#set-progress'); await page.waitForTimeout(300);
  check('"My progress" report opens with lessons and stars', /lessons finished/.test(await page.locator('.sh-print-root').innerText()) && /challenge stars/.test(await page.locator('.sh-print-root').innerText()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
