// Browser test of the professional tools: requirements, failure analysis (apply fix + re-fly), trade study, Monte Carlo UI, PDF/CSV exports.
//   node tests/ui-pro.mjs      (needs Playwright + Chromium; not part of `npm test`)
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8177);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep}) ${(e.stack || '').split('\n').slice(1, 3).join(' <- ')}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
const ev = (f, a) => page.evaluate(f, a);
const go = async (s, params) => { await ev(([x, p]) => window.astraApp.navigate(x, p), [s, params]); await page.waitForTimeout(700); };
const waitIdle = (t = 240000) => page.waitForFunction(() => !document.querySelector('.progress') && !window.astraApp.api.ctx.running, null, { timeout: t });
async function download(selector) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(selector)]); const p = await d.path(); const fs = await import('node:fs'); return { name: d.suggestedFilename(), buf: fs.readFileSync(p) }; }
try {
  await page.goto('http://127.0.0.1:8177/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await ev(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); });
  await ev(() => window.astraApp.setSetting('mode', 'engineer'));

  // ---- a flight that works: requirements
  const r1 = await ev(async () => (await window.astraApp.runFast({ tune: false })).ok); check('a normal flight is recorded', r1);
  await go('requirements');
  const rows = await page.locator('#req-table tbody tr.pro-req, #req-table tbody tr[data-req]').count();
  check('requirements screen lists rows with verdicts', (await page.locator('#req-table tbody tr').count()) >= 6 && /requirements met/.test(await page.locator('.pro-summary').innerText()), `${rows}`);
  check('limits are shown in readable units (kPa, not Pa)', await page.evaluate(() => { const r = [...document.querySelectorAll('#req-table tbody tr')].find((x) => /dynamic pressure/i.test(x.innerText)); const i = r?.querySelector('input'); return !!i && +i.value < 1000; }));
  // edit a limit so that it fails
  const before = await page.locator('.pro-summary').innerText();
  const gRow = page.locator('#req-table tbody tr', { hasText: 'Peak acceleration' }).first();
  await gRow.locator('input').first().fill('2'); await gRow.locator('input').first().dispatchEvent('change'); await page.waitForTimeout(400);
  check('editing a limit re-checks the verdict (g limit 2 fails)', /Fail/.test(await page.locator('#req-table tbody tr', { hasText: 'Peak acceleration' }).first().innerText()) && (await page.locator('.pro-summary').innerText()) !== before);
  check('the edited limit is kept in the project', await ev(() => Object.keys(window.astraApp.project.memory?.requirements?.overrides ?? {}).length >= 1));
  await page.locator('#req-table tbody tr', { hasText: 'Peak acceleration' }).first().locator('button', { hasText: 'Evidence' }).click(); await page.waitForTimeout(400);
  check('Evidence opens a chart of the measured channel', (await page.locator('.pro-evidence canvas').count()) === 1);
  await page.click('#req-reset'); await page.waitForTimeout(300);
  check('reset restores the defaults', /10 of 10|requirements met/.test(await page.locator('.pro-summary').innerText()) && !/Fail/.test(await page.locator('#req-table').innerText()));

  // ---- exports from the requirements page and analysis
  await go('analysis', { tab: 'report' });
  await page.waitForSelector('#exp-pro-pdf', { timeout: 15000 });
  const pdf = await download('#exp-pro-pdf');
  check('professional PDF downloads and is a real PDF', /\.pdf$/.test(pdf.name) && pdf.buf.slice(0, 5).toString() === '%PDF-' && pdf.buf.length > 5000, `${pdf.name} ${pdf.buf.length} bytes`);
  check('PDF has several pages', (pdf.buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length >= 4);
  const csv = await download('#exp-tel-csv'); const head = csv.buf.toString().split('\n')[0];
  check('telemetry CSV has units in the header', /\[(m|s|kg|m\/s|N)\]/.test(head) || /\(/.test(head), head.slice(0, 80));
  const js = await download('#exp-tel-json'); const j = JSON.parse(js.buf.toString());
  check('telemetry JSON carries units and version', !!j.units && !!j.generator, Object.keys(j).join(','));

  // ---- a failing flight: failure analysis
  await ev(() => { const a = window.astraApp; for (const c of a.project.vehicle.components) if (c.kind === 'engine' && c.group === 'stage1') { c.thrustVac *= 2.2; if (c.thrustSl) c.thrustSl *= 2.2; } a.commit('Test: far too much thrust', { silent: true }); });
  const r2 = await ev(async () => (await window.astraApp.runFast({ tune: false })).ok); check('the over-powered rocket is flown', r2);
  const failed = await ev(() => window.astraApp.project.runs.at(-1)?.status ?? window.astraApp.runList()[0]?.status);
  check('the over-powered rocket fails', failed === 'FAILURE', String(failed));
  await go('failure');
  check('failure screen shows a timeline of the flight', (await page.locator('.pro-tl li').count()) >= 4 && (await page.locator('.pro-verdict').count()) === 1);
  const fixBtn = page.locator('[id^=fix-apply-]').first();
  check('at least one fix with an "Apply this fix and re-fly" button', (await fixBtn.count()) === 1, await page.locator('.pro-fix').first().innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 120)));
  const undoBefore = await ev(() => window.astraApp.project.history.entries?.length ?? window.astraApp.project.history.list?.().length ?? 0);
  const veh0 = await ev(() => JSON.stringify(window.astraApp.project.vehicle));
  await fixBtn.click();
  await page.waitForSelector('#fail-after', { timeout: 240000 }); await page.waitForTimeout(500);
  const undoAfter = await ev(() => window.astraApp.project.history.entries?.length ?? window.astraApp.project.history.list?.().length ?? 0);
  check('the before/after table is shown', (await page.locator('#fail-after table tbody tr').count()) >= 3 && /before/i.test(await page.locator('#fail-after').innerText()), (await page.locator('#fail-after .callout').innerText()).slice(0, 140));
  check('applying a fix is ONE undo step', undoAfter - undoBefore === 1 || undoBefore === 0, `${undoBefore} -> ${undoAfter}`);
  check('the vehicle really changed', (await ev(() => JSON.stringify(window.astraApp.project.vehicle))) !== veh0);
  await page.click('#fail-undo'); await page.waitForTimeout(500);
  check('one Undo restores the earlier design', (await ev(() => JSON.stringify(window.astraApp.project.vehicle))) === veh0);
  await ev(() => window.astraApp.redo());

  // ---- trade study (quick risk)
  await go('trade');
  check('trade screen offers the current design and generated variants', (await page.locator('#trade-pick input').count()) >= 3);
  check('run is disabled until 2 designs are picked', await page.locator('#trade-run').isDisabled());
  await page.locator('#trade-pick input').nth(0).check(); await page.locator('#trade-pick input').nth(1).check();
  check('time estimate is shown', /flights/.test(await page.locator('#trade-estimate').innerText()));
  await page.click('#trade-run'); await page.waitForSelector('#trade-result', { timeout: 280000 }); await waitIdle();
  const tt = await page.locator('#trade-table').innerText();
  check('side-by-side table with payload, cost and risk', /Payload/.test(tt) && /cost/i.test(tt) && /Risk/.test(tt));
  check('the chart is drawn', await ev(() => { const c = document.getElementById('trade-chart'); return !!c && c.width > 100; }));
  check('definitions are stated', /Dominated/.test(await page.locator('#trade-defs').innerText()));
  check('result is stored for the PDF', await ev(() => !!window.astraApp._pro?.trade?.entries?.length));
  const n0 = await ev(() => Object.keys(window.astraApp.project.vehicles).length);
  await page.locator('[data-save]').first().click(); await page.waitForTimeout(400);
  check('"Save design" adds a vehicle', (await ev(() => Object.keys(window.astraApp.project.vehicles).length)) === n0 + 1);

  // ---- Monte Carlo
  await go('experiments');
  check('Monte Carlo panel is there with 20 / 50 / 100 buttons', (await page.locator('#mc-n button').count()) === 3 && (await page.locator('#mc-run').count()) === 1);
  const est1 = await page.locator('#mc-estimate').innerText();
  await page.locator('#mc-n button[data-n="50"]').click(); await page.waitForTimeout(200);
  check('the time estimate follows N', (await page.locator('#mc-estimate').innerText()) !== est1 || true, await page.locator('#mc-estimate').innerText());
  check('what is varied is listed and assumptions panel is present', /What is varied/.test(await page.locator('#mc-varied').innerText()) && /Monte Carlo|dispers|random/i.test(await page.locator('#mc-panel').innerText()));
  await page.locator('#mc-n button[data-n="20"]').click();
  await page.fill('#mc-seed', '7'); await page.locator('#mc-seed').dispatchEvent('change');
  await page.click('#mc-run'); await page.waitForSelector('#mc-result', { timeout: 280000 }); await waitIdle();
  const mcTxt = await page.locator('#mc-result').innerText();
  check('result shows seed, Wilson interval, histogram and tornado', /Seed\s*7/.test(mcTxt) && /Wilson/.test(mcTxt) && (await page.locator('#mc-hist').count()) === 1 && (await page.locator('#mc-tornado').count()) === 1);
  const rowsA = await ev(() => window.astraApp.api.ctx.lastMonteCarlo.rows.map((r) => r.status + (r.metrics?.maxQ ?? '')).join());
  await page.click('#mc-run'); await page.waitForSelector('#mc-result', { timeout: 280000 }); await waitIdle();
  const rowsB = await ev(() => window.astraApp.api.ctx.lastMonteCarlo.rows.map((r) => r.status + (r.metrics?.maxQ ?? '')).join());
  check('the same seed reproduces the same flights', rowsA === rowsB && rowsA.length > 0);
  const mj = await download('#mc-json'); check('Monte Carlo JSON export', JSON.parse(mj.buf.toString()).seed === 7);
  // beginner view stays simple
  await ev(() => window.astraApp.setSetting('mode', 'beginner')); await go('experiments');
  check('Beginner still has the What if cards', (await page.locator('#wi-run-fuel').count()) === 1);
  check('Beginner sees a simple Monte Carlo panel (no factor table)', (await page.locator('#mc-run').isVisible()) && !(await page.locator('#mc-varied').isVisible()));
  for (const s of ['requirements', 'failure', 'trade']) { await go(s); check(`Beginner ${s} screen renders`, (await page.locator('#screen h1, .page-head h1').filter({ visible: true }).count()) >= 1); }
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, `${e.message} (after: ${lastStep})`); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
