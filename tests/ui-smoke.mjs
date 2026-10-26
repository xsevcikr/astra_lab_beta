// Browser-level smoke test of the real user interface (needs Playwright + Chromium; not part of `npm test`).
//   npm install --no-save playwright && npx playwright install chromium && node tests/ui-smoke.mjs
// Opens every screen, runs the mandatory conversation through the chat box, runs a simulation with the Run button,
// plays a replay, opens the analysis and requires zero page errors.
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: UI smoke test skipped.'); process.exit(0); } }

const results = []; const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8127);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:8127/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  check('application starts', true);
  check('default detail level is Beginner', await page.evaluate(() => window.astraApp.settings.mode === 'beginner' && document.body.dataset.mode === 'beginner'));
  check('Beginner sidebar is short', (await page.locator('.nav-item[data-screen]').count()) <= 9);
  await page.evaluate(() => window.astraApp.setSetting('mode', 'advanced')); await page.waitForTimeout(300);
  const screens = ['home', 'designer', 'planner', 'simulation', 'control', 'telemetry', 'replay', 'analysis', 'ai', 'experiments', 'projects', 'settings'];
  for (const id of screens) { await page.click(`.nav-item[data-screen=${id}]`); await page.waitForTimeout(400); const t = await page.evaluate(() => document.querySelector('#screen').innerText.length); check(`screen "${id}" opens (empty project)`, t > 20 && !(await page.locator('#screen .empty-title:has-text("could not be opened")').count())); }
  // mandatory conversation through the chat box
  await page.click('.nav-item[data-screen=ai]');
  const say = async (txt) => { await page.fill('#chat-text', txt); await page.click('#chat-send'); await page.waitForFunction(() => !document.querySelector('#typing') && !document.querySelector('#chat-send').disabled, null, { timeout: 240000 }); await page.waitForTimeout(300); };
  await say('Build me a two-stage rocket carrying a 100 kg space probe.');
  check('AI shows a proposal with Approve / Edit / Cancel', (await page.locator('.plan-foot .btn').count()) === 3);
  await page.click('.plan-foot .btn.primary'); await page.waitForFunction(() => !document.querySelector('#typing'), null, { timeout: 60000 }); await page.waitForTimeout(500);
  check('approved design exists', await page.evaluate(() => !!window.astraApp.project.vehicle && window.astraApp.project.vehicle.components.length > 10));
  await say('Test it.');
  check('"Test it." recorded a real simulation', await page.evaluate(() => window.astraApp.project.runs.length === 1));
  await say('Why did it fail?'); await say('Fix it.');
  // simulation via the Run button
  await page.click('.nav-item[data-screen=simulation]'); await page.waitForTimeout(400);
  await page.click('#run-fast'); await page.waitForFunction(() => !document.querySelector('.progress'), null, { timeout: 180000 }); await page.waitForTimeout(500);
  check('Run button records a second simulation', await page.evaluate(() => window.astraApp.project.runs.length === 2));
  // live mission control
  await page.click('.nav-item[data-screen=control]'); await page.waitForTimeout(400);
  await page.click('#live-start'); await page.selectOption('#live-speed', '50');
  // wait for progress instead of a fixed 9 s: the speed of the live view depends on how fast the computer draws the 3D scene
  await page.waitForFunction(() => window.astraApp.live.sim.t > 30, null, { timeout: 60000 }).catch(() => {});
  check('live simulation advances', await page.evaluate(() => window.astraApp.live.sim.t > 30));
  await page.click('button:has-text("Stop")'); await page.waitForTimeout(800);
  check('stopping a live run records it', await page.evaluate(() => window.astraApp.project.runs.length === 3));
  // replay
  await page.click('.nav-item[data-screen=replay]'); await page.waitForTimeout(1200);
  await page.selectOption('#rp-speed', '25'); await page.click('#rp-play'); await page.waitForTimeout(1500);
  check('replay plays', await page.evaluate(() => window.__replay().t > 5));
  await page.evaluate(() => { window.__replay().pause(); window.__replay().seekFraction(0.5); }); await page.waitForTimeout(300);
  check('replay scrubbing works', await page.evaluate(() => Math.abs(window.__replay().fraction - 0.5) < 0.05));
  // analysis / telemetry / experiments / projects
  await page.click('.nav-item[data-screen=analysis]'); await page.waitForTimeout(800);
  check('analysis shows a verdict', (await page.locator('#screen .badge.status-success, #screen .badge.status-failure, #screen .badge.status-aborted').count()) > 0);
  await page.click('.nav-item[data-screen=telemetry]'); await page.waitForTimeout(800);
  check('telemetry draws graphs', (await page.locator('canvas.chart').count()) >= 3);
  // ---- mouse editing in the Vehicle Designer (handles on the selected part)
  await page.click('.nav-item[data-screen=designer]'); await page.waitForTimeout(1200);
  const tankId = await page.evaluate(() => window.astraApp.project.vehicle.components.find((c) => c.kind === 'fuel_tank').id);
  await page.click(`.tree .item[data-id="${tankId}"]`); await page.click('.chip[data-mode=side]'); await page.waitForTimeout(600);
  const tank = () => page.evaluate((id) => { const v = window.astraApp.project.vehicle; const c = v.components.find((x) => x.id === id); return { length: c.length, dia: c.diameter, idx: v.components.findIndex((x) => x.id === id) }; }, tankId);
  const centre = async (sel) => { const b = await (await page.$(sel)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const t0 = await tank();
  const hl = await centre('#handle-length'); await page.mouse.move(hl.x, hl.y); await page.mouse.down(); await page.mouse.move(hl.x, hl.y - 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
  const t1 = await tank();
  check('designer: length handle stretches the tank', t1.length > t0.length + 0.5, `${t0.length.toFixed(2)} -> ${t1.length.toFixed(2)} m`);
  await page.evaluate(() => window.astraApp.undo()); await page.waitForTimeout(300);
  check('designer: one undo restores the drag edit', Math.abs((await tank()).length - t0.length) < 1e-6);
  const mid = await page.evaluate((id) => { const sc = window.astraApp._scene; const { computeLayout } = window.__astraLayout ?? {}; const m = sc.model.layout.placements.get(id); const p = sc.projectDesign([m.x0 + 0.15 * (m.x1 - m.x0), 0, 0]); const r = sc.canvas.getBoundingClientRect(); const k = r.width / sc.canvas.offsetWidth; return { x: r.left + p.x * k, y: r.top + p.y * k }; }, tankId);
  const hl2 = await centre('#handle-length');
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.move(mid.x, mid.y - 30, { steps: 8 }); await page.mouse.move(mid.x, mid.y - 90, { steps: 8 }); await page.mouse.move(mid.x, mid.y - 200, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400);
  check('designer: dragging the part reorders it inside its stage', (await tank()).idx !== t0.idx, `index ${t0.idx} -> ${(await tank()).idx}`);
  // ---- Designer view tools
  await page.click('.nav-item[data-screen=designer]'); await page.waitForTimeout(800);
  const camz = () => page.evaluate(() => { const c = window.astraApp._scene.cam; return { z: c.zoom, px: c.panX, py: c.panY }; });
  await page.click('#view-in'); await page.click('#view-in'); const z1 = await camz(); await page.click('#view-fit'); const z2 = await camz();
  check('designer: Fit rocket resets the zoom', z2.z > z1.z && z2.px === 0 && z2.py === 0, `${z1.z.toFixed(2)} -> ${z2.z.toFixed(2)}`);
  await page.click(`.tree .item[data-id="${tankId}"]`); await page.click('#view-focus'); const z3 = await camz();
  check('designer: Focus part moves the camera to the part', z3.z < z2.z && Math.abs(z3.py) > 0.01, `zoom ${z3.z.toFixed(2)} pan ${z3.py.toFixed(1)}`);
  await page.click('#view-reset');
  // wheel over a side panel scrolls the panel, not the 3D view
  const zBefore = (await camz()).z; const lb = await (await page.$('.split > .side.left')).boundingBox();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(200);
  check('scrolling: wheel over the parts list scrolls the list and does not zoom the 3D view', (await page.evaluate(() => document.querySelector('.split > .side.left').scrollTop)) > 0 && Math.abs((await camz()).z - zBefore) < 1e-9);
  const cb = await (await page.$('.gl-canvas')).boundingBox(); await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 3); await page.mouse.wheel(0, -300); await page.waitForTimeout(200);
  check('scrolling: wheel over the 3D view zooms it', Math.abs((await camz()).z - zBefore) > 0.01);
  await page.click('#view-reset');
  check('designer: inspector explains the selected part', (await page.locator('#learn-part').count()) === 1);
  // ---- Beginner mode
  await page.evaluate(() => window.astraApp.setSetting('mode', 'beginner')); await page.waitForTimeout(400);
  await page.click('.nav-item[data-screen=analysis]'); await page.waitForTimeout(900);
  check('beginner: analysis starts with a plain-language answer', (await page.locator('#why-btn').isVisible()) && !(await page.locator('#screen .tabs').first().isVisible().catch(() => false)));
  await page.click('.nav-item[data-screen=designer]'); await page.waitForTimeout(600);
  check('beginner: designer hides the numeric tables', !(await page.locator('.analysis-strip table').first().isVisible().catch(() => false)));
  // ---- Aerospace Academy
  await page.click('.nav-item[data-screen=academy]'); await page.waitForSelector('.level-card');
  check('academy: 11 levels are shown', (await page.locator('.level-card').count()) === 11);
  await page.click('[data-lesson="L3-2"]'); await page.waitForSelector('.lesson .quiz-opt');
  check('academy: a lesson has definition, quiz and lab', (await page.locator('.quiz-q').count()) === 3 && (await page.locator('.lab').count()) === 1);
  for (let i = 0; i < 3; i++) { const q = page.locator('.quiz-q').nth(i); await q.locator('.quiz-opt').first().click(); }
  await page.waitForTimeout(200);
  check('academy: finishing the quiz is recorded', await page.evaluate(() => !!window.astraApp.settings.academy.quiz['L3-2']));
  await page.evaluate(() => window.astraApp.navigate('academy', { view: 'parts' })); await page.waitForSelector('.part-card');
  check('academy: parts guide lists every component kind', (await page.locator('.part-card').count()) >= 29);
  await page.click('.part-card[data-kind=engine]'); await page.waitForSelector('.lesson');
  check('academy: engine page opens', (await page.locator('h1').first().innerText()).toLowerCase().includes('engine'));
  await page.evaluate(() => window.astraApp.setSetting('mode', 'advanced')); await page.waitForTimeout(300);
  await page.click('.nav-item[data-screen=projects]'); await page.click('#proj-save'); await page.waitForTimeout(1200);
  check('project saved', await page.evaluate(() => window.astraApp.saveState === 'saved'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('script completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\nUI smoke test: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
