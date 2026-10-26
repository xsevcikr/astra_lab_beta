// Browser test of Design history, Academy "Try this now" (every lesson), glossary tooltips, Pro challenges and Teacher mode (needs Playwright + Chromium).
//   node tests/ui-teach.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright')); } catch { console.log('Playwright is not installed: skipped'); process.exit(0); } }

let lastStep = 'start'; const results = []; const check = (name, ok, extra = '') => { lastStep = name; results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };
const server = await startServer(8178);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(`${e.message} (after: ${lastStep}) ${(e.stack || '').split('\n').slice(1, 3).join(' <- ')}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.text()} (after: ${lastStep})`); });
const go = (id, params = {}) => page.evaluate(([i, p]) => window.astraApp.navigate(i, p), [id, params]);
const readJson = async (dl) => JSON.parse(await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8'));
try {
  await page.goto('http://127.0.0.1:8178/ui/index.html');
  await page.waitForFunction(() => window.astraApp && document.querySelector('#app:not([hidden])'), null, { timeout: 30000 });
  await page.evaluate(() => { window.astraApp.setSetting('mode', 'expert'); });

  // ------------------------------------------------------------------ design history
  await page.evaluate(async () => {
    const { TEMPLATE_BY_ID } = await import('/data/templates.js'); const app = window.astraApp;
    await TEMPLATE_BY_ID['small-launcher'].build(app); app.commit('Added small launcher');
    await app.api.execute('MODIFY_STAGE', { stage: 'stage2', propellantScale: 0.5 }); app.commit('Half tank in stage 2');
    await app.api.execute('MODIFY_STAGE', { stage: 'stage2', propellantScale: 1.6 }); app.commit('Bigger tank in stage 2');
    app.commit('No change at all');
  });
  const nVers = await page.evaluate(() => window.astraApp.project.history.list().length);
  await go('history'); await page.waitForSelector('#hist-table');
  check('History: one row per committed change, an unchanged commit adds no row', (await page.locator('#hist-table tbody tr').count()) === nVers && !(await page.locator('#hist-table').innerText()).includes('No change at all'), `${nVers} rows`);
  check('History: rows show mass, delta-v and thrust numbers and a change summary', /\d[\d,]* kg/.test(await page.locator('#hist-table tbody tr').first().innerText()) && /edited|part/.test(await page.locator('#hist-table').innerText()));
  const rows = await page.locator('#hist-table tbody tr').evaluateAll((trs) => trs.map((t) => Number(t.dataset.v)));
  const [vNew, vMid] = [rows[0], rows[1]];
  await page.check(`#hist-cmp-${vNew}`); await page.check(`#hist-cmp-${vMid}`);
  await page.waitForSelector('#hist-diff');
  check('History: comparing two versions shows number changes and edited parts', /Total mass/.test(await page.locator('#hist-diff').innerText()) && /Edited \([1-9]\)/.test(await page.locator('#hist-diff').innerText()) && /propellantMass/.test(await page.locator('#hist-diff').innerText()));
  const massBefore = await page.evaluate(() => window.astraApp.project.vehicle.components.filter((c) => c.kind === 'fuel_tank').map((c) => c.propellantMass).join());
  page.once('dialog', () => {}); await page.click(`#hist-restore-${vMid}`); await page.waitForTimeout(300);
  const massAfter = await page.evaluate(() => window.astraApp.project.vehicle.components.filter((c) => c.kind === 'fuel_tank').map((c) => c.propellantMass).join());
  check('History: restoring an older version changes the design and adds a NEW version (nothing deleted)', massAfter !== massBefore && (await page.evaluate(() => window.astraApp.project.history.list().length)) === nVers + 1);
  await page.evaluate(() => window.astraApp.undo()); await page.waitForTimeout(200);
  check('History: the restore can be undone', (await page.evaluate(() => window.astraApp.project.vehicle.components.filter((c) => c.kind === 'fuel_tank').map((c) => c.propellantMass).join())) === massBefore);
  await page.click('#hist-name-now'); await page.fill('.modal input', 'Good rocket'); await page.click('.modal-foot .btn.primary'); await page.waitForTimeout(300);
  check('History: a version can be named', /Good rocket/.test(await page.locator('#hist-table').innerText()));
  await page.evaluate(() => { for (let i = 0; i < 230; i++) { window.astraApp.project.vehicle.name = `Rocket ${i}`; window.astraApp.commit(`Rename ${i}`, { silent: true }); } });
  check('History: the list stays capped and the named version survives', await page.evaluate(() => { const l = window.astraApp.project.history.list(); return l.length <= 201 && l.some((e) => e.name === 'Good rocket'); }));
  await go('projects'); await page.waitForSelector('#proj-history');
  check('Projects links to the design history', true);

  // ------------------------------------------------------------------ academy: every lesson has a working "Try this now"
  const lessons = await page.evaluate(async () => { const { allLessons } = await import('/data/academy/index.js'); return allLessons().map((l) => l.id); });
  await page.evaluate(async () => { const app = window.astraApp; await app.newProject('Lesson links'); });
  let bad = [];
  for (const id of lessons) {
    await go('academy', { lesson: id }); await page.waitForSelector('#try-now', { timeout: 8000 }).catch(() => {});
    if (!(await page.locator('#try-now').count())) { bad.push(`${id}: no button`); continue; }
    const want = await page.evaluate(async (i) => (await import('/data/academy/tryit.js')).TRY_NOW[i].go, id);
    const nErr = errors.length;
    await page.click('#try-now');
    await page.waitForFunction((w) => window.astraApp.screenId === w, want, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(450);
    const state = await page.evaluate(() => ({ s: window.astraApp.screenId, boom: !!document.querySelector('#screen .empty .empty-title')?.textContent.match(/could not be opened/), v: !!window.astraApp.project.vehicle }));
    if (state.s !== want || state.boom || errors.length > nErr || (id !== 'L11-4' && !state.v)) bad.push(`${id}: ${JSON.stringify(state)} ${errors.slice(nErr).join('|').slice(0, 160)}`);
  }
  check(`Academy: all ${lessons.length} lessons have a Try this now button whose setup opens the right screen without errors`, bad.length === 0 && lessons.length >= 40, bad.slice(0, 4).join(' ;; '));
  await go('academy', { lesson: 'L3-2' }); await page.waitForSelector('#try-now');
  check('Academy: lesson text carries dotted glossary tooltips', (await page.locator('.lesson .gloss').count()) >= 1);

  // ------------------------------------------------------------------ glossary decorateTerms
  const gl = await page.evaluate(async () => {
    const { decorateTerms } = await import('/ui/lib/glossary.js');
    const root = document.createElement('div'); document.body.append(root);
    root.innerHTML = '<p>The delta-v of the rocket and its thrust, with Isp.</p><code>delta-v in code</code><input value="delta-v"><textarea>apogee</textarea><button>apogee</button><a href="#">perigee link</a><p>Another delta-v here.</p>';
    const n1 = decorateTerms(root); const c1 = root.querySelectorAll('.gloss').length; const html1 = root.innerHTML;
    const n2 = decorateTerms(root); const html2 = root.innerHTML;
    const code = root.querySelector('code').innerHTML, inp = root.querySelector('input').outerHTML, btn = root.querySelector('button').innerHTML;
    const t0 = performance.now(); for (let i = 0; i < 200; i++) decorateTerms(root); const ms = performance.now() - t0;
    root.remove();
    return { n1, c1, n2, same: html1 === html2, code, inp, btn, ms, dv: [...root.querySelectorAll('.gloss')].filter((e) => e.dataset.term === 'delta-v').length };
  });
  check('Glossary: decorateTerms marks known terms, once per term', gl.n1 >= 2 && gl.dv === 1, JSON.stringify({ n1: gl.n1, dv: gl.dv }));
  check('Glossary: decorateTerms skips code, inputs, buttons and links', !gl.code.includes('gloss') && !gl.inp.includes('gloss') && !gl.btn.includes('gloss'));
  check('Glossary: decorateTerms is idempotent and cheap when nothing changed', gl.n2 === 0 && gl.same && gl.ms < 100, `${gl.ms.toFixed(1)} ms for 200 repeat calls`);
  await go('ai', { prefill: 'What is delta-v?', send: true });
  const aiOk = await page.waitForFunction(() => document.querySelector('.msg.assistant .gloss'), null, { timeout: 40000 }).then(() => true, () => false);
  check('Glossary: AI replies get dotted tooltips', aiOk);

  // ------------------------------------------------------------------ pro challenges
  await go('challenges'); await page.waitForSelector('.ch-card');
  check('Challenges: the 16 core cards are still there and 8 Pro missions are listed after them', (await page.locator('.ch-card').count()) === 16 && (await page.locator('.chp-card').count()) === 8);
  const tiers = await page.locator('.chp-card .ch-diff').allInnerTexts();
  check('Challenges: tiers are labelled Hard and Pro and sorted by difficulty', tiers.every((t) => /hard|pro/i.test(t)) && tiers.map((t) => t.toLowerCase()).indexOf('pro') > tiers.map((t) => t.toLowerCase()).lastIndexOf('hard'), tiers.join(','));
  check('Challenges: unavailable items are explained (no faked booster landing)', /booster/i.test(await page.locator('#chp-unavail').innerText()) || (await page.click('#chp-unavail summary'), /booster/i.test(await page.locator('#chp-unavail').innerText())));
  await page.click('[data-challenge=mars-transfer-budget]');
  check('Challenges: the Mars challenge says it is a budget check, not a landing', /does not land on Mars/.test(await page.locator('.page-head').innerText()) && (await page.locator('#ch-check').innerText()) === 'Check my design');
  await page.click('#ch-check'); await page.waitForSelector('#ch-result .ch-row');
  check('Challenges: a design challenge is judged from the design (no flight needed)', /rocket equation/.test(await page.locator('#ch-result').innerText()));
  // a real lander run for the Moon-landing challenge
  await page.evaluate(async () => { const { TEMPLATE_BY_ID } = await import('/data/templates.js'); const app = window.astraApp; await TEMPLATE_BY_ID['moon-lander'].build(app); app.commit('lander'); });
  await go('challenges', { id: 'moon-soft-landing' }); await page.waitForSelector('#ch-setup'); await page.click('#ch-setup'); await page.waitForTimeout(500);
  await page.evaluate(async () => { const app = window.astraApp; app.stopLive(); app.api.ctx.stopRequested = true; });
  await page.waitForFunction(() => !window.astraApp.api.ctx.running, null, { timeout: 60000 });
  await page.evaluate(async () => { const r = await window.astraApp.api.execute('RUN_SIMULATION', { name: 'land' }); if (!r.ok) throw new Error(r.message); });
  await go('challenges', { id: 'moon-soft-landing' }); await page.click('#ch-check'); await page.waitForSelector('#ch-stars', { timeout: 20000 });
  check('Challenges: a real Moon landing run is judged on touchdown speed', (await page.evaluate(() => window.astraApp.settings.challenges['moon-soft-landing']?.stars)) >= 1 && /m\/s/.test(await page.locator('#ch-result').innerText()));
  check('Challenges: a passed challenge stores attempts and a hashed proof', await page.evaluate(() => { const s = window.astraApp.settings.challenges['moon-soft-landing']; return s.attempts === 1 && /^[0-9a-f]{64}$/.test(s.proof?.hash ?? ''); }));

  // ------------------------------------------------------------------ teacher mode
  await go('teacher'); await page.waitForSelector('#teacher-toggle');
  check('Teacher: tools are off until "I am a teacher" is switched on', (await page.locator('#tch-make').count()) === 0);
  await page.check('#teacher-toggle'); await page.waitForSelector('#tch-make');
  await page.click('#tch-make'); check('Teacher: an assignment needs a title and a challenge', /title/i.test(await page.locator('#tch-error').innerText()));
  await page.fill('#tch-title', 'Moon week'); await page.fill('#tch-due', '2026-12-20'); await page.fill('#tch-notes', 'Land softly.');
  await page.check('[data-pick=moon-soft-landing]'); await page.check('[data-pick=reach-orbit]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tch-make')]);
  const asg = await readJson(dl);
  check('Teacher: the assignment file is JSON with the picked challenges', asg.schema === 'astra.assignment/1' && asg.challenges.length === 2 && asg.title === 'Moon week' && asg.check.length === 64);
  check('Teacher: the one-line offline explanation is shown', /everything stays in files/i.test(await page.locator('#tch-honest').innerText()) && /not cheat-proof/i.test(await page.locator('#tch-honest').innerText()));
  // student side: import the assignment
  await go('challenges');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#ch-import')]);
  await fc.setFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(asg)) }); await page.waitForSelector('#ch-assignments');
  check('Student: the imported assignment appears in Challenges with its due date', /Moon week/.test(await page.locator('#ch-assignments').innerText()) && /2026-12-20/.test(await page.locator('#ch-assignments').innerText()));
  await page.evaluate(() => { window.astraApp.settings.studentName = 'Eva'; });
  await page.click('[data-export-report]'); await page.waitForSelector('#tch-report');
  check('Student: the report shows stars, tries and the measured numbers', /Moon landing/.test(await page.locator('#tch-report').innerText()) && /#[0-9a-f]{10}/.test(await page.locator('#tch-report').innerText()));
  const [rdl] = await Promise.all([page.waitForEvent('download'), page.click('.modal-foot .btn.primary')]);
  const rep = await readJson(rdl);
  check('Student: the exported report is JSON with a proof hash per solved challenge', rep.schema === 'astra.report/1' && rep.student === 'Eva' && rep.entries.find((e) => e.challengeId === 'moon-soft-landing')?.proof?.hash?.length === 64 && rep.entries.find((e) => e.challengeId === 'reach-orbit').stars === 0);
  await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelector('.modal-back')?.remove());
  // teacher side: class table with an honest student, a student with unproven stars
  const cheat = JSON.parse(JSON.stringify(rep)); cheat.student = 'Tom'; cheat.entries[1].stars = 3; delete cheat.hash;
  await page.evaluate(async (c) => { const { hashOf } = await import('/src/core/teacher.js'); c.hash = hashOf(c); window.__cheat = c; }, cheat);
  const cheatFixed = await page.evaluate(() => window.__cheat);
  await go('teacher'); await page.waitForSelector('#tch-add');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#tch-add')]);
  await fc2.setFiles([{ name: 'eva.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rep)) }, { name: 'tom.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cheatFixed)) }]);
  await page.waitForSelector('#tch-table');
  const trs = await page.locator('#tch-table tbody tr').allInnerTexts();
  check('Teacher: the class table lists both students with their stars', trs.length === 2 && /Eva/.test(trs[0]) && /Tom/.test(trs[1]));
  check('Teacher: a result without a matching proof is flagged, a proven one is ticked', /\(ok\)/.test(trs[0]) && /\(check\)/.test(trs[1]));
  const [cdl] = await Promise.all([page.waitForEvent('download'), page.click('#tch-csv')]);
  const csv = await (await import('node:fs')).promises.readFile(await cdl.path(), 'utf8');
  check('Teacher: the class table exports as CSV', csv.split('\n')[0].startsWith('Student,') && csv.includes('Eva') && csv.includes('Tom'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) { check('test run completed', false, e.message); }
await browser.close(); server.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
