// Analysis workspaces: Monte Carlo, sensitivity (tornado), parameter sweeps, trade studies and experiment mode.
import { h, card, btn, canvas, kpi, table, status, modelTag, select, field, num, state, runJob, revive, changed, toast, download, fmt, E } from './ui.js';
import { lineChart, barChart, tornadoChart, scatterChart } from './charts.js';

const sp = () => h('div', { style: { height: '14px' } });
const MODEL_NAMES = { 'lunar-landing': 'Lunar landing (powered descent)', ascent: 'Ascent to orbit (small launcher)', entry: 'Earth entry (crew capsule)', rendezvous: 'Rendezvous and docking', 'lunar-mission': 'Complete lunar mission (slow: about 1 s per run)' };

export function monteCarloWorkspace(root, ctx = {}) {
  const P = state.project;
  let model = ctx.model || 'lunar-landing', runs = model === 'lunar-mission' ? 20 : 200, seed = 12345, metric = null, xParam = null;
  const out = h('div');
  const show = (r) => {
    const names = Object.keys(r.metrics); metric = metric && names.includes(metric) ? metric : names[0];
    xParam = xParam && r.params.some((p) => p.id === xParam) ? xParam : r.params[0]?.id;
    const hist = canvas(), sc = canvas(), fm = canvas('short');
    const m = r.metrics[metric];
    const sp_ = r.successProbability;
    const drawHist = () => { const mm = r.metrics[metric]; barChart(hist, { labels: mm.histogram.edges.slice(0, -1).map((e) => fmt(e)), values: mm.histogram.counts, unit: metric }); };
    const drawScatter = () => scatterChart(sc, { points: (r.results || []).map((x) => ({ x: x.inputs[xParam], y: x.metrics?.[metric], ok: x.success })), xLabel: xParam, yLabel: metric });
    const modes = Object.entries(r.failureModes).sort((a, b) => b[1] - a[1]);
    const drivers = E.successDrivers(r).filter((d) => Number.isFinite(d.correlation));
    out.replaceChildren(
      h('div', { class: `verdict ${sp_.lo > 0.95 ? 'ok' : sp_.hi < 0.9 ? 'bad' : 'warn'}` }, `Success ${r.successes} of ${r.runs} runs: ${fmt(100 * sp_.p)}% (95% confidence interval ${fmt(100 * sp_.lo)}–${fmt(100 * sp_.hi)}%)`),
      h('div', { class: 'grid' },
        card('Result distribution', h('div', { class: 'row' }, field('Metric', select(names, metric, (x) => { metric = x; drawHist(); drawScatter(); stats(); }))), hist, h('div', { id: 'mcstats' })),
        card('Inputs vs result (red = failed run)', h('div', { class: 'row' }, field('Input', select(r.params.map((p) => [p.id, p.label]), xParam, (x) => { xParam = x; drawScatter(); }))), sc),
        card('Failure modes', modes.length ? [table([['Mode', (x) => x[0]], ['Runs', (x) => x[1], { num: true }], ['Share', (x) => `${fmt(100 * x[1] / r.runs)}%`, { num: true }]], modes)] : h('p', {}, 'No failures in this sample. That does not prove zero risk: the upper confidence bound is shown above.')),
        card('What drives success (Spearman rank correlation)', drivers.length ? table([['Input', (d) => d.label], ['Correlation with success', (d) => d.correlation, { num: true }]], drivers.slice(0, 10)) : h('p', { class: 'muted' }, 'No failures, so no success drivers can be estimated.')),
        card('Uncertain inputs', table([['Input', (p) => p.label], ['Distribution', (p) => p.distribution], ['Nominal', (p) => p.nominal, { num: true }], ['Spread', (p) => p.sd ?? (p.min !== undefined ? `${fmt(p.min)}..${fmt(p.max)}` : '—'), { num: true }], ['Unit', (p) => p.unit]], r.params))),
      h('div', { class: 'row', style: { marginTop: '10px' } }, btn('Export runs CSV', () => download(`montecarlo-${r.model.id}.csv`, E.tableToCSV((r.results || []).map((x) => ({ run: x.i, seed: x.seed, success: x.success, failureMode: x.failureMode ?? '', ...x.inputs, ...x.metrics }))), 'text/csv')),
        btn('Export JSON', () => download(`montecarlo-${r.model.id}.json`, JSON.stringify(r, null, 1), 'application/json'))));
    const stats = () => { const mm = r.metrics[metric]; const el = out.querySelector('#mcstats'); el?.replaceChildren(h('div', { class: 'kpis' }, ['mean', 'sd', 'min', 'p05', 'p50', 'p95', 'max'].map((k) => kpi(k, mm[k], '', 'physics', 'Statistic over simulated runs')))); };
    drawHist(); drawScatter(); stats();
  };
  const run = async () => {
    const r = await runJob('mc', { model, runs, seed }, `Monte Carlo ${runs} runs`);
    P.lastMC = r; changed(); show(r);
  };
  root.replaceChildren(card(null, h('h1', {}, 'Monte Carlo'), h('p', { class: 'lead' }, 'Every run is a full simulation with sampled thrust, Isp, mass, sensor errors, wind, density and initial-state errors. Inputs and seeds are recorded so any run can be repeated exactly.'),
    h('div', { class: 'row' }, field('Model', select(Object.entries(MODEL_NAMES), model, (x) => monteCarloWorkspace(root, { model: x }))), field('Runs', num(runs, (x) => (runs = Math.max(2, x | 0)), { step: 1 })), field('Seed', num(seed, (x) => (seed = x | 0), { step: 1 })), btn('Run Monte Carlo', run, 'primary'))),
  sp(), out);
  if (P.lastMC?.model?.id === model && P.lastMC.results) show(P.lastMC);
}

export function sensitivityWorkspace(root, ctx = {}) {
  let model = ctx.model || 'lunar-landing', metric = ctx.metric || 'propellantRemaining';
  const METRICS = { 'lunar-landing': ['propellantRemaining', 'touchdownVz', 'touchdownVh', 'landingError', 'maxG'], ascent: ['propellantRemaining', 'maxQ', 'maxG'], entry: ['maxG', 'maxHeatFlux', 'ablatorMarginFrac'], rendezvous: ['rcsMarginFrac', 'dvUsed'] };
  const tor = canvas('tall'), tOut = h('div');
  const runT = async () => {
    const t = await runJob('tornado', { model, metric }, 'Sensitivity');
    tornadoChart(tor, { rows: t.rows, nominal: t.nominal });
    tOut.replaceChildren(table([['Input', (r) => r.label], ['Low', (r) => r.valueLow, { num: true }], ['High', (r) => r.valueHigh, { num: true }], ['Swing', (r) => r.swing, { num: true }], ['Flips outcome', (r) => (r.flipsOutcome ? status('FAIL') : '')]], t.rows),
      h('p', { class: 'note' }, 'Each input is moved to its low and high value (about 2σ) with all others nominal, and the full simulation is rerun. Red bars mean the run failed at that setting.'));
  };
  let sParam = 'massScale', from = 0.9, to = 1.1, n = 9;
  const swc = canvas(), swOut = h('div');
  const runS = async () => {
    const rows = await runJob('sweep', { model, param: sParam, from, to, n }, 'Parameter sweep');
    lineChart(swc, { xLabel: sParam, series: [{ name: metric, x: rows.map((r) => r.value), y: rows.map((r) => r[metric]) }], markers: rows.filter((r) => !r.success).map((r) => ({ x: r.value, color: 'red' })) });
    swOut.replaceChildren(table([['Value', (r) => r.value, { num: true }], ['Result', (r) => status(r.success ? 'PASS' : 'FAIL')], [metric, (r) => r[metric], { num: true }], ['Failure', (r) => r.failureMode || '']], rows));
  };
  const params = E.MODELS[model]().params;
  if (!params.some((p) => p.id === sParam)) sParam = params[0].id;
  root.replaceChildren(card(null, h('h1', {}, 'Sensitivity and sweeps'), h('p', { class: 'lead' }, 'Find which uncertainties matter most, then sweep one of them to see where the design breaks.'),
    h('div', { class: 'row' }, field('Model', select(Object.keys(METRICS).map((k) => [k, MODEL_NAMES[k]]), model, (x) => sensitivityWorkspace(root, { model: x, metric: METRICS[x][0] }))), field('Metric', select(METRICS[model], metric, (x) => (metric = x))))),
  sp(), h('div', { class: 'grid' },
    card('Tornado chart', h('div', { class: 'row' }, btn('Run sensitivity', runT, 'primary')), tor, tOut),
    card('Parameter sweep', h('div', { class: 'row' }, field('Input', select(params.map((p) => [p.id, p.label]), sParam, (x) => (sParam = x))), field('From', num(from, (x) => (from = x))), field('To', num(to, (x) => (to = x))), field('Steps', num(n, (x) => (n = Math.max(2, x | 0)), { step: 1, width: '60px' })), btn('Run sweep', runS, 'primary')), swc, swOut)));
}

export function tradeWorkspace(root) {
  const P = state.project;
  let picks = Object.keys(P.vehicles).slice(0, 2), payload = 2000, iters = 30;
  const out = h('div'), exp = h('div');
  const runTrade = () => {
    const t = E.tradeStudy(picks.map((id) => P.vehicles[id]));
    out.replaceChildren(table([['Design', (r) => r.name], ['Score', (r) => r.weightedScore, { num: true }], ...t.criteria.map((c) => [`${c.label}${c.unit ? ` (${c.unit})` : ''}`, (r) => r[c.id], { num: true }]), ['Pareto', (r) => (t.pareto.includes(r.name) ? status('PASS') : `dominated by ${r.dominatedBy.join(', ')}`)]], t.rows),
      h('p', { class: 'note' }, t.note));
  };
  const runExp = async () => {
    const r = await runJob('lander', { payload, iterations: iters }, 'Experiment: lightest lander');
    exp.replaceChildren(h('div', { class: `verdict ${r.best ? 'ok' : 'bad'}` }, r.explanation),
      r.best ? h('div', { class: 'kpis' }, Object.entries(r.best.x || {}).map(([k, v]) => kpi(k, v, '', 'physics', 'Verified by landing simulations')), kpi(r.objectiveLabel, r.best.objective, '', 'physics')) : null,
      h('h2', { style: { marginTop: '12px' } }, 'Why candidates were rejected'), table([['Reason', (x) => x[0]], ['Count', (x) => x[1], { num: true }]], Object.entries(r.rejectedReasons || {})),
      h('p', { class: 'note' }, `${r.evaluated} designs simulated, ${r.feasible} feasible. Every candidate is checked by full landing simulations with several seeds; nothing is accepted on the rocket equation alone.`));
  };
  root.replaceChildren(card(null, h('h1', {}, 'Trade studies and experiments')), sp(), h('div', { class: 'grid' },
    card('Trade study', h('div', { class: 'row' }, Object.values(P.vehicles).map((v) => h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: picks.includes(v.id), onchange: (e) => { picks = e.target.checked ? [...picks, v.id] : picks.filter((x) => x !== v.id); } }), ` ${v.name}`)), btn('Compare', runTrade, 'primary')), out),
    card('AI experiment mode: lightest lunar lander', h('p', { class: 'small muted' }, 'Question: "What is the lightest lander that can land this payload on the Moon?" The optimizer proposes designs; the descent simulator decides.'),
      h('div', { class: 'row' }, field('Payload (kg)', num(payload, (x) => (payload = x))), field('Optimizer iterations', num(iters, (x) => (iters = x | 0), { step: 1 })), btn('Run experiment', runExp, 'primary')), exp)));
  runTrade();
}
