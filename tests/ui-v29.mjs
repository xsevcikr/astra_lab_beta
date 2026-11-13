// Browser test of 2.9: requirements traceability view (matrix, all-run history, change impact, CSV / ReqIF exports) and the new
// trajectory exports (OEM XML, binary SPICE SPK, OPM) on the Analysis screen.
//   node tests/ui-v29.mjs      (needs Playwright + Chromium; part of `npm run test:ui`)
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
import { readSpk, coverage } from '../src/core/spk.js';
import { parseEphemeris, parseOPM } from '../src/core/ccsds.js';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8179);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 }, acceptDownloads: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
const ev = (f, a) => page.evaluate(f, a);
const go = async (s, params) => { await ev(([x, p]) => window.astraApp.navigate(x, p), [s, params]); await page.waitForTimeout(700); };
async function download(selector) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(selector)]); const p = await d.path(); const fs = await import('node:fs'); return { name: d.suggestedFilename(), buf: fs.readFileSync(p) }; }
try {
  await page.goto('http://127.0.0.1:8179/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await ev(async () => { const a = window.astraApp; await a.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await a.ask('yes, apply it'); });
  await ev(() => window.astraApp.setSetting('mode', 'engineer'));
  const r1 = await ev(async () => (await window.astraApp.runFast({ tune: false })).ok); check('a first flight is recorded', r1);
  // second flight with a changed stage-1 engine, so there is something for change impact
  await ev(() => { const a = window.astraApp; for (const c of a.project.vehicle.components) if (c.kind === 'engine' && c.group === 'stage1') { c.thrustVac *= 1.05; if (c.thrustSl) c.thrustSl *= 1.05; } a.commit('Test: 5 % more thrust', { silent: true }); });
  const r2 = await ev(async () => (await window.astraApp.runFast({ tune: false })).ok); check('a second flight is recorded', r2);

  await go('requirements');
  await page.click('#req-view-tabs button:has-text("Traceability")'); await page.waitForTimeout(400);
  const nRows = await page.locator('#trace-table tbody tr[data-trace]').count();
  check('traceability matrix lists every requirement', nRows >= 6, `${nRows} rows`);
  check('the mission need heads the matrix', /MN-1/.test(await page.locator('#trace-table tbody tr.trace-need').innerText()));
  check('requirements are allocated to named parts', (await page.locator('#trace-table .trace-chip').count()) >= 5);
  check('coverage summary counts verified requirements', /verified/.test(await page.locator('#trace-summary').innerText()));
  await page.click('#trace-history'); await page.waitForFunction(() => !document.querySelector('#trace-history')?.disabled && document.querySelector('#trace-table th:last-child')?.textContent === 'All runs', null, { timeout: 60000 });
  check('"Check all runs" adds a history column with one dot per run', (await page.locator('#trace-table tbody tr[data-trace="goal"] .pro-dot').count()) === 2);
  const runs = await ev(() => window.astraApp.runList().map((r) => r.id));
  await page.selectOption('#trace-impact-run select, select#trace-impact-run', { index: 1 }).catch(async () => { await page.locator('#trace-impact-run').selectOption({ index: 1 }); });
  await page.waitForSelector('#trace-impact', { timeout: 15000 });
  const imp = await page.locator('#trace-impact').innerText();
  check('change impact names the changed engine and asks to re-check thrust-to-weight', /part changed/.test(imp) && /REQ-TWR/.test(imp), imp.replace(/\s+/g, ' ').slice(0, 160));
  const csv = await download('#trace-csv');
  check('matrix CSV downloads', /traceability\.csv$/.test(csv.name) && csv.buf.toString().startsWith('ID,Parent,Requirement'), csv.name);
  const reqif = await download('#trace-reqif');
  check('ReqIF downloads with one SPEC-OBJECT per requirement plus the need', (reqif.buf.toString().match(/<SPEC-OBJECT /g) ?? []).length === nRows + 1);
  void runs;

  await go('analysis', { tab: 'report' });
  await page.waitForSelector('#exp-spk', { timeout: 15000 });
  const spk = await download('#exp-spk');
  let spkOk = false, spkInfo = '';
  try { const k = readSpk(new Uint8Array(spk.buf)); const c = coverage(k); spkOk = k.segments.length === 1 && k.segments[0].type === 13 && c[0].center === 399 && c[0].stop > c[0].start; spkInfo = `${spk.name} ${spk.buf.length} B, ${(c[0].stop - c[0].start).toFixed(0)} s`; } catch (e) { spkInfo = e.message; }
  check('SPICE SPK export is a valid type 13 kernel centred on the Earth', /\.bsp$/.test(spk.name) && spkOk, spkInfo);
  const oemx = await download('#exp-oem-xml');
  let ox = null; try { ox = parseEphemeris(oemx.buf.toString()); } catch (e) { ox = { err: e.message }; }
  check('OEM XML export reads back', ox?.kind === 'oem-xml' && ox.samples.length > 10, ox?.err ?? `${ox?.samples?.length} states`);
  const opm = await download('#exp-opm');
  let op = null; try { op = parseOPM(opm.buf.toString()); } catch (e) { op = { err: e.message }; }
  check('final-state OPM export reads back with Keplerian elements', !!op?.r && /SEMI_MAJOR_AXIS/.test(opm.buf.toString()), op?.err ?? '');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, `${e.message} (after: ${lastStep})`); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
