// Build guides and ready-made examples. Every ready-made vehicle (data/templates.js) is built, validated and flown in the REAL simulator;
// a template may only state a goal (`claim`) when the recorded run meets it. Every guide is then performed step by step through the same
// tool API as the AI Helper (ui/lib/guideactions.js), undone and redone, and the result is flown where the guide makes a claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { runMetrics } from '../src/core/run-analysis.js';
import { validateVehicle } from '../src/vehicles/analysis.js';
import { TEMPLATES, TEMPLATE_BY_ID } from '../data/templates.js';
import { GUIDES, guideForTemplate } from '../data/academy/guides.js';
import { COMPONENT_INFO, findLesson } from '../data/academy/index.js';
import { runAction, checkStep, undoLast } from '../ui/lib/guideactions.js';

const session = () => new AiSession({ storage: new MemoryStorage() });
const fakeApp = (S) => ({ project: S.project, api: S.api, navigate: (screen, params) => { fakeApp.nav.push([screen, params]); }, emit() {}, markDirty() {} });
fakeApp.nav = [];

/** Does the recorded run meet the template's claim? Numbers come from the recorded telemetry, nothing else. */
function meets(claim, m, status) {
  if (status !== 'SUCCESS') return false;
  switch (claim.kind) {
    case 'altitude': return m.maxAlt >= claim.minKm * 1000;
    case 'orbit': return m.finalPeri >= (claim.km - 25) * 1000 && m.finalApo <= (claim.km + 25) * 1000;
    case 'traverse': return m.distanceDriven >= claim.meters * 0.97;
    case 'landing': return Number.isFinite(m.touchdownVertical) && m.touchdownVertical <= 5;
    case 'splashdown': return Number.isFinite(m.touchdownVertical) && m.touchdownVertical <= 12;
    case 'survive': return true;
    default: return false;
  }
}
async function fly(S, name) {
  const r = await S.api.execute('RUN_SIMULATION', { name }); assert.ok(r.ok, r.message);
  const { record, telemetry } = await S.api.getRun(r.data.runId);
  return { status: record.result.status, m: runMetrics(record, telemetry) };
}

test('templates: every ready-made vehicle validates, has a mission and the data a card needs', () => {
  assert.ok(TEMPLATES.length >= 8);
  for (const t of TEMPLATES) {
    const { vehicle, mission } = t.make();
    assert.ok(t.title && t.emoji && t.blurb.split(' ').length <= 16, t.id);
    assert.ok(vehicle.components.length >= 5 && mission, t.id);
    const issues = validateVehicle(vehicle, { body: vehicle.meta?.body ?? 'earth' }).filter((i) => i.severity === 'error' || i.level === 'error');
    assert.equal(issues.length, 0, `${t.id}: ${JSON.stringify(issues.slice(0, 2))}`);
    for (const k of t.learn ?? []) assert.ok(COMPONENT_INFO[k], `${t.id}: learn kind ${k}`);
  }
});

test('templates: claimed goals are met in real simulations', { timeout: 500000 }, async () => {
  for (const t of TEMPLATES) {
    if (!t.claim) continue;
    const S = session(); await t.build({ project: S.project });
    const { status, m } = await fly(S, t.id);
    assert.ok(meets(t.claim, m, status), `${t.id} claims ${JSON.stringify(t.claim)} but flew: ${status}, alt ${Math.round(m.maxAlt)}, orbit ${Math.round(m.finalPeri)} x ${Math.round(m.finalApo)}`);
  }
});

test('guides: complete, point at real lessons, parts and templates', () => {
  assert.ok(GUIDES.length >= 8);
  const ids = new Set();
  for (const g of GUIDES) {
    assert.ok(!ids.has(g.id)); ids.add(g.id);
    assert.ok(g.title.startsWith('How to') && g.goal && g.steps.length >= 4 && g.steps.length <= 12, g.id);
    for (const k of g.needs) assert.ok(COMPONENT_INFO[k], `${g.id}: need ${k}`);
    if (g.example) { assert.ok(TEMPLATE_BY_ID[g.example], `${g.id}: example`); assert.ok(g.exampleNote, g.id); assert.ok(TEMPLATE_BY_ID[g.example].claim, `${g.id}: example note needs a verified claim`); }
    const sids = new Set();
    for (const s of g.steps) {
      assert.ok(!sids.has(s.id), `${g.id}.${s.id}`); sids.add(s.id);
      assert.ok(s.do.split(' ').length <= 14 && /[.?]$/.test(s.do), `${g.id}.${s.id} must be one short sentence: ${s.do}`);
      assert.ok(s.kinds?.length || s.what, `${g.id}.${s.id}: needs "what this part does"`);
      for (const k of s.kinds ?? []) assert.ok(COMPONENT_INFO[k], `${g.id}.${s.id}: kind ${k}`);
      assert.ok(s.action, `${g.id}.${s.id}: needs a button`);
      if (s.action.lesson) assert.ok(findLesson(s.action.lesson), `${g.id}.${s.id}: lesson ${s.action.lesson}`);
    }
  }
  for (const t of TEMPLATES.filter((x) => !x.noGuide)) assert.ok(guideForTemplate(t.id), `no guide for template ${t.id}`);
});

test('guides: every tool step really builds its vehicle, can be undone, and the result flies', { timeout: 500000 }, async () => {
  for (const g of GUIDES) {
    if (g.id === 'fix-failure') continue;
    const S = session(); const app = fakeApp(S); const deps = { app, openLesson() {} };
    // before anything: no step with a check is done
    for (const s of g.steps) if (s.check && s.check !== 'vehicle') assert.equal(checkStep(S.project, s), false, `${g.id}.${s.id} done too early`);
    let undone = false;
    for (const s of g.steps) {
      const a = s.action;
      if (a.tool || a.fn) {
        await runAction(a, deps);
        if (s.check) assert.equal(checkStep(S.project, s), true, `${g.id}.${s.id}: step is not ticked after its button ran`);
        if (!undone && a.tool && s.check) {   // undo this step once, check it is gone, then redo it by pressing the button again
          await undoLast(app); assert.equal(checkStep(S.project, s), false, `${g.id}.${s.id}: undo did not remove the change`);
          await runAction(a, deps); assert.equal(checkStep(S.project, s), true); undone = true;
        }
      }
    }
    const v = S.project.vehicle; assert.ok(v && S.project.mission, `${g.id}: needs a vehicle and a mission`);
    const issues = validateVehicle(v, { body: v.meta?.body ?? S.project.mission.body ?? 'earth' }).filter((i) => i.severity === 'error' || i.level === 'error');
    assert.equal(issues.length, 0, `${g.id}: ${JSON.stringify(issues.slice(0, 2))}`);
    const t = TEMPLATE_BY_ID[g.example];
    const { status, m } = await fly(S, g.id);
    assert.ok(meets(t.claim, m, status), `${g.id}: guide-built vehicle does not meet ${JSON.stringify(t.claim)}: ${status} alt ${Math.round(m.maxAlt)} orbit ${Math.round(m.finalPeri)} x ${Math.round(m.finalApo)}`);
  }
});

test('guides: the "load example" and repair helpers work through the project API', async () => {
  const S = session(); const app = fakeApp(S);
  await runAction({ example: 'rover' }, { app });
  assert.equal(S.project.vehicle.type, 'rover'); await undoLast(app);
  await runAction({ fn: 'brokenRocket' }, { app });
  assert.match(S.project.vehicle.name, /half a tank/);
});
