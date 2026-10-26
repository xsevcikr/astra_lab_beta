// Tests for storage, projects, recording/replay, reports and the experiment lab.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { MemoryStorage, createNodeStorage, safePath } from '../src/core/storage.js';
import { Project, saveProject, loadProject, listProjects, saveRun, loadRun, exportBundle, importBundle } from '../src/core/project.js';
import { Replay, resimulate, verifyReproducible } from '../src/core/recording.js';
import { buildReport, reportToHTML, reportToPDF, reportToCSV } from '../src/core/report.js';
import { runExperiment, applyParameter, expandValues, experimentToCSV } from '../src/core/experiments.js';
import { compareMetrics, runMetrics } from '../src/core/run-analysis.js';
import { buildRover, buildLander } from '../src/vehicles/builders.js';
import { roverMission, landerMission } from '../src/missions/generator.js';
import { runToEnd } from '../src/missions/tuner.js';

test('storage refuses path traversal and absolute paths', () => {
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:\\Windows\\x', 'a/b:c']) assert.throws(() => safePath(bad), undefined, bad);
  assert.equal(safePath('projects\\demo/./a.json'), 'projects/demo/a.json');
});

test('project save / load round trip on disk, with runs, telemetry and version history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-'));
  const storage = await createNodeStorage(dir);
  const p = new Project('Rover test');
  const v = buildRover({ mass: 100 });
  p.setVehicle(v); p.commit('Added rover');
  const m = roverMission(v, { body: 'moon', distance: 40 }); p.setMission(m); p.commit('Added mission');
  p.remember('the rover', v.id);
  const sim = runToEnd(v, m);
  const rec = await saveRun(storage, p, sim);
  await saveProject(storage, p);
  const q = await loadProject(storage, p.dir);
  assert.equal(q.name, 'Rover test'); assert.equal(Object.keys(q.vehicles).length, 1); assert.equal(q.recall('the rover'), v.id);
  assert.equal(q.runs.length, 1); assert.equal(q.history.list().length, 3);
  assert.equal((await listProjects(storage)).length, 1);
  const { record, telemetry } = await loadRun(storage, q, rec.id);
  assert.equal(telemetry.count, sim.telemetry.count);
  assert.equal(record.result.status, sim.result.status);
  // the gzip file must be much smaller than the raw columns
  const gz = fs.statSync(path.join(dir, q.dir, 'simulations', rec.id, 'telemetry.bin.gz')).size;
  assert.ok(gz < sim.telemetry.toBinary().length * 0.6, `gz ${gz}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('undo / redo restore exact design states; bundle export / import', () => {
  const p = new Project('u');
  const v = buildRover({ mass: 100 }); p.setVehicle(v); p.commit('rover');
  const n0 = p.vehicle.components.length;
  p.vehicle.components.pop(); p.commit('removed part');
  assert.equal(p.vehicle.components.length, n0 - 1);
  assert.equal(p.undo(), 'rover'); assert.equal(p.vehicle.components.length, n0);
  assert.equal(p.redo(), 'removed part'); assert.equal(p.vehicle.components.length, n0 - 1);
  const b = importBundle(exportBundle(p));
  assert.equal(b.vehicle.components.length, n0 - 1);
});

test('recording is reproducible bit-for-bit; replay controls work between 0.1x and 100x', async () => {
  const v = buildRover({ mass: 100 });
  const sim = runToEnd(v, roverMission(v, { body: 'moon', distance: 40 }));
  const p = new Project('r'); const storage = new MemoryStorage(); p.dir = 'projects/r';
  const rec = await saveRun(storage, p, sim);
  const { record, telemetry } = await loadRun(storage, p, rec.id);
  assert.deepEqual(verifyReproducible(record, telemetry), { ok: true });
  const rp = new Replay({ telemetry, events: record.events });
  rp.setSpeed(1e7); assert.equal(rp.speed, 100000); rp.setSpeed(0.001); assert.equal(rp.speed, 0.1);
  rp.setSpeed(10); rp.play(); rp.tick(1); assert.ok(Math.abs(rp.t - (rp.t0 + 10)) < 1e-9);
  rp.pause(); const t = rp.t; rp.tick(5); assert.equal(rp.t, t);
  rp.seekFraction(0.5); assert.ok(rp.frame().t > 0);
  rp.restart(); assert.equal(rp.t, rp.t0);
  rp.setSpeed(100); rp.tick(1e6); assert.equal(rp.t, rp.duration); assert.equal(rp.playing, false);
  // exact state at an arbitrary time by deterministic re-simulation
  const mid = resimulate(record, record.result.endTime / 2);
  assert.ok(Math.abs(mid.t - record.result.endTime / 2) < 1);
});

test('reports: HTML, valid PDF, CSV', () => {
  const v = buildLander({ body: 'moon' });
  for (const c of v.components) if (c.propellantMass) c.propellantMass *= 0.4;
  const sim = runToEnd(v, landerMission(v, { body: 'moon' }), { wallMs: 120000 });
  assert.equal(sim.result.status, 'FAILURE');
  const rec = { id: 'r1', name: 'x', created: '', engine: {}, vehicle: sim.vehicleDef, mission: sim.mission, environment: sim.env, result: sim.result, events: sim.events };
  const rep = buildReport(rec, sim.telemetry);
  assert.ok(rep.failures.length >= 1 && rep.failures[0].primaryCause);
  const html = reportToHTML(rep); assert.ok(html.includes('<svg') && html.includes(rep.failures[0].title));
  const pdf = reportToPDF(rep);
  const head = Buffer.from(pdf.slice(0, 8)).toString('latin1'); assert.ok(head.startsWith('%PDF-1.4'));
  const txt = Buffer.from(pdf).toString('latin1'); assert.ok(txt.trim().endsWith('%%EOF')); assert.ok(/\/Count [2-9]/.test(txt), 'multi-page');
  const csv = reportToCSV(sim.telemetry, ['t', 'alt', 'mass']); assert.equal(csv.split('\n').length, sim.telemetry.count + 1);
  fs.writeFileSync(path.join(os.tmpdir(), 'astra-test-report.pdf'), pdf);
});

test('experiment lab: parameter sweep runs real simulations and compares them', async () => {
  const v = buildRover({ mass: 100 });
  const exp = await runExperiment(
    { name: 'distance sweep', parameters: [{ path: 'mission.events[leg1].action.distance', values: [20, 40] }, { path: 'environment.body', values: ['moon', 'mars'] }], objective: { metric: 'endTime', goal: 'min' } },
    { vehicle: v, mission: roverMission(v, { body: 'moon', distance: 30 }), environment: {} });
  assert.equal(exp.cases.length, 4);
  assert.ok(exp.cases.every((c) => c.status !== 'ERROR'), JSON.stringify(exp.cases.map((c) => c.reason)));
  const c20 = exp.cases.find((c) => c.params['mission.events[leg1].action.distance'] === 20 && c.params['environment.body'] === 'moon');
  const c40 = exp.cases.find((c) => c.params['mission.events[leg1].action.distance'] === 40 && c.params['environment.body'] === 'moon');
  assert.ok(c40.metrics.distanceDriven > c20.metrics.distanceDriven);
  assert.ok(experimentToCSV(exp).split('\n').length === 5);
  assert.deepEqual(expandValues({ from: 0, to: 10, steps: 3 }), [0, 5, 10]);
  const inp = { vehicle: v, mission: {}, environment: {}, settings: {} };
  applyParameter(inp, 'vehicle.components[' + v.components[0].id + '].mass', 2, 'scale');
  assert.throws(() => applyParameter(inp, 'vehicle.components[nope].mass', 1), /not found/);
  const d = compareMetrics(runMetrics({ result: { summary: {}, failures: [] } }, { count: 0 }), runMetrics({ result: { summary: {}, failures: [] } }, { count: 0 }));
  assert.ok(Array.isArray(d.rows));
});
