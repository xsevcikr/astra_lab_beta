// Failure analysis: WHY a flight failed (timeline with measured numbers), fixes whose size is computed, and "Apply this fix and re-fly".
import { h, clear, toast, fmt, fmtTime } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { panel, equation, confBadge, emptyState } from '../lib/widgets.js';
import { runSelect, currentRunId, noRunHint } from '../lib/runpick.js';
import { runMetrics, chartSeries } from '../../src/core/run-analysis.js';
import { diagnose, resolveSearchFix, applyFix, beforeAfter, opsText } from '../../src/core/failure-analysis.js';
import { CHANNEL_META } from '../../physics/telemetry.js';
import { drawEvidence } from '../lib/proviews.js';
import { proState, exportProPdf } from '../lib/export.js';
import { designLimits } from '../../src/core/requirements.js';

const DISPLAY = { alt: [1e-3, 'km'], peri: [1e-3, 'km'], apo: [1e-3, 'km'], q: [1e-3, 'kPa'], thrust: [1e-3, 'kN'] };
const HOW = { 'rocket equation': 'Rocket equation', 'static analysis': 'Vehicle analysis', 'test flights': 'Test flights', none: 'Idea' };
const HOW_TIP = { 'rocket equation': 'Computed with the rocket equation on the vehicle mass model, then checked with test flights.', 'static analysis': 'Computed from the mass and thrust of the vehicle (static analysis).', 'test flights': 'Found by flying the real simulator with different values.', none: 'Not computed. A suggestion from the failure detector.' };

export default {
  id: 'failure', title: 'Failure analysis',
  mount(root, app, params) {
    const S = { runId: currentRunId(app, params), data: null, m: null, d: null, sel: null, busy: null, stop: false };
    const page = h('div', { class: 'page' }); root.append(page);
    let disposed = false;
    const beginner = () => document.body.dataset.mode === 'beginner';
    const st = () => proState(app);

    async function load() {
      S.data = null; S.d = null; S.sel = null;
      if (S.runId) {
        try {
          S.data = await app.getRun(S.runId); S.m = runMetrics(S.data.record, S.data.telemetry); S.d = diagnose(S.data.record, S.data.telemetry, S.m);
          const res = st().resolved[S.data.record.id]; if (res) S.d.fixes = S.d.fixes.map((f) => res[f.code] ?? f);
          app.selectedRun = S.runId;
        } catch (e) { toast(`Cannot open it: ${e.message}`, 'bad', 8000); }
      }
      if (!disposed) render();
    }

    function head() {
      return h('div', { class: 'page-head' },
        h('div', { class: 'grow' }, h('h1', { class: 'beginner-only' }, 'Why did it fail?'), h('h1', { class: 'std-only' }, 'Failure analysis'),
          h('p', { class: 'beginner-only' }, 'Second by second, with a fix.'),
          h('p', { class: 'std-only' }, 'Events, the failure detector and telemetry on one timeline. Each fix is sized by the rocket equation, static analysis or test flights.')),
        app.project.runs.length ? h('div', { class: 'row' }, runSelect(app, S.runId, (id) => { S.runId = id; load(); })) : null);
    }

    function verdict() {
      const { d } = S, res = S.data.record.result ?? {};
      const cls = d.status === 'OK' ? 'ok' : d.status === 'PARTIAL' ? 'partial' : '';
      const ico = icon(d.status === 'OK' ? 'check' : d.status === 'PARTIAL' ? 'warning' : 'cross', { size: 34 });
      const title = d.status === 'OK' ? 'This flight worked.' : d.status === 'PARTIAL' ? (res.status === 'SUCCESS' ? 'It worked, with warnings.' : 'It almost worked.') : 'The flight failed.';
      return h('div', { class: `pro-verdict ${cls}`, id: 'fail-verdict' }, h('div', { class: 'pro-ico' }, ico),
        h('div', { class: 'grow' }, h('h2', null, title), h('div', null, d.headline),
          h('div', { class: 'muted', style: { marginTop: '4px' } }, `${res.status}: ${res.reason ?? ''}`)),
        h('div', { class: 'col', style: { gap: '6px' } },
          h('button', { class: 'btn', id: 'fail-pdf', onclick: () => exportProPdf(app, S.runId) }, beginner() ? 'Save report' : 'Mission report (PDF)'),
          h('button', { class: 'btn small', onclick: () => app.navigate('requirements', { runId: S.runId }) }, beginner() ? 'Rules check' : 'Requirements')));
    }

    function evidenceChart(item) {
      const ch = item.ch; if (!ch || !S.data.telemetry.count) return null;
      const [scale, unitShown] = DISPLAY[ch] ?? [1, CHANNEL_META[ch]?.unit ?? ''];
      const cs = chartSeries(S.data.telemetry, [ch], 500);
      const canvas = h('canvas', { class: 'pro-canvas', id: 'fail-chart', style: { width: '100%', height: '170px', display: 'block' } });
      const lim = designLimits(S.data.record.vehicle);
      const limit = ch === 'q' && lim.qLimit ? { value: lim.qLimit * scale, label: 'rating' } : ch === 'gload' && lim.gLimit ? { value: lim.gLimit, label: 'rating' } : ch === 'structRatio' ? { value: 1, label: 'limit' } : ch === 'twr' ? { value: 1.2, label: 'needed 1.2' } : null;
      setTimeout(() => drawEvidence(canvas, { t: cs.t, y: cs.series[ch].map((v) => v * scale), label: CHANNEL_META[ch]?.label ?? ch, unit: unitShown, mark: { t: item.t, label: item.title.slice(0, 28) }, limit }), 30);
      return canvas;
    }

    function timelinePanel() {
      const items = S.d.timeline;
      const ul = h('ul', { class: 'pro-tl', id: 'fail-timeline' }, items.map((e, i) => h('li', { class: `${e.level} ${i === S.sel ? 'sel' : ''} ${e.level === 'info' ? 'std-only' : ''}`, 'data-t': e.t.toFixed(1), onclick: () => { S.sel = S.sel === i ? null : i; render(); } },
        h('span', { class: 't' }, fmtTime(e.t)), h('span', { class: 'd' }), h('div', null, h('div', { class: 'tt' }, e.title), e.detail ? h('div', { class: 'dd' }, e.detail) : null))));
      const sel = S.sel != null ? items[S.sel] : null;
      return panel('Second by second', h('div', { class: 'col' }, ul, sel ? h('div', null, h('div', { class: 'muted', style: { fontSize: '12px' } }, `Measured: ${CHANNEL_META[sel.ch]?.label ?? 'altitude'} (marked at ${fmtTime(sel.t)})`), evidenceChart(sel)) : h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Tap a line to see the measurement behind it.')));
    }

    function causesPanel() {
      const cs = S.d.causes; if (!cs.length) return null;
      return panel(`Causes (${cs.length})`, h('div', { class: 'col' }, cs.map((c, i) => h('details', { class: 'more', open: i === 0 || null },
        h('summary', null, confBadge(c.confidence), ' ', c.title, h('span', { class: 'muted' }, `  ${fmtTime(c.t)}`), i === 0 ? h('span', { class: 'pro-tag bad' }, 'first') : null),
        h('div', { class: 'col', style: { marginTop: '8px' } },
          h('div', null, h('b', null, 'Cause: '), c.cause),
          c.contributing?.length ? h('ul', { style: { margin: 0, paddingLeft: '18px' } }, c.contributing.map((x) => h('li', null, x))) : null,
          c.evidence?.length ? h('table', { class: 'pro-ba' }, h('tbody', null, c.evidence.map((e) => h('tr', null, h('td', null, e.label), h('td', null, `${Number.isFinite(e.value) ? Number(e.value.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 3 }) : e.value} ${e.unit ?? ''}`))))) : null,
          c.equation ? equation(c.equation.name, c.equation.formula, c.equation.values) : null,
          c.consequences ? h('div', { class: 'muted' }, c.consequences) : null)))), { cls: 'std-only' });
    }

    // ------------------------------------------------------------ fixes
    function fixCard(f) {
      const can = (f.canApply || f.search) && !S.busy && !app.api.ctx.running;
      const busy = S.busy?.code === f.code;
      return h('div', { class: 'pro-fix', 'data-fix': f.code },
        h('div', { class: 'row' }, h('h4', null, f.title), h('span', { class: 'pro-how', title: HOW_TIP[f.how] ?? '' }, HOW[f.how] ?? f.how)),
        f.number ? h('div', null, h('div', { class: 'pro-num' }, f.number.text), h('div', { class: 'muted', style: { fontSize: '12px' } }, f.number.label)) : null,
        f.plain ? h('div', { class: 'beginner-only' }, f.plain) : null,
        f.detail ? h('div', { class: 'muted std-only', style: { fontSize: '12.5px' } }, f.detail) : null,
        f.alt ? h('div', { class: 'std-only' }, `${f.alt.label}: ${f.alt.value} ${f.alt.unit}`) : null,
        f.ops?.length ? h('div', { class: 'mono muted adv-only', style: { fontSize: '12px' } }, opsText(f.ops)) : null,
        f.ideas?.length ? h('details', { class: 'std-only' }, h('summary', { class: 'muted' }, 'More ideas (not tested)'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, f.ideas.map((x) => h('li', null, x)))) : null,
        f.canApply || f.search ? h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: `fix-apply-${f.code}`, disabled: !can, onclick: () => applyAndRefly(f) }, h('span', { class: 'beginner-only' }, 'Fix it and fly again'), h('span', { class: 'std-only' }, 'Apply this fix and re-fly')),
          busy ? h('button', { class: 'btn danger', onclick: () => (S.stop = true) }, 'Stop') : null) : null,
        busy ? h('div', { class: 'pro-prog', id: 'fail-progress' }, h('div', { class: 'progress' }, h('div', { style: { width: `${S.busy.pct ?? 4}%` } })), h('div', { class: 'muted' }, S.busy.text)) : null);
    }
    function fixesPanel() {
      const fx = S.d.fixes; if (!fx.length) return null;
      return panel(beginner() ? 'How to fix it' : 'Suggested fixes', h('div', { class: 'col' },
        h('div', { class: 'pro-fixgrid' }, fx.map(fixCard)),
        h('p', { class: 'muted', style: { fontSize: '12.5px', margin: 0 } }, beginner() ? 'This changes your rocket and flies again. You can undo.' : 'Applying changes the vehicle through the tool API as ONE undo step, then flies the mission again with the same pitch programme settings. The result is shown honestly, even when it still fails.')));
    }

    function setBusy(code, text, pct) { S.busy = { code, text, pct }; const el = document.getElementById('fail-progress'); if (el) { el.lastChild.textContent = text; el.firstChild.firstChild.style.width = `${pct ?? 4}%`; } }
    async function applyAndRefly(fix) {
      if (S.busy || app.api.ctx.running) return;
      const rec = S.data.record, vid = rec.vehicle.id;
      if (!app.project.vehicles[vid]) { toast('That rocket is gone, so the fix cannot be applied.', 'bad', 8000); return; }
      S.stop = false; setBusy(fix.code, 'Starting', 4); render();
      app.api.ctx.running = true;
      let f = fix;
      try {
        if (f.search && !f.resolved) {
          const n = f.search.candidates.length;
          let done = 0;
          const res = await resolveSearchFix(f, rec, { shouldStop: () => S.stop, onTry: (t) => { done = Math.min(n, done + 1); setBusy(fix.code, `Test flight ${done} of ${n}: ${t.status}`, 5 + (90 * done) / (n + 1)); } });
          const store = (st().resolved[rec.id] ??= {}); store[fix.code] = res.fix;
          if (!res.ok) { S.busy = null; app.api.ctx.running = false; S.d.fixes = S.d.fixes.map((x) => (x.code === fix.code ? res.fix : x)); toast(S.stop ? 'Stopped.' : 'No test flight fixed it. Nothing changed.', 'bad', 8000); render(); return; }
          f = res.fix; S.d.fixes = S.d.fixes.map((x) => (x.code === fix.code ? f : x));
        }
      } catch (e) { S.busy = null; app.api.ctx.running = false; toast(`Test flights failed: ${e.message}`, 'bad', 8000); render(); return; }
      app.api.ctx.running = false;
      setBusy(fix.code, 'Changing the design', 92);
      const ap = await applyFix(app.api, f, vid, { commit: (l) => app.commit(l) });
      if (!ap.ok) { S.busy = null; toast(ap.message, 'bad', 9000); render(); return; }
      setBusy(fix.code, 'Flying the new rocket', 95);
      const tune = !!rec.meta?.tunedCandidates?.length;
      const run = await app.runFast({ tune });
      S.busy = null;
      if (!run.ok) { toast(run.message, 'bad', 9000); render(); return; }
      const after = await app.getRun(run.data.runId); const mB = runMetrics(after.record, after.telemetry);
      const ba = beforeAfter(rec, S.m, after.record, mB);
      st().after = { ...ba, applied: f.title, beforeRunId: rec.id, afterRunId: after.record.id, afterName: after.record.name, missionChanged: after.record.mission.name !== rec.mission.name };
      toast(ba.text, ba.verdict === 'FIXED' ? 'ok' : 'warn', 9000);
      render();
    }

    function afterPanel() {
      const a = st().after; if (!a || (a.beforeRunId !== S.runId && a.afterRunId !== S.runId)) return null;
      const cls = a.verdict === 'FIXED' || a.verdict === 'STILL_OK' ? 'ok' : a.verdict === 'IMPROVED' ? 'warn' : 'bad';
      const cell = (r, v) => (typeof v === 'number' ? fmt(v, Math.abs(v) < 100 ? 2 : 0) : String(v ?? '–'));
      return panel('Before and after', h('div', { class: 'col', id: 'fail-after' },
        h('div', { class: `callout ${cls}`, style: { fontSize: '14px', padding: '10px 14px' } }, h('b', null, a.text), h('div', { class: 'muted' }, `Applied: ${a.applied}.${a.missionChanged ? ' Note: the project mission now has a different name than the one that flew first.' : ''}`)),
        h('table', { class: 'pro-ba' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Before'), h('th', null, 'After'))),
          h('tbody', null, a.rows.map((r) => h('tr', null, h('td', null, `${r.label}${r.unit ? ` [${r.unit}]` : ''}`), h('td', null, cell(r, r.a)), h('td', { class: r.key === 'status' ? (r.b === 'SUCCESS' ? 'after-ok' : 'after-bad') : '' }, cell(r, r.b)))))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', id: 'fail-undo', onclick: () => { app.undo(); setTimeout(render, 50); } }, 'Undo this fix'),
          a.afterRunId !== S.runId ? h('button', { class: 'btn primary', id: 'fail-open-new', onclick: () => { S.runId = a.afterRunId; load(); } }, a.verdict === 'FIXED' ? 'Open the new flight' : 'Analyse the new flight') : null,
          h('button', { class: 'btn', onclick: () => exportProPdf(app, a.afterRunId) }, 'Report for the new flight'))));
    }

    function render() {
      if (disposed) return;
      clear(page); page.append(head());
      if (!app.project.runs.length) { page.append(noRunHint(app)); return; }
      if (!S.data) { page.append(h('p', { class: 'muted' }, 'Loading')); return; }
      page.append(verdict(), h('div', { class: 'col' }, afterPanel(), timelinePanel(), fixesPanel(), causesPanel(),
        S.d.status === 'OK' && !S.d.fixes.length ? emptyState('Nothing to fix', 'Every goal was met.', [h('button', { class: 'btn', onclick: () => app.navigate('requirements', { runId: S.runId }) }, 'Check the rules')]) : null));
    }
    load();
    const off = app.on('run-deleted', () => { S.runId = currentRunId(app, {}); load(); });
    return () => { disposed = true; off(); };
  },
};
