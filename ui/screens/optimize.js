// Optimiser: trajectory and design-trade optimisation in one place.
//   Launch path ..... tunes the ascent guidance of the current rocket by flying it in the simulator (src/optimize/ascent.js)
//   Transfer burns .. best orbit-to-orbit transfer with a plane change, and the best interplanetary departure (src/optimize/transfer.js)
//   Staging ......... the current rocket's stage split against the optimum, and a stage-count / propellant trade (src/optimize/staging.js)
import { h, clear, toast, fmt } from '../lib/dom.js';
import { panel, stat, tabs, select, numberInput, emptyState } from '../lib/widgets.js';
import { drawScatter } from '../lib/charts.js';
import { optimiseAscent, ascentOptimisable, ASCENT_VARIABLES } from '../../src/optimize/ascent.js';
import { optimiseOrbitTransfer, optimiseInterplanetary } from '../../src/optimize/transfer.js';
import { stagingTrade, compareWithOptimum, PROPELLANT_FAMILIES } from '../../src/optimize/staging.js';
import { ascentDvRequired } from '../../src/vehicles/analysis.js';
import { listBodies } from '../../physics/bodies.js';
import { dateToEpoch, epochToDate } from '../../physics/mission-design.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const DAY = 86400;
const OK = '#3fb97f', BAD = '#e5534b', BEST = '#f2b84b';
// results survive leaving and re-opening the screen (per app instance)
const memo = new WeakMap();
const state = (app) => { if (!memo.has(app)) memo.set(app, { tab: 'ascent', ascent: null, flights: 30, capMode: 'auto', capKpa: 40, gCap: 0, vars: new Set(ASCENT_VARIABLES.map((v) => v.id)), orbit: { body: 'earth', alt1: 300, alt2: 35786, dInc: 28.5, result: null }, ipl: { from: 'earth', to: 'mars', start: new Date().toISOString().slice(0, 10), span: 800, cost: 'total', result: null }, staging: { dv: null, payload: null, result: null } }); return memo.get(app); };
const kg = (v) => (Number.isFinite(v) ? `${fmt(v, v < 10 ? 1 : 0)} kg` : '–');
const t = (v) => (Number.isFinite(v) ? (v >= 10000 ? `${fmt(v / 1000, 1)} t` : `${fmt(v, 0)} kg`) : '–');

export default {
  id: 'optimize', title: 'Optimiser',
  mount(root, app) {
    const page = h('div', { class: 'page', id: 'optimize-page' }); root.append(page);
    const S = state(app);
    let disposed = false, busy = null, stop = false;

    const head = () => h('div', { class: 'page-head' }, h('div', { class: 'grow' },
      h('h1', { class: 'beginner-only' }, 'Make it better'), h('h1', { class: 'std-only' }, 'Optimiser'),
      h('p', { class: 'beginner-only' }, 'The computer tries many versions and keeps the best one.'),
      h('p', { class: 'std-only' }, 'Trajectory and design-trade optimisation: launch path, transfer burns and staging. Every number comes from the same physics as the rest of the lab.')));

    // ------------------------------------------------------------------ launch path
    function ascentTab() {
      const P = app.project, V = P.vehicle, M = P.mission;
      const why = ascentOptimisable(V, M);
      if (why) return emptyState('Nothing to optimise yet', why, [h('button', { class: 'btn primary', onclick: () => app.navigate('designer') }, 'Open the designer')]);
      const est = Math.round(S.flights * 1.6);
      const cap = h('div', { class: 'row' },
        h('span', { class: 'muted' }, 'Max dynamic pressure cap'),
        select([['auto', 'Auto: at most 10 % above the current path'], ['none', 'No cap'], ['manual', 'Fixed value']], S.capMode, (v) => { S.capMode = v; render(); }, { id: 'opt-capmode', disabled: !!busy }),
        S.capMode === 'manual' ? numberInput({ value: S.capKpa, min: 5, max: 200, step: 1, unit: 'kPa', onchange: (v) => { S.capKpa = v; } }) : null);
      const gcap = h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Peak acceleration cap (0 = none)'), numberInput({ value: S.gCap, min: 0, max: 20, step: 0.5, unit: 'g', onchange: (v) => { S.gCap = v; } }));
      const varBoxes = h('div', { class: 'row', id: 'opt-vars' }, ASCENT_VARIABLES.map((v) => h('label', { class: 'row', title: `${v.min / (v.scale ?? 1)} to ${v.max / (v.scale ?? 1)} ${v.unit}` },
        h('input', { type: 'checkbox', checked: S.vars.has(v.id), disabled: !!busy, onchange: (e) => { if (e.target.checked) S.vars.add(v.id); else if (S.vars.size > 1) S.vars.delete(v.id); else e.target.checked = true; } }), h('span', null, v.label))));
      const settings = panel('1. What to optimise', h('div', { class: 'col' },
        h('p', { class: 'muted', style: { margin: 0 } }, `Rocket "${V.name}" on mission "${M.name}". Goal: reach the mission's orbit with as much propellant as possible left in the last stage.`),
        h('div', { class: 'std-only' }, varBoxes),
        h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Flights to try'), ...[15, 30, 50].map((n) => h('button', { class: `btn ${S.flights === n ? 'primary' : ''}`, disabled: !!busy, onclick: () => { S.flights = n; render(); } }, String(n))), h('span', { class: 'muted' }, `about ${est < 90 ? `${est} s` : `${Math.round(est / 60)} min`}`)),
        h('div', { class: 'std-only col' }, cap, gcap),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'opt-ascent-run', disabled: !!busy || app.api?.ctx?.running, onclick: runAscent }, h('span', { class: 'beginner-only' }, 'Find a better launch path'), h('span', { class: 'std-only' }, 'Optimise the launch path')),
          busy ? h('button', { class: 'btn danger', onclick: () => { stop = true; } }, 'Stop') : null),
        busy ? h('div', { class: 'pro-prog', id: 'opt-progress' }, h('div', { class: 'progress' }, h('div', { style: { width: `${busy.pct}%` } })), h('div', { class: 'muted' }, busy.text)) : null));
      return h('div', { class: 'col' }, settings, ascentResult());
    }
    async function runAscent() {
      if (busy || app.api?.ctx?.running) return;
      const P = app.project;
      stop = false; busy = { pct: 2, text: 'First flight: the mission as it is now…' }; if (app.api?.ctx) app.api.ctx.running = true; render();
      const setP = (text, pct) => { busy = { text, pct }; const el = document.getElementById('opt-progress'); if (el) { el.lastChild.textContent = text; el.firstChild.firstChild.style.width = `${pct}%`; } };
      const limits = {};
      if (S.capMode === 'manual') limits.maxQ = S.capKpa * 1000;
      if (S.gCap > 0) limits.maxG = S.gCap;
      try {
        const r = await optimiseAscent(clone(P.vehicle), clone(P.mission), {
          environment: clone(P.environment ?? {}), settings: clone(P.settings ?? {}), limits, maxFlights: S.flights, variables: [...S.vars], loadMargin: S.capMode === 'auto' ? 1.1 : 0,
          shouldStop: () => stop || disposed,
          onProgress: (p) => setP(`Flight ${p.flight}${p.last.robustness ? ' (robustness check)' : ` of up to ${p.maxFlights}`}: ${p.last.feasible ? `reached orbit, ${kg(p.last.propLeft)} left` : `missed (${p.last.reason})`}. Best so far: ${p.best.feasible ? kg(p.best.propLeft) : 'none reached orbit'}.`, Math.min(98, 3 + (95 * p.flight) / (p.maxFlights + 3))),
        });
        r.missionId = P.mission.id; r.vehicleName = P.vehicle.name; r.missionName = P.mission.name;
        S.ascent = r;
        if (r.stopped) toast(`Stopped after ${r.flights} flights. The best path so far is shown.`, 'warn', 5000);
      } catch (e) { toast(`Optimisation failed: ${e.message}`, 'bad', 8000); }
      if (app.api?.ctx) app.api.ctx.running = false; busy = null; if (!disposed) render();
    }
    function saveAscent(which) {
      const r = S.ascent, M = app.project.mission;
      if (!r || !M || M.id !== r.missionId) { toast('The mission changed since the optimisation. Run it again.', 'warn'); return; }
      const params = which === 'safer' ? r.safer.mission.guidance.params : r.params;
      M.guidance.params = clone(params);
      app.commit(which === 'safer' ? 'Use the safer optimised launch path' : 'Use the optimised launch path');
      toast('Saved into the mission. Launch it to see the new path; Undo puts the old one back.', 'ok', 6000);
      render();
    }
    function ascentResult() {
      const r = S.ascent; if (!r) return null;
      const b = r.baseline, o = r.best, vars = r.variables;
      const canvas = h('canvas', { id: 'opt-ascent-chart', class: 'pro-canvas', style: { width: '100%', height: '240px' }, role: 'img', 'aria-label': 'Propellant left after each flight' });
      setTimeout(() => { if (canvas.isConnected) drawScatter(canvas, r.history.map((e) => ({ x: e.n, y: e.feasible ? e.propLeft : 0, color: e === o ? BEST : e.feasible ? OK : BAD })), { xLabel: 'Flight', yLabel: 'Propellant left in the last stage [kg]', clean: true }); }, 0);
      const val = (v, x) => (x == null ? '–' : `${fmt(x / (v.scale ?? 1), v.unit === 'km' ? 1 : 2)} ${v.unit === '-' ? '' : v.unit}`);
      const stale = app.project.mission?.id !== r.missionId;
      return panel('2. Result', h('div', { class: 'col', id: 'opt-ascent-result' },
        h('div', { class: 'grid g4' },
          stat('Propellant left, now', b.feasible ? kg(b.propLeft) : 'misses orbit', 'mission as it is'),
          stat('Propellant left, optimised', o.feasible ? kg(o.propLeft) : 'misses orbit', o.dvMargin != null && o.feasible ? `about ${fmt(o.dvMargin, 0)} m/s reserve` : ''),
          stat('Max dynamic pressure', `${fmt(o.maxQ / 1000, 1)} kPa`, `now ${fmt(b.maxQ / 1000, 1)} kPa`),
          stat('Flights', String(r.flights), r.stopped ? 'stopped early' : 'simulated')),
        h('div', { class: `callout ${o.feasible ? (r.robustness && !r.robustness.robust ? 'warn' : 'ok') : 'bad'}`, id: 'opt-ascent-explain' }, r.explanation),
        h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table', id: 'opt-ascent-table' },
          h('thead', null, h('tr', null, h('th', null, 'Setting'), h('th', null, 'Now'), h('th', null, 'Optimised'), r.safer ? h('th', null, 'Safer choice') : null, h('th', { class: 'std-only' }, 'Search range'))),
          h('tbody', null, vars.map((v) => h('tr', null, h('td', null, v.label), h('td', null, val(v, b.x[v.id])), h('td', null, val(v, o.x[v.id])), r.safer ? h('td', null, val(v, r.safer.x[v.id])) : null, h('td', { class: 'std-only muted' }, `${val(v, v.min)} to ${val(v, v.max)}`))),
            h('tr', null, h('td', null, 'Propellant left'), h('td', null, b.feasible ? kg(b.propLeft) : '–'), h('td', null, o.feasible ? kg(o.propLeft) : '–'), r.safer ? h('td', null, kg(r.safer.propLeft)) : null, h('td', { class: 'std-only' }, ''))))),
        h('div', null, canvas, h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Each dot is one simulated flight. Green reached orbit, red did not (drawn at 0), gold is the best.')),
        stale ? h('p', { class: 'muted' }, `This result is for mission "${r.missionName}". Switch back to it to save.`) : h('div', { class: 'row' },
          o.feasible && r.improved ? h('button', { class: 'btn primary', id: 'opt-ascent-save', onclick: () => saveAscent('best') }, 'Save the optimised path into the mission') : null,
          r.safer ? h('button', { class: 'btn', id: 'opt-ascent-save-safer', onclick: () => saveAscent('safer') }, 'Save the safer path') : null)));
    }

    // ------------------------------------------------------------------ transfer burns
    function transferTab() {
      const O = S.orbit, I = S.ipl;
      const bodies = listBodies().filter((b) => b.type !== 'star' && b.mu > 1e9).map((b) => [b.id, b.name]);
      const planets = listBodies().filter((b) => b.parent === 'sun' && b.type === 'planet').map((b) => [b.id, b.name]);
      const orbitPanel = panel('Orbit to orbit', h('div', { class: 'col' },
        h('p', { class: 'muted', style: { margin: 0 } }, 'From one circular orbit to another, with a change of inclination. Compares the Hohmann transfer (with the plane change done in different places) against a bi-elliptic transfer whose high point and plane-change split are optimised.'),
        h('div', { class: 'row' },
          h('span', { class: 'muted' }, 'Around'), select(bodies, O.body, (v) => { O.body = v; }, { id: 'opt-orbit-body' }),
          h('span', { class: 'muted' }, 'from'), numberInput({ value: O.alt1, min: 50, max: 2e6, step: 10, unit: 'km', onchange: (v) => { O.alt1 = v; } }),
          h('span', { class: 'muted' }, 'to'), numberInput({ value: O.alt2, min: 50, max: 2e6, step: 10, unit: 'km', onchange: (v) => { O.alt2 = v; } }),
          h('span', { class: 'muted' }, 'turn the plane by'), numberInput({ value: O.dInc, min: 0, max: 90, step: 0.5, unit: 'deg', onchange: (v) => { O.dInc = v; } }),
          h('button', { class: 'btn primary', id: 'opt-orbit-run', onclick: () => { try { O.result = optimiseOrbitTransfer({ body: O.body, alt1: O.alt1 * 1000, alt2: O.alt2 * 1000, dIncDeg: O.dInc }); } catch (e) { toast(e.message, 'bad'); } render(); } }, 'Find the cheapest transfer')),
        orbitResult()));
      const iplPanel = panel('Planet to planet', h('div', { class: 'col' },
        h('p', { class: 'muted', style: { margin: 0 } }, 'Finds the departure date and flight time with the lowest cost: a porkchop grid of Lambert transfers on the planet ephemeris, refined by a Nelder-Mead search.'),
        h('div', { class: 'row' },
          h('span', { class: 'muted' }, 'From'), select(planets, I.from, (v) => { I.from = v; }, { id: 'opt-ipl-from' }),
          h('span', { class: 'muted' }, 'to'), select(planets, I.to, (v) => { I.to = v; }, { id: 'opt-ipl-to' }),
          h('span', { class: 'muted' }, 'leaving after'), h('input', { class: 'input', type: 'date', value: I.start, id: 'opt-ipl-start', onchange: (e) => { I.start = e.target.value; } }),
          h('span', { class: 'muted' }, 'search'), numberInput({ value: I.span, min: 60, max: 3000, step: 30, unit: 'days', onchange: (v) => { I.span = v; } }),
          h('span', { class: 'muted' }, 'minimise'), select([['total', 'Total delta-v'], ['departure', 'Departure burn'], ['c3', 'Launch energy C3']], I.cost, (v) => { I.cost = v; }, { id: 'opt-ipl-cost' }),
          h('button', { class: 'btn primary', id: 'opt-ipl-run', onclick: runIpl }, 'Find the best departure')),
        iplResult()));
      return h('div', { class: 'col' }, orbitPanel, iplPanel);
    }
    function orbitResult() {
      const r = S.orbit.result; if (!r) return null;
      const ang = (o) => (o.split ? o.split.map((x) => `${fmt(x, 2)}°`).join(' / ') : '–');
      return h('div', { class: 'col', id: 'opt-orbit-result' },
        h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table pro-trade' },
          h('thead', null, h('tr', null, h('th', null, 'Transfer'), h('th', null, 'Delta-v [m/s]'), h('th', null, 'Flight time'), h('th', { class: 'std-only' }, 'Plane change per burn'), h('th', { class: 'std-only' }, 'High point'))),
          h('tbody', null, r.options.map((o) => h('tr', { class: o === r.best ? 'sel' : '' }, h('td', null, o.label, o === r.best ? h('span', { class: 'pro-tag ok' }, 'best') : null),
            h('td', { class: o === r.best ? 'best' : '' }, fmt(o.dv, 0)), h('td', null, o.tof > 2 * DAY ? `${fmt(o.tof / DAY, 1)} days` : `${fmt(o.tof / 3600, 1)} h`), h('td', { class: 'std-only' }, ang(o)), h('td', { class: 'std-only' }, o.rbAltitude && !o.degenerate ? `${fmt(o.rbAltitude / 1000, 0)} km` : '–')))))),
        h('div', { class: 'callout ok' }, r.explain), h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, r.note));
    }
    function runIpl() {
      const I = S.ipl;
      if (I.from === I.to) { toast('Pick two different planets.', 'warn'); return; }
      const t0 = dateToEpoch(`${I.start}T00:00:00Z`);
      if (!Number.isFinite(t0)) { toast('Pick a start date.', 'warn'); return; }
      const btn = document.getElementById('opt-ipl-run'); if (btn) { btn.disabled = true; btn.textContent = 'Searching…'; }
      setTimeout(() => {
        try { I.result = optimiseInterplanetary({ from: I.from, to: I.to, startT: t0, spanDays: I.span, cost: I.cost, gridDays: I.span > 1500 ? 8 : 5 }); } catch (e) { toast(e.message, 'bad'); }
        if (!disposed) render();
      }, 30);
    }
    function iplResult() {
      const r = S.ipl.result; if (!r) return null;
      const canvas = h('canvas', { id: 'opt-ipl-chart', class: 'pro-canvas', style: { width: '100%', height: '260px' }, role: 'img', 'aria-label': 'Porkchop plot: cost against departure date and flight time' });
      setTimeout(() => { if (canvas.isConnected) drawPorkchop(canvas, r); }, 0);
      const unit = r.cost === 'c3' ? 'km²/s²' : 'm/s';
      const cv = (x) => (r.cost === 'c3' ? fmt(x / 1e6, 2) : fmt(x, 0));
      return h('div', { class: 'col', id: 'opt-ipl-result' },
        h('div', { class: `callout ${r.best && !r.best.atEdge ? 'ok' : 'warn'}` }, r.explain),
        r.windows.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table' },
          h('thead', null, h('tr', null, h('th', null, 'Leave'), h('th', null, 'Arrive'), h('th', null, 'Flight time'), h('th', null, 'C3 [km²/s²]'), h('th', null, 'Departure [m/s]'), h('th', null, 'Capture [m/s]'), h('th', null, `Cost [${unit}]`))),
          h('tbody', null, r.windows.map((w) => h('tr', { class: w === r.best ? 'sel' : '' }, h('td', null, epochToDate(w.t0).toISOString().slice(0, 10), w === r.best ? h('span', { class: 'pro-tag ok' }, 'best') : null), h('td', null, epochToDate(w.t0 + w.tof).toISOString().slice(0, 10)), h('td', null, `${fmt(w.tof / DAY, 0)} d`), h('td', null, fmt(w.c3 / 1e6, 2)), h('td', null, fmt(w.dvDeparture, 0)), h('td', null, fmt(w.dvArrivalCircular, 0)), h('td', null, cv(w.cost))))))) : null,
        h('div', null, canvas, h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, `Porkchop plot: brighter = cheaper; blank = no transfer or more than three times the best. Gold ring = optimum. ${r.evaluations} Lambert solutions.`)),
        h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, r.note));
    }

    // ------------------------------------------------------------------ staging
    function stagingTab() {
      const P = app.project, V = P.vehicle, M = P.mission, G = S.staging;
      let cmp = null;
      if (V?.type === 'rocket') { try { cmp = compareWithOptimum(V); } catch { cmp = null; } }
      const alt = M?.objective?.type === 'orbit' ? M.objective.altitude : 200000;
      if (G.dv == null) { try { G.dv = Math.round(ascentDvRequired('earth', alt).total / 10) * 10; } catch { G.dv = 9300; } }
      if (G.payload == null) G.payload = Math.round(cmp?.vehicle?.payload ?? 1000);
      const yours = panel('Your rocket against the optimum split', cmp ? h('div', { class: 'col', id: 'opt-stage-compare' },
        h('p', { class: 'muted', style: { margin: 0 } }, cmp.note),
        cmp.optimum.feasible ? h('div', { class: 'grid g4' },
          stat('Gross mass, now', t(cmp.vehicle.gross)), stat('Gross mass, optimum', t(cmp.optimum.gross), `for the same ${kg(cmp.vehicle.payload)} payload`),
          stat('Payload at your gross mass', kg(cmp.payloadAtSameGross), `${cmp.payloadGain >= 0 ? '+' : ''}${kg(cmp.payloadGain)}`), stat('Total vacuum delta-v', `${fmt(cmp.vehicle.dv, 0)} m/s`)) : h('div', { class: 'callout warn' }, cmp.optimum.reason),
        cmp.optimum.feasible ? h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table' },
          h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', null, 'Isp vac [s]'), h('th', { class: 'std-only' }, 'Structure ratio'), h('th', null, 'Delta-v now'), h('th', null, 'Delta-v optimum'), h('th', null, 'Propellant now'), h('th', null, 'Propellant optimum'))),
          h('tbody', null, cmp.vehicle.stages.map((s, i) => { const o = cmp.optimum.stages[i]; return h('tr', null, h('td', null, s.name), h('td', null, fmt(s.isp, 0)), h('td', { class: 'std-only' }, fmt(s.eps, 3)), h('td', null, `${fmt(s.dv, 0)} m/s`), h('td', null, `${fmt(o.dv, 0)} m/s`), h('td', null, kg(s.propellant)), h('td', null, kg(o.propellant))); })))) : null,
        h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Ideal rocket equation. Real engines do not shrink with the stage, and the first stage also needs enough thrust to lift off, so the real gain is smaller. Use it to see which stage is too big or too small, then check in the test bench.'))
        : h('p', { class: 'muted' }, 'Build or load a rocket with at least one stage to compare it with the optimum.'));
      const trade = panel('Staging trade', h('div', { class: 'col' },
        h('p', { class: 'muted', style: { margin: 0 } }, 'Every combination of stage count and propellant is optimally staged for the same payload and delta-v. The Pareto set keeps the designs nobody beats on gross mass, dry mass and number of stages together.'),
        h('div', { class: 'row' },
          h('span', { class: 'muted' }, 'Delta-v budget incl. losses'), numberInput({ value: G.dv, min: 500, max: 20000, step: 50, unit: 'm/s', onchange: (v) => { G.dv = v; } }),
          h('span', { class: 'muted' }, 'Payload'), numberInput({ value: G.payload, min: 1, max: 1e6, step: 10, unit: 'kg', onchange: (v) => { G.payload = v; } }),
          h('button', { class: 'btn primary', id: 'opt-stage-run', onclick: () => { G.result = stagingTrade({ dv: G.dv, payload: G.payload, custom: cmp ? { label: `Engines of "${V.name}"`, stages: cmp.vehicle.stages.map((s) => ({ isp: s.isp, eps: s.eps })) } : null }); render(); } }, 'Run the staging trade')),
        h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, `Default budget: orbital speed at the mission altitude minus Earth's rotation plus about 1.5 km/s of losses. Propellant families use typical Isp and structure values (${Object.values(PROPELLANT_FAMILIES).map((f) => f.label).slice(0, 3).join(', ')}, ...), not a specific engine.`),
        stagingResult()));
      return h('div', { class: 'col' }, yours, trade);
    }
    function stagingResult() {
      const r = S.staging.result; if (!r) return null;
      const ok = r.rows.filter((x) => x.feasible);
      const canvas = h('canvas', { id: 'opt-stage-chart', class: 'pro-canvas', style: { width: '100%', height: '240px' }, role: 'img', 'aria-label': 'Gross mass against dry mass for each staging option' });
      setTimeout(() => { if (canvas.isConnected) drawScatter(canvas, ok.map((x) => ({ x: x.dryMass / 1000, y: x.gross / 1000, color: x.id === r.best ? BEST : x.dominated ? '#6b7a90' : OK })), { xLabel: 'Dry mass [t]', yLabel: 'Gross mass [t]', clean: true }); }, 0);
      return h('div', { class: 'col', id: 'opt-stage-result' },
        h('div', { class: 'scroll-x' }, h('table', { class: 'pro-table pro-trade' },
          h('thead', null, h('tr', null, h('th', null, 'Propellant'), h('th', null, 'Stages'), h('th', null, 'Gross mass'), h('th', null, 'Dry mass'), h('th', null, 'Payload fraction'), h('th', { class: 'std-only' }, 'Delta-v split [m/s]'), h('th', null, ''))),
          h('tbody', null, r.rows.map((x) => h('tr', { class: x.id === r.best ? 'sel' : '' }, h('td', null, x.familyLabel), h('td', null, String(x.count)),
            h('td', { class: x.id === r.best ? 'best' : '' }, x.feasible ? t(x.gross) : 'cannot reach'), h('td', null, x.feasible ? t(x.dryMass) : '–'), h('td', null, x.feasible ? `${fmt(x.payloadFraction * 100, 2)} %` : '–'),
            h('td', { class: 'std-only' }, x.feasible ? x.stages.map((s) => fmt(s.dv, 0)).join(' + ') : '–'),
            h('td', null, !x.feasible ? null : x.dominated ? h('span', { class: 'pro-tag warn' }, 'dominated') : h('span', { class: 'pro-tag ok' }, 'Pareto'))))))),
        h('div', null, canvas, h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Lower left is better. Green = Pareto set, grey = beaten by another option, gold = lightest.')),
        h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, r.note));
    }

    function render() {
      if (disposed) return;
      const body = S.tab === 'ascent' ? ascentTab() : S.tab === 'transfer' ? transferTab() : stagingTab();
      clear(page).append(head(), tabs([['ascent', 'Launch path'], ['transfer', 'Transfer burns'], ['staging', 'Staging']], S.tab, (id) => { if (busy) { toast('Wait for the optimisation to finish or stop it first.', 'warn'); return; } S.tab = id; render(); }), body);
    }
    render();
    return () => { disposed = true; stop = true; };
  },
};

/** Porkchop heat map: departure date (x) against flight time (y), colour = cost; cells above 3x the best are left blank. */
function drawPorkchop(canvas, r) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, hgt = canvas.clientHeight; if (!w || !hgt) return;
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(hgt * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0b111c'; g.fillRect(0, 0, w, hgt);
  const { t0s, tofs, values } = r.grid;
  const L = 52, R = 10, T = 10, B = 34;
  const all = values.flat().filter((v) => v != null);
  if (!all.length) return;
  const lo = Math.min(...all), hi = Math.min(Math.max(...all), lo * 3);
  const cw = (w - L - R) / t0s.length, ch = (hgt - T - B) / tofs.length;
  for (let i = 0; i < t0s.length; i++) for (let j = 0; j < tofs.length; j++) {
    const v = values[i][j]; if (v == null || v > hi) continue;
    const f = (v - lo) / Math.max(hi - lo, 1e-9);           // 0 = best
    g.fillStyle = `hsl(${45 + 160 * f}, 75%, ${68 - 40 * f}%)`;   // bright gold = cheap, dim blue = expensive
    g.fillRect(L + i * cw, hgt - B - (j + 1) * ch, Math.ceil(cw), Math.ceil(ch));
  }
  g.fillStyle = '#94a3bb'; g.font = '11px "Inter Variable", "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  const nx = 5;
  for (let k = 0; k <= nx; k++) { const i = Math.round((k / nx) * (t0s.length - 1)); g.textAlign = k === 0 ? 'left' : k === nx ? 'right' : 'center'; g.fillText(epochToDate(t0s[i]).toISOString().slice(0, 7), k === 0 ? L : k === nx ? w - R : L + (i + 0.5) * cw, hgt - B + 4); }
  g.textAlign = 'center';
  g.fillText('Departure', L + (w - L - R) / 2, hgt - 14);
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let k = 0; k <= 4; k++) { const j = Math.round((k / 4) * (tofs.length - 1)); g.fillText(`${Math.round(tofs[j] / DAY)} d`, L - 6, hgt - B - (j + 0.5) * ch); }
  if (r.best) {
    const x = L + ((r.best.t0 - t0s[0]) / (t0s[t0s.length - 1] - t0s[0] || 1)) * (t0s.length - 1) * cw + cw / 2;
    const y = hgt - B - ((r.best.tof - tofs[0]) / (tofs[tofs.length - 1] - tofs[0] || 1)) * (tofs.length - 1) * ch - ch / 2;
    g.strokeStyle = BEST; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
  }
}
