// Browser test of the one-click "Fix it" buttons (designer issue list, Rocket Builder, needs panel): the fix really edits the design, re-validates, and is ONE undo step.
//   node tests/ui-autofix.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }
let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8176);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`));
const ev = (f, a) => page.evaluate(f, a);
const codes = () => ev(async () => { const { validateVehicle } = await import('/src/vehicles/analysis.js'); return validateVehicle(window.astraApp.project.vehicle).map((i) => i.code); });
const breakIt = (kind, group) => ev(([k, g]) => { const v = window.astraApp.project.vehicle; v.components = v.components.filter((c) => !(c.group === g && c.kind === k)); window.astraApp.commit('Test: break', { silent: true }); window.astraApp.navigate('home'); window.astraApp.navigate('designer'); }, [kind, group]);
try {
  await page.goto('http://127.0.0.1:8176/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await ev(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); });
  // 1. Rocket Builder (Beginner): kerolox engine without its LOX tank
  await breakIt('oxidizer_tank', 'stage1'); await page.waitForTimeout(600);
  check('the broken design reports NO_FEED', (await codes()).includes('NO_FEED'));
  check('Beginner Rocket Builder lists the problem with a fix button', (await page.locator('#simple-fixes .ed-fixbtn').count()) >= 1 && /missing tank/i.test(await page.locator('#simple-fixes .ed-fixbtn').first().innerText()));
  const nBefore = await ev(() => window.astraApp.project.vehicle.components.length);
  await page.locator('#simple-fixes .ed-fixbtn').first().click(); await page.waitForTimeout(700);
  check('one click adds the missing tank and the issue is gone', !(await codes()).includes('NO_FEED') && (await ev(() => window.astraApp.project.vehicle.components.length)) === nBefore + 1);
  check('the problem box disappears', (await page.locator('#simple-fixes').count()) === 0);
  await ev(() => window.astraApp.undo()); await page.waitForTimeout(400);
  check('Undo reverts the fix in one step', (await codes()).includes('NO_FEED'));
  // 2. full editor (Advanced): hydrolox-style missing fuel tank in stage 2 + fix in the list
  await ev(() => window.astraApp.redo()); await page.waitForTimeout(300);
  await ev(() => window.astraApp.setSetting('mode', 'advanced'));
  await breakIt('fuel_tank', 'stage2'); await page.waitForTimeout(700);
  check('full editor shows the issue with a fix button', (await page.locator('.ed-issue .ed-fixbtn').count()) >= 1);
  await page.locator('.ed-issue .ed-fixbtn').first().click(); await page.waitForTimeout(700);
  check('the full-editor fix removes the issue', !(await codes()).includes('NO_FEED'));
  // 3. needs panel on the launch screen
  await ev(() => window.astraApp.setSetting('mode', 'beginner'));
  await ev(() => { const v = window.astraApp.project.vehicle; v.components = v.components.filter((c) => !(c.kind === 'engine' && c.group === 'stage2')); window.astraApp.commit('Test: no engine', { silent: true }); window.astraApp.navigate('home'); window.astraApp.navigate('simulation'); }); await page.waitForTimeout(900);
  check('the needs panel offers an engine fix', (await page.locator('[data-need="stage-no-engine:stage2"] .need-fix').count()) === 1);
  await page.locator('[data-need="stage-no-engine:stage2"] .need-fix').click(); await page.waitForTimeout(700);
  check('after the fix the stage has an engine again', !(await codes()).includes('STAGE_NO_ENGINE'));
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
} catch (e) { console.log('SCRIPT ERROR', e.stack); check('script ran to the end', false, lastStep); }
await browser.close(); server.close();
const bad = results.filter((r) => !r[1]).length; console.log(`\n${results.length - bad} of ${results.length} checks passed`); process.exit(bad ? 1 : 0);
