// Flight data: six big cards (speed, height, engine push, fuel, heat, orbit) with a mini chart each.
// "More charts" (Standard / Advanced) opens the full graph builder with all recorded channels, in plain words.
import { h, clear, toast } from '../lib/dom.js';
import { state as unitState } from '../lib/units.js';
import { saveFile, emptyState, term } from '../lib/widgets.js';
import { atLeast } from '../../src/core/levels.js';
import { rawTelemetryPanel } from '../lib/levelkit.js';
import { t } from '../../src/core/i18n.js';
import { icon } from '../lib/icons.js';
import { Chart, seriesColor } from '../lib/charts.js';
import { CHANNELS, CHANNEL_META } from '../../physics/telemetry.js';
import { runSelect, currentRunId, noRunHint } from '../lib/runpick.js';
import { plainOf } from '../lib/channel-plain.js';
import { cleanColumn } from '../../src/core/numfmt.js';
import { dashboardCards, keyMoments, plainTime } from '../../src/core/plain-metrics.js';

const PRESETS = [
  ['Flight', [['alt', 'speed'], ['vSpeed', 'hSpeed'], ['gload'], ['mass', 'propMass']]],
  ['Engine', [['thrust'], ['throttle', 'twr'], ['mass', 'propMass'], ['gimbal']]],
  ['Air', [['q'], ['mach'], ['aoa'], ['drag', 'lift']]],
  ['Orbit', [['alt', 'apo', 'peri'], ['ecc'], ['speed'], ['incl']]],
  ['Heat & strength', [['tempLead', 'tempBody'], ['heatFlux'], ['structRatio', 'thermRatio']]],
  ['Power & radio', [['powerGen', 'powerUse'], ['batteryFrac'], ['commMargin'], ['data']]],
  ['Rover', [['groundSpeed'], ['odometer'], ['slip'], ['terrainSlope', 'sideSlope']]],
  ['Speed budget', [['dvIdeal', 'dvGrav', 'dvDrag', 'dvSteer']]],
];
const GROUP_NAMES = { time: 'Time', kinematics: 'Movement', mass: 'Weight & fuel', propulsion: 'Engine', aero: 'Air', orbit: 'Orbit', thermal: 'Heat', power: 'Power', comms: 'Radio', position: 'Position', orientation: 'Pointing & spin', budget: 'Speed budget', structure: 'Strength', events: 'Events', rover: 'Rover', environment: 'Surroundings' };

export default {
  id: 'telemetry', title: 'Flight data',
  mount(root, app, params) {
    const S = { runId: currentRunId(app, params), graphs: PRESETS[0][1].map((c) => [...c]), active: 0, preset: 'Flight', live: false, tel: null, record: null, more: false };
    if (app.live && !app.live.finished && params?.live) S.live = true;
    const page = h('div', { class: 'fd-page' }); root.append(page);
    let charts = [], cards = [], timer = 0, disposed = false;
    const imperial = () => unitState.system === 'imperial';
    const isRover = () => ((S.live ? app.live?.sim?.vehicleDef?.type : S.record?.vehicle?.type) ?? '') === 'rover';

    async function load() {
      if (S.live) { S.tel = app.live?.sim.telemetry ?? null; S.record = null; return; }
      if (!S.runId) { S.tel = null; return; }
      try { const r = await app.getRun(S.runId); S.tel = r.telemetry; S.record = r.record; } catch (e) { S.tel = null; toast(`Cannot open it: ${e.message}`, 'bad'); }
    }
    function head() {
      const live = app.live && !app.live.finished;
      return h('div', { class: 'fd-head' },
        h('h1', null, term('telemetry', t('nav.telemetry.plain', 'Flight data'))), h('span', { class: 'fd-sub' }, S.live ? t('fd.live', 'Live') : t('fd.big', 'This flight')),
        h('span', { style: { flex: 1 } }),
        app.project.runs.length ? runSelect(app, S.runId, async (id) => { S.runId = id; S.live = false; app.selectedRun = id; await load(); render(); }) : null,
        live ? h('button', { class: `btn ${S.live ? 'primary' : ''}`, id: 'tel-live', onclick: async () => { S.live = !S.live; await load(); render(); } }, S.live ? 'Live' : 'Show live') : null,
        h('button', { class: 'btn std-only', disabled: !S.tel?.count, onclick: exportCsv }, 'Export CSV'));
    }
    function exportCsv() {
      const ids = [...new Set(S.graphs.flat())]; const csv = S.tel.toCSV(['t', ...ids.filter((i) => i !== 't')]);
      saveFile(app, `telemetry-${(S.record?.name ?? 'live').replace(/[^\w.-]+/g, '_')}.csv`, csv, 'text/csv');
    }

    // ---------------------------------------------------------------- the six cards
    const seriesOf = (c, tel) => c.series.map((s, k) => {
      const raw = tel.column(s.id); const meta = CHANNEL_META[s.id];
      const values = cleanColumn(s.scaleBy || s.clampMin != null ? Float64Array.from(raw, (v) => Math.max(s.clampMin ?? -Infinity, v * (s.scaleBy ?? 1))) : raw, 1e-6);
      return { id: s.id, label: s.label, unit: s.unit ?? meta.unit, values, color: seriesColor(k) };
    });
    function cardsView() {
      const grid = h('div', { class: 'fd-grid', id: 'fd-cards' }); cards = [];
      const list = dashboardCards(S.tel, { mode: S.live ? 'live' : 'run', rover: isRover(), imperial: imperial() });
      for (const c of list) {
        const canvas = h('canvas', { class: 'chart fd-mini', title: 'Across: time in seconds' });
        const els = { icon: h('span', { class: 'fd-icon' }, icon(c.icon, { size: 20 })), title: h('span', { class: 'fd-title' }, t(`fd.${c.title}`, c.title)), dot: h('span', { class: 'fd-dot' }), big: h('span', { class: 'fd-big' }), unit: h('span', { class: 'fd-unit' }), cmp: h('div', { class: 'fd-cmp' }), sub: h('div', { class: 'fd-subline std-only' }), meaning: h('div', { class: 'fd-mean std-only' }) };
        const el = h('div', { class: 'fd-card', 'data-card': c.id }, h('div', { class: 'fd-card-head' }, els.icon, els.title, els.dot), h('div', { class: 'fd-num' }, els.big, els.unit), els.cmp, canvas, els.sub, els.meaning);
        grid.append(el);
        const chart = new Chart(canvas, { clean: true, xLabel: '', fill: c.series.length === 1, dot: S.live, yTicks: 3, xTicks: 4 });
        cards.push({ id: c.id, els, chart, spec: c });
      }
      return grid;
    }
    function fillCards() {
      if (!S.tel?.count) return;
      const list = dashboardCards(S.tel, { mode: S.live ? 'live' : 'run', rover: isRover(), imperial: imperial() });
      const tcol = S.tel.column('t');
      list.forEach((c, i) => {
        const v = cards[i]; if (!v) return; const e = v.els;
        e.title.textContent = t(`fd.${c.title}`, c.title); e.big.textContent = c.big; e.unit.textContent = c.unit; e.cmp.textContent = c.compare; e.meaning.textContent = c.meaning;
        e.sub.textContent = c.sub ?? ''; e.sub.style.display = c.sub ? '' : 'none';
        e.dot.className = `fd-dot ${c.status ?? ''}`; e.dot.title = c.status === 'bad' ? 'Danger' : c.status === 'warn' ? 'Careful' : c.status === 'ok' ? 'All fine' : '';
        v.chart.setData(tcol, seriesOf(c, S.tel));
      });
    }
    function momentsView() {
      const rec = S.record, ev = rec?.events ?? app.live?.sim.events ?? [];
      const obj = rec?.mission?.objective ?? app.live?.sim.mission?.objective;
      const ms = keyMoments(ev, S.tel, { objective: obj, failures: rec?.result?.failures ?? [], status: rec?.result?.status });
      if (!ms.length) return null;
      return h('div', { class: 'fd-moments', id: 'fd-moments' }, h('span', { class: 'fd-mtitle' }, 'Key moments'), ms.map((m) => h('span', { class: `fd-moment ${m.kind}`, title: m.text }, h('b', null, plainTime(m.t)), ' ', m.label)));
    }

    // ---------------------------------------------------------------- more charts (Standard / Advanced)
    function morePanel() {
      const wrap = h('div', { class: 'fd-more std-only' });
      wrap.append(h('div', { class: 'row' }, h('button', { class: 'btn', id: 'fd-more-btn', onclick: () => { S.more = !S.more; render(); } }, S.more ? 'Hide charts' : 'More charts'), h('span', { class: 'muted', style: { fontSize: '12.5px' } }, `${CHANNELS.length - 1} values recorded`)));
      if (!S.more) return wrap;
      const body = h('div', { class: 'fd-more-body' }); wrap.append(body);
      const left = h('div', { class: 'fd-picker' }), main = h('div', { class: 'fd-graphs' }); body.append(left, main);
      charts = [];
      S.graphs.forEach((g, i) => {
        const canvas = h('canvas', { class: 'chart fd-big-chart', style: { outline: i === S.active ? '1px solid var(--accent)' : 'none' } });
        const cap = h('div', { class: 'fd-cap' }); captionFor(cap, g);
        const box = h('div', { class: 'fd-chart-box' }, canvas, h('div', { class: 'fd-chart-x' }, S.graphs.length > 1 ? h('button', { class: 'btn small', title: 'Remove this graph', onclick: (e) => { e.stopPropagation(); S.graphs.splice(i, 1); S.active = Math.min(S.active, S.graphs.length - 1); render(); } }, '×') : null), cap);
        canvas.addEventListener('pointerdown', () => { if (S.active !== i) { S.active = i; chanPicker(left); charts.forEach((c, k) => (c.canvas.style.outline = k === i ? '1px solid var(--accent)' : 'none')); } });
        main.append(box); charts.push(Object.assign(new Chart(canvas, { clean: true, title: '', xTicks: 6 }), { cap }));
      });
      main.append(h('div', null, h('button', { class: 'btn', onclick: () => { S.graphs.push(['alt']); S.active = S.graphs.length - 1; S.preset = ''; render(); } }, '+ Add graph')));
      chanPicker(left); drawAll();
      return wrap;
    }
    function captionFor(cap, ids) {
      clear(cap);
      if (!ids.length) { cap.append(h('span', { class: 'muted' }, 'Tick a value on the left.')); return; }
      for (const [k, id] of ids.entries()) { const p = plainOf(id, CHANNEL_META[id]?.label); cap.append(h('div', { class: 'fd-cap-row' }, h('i', { style: { background: seriesColor(k) } }), h('b', null, p.name), h('span', null, ` ${p.meaning}`), h('span', { class: 'muted' }, ` Good: ${p.good}.`))); }
    }
    function chanPicker(left) {
      clear(left);
      left.append(h('div', { class: 'muted fd-lbl' }, 'Sets'));
      left.append(h('div', { class: 'row', style: { gap: '4px', marginBottom: '8px' } }, PRESETS.map(([n, g]) => h('button', { class: `chip ${S.preset === n ? 'active' : ''}`, onclick: () => { S.preset = n; S.graphs = g.map((c) => [...c]); S.active = 0; render(); } }, n))));
      left.append(h('div', { class: 'muted fd-lbl' }, `Graph ${S.active + 1}: tick values`));
      const box = h('div', { class: 'chan-list' }); left.append(box);
      const sel = new Set(S.graphs[S.active] ?? []);
      let grp = '';
      for (const [id, label, unit, group] of CHANNELS) {
        if (id === 't') continue;
        if (group !== grp) { grp = group; box.append(h('div', { class: 'gname' }, GROUP_NAMES[group] ?? group)); }
        const p = plainOf(id, label);
        const cb = h('input', { type: 'checkbox', checked: sel.has(id), onchange: () => { const cur = new Set(S.graphs[S.active]); cb.checked ? cur.add(id) : cur.delete(id); S.graphs[S.active] = [...cur]; S.preset = ''; captionFor(charts[S.active].cap, S.graphs[S.active]); drawAll(); } });
        box.append(h('label', { title: `${p.meaning} Good: ${p.good}.` }, cb, h('span', null, p.name), h('span', { class: 'muted adv-only', style: { marginLeft: 'auto', fontSize: '10.5px' } }, `${id} · ${unit}`)));
      }
    }
    function drawAll() {
      if (!S.tel?.count || !S.more) return;
      const tcol = S.tel.column('t'); const ev = S.record?.events ?? app.live?.sim.events ?? [];
      const markers = ev.filter((e) => !['MISSION_START', 'EVENT_DONE'].includes(e.kind)).map((e) => ({ t: e.t }));
      S.graphs.forEach((g, i) => {
        const c = charts[i]; if (!c) return; c.showMarkers = true;
        c.setData(tcol, g.map((id, k) => { const p = plainOf(id, CHANNEL_META[id].label); return { id, label: p.name, unit: CHANNEL_META[id].unit, values: cleanColumn(S.tel.column(id), 1e-6), color: seriesColor(k) }; }), markers);
      });
    }

    function render() {
      clear(page); charts = []; cards = [];
      page.append(head());
      if (!S.tel && !S.live) { page.append(noRunHint(app)); return; }
      if (!S.tel?.count) { page.append(emptyState('No data yet', S.live ? 'Numbers appear soon.' : 'No data in this flight.')); return; }
      page.append(cardsView());
      const mv = momentsView(); if (mv) page.append(mv);
      page.append(morePanel());
      if (atLeast(app.settings.mode, 'expert') && S.tel?.count) page.append(rawTelemetryPanel(app, S.tel, S.record?.name ?? 'live'));
      fillCards(); drawAll();
    }
    load().then(() => { if (!disposed) render(); });
    let lastMoments = -1;
    timer = setInterval(() => {
      if (!S.live || !app.live) return;
      S.tel = app.live.sim.telemetry;
      if (app.live.finished) { S.live = false; S.runId = app.live.runId; load().then(render); return; }
      if (!cards.length && S.tel.count > 2) { render(); return; }
      fillCards(); drawAll();
      const n = app.live.sim.events.length; if (n !== lastMoments) { lastMoments = n; const old = page.querySelector('#fd-moments'); const mv = momentsView(); if (old && mv) old.replaceWith(mv); else if (mv && !old) page.querySelector('#fd-cards')?.after(mv); }
    }, 700);
    const off = app.on('run-deleted', () => { S.runId = currentRunId(app, {}); load().then(render); });
    const ro = new ResizeObserver(() => { cards.forEach((c) => c.chart.draw()); charts.forEach((c) => c.draw()); }); ro.observe(page);
    return () => { disposed = true; clearInterval(timer); off(); ro.disconnect(); };
  },
};
