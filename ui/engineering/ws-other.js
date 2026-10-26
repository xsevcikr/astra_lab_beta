// Subsystems (power, thermal, comms), world (orbits, constellations, station, terrain), AI Mission Director,
// Academy, challenges and emergencies.
import { h, card, btn, canvas, kpi, table, status, modelTag, select, field, num, state, runJob, revive, changed, toast, fmt, E } from './ui.js';
import { lineChart, scatterChart } from './charts.js';
import { flyMission } from './ws-mission.js';

const sp = () => h('div', { style: { height: '14px' } });

// ---------- Power / thermal / comms ----------
export function subsystemsWorkspace(root, ctx = {}) {
  let fault = ctx.fault || 'none', solarArea = 12, batteryWh = 4000, orbitMin = 92, eclipseMin = 36, hours = 12;
  const pChart = canvas(), pOut = h('div');
  const runPower = () => {
    const loads = [{ id: 'gnc', name: 'Guidance computer', power: 180, priority: 1 }, { id: 'comm', name: 'Transponder', power: 120, priority: 1 }, { id: 'heat', name: 'Heaters', power: 250, priority: 2 }, { id: 'sci', name: 'Science payload', power: 400, priority: 3 }];
    const p = new E.PowerSystem({ solarArea, batteryWh, loads });
    if (fault !== 'none') p.inject(fault, { fraction: 0.5, power: 600 });
    const t = [], soc = [], gen = [], dem = [];
    for (let s = 0; s < hours * 3600; s += 30) { const ph = (s / 60) % orbitMin; const r = p.step(30, { t: s, inEclipse: ph > orbitMin - eclipseMin, sunCos: 0.9 }); if (s % 120 === 0) { t.push(s / 3600); soc.push(r.soc * 100); gen.push(r.generation); dem.push(r.demand); } }
    lineChart(pChart, { xLabel: 't (h)', series: [{ name: 'battery', unit: '%', x: t, y: soc }, { name: 'generation', unit: 'W', x: t, y: gen.map((g) => g / 20) }, { name: 'demand', unit: 'W/20', x: t, y: dem.map((g) => g / 20) }] });
    pOut.replaceChildren(h('div', { class: `verdict ${p.safeModeRequested ? 'bad' : 'ok'}` }, p.safeModeRequested ? 'Power system requested SAFE MODE' : 'Power balance holds'),
      h('div', { class: 'events' }, p.events.slice(0, 40).map((e) => h('div', { class: e.type === 'safe-mode-request' ? 'critical' : e.type === 'load-shed' ? 'warning' : '' }, h('span', { class: 't' }, `${fmt(e.t / 3600)} h`), e.text))),
      h('p', { class: 'note' }, 'Energy balance is physics; cell efficiency, degradation and battery fade are approximations. Generation and demand are plotted divided by 20 to share the axis with battery %.'));
  };
  const power = card('Electrical power: orbit day / eclipse', h('div', { class: 'row' },
    field('Solar array m²', num(solarArea, (x) => (solarArea = x))), field('Battery Wh', num(batteryWh, (x) => (batteryWh = x))), field('Eclipse min per orbit', num(eclipseMin, (x) => (eclipseMin = x))),
    field('Fault', select(['none', 'solar-panel-failure', 'battery-degradation', 'bus-failure', 'short-circuit', 'excess-consumption'], fault, (x) => (fault = x))), btn('Run 12 h', runPower, 'primary')), pChart, pOut);

  let heat = 60;
  const tChart = canvas('short'), tOut = h('div');
  const runThermal = () => {
    const n = E.defaultSpacecraftNetwork(); n.node('avionics').internalHeat = heat;
    const t = [], series = {};
    for (let i = 0; i <= 720; i++) { if (i) n.step(60, { sunCos: (i % 92) < 56 ? 1 : 0 }); if (i % 4 === 0) { t.push(i / 60); for (const s of n.status()) (series[s.id] ||= []).push(s.T); } }
    lineChart(tChart, { xLabel: 't (h)', series: Object.entries(series).map(([k, v]) => ({ name: k, unit: 'K', x: t, y: v })) });
    tOut.replaceChildren(table([['Node', (s) => s.name], ['T (K)', (s) => s.T, { num: true }], ['Peak (K)', (s) => s.peakT, { num: true }], ['Status', (s) => status(s.status)], ['Margin K', (s) => s.margin, { num: true }]], n.status()));
  };
  const thermal = card('Thermal network (12 h)', h('div', { class: 'row' }, field('Avionics heat W', num(heat, (x) => (heat = x))), btn('Run', runThermal, 'primary')), tChart, tOut);

  let target = 'moon', powerW = 20, gainDb = 25, rate = 64000, dish = 34;
  const cOut = h('div');
  const DIST = { leo: 2000e3, geo: 35786e3, moon: 384400e3, mars: 2.25e11 };
  const runComms = () => {
    const d = DIST[target];
    const lb = E.linkBudget({ powerW, gainDb }, { gainDb: E.dishGainDb(dish, 8.4e9), systemNoiseTempK: 30 }, d, 8.4e9, rate);
    cOut.replaceChildren(h('div', { class: `verdict ${lb.margin >= 3 ? 'ok' : lb.margin >= 0 ? 'warn' : 'bad'}` }, `Link margin ${fmt(lb.margin)} dB at ${fmt(rate)} bit/s`),
      h('div', { class: 'kpis' }, kpi('EIRP', lb.eirp, 'dBW', 'physics'), kpi('Free-space loss', lb.fspl, 'dB', 'physics'), kpi('G/T', lb.gt, 'dB/K', 'physics'), kpi('Eb/N0', lb.ebn0, 'dB', 'physics'), kpi('Max data rate', lb.maxRate, 'bit/s', 'physics'), kpi('One-way light time', lb.delay, 's', 'physics')),
      h('p', { class: 'note' }, 'Friis link budget at X-band (8.4 GHz) to a ground dish. Commands to Mars arrive minutes later; the simulator delays them by the light time.'));
  };
  const comms = card('Communications link budget', h('div', { class: 'row' },
    field('Distance', select([['leo', 'Low Earth orbit'], ['geo', 'Geostationary'], ['moon', 'Moon'], ['mars', 'Mars (1.5 AU)']], target, (x) => (target = x))), field('Transmit W', num(powerW, (x) => (powerW = x))), field('Antenna gain dBi', num(gainDb, (x) => (gainDb = x))),
    field('Ground dish m', num(dish, (x) => (dish = x))), field('Data rate bit/s', num(rate, (x) => (rate = x))), btn('Compute', runComms, 'primary')), cOut);
  root.replaceChildren(card(null, h('h1', {}, 'Power, thermal and communications')), sp(), h('div', { class: 'grid' }, power, h('div', {}, thermal, sp(), comms)));
  runPower(); runThermal(); runComms();
}

// ---------- World: orbits, constellations, station, terrain ----------
export function worldWorkspace(root, ctx = {}) {
  let body = ctx.body || 'earth', fromAlt = ctx.fromAlt ?? 200e3, toAlt = ctx.toAlt ?? 35786e3;
  const hOut = h('div');
  const runH = () => {
    const b = E.getBody(body), x = E.hohmann(b.mu, b.radius + fromAlt, b.radius + toAlt);
    hOut.replaceChildren(h('div', { class: 'kpis' }, Object.entries(x).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', 'physics', 'Two-body impulsive transfer'))));
  };
  const hoh = card('Hohmann transfer', h('div', { class: 'row' }, field('Body', select(E.listBodies().map((b) => b.id ?? b), body, (x) => (body = x))), field('From altitude m', num(fromAlt, (x) => (fromAlt = x))), field('To altitude m', num(toAlt, (x) => (toAlt = x))), btn('Compute', runH, 'primary')), hOut);

  let total = 24, planes = 6, phasing = 1, alt = 20200e3, inc = 55;
  const cOut = h('div'), cMap = canvas('short');
  const runC = () => {
    const c = E.walker({ total, planes, phasing, altitude: alt, inclinationDeg: inc });
    const cov = E.coverage(c, { latStep: 15, lonStep: 30, duration: c.period, dt: 600 });
    scatterChart(cMap, { points: cov.grid.map((g) => ({ x: g.lon, y: g.lat, ok: g.fraction >= 0.999 })), xLabel: 'longitude', yLabel: 'latitude (red = gaps)' });
    const s = E.spacing(c);
    cOut.replaceChildren(h('div', { class: 'kpis' }, kpi('Global coverage', 100 * cov.coverageFraction, '%', 'physics'), kpi('Mean satellites visible', cov.meanVisible, '', 'physics'), kpi('Max revisit gap', cov.maxRevisitGap, 's', 'physics'), kpi('Period', s.periodMin, 'min', 'physics'), kpi('In-plane spacing', s.inPlaneDeg, 'deg', 'physics')));
  };
  const cons = card('Constellation designer (Walker delta)', h('div', { class: 'row' }, field('Satellites', num(total, (x) => (total = x | 0), { step: 1, width: '70px' })), field('Planes', num(planes, (x) => (planes = x | 0), { step: 1, width: '60px' })), field('Phasing', num(phasing, (x) => (phasing = x | 0), { step: 1, width: '60px' })), field('Altitude m', num(alt, (x) => (alt = x))), field('Inclination °', num(inc, (x) => (inc = x), { width: '70px' })), btn('Analyze', runC, 'primary')), cMap, cOut);

  const st = new E.Station('Outpost');
  const sOut = h('div');
  const showSt = () => { const b = st.budget(); sOut.replaceChildren(st.modules.length ? table([['Module', (m) => m.id], ['Type', (m) => m.type], ['Mass kg', (m) => m.mass, { num: true }], ['Crew', (m) => m.crew, { num: true }], ['Ports', (m) => m.ports, { num: true }]], st.modules) : h('p', { class: 'muted' }, 'Empty. Add a module.'),
    h('div', { class: 'kpis' }, Object.entries(b).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', 'approximation', 'Sum of module budgets'))), (b.warnings || []).map((w) => h('div', { class: 'verdict warn' }, w))); };
  let modType = Object.keys(E.MODULE_TYPES)[0], attach = '';
  const station = card('Space station builder', h('div', { class: 'row' }, field('Module', select(Object.keys(E.MODULE_TYPES), modType, (x) => (modType = x))), field('Attach to (id)', h('input', { type: 'text', oninput: (e) => (attach = e.target.value), style: { width: '120px' } })),
    btn('Add module', () => { try { st.add(modType, undefined, attach || (st.modules.at(-1)?.id ?? null)); showSt(); } catch (e) { toast(e.message); } }, 'primary')), sOut);

  let terrain = 'highlands', seed = 7;
  const tOut = h('div');
  const runT = () => {
    const t = new E.Terrain({ type: terrain, seed });
    const site = E.selectLandingSite(t, 0, 12, 6000);
    const a = t.assessSite(site.x ?? 0, site.y ?? 0);
    tOut.replaceChildren(h('div', { class: `verdict ${a.safe && !site.unsafe ? 'ok' : 'bad'}` }, a.safe && !site.unsafe ? `Safe site found ${fmt(Math.hypot(site.x, site.y))} m from the target` : `No safe site within 6 km: ${(a.reasons || []).join('; ')}`), h('div', { class: 'kpis' }, Object.entries({ ...site, ...a }).filter(([, v]) => typeof v === 'number').map(([k, v]) => kpi(k, v, '', 'approximation', 'Procedural terrain: statistically lunar-like craters, slopes and rocks'))));
  };
  const terr = card('Landing site selection', h('div', { class: 'row' }, field('Terrain', select(Object.keys(E.TERRAIN_TYPES), terrain, (x) => (terrain = x))), field('Seed', num(seed, (x) => (seed = x | 0), { step: 1 })), btn('Find site', runT, 'primary')), tOut);
  root.replaceChildren(card(null, h('h1', {}, 'Orbits and world'), h('p', { class: 'lead' }, 'Orbit transfers, constellations, a station builder and landing-site selection on procedural terrain.')), sp(), h('div', { class: 'grid' }, hoh, cons, station, terr));
  runH(); runC(); showSt(); runT();
}

// ---------- AI Mission Director ----------
const RX = [
  [/lightest|experiment|smallest lander/i, (s) => ['experiment_lightest_lander', { payload: +(s.match(/(\d[\d,]*)\s*kg/i)?.[1]?.replace(/,/g, '') || 2000) }]],
  [/why|fail|went wrong|anomal|problem/i, () => ['analyze_failures', {}]],
  [/review/i, (s) => ['design_review', { vehicleId: pickVehicle(s) }]],
  [/monte ?carlo|probability|how likely|chance/i, (s) => ['run_monte_carlo', { model: /mission/i.test(s) ? 'lunar-mission' : /ascent|orbit/i.test(s) ? 'ascent' : /entry/i.test(s) ? 'entry' : 'lunar-landing', runs: /mission/i.test(s) ? 20 : 200 }]],
  [/sensitiv|tornado|what matters|drivers?/i, () => ['sensitivity', { model: 'lunar-landing', metric: 'propellantRemaining' }]],
  [/(fly|simulate|run).*(mission|moon)/i, () => ['run_simulation', { kind: 'lunar-mission' }]],
  [/(fly|simulate|run).*(ascent|launch)/i, (s) => ['run_simulation', { kind: 'ascent', vehicleId: 'small-launcher', options: { targetAlt: 200e3, kickDeg: 16 } }]],
  [/(fly|simulate|run).*(land|descent)/i, () => ['run_simulation', { kind: 'descent', vehicleId: 'lunar-lander', options: { seed: 1 } }]],
  [/hohmann|transfer|manoeuvre|maneuver/i, () => ['suggest_maneuver', { body: 'earth', fromAlt: 200e3, toAlt: 35786e3 }]],
  [/report/i, () => ['create_report', {}]],
  [/requirement/i, () => ['read_requirements', {}]],
  [/telemetry|channel|altitude|battery/i, (s) => ['read_telemetry', { channel: (s.match(/altitude|speed|batterySoc|battery|linkMargin|heatShieldTemp|accelerationG|propellant/i)?.[0] || 'altitude').replace(/^battery$/i, 'batterySoc') }]],
  [/compare/i, () => ['compare_designs', { vehicleIds: ['small-launcher', 'heavy-lunar'] }]],
  [/(set|change|increase|decrease)\s+(\S+)\s+(?:of\s+(\S+)\s+)?to\s+([\d.]+)/i, (s) => { const m = s.match(/(set|change|increase|decrease)\s+(\S+)\s+(?:of\s+(\S+)\s+)?to\s+([\d.]+)/i); return ['modify_vehicle', { vehicleId: m[3] || pickVehicle(s), path: m[2], value: +m[4], reason: s }]; }],
  [/explain|what is|how does|teach/i, (s) => ['explain_concept', { topic: s.replace(/.*(explain|what is|how does|teach me|teach)\s*/i, '').replace(/[?.]$/, '') || 'rocket equation' }]],
  [/vehicle|design|lander|rocket/i, (s) => ['read_vehicle', { vehicleId: pickVehicle(s) }]],
];
function pickVehicle(s) { return /launcher|small/i.test(s) ? 'small-launcher' : /heavy|saturn/i.test(s) ? 'heavy-lunar' : /capsule|crew/i.test(s) ? 'crew-capsule' : 'lunar-lander'; }
let director = null;
export function aiWorkspace(root) {
  const P = state.project;
  P.architecture ||= () => E.defaultLunarArchitecture();
  director ||= new E.MissionDirector(P, { level: 'suggest' });
  const chat = h('div', { class: 'chat' });
  const render = () => {
    chat.replaceChildren(...P.aiConversations.map((m) => h('div', { class: `msg ${m.role}` }, m.text, m.data ? h('details', {}, h('summary', {}, 'Result data'), h('pre', {}, JSON.stringify(m.data, null, 1).slice(0, 6000))) : null,
      m.pending ? h('div', { class: 'row', style: { marginTop: '6px' } }, btn('Approve', () => decide(m, true), 'primary'), btn('Reject', () => decide(m, false), 'danger')) : null)));
    chat.scrollTop = chat.scrollHeight;
    auditEl.replaceChildren(table([['#', (a) => a.id, { num: true }], ['Tool', (a) => a.tool || a.action], ['Level', (a) => a.level || `${a.from} → ${a.to}`], ['Status', (a) => status(a.status === 'ok' ? 'ok' : a.status || 'info')], ['Detail', (a) => a.error || a.resultSummary?.slice(0, 120) || '']], [...director.audit].reverse().slice(0, 40)));
  };
  const say = (role, text, data, pending) => { P.aiConversations.push({ role, text, data, pending, t: Date.now() }); render(); };
  const summarize = (tool, r) => {
    if (tool === 'analyze_failures') return r.length ? `${r.length} anomalies in the last mission. First: ${r[0].text || r[0].event || JSON.stringify(r[0]).slice(0, 120)}` : 'The last mission timeline has no warnings or critical events.';
    if (tool === 'run_simulation') return r.success !== undefined ? `${r.success ? 'Success' : 'FAILED'}: ${r.text || r.failedPhase || ''}` : 'Simulation finished.';
    if (tool === 'run_monte_carlo') return `${r.runs} runs: success ${fmt(100 * r.successProbability.p)}% (95% CI ${fmt(100 * r.successProbability.lo)}–${fmt(100 * r.successProbability.hi)}%).`;
    if (tool === 'design_review') return `Verdict ${r.verdict}: ${r.findings.length} findings. ${r.findings.slice(0, 3).map((f) => f.title).join('; ')}`;
    if (tool === 'experiment_lightest_lander') return r.explanation;
    if (tool === 'explain_concept') return `${r.title}: ${r.summary} Try it: ${r.experiment?.ask || ''}`;
    if (tool === 'suggest_maneuver') return `Burn 1 ${fmt(r.dv1)} m/s, burn 2 ${fmt(r.dv2)} m/s, total ${fmt(r.dv ?? r.total)} m/s. ${r.note || ''}`;
    if (tool === 'read_requirements') return `PASS ${r.counts.PASS}, MARGIN ${r.counts.MARGIN}, FAIL ${r.counts.FAIL}, UNKNOWN ${r.counts.UNKNOWN}.`;
    if (tool === 'modify_vehicle') return `Committed version ${r.newVersion}: ${r.change.path} ${fmt(r.change.from)} → ${fmt(r.change.to)}. Requirements to retest: ${r.retest.join(', ') || 'none'}.`;
    return 'Done. See the result data.';
  };
  const execute = async (tool, args) => {
    await new Promise((r) => setTimeout(r, 20));
    const rec = director.call(tool, args);
    if (rec.status === 'denied') return say('ai', `I cannot do that at the current permission level. ${rec.error}`);
    if (rec.status === 'error') return say('ai', `That failed: ${rec.error}`);
    if (rec.status === 'needs-confirmation') return say('ai', `This changes the design and needs your approval: ${JSON.stringify(rec.preview)}`, null, { id: rec.id });
    if (tool === 'run_simulation' && args.kind === 'lunar-mission') changed();
    say('ai', summarize(tool, rec.result), rec.result);
  };
  const decide = (m, ok) => {
    const id = m.pending.id; m.pending = null;
    if (!ok) { director.reject(id); say('ai', 'Rejected. Nothing was changed.'); return; }
    const r = director.confirm(id);
    if (r.status === 'ok') { say('ai', summarize(r.tool, r.result), r.result); changed(); } else say('ai', `Not executed: ${r.error}`);
  };
  const ask = (text) => {
    if (!text.trim()) return;
    say('user', text);
    const hit = RX.find(([rx]) => rx.test(text));
    if (!hit) return say('ai', 'I can: fly the mission, analyze failures, review a design, run Monte Carlo or sensitivity, find the lightest lander for a payload, compute a transfer, read telemetry or requirements, explain a concept, write a report, or (with Modify permission and your approval) change a parameter, e.g. "set stages.0.propMass of lunar-lander to 9000".');
    const [tool, args] = hit[1](text);
    say('ai', `Using tool ${tool} ${JSON.stringify(args)}`);
    execute(tool, args);
  };
  const input = h('input', { type: 'text', placeholder: 'Ask the Mission Director, e.g. "Why did the landing fail?" or "What is the lightest lander for 2000 kg?"', style: { flex: 1 }, onkeydown: (e) => { if (e.key === 'Enter') { ask(e.target.value); e.target.value = ''; } } });
  const levels = h('div', { class: 'levels' }, E.LEVELS.map((l) => h('button', { class: director.level === l ? 'on' : '', onclick: () => { director.setLevel(l); aiWorkspace(root); } }, l)));
  const auditEl = h('div');
  const tools = card('Tools the director can use', table([['Tool', (t) => t.name], ['Description', (t) => t.description]], director.toolDefinitions()));
  root.replaceChildren(card(null, h('h1', {}, 'AI Mission Director'),
    h('p', { class: 'lead' }, 'The director only acts through the same engineering tools you use, so every number comes from the simulator. Permission levels: Observe (read), Suggest (analyze), Simulate (run sims), Modify (change designs, with your approval), Execute (command a live vehicle, with your approval).'),
    h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Permission level'), levels),
    h('p', { class: 'note' }, 'Offline mode: your request is matched to a tool by a built-in command parser. No language model is connected in this workspace, so free-form conversation is limited to the commands listed below.')),
  sp(), h('div', { class: 'grid wide' }, card('Conversation', chat, h('div', { class: 'row', style: { marginTop: '8px' } }, input, btn('Send', () => { ask(input.value); input.value = ''; }, 'primary'))), card('Audit trail', auditEl)), sp(), tools);
  render();
}

// ---------- Academy, challenges, emergencies ----------
const LESSON_TARGET = {
  vehicle: (x) => ['vehicle', { vehicle: x.vehicle }], verification: () => ['vv', {}], propulsion: (x) => ['propulsion', { model: x.model }], gnc: (x) => ['gnc', { plant: x.plant, gains: x.gains }],
  simulation: (x) => ['sim', { kind: x.kind === 'descent' ? 'descent' : x.kind === 'rendezvous' ? 'rendezvous' : x.kind === 'ascent' ? 'ascent' : 'entry', vehicle: x.vehicle }],
  thermal: () => ['sim', { kind: 'entry' }], power: (x) => ['subsystems', { fault: x.fault }], mission: (x) => ['world', { body: x.body, fromAlt: x.fromAlt, toAlt: x.toAlt }],
};
export function academyWorkspace(root, ctx = {}, navigate) {
  const lessons = card('Academy', table([['Lesson', (l) => h('b', {}, l.title)], ['Idea', (l) => l.summary], ['Equation', (l) => h('span', { class: 'mono small' }, l.equations.join('   '))], ['Experiment', (l) => h('div', {}, h('div', { class: 'small' }, l.experiment.ask), btn('TRY IT IN ASTRA LAB', () => { const [ws, c] = (LESSON_TARGET[l.experiment.workspace] || (() => ['mission', {}]))(l.experiment); navigate(ws, c); }, 'primary'))]], E.LESSONS));
  const chOut = h('div');
  const attempt = async (ch) => {
    const P = state.project; let r, grossMass, payload = ch.goal?.payload ?? 0;
    if (ch.sim === 'ascent') { const v = E.cloneVehicle(P.vehicles['small-launcher']); if (payload) v.payload.mass = payload; grossMass = E.massBudget(v).gross; const kick = E.tuneAscent(v, { targetAlt: ch.goal?.targetAlt ?? 200e3 }).kickDeg; r = await runJob('ascent', { vehicle: v, options: { targetAlt: ch.goal?.targetAlt ?? 200e3, kickDeg: kick, failures: ch.failures || [] } }, ch.title); }
    else if (ch.sim === 'descent') { const v = E.cloneVehicle(P.vehicles['lunar-lander']); v.payload.mass = payload; grossMass = E.massBudget(v).gross; r = await runJob('descent', { vehicle: v, options: { seed: 1 } }, ch.title); }
    else if (ch.sim === 'lunar-mission') r = await flyMission('none', 1);
    else if (ch.sim === 'entry') r = await runJob('entry', { entryVehicle: 'mars-lander', options: {} }, ch.title);
    else r = await runJob('rendezvous', { options: {} }, ch.title);
    const sc = E.scoreChallenge(ch, { success: r.success, propellantMarginFrac: r.propellantMarginFrac ?? r.rcsMarginFrac ?? 0, grossMass, payload, minMargin: r.minStructuralMargin ?? 0.3, reliability: 0.95, precision: r.landingError !== undefined ? Math.max(0, 100 - Math.abs(r.landingError) / 10) : 50 });
    chOut.replaceChildren(h('div', { class: `verdict ${sc.passed ? 'ok' : 'bad'}` }, `${ch.title}: ${sc.passed ? 'PASSED' : 'NOT PASSED'} — ${r.text || (r.success ? 'success' : `failed in ${r.failedPhase}`)}. Score ${fmt(sc.total)} / 100`),
      h('div', { class: 'kpis' }, Object.entries(sc.criteria).map(([k, v]) => kpi(k, v, '/100', 'physics', 'Scored only from simulation results'))),
      h('p', { class: 'note' }, 'Challenges use the vehicles in your project. Improve the design in the Vehicle workspace and try again.'));
  };
  const challenges = card('Challenges', table([['Challenge', (c) => c.title], ['Simulation', (c) => c.sim], ['Limits', (c) => (c.limits ? JSON.stringify(c.limits) : '—')], ['', (c) => btn('Attempt', () => attempt(c), 'primary')]], E.CHALLENGES), chOut);

  const emOut = h('div');
  const RESPONSES = [...new Set(E.EMERGENCIES.flatMap((e) => e.acceptable))].sort();
  const startEm = async (e) => {
    const b = E.emergencyBriefing(e.id);
    let r = null;
    if (b.sim === 'ascent') r = revive(await runJob('ascent', { vehicleId: b.vehicle, options: { targetAlt: 200e3, kickDeg: 16, failures: b.inject } }, b.title));
    if (b.sim === 'descent') r = revive(await runJob('descent', { vehicleId: b.vehicle, options: { seed: 3, failures: b.inject } }, b.title));
    const chart = canvas('short');
    let pick = RESPONSES[0];
    emOut.replaceChildren(h('div', { class: 'verdict warn' }, `EMERGENCY: ${b.title}`), h('div', { class: 'events' }, b.alarms.map((a) => h('div', { class: 'critical' }, `ALARM  ${a}`))),
      r ? chart : h('p', { class: 'muted' }, 'This emergency is a tabletop exercise (no flight simulation attached yet).'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, field('Your response', select(RESPONSES, pick, (x) => (pick = x))), btn('Commit response', () => {
        const s = E.scoreEmergencyResponse(e.id, pick, r);
        emOut.append(h('div', { class: `verdict ${s.correct ? 'ok' : 'bad'}` }, `${s.correct ? 'Good call.' : 'Not the recommended response.'} Root cause: ${s.rootCause} Recommended: ${s.recommended.join(' or ')}.${r ? ` Without intervention the simulated vehicle: ${r.text}` : ''}`),
          h('p', { class: 'note' }, 'The simulator flies the uncommanded failure; your response is scored against accepted procedures. Flying your response in the loop is not implemented yet.'));
      }, 'primary')));
    if (r) { const ch = r.recorder.names().includes('altitude') ? 'altitude' : r.recorder.names()[0]; const s = r.recorder.series(ch); lineChart(chart, { xLabel: 't (s)', series: [{ name: ch, unit: s.unit, x: s.t, y: s.values }] }); }
  };
  const emergencies = card('Emergency mode (the cause is hidden until you respond)', table([['Emergency', (e) => e.title], ['', (e) => btn('Start', () => startEm(e))]], E.EMERGENCIES.map((e) => E.emergencyBriefing(e.id))), emOut);
  root.replaceChildren(card(null, h('h1', {}, 'Academy and challenges'), h('p', { class: 'lead' }, 'Every lesson opens a real experiment. The numbers you see come from the simulator, not from the lesson text.')), sp(), lessons, sp(), h('div', { class: 'grid' }, challenges, emergencies));
}
