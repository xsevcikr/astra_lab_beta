// Browser test: the active vehicle, goal and flight stay consistent; T+0 shows 0 km/h and 0 m (needs Playwright + Chromium).
//   node tests/ui-consistency.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright not installed: skipped'); process.exit(0); } }
let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8177);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`));
const ev = (f, a) => page.evaluate(f, a);
try {
  await page.goto('http://127.0.0.1:8177/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await ev(async () => { const A = window.astraApp; await A.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await A.ask('yes, apply it'); await A.ask('Test it.'); });
  // a probe becomes the active vehicle while the rocket goal is still active
  await ev(async () => { const A = window.astraApp; await A.api.execute('CREATE_VEHICLE', { type: 'probe', mass: 300, name: 'Test probe' }); A.commit('Test: probe'); A.navigate('simulation'); });
  await page.waitForTimeout(900);
  check('mismatch is named in plain words', (await page.locator('[data-need=mission-mismatch]').count()) === 1);
  check('old flight of another vehicle is labelled', (await page.locator('#sim-stale').count()) === 1);
  await page.locator('[data-need=mission-mismatch] .need-fix').click(); await page.waitForTimeout(900);
  check('Fix it makes a goal that suits the probe and the blocker is gone', await ev(() => { const P = window.astraApp.project; return P.vehicle.type === 'probe' && P.mission.objective.type !== 'orbit' || P.mission.guidance?.mode !== 'ascent'; }) && (await page.locator('[data-need=mission-mismatch]').count()) === 0);
  // back to the rocket: its own goal is picked automatically
  await ev(() => { const A = window.astraApp, P = A.project; P.activeVehicle = Object.values(P.vehicles).find((v) => v.type === 'rocket').id; A.commit('Test: select rocket'); });
  await page.waitForTimeout(900);
  check('switching back picks the rocket goal by itself', await ev(() => { const m = window.astraApp.project.mission; return m.guidance?.mode === 'ascent' && m.initial?.type === 'pad'; }));
  check('no stale-flight label for the rocket', (await page.locator('#sim-stale').count()) === 0);
  // T+0 in replay
  await ev(() => window.astraApp.navigate('replay')); await page.waitForTimeout(4000);
  const hud = await ev(() => document.querySelector('#fd-hud')?.innerText ?? '');
  check('Beginner HUD at T+0: speed over ground 0 km/h and height 0 m', /SPEED\s*0\s*km\/h/i.test(hud) && /HEIGHT\s*0\s*m/i.test(hud), JSON.stringify(hud));
  await ev(() => window.astraApp.setSetting('mode', 'advanced')); await page.waitForTimeout(2500);
  const adv = await ev(() => document.querySelector('.hud')?.innerText ?? '');
  check('Advanced HUD at T+0: ground speed 0, inertial speed labelled', /SPEED OVER GROUND\s*0 m\/s/i.test(adv) && /INERTIAL/i.test(adv) && /HEIGHT\s*0 m/i.test(adv), JSON.stringify(adv.slice(0, 120)));
  const body = await ev(() => document.body.innerText);
  check('no scientific notation anywhere on the replay screen', !/\d[eE][+-]\d/.test(body));
  // report card
  await ev(() => { window.astraApp.setSetting('mode', 'beginner'); window.astraApp.navigate('analysis'); }); await page.waitForTimeout(1000);
  check('report card explains its grade', (await page.locator('#fd-grade-why').count()) === 1);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) { check(`script error: ${e.message}`, false); }
await browser.close(); server.close();
const bad = results.filter(([, ok]) => !ok).length; console.log(`\n${results.length - bad} of ${results.length} passed`); process.exit(bad ? 1 : 0);
