// Design workspaces: vehicle, propulsion and wind tunnel, GNC, sensors and single-phase flight simulations.
import { h, card, btn, canvas, kpi, table, status, modelTag, select, field, num, state, runJob, revive, changed, toast, fmt, E } from './ui.js';
import { lineChart, barChart } from './charts.js';

const sp = () => h('div', { style: { height: '14px' } });
const title = (t, lead) => card(null, h('h1', {}, t), lead ? h('p', { class: 'lead' }, lead) : null);

// ---------- Vehicle ----------
export function vehicleWorkspace(root, ctx = {}) {
  const P = state.project;
  let id = ctx.vehicle || P.ui_vehicle || 'lunar-lander';
  P.ui_vehicle = id;
  const v = P.vehicles[id];
  const perf = E.performance(v), mb = E.massBudget(v);
  const body = id === 'lunar-lander' || id === 'crew-capsule' ? 'moon' : 'earth';
  const review = E.designReview(v, { body });
  const cost = E.costEstimate(v);
  const rel = E.vehicleReliability(v, { missionHours: 100 });
  const edit = (path, val) => { E.setPath(v, path, val); vehicleWorkspace(root, { vehicle: id }); };

  const stageRows = v.stages.map((s, i) => ({ s, i }));
  const editor = card('Stages (edit to explore; commit to save a version)', table([
    ['Stage', (r) => r.s.name],
    ['Propellant kg', (r) => num(r.s.propMass, (x) => edit(`stages.${r.i}.propMass`, x), { width: '90px' })],
    ['Dry kg', (r) => num(r.s.dryMass, (x) => edit(`stages.${r.i}.dryMass`, x), { width: '80px' })],
    ['Engines', (r) => r.s.engines.map((e, k) => h('div', { class: 'row', style: { marginBottom: '2px' } },
      h('span', { class: 'small muted' }, `${e.count ?? 1}x`), num(e.thrustVac, (x) => edit(`stages.${r.i}.engines.${k}.thrustVac`, x), { width: '100px' }), h('span', { class: 'small muted' }, 'N vac, Isp'), num(e.ispVac, (x) => edit(`stages.${r.i}.engines.${k}.ispVac`, x), { width: '64px' }), h('span', { class: 'small muted' }, 's')))],
  ], stageRows), h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Payload kg'), num(v.payload.mass, (x) => edit('payload.mass', x))));

  const perfCard = card('Performance', h('div', { class: 'kpis' },
    kpi('Ideal delta-v', perf.totalDv, 'm/s', perf._model), kpi('Gross mass', mb.gross, 'kg', mb._model), kpi('Dry mass', mb.dry, 'kg', mb._model),
    kpi('Liftoff T/W', perf.liftoffTwr, '', perf._model), kpi('Max acceleration', perf.maxAccelG, 'g', perf._model), kpi('Mission reliability (100 h)', rel.missionReliability, '', 'approximation', 'Exponential failure model from component failure rates'),
    kpi('Unit cost', cost.unit, '$M', cost._model, cost._model?.note)),
  table([['Stage', (s) => s.stage], ['dv m/s', (s) => s.dv, { num: true }], ['Burn s', (s) => s.burnTime, { num: true }], ['T/W start', (s) => s.twrStart, { num: true }], ['T/W end', (s) => s.twrEnd, { num: true }], ['Mass ratio', (s) => s.massRatio, { num: true }]], perf.stages),
  h('p', { class: 'note' }, perf._model?.note));

  const reviewCard = card(`Design review: ${review.verdict}`,
    review.findings.length ? table([['Severity', (f) => status(f.severity)], ['Area', (f) => f.area], ['Finding', (f) => h('div', {}, h('b', {}, f.title), h('div', { class: 'small muted' }, f.evidence))], ['Recommendation', (f) => f.recommendation]], review.findings) : h('p', {}, 'No findings.'),
    h('details', {}, h('summary', {}, `${review.passed.length} checks passed of ${review.checksRun}`), h('ul', {}, review.passed.map((p) => h('li', {}, `${p.area}: ${p.text}`)))));

  // versions
  const hist = P.versions.history(v.id);
  let msg = '';
  const latest = P.versions.latest(v.id);
  const diffNow = latest ? E.diffObjects(latest.vehicle, { ...v, version: latest.vehicle.version }).filter((d) => d.path !== 'version') : [];
  const impact = latest && diffNow.length ? E.changeImpact(latest.vehicle, v, P.requirements) : null;
  const versionsCard = card('Versions',
    diffNow.length ? h('div', {}, h('p', {}, `Uncommitted changes (${diffNow.length}):`), table([['Parameter', (d) => d.path], ['From', (d) => d.from, { num: true }], ['To', (d) => d.to, { num: true }]], diffNow),
      impact ? h('p', { class: 'small' }, 'Requirements to retest: ', impact.retest.map((r) => h('span', { class: 'st MARGIN', title: r.reason, style: { marginRight: '4px' } }, r.id))) : null) : h('p', { class: 'muted' }, 'No uncommitted changes.'),
    h('div', { class: 'row' }, h('input', { type: 'text', placeholder: 'What changed and why', oninput: (e) => (msg = e.target.value), style: { flex: 1 } }),
      btn('Commit minor', () => { const e = P.versions.commit(v, msg || 'Edit'); toast(`${v.name} v${e.version}`); changed(); vehicleWorkspace(root, { vehicle: id }); }),
      btn('Commit major', () => { const e = P.versions.commit(v, msg || 'Major change', { bump: 'major' }); toast(`${v.name} v${e.version}`); changed(); vehicleWorkspace(root, { vehicle: id }); }),
      btn('Revert to latest', () => { P.vehicles[id] = P.versions.get(v.id, latest.version); vehicleWorkspace(root, { vehicle: id }); })),
    table([['Version', (e) => e.version, { num: true }], ['Message', (e) => e.message], ['Author', (e) => e.author], ['Time', (e) => e.time.slice(0, 19).replace('T', ' ')]], [...hist].reverse(), {
      onRow: (e) => { if (e.parent) { const c = P.versions.compare(v.id, e.parent, e.version); toast(`${c.changes.length} changes; ${c.derived.map((d) => `${d.name} ${fmt(d.from)} → ${fmt(d.to)}`).join('; ')}`, 6000); } } }),
    h('p', { class: 'note' }, 'Click a version to compare it with its parent, including derived changes (mass, delta-v, T/W).'));

  root.replaceChildren(
    title('Vehicle', 'Edit a vehicle, see what the physics says, and keep every change as a version with the requirements it affects.'),
    h('div', { class: 'row' }, field('Vehicle', select(Object.values(P.vehicles).map((x) => [x.id, x.name]), id, (x) => vehicleWorkspace(root, { vehicle: x })))), sp(),
    h('div', { class: 'grid' }, editor, perfCard), sp(), h('div', { class: 'grid' }, reviewCard, versionsCard));
}

// ---------- Propulsion test stand and wind tunnel ----------
export function propulsionWorkspace(root, ctx = {}) {
  let spec = { thrustVac: 100000, ispVac: 311, ispSL: 280, throttleMin: 0.4, restarts: 1, propellant: 'kerolox' }, profile = 'acceptance', ambient = 101325;
  const tsChart = canvas(), tsOut = h('div');
  const runStand = () => {
    const r = E.runTestStand(spec, { profile, ambient });
    lineChart(tsChart, { xLabel: 't (s)', series: [{ name: 'thrust (measured)', unit: 'N', x: r.series.t, y: r.series.thrustMeasured }, { name: 'thrust (model)', unit: 'N', x: r.series.t, y: r.series.thrust, dashed: true }] });
    tsOut.replaceChildren(
      r.anomalies.length ? table([['t s', (a) => a.t, { num: true }], ['Issue', (a) => status('warning'), ], ['Detail', (a) => `${a.issue}: ${a.text || ''}`]], r.anomalies) : h('p', {}, 'No anomalies.'),
      h('div', { class: 'kpis' }, Object.entries(r.summary || {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', r._model || 'approximation'))));
  };
  const stand = card('Engine test stand',
    h('div', { class: 'row' },
      field('Thrust vac (N)', num(spec.thrustVac, (x) => (spec.thrustVac = x))), field('Isp vac (s)', num(spec.ispVac, (x) => (spec.ispVac = x))), field('Isp SL (s)', num(spec.ispSL, (x) => (spec.ispSL = x))),
      field('Min throttle', num(spec.throttleMin, (x) => (spec.throttleMin = x), { step: 0.05 })), field('Restarts', num(spec.restarts, (x) => (spec.restarts = x | 0), { step: 1 })),
      field('Propellant', select(Object.keys(E.PROPELLANTS), spec.propellant, (x) => (spec.propellant = x))),
      field('Profile', select(Object.keys(E.TEST_PROFILES), profile, (x) => (profile = x))),
      field('Ambient', select([['101325', 'Sea level'], ['0', 'Vacuum chamber']], String(ambient), (x) => (ambient = +x)))),
    h('div', { class: 'row' }, btn('Fire', runStand, 'primary')), tsChart, tsOut,
    h('p', { class: 'note' }, 'Thrust vs ambient pressure is physics (momentum plus pressure thrust); chamber transients and low-throttle losses are approximations. The measured channel includes load-cell noise.'));

  let model = ctx.model || 'slender-rocket', sweep = 'mach', mach = 0.5;
  const wtChart = canvas(), wtOut = h('div');
  const runTunnel = () => {
    const geo = E.AERO_MODELS[model];
    if (sweep === 'mach') { const s = E.machSweep(geo, {}, 0.3, 3, 0.05); lineChart(wtChart, { xLabel: 'Mach', series: [{ name: 'CD', x: s.map((r) => r.mach), y: s.map((r) => r.CD) }] }); }
    else { const s = E.alphaSweep(geo, { mach }, 0, 25, 0.5); lineChart(wtChart, { xLabel: 'alpha (deg)', series: [{ name: 'CL', x: s.map((r) => r.alphaDeg), y: s.map((r) => r.CL) }, { name: 'CD', x: s.map((r) => r.alphaDeg), y: s.map((r) => r.CD) }] }); }
    const w = E.windTunnel(geo, { mach });
    wtOut.replaceChildren(h('div', { class: 'kpis' }, kpi('Reynolds number', w.flow.reynolds, '', 'physics'), kpi('Dynamic pressure', w.flow.dynamicPressure, 'Pa', 'physics'), kpi('Drag', w.forces.drag, 'N', w._model), kpi('CD', w.coefficients.CD, '', w._model),
      w.coefficients.staticMarginCalibers !== undefined ? kpi('Static margin', w.coefficients.staticMarginCalibers, 'cal', w._model) : null), h('p', { class: 'note' }, w._model?.note));
  };
  const tunnel = card('Wind tunnel',
    h('div', { class: 'row' }, field('Model', select(Object.keys(E.AERO_MODELS), model, (x) => (model = x))), field('Sweep', select([['mach', 'Mach 0.3 → 3'], ['alpha', 'Angle of attack 0 → 25°']], sweep, (x) => (sweep = x))), field('Mach (alpha sweep)', num(mach, (x) => (mach = x), { step: 0.1 })), btn('Run tunnel', runTunnel, 'primary')),
    wtChart, wtOut);
  root.replaceChildren(title('Propulsion and aerodynamics', 'Fire an engine on the test stand and put shapes in the wind tunnel. Anomalies are reported, not hidden.'), h('div', { class: 'grid' }, stand, tunnel));
  runStand(); runTunnel();
}

// ---------- GNC ----------
export function gncWorkspace(root, ctx = {}) {
  let plant = ctx.plant || 'double-integrator', g = { kp: 1, ki: 0, kd: 1, ...(ctx.gains || {}) }, dur = 40;
  const pidChart = canvas(), bode = canvas('short'), pidOut = h('div');
  const runPid = () => {
    const pl = E.PLANTS[plant]();
    const r = E.stepResponse({ controller: g, plant: pl, duration: dur });
    lineChart(pidChart, { xLabel: 't (s)', series: [{ name: 'setpoint', x: r.series.t, y: r.series.setpoint, dashed: true }, { name: 'response', x: r.series.t, y: r.series.actual }, { name: 'controller output', x: r.series.t, y: r.series.output }] });
    let cla = null; try { cla = E.closedLoopAnalysis(g, pl); } catch (e) { cla = { error: e.message }; }
    if (cla?.bode) lineChart(bode, { xLabel: 'log10 ω (rad/s)', series: [{ name: 'open-loop magnitude', unit: 'dB', x: cla.bode.map((b) => Math.log10(b.w)), y: cla.bode.map((b) => b.magDb) }], hlines: [{ y: 0, label: '0 dB' }] });
    const M = r.metrics;
    pidOut.replaceChildren(
      h('div', { class: `verdict ${M.stable ? 'ok' : 'bad'}` }, M.stable ? `Stable (${M.classification})` : `UNSTABLE: ${M.classification}`),
      h('div', { class: 'kpis' }, kpi('Overshoot', M.overshootPct, '%', 'physics'), kpi('Rise time', M.riseTime, 's', 'physics'), kpi('Settling time', M.settlingTime, 's', 'physics'), kpi('Steady-state error', M.steadyStateError, '', 'physics'),
        cla && !cla.error ? [kpi('Phase margin', cla.phaseMarginDeg, 'deg', 'physics'), kpi('Gain margin', cla.gainMarginDb, 'dB', 'physics')] : null),
      cla?.poles ? h('p', { class: 'small mono' }, 'Closed-loop poles: ', cla.poles.map((p) => `${fmt(p.re)}${p.im ? (p.im > 0 ? ' + ' : ' - ') + fmt(Math.abs(p.im)) + 'j' : ''}`).join(',  ')) : null,
      h('p', { class: 'small muted' }, pl.name));
  };
  const pidCard = card('PID designer',
    h('div', { class: 'row' }, field('Plant', select(Object.keys(E.PLANTS), plant, (x) => { plant = x; runPid(); })),
      field('Kp', num(g.kp, (x) => { g.kp = x; runPid(); }, { step: 0.1 })), field('Ki', num(g.ki, (x) => { g.ki = x; runPid(); }, { step: 0.05 })), field('Kd', num(g.kd, (x) => { g.kd = x; runPid(); }, { step: 0.1 })),
      field('Duration (s)', num(dur, (x) => { dur = x; runPid(); })),
      btn('Suggest gains', () => { try { g = { ...g, ...E.suggestGains(plant) }; gncWorkspace(root, { plant, gains: g }); } catch (e) { toast(e.message); } })),
    pidChart, h('div', { style: { height: '8px' } }), bode, pidOut);

  let actuator = 'reaction-wheel';
  const attChart = canvas('short'), attOut = h('div');
  const runAtt = () => {
    const r = E.attitudeManeuver({ actuator });
    lineChart(attChart, { xLabel: 't (s)', series: [{ name: 'angle', unit: 'deg', x: r.series.t, y: r.series.angleDeg }, { name: 'estimate error', unit: 'deg', x: r.series.t, y: r.series.estimateErrorDeg }], hlines: [{ y: 30, label: 'target 30°' }] });
    attOut.replaceChildren(h('div', { class: `verdict ${r.summary.achieved ? 'ok' : 'bad'}` }, r.summary.achieved ? 'Target attitude reached' : 'Target attitude NOT reached'), h('div', { class: 'kpis' }, Object.entries(r.summary).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', 'approximation', 'Rigid body is physics; actuator limits are approximations'))));
  };
  const attCard = card('Attitude control: 30° slew', h('div', { class: 'row' }, field('Actuator', select(Object.keys(E.ACTUATORS), actuator, (x) => { actuator = x; runAtt(); }))), attChart, attOut);

  let aid = 'gnss';
  const navChart = canvas('short');
  const runNav = () => {
    const r = E.navigationExperiment({ duration: 600, aid }, E.makeRng);
    lineChart(navChart, { xLabel: 't (s)', series: [{ name: 'INS only error', unit: 'm', x: r.t, y: r.insError }, { name: 'Kalman filter error', unit: 'm', x: r.t, y: r.kfError }, { name: 'filter 3σ', unit: 'm', x: r.t, y: r.kf3Sigma, dashed: true }] });
  };
  const navCard = card('Navigation: inertial drift and aiding', h('div', { class: 'row' }, field('Aiding', select(Object.keys(E.NAV_SOURCES).concat(['none']).filter((v, i, a) => a.indexOf(v) === i), aid, (x) => { aid = x; runNav(); }))), navChart,
    h('p', { class: 'note' }, 'Kalman filter with real sensor noise models; the true trajectory is known only to the simulator and is used here to plot the error.'));
  root.replaceChildren(title('Guidance, navigation and control'), h('div', { class: 'grid' }, pidCard, h('div', {}, attCard, sp(), navCard)));
  runPid(); runAtt(); runNav();
}

// ---------- Sensors ----------
export function sensorsWorkspace(root) {
  let type = 'temperature', fault = 'none', seed = 1;
  const chart = canvas(), out = h('div');
  const run = () => {
    const spec = E.SENSOR_PRESETS[type];
    const truth = (t) => (spec.range ? (spec.range[0] + spec.range[1]) / 2 : 0) + Math.sin(t / 30) * (spec.range ? (spec.range[1] - spec.range[0]) * 0.05 : 1);
    const s = new E.Sensor('s', { type }, seed), ref = new E.Sensor('r', { type }, seed + 100);
    if (fault !== 'none') s.inject(fault, fault === 'drift-runaway' ? { rate: (spec.noiseSd || 1) * 0.05 } : fault === 'corrupt' ? { rate: 0.05 } : {});
    const a = [], b = [], tt = [];
    for (let i = 0; i < 3000; i++) { const t = i * 0.1, x = s.update(t, truth(t)), y = ref.update(t, truth(t)); if (x) a.push(x); if (y) b.push(y); tt.push(t); }
    lineChart(chart, { xLabel: 't (s)', series: [{ name: 'truth', unit: spec.units, x: tt, y: tt.map(truth), dashed: true }, { name: 'sensor', unit: spec.units, x: a.map((r) => r.t), y: a.map((r) => (r.valid ? r.value : NaN)) }, { name: 'redundant unit', unit: spec.units, x: b.map((r) => r.t), y: b.map((r) => (r.valid ? r.value : NaN)) }] });
    const d = E.diagnoseSensor(a, spec, b);
    out.replaceChildren(h('h2', {}, 'Diagnosis from telemetry only'), d.length ? table([['Issue', (f) => f.issue], ['Severity', (f) => status(f.severity)], ['Evidence', (f) => f.evidence]], d) : h('p', {}, 'No problems detected.'),
      h('p', { class: 'note' }, 'The diagnosis never sees the injected fault; it works only from the samples, like a ground controller would.'));
  };
  root.replaceChildren(title('Sensors', 'Each sensor has noise, bias, drift, latency, resolution, sample rate and dropouts. Inject a fault and see whether diagnosis finds it.'),
    card('Sensor bench', h('div', { class: 'row' }, field('Sensor', select(Object.keys(E.SENSOR_PRESETS), type, (x) => (type = x))), field('Fault', select(['none', 'stuck', 'dropout', 'drift-runaway', 'corrupt', 'bias-jump', 'dead'], fault, (x) => (fault = x))), field('Seed', num(seed, (x) => (seed = x | 0), { step: 1, width: '60px' })), btn('Run', run, 'primary')), chart, out));
  run();
}

// ---------- Single-phase flight simulations ----------
export function simulationWorkspace(root, ctx = {}) {
  let kind = ctx.kind || 'descent', failure = 'none', seed = 1, gamma = -6.5, entryVehicle = ctx.vehicle === 'mars-lander' ? 'mars-lander' : 'crew-capsule';
  const FAIL = {
    ascent: { none: [], 'engine-out at 30 s': [{ t: 30, type: 'engine-out', engines: 1 }], 'propellant leak at 40 s': [{ t: 40, type: 'propellant-leak', rate: 20 }], 'thrust loss 25% at 20 s': [{ t: 20, type: 'thrust-loss', fraction: 0.25 }] },
    descent: { none: [], 'landing radar lost at 300 s': [{ t: 300, type: 'radar-failure' }], 'thrust loss 20% at 200 s': [{ t: 200, type: 'thrust-loss', fraction: 0.2 }], 'IMU bias': [{ t: 50, type: 'imu-bias', bias: 0.05 }], 'engine shutdown at 400 s': [{ t: 400, type: 'engine-failure' }] },
    entry: { none: [] }, rendezvous: { none: [] },
  };
  const chart = canvas('tall'), out = h('div');
  let chans = [];
  const run = async () => {
    const P = state.project;
    const failures = FAIL[kind][failure] || [];
    let r;
    if (kind === 'ascent') r = await runJob('ascent', { vehicle: P.vehicles['small-launcher'], options: { targetAlt: 200e3, kickDeg: E.tuneAscent(P.vehicles['small-launcher'], { targetAlt: 200e3 }).kickDeg, failures, seed } }, 'Ascent');
    else if (kind === 'descent') r = await runJob('descent', { vehicle: P.vehicles['lunar-lander'], options: { seed, failures } }, 'Powered descent');
    else if (kind === 'entry') r = await runJob('entry', { entryVehicle, options: { gammaDeg: gamma, seed } }, 'Entry');
    else r = await runJob('rendezvous', { options: { seed } }, 'Rendezvous');
    r = revive(r);
    const rec = r.recorder; chans = chans.filter((c) => rec.channels.has(c)); if (!chans.length) chans = [rec.names()[0]];
    const draw = () => lineChart(chart, { xLabel: 't (s)', series: chans.map((c) => { const s = rec.series(c); return { name: c, unit: s.unit, x: s.t, y: s.values }; }), markers: r.timeline.events.filter((e) => e.severity !== 'info').map((e) => ({ x: e.t })) });
    out.replaceChildren(
      h('div', { class: `verdict ${r.success ? 'ok' : 'bad'}` }, `${r.success ? 'SUCCESS' : 'FAILURE'}: ${r.text}`),
      h('div', { class: 'row' }, modelTag(r.model, r.modelNote), h('span', { class: 'small muted' }, r.modelNote || '')),
      h('div', { class: 'kpis' }, Object.entries(r).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', r.model))),
      h('div', { class: 'row', style: { marginTop: '10px' } }, rec.names().map((n) => h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: chans.includes(n), onchange: (e) => { chans = e.target.checked ? [...chans, n] : chans.filter((c) => c !== n); draw(); } }), ` ${n}`))),
      h('div', { class: 'grid wide' }, h('div', {}, chart), h('div', { class: 'events' }, r.timeline.events.map((e) => h('div', { class: e.severity }, h('span', { class: 't' }, `${fmt(e.t)} s`), e.text)))),
      h('div', { class: 'row' }, btn('Export CSV', () => import('./ui.js').then(({ download }) => download(`${kind}.csv`, rec.toCSV(), 'text/csv')))));
    draw();
  };
  const corridor = async () => {
    const c = revive(await runJob('corridor', { entryVehicle }, 'Entry corridor'));
    out.replaceChildren(h('div', { class: 'verdict ok' }, `Entry corridor: ${fmt(c.steep)}° (steep limit) to ${fmt(c.shallow)}° (shallow limit)`),
      table([['Flight-path angle °', (r) => r.gammaDeg, { num: true }], ['Outcome', (r) => r.outcome], ['Peak g', (r) => r.maxG, { num: true }], ['Peak heat flux W/m²', (r) => r.maxHeatFlux, { num: true }]], c.rows.filter((_, i) => i % 5 === 0)));
  };
  const opts = h('div', { class: 'row' },
    field('Simulation', select([['ascent', 'Ascent to orbit (small launcher)'], ['descent', 'Lunar powered descent'], ['entry', 'Atmospheric entry'], ['rendezvous', 'Rendezvous and docking']], kind, (x) => simulationWorkspace(root, { kind: x }))),
    FAIL[kind] && Object.keys(FAIL[kind]).length > 1 ? field('Failure', select(Object.keys(FAIL[kind]), failure, (x) => (failure = x))) : null,
    kind === 'entry' ? [field('Vehicle', select(Object.keys(E.ENTRY_VEHICLES), entryVehicle, (x) => (entryVehicle = x))), field('Entry angle °', num(gamma, (x) => (gamma = x), { step: 0.1 }))] : null,
    field('Seed', num(seed, (x) => (seed = x | 0), { step: 1, width: '60px' })), btn('Run', run, 'primary'), kind === 'entry' ? btn('Find corridor', corridor) : null);
  root.replaceChildren(title('Flight simulations', 'Run one mission phase in detail, with failures. The outcome is decided by the physics; a failed run is shown as failed.'), card(null, opts, out));
}
