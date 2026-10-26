// Experiment Lab: parameter sweeps. Every case is a complete, real simulation (nothing is interpolated).
import { h, clear, toast, fmt, confirmDialog } from '../lib/dom.js';
import { panel, select, statusBadge, saveFile, emptyState } from '../lib/widgets.js';
import { drawScatter } from '../lib/charts.js';
import { experimentToCSV, applyParameter, expandValues } from '../../src/core/experiments.js';
import { defaultFactors, environmentFactors, monteCarloToCSV, tornado, describeFactors, estimateSeconds, formatDuration, failureProbability } from '../../src/core/montecarlo.js';
import { drawTornado } from '../lib/proviews.js';
import { assumptionsPanel } from '../lib/assumptions.js';
import { whatIfTakeaway } from '../../src/core/plain-metrics.js';

const METRICS = [['finalPeri', 'Final periapsis [m]'], ['finalApo', 'Final apoapsis [m]'], ['maxAlt', 'Max altitude [m]'], ['maxQ', 'Max dynamic pressure [Pa]'], ['maxG', 'Peak acceleration [g]'], ['propellantUsed', 'Propellant used [kg]'], ['finalPropellant', 'Propellant left [kg]'], ['lastStageReserve', 'Last-stage reserve [kg]'], ['initialMass', 'Liftoff mass [kg]'], ['finalMass', 'Final mass [kg]'], ['endTime', 'Mission duration [s]'], ['dvIdeal', 'Delta-v delivered [m/s]'], ['touchdownVertical', 'Touchdown vertical speed [m/s]'], ['distanceDriven', 'Distance driven [m]'], ['maxTempNose', 'Peak nose temperature [K]']];

function suggestions(P) {
  const v = P.vehicle, m = P.mission, out = [];
  if (v) {
    for (const s of v.stages ?? []) out.push([`vehicle.group[${s.id}].propellantScale`, `Propellant of ${s.name ?? s.id} (factor)`, 0.8, 1.3, 6]);
    for (const c of v.components) if (c.kind === 'payload' || c.group === 'payload') if (c.mass) out.push([`vehicle.components[${c.id}].mass`, `Mass of ${c.name} [kg]`, c.mass * 0.5, c.mass * 2, 5]);
    for (const c of v.components) if (c.kind === 'engine') out.push([`vehicle.components[${c.id}].thrustVac`, `Vacuum thrust of ${c.name} [N]`, c.thrustVac * 0.8, c.thrustVac * 1.3, 5]);
  }
  if (m?.objective?.type === 'orbit') out.push(['mission.targetAltitude', 'Target orbit altitude [m]', 150e3, 500e3, 5]);
  if (m?.guidance?.mode === 'ascent') { out.push(['mission.guidance.params.schedule.hF', 'Pitch-over end altitude hF [m]', 60e3, 140e3, 5]); out.push(['mission.guidance.params.schedule.n', 'Pitch profile exponent n', 0.3, 0.7, 5]); }
  return out;
}

const grp0 = (n) => Math.round(n).toLocaleString('en-US');
/** "What if...?" cards for Beginners. Each one is a small real sweep: 4-5 complete simulations with one thing changed. */
function whatIfDefs(P) {
  const v = P.vehicle, m = P.mission; if (!v || !m) return [];
  const out = [], orbit = m.objective?.type === 'orbit';
  const kg = (y) => `${grp0(y)} kg`, gee = (y) => `${(Math.round(y * 10) / 10).toFixed(1)} g`;
  const pctText = (word) => (x) => (Math.abs(x - 100) < 0.5 ? `normal ${word}` : `${grp0(Math.abs(x - 100))}% ${x > 100 ? 'more' : 'less'} ${word}`);
  const st1 = v.stages?.[0];
  if (st1 && v.components.some((c) => c.group === st1.id && c.propellantMass)) out.push({ id: 'fuel', title: 'What if I add more fuel?', blurb: 'Stage 1 gets less or more fuel.', param: { path: `vehicle.group[${st1.id}].propellantScale`, values: [0.7, 0.85, 1, 1.15, 1.3] }, xShow: (f) => f * 100, baseX: 100, xLabel: 'Stage 1 fuel (% of now)', xText: pctText('fuel'), metric: 'lastStageReserve', metricName: 'spare fuel', fmtY: kg, yLabel: 'Spare fuel in the last stage (kg)' });
  if (v.components.some((c) => c.kind === 'engine' && c.thrustVac)) out.push({ id: 'engine', title: 'What if the engine were stronger?', blurb: 'All engines push less or more.', param: { path: 'vehicle.kind[engine].thrustVac', mode: 'scale', values: [0.8, 0.9, 1, 1.1, 1.2] }, xShow: (f) => f * 100, baseX: 100, xLabel: 'Engine strength (% of now)', xText: pctText('push'), metric: 'maxG', metricName: 'strongest push', fmtY: gee, yLabel: 'Strongest push (g)' });
  const gp = m.guidance?.params ?? {};
  if (m.guidance?.mode === 'ascent' && (Number.isFinite(gp.schedule?.n) || Number.isFinite(gp.kickAngle))) {
    const sch = Number.isFinite(gp.schedule?.n);
    out.push({ id: 'angle', title: 'What if I launch at a different angle?', blurb: sch ? 'The rocket leans over sooner or later.' : 'The first tilt after liftoff is smaller or bigger.', param: sch ? { path: 'mission.guidance.params.schedule.n', mode: 'scale', values: [0.6, 0.8, 1, 1.2, 1.4] } : { path: 'mission.guidance.params.kickAngle', mode: 'scale', values: [0.5, 0.75, 1, 1.5, 2] }, xShow: (f) => f * 100, baseX: 100, xLabel: sch ? 'How fast it leans (% of now)' : 'First tilt (% of now)', xText: pctText(sch ? 'leaning' : 'tilt'), metric: 'lastStageReserve', metricName: 'spare fuel', fmtY: kg, yLabel: 'Spare fuel in the last stage (kg)' });
  }
  const pay = v.components.find((c) => (c.kind === 'payload' || c.group === 'payload') && c.mass);
  if (pay) out.push({ id: 'payload', title: 'What if I carry a heavier load?', blurb: `The ${pay.name ?? 'payload'} gets lighter or heavier.`, param: { path: `vehicle.components[${pay.id}].mass`, mode: 'scale', values: [0.5, 0.75, 1, 1.5, 2] }, xShow: (f) => f * pay.mass, baseX: pay.mass, xLabel: 'Load (kg)', xText: (x) => `a ${grp0(x)} kg load`, metric: 'lastStageReserve', metricName: 'spare fuel', fmtY: kg, yLabel: 'Spare fuel in the last stage (kg)' });
  if (orbit && Number.isFinite(m.objective.altitude)) { const a0 = m.objective.altitude; out.push({ id: 'orbit', title: 'What if I aim for a higher orbit?', blurb: 'The orbit target goes lower or higher.', param: { path: 'mission.targetAltitude', mode: 'scale', values: [0.75, 1, 1.25, 1.5, 2] }, xShow: (f) => (f * a0) / 1000, baseX: a0 / 1000, xLabel: 'Orbit height (km)', xText: (x) => `an orbit at ${grp0(x)} km`, metric: 'propellantUsed', metricName: 'fuel used', fmtY: kg, yLabel: 'Fuel used (kg)' }); }
  return out;
}

export default {
  id: 'experiments', title: 'Experiment Lab',
  mount(root, app) {
    const page = h('div', { class: 'page' }); root.append(page);
    const S = { params: [], objective: { metric: 'propellantUsed', goal: 'min', requireSuccess: true }, busy: false, progress: null, result: null, plotY: 'finalPeri', name: 'Sweep' };
    const WI = {};
    const MC = { links: [], runs: 20, seed: 1, secPer: null, factors: null, forVehicle: null, busy: false, progress: null, result: null, metric: null };
    let initFor = null;
    function seed() {
      const sug = suggestions(app.project);
      if (initFor !== app.project.id + (app.project.activeVehicle ?? '')) { initFor = app.project.id + (app.project.activeVehicle ?? ''); const s = sug.find((x) => /propellantScale/.test(x[0]) && /stage2|stage1/.test(x[0])) ?? sug[0]; S.params = s ? [{ path: s[0], from: +(+s[2]).toPrecision(4), to: +(+s[3]).toPrecision(4), steps: s[4] }] : []; }
      return sug;
    }
    const caseCount = () => S.params.reduce((n, p) => n * Math.max(1, Math.floor(p.steps || 1)), 1);

    function render() {
      const sug = seed(); clear(page);
      const P = app.project;
      page.append(h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Experiment Lab'), h('p', { class: 'beginner-only' }, 'Change one thing. Fly again. See what happens.'), h('p', { class: 'std-only' }, 'Run a parameter sweep: every combination is a complete, real physics simulation of your vehicle and mission. Nothing is interpolated or estimated.'))));
      if (!P.vehicle || !P.mission) { page.append(emptyState('Nothing to sweep yet', app.settings.mode === 'beginner' ? 'Build a rocket first.' : 'Create a vehicle and a mission first.', [!P.vehicle ? h('button', { class: 'btn primary', onclick: () => app.navigate('designer') }, 'Build a rocket') : null, !P.mission ? h('button', { class: !P.vehicle ? 'btn' : 'btn primary', onclick: () => app.navigate('planner') }, 'Plan a mission') : null].filter(Boolean))); return; }
      // ---- set-up
      const rows = S.params.map((p, i) => {
        const dl = h('input', { class: 'input', list: 'exp-paths', value: p.path, style: { width: '330px' }, onchange: (e) => { p.path = e.target.value.trim(); const s = sug.find((x) => x[0] === p.path); if (s) { p.from = +(+s[2]).toPrecision(4); p.to = +(+s[3]).toPrecision(4); p.steps = s[4]; render(); } } });
        const num = (k, w) => h('input', { class: 'input num', type: 'number', step: 'any', value: p[k], style: { width: w }, onchange: (e) => { p[k] = parseFloat(e.target.value); refreshCount(); } });
        return h('div', { class: 'row', style: { marginBottom: '6px' } }, dl, h('span', { class: 'muted' }, 'from'), num('from', '96px'), h('span', { class: 'muted' }, 'to'), num('to', '96px'), h('span', { class: 'muted' }, 'steps'), num('steps', '60px'), h('button', { class: 'btn small danger', onclick: () => { S.params.splice(i, 1); render(); } }, '×'));
      });
      const pick = h('div', { class: 'beginner-only' }, h('label', { class: 'field' }, 'What to change', select(sug.map((x) => [x[0], x[1]]), S.params[0]?.path ?? '', (path) => { const q = sug.find((x) => x[0] === path); if (q) { S.params = [{ path: q[0], from: +(+q[2]).toPrecision(4), to: +(+q[3]).toPrecision(4), steps: q[4] }]; render(); } }, { id: 'exp-simple' })));
      const count = h('span', { id: 'exp-count', class: caseCount() > 120 ? 'bad' : 'muted' }, '');
      const refreshCount = () => { count.textContent = `${caseCount()} real simulations${caseCount() > 120 ? ' — too many, the limit is 120' : ''}`; count.className = caseCount() > 120 ? 'bad' : 'muted'; };
      refreshCount();
      const datalist = h('datalist', { id: 'exp-paths' }, sug.map((s) => h('option', { value: s[0] }, s[1])));
      const obj = h('div', { class: 'row std-only' }, h('span', { class: 'muted' }, 'Find the case that'), select([['min', 'minimises'], ['max', 'maximises']], S.objective.goal, (x) => (S.objective.goal = x)), select(METRICS, S.objective.metric, (x) => (S.objective.metric = x), { id: 'exp-metric' }),
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: S.objective.requireSuccess, onchange: (e) => (S.objective.requireSuccess = e.target.checked) }), 'only among successful cases'));
      page.append(whatIfSection());
      page.append(h('div', { class: 'std-only' }, panel('Set-up', h('div', { class: 'col' },
        pick,
        h('div', { class: 'row std-only' }, h('label', { class: 'field' }, 'Name', h('input', { class: 'input', value: S.name, onchange: (e) => (S.name = e.target.value) })), h('span', { class: 'muted' }, `Vehicle: ${P.vehicle.name} · Mission: ${P.mission.name}`)),
        h('div', { class: 'muted std-only', style: { fontSize: '12.5px' } }, 'Parameters (pick from the list or type a path such as ', h('code', null, 'vehicle.components[fuel2].propellantMass'), ')'),
        h('div', { class: 'std-only' }, rows), datalist,
        h('div', { class: 'row std-only' }, h('button', { class: 'btn small', id: 'exp-add', onclick: () => { const s = sug.find((x) => !S.params.some((p) => p.path === x[0])); if (s) S.params.push({ path: s[0], from: +(+s[2]).toPrecision(4), to: +(+s[3]).toPrecision(4), steps: 3 }); else S.params.push({ path: '', from: 0, to: 1, steps: 3 }); render(); } }, '+ Add parameter'), count),
        obj,
        h('div', { class: 'row' }, h('button', { class: 'btn primary big', id: 'exp-run', disabled: S.busy || MC.busy || !S.params.length || caseCount() > 120, onclick: run }, (app.settings.mode === 'beginner' ? 'Run test' : 'Run experiment')), h('button', { class: 'btn danger', disabled: !S.busy, onclick: () => app.api.execute('STOP_SIMULATION') }, 'Stop')),
        S.busy ? h('div', { id: 'exp-progress' }, h('div', { class: 'progress' }, h('div', { style: { width: `${S.progress ? (S.progress.done / S.progress.total) * 100 : 2}%` } })), h('div', { class: 'muted mono' }, S.progress ? `Simulation ${S.progress.done} of ${S.progress.total}` : 'Starting…')) : null))));
      if (S.result) page.append(h('div', { class: 'std-only' }, resultPanels()));
      else if (!S.busy) page.append(emptyState('No experiment yet', 'Pick what to change, then press Run experiment. Every case is a real flight.', []));
      page.append(mcPanel());
      if (P.experiments?.length) page.append(h('div', { class: 'std-only' }, panel('Earlier experiments in this project', h('table', null, h('thead', null, h('tr', null, ['Name', 'Created', 'Cases', 'Succeeded', ''].map((t) => h('th', null, t)))), h('tbody', null, P.experiments.slice().reverse().map((e) => h('tr', null, h('td', null, e.name), h('td', null, new Date(e.created).toLocaleString()), h('td', { class: 'num' }, String(e.cases)), h('td', { class: 'num' }, String(e.summary?.success ?? '–')), h('td', null, e.csv ? h('button', { class: 'btn small', onclick: () => saveFile(app, `${e.name.replace(/[^\w.-]+/g, '_')}.csv`, e.csv, 'text/csv') }, 'CSV') : null))))))));
    }

    // ---------------------------------------------------------------- Beginner: "What if...?" cards
    function whatIfSection() {
      const defs = whatIfDefs(app.project);
      const wrap = h('div', { class: 'beginner-only', id: 'wi-section' });
      if (!defs.length) return wrap;
      wrap.append(h('h2', { style: { margin: '0 0 8px' } }, 'What if...?'));
      const grid = h('div', { class: 'fd-whatif' }); wrap.append(grid);
      for (const d of defs) {
        const res = WI[d.id], busy = S.busy && S.wiBusy === d.id;
        const card = h('div', { class: 'fd-wcard', 'data-wi': d.id },
          h('h3', null, d.title), h('div', { class: 'fd-w-note' }, `${d.blurb} ${d.param.values.length} test flights.`),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', id: `wi-run-${d.id}`, disabled: S.busy || MC.busy, onclick: () => runWhatIf(d) }, res ? 'Try again' : 'Try it'), busy ? h('button', { class: 'btn danger', onclick: () => app.api.execute('STOP_SIMULATION') }, 'Stop') : null),
          busy ? h('div', { 'data-wi-progress': d.id }, h('div', { class: 'progress' }, h('div', { style: { width: '2%' } })), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Starting…')) : null);
        if (res) {
          const canvas = h('canvas', { class: 'fd-w-chart', id: `wi-chart-${d.id}` });
          card.append(canvas, h('div', { class: 'fd-w-take', id: `wi-take-${d.id}` }, res.takeaway));
          setTimeout(() => drawScatter(canvas, res.points.map((p) => ({ x: p.x, y: p.y, color: p.status === 'SUCCESS' ? '#84e060' : '#ff5c6a' })), { xLabel: d.xLabel, yLabel: d.yLabel, line: true, clean: true }), 30);
          card.append(h('div', { class: 'fd-w-note' }, 'Green = goal reached. Red = not.'));
        }
        grid.append(card);
      }
      return wrap;
    }
    async function runWhatIf(d) {
      if (S.busy) return;
      S.busy = true; S.wiBusy = d.id; render();
      const r = await app.api.execute('CREATE_EXPERIMENT', { name: `What if: ${d.title}`, parameters: [{ path: d.param.path, mode: d.param.mode ?? 'set', values: d.param.values }] });
      S.busy = false; S.wiBusy = null; S.progress = null;
      if (!r.ok) { toast(r.message, 'bad', 9000); render(); return; }
      const cases = app.api.ctx.lastExperiment?.cases ?? [];
      let metric = d.metric; if (!cases.some((c) => Number.isFinite(c.metrics?.[metric]))) metric = 'maxAlt';
      const fmtY = metric === d.metric ? d.fmtY : (y) => `${grp0(y / 1000)} km`;
      const pts = cases.map((c) => ({ x: d.xShow(c.params[d.param.path]), y: c.metrics?.[metric], status: c.status })).filter((p) => Number.isFinite(p.y));
      WI[d.id] = { points: pts, takeaway: whatIfTakeaway(cases.map((c) => ({ x: d.xShow(c.params[d.param.path]), y: c.metrics?.[metric], status: c.status })), { baseX: d.baseX, xText: d.xText, metricName: metric === d.metric ? d.metricName : 'highest point', fmtY, goalWord: app.project.mission?.objective?.type === 'orbit' ? 'reached orbit' : 'reached the goal', short: app.settings.mode === 'beginner' }) };
      app.markDirty(); render();
    }

    function resultPanels() {
      const r = S.result, sum = r.summary, cases = r.cases, paths = S.params.map((p) => p.path).filter((p) => cases[0]?.params && p in cases[0].params);
      const best = r.best;
      const head = h('div', { class: 'col' },
        h('div', { class: 'grid g4' }, [['Simulations run', String(sum.cases)], ['Succeeded', String(sum.success)], ['Failed', String(sum.failed)], ['Errors', String(sum.errors)]].map(([l, v]) => h('div', { class: `stat ${l === 'Errors' ? 'std-only' : ''}` }, h('div', { class: 'stat-l' }, l), h('div', { class: 'stat-v' }, v)))),
        best ? h('div', { class: 'callout ok' }, h('b', { class: 'beginner-only' }, 'Best case found. '), h('b', { class: 'std-only' }, `Best case (${S.objective.goal === 'min' ? 'lowest' : 'highest'} ${METRICS.find((m) => m[0] === S.objective.metric)?.[1] ?? S.objective.metric} = ${fmt(best.value, 2)}): `), h('span', { class: 'std-only' }, Object.entries(best.params).map(([k, v]) => `${k} = ${Number(v).toPrecision(5)}`).join(', ')), ' ', h('button', { class: 'btn small', id: 'exp-apply', onclick: applyBest }, app.settings.mode === 'beginner' ? 'Use it' : 'Apply this case to my design')) : h('div', { class: 'callout warn' }, S.objective.requireSuccess ? 'No successful case matched the objective.' : 'No case has a value for that metric.'));
      const canvas = h('canvas', { style: { width: '100%', height: '280px', display: 'block', border: '1px solid var(--line)', borderRadius: '6px' } });
      const xPath = paths[0];
      const plot = () => {
        const pts = cases.map((c) => ({ x: c.params[xPath], y: c.metrics?.[S.plotY], color: c.status === 'SUCCESS' ? '#84e060' : c.status === 'FAILURE' ? '#ff5c6a' : '#8da399' }));
        drawScatter(canvas, pts, { xLabel: xPath ?? '', yLabel: METRICS.find((m) => m[0] === S.plotY)?.[1] ?? S.plotY, line: paths.length === 1 });
      };
      setTimeout(plot, 30);
      const cols = ['status', ...METRICS.slice(0, 0).map((m) => m[0])];
      const tbl = h('table', null, h('thead', null, h('tr', null, [...paths.map((p) => p.replace(/^.*\./, '')), 'Result', 'Final orbit', 'Max Q [kPa]', 'Peak g', 'Prop. used [kg]', 'Failures'].map((t) => h('th', null, t)))),
        h('tbody', null, cases.map((c, i) => h('tr', { class: best && best.index === c.index ? 'sel' : '' }, ...paths.map((p) => h('td', { class: 'num' }, Number(c.params[p]).toPrecision(5))), h('td', null, statusBadge(c.status)),
          h('td', { class: 'num' }, c.metrics?.finalPeri != null ? `${fmt(c.metrics.finalPeri / 1000, 0)} × ${fmt(c.metrics.finalApo / 1000, 0)} km` : '–'), h('td', { class: 'num' }, c.metrics?.maxQ != null ? fmt(c.metrics.maxQ / 1000, 1) : '–'), h('td', { class: 'num' }, c.metrics?.maxG != null ? fmt(c.metrics.maxG, 2) : '–'), h('td', { class: 'num' }, c.metrics?.propellantUsed != null ? fmt(c.metrics.propellantUsed, 0) : '–'), h('td', null, (c.failures ?? []).map((f) => f.code).join(', ') || (c.reason && c.status === 'ERROR' ? c.reason : '–'))))));
      return h('div', { class: 'col' },
        panel(`Result: ${r.name}`, head, { actions: [h('button', { class: 'btn small', onclick: () => saveFile(app, `${r.name.replace(/[^\w.-]+/g, '_')}.csv`, experimentToCSV(app.api.ctx.lastExperiment ?? { parameters: S.params, cases }), 'text/csv') }, 'Export CSV')] }),
        panel('Plot', h('div', { class: 'col' }, h('div', { class: 'row std-only' }, h('span', { class: 'muted' }, 'Vertical axis'), select(METRICS, S.plotY, (x) => { S.plotY = x; plot(); }), paths.length > 1 ? h('span', { class: 'muted' }, `(horizontal axis: first parameter, ${xPath})`) : null, h('span', { class: 'muted' }, '● green = success, red = failure')), canvas)),
        h('div', { class: 'std-only' }, panel('All cases', h('div', { style: { overflow: 'auto', maxHeight: '420px' } }, tbl))));
    }


    // ---------------------------------------------------------------- Monte Carlo (reliability study)
    function mcFactors() {
      const key = app.project.id + (app.project.activeVehicle ?? '');
      if (!MC.factors || MC.forVehicle !== key) { MC.forVehicle = key; MC.factors = [...defaultFactors(app.project.vehicle).map((f) => ({ ...f, on: true })), ...environmentFactors().map((f) => ({ ...f, on: false, weather: true }))]; }
      return MC.factors;
    }
    function mcPanel() {
      const P = app.project; const factors = mcFactors();
      const rows = factors.map((f) => h('div', { class: 'row', style: { marginBottom: '4px' } },
        h('label', { class: 'row', style: { width: '260px' } }, h('input', { type: 'checkbox', checked: f.on, onchange: (e) => (f.on = e.target.checked) }), f.name),
        h('span', { class: 'muted' }, '1σ ='), f.unit ? h('input', { class: 'input num', type: 'number', min: 0, max: 40, step: 1, value: f.sigma, style: { width: '76px' }, 'data-factor': f.name, onchange: (e) => { f.sigma = Math.max(0, Math.min(40, parseFloat(e.target.value) || 0)); } }) : h('input', { class: 'input num', type: 'number', min: 0, max: 30, step: 0.1, value: +(f.sigma * 100).toFixed(3), style: { width: '76px' }, onchange: (e) => { f.sigma = Math.max(0, Math.min(0.3, parseFloat(e.target.value) / 100 || 0)); } }), h('span', { class: 'muted' }, f.unit ?? '%'), f.weather ? h('span', { class: 'chip tb-tag' }, 'weather') : null));
      const est = formatDuration(estimateSeconds(MC.runs, MC.secPer ?? 4));
      const setup = h('div', { class: 'col' },
        h('p', { class: 'beginner-only', style: { margin: 0 } }, 'Real rockets are never perfect. We fly yours many times with tiny random changes and count the wins.'),
        h('p', { class: 'muted std-only', style: { fontSize: '12.5px', margin: 0 } }, 'Answers “how likely is it to work?”. The same design is flown many times; in every run each selected input is multiplied by a random factor around 1 (normal distribution, cut off at 3σ). The weather inputs (off until you tick them) are drawn as listed under “What is varied”: a random wind speed from a random direction, and the air density. All runs are complete physics simulations, and the fixed seed makes the study reproducible.'),
        h('div', { class: 'std-only', id: 'mc-varied' }, h('b', null, 'What is varied'), h('ul', { style: { margin: '4px 0', paddingLeft: '18px' } }, describeFactors(factors.filter((f) => f.on)).map((d) => h('li', { class: 'muted', style: { fontSize: '12.5px' } }, d.text, h('span', { class: 'exp-only' }, ` (changes ${d.targets.join(', ')})`))))),
        h('div', { class: 'std-only' }, rows),
        linkEditor(factors),
        h('div', { class: 'row pro-mcn', id: 'mc-n' }, h('span', { class: 'muted' }, 'Flights'), [20, 50, 100].map((n) => h('button', { class: `btn ${MC.runs === n ? 'on primary' : ''}`, 'data-n': n, disabled: MC.busy, onclick: () => { MC.runs = n; render(); } }, String(n))), h('span', { class: 'muted', id: 'mc-estimate' }, `${est}${MC.secPer ? ' (measured on this computer)' : ' (a guess until the first study has run)'}`)),
        h('div', { class: 'row' }, h('label', { class: 'field std-only' }, 'Simulations', h('input', { class: 'input num', id: 'mc-runs', type: 'number', min: 5, max: 500, step: 5, value: MC.runs, style: { width: '84px' }, onchange: (e) => (MC.runs = Math.max(5, Math.min(500, parseInt(e.target.value, 10) || 30))) })),
          h('label', { class: 'field std-only' }, 'Random seed', h('input', { class: 'input num', id: 'mc-seed', type: 'number', step: 1, value: MC.seed, style: { width: '84px' }, onchange: (e) => (MC.seed = parseInt(e.target.value, 10) || 1) })),
          h('button', { class: 'btn primary big', id: 'mc-run', disabled: MC.busy || S.busy, onclick: runMc }, 'Run Monte Carlo'), h('button', { class: 'btn danger', disabled: !MC.busy, onclick: () => app.api.execute('STOP_SIMULATION') }, 'Stop')),
        MC.busy ? h('div', { id: 'mc-progress' }, h('div', { class: 'progress' }, h('div', { style: { width: `${MC.progress ? (MC.progress.done / MC.progress.total) * 100 : 2}%` } })), h('div', { class: 'muted mono' }, MC.progress ? `Simulation ${MC.progress.done} of ${MC.progress.total}` : 'Starting…')) : null,
        MC.result ? mcResult() : null);
      return h('div', { id: 'mc-panel' }, panel('Reliability study (Monte Carlo)', setup), h('div', { class: 'std-only' }, assumptionsPanel('montecarlo')));
    }
    function mcResult() {
      const mc = MC.result, an = mc.analysis;
      const cls = an.successRate >= 0.95 ? 'ok' : an.successRate >= 0.5 ? 'warn' : 'bad';
      const METRIC_LABEL = { orbitError: 'Orbit error vs target [m]', periError: 'Periapsis error [m]', apoError: 'Apoapsis error [m]', finalPeri: 'Final periapsis [m]', finalApo: 'Final apoapsis [m]', maxQ: 'Max dynamic pressure [Pa]', maxG: 'Peak acceleration [g]', propellantUsed: 'Propellant used [kg]', endTime: 'Mission duration [s]', maxAlt: 'Max altitude [m]', touchdownVertical: 'Touchdown vertical speed [m/s]', finalMass: 'Final mass [kg]', distanceDriven: 'Distance driven [m]' };
      const avail = Object.keys(an.stats).filter((k) => METRIC_LABEL[k] && an.stats[k].sd > 0);
      const metric = avail.includes(MC.metric) ? MC.metric : avail.includes(an.metric) ? an.metric : avail[0];
      const canvas = h('canvas', { id: 'mc-hist', style: { width: '100%', height: '210px', display: 'block', border: '1px solid var(--line)', borderRadius: '6px' } });
      setTimeout(() => histogram(canvas, mc.rows, metric, METRIC_LABEL[metric] ?? metric), 30);
      const stat = (l, v, sub) => h('div', { class: 'stat' }, h('div', { class: 'stat-l' }, l), h('div', { class: 'stat-v' }, v), sub ? h('div', { class: 'muted', style: { fontSize: '11.5px' } }, sub) : null);
      const fp = failureProbability(an), pc = (v) => `${(100 * v).toFixed(v < 0.1 ? 1 : 0)} %`;
      const torn = tornado(mc.rows, mc.factors, an.metric === metric || !metric ? an.metric : metric);
      const tcan = h('canvas', { id: 'mc-tornado', class: 'pro-canvas', style: { width: '100%', height: '200px', display: 'block' } });
      setTimeout(() => { if (tcan.isConnected) drawTornado(tcan, torn, `Effect on ${METRIC_LABEL[an.metric] ?? an.metric} (one input at a time, -1 to +1 sigma)`); }, 30);
      const sens = h('table', null, h('thead', null, h('tr', null, ['Input (1σ)', 'Correlation with success', `Correlation with ${METRIC_LABEL[an.metric] ?? an.metric}`].map((t) => h('th', null, t)))),
        h('tbody', null, an.sensitivity.map((x) => h('tr', null, h('td', null, `${x.factor} (${(100 * x.sigma).toFixed(1)} %)`), h('td', { class: 'num' }, x.rSuccess == null ? 'n/a' : x.rSuccess.toFixed(2)), h('td', { class: 'num' }, x.rMetric == null ? 'n/a' : x.rMetric.toFixed(2))))));
      const st = h('table', null, h('thead', null, h('tr', null, ['Result', 'Mean', 'Std. dev.', '5 %', 'Median', '95 %', 'Min', 'Max'].map((t) => h('th', { class: t === 'Result' ? '' : 'num' }, t)))),
        h('tbody', null, avail.map((k) => { const d = an.stats[k]; return h('tr', null, h('td', null, METRIC_LABEL[k]), ...['mean', 'sd', 'p5', 'p50', 'p95', 'min', 'max'].map((q) => h('td', { class: 'num' }, fmt(d[q], Math.abs(d[q]) < 100 ? 2 : 0)))); })));
      return h('div', { class: 'col', id: 'mc-result' },
        h('div', { class: `callout ${cls}` }, h('b', null, an.verdict)),
        mc.correlations?.length ? h('div', { class: 'muted', id: 'mc-linked-note', style: { fontSize: '12.5px' } }, 'Linked inputs: ' + mc.correlations.map((c) => `${c.a} ↔ ${c.b} (${c.rho > 0 ? '+' : ''}${c.rho})`).join('; ')) : null,
        h('div', { class: 'row', id: 'mc-seedline' }, h('span', { class: 'muted' }, 'Seed'), h('span', { class: 'pro-seed' }, String(mc.seed)), h('span', { class: 'muted' }, `${an.runs} flights. The same seed, design and settings give the same numbers.`)),
        h('div', { class: 'grid g4' }, stat('Success probability', `${(100 * an.successRate).toFixed(0)} %`, `95 % interval ${(100 * an.ci95[0]).toFixed(0)}–${(100 * an.ci95[1]).toFixed(0)} %`), stat('Succeeded', String(an.success), `of ${an.valid} valid runs`), stat('Failed', String(an.failed)), stat('Errors', String(an.errors))),
        h('div', { class: 'std-only', id: 'mc-fail-p' }, `Failure probability ${pc(fp.p ?? 0)}, 95 % Wilson interval ${pc(fp.lo)} to ${pc(fp.hi)} (${fp.n} valid flights).`),
        Object.keys(an.failureCodes).length ? h('div', { class: 'muted' }, 'Failure modes: ', Object.entries(an.failureCodes).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ×${k}`).join(', ')) : null,
        avail.length ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Distribution of'), select(avail.map((k) => [k, METRIC_LABEL[k]]), metric, (x) => { MC.metric = x; histogram(canvas, mc.rows, x, METRIC_LABEL[x] ?? x); }), h('span', { class: 'muted' }, '● green = success, red = failure')) : null,
        avail.length ? canvas : null, avail.length ? h('div', { class: 'std-only' }, st) : null,
        h('div', { class: 'std-only' }, h('b', null, 'Which input matters most'), tcan, h('p', { class: 'muted', style: { fontSize: '12px', margin: 0 } }, 'Each bar is the change in the result when only that input moves by one standard deviation (a straight line fitted through the runs, so it is an estimate).')),
        h('div', { class: 'muted std-only', style: { fontSize: '12.5px' } }, 'A correlation near ±1 means that input alone decides the outcome; near 0 means it hardly matters. It measures association in these runs, it is not a proof of cause.'), h('div', { class: 'std-only' }, sens),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => saveFile(app, `${mc.name.replace(/[^\w.-]+/g, '_')}.csv`, monteCarloToCSV(mc), 'text/csv') }, 'Export CSV'), h('button', { class: 'btn small std-only', id: 'mc-json', onclick: () => saveFile(app, `${mc.name.replace(/[^\w.-]+/g, '_')}.json`, JSON.stringify({ schema: mc.schema, seed: mc.seed, vehicle: mc.vehicle, mission: mc.mission, created: mc.created, factors: mc.factors, analysis: an, rows: mc.rows }, null, 1), 'application/json') }, 'Export JSON')));
    }
    function histogram(canvas, rows, metric, label) {
      const ctx = canvas.getContext('2d'); const dpr = window.devicePixelRatio || 1; const W = canvas.clientWidth || 600, H = canvas.clientHeight || 210;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const pts = rows.filter((r) => Number.isFinite(r.metrics?.[metric])); if (!pts.length) return;
      const vals = pts.map((r) => r.metrics[metric]); let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
      const bins = Math.max(5, Math.min(20, Math.round(Math.sqrt(pts.length) * 1.6))); const ok = new Array(bins).fill(0), bad = new Array(bins).fill(0);
      for (const r of pts) { const b = Math.min(bins - 1, Math.floor(((r.metrics[metric] - lo) / (hi - lo)) * bins)); (r.status === 'SUCCESS' ? ok : bad)[b]++; }
      const mx = Math.max(...ok.map((x, i) => x + bad[i])); const L = 44, B = 34, T = 10, R = 10, pw = W - L - R, ph = H - T - B, bw = pw / bins;
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#8da399'; ctx.strokeStyle = '#26352f';
      ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
      for (let i = 0; i < bins; i++) {
        const hOk = (ok[i] / mx) * ph, hBad = (bad[i] / mx) * ph, x = L + i * bw + 1;
        ctx.fillStyle = '#84e060'; ctx.fillRect(x, T + ph - hOk, bw - 2, hOk); ctx.fillStyle = '#ff5c6a'; ctx.fillRect(x, T + ph - hOk - hBad, bw - 2, hBad);
      }
      ctx.fillStyle = '#8da399'; ctx.textAlign = 'center';
      for (let i = 0; i <= 4; i++) ctx.fillText(fmt(lo + ((hi - lo) * i) / 4, Math.abs(hi) < 100 ? 2 : 0), L + (pw * i) / 4, H - 18);
      ctx.fillText(label, L + pw / 2, H - 4); ctx.textAlign = 'right'; ctx.fillText(String(mx), L - 5, T + 8); ctx.fillText('0', L - 5, T + ph);
    }
    /** Linked inputs (2.3): two inputs that move together, e.g. a hot engine with more thrust AND more Isp. rho = +1 always together, -1 opposite. */
    function linkEditor(factors) {
      const on = factors.filter((f) => f.on && !f.wind);
      MC.links = MC.links.filter((l) => on.some((f) => f.name === l.a) && on.some((f) => f.name === l.b));
      const opt = (sel) => on.map((f) => h('option', { value: f.name, selected: f.name === sel }, f.name));
      const rowsL = MC.links.map((l, i) => h('div', { class: 'row mc-link', 'data-link': i, style: { marginBottom: '4px', alignItems: 'center', gap: '6px' } },
        h('select', { class: 'input', 'data-role': 'a', onchange: (e) => { l.a = e.target.value; } }, opt(l.a)), h('span', { class: 'muted' }, 'moves with'), h('select', { class: 'input', 'data-role': 'b', onchange: (e) => { l.b = e.target.value; } }, opt(l.b)),
        h('span', { class: 'muted' }, 'link'), h('input', { class: 'input num', type: 'number', min: -0.95, max: 0.95, step: 0.05, value: l.rho, 'data-role': 'rho', style: { width: '76px' }, onchange: (e) => { l.rho = Math.max(-0.95, Math.min(0.95, parseFloat(e.target.value) || 0)); } }),
        h('button', { class: 'btn small', title: 'Remove this link', onclick: () => { MC.links.splice(i, 1); render(); } }, '×')));
      return h('div', { class: 'std-only', id: 'mc-links' }, h('b', null, 'Linked inputs'),
        h('p', { class: 'muted', style: { fontSize: '12.5px', margin: '2px 0 6px' } }, 'Real parts do not vary independently: an engine that is a little stronger is often a little more efficient too. A link of +0.6 means that when one input is high the other tends to be high as well; −0.6 means the opposite; 0 means no link. Each input keeps its own spread.'),
        rowsL, h('div', { class: 'row' },
          h('button', { class: 'btn small', id: 'mc-link-add', disabled: on.length < 2, onclick: () => { const a = on[0].name, b = on[1].name; MC.links.push({ a, b, rho: 0.6 }); render(); } }, '+ Link two inputs'),
          on.some((f) => f.name === 'Engine thrust') && on.some((f) => f.name === 'Engine Isp') ? h('button', { class: 'btn small', id: 'mc-link-engine', onclick: () => { MC.links = MC.links.filter((l) => !(l.a === 'Engine thrust' && l.b === 'Engine Isp')); MC.links.push({ a: 'Engine thrust', b: 'Engine Isp', rho: 0.6 }); render(); } }, 'Link engine thrust and Isp (+0.6)') : null));
    }
    async function runMc() {
      if (MC.busy || S.busy) return;
      MC.busy = true; MC.progress = null; MC.result = null; render();
      const factors = mcFactors().filter((f) => f.on).map(({ name, sigma, targets, wind, unit }) => ({ name, sigma, targets, wind, unit }));
      if (!factors.length) { MC.busy = false; toast('Select at least one input to disperse.', 'bad'); render(); return; }
      const t0 = Date.now();
      const r = await app.api.execute('RUN_MONTE_CARLO', { name: 'Monte Carlo', runs: MC.runs, seed: MC.seed, factors, correlations: MC.links.filter((l) => l.a !== l.b && l.rho) });
      MC.busy = false; MC.progress = null; if (r.ok) MC.secPer = Math.max(0.2, (Date.now() - t0) / 1000 / MC.runs);
      if (!r.ok) { toast(r.message, 'bad', 9000); render(); return; }
      MC.result = app.api.ctx.lastMonteCarlo; app.markDirty(); toast(r.message, 'ok', 9000); render();
    }

    async function applyBest() {
      const b = S.result?.best; if (!b) return;
      if (!(await confirmDialog('Apply best case', `Change the design to: ${Object.entries(b.params).map(([k, v]) => `${k} = ${Number(v).toPrecision(5)}`).join(', ')}? This is one undo step. Run a simulation afterwards to verify.`))) return;
      try {
        const P = app.project; const inp = { vehicle: P.vehicle, mission: P.mission, environment: P.environment, settings: P.settings };
        for (const p of S.params) if (p.path in b.params) applyParameter(inp, p.path, b.params[p.path], p.mode ?? 'set');
        app.commit('Applied best experiment case'); toast('Design updated. Run a simulation to verify the result.', 'ok', 6000);
      } catch (e) { toast(`Could not apply: ${e.message}`, 'bad', 8000); }
    }

    async function run() {
      if (S.busy) return;
      S.busy = true; S.progress = null; S.result = null; render();
      const parameters = S.params.map((p) => ({ path: p.path, from: p.from, to: p.to, steps: Math.max(1, Math.floor(p.steps)) }));
      const r = await app.api.execute('CREATE_EXPERIMENT', { name: S.name, parameters, objective: { ...S.objective } });
      S.busy = false; S.progress = null;
      if (!r.ok) { toast(r.message, 'bad', 9000); render(); return; }
      const full = app.api.ctx.lastExperiment;
      S.result = { name: S.name, summary: r.data.summary, best: r.data.best, cases: full?.cases ?? r.data.cases.map((c, i) => ({ index: i, ...c, failures: (c.failures ?? []).map((code) => ({ code })) })) };
      app.markDirty(); toast(r.message, 'ok', 8000); render();
    }
    const offs = [app.on('sim-event', (e) => { if (MC.busy && e.type === 'experiment-progress') { MC.progress = { done: e.done, total: e.total }; const el = document.getElementById('mc-progress'); if (el) { el.firstChild.firstChild.style.width = `${(e.done / e.total) * 100}%`; el.lastChild.textContent = `Simulation ${e.done} of ${e.total}`; } return; } if (!S.busy || e.type !== 'experiment-progress') return; S.progress = { done: e.done, total: e.total }; const wp = document.querySelector('[data-wi-progress]'); if (wp) { wp.firstChild.firstChild.style.width = `${(e.done / e.total) * 100}%`; wp.lastChild.textContent = `Flight ${e.done} of ${e.total}`; } const el = document.getElementById('exp-progress'); if (el) { el.firstChild.firstChild.style.width = `${(e.done / e.total) * 100}%`; el.lastChild.textContent = `Simulation ${e.done} of ${e.total}`; } }), app.on('design', () => { if (!S.busy && !MC.busy) render(); })];
    render();
    return () => offs.forEach((f) => f());
  },
};
