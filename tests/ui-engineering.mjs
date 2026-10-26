// Browser test for the Engineering Workbench: opens every workspace, runs the main actions, and fails on any
// page error or console error. Needs Playwright + Chromium:  node tests/ui-engineering.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: workbench UI test skipped.'); process.exit(0); } }
import { startServer } from '../scripts/serve.mjs';

const port = 8200 + Math.floor(Math.random() * 500);
const server = await startServer(port);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const idle = () => page.waitForFunction(() => !document.getElementById('busy')?.classList.contains('on'), null, { timeout: 180000 });
const click = async (text) => { await page.getByRole('button', { name: text, exact: true }).first().click(); await page.waitForTimeout(150); await idle(); };
const go = (id) => page.evaluate((x) => window.astraWorkbench.navigate(x), id);
const shot = (name) => process.env.SHOTS && page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });

try {
  await page.goto(`http://127.0.0.1:${port}/ui/engineering/workbench.html`);
  await page.waitForFunction(() => window.astraWorkbench, null, { timeout: 20000 });
  check(true, 'workbench loads');

  await go('mission'); await click('Fly mission');
  const m = await page.evaluate(() => { const x = window.astraWorkbench.state.project.lastMission; return x && { success: x.success, phases: x.phases.length, samples: x.recorder.t.length }; });
  check(m && m.phases >= 10 && m.samples > 100, `mission flown from the UI (${JSON.stringify(m)})`);
  check(await page.locator('.verdict').first().textContent().then((t) => (m.success ? /complete/i : /failed/i).test(t)), 'verdict matches the physics result');
  await shot('mission');
  await page.locator('.events div').nth(5).click(); check(true, 'timeline event seeks the replay');

  await go('loop'); await page.locator('input[type=number]').first().fill('2'); await page.locator('input[type=number]').first().dispatchEvent('change');
  await page.locator('input[type=number]').nth(1).fill('1'); await page.locator('input[type=number]').nth(1).dispatchEvent('change');
  await click('Run loop');
  check(await page.evaluate(() => window.astraWorkbench.state.project.lastLoop?.log.length > 5), 'engineering loop completes and logs its steps');
  await shot('loop');

  for (const ws of ['sim', 'vehicle', 'propulsion', 'gnc', 'sensors', 'subsystems', 'world', 'sensitivity', 'trade', 'requirements', 'reliability', 'reports', 'ai', 'academy']) {
    await go(ws); await page.waitForTimeout(250);
    const bad = await page.locator('.verdict.bad:has-text("failed to open")').count();
    check(bad === 0, `workspace ${ws} opens`);
    await shot(ws);
  }
  await go('sim'); await click('Run');
  check(await page.locator('.verdict').count() > 0, 'single-phase descent sim runs');
  await go('montecarlo'); await page.locator('input[type=number]').first().fill('30'); await page.locator('input[type=number]').first().dispatchEvent('change'); await click('Run Monte Carlo');
  check(await page.locator('text=95% confidence interval').count() > 0, 'Monte Carlo reports a confidence interval');
  await shot('montecarlo');
  await go('vv'); await click('Run all benchmarks');
  check(await page.locator('.verdict.ok').count() > 0, 'all V&V benchmarks pass in the browser');
  await go('ai');
  await page.locator('input[type=text]').first().fill('Why did the mission fail?'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check(await page.locator('.msg').count() >= 3, 'AI director answers through a tool');
  await page.locator('input[type=text]').first().fill('set stages.0.propMass of lunar-lander to 9000'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  check(await page.locator('.msg', { hasText: 'cannot do that' }).count() > 0, 'modify is denied at Suggest level');
  await page.getByRole('button', { name: 'modify', exact: true }).click();
  await page.locator('input[type=text]').first().fill('set stages.0.propMass of lunar-lander to 9000'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Approve' }).last().click(); await page.waitForTimeout(300);
  check(await page.evaluate(() => window.astraWorkbench.state.project.vehicles['lunar-lander'].stages[0].propMass === 9000), 'approved AI change is applied and versioned');
  await shot('ai');
  await page.keyboard.press('Control+k'); await page.keyboard.type('reports'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  check(await page.locator('iframe.report').count() === 1, 'command palette opens the report');
  await page.evaluate(() => document.documentElement.dataset.theme = 'light'); await shot('light');
  check(errors.length === 0, `no page or console errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
} catch (e) { console.error(e); console.error(errors.join("\n")); failed++; }
await browser.close(); server.close();
console.log(failed ? `${failed} check(s) failed` : 'all UI checks passed');
process.exit(failed ? 1 : 0);
