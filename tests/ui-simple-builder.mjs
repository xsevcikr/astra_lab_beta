// Browser test of the beginner "Rocket Builder" (Vehicle Designer) and the beginner Mission Planner.
//   node tests/ui-simple-builder.mjs      (needs Playwright + Chromium, like tests/ui-smoke.mjs)
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: test skipped.'); process.exit(0); } }

const results = []; const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const PORT = 8152;
const server = await startServer(PORT);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const snap = () => page.evaluate(() => { const p = document.querySelector('#simple-panel'); return p ? { mass: +p.dataset.totalMass, dv: +p.dataset.dv, twr: +p.dataset.twr, payload: +p.dataset.payload } : null; });
const setVal = (sel, v) => page.locator(sel).evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, String(v));
const tankSum = (stage) => page.evaluate((st) => window.astraApp.project.vehicle.components.filter((c) => c.group === st && c.propellantMass != null && ['fuel_tank', 'oxidizer_tank'].includes(c.kind)).map((c) => c.propellantMass), stage);
const nav = async (id) => { await page.evaluate((x) => window.astraApp.navigate(x), id); await page.waitForTimeout(700); };
try {
  await page.goto(`http://127.0.0.1:${PORT}/ui/index.html`);
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  check('starts in Beginner mode', await page.evaluate(() => window.astraApp.settings.mode === 'beginner'));
  await page.evaluate(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); });
  check('a rocket exists', await page.evaluate(() => window.astraApp.project.vehicle?.type === 'rocket'));

  // ---- simple panel
  await nav('designer');
  check('beginner: simple panel appears', (await page.locator('#simple-panel').count()) === 1);
  check('beginner: component tree and inspector are hidden', !(await page.locator('.tree').first().isVisible().catch(() => false)));
  check('beginner: view tools and camera chips remain', (await page.locator('#view-fit').isVisible()) && (await page.locator('#view-reset').isVisible()) && (await page.locator('#view-focus').isVisible()) && (await page.locator('.chip[data-mode=side]').isVisible()));
  check('beginner: no numeric table is shown', !(await page.locator('table').first().isVisible().catch(() => false)));
  check('beginner: panel is about 340px wide', await page.evaluate(() => { const w = document.querySelector('#simple-panel').getBoundingClientRect().width / 1.15; return w > 320 && w < 360; }));
  check('beginner: one card per stage with engine, fuel and verdict', (await page.locator('[id^=engine-select-]').count()) === 2 && (await page.locator('[id^=fuel-slider-]').count()) === 2 && (await page.locator('#fly-verdict').count()) === 1);
  check('beginner: the three plain questions are listed', (await page.locator('#fly-checks .check-row').count()) === 3);

  // ---- payload
  const a0 = await snap();
  await setVal('#payload-kg', 300); await page.waitForTimeout(500);
  const a1 = await snap();
  check('payload: more kg makes the rocket heavier', a1.mass > a0.mass + 150, `${a0.mass} -> ${a1.mass} kg`);
  check('payload: the vehicle really carries ~300 kg', Math.abs(a1.payload - 300) < 15, `payload ${a1.payload}`);
  check('payload: more payload lowers the speed budget', a1.dv < a0.dv, `${a0.dv} -> ${a1.dv} m/s`);

  // ---- fuel (keeps tank ratio)
  const f0 = await tankSum('stage2'); const b0 = await snap();
  await setVal('#fuel-slider-stage2', 200); await page.waitForTimeout(500);
  const f1 = await tankSum('stage2'); const b1 = await snap();
  check('fuel: slider doubles the propellant of both tanks', f1.length === 2 && Math.abs(f1[0] / f0[0] - 2) < 0.02 && Math.abs(f1[1] / f0[1] - 2) < 0.02, `${f0.map(Math.round)} -> ${f1.map(Math.round)}`);
  check('fuel: fuel/oxidizer ratio stays the same', Math.abs(f1[0] / f1[1] - f0[0] / f0[1]) < 0.01);
  check('fuel: more fuel changes mass and speed budget', b1.mass > b0.mass + 100 && b1.dv > b0.dv, `mass ${b0.mass} -> ${b1.mass}, dv ${b0.dv} -> ${b1.dv}`);
  check('fuel: label shows kilograms', /kg/.test(await page.locator('#fuel-kg-stage2').innerText()));
  await setVal('#fuel-slider-stage2', 100); await page.waitForTimeout(400);

  // ---- engine dropdown and count
  const eng0 = await page.evaluate(() => window.astraApp.project.vehicle.components.find((c) => c.kind === 'engine' && c.group === 'stage1').catalogId);
  await page.selectOption('#engine-select-stage1', 'eng-al100'); await page.waitForTimeout(500);
  const eng1 = await page.evaluate(() => window.astraApp.project.vehicle.components.find((c) => c.kind === 'engine' && c.group === 'stage1').catalogId);
  check('engine: dropdown swaps the engine', eng0 !== 'eng-al100' && eng1 === 'eng-al100', `${eng0} -> ${eng1}`);
  check('engine: options use friendly names', /engine( for space)? - [\d.]+ kN/.test(await page.locator('#engine-select-stage1 option').first().innerText()));

  // ---- verdict changes
  await page.selectOption('#engine-select-stage1', 'eng-al25s'); await page.waitForTimeout(400);
  const okState = await page.getAttribute('#fly-verdict', 'data-state');
  while (+(await page.locator('#engine-count-stage1').innerText()) > 1) { await page.click('#engine-minus-stage1'); await page.waitForTimeout(250); }
  const bad = await page.getAttribute('#fly-verdict', 'data-state'); const txt = await page.locator('#fly-checks #check-lift').innerText();
  check('verdict: one small engine cannot lift off', bad === 'bad' && /stays on the pad|No/.test(txt) && (await page.getAttribute('#check-lift', 'data-state')) === 'bad', `${okState} -> ${bad}`);
  await page.click('#engine-plus-stage1'); await page.waitForTimeout(250); for (let i = 0; i < 5; i++) { await page.click('#engine-plus-stage1'); await page.waitForTimeout(250); }
  check('verdict: adding engines lets it lift off again', (await page.getAttribute('#check-lift', 'data-state')) === 'ok');

  // ---- what is this? + full editor
  await page.evaluate(() => window.astraApp._scene.onPick('eng1')); await page.waitForTimeout(400);
  check('part click: "What is this?" card appears', (await page.locator('#simple-part').count()) === 1 && /What is this/.test(await page.locator('#simple-part').innerText()));
  await page.click('#simple-edit-part'); await page.waitForTimeout(500);
  check('Edit details opens the full editor with the part selected', (await page.locator('.tree .item.sel').count()) === 1 && (await page.locator('#simple-panel').count()) === 0);
  check('full editor in beginner mode keeps handles/view tools ids', (await page.locator('#view-fit').count()) === 1 && (await page.locator('#handle-length').count()) === 1 && (await page.locator('#back-simple').isVisible()));
  await page.click('#back-simple'); await page.waitForTimeout(400);
  check('Back to simple builder returns to the simple panel', (await page.locator('#simple-panel').count()) === 1);
  await page.click('#open-full-editor'); await page.waitForTimeout(400);
  check('"Open the full editor" shows the component tree', (await page.locator('.tree .item').count()) > 10 && await page.locator('.tree').first().isVisible());
  await page.click('#back-simple'); await page.waitForTimeout(300);

  // ---- buttons
  await page.click('#simple-launch'); await page.waitForTimeout(500);
  check('Launch it opens the simulation screen', await page.evaluate(() => window.astraApp.screenId === 'simulation'));

  // ---- planner
  await nav('planner');
  check('planner: beginner chooser is shown, timeline editor is hidden', (await page.locator('#dest-400').isVisible()) && !(await page.locator('.panel:has-text("Event timeline")').first().isVisible().catch(() => false)));
  await page.click('#dest-400'); await page.waitForTimeout(500);
  check('planner: destination card changes the mission target', await page.evaluate(() => window.astraApp.project.mission.objective.altitude === 400000));
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  check('planner: plain-language steps are listed', (await page.locator('#mission-steps li').count()) >= 5 && /Liftoff/.test(await page.locator('#mission-steps').innerText()));
  await page.click('#dest-100'); await page.waitForTimeout(400);
  check('planner: another card updates it again (no duplicate mission)', await page.evaluate(() => window.astraApp.project.mission.objective.altitude === 100000 && window.astraApp.project.missionList().length === 1));
  await page.click('#planner-launch'); await page.waitForTimeout(400);
  check('planner: Launch it opens the simulation screen', await page.evaluate(() => window.astraApp.screenId === 'simulation'));

  // ---- Standard mode keeps the full editor and planner
  await page.evaluate(() => window.astraApp.setSetting('mode', 'standard')); await page.waitForTimeout(400);
  await nav('designer');
  check('standard: full editor (tree + inspector) is shown, no simple panel', (await page.locator('.tree .item').count()) > 10 && (await page.locator('#simple-panel').count()) === 0);
  await page.click('#add-part'); await page.waitForTimeout(400);
  check('standard: add-part picker uses friendly group names and shows part cards', /Make it go/.test(await page.locator('#ed-picker .ed-chips').innerText()) && (await page.locator('#ed-picker .ed-card').count()) > 5);
  await page.fill('#ed-picker-search', 'solar'); await page.waitForTimeout(700);
  check('standard: picker search finds parts', (await page.locator('#ed-picker .ed-card').count()) > 3);
  await page.evaluate(() => document.querySelector('.modal-back')?.remove());
  await nav('planner');
  check('standard: planner timeline is shown, beginner chooser hidden', !(await page.locator('#dest-400').isVisible()) && (await page.locator('text=Event timeline').first().isVisible()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('script completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\nSimple builder test: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
