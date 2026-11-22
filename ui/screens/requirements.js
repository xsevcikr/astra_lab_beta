// Mission requirements checklist: editable limits, each one checked against the selected run (measured values, margins, evidence chart).
import { h, clear, toast, fmt } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { panel, select, tabs, saveFile, pickFile } from '../lib/widgets.js';
import { runSelect, currentRunId, noRunHint } from '../lib/runpick.js';
import { runMetrics, chartSeries } from '../../src/core/run-analysis.js';
import { summarize, CUSTOM_METRICS, requirementText } from '../../src/core/requirements.js';
import { CHANNEL_META } from '../../physics/telemetry.js';
import { drawEvidence } from '../lib/proviews.js';
import { reqStore, requirementsFor, evaluateFor, exportProPdf } from '../lib/export.js';
import { buildTrace, changeImpact, traceToCSV, traceToMarkdown, traceToReqIF, parseRequirementsCSV } from '../../src/core/traceability.js';
import { defaultRequirements } from '../../src/core/requirements.js';

const STATUS_CLS = { VERIFIED: 'pass', FAILED: 'fail', 'NOT VERIFIED': 'na', WAIVED: 'off' };
const STATUS_WORD = { VERIFIED: 'Verified', FAILED: 'Failed', 'NOT VERIFIED': 'Not verified', WAIVED: 'Waived' };

const DISPLAY = { alt: [1e-3, 'km'], peri: [1e-3, 'km'], apo: [1e-3, 'km'], q: [1e-3, 'kPa'], thrust: [1e-3, 'kN'] };
const ICON = { PASS: 'check', FAIL: 'cross', 'N/A': null, OFF: null };
const VERDICT_WORD = { PASS: 'Pass', FAIL: 'Fail', 'N/A': 'No data', OFF: 'Off' };

export default {
  id: 'requirements', title: 'Mission requirements',
  mount(root, app, params) {
    const S = { runId: currentRunId(app, params), data: null, m: null, rows: [], open: null, adding: { metric: 'maxG', op: '<=', limit: 6 }, view: params?.view === 'trace' ? 'trace' : 'checklist', history: null, impactRun: '', busy: false };
    const page = h('div', { class: 'page' }); root.append(page);
    let disposed = false;
    const beginner = () => document.body.dataset.mode === 'beginner';

    async function load() {
      S.data = null; S.rows = [];
      if (S.runId) {
        try { S.data = await app.getRun(S.runId); S.m = runMetrics(S.data.record, S.data.telemetry); app.selectedRun = S.runId; recompute(); }
        catch (e) { toast(`Cannot open the recording: ${e.message}`, 'bad', 8000); }
      }
      if (!disposed) render();
    }
    function recompute() { S.rows = evaluateFor(app, S.data, S.m); }

    // ---------------------------------------------------------------- 2.9 traceability view
    const trace = () => buildTrace({ reqs: requirementsFor(app, S.data.record, S.m), rows: S.rows, record: S.data.record, history: S.history ?? [] });
    const fileBase = () => S.data.record.name.replace(/[^\w.-]+/g, '_');
    async function checkAllRuns() {
      const veh = S.data.record.vehicle?.name; S.busy = true; render();
      const out = [];
      try {
        for (const meta of app.project.runs.slice(-25)) {
          try { const d = await app.getRun(meta.id); if (d.record.vehicle?.name !== veh) continue; const m = runMetrics(d.record, d.telemetry); out.push({ runId: meta.id, name: d.record.name, created: d.record.created, rows: evaluateFor(app, d, m) }); }
          catch { /* a damaged recording is skipped */ }
        }
        S.history = out; toast(`Checked ${out.length} run${out.length === 1 ? '' : 's'} of ${veh}.`, 'ok');
      } finally { S.busy = false; if (!disposed) render(); }
    }
    async function importCsv() {
      const f = await pickFile('.csv,.txt'); if (!f) return;
      try {
        const res = parseRequirementsCSV(f.text, defaultRequirements(S.data.record, { m: S.m }));
        const st = reqStore(app);
        for (const [id, o] of Object.entries(res.overrides)) st.overrides[id] = { ...(st.overrides[id] ?? {}), ...o };
        st.custom.push(...res.custom); app.markDirty(); recompute(); render();
        toast(`Imported ${Object.keys(res.overrides).length} limit change(s) and ${res.custom.length} new requirement(s).${res.skipped.length ? ` Skipped ${res.skipped.length}: line ${res.skipped[0].line} (${res.skipped[0].reason}).` : ''}`, res.skipped.length ? 'warn' : 'ok', 10000);
      } catch (e) { toast(`Could not import: ${e.message}`, 'bad', 9000); }
    }
    function traceView() {
      const T = trace(), c = T.coverage;
      const cls = c.failed ? 'bad' : c.notVerified.length ? 'warn' : 'ok';
      const cov = h('div', { class: `pro-summary ${cls}`, id: 'trace-summary' },
        h('div', { class: 'pro-big' }, h('b', null, `${c.verified} of ${c.requirements}`), ' verified'),
        h('span', null, `${c.failed} failed, ${c.notVerified.length} not verified${c.waived ? `, ${c.waived} waived` : ''}`),
        h('span', { class: 'muted' }, `${c.componentsTraced} of ${c.components} parts trace to a requirement`),
        h('span', { class: 'muted', title: 'T = test (simulated flight), A = analysis, I = inspection, D = demonstration' }, `Method: ${Object.entries(c.byMethod).filter(([, n]) => n).map(([m, n]) => `${m} ${n}`).join(', ')}`),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn', id: 'trace-history', disabled: S.busy, title: 'Evaluate the same requirements on every recorded run of this vehicle (up to 25)', onclick: checkAllRuns }, S.busy ? 'Checking…' : 'Check all runs of this vehicle'),
        h('button', { class: 'btn', id: 'trace-csv', onclick: () => saveFile(app, `${fileBase()}-traceability.csv`, traceToCSV(T), 'text/csv') }, 'Matrix (CSV)'),
        h('button', { class: 'btn', id: 'trace-md', onclick: () => saveFile(app, `${fileBase()}-traceability.md`, traceToMarkdown(T), 'text/markdown') }, 'Markdown'),
        h('button', { class: 'btn', id: 'trace-reqif', title: 'ReqIF 1.2: opens in DOORS Next, Polarion, Jama, Capella', onclick: () => saveFile(app, `${fileBase()}.reqif`, traceToReqIF(T), 'application/xml') }, 'ReqIF'),
        h('button', { class: 'btn', id: 'trace-import', title: 'CSV with columns id or metric, op, limit, label, enabled', onclick: importCsv }, 'Import requirements (CSV)…'));
      const chips = (i) => {
        if (i.wholeVehicle) return h('span', { class: 'muted' }, 'whole vehicle');
        if (!i.allocated.length) return h('span', { class: 'muted' }, 'no matching part');
        const shown = i.allocated.slice(0, 4);
        return h('span', { title: `${i.allocationRule}: ${i.allocated.map((a) => a.name).join(', ')}` }, shown.map((a) => h('span', { class: 'pro-chip trace-chip' }, a.name)), i.allocated.length > 4 ? h('span', { class: 'muted' }, ` +${i.allocated.length - 4} more`) : null);
      };
      const hist = (i) => (i.history.length ? h('span', { class: 'pro-dots' }, i.history.map((x) => h('span', { class: `pro-dot ${x.verdict === 'PASS' ? 'ok' : x.verdict === 'FAIL' ? 'bad' : ''}`, title: `${x.name}: ${x.verdict}` }))) : h('span', { class: 'muted' }, '-'));
      const table = h('table', { class: 'pro-table', id: 'trace-table' },
        h('thead', null, h('tr', null, ['ID', 'Requirement', 'Subsystem', 'Method', 'Allocated to', 'Status', 'Evidence', S.history ? 'All runs' : null].filter((x) => x != null).map((t) => h('th', null, t)))),
        h('tbody', null,
          h('tr', { class: 'trace-need' }, h('td', null, h('b', null, T.need.id)), h('td', { colspan: S.history ? 7 : 6 }, h('b', null, T.need.text), h('span', { class: 'muted' }, ` — ${T.need.source}`))),
          T.items.map((i) => h('tr', { class: `pro-v-${STATUS_CLS[i.status]}`, 'data-trace': i.key },
            h('td', { style: { whiteSpace: 'nowrap' } }, i.id),
            h('td', null, i.text, h('div', { class: 'muted', style: { fontSize: '11.5px' } }, i.source)),
            h('td', null, i.subsystem), h('td', { title: i.methodName }, i.method),
            h('td', null, chips(i)),
            h('td', { style: { whiteSpace: 'nowrap' } }, h('span', { class: 'pro-badge' }, i.status === 'VERIFIED' ? icon('check', { size: 13 }) : i.status === 'FAILED' ? icon('cross', { size: 13 }) : ''), STATUS_WORD[i.status]),
            h('td', null, i.evidence ? [i.evidence.measured, i.evidence.channel ? h('div', { class: 'muted', style: { fontSize: '11.5px' } }, `${CHANNEL_META[i.evidence.channel]?.label ?? i.evidence.channel} at T+${fmt(i.evidence.t ?? 0, 0)} s, margin ${i.evidence.margin}`) : null] : h('span', { class: 'muted' }, 'no evidence in this run')),
            S.history ? h('td', null, hist(i)) : null))));
      // change impact against another run
      const others = app.runList().filter((r) => r.id !== S.runId);
      let impactBox = null;
      if (S.impactRun && S.impactData) {
        const imp = changeImpact(S.impactData.record, S.data.record, requirementsFor(app, S.data.record, S.m));
        impactBox = h('div', { id: 'trace-impact', class: 'col', style: { marginTop: '8px' } },
          imp.changes.length ? h('ul', null, imp.changes.map((ch) => h('li', null, h('b', null, ch.what), ch.name ? `: ${ch.name}` : '', ch.detail ? h('span', { class: 'muted' }, ` (${ch.detail})`) : null))) : h('div', { class: 'muted' }, 'The two runs have the same vehicle, mission and environment.'),
          imp.retest.length ? h('div', null, h('b', null, `Check again (${imp.retest.length}): `), imp.retest.map((r) => h('div', null, `${r.id} — ${r.reason}`))) : null,
          imp.unaffected.length ? h('div', { class: 'muted' }, `Not affected: ${imp.unaffected.join(', ')}`) : null);
      }
      const impact = panel('What changed since another run, and what must be checked again', h('div', { class: 'col' },
        h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Earlier run'),
          select([['', 'choose a run…'], ...others.map((r) => [r.id, `${r.name} — ${r.status ?? '?'}`])], S.impactRun, async (id) => { S.impactRun = id; S.impactData = id ? await app.getRun(id).catch(() => null) : null; render(); }, { id: 'trace-impact-run' })),
        impactBox));
      const orphans = c.orphans.length ? h('p', { class: 'muted', id: 'trace-orphans' }, `Parts with no requirement (consider adding one, or removing the part): ${c.orphans.map((o) => o.name).join(', ')}.`) : null;
      return [cov, panel(null, table, { cls: 'flush' }), orphans,
        h('p', { class: 'muted', style: { fontSize: '12.5px' } }, `Configuration: run ${T.configuration.runName}${T.configuration.inputsFingerprint ? `, input fingerprint ${T.configuration.inputsFingerprint}` : ''}. Every status comes from the recorded run; allocation follows the part types (engines, tanks, rated structure, thermal hardware, power, mobility).`),
        others.length ? impact : null];
    }
    function setOverride(id, patch) { const st = reqStore(app); st.overrides[id] = { ...(st.overrides[id] ?? {}), ...patch }; app.markDirty(); recompute(); setTimeout(render, 0); }

    function head() {
      return h('div', { class: 'page-head' },
        h('div', { class: 'grow' }, h('h1', { class: 'beginner-only' }, 'Did it meet the rules?'), h('h1', { class: 'std-only' }, 'Mission requirements'),
          h('p', { class: 'beginner-only' }, 'Each row is one rule for your rocket. We check it against the flight.'),
          h('p', { class: 'std-only' }, 'Every limit is compared with a value measured in the selected run, or computed from the design that flew. Edit a limit and the verdict updates.')),
        app.project.runs.length ? h('div', { class: 'col', style: { alignItems: 'flex-end', gap: '6px' } },
          h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Run'), runSelect(app, S.runId, (id) => { S.runId = id; S.open = null; S.history = null; load(); })),
          h('div', { class: 'std-only', id: 'req-view-tabs' }, tabs([['checklist', 'Checklist'], ['trace', 'Traceability']], S.view, (v) => { S.view = v; render(); }))) : null);
    }

    function summaryBar() {
      const s = summarize(S.rows);
      const cls = s.fail === 0 && s.total ? 'ok' : s.pass === 0 ? 'bad' : 'warn';
      return h('div', { class: `pro-summary ${cls}`, id: 'req-summary' },
        h('div', { class: 'pro-big' }, h('b', null, `${s.pass} of ${s.total}`), beginner() ? ' rules passed' : ' requirements met'),
        h('div', { class: 'pro-dots' }, S.rows.filter((r) => r.verdict === 'PASS' || r.verdict === 'FAIL').map((r) => h('span', { class: `pro-dot ${r.verdict === 'PASS' ? 'ok' : 'bad'}`, title: r.label }))),
        s.na ? h('span', { class: 'muted' }, `${s.na} not checkable`) : null,
        h('div', { class: 'grow' }),
        h('button', { class: 'btn primary', id: 'req-pdf', onclick: () => exportProPdf(app, S.runId) }, beginner() ? 'Save report' : 'Mission report (PDF)'),
        s.fail ? h('button', { class: 'btn', id: 'req-why', onclick: () => app.navigate('failure', { runId: S.runId }) }, beginner() ? 'Why did it fail?' : 'Failure analysis') : null);
    }

    function limitCell(r) {
      if (r.op === 'is') return h('span', { class: 'muted' }, 'must be met');
      if (beginner()) return h('span', null, r.req);
      const scale = r.scale ?? 1;
      const inp = (key, val, step, w = '86px') => h('input', { class: 'input num', type: 'number', step, value: +Number(val).toPrecision(6), style: { width: w }, 'aria-label': `limit for ${r.label}`, onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setOverride(r.id, key === 'tol' ? { tol: v / 100 } : { limit: v / scale }); } });
      if (r.op === 'range') return h('span', { class: 'row', style: { gap: '4px' } }, '± ', inp('tol', 100 * r.tol, 0.5, '64px'), ' % of ', fmt(r.limit / 1000, 0), ' km');
      return h('span', { class: 'row', style: { gap: '4px' } }, r.op === '<=' ? 'at most' : 'at least', Number.isFinite(r.limit) ? inp('limit', r.limit * scale, 'any') : h('button', { class: 'btn small', onclick: () => setOverride(r.id, { limit: 1 / scale }) }, 'set a limit'), r.unit);
    }

    function evidenceRow(r) {
      const ev = r.evidence; const td = h('td', { colspan: 6, class: 'pro-evidence' });
      if (!ev?.channel) { td.append(h('span', { class: 'muted' }, 'No chart for this value.')); return h('tr', { class: 'pro-evrow' }, td); }
      const [scale, unitShown] = DISPLAY[ev.channel] ?? [1, CHANNEL_META[ev.channel]?.unit ?? ''];
      const chans = [ev.channel, ev.channel2].filter(Boolean);
      const cs = chartSeries(S.data.telemetry, chans, 500);
      const canvas = h('canvas', { class: 'pro-canvas', id: `req-ev-${r.id}`, style: { width: '100%', height: '170px', display: 'block' } });
      td.append(
        h('div', { class: 'pro-ev-text' }, h('b', null, 'Evidence: '), `${CHANNEL_META[ev.channel]?.label ?? ev.channel}`, ev.t != null ? ` at T+${fmt(ev.t, 0)} s` : '', h('span', { class: 'muted' }, ` — ${r.valueText}`)),
        canvas, ev.note ? h('div', { class: 'muted', style: { fontSize: '12px' } }, ev.note) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => app.navigate('telemetry', { runId: S.runId }) }, '∿ Open in Flight data'),
          h('button', { class: 'btn small', onclick: () => app.navigate('replay', { runId: S.runId }) }, '⟲ Replay')));
      const limitVal = r.op === 'range' ? ev.target : (r.metric === 'maxQ' || r.metric === 'structRatio' || r.metric === 'maxG' || r.metric === 'twr' || r.metric === 'thermRatio' || r.metric === 'maxTemp') && Number.isFinite(r.limit) ? r.limit : null;
      setTimeout(() => drawEvidence(canvas, {
        t: cs.t, y: cs.series[chans[0]].map((v) => v * scale), label: CHANNEL_META[chans[0]]?.label ?? chans[0], unit: unitShown,
        mark: ev.t != null ? { t: ev.t, label: `T+${fmt(ev.t, 0)} s` } : null, limit: limitVal != null ? { value: limitVal * scale, label: r.op === 'range' ? 'target' : 'limit' } : null,
        extra: chans[1] ? { y: cs.series[chans[1]].map((v) => v * scale) } : null,
      }), 30);
      return h('tr', { class: 'pro-evrow' }, td);
    }

    function table() {
      const rows = [];
      for (const r of S.rows) {
        const off = r.verdict === 'OFF';
        rows.push(h('tr', { class: `req-row pro-v-${r.verdict.replace('/', '').toLowerCase()} ${S.open === r.id ? 'sel' : ''}`, 'data-req': r.id },
          h('td', { class: 'req-verdict', title: VERDICT_WORD[r.verdict] }, h('span', { class: 'pro-badge' }, ICON[r.verdict] ? icon(ICON[r.verdict], { size: 13 }) : ''), h('span', { class: 'pro-vword' }, VERDICT_WORD[r.verdict])),
          h('td', null, h('div', { class: 'beginner-only' }, r.plain || r.label), h('div', { class: 'std-only' }, r.label), r.why ? h('div', { class: 'muted adv-only', style: { fontSize: '11.5px' } }, r.why) : null),
          h('td', null, limitCell(r)),
          h('td', { class: 'req-measured' }, off ? '–' : r.valueText),
          h('td', { class: `num req-margin ${r.verdict === 'PASS' ? 'ok' : r.verdict === 'FAIL' ? 'bad' : 'muted'}` }, off ? '–' : r.marginText),
          h('td', { class: 'req-actions' },
            r.evidence?.channel && !off ? h('button', { class: 'btn small', title: 'Show the measurement', onclick: () => { S.open = S.open === r.id ? null : r.id; render(); } }, S.open === r.id ? '▾ Hide' : '▸ Evidence') : null,
            h('label', { class: 'std-only', title: 'Check this requirement' }, h('input', { type: 'checkbox', checked: r.enabled, 'aria-label': `check ${r.label}`, onchange: (e) => setOverride(r.id, { enabled: e.target.checked }) })))));
        if (S.open === r.id) rows.push(evidenceRow(r));
      }
      return h('table', { class: 'pro-table', id: 'req-table' },
        h('thead', null, h('tr', null, ['', beginner() ? 'Rule' : 'Requirement', beginner() ? 'Needed' : 'Limit', 'Measured in the flight', beginner() ? 'Spare' : 'Margin', ''].map((t) => h('th', null, t)))),
        h('tbody', null, rows));
    }

    function adder() {
      const st = reqStore(app); const A = S.adding; const def = CUSTOM_METRICS[A.metric];
      const lbl = (m) => `${CUSTOM_METRICS[m].label}${CUSTOM_METRICS[m].unit ? ` [${CUSTOM_METRICS[m].unit}]` : ''}`;
      return panel('Add your own requirement', h('div', { class: 'col' },
        h('div', { class: 'row' },
          select(Object.keys(CUSTOM_METRICS).map((k) => [k, lbl(k)]), A.metric, (v) => { A.metric = v; A.op = CUSTOM_METRICS[v].op; render(); }, { id: 'req-add-metric' }),
          select([['<=', 'at most'], ['>=', 'at least']], A.op, (v) => (A.op = v), { id: 'req-add-op' }),
          h('input', { class: 'input num', id: 'req-add-limit', type: 'number', step: 'any', value: A.limit, style: { width: '96px' }, onchange: (e) => (A.limit = parseFloat(e.target.value)) }), def.unit,
          h('button', { class: 'btn primary', id: 'req-add', onclick: () => {
            if (!Number.isFinite(A.limit)) return toast('Type a number for the limit.', 'bad');
            st.custom.push({ id: `c${Date.now().toString(36)}`, metric: A.metric, op: A.op, limit: A.limit / def.scale, label: CUSTOM_METRICS[A.metric].label }); app.markDirty(); recompute(); render();
          } }, 'Add')),
        st.custom.length ? h('div', { class: 'muted' }, 'Your requirements: ', st.custom.map((c, i) => h('span', { class: 'pro-chip' }, `${c.label} ${requirementText({ ...c, ...CUSTOM_METRICS[c.metric], unit: CUSTOM_METRICS[c.metric].unit })}`, h('button', { class: 'pro-x', title: 'Remove', onclick: () => { st.custom.splice(i, 1); app.markDirty(); recompute(); render(); } }, '×')))) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'req-reset', onclick: () => { st.overrides = {}; st.custom = []; app.markDirty(); recompute(); render(); } }, 'Reset all limits to the defaults'))));
    }

    function render() {
      if (disposed) return;
      clear(page); page.append(head());
      if (!app.project.runs.length) { page.append(noRunHint(app)); return; }
      if (!S.data) { page.append(h('p', { class: 'muted' }, 'Loading…')); return; }
      if (S.view === 'trace' && !beginner()) { page.append(...traceView().filter(Boolean)); return; }
      page.append(summaryBar(), panel(null, table(), { cls: 'flush' }),
        h('p', { class: 'muted std-only', style: { fontSize: '12.5px' } }, 'Margin is the distance to the limit as a share of the limit; positive means the requirement is met with room to spare. Delivered payload is counted only when the mission goal was reached.'),
        h('div', { class: 'adv-only' }, adder()));
    }
    load();
    const off = app.on('run-deleted', () => { S.runId = currentRunId(app, {}); load(); });
    return () => { disposed = true; off(); };
  },
};
