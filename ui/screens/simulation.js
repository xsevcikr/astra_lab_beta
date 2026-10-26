// Simulation: set up and run a simulation (fast or live), see progress and the result, manage the recorded runs.
import { h, clear, toast, fmt, fmtTime, confirmDialog } from '../lib/dom.js';
import { panel, kv, select, stat, statusBadge, emptyState, tabs } from '../lib/widgets.js';
import { show, showKm } from '../lib/units.js';
import { validateVehicle } from '../../src/vehicles/analysis.js';
import { runMetrics } from '../../src/core/run-analysis.js';
import { readinessReview } from '../../src/core/readiness.js';
import { gloss } from '../lib/glossary.js';
import { needsPanel, launchGate, issueRows } from '../lib/missing.js';
import { plainIssue } from '../lib/editorkit.js';
import { atLeast } from '../../src/core/levels.js';
import { physicsOptionsPanel } from '../lib/levelkit.js';
import { term } from '../lib/widgets.js';
import { t } from '../../src/core/i18n.js';
import { launchChecklist } from '../../src/core/needs.js';
import { describeFlight } from '../../src/core/makeitfly.js';
import { syncMission, pickRunId, runIsCurrent, orbitResultText, orbitTargetText, vehicleWord } from '../../src/core/consistency.js';

export default {
  id: 'simulation', title: 'Simulation',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = { busy: false, progress: null, tune: true, last: null, station: null, fix: null };
    let unsub = [];
    const beginner = () => app.settings.mode === 'beginner';

    function render() {
      clear(page);
      const P = app.project, v = P.vehicle, m = P.mission;
      const issues = v ? validateVehicle(v, { body: v.meta?.body ?? P.environment.body ?? 'earth' }).filter((i) => i.severity === 'error') : [];
      const canTune = !!(m && m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit');
      const blockers = launchChecklist(P, {}).blocking;
      const ready = !S.busy && !S.fix?.busy; // never greyed out for a missing part: pressing the button explains what is missing
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, beginner() ? 'Launch it' : t('nav.simulation.full', 'Simulation')), h('p', { class: 'adv-only' }, 'The physics engine integrates the equations of motion (RK4) with gravity, thrust, drag, mass change, staging and orbital mechanics. Results are recorded automatically.'))));
      if (blockers.length) page.append(h('div', { id: 'sim-needs' }, needsPanel(app, { onChange: () => render() })));
      if (v && !blockers.length) page.append(readinessPanel(v, m));
      const B = beginner();
      const setup = panel(B ? 'Your launch' : 'Ready to launch?', h('div', { class: 'col' },
        B ? kv([[v ? vehicleWord(v.type)[0].toUpperCase() + vehicleWord(v.type).slice(1) : 'Rocket', v ? v.name : 'none'], ['Goal', m ? m.name : 'none']]) : kv([['Vehicle', v ? `${v.name} (${v.type})` : 'none'], ['Mission', m ? m.name : 'none'], ...(m?.objective?.type === 'orbit' ? [['Orbit goal', orbitTargetText(m.objective)]] : []), ['Environment', `${P.environment.body} · ${P.environment.site?.lat?.toFixed?.(1) ?? '–'}°, ${P.environment.site?.lon?.toFixed?.(1) ?? '–'}°`]]),
        h('label', { class: 'field adv-only' }, 'Physics accuracy', select([['fast', 'Fast (coarser steps while coasting)'], ['standard', 'Standard'], ['high', 'High (finest coast steps)']], P.settings.accuracy, (x) => { P.settings.accuracy = x; app.settings.accuracy = x; app.saveSettings(); app.markDirty(); })),
        h('div', { class: 'muted adv-only', style: { fontSize: '12px' } }, 'Accuracy only changes the time step while coasting far from a surface. Powered flight and atmosphere always use the fine step. Same inputs always give the same output.'),
        canTune ? h('label', { class: 'row std-only' }, h('input', { type: 'checkbox', checked: S.tune, onchange: (e) => (S.tune = e.target.checked) }), h('span', null, 'Try up to 12 launch angles until one reaches orbit (slower)')) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary big', id: 'run-fast', disabled: !ready, onclick: () => { if (launchGate(app, { inlineSelector: '#sim-needs' })) runFast(); } }, B ? 'Launch' : t('sim.run', 'Run simulation')),
          h('button', { class: 'btn big', id: 'run-live', disabled: !ready, onclick: () => { if (launchGate(app, { inlineSelector: '#sim-needs' })) app.navigate('control', { autostart: true }); } }, B ? 'Watch live' : t('sim.watch', 'Watch live')),
          (!B || S.busy) ? h('button', { class: 'btn danger', disabled: !S.busy, onclick: () => { app.api.execute('STOP_SIMULATION'); } }, 'Stop') : null),
        S.busy ? progressView() : null));
      page.append(h('div', { class: 'grid g2' }, setup, resultPanel()));
      if (atLeast(app.settings.mode, 'expert')) page.append(physicsOptionsPanel(app));
      { const rp = runsPanel(); rp.classList?.add('std-only'); page.append(rp); }
    }
    const LIGHT = { go: 'GO', caution: 'CAUTION', nogo: 'NO-GO', na: 'n/a' };
    /** Go / No-Go poll: one light per station, each derived from real design checks (src/core/readiness.js). */
    function readinessPanel(v, m) {
      let rv; try { rv = readinessReview(v, m, { body: v.meta?.body ?? app.project.environment.body ?? 'earth' }); } catch (e) { return h('span'); }
      if (!rv) return h('span');
      const sel = rv.stations.find((x) => x.id === S.station) ?? rv.stations[rv.stations.length - 1];
      const dir = rv.stations.find((x) => x.overall);
      const detail = h('div', { class: `rr-detail ${sel.status}`, id: 'rr-detail' },
        h('div', { class: 'grow' }, h('b', null, `${sel.name}: ${LIGHT[sel.status]}`), h('div', null, beginner() ? sel.plain : sel.reason)),
        h('div', { class: 'row' },
          sel.learn?.component ? h('button', { class: 'btn small', id: 'rr-learn', onclick: () => app.navigate('academy', { component: sel.learn.component }) }, beginner() ? 'Learn' : 'Learn why: parts guide') : null,
          sel.learn?.lesson ? h('button', { class: 'btn small std-only', id: 'rr-lesson', onclick: () => app.navigate('academy', { lesson: sel.learn.lesson }) }, 'Lesson') : null));
      const B = beginner();
      return panel(B ? 'Ready check' : 'Launch readiness review: go or no-go? (a prediction)', h('div', { class: 'col', style: { gap: '8px' } },
        h('div', { class: `rr-summary ${dir.status}`, id: 'rr-summary' }, h('span', { class: 'rr-dot' }), h('b', null, B ? rv.overall.plain : rv.overall.text)),
        h('div', { class: 'rr-row' }, rv.stations.map((x) => h('button', { class: `rr-station ${x.status} ${x.id === sel.id ? 'sel' : ''}`, 'data-station': x.id, title: B ? x.plain : x.reason, onclick: () => { S.station = x.id; render(); } },
          h('span', { class: 'rr-dot' }), h('span', { class: 'rr-name' }, B ? (x.short ?? x.name) : x.name), h('span', { class: 'rr-state' }, x.status === 'go' ? '' : LIGHT[x.status])))),
        B && !S.station ? null : detail,
        h('div', { class: 'simple-hint', id: 'rr-note' }, B ? 'Green means the checks pass. Only a flight proves it.' : 'These lights are predictions from the design. Only a flight proves it.'),
        fixRows(v)));
    }
    /** Every open problem of the design with its own Fix button (same buttons as the editor and the launch checklist). */
    function fixRows(v) {
      let rows = []; try { rows = issueRows(app, v, { onDone: () => render(), plain: beginner() ? (i, veh) => plainIssue(i, veh) : null, adv: atLeast(app.settings.mode, 'engineer') }); } catch { rows = []; }
      return rows.length ? h('div', { class: 'col', id: 'rr-fixes', style: { gap: '4px' } }, h('b', null, beginner() ? 'Fix these' : 'Open issues'), rows) : null;
    }
    function progressView() {
      const p = S.progress;
      return h('div', { class: 'col' }, h('div', { class: 'progress' }, h('div', { style: { width: p?.tuning ? `${(p.tuning.tried / p.tuning.of) * 100}%` : '50%' } })),
        h('div', { class: 'muted mono' }, p?.tuning ? (beginner() ? `Trying flight ${p.tuning.tried} of ${p.tuning.of}` : `Ascent tuning: flight ${p.tuning.tried} of up to ${p.tuning.of} (${p.tuning.status})`) : p && beginner() ? `Flying: ${fmt(p.t, 0)} s, ${showKm(p.alt)} high` : p ? `T+${fmt(p.t, 0)} s · altitude ${showKm(p.alt)} · speed ${show(p.speed, 'm/s', 0)} · mass ${show(p.mass, 'kg', 0)}` : 'Starting…'));
    }
    function resultPanel() {
      const P = app.project;
      const id = pickRunId(P, app.selectedRun);
      const meta = P.runs.find((r) => r.id === id);
      const stale = !!meta && !runIsCurrent(P, meta);
      if (S.fix?.busy) return panel(beginner() ? 'Fixing...' : 'Fix it and fly again', fixProgress());
      if (!meta) return panel(t('sim.result', 'Result'), emptyState(t('sim.noresult', 'No result yet'), beginner() ? 'Press Launch.' : 'Press “Run simulation”. The result, the failure analysis and the recording appear here.'));
      const body = h('div', { class: 'col' }, h('p', { class: 'muted' }, 'Loading…'));
      app.getRun(id).then(({ record, telemetry }) => {
        const m = runMetrics(record, telemetry); const res = record.result;
        clear(body).append(
          fixResult(),
          stale ? h('div', { class: 'callout warn', id: 'sim-stale' }, h('b', null, `Old flight: “${meta.vehicle}”. `), `“${P.vehicle?.name ?? 'none'}” has not flown yet.`) : null,
          h('div', { class: 'row' }, statusBadge(res.status), beginner() ? null : h('b', null, res.reason)),
          res.status !== 'SUCCESS' && !stale ? fixBlock(record, telemetry) : null,
          h('div', { class: 'grid g2' },
            stat(beginner() ? 'Time' : 'Duration', fmtTime(res.endTime)), stat(beginner() ? 'Height' : term('altitude', 'Max altitude'), showKm(m.maxAlt)),
            record.mission.objective?.type === 'orbit' ? stat('Orbit', `${fmt(m.finalPeri / 1000, 0)} × ${fmt(m.finalApo / 1000, 0)} km`, beginner() ? '' : orbitResultText(record.mission.objective, m.finalPeri, m.finalApo).replace(/, achieved [^,]*/, '').replace('tolerance ', ''), res.status === 'SUCCESS' ? 'ok' : 'bad') : stat('Objective', res.objective?.success ? 'met' : 'not met', res.objective?.detail ?? '', res.objective?.success ? 'ok' : 'bad'),
            h('div', { class: 'std-only' }, stat('Failures found', String(res.failures.length), res.failures.length ? res.failures.map((f) => f.code).slice(0, 3).join(', ') : 'none'))),
          res.failures.length ? h('div', { class: 'callout bad' }, `${beginner() ? 'Problem' : 'Most likely root cause'}: ${(res.failures.find((f) => f.rootCause) ?? res.failures[0]).title}`) : null,
          h('div', { class: 'row' },
            h('button', { class: res.status === 'SUCCESS' || stale ? 'btn primary' : 'btn', onclick: () => app.navigate('analysis') }, beginner() ? 'What happened?' : 'Engineering analysis'), h('button', { class: 'btn std-only', onclick: () => app.navigate('replay') }, 'Replay'), h('button', { class: 'btn std-only', onclick: () => app.navigate('telemetry') }, 'Telemetry'),
            h('button', { class: 'btn', onclick: () => app.navigate('ai', { prefill: res.status === 'SUCCESS' ? 'How can I improve this design?' : 'Why did it fail?' }) }, beginner() ? 'Ask AI' : 'Ask AI: ' + (res.status === 'SUCCESS' ? 'improve it' : 'why did it fail?'))));
      }).catch((e) => { clear(body).append(h('p', { class: 'bad' }, `Could not open the recording: ${e.message}`)); });
      return panel(beginner() ? (stale ? 'Old result' : 'Result') : `${stale ? 'Older result' : 'Latest result'}: ${meta.name}`, body);
    }
    /** After a failed flight: say why in one plain line and offer ONE button that changes the design and flies again (src/core/makeitfly.js). */
    function fixBlock(record, telemetry) {
      let why = ''; try { why = describeFlight(record, telemetry, app.project.vehicle, app.project.mission).cause ?? ''; } catch { why = ''; }
      return h('div', { class: 'col fixit', id: 'sim-fixit' },
        why ? h('div', { class: 'fixit-why', id: 'fixit-why' }, why) : null,
        h('button', { class: 'btn primary big', id: 'fix-it', disabled: !!S.busy, title: 'The computer changes the rocket and flies it again, until it works', onclick: doFix }, 'Fix it and fly again'));
    }
    function fixProgress() {
      const f = S.fix;
      return h('div', { class: 'col', id: 'fix-progress' }, h('div', { class: 'progress' }, h('div', { id: 'fix-bar', style: { width: `${Math.round(100 * (f.pct ?? 0.03))}%` } })),
        h('div', { class: 'row' }, h('span', { class: 'muted grow', id: 'fix-msg' }, f.text), h('button', { class: 'btn small danger', id: 'fix-stop', onclick: () => { app.stopFix(); app.api.execute('STOP_SIMULATION'); } }, 'Stop')));
    }
    async function doFix() {
      if (S.busy || S.fix?.busy) return;
      S.fix = { busy: true, text: 'Test flight 1', pct: 0.03 }; render();
      const r = await app.makeItFly({ onProgress: (p) => { if (!S.fix?.busy) return; S.fix.text = p.text; S.fix.pct = p.pct; const b = document.getElementById('fix-bar'), m = document.getElementById('fix-msg'); if (b) b.style.width = `${Math.round(100 * p.pct)}%`; if (m) m.textContent = p.text; } });
      S.fix = { busy: false, result: r };
      toast(r.ok ? 'Your rocket flew.' : r.stopped ? 'Stopped.' : 'Still not working. Read the result.', r.ok ? 'ok' : 'warn', 5000); render();
    }
    function fixResult() {
      const r = S.fix?.result; if (!r) return null;
      return h('div', { class: `callout ${r.ok ? 'ok' : 'bad'}`, id: 'fix-result' }, r.summary);
    }
    function runsPanel() {
      const P = app.project;
      if (!P.runs.length) return h('span');
      return panel(`Flights (${P.runs.length})`, h('table', null, h('thead', null, h('tr', null, ['Run', 'Vehicle', 'Mission', 'Result', 'Duration', 'Failures', ''].map((t) => h('th', null, t)))),
        h('tbody', null, app.runList().map((r) => h('tr', { class: `clickable ${app.selectedRun === r.id ? 'sel' : ''}`, onclick: () => { app.selectedRun = r.id; app.session.lastRunId = r.id; render(); } },
          h('td', null, r.name, h('div', { class: 'muted mono', style: { fontSize: '11px' } }, r.id)), h('td', null, r.vehicle), h('td', null, r.mission), h('td', null, statusBadge(r.status)), h('td', { class: 'num' }, fmtTime(r.endTime)), h('td', null, (r.failures ?? []).join(', ') || '–'),
          h('td', null, h('button', { class: 'btn small danger', onclick: async (e) => { e.stopPropagation(); if (await confirmDialog('Delete run', `Delete the recording “${r.name}”? This cannot be undone.`)) await app.deleteRun(r.id); render(); } }, 'Delete')))))));
    }
    async function runFast() {
      if (S.busy) return; S.busy = true; S.progress = null; S.fix = null; render();
      const launcher = app.project.mission?.guidance?.mode === 'ascent';
      const r = await app.runFast({ tune: S.tune && launcher });
      S.busy = false; S.progress = null;
      if (!r.ok) toast(r.message, 'bad', 9000); else toast(r.message, r.data.status === 'SUCCESS' ? 'ok' : 'bad', 7000);
      render();
    }
    unsub.push(app.on('sim-event', (e) => {
      if (!S.busy) return;
      if (e.type === 'sim-progress') { S.progress = { ...S.progress, t: e.t, alt: e.alt, speed: e.speed, mass: e.mass, tuning: S.progress?.tuning }; updateProgress(); }
      if (e.type === 'tuning') { S.progress = { ...S.progress, tuning: { tried: e.tried, of: e.of, status: e.status } }; updateProgress(); }
    }));
    let last = 0;
    function updateProgress() { const now = performance.now(); if (now - last < 150) return; last = now; const old = page.querySelector('.progress')?.parentElement; if (old) old.replaceWith(progressView()); }
    // The active vehicle, goal and flight must belong together: when the vehicle changes, switch to a goal that suits it.
    let syncing = false;
    async function autoSync() {
      if (syncing || S.busy) return; syncing = true;
      try { // Only the strict mismatches the checklist does not name are created silently; the named ones keep their "Fix it" button.
        const flagged = launchChecklist(app.project, {}).blocking.some((n) => n.id === 'mission-mismatch');
        const r = await syncMission(app, { create: !flagged }); if (r.changed) toast(r.message, r.ok ? 'ok' : 'warn', 5000); } catch { /* the needs panel still explains it */ }
      syncing = false;
    }
    unsub.push(app.on('run-deleted', render), app.on('design', () => { render(); autoSync(); }));
    autoSync().then(() => render());
    render();
    return () => unsub.forEach((f) => f());
  },
};
