// Trade study: fly 2 to 4 design variants with the real simulator, compare payload / cost / risk side by side.
import { h, clear, toast, fmt } from '../lib/dom.js';
import { panel } from '../lib/widgets.js';
import { runTrade, generateVariants, TRADE_DEFINITIONS, riskOf } from '../../src/core/trade.js';
import { drawTrade } from '../lib/proviews.js';
import { proState } from '../lib/export.js';
import { assumptionsPanel } from '../lib/assumptions.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const MAX = 4;
const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)} %`;

export default {
  id: 'trade', title: 'Trade study',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = { picked: new Set(), riskMode: 'margin', mcRuns: 10, seed: 1, busy: null, stop: false, secPerFlight: 4, variants: [], key: null, result: proState(app).trade };
    let disposed = false;
    const beginner = () => document.body.dataset.mode === 'beginner';

    function pool() {
      const P = app.project, out = [];
      const base = P.vehicle;
      if (base && ['rocket'].includes(base.type)) out.push({ id: `cur:${base.id}`, label: `${base.name} (current)`, note: 'The design as it is now.', vehicle: base });
      for (const v of Object.values(P.vehicles)) if (v.type === 'rocket' && v.id !== base?.id) out.push({ id: `veh:${v.id}`, label: v.name, note: 'Saved design in this project.', vehicle: v });
      if (base && P.mission && base.type === 'rocket') {
        const key = `${base.id}:${JSON.stringify(base.components?.length)}:${P.mission.id}`;
        if (S.key !== key) { S.key = key; try { S.variants = generateVariants(base, P.mission); } catch { S.variants = []; } }
        for (const v of S.variants) out.push({ id: `gen:${v.id}`, label: `${v.label}`, note: v.note, vehicle: v.vehicle, mission: v.mission, generated: true });
      }
      return out;
    }
    function flights() { return S.picked.size * (S.riskMode === 'mc' ? 1 + S.mcRuns : 1); }
    function estimate() { const s = flights() * S.secPerFlight; return s < 90 ? `about ${Math.max(1, Math.round(s))} s` : `about ${Math.round(s / 60)} min`; }

    function head() {
      return h('div', { class: 'page-head' }, h('div', { class: 'grow' },
        h('h1', { class: 'beginner-only' }, 'Compare designs'), h('h1', { class: 'std-only' }, 'Trade study'),
        h('p', { class: 'beginner-only' }, 'Pick 2 to 4 rockets. We fly each one.'),
        h('p', { class: 'std-only' }, 'Each design is flown for real. Payload, cost and risk are defined below.')));
    }
    function pickPanel() {
      const items = pool();
      const lab = (it) => {
        const on = S.picked.has(it.id);
        const cb = h('input', { type: 'checkbox', checked: on, disabled: !!S.busy || (!on && S.picked.size >= MAX), 'data-id': it.id, onchange: (e) => { if (e.target.checked) S.picked.add(it.id); else S.picked.delete(it.id); render(); } });
        return h('label', { class: on ? 'on' : '', title: it.note }, cb, h('span', null, h('b', null, it.label), h('div', { class: 'muted std-only', style: { fontSize: '12px' } }, it.generated ? `Generated: ${it.note}` : it.note)));
      };
      return panel('1. Choose the designs (2 to 4)', h('div', { class: 'col' },
        items.length ? h('div', { class: 'pro-pick', id: 'trade-pick' }, items.map(lab)) : h('p', { class: 'muted' }, 'No rocket yet. Build one first.'),
        h('p', { class: 'muted std-only', style: { fontSize: '12.5px', margin: 0 } }, 'Variants are made with the AI tools. They are not saved unless you save them.')));
    }
    function optionsPanel() {
      const run = h('button', { class: 'btn primary', id: 'trade-run', disabled: !!S.busy || S.picked.size < 2 || app.api.ctx.running, onclick: go }, '', h('span', { class: 'beginner-only' }, 'Compare them'), h('span', { class: 'std-only' }, 'Run the trade study'));
      return panel('2. How to measure risk', h('div', { class: 'col' },
        h('div', { class: 'row' },
          h('label', { class: 'row' }, h('input', { type: 'radio', name: 'trmode', id: 'trade-mode-margin', checked: S.riskMode === 'margin', disabled: !!S.busy, onchange: () => { S.riskMode = 'margin'; render(); } }), h('span', null, h('b', null, 'Quick'), ' - how close the flight came to a limit (1 flight each)')),
          h('label', { class: 'row' }, h('input', { type: 'radio', name: 'trmode', id: 'trade-mode-mc', checked: S.riskMode === 'mc', disabled: !!S.busy, onchange: () => { S.riskMode = 'mc'; render(); } }), h('span', null, h('b', null, 'Monte Carlo'), ' - chance of failure over many random flights'))),
        S.riskMode === 'mc' ? h('div', { class: 'row adv-only-flex' },
          h('span', { class: 'muted' }, 'Flights per design'), ...[10, 15, 20].map((n) => h('button', { class: `btn ${S.mcRuns === n ? 'primary' : ''}`, disabled: !!S.busy, onclick: () => { S.mcRuns = n; render(); } }, String(n))),
          h('span', { class: 'muted' }, 'Seed'), h('span', { class: 'pro-seed', id: 'trade-seed' }, String(S.seed))) : null,
        h('div', { class: 'row' }, run, S.busy ? h('button', { class: 'btn danger', onclick: () => (S.stop = true) }, 'Stop') : null,
          h('span', { class: 'muted', id: 'trade-estimate' }, S.picked.size ? `${flights()} flights, ${estimate()}` : 'Pick at least 2 designs.')),
        S.busy ? h('div', { class: 'pro-prog', id: 'trade-progress' }, h('div', { class: 'progress' }, h('div', { style: { width: `${S.busy.pct}%` } })), h('div', { class: 'muted' }, S.busy.text)) : null));
    }
    async function go() {
      if (S.busy || app.api.ctx.running) return;
      const items = pool().filter((x) => S.picked.has(x.id)); if (items.length < 2) return;
      const P = app.project, rec = app.project.runs.length ? null : null; void rec;
      const mission = P.mission; if (!mission) { toast('No mission yet.', 'bad'); return; }
      S.stop = false; app.api.ctx.running = true; const t0 = Date.now();
      const per = S.riskMode === 'mc' ? 1 + S.mcRuns : 1, total = items.length * per;
      S.busy = { pct: 2, text: 'Starting…' }; render();
      const setP = (text, pct) => { S.busy = { text, pct }; const el = document.getElementById('trade-progress'); if (el) { el.lastChild.textContent = text; el.firstChild.firstChild.style.width = `${pct}%`; } };
      try {
        const cands = items.map((x) => ({ id: x.id, label: x.label, note: x.note, vehicle: clone(x.vehicle), mission: x.mission ? clone(x.mission) : undefined }));
        const res = await runTrade(cands, { mission: clone(mission), environment: clone(P.environment ?? {}), settings: clone(P.settings ?? {}), baseVehicle: P.vehicle }, {
          mcRuns: S.riskMode === 'mc' ? S.mcRuns : 0, seed: S.seed, shouldStop: () => S.stop,
          onProgress: (p) => { const base = p.index * per; const done = p.stage === 'montecarlo' ? 1 + (p.done ?? 0) : 0; setP(`${p.label}: ${p.stage === 'montecarlo' ? `random flight ${p.done ?? 0} of ${p.runs}` : p.stage === 'tune' ? `trying pitch programme ${p.tries}` : 'flying'} (design ${p.index + 1} of ${p.total})`, 3 + (94 * (base + done)) / total); },
        });
        S.secPerFlight = Math.max(0.5, (Date.now() - t0) / 1000 / Math.max(1, total));
        if (!res.entries.length) { toast('Stopped before any flight.', 'warn'); }
        else { S.result = res; proState(app).trade = res; app.api.ctx.lastTrade = res; if (S.stop) toast(`Stopped. ${res.entries.length} of ${items.length} designs were flown.`, 'warn', 6000); }
      } catch (e) { toast(`Trade study failed: ${e.message}`, 'bad', 8000); }
      app.api.ctx.running = false; S.busy = null; if (!disposed) render();
    }

    function saveDesign(e) {
      const it = pool().find((x) => x.id === e.id); if (!it) return;
      const v = clone(it.vehicle); v.id = undefined; v.name = `${it.label.replace(/ \(current\)$/, '')} (trade)`;
      app.project.setVehicle(v, { activate: false });
      if (it.mission) { const m = clone(it.mission); m.id = undefined; m.name = `${m.name ?? 'Mission'} (trade)`; app.project.setMission(m, { activate: false }); }
      app.commit(`Save trade design: ${it.label}`); toast(`Saved "${v.name}" as a new design. Undo removes it.`, 'ok', 5000); render();
    }

    function resultPanel() {
      const r = S.result; if (!r) return null;
      const E = r.entries;
      const best = (key, dir, f) => { const ok = E.filter((e) => e.feasible && Number.isFinite(f(e))); if (ok.length < 2) return null; const v = ok.map(f); return dir > 0 ? Math.max(...v) : Math.min(...v); };
      const bp = best('p', 1, (e) => e.payload), bc = best('c', -1, (e) => e.cost), br = best('r', -1, riskOf);
      const row = (label, f, { b = null, cmp = null, cls = '', std = false } = {}) => h('tr', { class: std ? 'std-only' : '' }, h('td', null, label),
        E.map((e) => { const v = f(e); const isBest = b != null && e.feasible && cmp && cmp(e) === b; return h('td', { class: isBest ? 'best' : cls }, v ?? '–'); }));
      const canvas = h('canvas', { id: 'trade-chart', class: 'pro-canvas', style: { width: '100%', height: '280px' }, role: 'img', 'aria-label': 'Payload against cost, colour shows risk' });
      setTimeout(() => { if (canvas.isConnected) drawTrade(canvas, E); }, 0);
      const mcNote = r.mcRuns ? `Monte Carlo, ${r.mcRuns} flights per design, seed ${r.seed}.` : 'Quick risk (margin).';
      return panel('3. Results', h('div', { class: 'col', id: 'trade-result' },
        h('p', { class: 'muted', style: { margin: 0 } }, `${mcNote} ${E.length} design${E.length === 1 ? '' : 's'} flown for real in ${fmt(r.wallMs / 1000, 0)} s.`),
        h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table pro-trade', id: 'trade-table' },
          h('thead', null, h('tr', null, h('th', null, ''), E.map((e) => h('th', { class: e.dominated ? 'dominated' : '', title: e.dominated ? `Dominated by ${e.dominatedBy}` : '' }, e.label, e.dominated ? h('span', { class: 'pro-tag warn' }, 'dominated') : null)))),
          h('tbody', null,
            row('Reached its goal', (e) => (e.feasible ? 'Yes' : `No (${e.status})`), { cls: '' }),
            row('Payload delivered [kg]', (e) => (e.feasible ? fmt(e.payload, 0) : `0 (carries ${fmt(e.designPayload, 0)})`), { b: bp, cmp: (e) => e.payload }),
            row('Hardware cost [M US$, illustrative]', (e) => fmt(e.cost / 1e6, 2), { b: bc, cmp: (e) => e.cost }),
            row(r.mcRuns ? 'Failure probability (MC)' : 'Risk: highest limit use', (e) => (e.mc ? `${pct(e.mc.p)} (95 % ${pct(e.mc.lo)} to ${pct(e.mc.hi)})` : pct(e.riskMargin)), { b: br, cmp: riskOf }),
            row('Closest to a limit', (e) => e.riskBy ?? '–', { std: true }),
            row('Liftoff mass [t]', (e) => (e.liftoffMass ? fmt(e.liftoffMass / 1000, 1) : '–'), { std: true }),
            row('Liftoff thrust-to-weight', (e) => (e.liftoffTWR ? fmt(e.liftoffTWR, 2) : '–'), { std: true }),
            row('Delta-v, vacuum [m/s]', (e) => (e.dvVac ? fmt(e.dvVac, 0) : '–'), { std: true }),
            row('Max dynamic pressure [kPa]', (e) => (e.maxQ ? fmt(e.maxQ / 1000, 1) : '–'), { std: true }),
            row('Peak acceleration [g]', (e) => (e.maxG ? fmt(e.maxG, 1) : '–'), { std: true }),
            row('Parts without a catalog cost', (e) => String(e.unpriced ?? '–'), { std: true }),
            h('tr', null, h('td', null, 'Save'), E.map((e) => h('td', null, h('button', { class: 'btn', 'data-save': e.id, title: 'Add this design to the project (one undo step)', onclick: () => saveDesign(e) }, 'Save design'))))))),
        h('div', null, canvas, h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Right = more expensive, up = more payload delivered. Green = low risk, red = high. Dashed grey ring = dominated. Red cross = did not reach the goal (plotted at the payload it was designed for).')),
        E.some((e) => e.dominated) ? h('div', { class: 'callout warn' }, E.filter((e) => e.dominated).map((e) => h('div', null, h('b', null, e.label), ` is dominated by ${e.dominatedBy}: that design is at least as good in payload, cost and risk, and better in one.`))) : h('div', { class: 'callout' }, E.some((e) => e.feasible) ? 'No design is dominated: each one is better in at least one of payload, cost or risk.' : 'None of these designs reached its goal, so none can be compared on payload.')));
    }
    function defsPanel() {
      return panel('Definitions', h('div', { class: 'col', id: 'trade-defs' }, Object.entries(TRADE_DEFINITIONS).map(([k, v]) => h('p', { class: 'muted', style: { margin: 0, fontSize: '13px' } }, v))), { cls: 'std-only' });
    }
    function render() {
      if (disposed) return;
      clear(page); page.append(head(), h('div', { class: 'col' }, pickPanel(), optionsPanel(), resultPanel(), defsPanel(), assumptionsPanel ? assumptionsPanel('montecarlo') : null));
    }
    render();
    return () => { disposed = true; };
  },
};
