// Browser test: four detail levels, metric / imperial toggle, Czech language (needs Playwright + Chromium).
//   node tests/ui-levels.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright not installed: skipped'); process.exit(0); } }
let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8176);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep})`));
const ev = (f, a) => page.evaluate(f, a);
const vis = async (sel) => (await page.locator(sel).count()) > 0 && (await page.locator(sel).first().isVisible());
const URL = 'http://127.0.0.1:8176/ui/index.html';
const boot = async () => { await page.goto(URL); await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 }); };
try {
  await boot();
  // ---- the four levels and the migration of the old names
  check('top bar offers exactly the four levels', JSON.stringify(await ev(() => [...document.querySelectorAll('#mode-pick option')].map((o) => o.value))) === JSON.stringify(['beginner', 'student', 'engineer', 'expert']));
  await ev(() => window.astraApp.setSetting('mode', 'standard')); check("legacy 'standard' becomes student", await ev(() => window.astraApp.settings.mode === 'student' && document.body.dataset.mode === 'student'));
  await ev(() => window.astraApp.setSetting('mode', 'advanced')); check("legacy 'advanced' becomes expert", await ev(() => window.astraApp.settings.mode === 'expert' && document.body.dataset.mode === 'expert'));
  await ev(async () => { const A = window.astraApp; A.settings.mode = 'advanced'; A.settings.units = 'imperial'; A.settings.lang = 'cs'; await A.saveSettings(); });
  await boot();
  check('stored legacy mode, units and language are migrated / restored on start', await ev(() => { const s = window.astraApp.settings; return s.mode === 'expert' && s.units === 'imperial' && s.lang === 'cs'; }));
  await ev(async () => { const A = window.astraApp; A.setSetting('lang', 'en'); A.setSetting('units', 'metric'); A.setSetting('mode', 'beginner'); await A.saveSettings(); });

  // ---- a design + one real flight
  await ev(async () => { const A = window.astraApp; await A.ask('Build me a two-stage rocket carrying a 100 kg space probe.'); await A.ask('yes, apply it'); });
  await ev(() => window.astraApp.navigate('designer')); await page.waitForTimeout(600);
  // ---- same flight, identical metrics in all four levels
  const prints = [];
  for (const lvl of ['beginner', 'student', 'engineer', 'expert']) {
    await ev((l) => window.astraApp.setSetting('mode', l), lvl); await page.waitForTimeout(250);
    const fp = await ev(async () => {
      const A = window.astraApp; const r = await A.runFast({ tune: false }); if (!r.ok) return `error ${r.message}`;
      const { runMetrics } = await import('/src/core/run-analysis.js'); const { record, telemetry } = await A.getRun(r.data.runId); const m = runMetrics(record, telemetry);
      return ['status', 'endTime', 'maxAlt', 'maxSpeed', 'maxQ', 'maxG', 'finalPeri', 'finalApo', 'dvIdeal', 'propellantUsed', 'finalMass', 'samples'].map((k) => `${k}=${m[k]}`).join('|');
    });
    prints.push(fp);
  }
  check('the same flight gives identical metrics in Beginner, Student, Engineer and Expert', prints.every((p) => p === prints[0]) && !prints[0].startsWith('error'), prints[0].slice(0, 90));

  // ---- what each level shows on the Designer
  const where = async (lvl) => { await ev((l) => { window.astraApp.setSetting('mode', l); window.astraApp.navigate('designer'); window.astraApp.settings.mode; }, lvl); await page.waitForTimeout(1000); await ev(() => document.querySelector('#show-numbers')?.click()); await page.waitForTimeout(300); };
  await where('beginner');
  check('Beginner: no formulas, no budget table', !(await vis('#lv-formulas')) && !(await vis('#lv-engineer')));
  await where('student');
  const f = await ev(() => document.querySelector('#lv-formulas')?.innerText ?? '');
  check('Student: formulas with the design’s own numbers and units', /Δv = Isp · g₀ · ln\(m₀ \/ m_f\)/.test(f) && /\d s × 9\.807 m\/s²/.test(f) && /kg \/ /.test(f) && /TWR = F \/ \(m · g\)/.test(f) && /v = √\(μ \/ r\)/.test(f) && /m\/s/.test(f), f.replace(/\s+/g, ' ').slice(0, 140));
  check('Student: no engineer tables yet', !(await vis('#lv-engineer')));
  await where('engineer');
  check('Engineer: stage table, delta-v budget and sensitivity', (await vis('#lv-stage-table')) && (await vis('#lv-dv-budget')) && (await vis('#lv-sens-table')));
  const sens = await ev(() => [...document.querySelectorAll('#lv-sens-table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
  check('Engineer: ±10 % rows for Isp, thrust, dry mass, propellant with real Δv numbers', sens.length === 4 && sens.every((r) => /m\/s \(/.test(r)), sens[0]);
  await where('expert');
  check('Expert: editable physics options, each labelled', (await vis('#lv-physics')) && (await page.locator('#lv-physics .lv-param').count()) >= 4);
  await ev(() => { const i = document.querySelector('#phys-recordMax'); i.value = '30000'; i.dispatchEvent(new Event('change')); });
  check('Expert: an edited option is stored in the project', (await ev(() => window.astraApp.project.settings.recordMax)) === 30000);
  await ev(() => { window.astraApp.project.settings.recordMax = 20000; window.astraApp.setSetting('mode', 'beginner'); });
  check('the option stays in the project when the level changes', (await ev(() => window.astraApp.project.settings.recordMax)) === 20000);

  // ---- analysis per level
  await ev(() => { window.astraApp.setSetting('mode', 'student'); window.astraApp.navigate('analysis'); }); await page.waitForTimeout(1400);
  check('Student analysis: formulas with this flight’s numbers', (await vis('#lv-run-formulas')) && /q = ½ · ρ · v²/.test(await ev(() => document.querySelector('#lv-run-formulas').innerText)));
  await ev(() => { window.astraApp.setSetting('mode', 'engineer'); window.astraApp.navigate('analysis'); }); await page.waitForTimeout(1400);
  check('Engineer analysis: delta-v budget table and trajectory plot', (await vis('#lv-run-budget')) && (await vis('#lv-traj')));
  await ev(() => { window.astraApp.setSetting('mode', 'expert'); window.astraApp.navigate('analysis', { tab: 'expert' }); }); await page.waitForTimeout(1400);
  check('Expert analysis: raw telemetry table with CSV and JSON export, Monte Carlo', (await vis('#raw-table')) && (await vis('#raw-csv')) && (await vis('#raw-json')) && (await vis('#mc2-run')));
  const nRows = await page.locator('#raw-table tbody tr').count(); check('raw telemetry shows recorded samples', nRows >= 10);
  // jargon words explain themselves
  await ev(() => { window.astraApp.setSetting('mode', 'beginner'); window.astraApp.navigate('telemetry'); }); await page.waitForTimeout(1200);
  check('Beginner Flight data: jargon word with a tooltip', (await page.locator('.gloss[title]').count()) >= 1);

  // ---- units: metric / imperial toggle in the top bar and Settings; persists; unit shown next to numbers
  await ev(() => window.astraApp.navigate('simulation')); await page.waitForTimeout(900);
  await page.click('#unit-toggle'); await page.waitForTimeout(900);
  check('top bar toggle switches to imperial', await ev(() => window.astraApp.settings.units === 'imperial'));
  const imp = await ev(() => document.querySelector('#screen').innerText);
  check('imperial: result numbers use mi / ft / lb', /\d\s?(mi|ft|lb)\b/.test(imp) && !/\d\s?(km)\b[^)]*\bMax/.test(imp), imp.match(/.{12}\d\s?(mi|ft)\b/)?.[0] ?? '');
  await ev(() => { window.astraApp.setSetting('mode', 'engineer'); window.astraApp.navigate('designer'); }); await page.waitForTimeout(1200);
  const dz = await ev(() => document.querySelector('.analysis-strip').innerText);
  check('imperial: designer masses in lb, speeds in ft/s, no bare kg', /\d\s?lb/.test(dz) && /ft\/s/.test(dz) && !/\d\s?kg\b/.test(dz.replace(/\(\d+ kg to[^)]*\)/g, '')), dz.match(/.{10}\d\s?kg\b.{6}/)?.[0] ?? '');
  await ev(() => window.astraApp.navigate('settings')); await page.waitForTimeout(500);
  check('Settings has the units choice, set to imperial', await ev(() => document.querySelector('#set-units')?.value === 'imperial'));
  await ev(async () => { await window.astraApp.saveSettings(); }); await boot();
  check('units persist after a restart', await ev(() => window.astraApp.settings.units === 'imperial'));
  await ev(() => window.astraApp.setSetting('units', 'metric'));

  // ---- Czech
  await ev(() => { window.astraApp.setSetting('mode', 'beginner'); window.astraApp.setSetting('lang', 'cs'); window.astraApp.navigate('home'); }); await page.waitForTimeout(900);
  check('Czech: navigation and Home are translated', await ev(() => /Domů/i.test(document.querySelector('#nav').innerText) && /Leť ke/.test(document.querySelector('#screen').innerText)));
  check('Czech: the html language attribute is set', await ev(() => document.querySelector('#app').lang === 'cs'));
  await ev(() => window.astraApp.navigate('settings')); await page.waitForTimeout(500);
  check('Settings states that lessons and AI replies are English only', await ev(() => /jen anglicky/.test(document.querySelector('#set-lang-note')?.innerText ?? '')));
  await ev(() => window.astraApp.navigate('challenges')); await page.waitForTimeout(500);
  check('Czech: challenge names are translated', await ev(() => /Dosáhni oběžné dráhy/.test(document.querySelector('#screen').innerText)));
  await ev(() => window.astraApp.navigate('telemetry')); await page.waitForTimeout(1200);
  check('Czech: Flight data card titles are translated', await ev(() => /Nejvyšší bod/.test(document.querySelector('#screen').innerText)));
  await ev(() => window.astraApp.navigate('academy')); await page.waitForTimeout(500);
  check('Czech: Academy tab names are translated', await ev(() => /Lekce/.test(document.querySelector('#screen').innerText) && /Slovník/.test(document.querySelector('#screen').innerText)));
  // untranslated strings fall back to English
  check('English fallback for an untranslated string', await ev(async () => { const { t } = await import('/src/core/i18n.js'); return t('no.such.key', 'Hello') === 'Hello'; }));
  // layout: Czech is longer; nothing overflows horizontally on any level / screen / two window widths
  const overflow = [];
  for (const [w, hgt] of [[1360, 800], [1000, 640]]) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const lvl of ['beginner', 'expert']) for (const scr of ['home', 'designer', 'simulation', 'analysis', 'telemetry', 'settings', 'challenges', 'academy']) {
      await ev(([s, l]) => { window.astraApp.setSetting('mode', l); window.astraApp.navigate(s); }, [scr, lvl]); await page.waitForTimeout(700);
      const bad = await ev(() => {
        const out = []; const top = document.querySelector('#topbar'); if (top.scrollWidth > top.clientWidth + 2) out.push('topbar');
        const nav = document.querySelector('#nav'); if (nav.scrollWidth > nav.clientWidth + 2) out.push('nav');
        for (const b of document.querySelectorAll('#nav .nav-item, #topbar button, #screen .btn')) { if (!b.offsetParent) continue; if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') out.push(`btn:${b.textContent.trim().slice(0, 20)}`); }
        const sc = document.querySelector('#screen'); if (sc.scrollWidth > sc.clientWidth + 4 && !sc.querySelector('.stage, canvas')) out.push('screen');
        return out;
      });
      if (bad.length) overflow.push(`${w}:${lvl}:${scr}:${bad.slice(0, 3).join(',')}`);
    }
  }
  await page.setViewportSize({ width: 1360, height: 800 });
  check('Czech: no horizontal overflow in the shell on any level or window width', overflow.length === 0, overflow.slice(0, 4).join(' | '));
  await ev(async () => { window.astraApp.setSetting('lang', 'en'); await window.astraApp.saveSettings(); });

  // ---- phase 1 follow-ups
  check('chatFromHistory keeps short / understood / question', await ev(() => { const r = window.astraApp.chatFromHistory({ aiHistory: [{ role: 'assistant', text: 'long', short: 'S', understood: { x: 1 }, question: { id: 'q', chips: ['a'] } }] })[0]; return r.short === 'S' && r.understood?.x === 1 && r.question?.id === 'q'; }));
  await ev(async () => { const A = window.astraApp; await A.newProject('Empty'); A.navigate('analysis'); }); await page.waitForTimeout(900);
  check('no flight yet: plain message and a Launch It button', (await page.locator('#no-run-hint').count()) === 1 && /No flight yet - Launch a rocket/.test(await ev(() => document.querySelector('#no-run-hint').innerText)) && (await vis('#launch-it-btn')));
  await page.click('#launch-it-btn'); await page.waitForTimeout(500);
  check('Launch It goes to the Simulation screen', await ev(() => window.astraApp.screenId === 'simulation'));
  check('chart ticks use the shared formatter: no scientific notation below Expert', await ev(async () => {
    const { fmtTick } = await import('/ui/lib/charts.js'); const A = window.astraApp; const out = [];
    for (const l of ['beginner', 'student', 'engineer']) { A.setSetting('mode', l); out.push(...[1.5e7, 2.5e-5, 123456789, 4e-3, 0].map((v) => fmtTick(v))); }
    A.setSetting('mode', 'expert'); const ex = fmtTick(2.5e-5) + fmtTick(5e12);
    return out.every((x) => !/[0-9]e[+-]?\d/.test(x)) && /e/.test(ex);
  }));
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) { check(`script error: ${e.message}`, false); }
await browser.close(); server.close();
const bad = results.filter(([, ok]) => !ok).length; console.log(`\n${results.length - bad} of ${results.length} passed`); process.exit(bad ? 1 : 0);
