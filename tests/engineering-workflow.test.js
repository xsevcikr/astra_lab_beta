import test from 'node:test';
import assert from 'node:assert/strict';
import { LUNAR_REQUIREMENTS, verifyAll, traceabilityMatrix, changeImpact, makeRequirement, verifyProbability } from '../src/engineering/requirements/requirements.js';
import { vehicleReliability, faultTreeFromVehicle, evaluateFaultTree, minimalCutSets, generateFMEA, redundancyTrade, birnbaum } from '../src/engineering/reliability/reliability.js';
import { riskDashboard, riskTrend } from '../src/engineering/risk/risk.js';
import { designReview } from '../src/engineering/review/designReview.js';
import { buildMissionReport, reportToMarkdown, reportToHTML, tableToCSV } from '../src/engineering/reports/report.js';
import { VersionStore } from '../src/engineering/vehicle/versions.js';
import { MissionDirector } from '../src/engineering/ai/director.js';
import { generateScenario, emergencyBriefing, EMERGENCIES, CHALLENGES, scoreChallenge, SCENARIO_TYPES } from '../src/engineering/scenarios/scenarios.js';
import { LESSONS } from '../src/engineering/learning/academy.js';
import { buildKnowledgeGraph, neighbourhood } from '../src/engineering/knowledge/graph.js';
import { walker, coverage, spacing } from '../src/engineering/world/constellation.js';
import { Station } from '../src/engineering/world/station.js';
import { World, toRenderSpace, levelOfDetail } from '../src/engineering/world/world.js';
import { saveProject, loadProject } from '../src/engineering/project/persistence.js';
import { PerfMonitor } from '../src/engineering/debug/perf.js';
import { loadVehicle } from '../src/engineering/vehicle/library.js';
import { runLunarMission, defaultLunarArchitecture } from '../src/engineering/workflow/lunarMission.js';
import { runEngineeringLoop } from '../src/engineering/workflow/engineeringLoop.js';
import { makeRng } from '../src/engineering/core/rng.js';
import { Terrain } from '../src/engineering/world/terrain.js';
import { costEstimate } from '../src/engineering/analysis/cost.js';

const mission = runLunarMission(defaultLunarArchitecture());

test('requirements verify against simulation results, with UNKNOWN when there is no data', () => {
  const v = verifyAll(LUNAR_REQUIREMENTS, mission.metrics);
  assert.equal(v.rows.find((r) => r.id === 'GN-1').result.status, 'PASS');
  assert.equal(v.rows.find((r) => r.id === 'MR-2').result.status, 'UNKNOWN', 'probabilistic requirement needs a Monte Carlo run');
  assert.equal(verifyAll([makeRequirement({ id: 'x', text: 'x', metric: 'nope', op: '<=', threshold: 1 })], {}).rows[0].result.status, 'UNKNOWN');
  assert.equal(verifyProbability({ id: 'p', threshold: 0.95 }, { successProbability: { p: 0.96, lo: 0.9 } }).status, 'MARGIN');
});
test('traceability matrix links requirement -> component -> simulation -> telemetry', () => {
  const v = verifyAll(LUNAR_REQUIREMENTS, mission.metrics);
  const tm = traceabilityMatrix(LUNAR_REQUIREMENTS, [loadVehicle('heavy-lunar'), loadVehicle('crew-capsule'), loadVehicle('lunar-lander')], v, [{ id: 'T1', requirements: ['GN-1'], status: 'PASS' }]);
  const gn1 = tm.find((r) => r.requirement === 'GN-1');
  assert.ok(gn1.components.includes('Landing radar') && gn1.simulation === 'powered-descent' && gn1.telemetry.includes('verticalSpeed') && gn1.tests.length === 1);
});
test('changing the descent engine flags the landing requirements for retest', () => {
  const a = loadVehicle('lunar-lander'), b = loadVehicle('lunar-lander'); b.stages[0].engines[0].thrustVac = 50000;
  const imp = changeImpact(a, b, LUNAR_REQUIREMENTS);
  assert.ok(imp.changedComponents.includes('dps'));
  const ids = imp.retest.map((r) => r.id); assert.ok(ids.includes('GN-1') && ids.includes('PR-3') && !ids.includes('TH-1'));
});
test('reliability: single-point failures, redundancy benefit and fault tree agree', () => {
  const v = loadVehicle('lunar-lander');
  const r = vehicleReliability(v, { missionHours: 100 });
  assert.ok(r.singlePointFailures.some((s) => s.id === 'dps'));
  assert.ok(!r.singlePointFailures.some((s) => s.id === 'pgns'), 'backed up by the abort guidance system');
  const ft = faultTreeFromVehicle(v, 100);
  assert.ok(Math.abs((1 - evaluateFaultTree(ft)) - r.missionReliability) < 0.01);
  assert.ok(minimalCutSets(ft).some((s) => s.length === 1 && s[0] === 'dps'));
  const rt = redundancyTrade(v.components[0], 1000); assert.ok(rt[1].reliability > rt[0].reliability && rt[1].mass > rt[0].mass);
  assert.equal(birnbaum({ gate: 'OR', children: [{ id: 'a', p: 0.1 }, { id: 'b', p: 0.01 }] }, ['a', 'b'])[0].id, 'a', 'OR gate: I_a = 1 - p_b exceeds I_b = 1 - p_a');
});
test('FMEA covers every component and ranks by RPN', () => {
  const f = generateFMEA(loadVehicle('crew-capsule'));
  assert.ok(new Set(f.rows.map((r) => r.componentId)).size === loadVehicle('crew-capsule').components.length);
  for (let i = 1; i < f.rows.length; i++) assert.ok(f.rows[i - 1].rpn >= f.rows[i].rpn);
});
test('risk dashboard keeps separate categories with reasons and trends', () => {
  const r = riskDashboard(mission.metrics);
  assert.ok(r.length >= 8 && r.every((c) => c.why && c.level));
  const worse = riskDashboard({ ...mission.metrics, 'landing.propellantMarginFrac': 0.02 });
  assert.equal(worse.find((c) => c.id === 'propellant').level, 'HIGH');
  assert.ok(riskTrend(r, worse).some((t) => t.id === 'propellant'));
});
test('design review actively finds problems and lists what passed', () => {
  const bad = loadVehicle('small-launcher'); bad.stages[0].engines[0].thrustVac = 12000; bad.stages[1].dryMass = 600; bad.stages[1].engines[0].gimbalDeg = 0;
  const r = designReview(bad, { dvRequired: 9400 });
  const titles = r.findings.map((f) => f.title).join('|');
  assert.match(titles, /thrust-to-weight/); assert.match(titles, /Insufficient delta-v/); assert.match(titles, /no attitude control/); assert.match(titles, /structural fraction/);
  assert.equal(r.verdict, 'NOT READY');
  const good = designReview(loadVehicle('heavy-lunar'));
  assert.ok(good.checksRun > 0 && (good.findings.length > 0 || good.passed.length > 0));
});
test('reports export JSON, Markdown, CSV and printable HTML from the mission data', () => {
  const v = verifyAll(LUNAR_REQUIREMENTS, mission.metrics);
  const r = buildMissionReport({ objective: 'Land two crew and return.', vehicles: [loadVehicle('crew-capsule'), loadVehicle('lunar-lander')], mission, verification: v, review: designReview(loadVehicle('lunar-lander')) });
  const ids = r.sections.map((s) => s.id);
  for (const id of ['objective', 'configuration', 'mass', 'propulsion', 'trajectory', 'telemetry', 'loads', 'failures', 'requirements', 'success', 'recommendations']) assert.ok(ids.includes(id), id);
  assert.match(reportToMarkdown(r), /## Requirement verification/);
  assert.match(reportToHTML(r), /<table>/);
  assert.equal(tableToCSV([{ a: 1, b: 'x,y' }]), 'a,b\n1,"x,y"');
  assert.ok(JSON.parse(JSON.stringify(r)).sections.length === r.sections.length);
});
test('vehicle versions: bump, compare and show derived changes', () => {
  const s = new VersionStore(); const v = loadVehicle('small-launcher');
  s.commit(v, 'first'); v.stages[0].engines[0].thrustVac = 27000; v.stages[1].dryMass = 260; const e = s.commit(v, 'more thrust');
  assert.equal(e.version, '1.1');
  const c = s.compare(v.id, '1.0', '1.1');
  assert.ok(c.changes.some((d) => d.path === 'stages.0.engines.0.thrustVac' && d.from === 25000 && d.to === 27000));
  assert.ok(c.derived.some((d) => d.name === 'Dry mass'));
  assert.equal(s.commit(v, 'no change').version, '1.1');
  assert.equal(s.commit(v, 'major', { bump: 'major' }).version, '1.1', 'identical content is not a new version');
});
test('AI director: observe level cannot simulate; execute needs confirmation; audit trail kept', () => {
  const P = { vehicles: { sl: loadVehicle('small-launcher') }, requirements: LUNAR_REQUIREMENTS, versions: new VersionStore(), objective: 'test', lastMission: mission };
  const d = new MissionDirector(P, { level: 'observe' });
  assert.equal(d.call('run_simulation', { kind: 'ascent', vehicleId: 'sl' }).status, 'denied');
  assert.equal(d.call('read_telemetry', { channel: 'altitude' }).status, 'ok');
  assert.ok(d.call('analyze_failures').status === 'ok');
  d.setLevel('execute');
  assert.equal(d.call('execute_command', { command: 'set-mode' }).status, 'needs-confirmation');
  const sim = d.call('run_simulation', { kind: 'ascent', vehicleId: 'sl', options: { targetAlt: 200e3, kickDeg: 16 } });
  assert.equal(sim.status, 'ok'); assert.ok(['orbit', 'suborbital', 'impact'].includes(sim.result.outcome));
  assert.ok(d.audit.length >= 5);
  assert.ok(d.toolDefinitions().every((t) => t.input_schema && t.description.includes('permission')));
});
test('scenario generator, emergencies hide the answer, challenges score from results', () => {
  for (const t of SCENARIO_TYPES) assert.ok(generateScenario(t, 'hard', 3).briefing);
  for (const e of EMERGENCIES) { const b = emergencyBriefing(e.id); assert.equal(b.hiddenCause, undefined); assert.equal(b.acceptable, undefined); assert.ok(b.alarms.length); }
  const s = scoreChallenge(CHALLENGES[0], { success: true, propellantMarginFrac: 0.08, grossMass: 25000, payload: 500, minMargin: 0.3, reliability: 0.97, precision: 80 });
  assert.ok(s.passed && s.total > 50);
  assert.equal(scoreChallenge(CHALLENGES[0], { success: false }).total, 0);
});
test('academy lessons each open a concrete experiment', () => {
  assert.ok(LESSONS.length >= 14);
  for (const l of LESSONS) assert.ok(l.experiment.workspace && l.experiment.ask, l.id);
});
test('knowledge graph connects mission, components, requirements and telemetry', () => {
  const g = buildKnowledgeGraph({ vehicles: [loadVehicle('lunar-lander')], requirements: LUNAR_REQUIREMENTS, fmea: generateFMEA(loadVehicle('lunar-lander')).rows, timeline: mission.timeline });
  const n = neighbourhood(g, 'comp:lr', 1);
  const types = new Set(n.nodes.map((x) => x.type));
  assert.ok(types.has('requirement') && types.has('physics') && types.has('failure'));
});
test('constellation: GPS-like Walker 24/6/1 covers the globe; spacing reported', () => {
  const c = walker({ total: 24, planes: 6, phasing: 1, altitude: 20200e3, inclinationDeg: 55 });
  const cov = coverage(c, { latStep: 20, lonStep: 30, dt: 600, duration: 43200 });
  assert.ok(cov.coverageFraction > 0.99 && cov.meanVisible > 4);
  assert.equal(spacing(c).inPlaneDeg, 90);
  const sparse = coverage(walker({ total: 3, planes: 1, altitude: 500e3, inclinationDeg: 50 }), { latStep: 20, lonStep: 30, dt: 300, duration: 6000 });
  assert.ok(sparse.coverageFraction < 0.3 && sparse.maxRevisitGap > 1000);
});
test('space station: ports, docking and budgets', () => {
  const s = new Station('Test');
  s.add('docking-node', 'node1').add('habitation', 'hab', 'node1').add('solar-array', 'sa', 'hab').add('radiator', 'rad', 'node1').add('life-support', 'ls', 'node1');
  assert.ok(s.dock({ name: 'Capsule', mass: 10000, crew: 3 }, 'node1').ok);
  assert.throws(() => s.add('cargo', 'c', 'sa'));
  const b = s.budget();
  assert.ok(b.mass > 50000 && b.crewCapacity === 3 && Number.isFinite(b.powerMargin));
});
test('multi-vehicle world: each vehicle has its own state; floating origin keeps precision', () => {
  const w = new World();
  w.add('a', { r: [7e6, 0, 0], v: [0, 7546, 0] }).add('b', { r: [7e6, 1000, 0], v: [0, 7546, 0] }).add('c', { r: [4e8, 0, 0], v: [0, 0, 0] });
  w.step(60, 5);
  assert.ok(Math.abs(w.relative('a', 'b').range - 1000) < 50);
  assert.notDeepEqual(Array.from(w.vehicles.get('a').y), Array.from(w.vehicles.get('c').y));
  const p = toRenderSpace([4e11 + 1.5, 0, 0], [4e11, 0, 0]); assert.equal(p[0], 1.5);
  assert.equal(levelOfDetail(1737e3, 3.84e8).level, 'low'); assert.equal(levelOfDetail(5, 1e7).level, 'culled');
});
test('terrain: deterministic, with hazards', () => {
  const a = new Terrain({ type: 'mare', seed: 7 }), b = new Terrain({ type: 'mare', seed: 7 });
  assert.equal(a.elevation(123, 456), b.elevation(123, 456));
  assert.ok(typeof a.assessSite(0, 0).safe === 'boolean');
  assert.ok(a.traverse([[0, 0], [100, 0], [200, 50]]).distance > 0);
});
test('save everything: project round-trip keeps telemetry, versions, AI conversations', () => {
  const versions = new VersionStore(); versions.commit(loadVehicle('lunar-lander'), 'v1');
  const text = saveProject({ name: 'Moon', vehicles: { lm: loadVehicle('lunar-lander') }, versions, requirements: LUNAR_REQUIREMENTS, lastMission: mission, aiConversations: [{ role: 'user', text: 'hi' }], testResults: [{ id: 't', status: 'PASS' }] });
  const p = loadProject(text, { rngFactory: makeRng });
  assert.equal(p.lastMission.recorder.t.length, mission.recorder.t.length);
  assert.equal(p.lastMission.timeline.events.length, mission.timeline.events.length);
  assert.equal(p.versions[0].version, '1.0'); assert.equal(p.aiConversations[0].text, 'hi');
  assert.throws(() => loadProject(text.replace('"Moon"', '"Mars"')), /checksum/);
});
test('debug monitor summarizes frames', () => {
  const m = new PerfMonitor(); for (let i = 0; i < 5; i++) m.frame({ wallMs: 4, physicsDt: 0.02, simDt: 0.33, substeps: 17, entities: 3, physicsObjects: 3 });
  const s = m.summary(); assert.equal(s.substeps, 17); assert.ok(s.memory);
});
test('cost estimate is labelled as an approximation', () => { assert.equal(costEstimate(loadVehicle('heavy-lunar'))._model.model, 'approximation'); });
test('integrated engineering loop runs every step and versions changes', () => {
  const arch = defaultLunarArchitecture(); arch.lm.stages[0].propMass = 7600; // weakened lander: thin landing margin
  const r = runEngineeringLoop({ arch, mcRuns: 0, maxIterations: 2 });
  const steps = r.log.map((s) => s.step);
  for (const s of ['Define requirements', 'Design', 'Calculate', 'Analyze', 'Simulate', 'Measure', 'Verify', 'Identify failures', 'Diagnose']) assert.ok(steps.includes(s), s);
  if (steps.includes('Improve design')) assert.ok(r.versions.history('lunar-lander').length >= 2);
});
