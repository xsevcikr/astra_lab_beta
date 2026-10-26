// Engineering Analysis: verdict, failure analysis with confidence and evidence, metrics, findings, timeline, delta-v budget, run comparison, reports.
import { h, clear, toast, fmt, fmtTime } from '../lib/dom.js';
import { panel, stat, statusBadge, confBadge, tabs, saveFile, equation, emptyState, term } from '../lib/widgets.js';
import { atLeast } from '../../src/core/levels.js';
import { runFormulas, runBudgetPanel, trajectoryPanel, rawTelemetryPanel, monteCarloPanel, physicsOptionsPanel } from '../lib/levelkit.js';
import { t } from '../../src/core/i18n.js';
import { drawBars } from '../lib/charts.js';
import { show, showKm, conv } from '../lib/units.js';
import { runMetrics, findings, timeline, compareMetrics, debrisReport } from '../../src/core/run-analysis.js';
import { buildReport, reportToHTML, reportToPDF, reportToCSV, metricsToCSV, debrisRows } from '../../src/core/report.js';
import { runSelect, currentRunId, noRunHint } from '../lib/runpick.js';
import { orbitResultText } from '../../src/core/orbit-goal.js';
import { reportCard, plainTime } from '../../src/core/plain-metrics.js';
import { state as unitState } from '../lib/units.js';
import { icon, starsEl } from '../lib/icons.js';
import { exportProPdf, exportAssurancePdf, exportTelemetry, exportEphemeris, compareWithEphemeris } from '../lib/export.js';

const val = (v, unit) => (Number.isFinite(v) ? (unit && conv(1, unit).unit !== unit ? show(v, unit, 3) : `${Math.abs(v) >= 1000 ? v.toFixed(0) : Number(v.toPrecision(4))} ${unit ?? ''}`.trim()) : String(v ?? '–'));
const UNIT_OF = { m: 'm', 'm/s': 'm/s', kg: 'kg', N: 'N', Pa: 'Pa', K: 'K' };

export default {
  id: 'analysis', title: 'Engineering Analysis',
  mount(root, app, params) {
    const S = { runId: currentRunId(app, params), data: null, tab: params?.tab ?? 'overview', cmpId: null };
    const page = h('div', { class: 'page' }); root.append(page);
    let disposed = false;

    async function load() {
      S.data = null;
      if (S.runId) {
        try { const r = await app.getRun(S.runId); const m = runMetrics(r.record, r.telemetry); S.data = { ...r, m, finds: findings(r.record, r.telemetry, m), tl: timeline(r.record) }; app.selectedRun = S.runId; }
        catch (e) { toast(`Cannot open it: ${e.message}`, 'bad', 8000); }
      }
      if (!disposed) render();
    }
    function head() {
      const d = S.data;
      return h('div', { class: 'page-head' },
        h('div', { class: 'grow' }, h('h1', { class: 'beginner-only' }, 'What happened?'), h('h1', { class: 'std-only' }, 'Engineering Analysis'), h('p', { class: 'std-only' }, 'All numbers come from the recorded flight.')),
        app.project.runs.length ? h('div', { class: 'row' }, runSelect(app, S.runId, (id) => { S.runId = id; S.cmpId = null; load(); })) : null,
        d ? h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => app.navigate('replay', { runId: S.runId }) }, 'Replay'),
          h('button', { class: 'btn', onclick: () => app.navigate('telemetry', { runId: S.runId }) }, 'Flight data'),
          h('button', { class: 'btn primary', onclick: () => app.navigate('ai', { prefill: d.record.result?.status === 'SUCCESS' ? 'How can I improve this design?' : 'Why did it fail?' }) }, 'Ask AI')) : null);
    }
    function ephResult(c) {
      const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`);
      return h('div', { class: 'callout info', id: 'eph-result', style: { marginTop: '8px' } }, h('b', null, `Comparison with ${c.file}`), h('div', null, `${c.ref.object} (${c.ref.center}, ${c.ref.frame}), ${c.ref.n} lines. Compared over ${(c.spanS / 60).toFixed(1)} minutes of flight (${c.n} points).`),
        h('div', null, `Largest position difference ${km(c.maxPosErrM)} at ${c.atMaxPosS.toFixed(0)} s; typical (rms) ${km(c.rmsPosErrM)}; largest speed difference ${c.maxVelErrMs.toFixed(2)} m/s.`),
        h('div', { class: 'muted', style: { fontSize: '12px' } }, 'The frames are treated as the same. Differences below a few hundred metres are not meaningful because ASTRA LAB\'s inertial frame is simplified (no precession, nutation or polar motion).'));
    }
    function exports() {
      const d = S.data, base = d.record.name.replace(/[^\w.-]+/g, '_');
      const rep = () => buildReport(d.record, d.telemetry, { units: app.settings.units });
      const pdf = h('button', { class: 'btn primary', id: 'exp-pdf', onclick: () => { try { saveFile(app, `${base}.pdf`, reportToPDF(rep()), 'application/pdf'); } catch (e) { toast(`PDF failed: ${e.message}`, 'bad'); } } }, 'Report (PDF)');
      const html = h('button', { class: 'btn', onclick: () => saveFile(app, `${base}.html`, reportToHTML(rep()), 'text/html') }, 'Report (HTML)');
      const csv = h('button', { class: 'btn', onclick: () => saveFile(app, `${base}-telemetry.csv`, reportToCSV(d.telemetry), 'text/csv') }, 'Telemetry (CSV)');
      const csv2 = h('button', { class: 'btn', onclick: () => saveFile(app, `${base}-metrics.csv`, metricsToCSV(d.m), 'text/csv') }, 'Metrics (CSV)');
      const prt = h('button', { class: 'btn', onclick: () => { if (app.bridge?.printHtml) { app.bridge.printHtml(reportToHTML(rep())).catch((e) => toast(`Printing failed: ${e.message}`, 'bad')); return; } const w = window.open('', '_blank'); if (w) { w.document.write(reportToHTML(rep())); w.document.close(); w.print(); } else toast('Print was blocked. Use the PDF.', 'bad'); } }, 'Print');
      const pro = h('button', { class: 'btn primary', id: 'exp-pro-pdf', title: 'Summary, requirements, design, delta-v budget, charts, events, failure analysis, assumptions, validation note, seed and version', onclick: () => exportProPdf(app, S.runId) }, 'Mission report (PDF)');
      const tcsv = h('button', { class: 'btn std-only', id: 'exp-tel-csv', title: 'All channels with units in the header', onclick: () => exportTelemetry(app, S.runId, 'csv') }, 'Telemetry with units (CSV)');
      const tjson = h('button', { class: 'btn std-only', id: 'exp-tel-json', onclick: () => exportTelemetry(app, S.runId, 'json') }, 'Telemetry (JSON)');
      const tpy = h('button', { class: 'btn std-only', id: 'exp-tel-py', title: 'A Python script that loads and plots the telemetry CSV (save the CSV next to it)', onclick: () => exportTelemetry(app, S.runId, 'py') }, 'Python script');
      const tm = h('button', { class: 'btn std-only', id: 'exp-tel-m', title: 'A MATLAB / Octave script that loads and plots the telemetry CSV (save the CSV next to it)', onclick: () => exportTelemetry(app, S.runId, 'm') }, 'MATLAB script');
      const oem = h('button', { class: 'btn std-only', id: 'exp-oem', title: 'The flight path as a CCSDS Orbit Ephemeris Message (OEM), which other space software reads', onclick: () => exportEphemeris(app, S.runId, 'oem') }, 'Trajectory (CCSDS OEM)');
      const spice = h('button', { class: 'btn std-only', id: 'exp-spice', title: 'The flight path as SPICE-style text: time, position, velocity per line (MKSPK text input)', onclick: () => exportEphemeris(app, S.runId, 'spice') }, 'Trajectory (SPICE text)');
      const cmpBtn = h('button', { class: 'btn std-only', id: 'exp-compare', title: 'Open an OEM or SPICE-text file from other software and see how far this flight is from it', onclick: async () => { S.ephCmp = await compareWithEphemeris(app, S.runId); render(); } }, 'Compare with a trajectory file…');
      const asr = h('button', { class: 'btn', id: 'exp-assurance', title: 'Can this result be trusted? Margins, how far the model is validated, odds of success under dispersions, open items, how to reproduce', onclick: () => exportAssurancePdf(app, S.runId) }, 'Assurance review (PDF)');
      return panel('Post-mission report', h('div', null, h('div', { class: 'row' }, pro, asr, pdf, html, csv, csv2, tcsv, tjson, tpy, tm, oem, spice, cmpBtn, prt), S.ephCmp ? ephResult(S.ephCmp) : null));
    }

    /** The flight report card: only numbers measured in this run; the rating counts measured goals. */
    function reportView() {
      const d = S.data; let card;
      try { card = reportCard(d.record, d.telemetry, { imperial: unitState.system === 'imperial' }); } catch { return h('span'); }
      const stars = card.rating ? h('div', { class: 'fd-stars', id: 'fd-stars', title: card.rating.reason }, starsEl(card.rating.stars, 5, 20)) : null;
      const beg = app.settings.mode === 'beginner';
      const story = beg && card.story.length > 3 ? [card.story[0], ...card.story.slice(-2)] : card.story.slice(0, 7);
      const goalsBlock = card.goals.length ? h('div', null, beg ? null : h('h4', { style: { marginBottom: '4px' } }, 'Goals'), h('div', { class: 'fd-goals' }, card.goals.map((g) => h('span', { class: `fd-goal ${g.ok ? 'fd-yes' : 'fd-no'}`, title: g.detail }, icon(g.ok ? 'check' : 'cross', { size: 13 }), ` ${g.label}`))),
        card.rating?.failed.length ? h('ul', { class: 'fd-story', id: 'fd-missed' }, card.rating.failed.map((g) => h('li', null, h('b', null, `${g.label}: `), g.detail))) : null,
        card.rating ? h('div', { class: 'muted', id: 'fd-grade-why', style: { fontSize: '12.5px' } }, `Grade ${card.rating.letter} (${card.rating.stars} of 5 stars): ${card.rating.passed} of ${card.rating.total} goals met.${card.rating.capped ? ' The main goal was missed, so the grade stops at D.' : ''}`) : null) : null;
      return h('div', { class: `fd-report ${card.ok ? 'fd-pass' : 'fd-fail'}`, id: 'fd-report' },
        h('div', { class: 'fd-rep-head' }, h('div', { class: 'fd-rep-title' }, 'Flight report card', h('div', { class: 'fd-rep-sub' }, card.headline)), stars, card.rating ? h('div', { class: 'fd-letter', title: card.rating.reason }, card.rating.letter) : null),
        h('div', { class: 'fd-tiles' }, card.tiles.map((t) => h('div', { class: 'fd-tile', 'data-tile': t.id }, h('div', { class: 'fd-tile-l' }, t.label), h('div', { class: 'fd-tile-v' }, t.value), t.compare ? h('div', { class: 'fd-tile-c' }, t.compare) : null))),
        story.length ? h('div', null, beg ? null : h('h4', { style: { marginBottom: '4px' } }, 'What happened'), h('ul', { class: 'fd-story' }, story.map((x) => h('li', null, x)))) : null,
        goalsBlock ? (beg ? h('details', { class: 'fd-why' }, h('summary', { class: 'btn small' }, 'Why?'), goalsBlock) : goalsBlock) : null);
    }

    /** Plain-language summary for beginners: what happened, in one glance, and what to do next. */
    function simplePanel() {
      const { record, m } = S.data, res = record.result ?? {}, ok = res.status === 'SUCCESS';
      const fs = res.failures ?? [], top = fs.find((f) => f.rootCause) ?? fs[0];
      const more = h('details', { class: 'an-more' }, h('summary', { class: 'btn small' }, 'More'),
        h('div', { class: 'row an-more-row' },
          !ok ? h('button', { class: 'btn', id: 'fail-analysis-btn', onclick: () => app.navigate('failure', { runId: S.runId }) }, 'Why did it fail?') : null,
          h('button', { class: 'btn', id: 'req-btn', onclick: () => app.navigate('requirements', { runId: S.runId }) }, 'Rules check'),
          h('button', { class: 'btn', onclick: () => app.navigate('academy', { lesson: ok ? 'L3-2' : 'L3-4' }) }, 'Learn why')));
      const box = h('div', { class: 'col' },
        h('div', { class: `callout big-verdict ${ok ? 'ok' : 'bad'}` }, h('b', null, ok ? 'Success!' : 'Not this time.'), app.settings.mode === 'beginner' ? '' : ` ${res.reason ?? ''}`),
        reportView(),
        top ? h('div', { class: 'callout warn big-verdict' }, h('b', null, 'Likely reason: '), top.title, top.primaryCause ? h('div', { class: 'muted std-only' }, top.primaryCause) : null) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'why-btn', onclick: () => app.navigate('ai', { prefill: ok ? 'How can I improve this design?' : 'Why did it fail?', send: true }) }, ok ? 'Improve it' : 'Explain it'),
          !ok ? h('button', { class: 'btn', id: 'fix-btn', onclick: () => app.navigate('ai', { prefill: 'Fix it.', send: true }) }, 'Fix it') : null,
          h('button', { class: 'btn', onclick: () => app.navigate('replay', { runId: S.runId }) }, 'Watch again'),
          more));
      return box;
    }
    function verdictPanel() {
      const { record, m } = S.data, res = record.result ?? {};
      const box = h('div', { class: 'col' },
        h('div', { class: 'row' }, statusBadge(res.status), h('b', { style: { fontSize: '15px' } }, res.reason ?? '')),
        h('div', { class: 'grid g4' },
          stat('Mission duration', fmtTime(m.endTime)), stat('Max altitude', showKm(m.maxAlt)), stat('Peak speed', show(m.maxSpeed, 'm/s', 0)), stat('Peak acceleration', `${fmt(m.maxG, 2)} g`),
          stat(term('dynamic pressure', 'Max dynamic pressure'), show(m.maxQ, 'Pa', 0), `T+${fmt(m.tMaxQ, 0)} s`), stat('Liftoff mass', show(m.initialMass, 'kg', 0)), stat('Propellant used', show(m.propellantUsed, 'kg', 0), `of ${show(m.initialPropellant, 'kg', 0)}`),
          record.mission.objective?.type === 'orbit' && m.finalPeri != null ? stat('Final orbit', `${fmt(m.finalPeri / 1000, 1)} × ${fmt(m.finalApo / 1000, 1)} km`, orbitResultText(record.mission.objective, m.finalPeri, m.finalApo).replace(/, achieved [^,]*/, ''), res.status === 'SUCCESS' ? 'ok' : 'bad') : stat('Objective', res.objective?.success ? 'met' : 'not met', res.objective?.detail ?? '', res.objective?.success ? 'ok' : 'bad')));
      return panel('Verdict', box);
    }
    function failuresPanel() {
      const { record } = S.data, fs = record.result?.failures ?? [];
      if (!fs.length) return panel('Failure analysis', h('div', { class: 'callout ok' }, 'No failure found.'));
      const cards = fs.map((f) => h('div', { class: `failure ${f.rootCause ? 'major' : ''}` },
        h('div', { class: 'failure-head' }, confBadge(f.confidence), h('h4', null, f.title), f.rootCause ? h('span', { class: 'badge', style: { color: 'var(--bad)', borderColor: 'var(--bad)' } }, 'ROOT CAUSE') : null, h('span', { class: 'muted mono' }, `${fmtTime(f.t)} · severity ${f.severity ?? '–'}`),
          h('button', { class: 'btn small', onclick: () => app.navigate('replay', { runId: S.runId }) , title: 'Open the replay and jump to the failure' }, 'Replay')),
        h('div', { class: 'failure-body' },
          h('div', null, h('b', null, 'Cause: '), f.primaryCause),
          f.causedBy ? h('div', { class: 'muted' }, `Caused by an earlier failure: ${f.causedBy}`) : null,
          f.contributing?.length ? h('div', null, h('b', null, 'Contributing factors'), h('ul', null, f.contributing.map((c) => h('li', null, c)))) : null,
          f.evidence?.length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Evidence (from telemetry)'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Time'))), h('tbody', null, f.evidence.map((e) => h('tr', null, h('td', null, e.label), h('td', { class: 'num' }, val(e.value, UNIT_OF[e.unit] ?? e.unit)), h('td', { class: 'num' }, e.t != null ? fmtTime(e.t) : ''))))) : null,
          f.equation ? equation(f.equation.name, f.equation.formula, f.equation.values) : null,
          f.consequences ? h('div', null, h('b', null, 'Consequence: '), f.consequences) : null,
          f.solutions?.length ? h('div', null, h('b', null, 'Suggested solutions'), h('ul', null, f.solutions.map((c) => h('li', null, c)))) : null,
          f.dvShortfall != null ? h('div', { class: 'note info' }, `Delta-v shortfall about ${fmt(f.dvShortfall, 0)} m/s${f.propellantSuggested ? `; roughly ${fmt(f.propellantSuggested, 0)} kg more propellant would close it (estimate, verify by re-simulating)` : ''}.`) : null)));
      return panel(`Failure analysis (${fs.length})`, h('div', { class: 'col' }, cards, h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => app.navigate('ai', { prefill: 'Fix it.' }) }, 'Ask the AI to fix it'))));
    }
    function findingsPanel() {
      const { finds } = S.data;
      return panel('Findings', finds.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, finds.map((f) => h('li', { class: f.level === 'bad' ? 'bad' : f.level === 'warn' ? 'warn' : f.level === 'ok' ? 'ok' : '' }, f.text))) : h('p', { class: 'muted' }, 'No findings.'));
    }
    function dvPanel() {
      const { m } = S.data; if (!(m.dvIdeal > 0)) return null;
      const c = h('canvas', { style: { width: '100%', height: '140px', display: 'block', border: '1px solid var(--line)', borderRadius: '6px' } });
      setTimeout(() => drawBars(c, [{ label: 'Delivered (ideal)', value: m.dvIdeal, color: '#2bd9a0' }, { label: 'Gravity loss', value: m.dvGravity ?? 0, color: '#ff7a45' }, { label: 'Drag loss', value: m.dvDrag ?? 0, color: '#c07cff' }, { label: 'Steering loss', value: m.dvSteering ?? 0, color: '#ffd23f' }], { unit: 'm/s', title: 'Delta-v budget of the flight' }), 30);
      return panel(term('delta-v', 'Delta-v budget'), c);
    }
    function debrisPanel() {
      let rows = []; try { rows = debrisRows({ debris: debrisReport(S.data.record) }); } catch { /* old recording without separation states */ }
      if (!rows.length) return null;
      return panel('Jettisoned hardware: predicted impact points', h('div', { class: 'col' },
        h('table', null, h('thead', null, h('tr', null, ['Piece', 'Mass', 'Separated', 'Outcome'].map((t) => h('th', null, t)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))),
        h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Each piece is flown on with gravity and drag from its recorded state (nominal separation velocity, tumbling drag). Winds and lift are not modelled, so this is an estimate, not a range-safety clearance.')));
    }
    function timelinePanel() {
      const { tl } = S.data;
      return panel('Mission timeline', h('ul', { class: 'timeline' }, tl.map((e) => h('li', null, h('span', { class: 'mono muted' }, fmtTime(e.t) + '  '), e.text))));
    }
    function metricsPanel() {
      const { m } = S.data; const rows = [];
      const add = (k, v) => v != null && rows.push([k, v]);
      add(term('Max-Q', 'Max Q'), `${show(m.maxQ, 'Pa', 0)} at T+${fmt(m.tMaxQ, 0)} s, ${showKm(m.altMaxQ)}, Mach ${fmt(m.machAtMaxQ, 2)}`);
      add('Peak G', `${fmt(m.maxG, 2)} g at T+${fmt(m.tMaxG, 0)} s`);
      add(term('Mach', 'Max Mach'), `${fmt(m.maxMach, 2)} (× speed of sound)`); add('Max angle of attack', `${fmt(m.maxAoA, 1)}°`);
      add('Peak thrust', show(m.maxThrust, 'N', 0)); add(term('TWR', 'Liftoff T/W'), m.liftoffTWR != null ? `${fmt(m.liftoffTWR, 2)} (ratio)` : null);
      add('Peak nose temperature', `${fmt(m.maxTempNose, 0)} K`); add('Peak body temperature', `${fmt(m.maxTempBody, 0)} K`);
      add('Structural load (peak)', `${fmt(100 * m.maxStructRatio, 0)} % of limit`);
      add(term('delta-v', 'Delta-v delivered'), m.dvIdeal != null ? show(m.dvIdeal, 'm/s', 0) : null);
      add('Stages separated', String(m.stagesSeparated ?? 0)); add('Last-stage propellant reserve', m.lastStageReserve != null ? `${show(m.lastStageReserve, 'kg', 0)} (${fmt(100 * m.lastStageReserveFrac, 0)} %)` : null);
      add('Touchdown', m.touchdownVertical != null ? `${fmt(m.touchdownVertical, 2)} m/s vertical, ${fmt(m.touchdownHorizontal, 2)} m/s horizontal, tilt ${fmt(m.touchdownTilt, 1)}°` : null);
      add('Rover', m.distanceDriven != null ? `${fmt(m.distanceDriven, 1)} m driven, peak slip ${fmt(100 * m.maxSlip, 0)} %` : null);
      add('Link time / data', m.linkTime ? `${fmt(m.linkTime, 0)} s, ${fmt(m.dataDownlinkedBits / 8e6, 2)} MB` : null);
      add('Telemetry samples', String(m.samples));
      return panel('Detailed metrics', h('dl', { class: 'kv' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
    }
    // ---- comparison
    async function comparePanel() {
      const box = h('div', { class: 'col' });
      const others = app.project.runs.filter((r) => r.id !== S.runId);
      if (!others.length) { box.append(h('p', { class: 'muted' }, 'Fly twice to compare two flights.')); return panel('Compare with another run', box); }
      S.cmpId ??= others[others.length - 1].id;
      box.append(h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Baseline (A)'), h('b', null, S.data.record.name), h('span', { class: 'muted' }, 'versus (B)'),
        (() => { const s = h('select', { class: 'input', id: 'cmp-run' }, others.map((r) => h('option', { value: r.id, selected: r.id === S.cmpId }, `${r.name} — ${r.status}`))); s.addEventListener('change', () => { S.cmpId = s.value; render(); }); return s; })()));
      try {
        const B = await app.getRun(S.cmpId); const mb = runMetrics(B.record, B.telemetry); const cmp = compareMetrics(S.data.m, mb);
        const fmtv = (v, u) => (typeof v === 'number' ? (u === 'm' && Math.abs(v) > 5000 ? `${fmt(v / 1000, 1)} km` : u ? show(v, u, 2) : fmt(v, 2)) : String(v ?? '–'));
        box.append(h('table', null, h('thead', null, h('tr', null, ['Metric', 'A', 'B', 'Change'].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
          h('tbody', null, cmp.rows.map((r) => h('tr', null, h('td', null, r.label), h('td', { class: 'num' }, fmtv(r.a, r.unit)), h('td', { class: 'num' }, fmtv(r.b, r.unit)), h('td', { class: 'num' }, r.delta != null ? `${r.delta >= 0 ? '+' : ''}${fmtv(r.delta, r.unit)}${r.rel != null && Math.abs(r.rel) < 50 ? ` (${(100 * r.rel).toFixed(1)} %)` : ''}` : (r.a === r.b ? '=' : '≠')))))));
        if (cmp.failuresFixed.length) box.append(h('div', { class: 'callout ok' }, `Failures fixed: ${cmp.failuresFixed.join(', ')}`));
        if (cmp.failuresIntroduced.length) box.append(h('div', { class: 'callout bad' }, `New failures: ${cmp.failuresIntroduced.join(', ')}`));
        if (cmp.failuresRemaining.length) box.append(h('div', { class: 'callout warn' }, `Still failing: ${cmp.failuresRemaining.join(', ')}`));
      } catch (e) { box.append(h('p', { class: 'bad' }, `Could not open B: ${e.message}`)); }
      return panel('Compare with another run', box);
    }

    async function render() {
      clear(page); page.append(head());
      if (!S.runId || !S.data) { page.append(S.runId ? h('p', { class: 'muted' }, 'Loading') : noRunHint(app)); return; }
      page.append(simplePanel());
      const tb = tabs([['overview', 'Overview'], ['failures', `Failures (${(S.data.record.result?.failures ?? []).length})`], ['metrics', 'Metrics & timeline'], ['compare', 'Compare runs'], ['report', 'Report'], ...(atLeast(app.settings.mode, 'expert') ? [['expert', t('lv.tab.expert', 'Expert data')]] : [])], S.tab, (t) => { S.tab = t; render(); });
      const wrap = h('div', { class: 'col std-only' }); page.append(wrap);
      wrap.append(tb);
      if (S.tab === 'overview') {
        wrap.append(verdictPanel(), h('div', { class: 'grid g2' }, findingsPanel(), dvPanel() ?? h('span')));
        const lv = app.settings.mode;
        if (atLeast(lv, 'student')) { try { const rf = runFormulas(S.data.record, S.data.telemetry, S.data.m); if (rf) wrap.append(rf); } catch (e) { console.warn(e); } }
        if (atLeast(lv, 'engineer')) { try { const bp = runBudgetPanel(S.data.m, S.data.telemetry); wrap.append(h('div', { class: 'grid g2' }, bp ?? h('span'), trajectoryPanel(S.data.telemetry))); } catch (e) { console.warn(e); } }
        if ((S.data.record.result?.failures ?? []).length) wrap.append(failuresPanel());
      }
      else if (S.tab === 'expert') wrap.append(rawTelemetryPanel(app, S.data.telemetry, S.data.record.name), monteCarloPanel(app), physicsOptionsPanel(app));
      else if (S.tab === 'failures') wrap.append(failuresPanel());
      else if (S.tab === 'metrics') wrap.append(h('div', { class: 'grid g2' }, metricsPanel(), timelinePanel()), debrisPanel());
      else if (S.tab === 'compare') { const p = await comparePanel(); if (S.tab === 'compare') wrap.append(p); }
      else wrap.append(exports(), panel('What the report contains', h('p', { class: 'muted' }, 'Verdict, findings, design, timeline, failures with causes and fixes, eight charts, and the modelling assumptions.')));
    }
    load();
    const off = app.on('run-deleted', () => { S.runId = currentRunId(app, {}); load(); });
    return () => { disposed = true; off(); };
  },
};
