// Quality workspaces: requirements and traceability, reliability / FMEA / fault tree / risk, V&V, reports.
import { h, card, btn, canvas, kpi, table, status, modelTag, select, field, num, state, runJob, revive, changed, toast, download, fmt, E } from './ui.js';
import { barChart } from './charts.js';

const sp = () => h('div', { style: { height: '14px' } });
const lastMetrics = () => state.project.lastMission?.metrics || {};

export function requirementsWorkspace(root) {
  const P = state.project;
  const ver = E.verifyAll(P.requirements, lastMetrics(), P.lastMC?.model?.id === 'lunar-mission' ? P.lastMC : null);
  const trace = E.traceabilityMatrix(P.requirements, Object.values(P.vehicles), ver, P.testResults);
  root.replaceChildren(card(null, h('h1', {}, 'Requirements and verification'),
    h('p', { class: 'lead' }, 'Each requirement is checked against the last mission simulation (and the last full-mission Monte Carlo for probabilistic ones). No data means UNKNOWN, never PASS.'),
    h('div', { class: 'kpis' }, ['PASS', 'MARGIN', 'FAIL', 'UNKNOWN'].map((s) => h('div', { class: 'kpi' }, h('div', { class: 'k' }, s), h('div', { class: 'v' }, status(s), ' ', String(ver.counts[s])))))),
  sp(), card('Verification', table([
    ['ID', (r) => h('b', {}, r.id)], ['Requirement', (r) => r.text], ['Status', (r) => status(r.result.status)], ['Value', (r) => r.result.value, { num: true }],
    ['Threshold', (r) => `${r.op} ${fmt(r.threshold)}`, { num: true }], ['Margin', (r) => (r.result.margin === null ? '—' : `${fmt(100 * r.result.margin)}%`), { num: true }], ['Method', (r) => r.verification], ['Note', (r) => r.result.note || ''],
  ], ver.rows)),
  sp(), card('Traceability: requirement → component → simulation → telemetry → test', table([
    ['Req', (t) => t.requirement], ['Subsystem', (t) => t.subsystem], ['Components', (t) => t.components.join(', ') || '—'], ['Simulation', (t) => t.simulation], ['Telemetry', (t) => t.telemetry.join(', ')], ['Tests', (t) => t.tests.length ? t.tests.map((x) => x.id || x).join(', ') : '—'], ['Status', (t) => status(t.status)],
  ], trace)));
}

export function reliabilityWorkspace(root, ctx = {}) {
  const P = state.project;
  let id = ctx.vehicle || 'lunar-lander', hours = ctx.hours || 100;
  const v = P.vehicles[id];
  const rel = E.vehicleReliability(v, { missionHours: hours });
  const fmea = E.generateFMEA(v, { missionHours: hours });
  const ft = E.faultTreeFromVehicle(v, hours);
  const cuts = E.minimalCutSets(ft).sort((a, b) => a.length - b.length);
  const basics = [...new Set(cuts.flat())];
  const imp = E.birnbaum(ft, basics);
  const risk = E.riskDashboard(lastMetrics(), { mc: P.lastMC });
  const comp = canvas('short');
  const relCard = card(`Reliability over ${hours} h`, h('div', { class: 'kpis' }, kpi('Mission reliability', rel.missionReliability, '', 'approximation', 'Constant failure rates, k-of-n redundancy'), kpi('Failure probability', rel.failureProbability, '', 'approximation'), kpi('Fault tree top event', 1 - E.evaluateFaultTree(ft), 'P(success)', 'approximation')),
    comp, table([['Component', (c) => c.name], ['Redundancy', (c) => `${c.k} of ${c.n}`], ['Reliability', (c) => c.reliability, { num: true }], ['Importance', (c) => c.importance, { num: true }], ['Single point', (c) => (c.singlePointFailure ? status('FAIL') : '')]], rel.components),
    h('h2', { style: { marginTop: '12px' } }, 'Redundancy trade for the weakest single point'),
    rel.singlePointFailures[0] ? table([['Units', (r) => r.units ?? r.n, { num: true }], ['Reliability', (r) => r.reliability, { num: true }], ['Mass kg', (r) => r.mass, { num: true }]], E.redundancyTrade(v.components.find((c) => c.id === rel.singlePointFailures[0].id), hours)) : h('p', {}, 'No single-point failures.'));
  const ftCard = card('Fault tree: minimal cut sets', table([['Cut set', (c) => c.join(' AND ')], ['Order', (c) => c.length, { num: true }]], cuts.slice(0, 15)),
    h('h2', { style: { marginTop: '12px' } }, 'Birnbaum importance'), table([['Basic event', (r) => r.id], ['Importance', (r) => r.importance ?? r.value, { num: true }]], imp.slice(0, 10)));
  const fmeaCard = card('FMEA (ranked by RPN)', table([['Component', (r) => r.component], ['Failure mode', (r) => r.failureMode], ['Effect', (r) => r.effect], ['S', (r) => r.severity, { num: true }], ['O', (r) => r.occurrence, { num: true }], ['D', (r) => r.detection, { num: true }], ['RPN', (r) => r.rpn, { num: true }], ['Risk', (r) => status(r.risk)], ['Mitigation', (r) => r.mitigation]], fmea.rows),
    h('p', { class: 'note' }, fmea._model?.note));
  const riskCard = card('Risk dashboard', h('p', { class: 'small muted' }, P.lastMission ? 'From the last mission and Monte Carlo. Each category has its own reason; there is no single combined score.' : 'Fly a mission to fill in mission-dependent risks.'),
    table([['Category', (c) => c.label], ['Level', (c) => status(c.level)], ['Value', (c) => (c.value === null ? '—' : `${fmt(c.value)} ${c.unit || ''}`), { num: true }], ['Warning / critical', (c) => `${fmt(c.warn)} / ${fmt(c.crit)}`, { num: true }], ['Why', (c) => c.why]], risk));
  root.replaceChildren(card(null, h('h1', {}, 'Reliability and risk'), h('div', { class: 'row' }, field('Vehicle', select(Object.values(P.vehicles).map((x) => [x.id, x.name]), id, (x) => reliabilityWorkspace(root, { vehicle: x, hours }))), field('Mission hours', num(hours, (x) => reliabilityWorkspace(root, { vehicle: id, hours: x }))))),
    sp(), h('div', { class: 'grid' }, relCard, riskCard), sp(), h('div', { class: 'grid' }, ftCard), sp(), fmeaCard);
  barChart(comp, { labels: rel.components.map((c) => c.id), values: rel.components.map((c) => c.failureProbability), unit: 'failure probability', colorFor: (i) => (rel.components[i].singlePointFailure ? getComputedStyle(document.documentElement).getPropertyValue('--bad') : getComputedStyle(document.documentElement).getPropertyValue('--accent')) });
}

export function vvWorkspace(root) {
  const P = state.project;
  const out = h('div');
  const show = (r) => {
    out.replaceChildren(h('div', { class: `verdict ${r.failed ? 'bad' : 'ok'}` }, `${r.passed} of ${r.rows.length} benchmarks pass${r.failed ? `; ${r.failed} FAIL` : ''}. Run at ${r.ran}.`),
      table([['Category', (b) => b.category], ['Benchmark', (b) => b.name], ['Reference', (b) => b.reference], ['Result', (b) => status(b.status)], ['Checks', (b) => h('div', { class: 'small mono' }, (b.checks || []).map((c) => h('div', {}, `${c.name || c.label || ''}: ${fmt(c.value ?? c.actual)} vs ${fmt(c.expected ?? c.reference)} (tol ${fmt(c.tolerance ?? c.tol)})`)))], ['ms', (b) => b.ms, { num: true }]], r.rows));
  };
  root.replaceChildren(card(null, h('h1', {}, 'Verification and validation'),
    h('p', { class: 'lead' }, 'Physics benchmarks against analytic solutions and published references: gravity, orbits, Hohmann, rocket equation, atmosphere, entry, CW relative motion, Kalman filter, statistics, save/load determinism and AI permission gates. The same suite runs in the automated tests.'),
    h('div', { class: 'row' }, btn('Run all benchmarks', async () => { const r = await runJob('vv', {}, 'V&V benchmarks'); P.testResults.push(...r.rows.map((b) => ({ id: b.id, status: b.status, time: r.ran }))); show(r); }, 'primary'))), sp(), out);
}

export function buildReport() {
  const P = state.project, m = P.lastMission;
  if (!m) throw new Error('Fly a mission first (Mission Control).');
  const ver = E.verifyAll(P.requirements, m.metrics, P.lastMC?.model?.id === 'lunar-mission' ? P.lastMC : null);
  const lander = P.vehicles['lunar-lander'];
  return E.buildMissionReport({ title: `${P.name}: engineering report`, objective: P.objective, vehicles: Object.values(P.vehicles), mission: m, verification: ver, mc: P.lastMC, review: E.designReview(lander, { body: 'moon' }), risk: E.riskDashboard(m.metrics, { mc: P.lastMC }) });
}

export function reportsWorkspace(root) {
  const out = h('div');
  let rep = null;
  const make = () => {
    try { rep = buildReport(); } catch (e) { out.replaceChildren(h('div', { class: 'verdict warn' }, e.message)); return; }
    const frame = h('iframe', { class: 'report', sandbox: '' });
    frame.srcdoc = E.reportToHTML(rep);
    out.replaceChildren(h('div', { class: 'row' },
      btn('Save HTML (print to PDF from the browser)', () => download('astra-report.html', E.reportToHTML(rep), 'text/html')),
      btn('Print / PDF', () => { const w = globalThis.astra; if (w?.printHtml) w.printHtml(E.reportToHTML(rep)); else frame.contentWindow?.print(); }),
      btn('Markdown', () => download('astra-report.md', E.reportToMarkdown(rep), 'text/markdown')),
      btn('JSON', () => download('astra-report.json', JSON.stringify(rep, null, 1), 'application/json')),
      btn('Telemetry CSV', () => download('astra-telemetry.csv', state.project.lastMission.recorder.toCSV(), 'text/csv')),
      btn('Events CSV', () => download('astra-events.csv', E.tableToCSV(state.project.lastMission.timeline.events.map((e) => ({ met_s: e.t, type: e.type, severity: e.severity, text: e.text }))), 'text/csv'))), frame);
  };
  root.replaceChildren(card(null, h('h1', {}, 'Reports'), h('p', { class: 'lead' }, 'Generated from the last mission run, verification, Monte Carlo, design review and risk data. The report states failures plainly.'), h('div', { class: 'row' }, btn('Generate report', make, 'primary'))), sp(), out);
  if (state.project.lastMission) make();
}
