// Challenges: missions for students. Pick a challenge, read its lesson, set up the mission, launch, then "Check my result" judges the
// LATEST recorded run with the real run metrics (src/core/challenges.js). Stars are saved in app.settings.challenges.
import { t } from '../../src/core/i18n.js';
import { h, clear, toast, promptDialog, modal } from '../lib/dom.js';
import { panel, emptyState } from '../lib/widgets.js';
import { CHALLENGES, PRO_CHALLENGES, UNAVAILABLE, DIFFICULTY_NAMES, challengeById, setupChallenge, evaluate, evaluateDesign, vehicleProblem, payloadOf, totalStars, maxStars, proStars, maxProStars, runMatches } from '../../src/core/challenges.js';
import { parseAssignment, makeProof, buildReport, exportReport, reportCsv, daysLeft } from '../../src/core/teacher.js';
import { pickFile, saveFile } from '../lib/widgets.js';
import { reportView } from './teacher.js';
import { decorateTerms } from '../lib/glossary.js';
import { findLesson } from '../../data/academy/index.js';
import { icon, starsEl } from '../lib/icons.js';

const starText = (n) => `${n}/3`;
const DIFF = DIFFICULTY_NAMES;
const DEFAULT_BUILD = 'Build me a two-stage rocket carrying a 100 kg space probe.';

export default {
  id: 'challenges', title: 'Challenges',
  mount(root, app, params = {}) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = { id: params.id ?? null, evalResult: null, busy: false };
    const saved = () => (app.settings.challenges ??= {});
    const unsub = [];

    // ---------------------------------------------------------------- list
    function list() {
      clear(page);
      const tot = totalStars(saved());
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, t('nav.challenges.full', 'Challenges')), h('p', null, t('chal.intro', 'Small missions. Earn up to 3 stars.'))),
        h('div', { class: 'stat', id: 'ch-total' }, h('div', { class: 'stat-l' }, t('chal.stars', 'Your stars')), h('div', { class: 'stat-v' }, icon('star', { size: 22 }), ` ${tot} / ${maxStars}`), h('div', { class: 'stat-s' }, t('chal.done', '{n} of {m} challenges done', { n: CHALLENGES.filter((c) => (saved()[c.id]?.stars ?? 0) > 0).length, m: CHALLENGES.length })))));
      page.append(h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'ch-import', title: 'Your teacher gave you an assignment file', onclick: importAssignment }, 'Import assignment')));
      if ((app.settings.assignments ?? []).length) page.append(assignmentBanner());
      page.append(h('div', { class: 'ch-grid' }, CHALLENGES.map((c) => {
        const st = saved()[c.id]?.stars ?? 0;
        return h('button', { class: `ch-card ${st ? 'done' : ''}`, 'data-challenge': c.id, onclick: () => open(c.id) },
          h('div', { class: 'ch-top' }, h('span', { class: `ch-diff d${c.difficulty}` }, t(`chal.diff.${c.difficulty}`, DIFF[c.difficulty])), h('span', { class: 'ch-stars', title: `${st} of 3 stars` }, starsEl(st))),
          h('div', { class: 'ch-title' }, t(`chal.${c.id}`, c.title)), h('div', { class: 'ch-story std-only' }, t(`chal.${c.id}.story`, c.story)));
      })));
      listExtras();
      decorateTerms(page);
    }

    // ---- Pro missions, assignments from a teacher, and the honest list of what is not available
    function card(c, cls) {
      const st = saved()[c.id]?.stars ?? 0;
      return h('button', { class: `${cls} ${st ? 'done' : ''}`, 'data-challenge': c.id, onclick: () => open(c.id) },
        h('div', { class: 'ch-top' }, h('span', { class: `ch-diff d${c.difficulty}` }, DIFF[c.difficulty]), h('span', { class: 'ch-stars', title: `${st} of 3 stars` }, starsEl(st))),
        h('div', { class: 'ch-title' }, c.title), h('div', { class: 'ch-story std-only' }, c.story));
    }
    function listExtras() {
      page.append(h('div', { class: 'chp-sec' }, h('h2', null, 'Pro missions'), h('span', { class: 'muted' }, `Hard. Stars: ${proStars(saved())} / ${maxProStars}`)));
      page.append(h('div', { class: 'ch-grid', id: 'chp-grid' }, PRO_CHALLENGES.slice().sort((a, b) => a.difficulty - b.difficulty).map((c) => card(c, 'chp-card'))));
      page.append(h('details', { class: 'chp-unavail', id: 'chp-unavail' }, h('summary', null, 'Not available yet (and why)'),
        UNAVAILABLE.map((u) => h('p', null, h('b', null, `${u.title}: `), u.why))));
    }
    function assignmentBanner() {
      const list = app.settings.assignments ?? [];
      const box = h('div', { class: 'col', id: 'ch-assignments' });
      for (const a of list) {
        const left = daysLeft(a);
        const done = a.challenges.filter((id) => (saved()[id]?.stars ?? 0) > 0).length;
        box.append(h('div', { class: 'callout info', 'data-assignment': a.id, style: { margin: 0 } },
          h('div', { class: 'row' }, h('b', { class: 'grow' }, `Assignment: ${a.title}`), a.due ? h('span', { class: left < 0 ? 'bad' : 'muted' }, left < 0 ? `Late (due ${a.due})` : `Due ${a.due} (${left} day${left === 1 ? '' : 's'})`) : null),
          a.teacher ? h('div', { class: 'muted' }, `From ${a.teacher}`) : null, a.notes ? h('div', null, a.notes) : null,
          h('div', { class: 'row', style: { marginTop: '6px' } }, a.challenges.map((id) => { const c = challengeById(id); return h('button', { class: 'chip', 'data-ac': id, onclick: () => open(id) }, `${(saved()[id]?.stars ?? 0) ? 'Done: ' : ''}${c?.title ?? id}`); })),
          h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'muted grow' }, `${done} of ${a.challenges.length} done`),
            h('button', { class: 'btn small primary', 'data-export-report': a.id, onclick: () => exportMyReport(a) }, 'Export my report'),
            h('button', { class: 'btn small danger', title: 'Remove this assignment from your list (your stars stay)', onclick: () => { app.settings.assignments = (app.settings.assignments ?? []).filter((x) => x.id !== a.id); app.saveSettings(); list_(); } }, icon('cross', { size: 14 })))));
      }
      return box;
    }
    const list_ = () => list();
    async function importAssignment() {
      const f = await pickFile('.json'); if (!f) return;
      const r = parseAssignment(f.text);
      if (!r.ok) return toast(r.error, 'bad', 7000);
      const mine = (app.settings.assignments ??= []).filter((x) => x.id !== r.assignment.id); mine.push(r.assignment); app.settings.assignments = mine; app.saveSettings();
      toast(r.warnings.length ? `Assignment added. Note: ${r.warnings.join(' ')}` : `Assignment added: ${r.assignment.title}`, r.warnings.length ? 'info' : 'ok', 7000);
      S.id = null; list();
    }
    async function exportMyReport(a) {
      if (!app.settings.studentName) { const n = await promptDialog('Your name', 'Name for the teacher', ''); if (!n) return; app.settings.studentName = n.slice(0, 60); app.saveSettings(); }
      const rep = buildReport({ student: app.settings.studentName, assignment: a, saved: saved() });
      const base = `${rep.student.replace(/[^\w.-]+/g, '_')}-${a.title.replace(/[^\w.-]+/g, '_')}`;
      modal({ title: 'My report for the teacher', wide: true, body: h('div', { class: 'col' }, reportView(rep)), buttons: [
        { label: 'Close' }, { label: 'Print', onClick: () => { window.print(); return false; } }, { label: 'Save CSV', onClick: () => { saveFile(app, `${base}.csv`, reportCsv(rep), 'text/csv'); return false; } },
        { label: 'Save report file (JSON)', primary: true, onClick: () => { saveFile(app, `${base}.astra-report.json`, exportReport(rep), 'application/json'); return false; } }] });
    }
    function designSteps(c, lesson) {
      return panel('How to do it', h('div', { class: 'col' },
        step(1, 'Read the lesson', lesson ? lesson.title : 'Open the Academy.', h('button', { class: 'btn', id: 'ch-lesson', onclick: () => app.navigate('academy', { lesson: c.lesson }) }, 'Read the lesson')),
        step(2, 'Build your rocket', 'No flight needed.', h('button', { class: 'btn', id: 'ch-setup', onclick: () => (vehicleProblem(c, app.project.vehicle) ? (app.challengePending = c.id, app.navigate('ai', { prefill: 'Build me a three-stage rocket with a hydrogen upper stage.', send: true })) : app.navigate('designer')) }, vehicleProblem(c, app.project.vehicle) ? 'Build a rocket (AI)' : 'Open the rocket builder')),
        step(3, 'Check my design', 'Compares your speed budget with the goal.', h('button', { class: 'btn primary', id: 'ch-check', disabled: S.busy, onclick: () => check(c) }, 'Check my design'))));
    }
    const setupText = (c) => (c.setup.kind === 'landing' ? 'Creates the mission: land on the Moon from a low orbit.' : `Creates the mission: launch to a ${c.setup.altitude / 1000} km orbit${c.setup.site ? ' from the high-latitude site' : ''}${c.setup.inclination ? ` (tilt ${c.setup.inclination}°)` : ''}.`);

    // ---------------------------------------------------------------- detail
    function missionReady(c) { const m = app.project.mission; return !!m && runMatches(c, { mission: m }).ok; }
    function open(id) { S.id = id; S.evalResult = null; detail(); }
    function detail() {
      const c = challengeById(S.id); if (!c) return list();
      clear(page);
      const P = app.project, hasVehicle = !!P.vehicle && !vehicleProblem(c, P.vehicle), ready = hasVehicle && missionReady(c);
      const lesson = findLesson?.(c.lesson);
      const best = saved()[c.id];
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('button', { class: 'btn small', id: 'ch-back', onclick: () => { S.id = null; list(); } }, t('chal.all', 'All challenges')), h('h1', { style: { marginTop: '8px' } }, c.title), h('p', null, c.story)),
        h('div', { class: 'stat' }, h('div', { class: 'stat-l' }, 'Best result'), h('div', { class: 'stat-v' }, starsEl(best?.stars ?? 0, 3, 22)), h('div', { class: 'stat-s' }, `${DIFF[c.difficulty]} challenge`))));
      const goalsPanel = panel('Your goals', h('div', { class: 'col' },
        h('div', { class: 'muted std-only' }, '1 star: finish the mission. 2 stars: plus the bonus goal. 3 stars: plus the stretch goal.'),
        h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'ch-hint-btn', onclick: () => { const el = document.getElementById('ch-hint'); el.hidden = !el.hidden; } }, t('chal.hint', 'Hint')), h('div', { class: 'callout info', id: 'ch-hint', hidden: true, style: { margin: 0 } }, c.hint ?? 'Read the lesson first.')),
        [1, 2, 3].map((tier) => h('div', { class: 'ch-goal' }, h('span', { class: 'ch-goal-stars' }, starsEl(tier, tier, 14)), h('span', null, c.goals.filter((g) => g.tier === tier).map((g) => g.label).join(' and ')))),
        c.constraints.length ? h('div', { class: 'muted' }, `Limits: ${c.constraints.map((k) => k.label).join('; ')}.`) : null));
      let steps = panel('How to do it', h('div', { class: 'col' },
        step(1, 'Read the lesson', lesson ? lesson.title : 'Open the Academy.', h('button', { class: 'btn', id: 'ch-lesson', onclick: () => app.navigate('academy', { lesson: c.lesson }) }, 'Read the lesson')),
        step(2, 'Set up the challenge', !hasVehicle ? (c.needs === 'lander' ? 'No lander yet. The AI will build one.' : 'No rocket yet. The AI will build one.') : ready ? 'Mission is ready.' : setupText(c), h('button', { class: 'btn primary', id: 'ch-setup', onclick: () => setup(c) }, hasVehicle ? (ready ? 'Set up again' : 'Set up this challenge') : (c.needs === 'lander' ? 'Build a lander (AI)' : 'Build a rocket (AI)')), ready ? h('span', { class: 'ok' }, 'ready') : null),
        step(3, 'Launch it', 'Fly it.', h('button', { class: 'btn', id: 'ch-launch', onclick: () => app.navigate('simulation') }, t('btn.launchit', 'Launch It'))),
        step(4, 'Check my result', 'Get your stars.', h('button', { class: 'btn primary', id: 'ch-check', disabled: S.busy, onclick: () => check(c) }, 'Check my result'))));
      if (c.design) steps = designSteps(c, lesson);
      page.append(h('div', { class: 'grid g2' }, goalsPanel, steps));
      const out = h('div', { id: 'ch-result' }); page.append(out);
      if (S.evalResult) renderResult(out, c, S.evalResult);
      else out.append(emptyState('No result yet', c.design ? 'Build your rocket, then press “Check my design”.' : 'Fly your rocket, then press “Check my result”.', c.design ? [] : [h('button', { class: 'btn primary', onclick: () => app.navigate('simulation') }, 'Launch it')], icon('trophy', { size: 32 })));
      decorateTerms(page);
    }
    const step = (n, title, text, ...btns) => h('div', { class: 'ch-step' }, h('span', { class: 'ch-num' }, n), h('div', { class: 'grow col', style: { gap: '4px' } }, h('b', null, title), h('div', { class: 'muted' }, text), h('div', { class: 'row' }, btns)));

    async function setup(c) {
      if (vehicleProblem(c, app.project.vehicle)) {
        app.challengePending = c.id;   // remembered (not saved) so the screen reopens on this challenge after the AI built the rocket
        return app.navigate('ai', { prefill: c.build ?? DEFAULT_BUILD, send: true });
      }
      const r = await setupChallenge(app.api, c);
      if (r.ok) { app.commit?.(`Set up challenge: ${c.title}`); toast(c.setup.kind === 'landing' ? 'Mission ready: land on the Moon' : `Mission ready: launch to ${c.setup.altitude / 1000} km`, 'ok'); S.evalResult = null; }
      else toast(r.message, 'bad', 8000);
      detail();
    }

    async function check(c) {
      const P = app.project;
      if (c.design) {   // judged from the design itself (delta-v budget), no flight needed
        const ev = evaluateDesign(c, P.vehicle);
        S.evalResult = { ...ev, runName: P.vehicle?.name ?? 'your design' };
        if (ev.valid) record(c, ev, `design:${P.vehicle.id}:${Math.round(ev.metrics.dvVacuum)}:${Math.round(ev.metrics.payloadKg)}`, null, NaN);
        return detail();
      }
      if (!P.runs.length) { S.evalResult = { none: 'No flight has been recorded yet. Press “Launch it” first.' }; return detail(); }
      S.busy = true;
      try {
        const { record: rec, telemetry } = await app.getRun('last');
        const ev = evaluate(c, rec, telemetry);
        S.evalResult = { ...ev, runName: rec.name, runId: rec.id };
        if (ev.valid) record(c, ev, rec.id, rec.id, payloadOf(rec));
      } catch (e) { S.evalResult = { none: `The flight could not be opened: ${e.message}` }; }
      S.busy = false; detail();
    }
    /** Save stars (best), the number of different checked attempts and a proof of the measured numbers (for teacher reports). */
    function record(c, ev, key, runId, payloadKg) {
      const prev = saved()[c.id];
      const next = { ...(prev ?? {}), attempts: (prev?.attempts ?? 0) + (prev?.lastKey === key ? 0 : 1), lastKey: key };
      if (!prev || ev.stars >= prev.stars) {
        next.stars = Math.max(ev.stars, prev?.stars ?? 0);
        next.best = { runId, goals: ev.goals.map((g) => ({ id: g.id, ok: g.ok, value: g.value })), at: new Date().toISOString() };
        next.proof = makeProof(ev, { runId, payloadKg: Number.isFinite(payloadKg) ? payloadKg : null });
      }
      saved()[c.id] = next; app.saveSettings();
    }

    function renderResult(out, c, ev) {
      if (ev.none) return out.append(h('div', { class: 'callout warn' }, ev.none));
      if (!ev.valid) return out.append(h('div', { class: 'callout warn' }, ev.why));
      const gotNow = ev.stars, best = saved()[c.id]?.stars ?? 0;
      out.append(panel(`Result of “${ev.runName}”`, h('div', { class: 'col' },
        h('div', { class: 'ch-verdict' }, h('span', { class: 'ch-big-stars', id: 'ch-stars' }, starsEl(gotNow, 3, 30)), h('b', null, gotNow === 3 ? 'Perfect! Three stars.' : gotNow > 0 ? `Challenge complete with ${gotNow} star${gotNow > 1 ? 's' : ''}.` : 'Not yet. Look at the goals that are still red and try again.'), best > gotNow ? h('span', { class: 'muted' }, `(your best is ${starText(best)})`) : null),
        h('div', { class: 'ch-check' }, ev.goals.map((g) => h('div', { class: `ch-row ${g.ok ? 'ok' : 'bad'}`, 'data-goal': g.id },
          h('span', { class: 'ch-mark' }, icon(g.ok ? 'check' : 'cross', { size: 16 })), h('span', { class: 'grow' }, h('span', { class: 'ch-tier' }, starsEl(g.tier, g.tier, 12)), ' ', g.label), h('span', { class: 'mono' }, g.value), h('span', { class: 'muted' }, `needs ${g.target}`)))),
        h('div', { class: 'muted' }, ev.design ? 'These numbers come from the design check (the rocket equation). No flight was simulated.' : 'These numbers are measured in your recorded flight.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => app.navigate('analysis') }, 'What happened?'), h('button', { class: 'btn', onclick: () => app.navigate('ai', { prefill: gotNow >= 3 ? 'How can I improve this design?' : `How can I improve my rocket to pass the challenge "${c.title}"?` }) }, 'Ask the AI for ideas'), h('button', { class: 'btn', onclick: () => app.navigate('simulation') }, 'Launch again')))));
    }

    // coming back from the AI Helper after it built the rocket: open the pending challenge
    if (!S.id && app.challengePending) { S.id = app.challengePending; app.challengePending = null; }
    if (S.id) detail(); else list();
    unsub.push(app.on('design', () => { if (S.id) detail(); }));
    return () => unsub.forEach((f) => f());
  },
};
