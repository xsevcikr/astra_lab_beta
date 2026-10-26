// Browser test of the Academy build guides, glossary tooltips, parts search and Key idea boxes (needs Playwright + Chromium; not part of `npm test`).
//   node tests/ui-guides.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed; skipping.'); process.exit(0); } }

let lastStep = 'start'; const results = [];
const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8174);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()} (after: ${lastStep})`); });
const nav = (screen, params) => page.evaluate(([s, p]) => window.astraApp.navigate(s, p), [screen, params]);
try {
  await page.goto('http://127.0.0.1:8174/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  // ---- guides list
  await nav('academy', { view: 'guides' }); await page.waitForSelector('.gd-card');
  check('guides: one card per ready-made vehicle plus the repair guide', (await page.locator('.gd-card').count()) >= 9);
  check('guides: titles start with "How to"', await page.evaluate(() => [...document.querySelectorAll('.gd-card h2')].length >= 9));
  // ---- sounding rocket guide, real edits
  await page.click('[data-guide=sounding-rocket]'); await page.waitForSelector('.gd-step');
  check('guide: steps are short and each has a button', (await page.locator('.gd-step').count()) === 7 && (await page.locator('.gd-step button.btn').count()) >= 7);
  await page.click('[data-step=body]'); await page.waitForTimeout(400);
  check('guide: first button creates the rocket in the project', await page.evaluate(() => window.astraApp.project.vehicle?.name === 'Sounding rocket'));
  check('guide: the step is ticked', (await page.locator('.gd-step.done').count()) === 1);
  await page.click('[data-step=stage]'); await page.waitForTimeout(500);
  check('guide: stage step adds engine and tanks', await page.evaluate(() => { const c = window.astraApp.project.vehicle.components; return c.some((x) => x.kind === 'engine') && c.some((x) => x.kind === 'fuel_tank'); }));
  check('guide: "what these parts do" lists engine, tank, oxidizer tank', /Engine/.test(await page.locator('[data-step-id=stage]').innerText()) && /Oxidizer tank/.test(await page.locator('[data-step-id=stage]').innerText()));
  await page.click('#gd-undo'); await page.waitForTimeout(400);
  check('guide: Undo removes the last change', await page.evaluate(() => !window.astraApp.project.vehicle.components.some((x) => x.kind === 'engine')));
  await page.click('[data-step=stage]'); await page.waitForTimeout(400);
  await page.click('[data-step=payload]'); await page.waitForTimeout(400);
  await page.click('[data-step=mission]'); await page.waitForTimeout(400);
  check('guide: mission step creates the 100 km goal', await page.evaluate(() => window.astraApp.project.mission?.objective?.type === 'suborbital'));
  check('guide: build steps are ticked by themselves', (await page.locator('.gd-step.done').count()) >= 4);
  // ---- load the finished example for another guide
  await nav('academy', { guide: 'rover' }); await page.waitForSelector('#gd-example'); await page.click('#gd-example'); await page.waitForTimeout(500);
  check('guide: "Load the finished one" puts the rover and its mission in the project', await page.evaluate(() => window.astraApp.project.vehicle?.type === 'rover' && !!window.astraApp.project.mission));
  // ---- glossary
  await nav('academy', { view: 'glossary' }); await page.waitForSelector('.gd-term');
  check('glossary: at least 120 terms', (await page.locator('.gd-term').count()) >= 120);
  await page.fill('#glossary-search', 'apogee'); await page.waitForTimeout(200);
  check('glossary: search narrows the list', (await page.locator('.gd-term').count()) >= 1 && (await page.locator('.gd-term').count()) < 10);
  // ---- lesson: key idea, tap-a-word, go deeper
  await nav('academy', { lesson: 'L7-1' }); await page.waitForSelector('#key-idea');
  check('lesson: a Key idea box comes first', /Key idea/i.test(await page.locator('#key-idea').innerText()));
  await page.locator('.lesson .gloss').first().click(); await page.waitForSelector('.gloss-pop');
  check('lesson: tapping a dotted word opens its plain explanation', (await page.locator('.gloss-pop p').innerText()).length > 10);
  check('lesson: Beginner hides the deeper text', !(await page.locator('#go-deeper').isVisible()));
  await page.evaluate(() => window.astraApp.setSetting('mode', 'advanced')); await page.waitForTimeout(500);
  await nav('academy', { lesson: 'L7-1' }); await page.waitForSelector('#go-deeper');
  check('lesson: Advanced opens the full original explanation', await page.evaluate(() => document.querySelector('#go-deeper').open === true));
  await page.evaluate(() => window.astraApp.setSetting('mode', 'beginner')); await page.waitForTimeout(300);
  // ---- parts guide
  await nav('academy', { view: 'parts' }); await page.waitForSelector('.part-card');
  const all = await page.locator('.part-card').count();
  await page.fill('#parts-search', 'battery'); await page.waitForTimeout(200);
  const some = await page.locator('.part-card').count();
  check('parts: search filters the part cards', all >= 30 && some >= 1 && some < all, `${some} of ${all}`);
  check('parts: every card has a "Learn more" and a short description', await page.evaluate(() => [...document.querySelectorAll('.part-card')].every((c) => /Learn more/.test(c.innerText))));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('script completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
