// Mission workspaces: integrated engineering loop and Mission Control (consoles, timeline, replay).
import { h, card, btn, canvas, kpi, table, status, modelTag, select, field, num, state, runJob, revive, changed, renderFooter, toast, fmt, E } from './ui.js';
import { lineChart } from './charts.js';

export const MISSION_FAILURES = {
  none: ['No injected failures', {}],
  'launch-engine-out': ['Launch: one first-stage engine out at 60 s', { launch: [{ t: 60, type: 'engine-out', engines: 1 }] }],
  'launch-thrust-loss': ['Launch: 25% first-stage thrust loss at 20 s', { launch: [{ t: 20, type: 'thrust-loss', fraction: 0.25 }] }],
  'descent-radar': ['Descent: landing radar lost at 300 s', { descent: [{ t: 300, type: 'radar-failure' }] }],
  'descent-thrust': ['Descent: 20% thrust loss at 200 s', { descent: [{ t: 200, type: 'thrust-loss', fraction: 0.2 }] }],
  'descent-imu': ['Descent: IMU accelerometer bias', { descent: [{ t: 50, type: 'imu-bias', bias: 0.05 }] }],
  'descent-engine': ['Descent: engine shutdown at 400 s', { descent: [{ t: 400, type: 'engine-failure' }] }],
  'lm-battery': ['Lander: battery capacity -50%', { lmPower: { fault: 'battery-degradation', fraction: 0.5 } }],
  'csm-excess-load': ['Service module: 900 W unexplained load', { csmPower: { fault: 'excess-consumption', power: 900 } }],
};

export const met = (s) => { const d = Math.floor(s / 86400), r = s - d * 86400, p = (x) => String(Math.floor(x)).padStart(2, '0'); return `${d}d ${p(r / 3600)}:${p((r % 3600) / 60)}:${p(r % 60)}`; };

const CONSOLES = {
  FLIGHT: ['altitude', 'speed', 'accelerationG', 'propellant', 'distanceFromEarth'],
  EPS: ['batterySoc', 'powerGeneration', 'powerDemand'],
  THERMAL: ['avionicsTemp', 'heatShieldTemp'],
  COMMS: ['linkMargin', 'commDelay'],
};

export async function flyMission(failureKey = 'none', seed = 1) {
  const m = revive(await runJob('mission', { failures: MISSION_FAILURES[failureKey][1], seed }, 'Lunar mission simulation'));
  m.failureCase = failureKey;
  state.project.lastMission = m;
  state.project.testResults.push({ id: `mission-${Date.now()}`, kind: 'lunar-mission', status: m.success ? 'PASS' : 'FAIL', failedPhase: m.failedPhase, failures: failureKey, time: new Date().toISOString() });
  renderFooter(); changed();
  return m;
}

// ---------- Mission Control ----------
export function missionControl(root) {
  const P = state.project;
  let failureKey = P.lastMission?.failureCase || 'none', seed = 1;
  const head = card(null,
    h('h1', {}, 'Mission Control'),
    h('p', { class: 'lead' }, 'Fly the complete lunar mission in the simulator: launch, translunar injection, lunar orbit, powered descent, surface, ascent, rendezvous, return and entry. Every value below is recorded from that run.'),
    h('div', { class: 'row' },
      btn('Fly mission', async () => { await flyMission(failureKey, seed); missionControl(root); }, 'primary'),
      field('Failure injection', select(Object.entries(MISSION_FAILURES).map(([k, v]) => [k, v[0]]), failureKey, (v) => (failureKey = v))),
      field('Random seed', num(seed, (v) => (seed = v | 0), { step: 1, width: '70px' }))));
  const m = P.lastMission;
  if (!m) { root.replaceChildren(head, h('div', { style: { height: '14px' } }), card(null, h('p', { class: 'muted' }, 'No mission flown yet. Press "Fly mission". The run takes about a second.'))); return; }

  const verdict = m.success
    ? h('div', { class: 'verdict ok' }, `Mission complete: crew recovered. Mission elapsed time ${fmt(m.met / 86400)} days.`)
    : h('div', { class: 'verdict bad' }, `Mission failed in phase "${m.failedPhase}". ${m.phases.at(-1)?.text || ''}`);

  const phases = card('Phases', table([
    ['Phase', (p) => p.name], ['Result', (p) => status(p.success ? 'PASS' : 'FAIL')], ['MET', (p) => `${fmt(p.met / 3600)} h`, { num: true }],
    ['Outcome', (p) => p.text], ['Model', (p) => modelTag(p.model, p.detail?.modelNote)],
  ], m.phases));

  const metrics = card('Key results', h('div', { class: 'kpis' }, Object.entries(m.metrics).map(([k, v]) => kpi(k, v, '', 'physics', 'From the time-domain simulation; see the phase model labels for each source'))));

  // telemetry + replay
  const rec = m.recorder, tl = m.timeline;
  const replay = new E.Replay(rec);
  let channels = ['altitude'], cursor = rec.t[0];
  const chart = canvas('tall');
  const frameBox = h('div', { class: 'grid' });
  const scrub = h('input', { type: 'range', min: rec.t[0], max: rec.t.at(-1), step: 'any', value: rec.t[0], style: { flex: 1 } });
  const clock = h('span', { class: 'mono' });
  let rate = 1000;
  const draw = () => {
    lineChart(chart, { xLabel: 'MET (s)', series: channels.map((c) => { const s = rec.series(c); return { name: c, unit: s.unit, x: s.t, y: s.values }; }),
      cursor, markers: tl.events.filter((e) => e.severity !== 'info' || e.type.startsWith('phase')).map((e) => ({ x: e.t })), onPick: (t) => seek(t) });
    const f = replay.seek(cursor);
    clock.textContent = `MET ${met(cursor)} · phase ${f.phase ?? '—'}`;
    frameBox.replaceChildren(...Object.entries(CONSOLES).map(([name, chs]) => h('div', { class: 'card' }, h('h2', {}, name),
      table([['Channel', (c) => c], ['Value', (c) => (typeof f[c] === 'number' ? f[c] : null), { num: true }], ['Unit', (c) => rec.channels.get(c)?.unit]], chs.filter((c) => rec.channels.has(c))))));
  };
  const seek = (t) => { cursor = Math.max(rec.t[0], Math.min(rec.t.at(-1), t)); scrub.value = cursor; draw(); };
  scrub.oninput = () => seek(parseFloat(scrub.value));
  let raf = null;
  const play = () => {
    if (raf) { cancelAnimationFrame(raf); raf = null; return; }
    let last = performance.now();
    const tick = (now) => { const dt = (now - last) / 1000; last = now; seek(cursor + dt * rate); if (cursor >= rec.t.at(-1) || !document.body.contains(chart)) { raf = null; return; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  };
  const chSel = h('div', { class: 'row' }, rec.names().filter((n) => n !== 'phase').map((n) => h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: channels.includes(n), onchange: (e) => { channels = e.target.checked ? [...channels, n] : channels.filter((c) => c !== n); draw(); } }), ` ${n}`)));
  const telemetry = card('Telemetry and replay',
    h('div', { class: 'row' }, btn('Play / pause', play), field('Replay speed (x)', select(E.WARP_LEVELS.map(String), String(rate), (v) => (rate = +v))), clock),
    h('div', { class: 'row' }, scrub), chSel, chart,
    h('p', { class: 'note' }, 'Replay reads recorded samples only; it never re-simulates. Click the chart or a timeline event to jump to that moment.'));

  const evList = h('div', { class: 'events' }, [...tl.events].sort((a, b) => a.t - b.t).map((e) => h('div', { class: e.severity, onclick: () => seek(e.t) }, h('span', { class: 't' }, met(e.t)), e.text)));
  const timeline = card('Event timeline', evList);

  const twinRows = Object.entries(m.twins || {}).flatMap(([veh, tw]) => Object.entries(tw.fields || {}).map(([f, v]) => ({ veh, f, ...v })));
  const twins = card('Digital twins', table([['Vehicle', (r) => r.veh], ['Field', (r) => r.f], ['Status', (r) => status(r.status === 'live' ? 'ok' : r.status === 'stale' ? 'warning' : 'UNKNOWN')], ['Source', (r) => r.source || '—'], ['At MET', (r) => (r.t !== undefined ? `${fmt(r.t / 3600)} h` : '—'), { num: true }]], twinRows),
    h('p', { class: 'note' }, 'Twin fields are written only by simulation modules. A field nothing has produced stays "unknown"; old data shows as stale. Nothing is filled in.'));

  root.replaceChildren(head, verdict, h('div', { class: 'grid wide' }, h('div', {}, telemetry, h('div', { style: { height: '14px' } }), frameBox), h('div', {}, timeline, h('div', { style: { height: '14px' } }), twins)), h('div', { style: { height: '14px' } }), h('div', { class: 'grid' }, phases, metrics));
  draw();
}

// ---------- Integrated engineering loop ----------
const LOOP_STEPS = ['Define requirements', 'Design', 'Calculate', 'Analyze', 'Simulate', 'Measure', 'Verify', 'Identify failures', 'Diagnose', 'Improve design'];
export function engineeringLoop(root) {
  const P = state.project;
  let mcRuns = 8, maxIterations = 2;
  const steps = h('div', { class: 'steps' }, LOOP_STEPS.map((s) => h('span', {}, s)));
  const out = h('div');
  const run = async () => {
    const r = revive(await runJob('loop', { mcRuns, maxIterations }, 'Engineering loop'));
    P.lastLoop = r;
    const last = r.iterations.at(-1);
    P.lastMC = last.mc; changed(); show(r);
  };
  const show = (r) => {
    const done = new Set(r.log.map((l) => l.step));
    [...steps.children].forEach((s) => s.classList.toggle('done', done.has(s.textContent)));
    const its = r.iterations;
    const trend = its.length > 1 ? E.riskTrend(its[0].risk, its.at(-1).risk) : null;
    const changes = r.log.filter((l) => l.step === 'Improve design');
    out.replaceChildren(
      h('div', { class: 'grid' },
        card('Verification by iteration', table([
          ['Iteration', (it) => it.iteration, { num: true }], ['Mission', (it) => status(it.mission.success ? 'PASS' : 'FAIL')],
          ['PASS', (it) => it.verification.counts.PASS, { num: true }], ['MARGIN', (it) => it.verification.counts.MARGIN, { num: true }], ['FAIL', (it) => it.verification.counts.FAIL, { num: true }], ['UNKNOWN', (it) => it.verification.counts.UNKNOWN, { num: true }],
          ['Monte Carlo success', (it) => it.mc ? `${fmt(100 * it.mc.successProbability.p)}% (95% CI ${fmt(100 * it.mc.successProbability.lo)}–${fmt(100 * it.mc.successProbability.hi)}%, n=${it.mc.runs})` : 'not run'],
        ], its), h('p', { class: 'note' }, 'Small Monte Carlo samples give wide confidence intervals. Raise the run count before trusting a probability.')),
        card('Design changes the loop made', changes.length ? changes.map((c) => h('div', {},
          table([['Vehicle', (x) => x.vehicle], ['Parameter', (x) => x.path], ['From', (x) => x.from, { num: true }], ['To', (x) => x.to, { num: true }], ['Because', (x) => x.because]], c.changes),
          h('p', { class: 'small muted' }, c.impact.map((i) => `${i.vehicle} → v${i.version}${i.retest.length ? `; retest ${i.retest.join(', ')}` : ''}`).join(' · ')))) : h('p', { class: 'muted' }, 'No automatic change was needed or available.')),
        trend ? card('Risk trend (first → last iteration)', table([['Risk', (t) => t.label], ['From', (t) => t.from, { num: true }], ['To', (t) => t.to, { num: true }], ['Level', (t) => h('span', {}, status(t.levelFrom || 'UNKNOWN'), ' → ', status(t.levelTo || 'UNKNOWN'))]], trend)) : null,
        card('Final verification', table([['Req', (r) => r.id], ['Status', (r) => status(r.result.status)], ['Value', (r) => r.result.value, { num: true }], ['Requirement', (r) => r.text]], its.at(-1).verification.rows))),
      h('div', { style: { height: '14px' } }),
      card('Loop log', h('div', { class: 'events' }, r.log.map((l) => h('div', {}, h('span', { class: 't' }, l.step), ' ', JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'step'))).slice(0, 400))))));
  };
  root.replaceChildren(card(null,
    h('h1', {}, 'Engineering loop'),
    h('p', { class: 'lead' }, 'Requirements → design → calculation → analysis → simulation → measurement → verification → failure identification → diagnosis → design improvement. Each pass flies the full mission and a Monte Carlo set, then versions any change and lists which requirements must be retested.'),
    h('div', { class: 'row' }, btn('Run loop', run, 'primary'), field('Monte Carlo runs per pass', num(mcRuns, (v) => (mcRuns = Math.max(0, v | 0)), { step: 1, width: '70px' })), field('Max passes', num(maxIterations, (v) => (maxIterations = Math.max(1, v | 0)), { step: 1, width: '60px' }))),
    steps), h('div', { style: { height: '14px' } }), out);
  if (P.lastLoop) show(P.lastLoop);
}
