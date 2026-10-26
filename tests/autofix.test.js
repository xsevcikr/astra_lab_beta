// One-click auto-fix: for every validateVehicle issue code, a deliberately broken design is built, the offered fix is applied
// through the same tool API the AI uses (applyNeedFix), and the issue must be gone afterwards. Table-driven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { validateVehicle, analyzeVehicle } from '../src/vehicles/analysis.js';
import { applyNeedFix, launchNeeds } from '../src/core/needs.js';
import { fixForIssue, FIXABLE_CODES, NO_FIX, issuesWithFixes } from '../src/core/autofix.js';
import { makeTank, makeEngineCluster } from '../data/components.js';

async function session(text = 'Build me a two-stage rocket carrying a 100 kg space probe.') {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.send(text); await S.send('yes');
  return S;
}
const restore = (v, snap) => { for (const k of Object.keys(v)) delete v[k]; Object.assign(v, JSON.parse(snap)); };
const issuesOf = (v) => validateVehicle(v, { body: v.meta?.body ?? 'earth' });
const has = (v, code, id) => issuesOf(v).some((i) => i.code === code && (id == null || i.componentId === id));
const rmKind = (v, f) => { v.components = v.components.filter((c) => !f(c)); };

// ---- make a rocket with a chosen liftoff thrust-to-weight (for LOW_TWR / MARGINAL_TWR)
async function rocketWithTwr(lo, hi) {
  const S = new AiSession({ storage: new MemoryStorage() });
  await S.api.execute('CREATE_VEHICLE', { type: 'rocket', name: 'T' });
  let P = 100000, ok = false;
  for (let k = 0; k < 14 && !ok; k++) {
    const v = S.api.project.vehicle; v.components = []; v.stages = [];
    const r = await S.api.execute('CREATE_STAGE', { engine: 'eng-al100', engineCount: 1, propellantMass: P, order: 1 }); assert.ok(r.ok, r.message);
    await S.api.execute('ADD_COMPONENT', { catalogId: 'avionics-flight', group: 'stage1', mount: 'stack' });
    await S.api.execute('ADD_COMPONENT', { catalogId: 'battery-500', group: 'stage1', mount: 'stack' });
    const t = analyzeVehicle(S.api.project.vehicle).liftoffTWR;
    if (t >= lo && t <= hi) ok = true; else P *= t / ((lo + hi) / 2);
  }
  assert.ok(ok, 'could not size a rocket with the requested T/W');
  return S;
}

// [code, label, setup(S) -> mutates S.api.project.vehicle]
const BASE_CASES = [
  ['DUP_ID', 'two parts share an id', (v) => { v.components.push({ ...JSON.parse(JSON.stringify(v.components.find((c) => c.kind === 'battery'))) }); }],
  ['NO_ENGINE', 'rocket without any engine', (v) => rmKind(v, (c) => c.kind === 'engine')],
  ['NO_FEED', 'kerolox engine with no LOX tank', (v) => rmKind(v, (c) => c.group === 'stage1' && c.kind === 'oxidizer_tank')],
  ['NO_FEED', 'kerolox engine with no RP-1 tank', (v) => rmKind(v, (c) => c.group === 'stage1' && c.kind === 'fuel_tank')],
  ['NO_FEED', 'hydrolox engine with no LH2 tank', (v) => {
    rmKind(v, (c) => c.kind === 'engine' && c.group === 'stage2'); v.components.push(makeEngineCluster('eng-al110h', 1, 'stage2', { id: 'h2eng', mount: 'stack' }));
    rmKind(v, (c) => c.group === 'stage2' && c.kind === 'fuel_tank');
  }],
  ['NO_FEED', 'engine with no propellant tanks at all in its stage', (v) => rmKind(v, (c) => c.group === 'stage2' && /tank/.test(c.kind))],
  ['NO_PROPELLANT_DEF', 'engine that burns nothing', (v) => { v.components.find((c) => c.kind === 'engine' && c.group === 'stage2').propellants = []; }],
  ['BAD_PROPELLANT_PAIR', 'engine with two fuels', (v) => { v.components.find((c) => c.kind === 'engine' && c.group === 'stage2').propellants = ['RP-1', 'MMH']; }],
  ['TANK_UNUSED', 'methane tank nothing burns', (v) => { rmKind(v, (c) => c.kind === 'rcs'); v.components.push({ ...makeTank('CH4', 500, 1), id: 'ch4tank', name: 'Spare methane', group: 'stage2', mount: 'stack' }); }],
  ['PAYLOAD_TOO_LONG', 'payload longer than the fairing', (v) => { const f = v.components.find((c) => c.kind === 'fairing'); v.components.find((c) => c.parent === f.id && c.mount === 'internal').length = f.length + 1; }],
  ['PAYLOAD_TOO_WIDE', 'payload wider than the fairing', (v) => { const f = v.components.find((c) => c.kind === 'fairing'); v.components.find((c) => c.parent === f.id && c.mount === 'internal').diameter = f.diameter + 0.2; }],
  ['PAYLOAD_TOO_BIG', 'payload fills more than 75 % of the fairing', (v) => { const f = v.components.find((c) => c.kind === 'fairing'); const k = v.components.find((c) => c.parent === f.id && c.mount === 'internal'); k.diameter = (f.diameter - 0.06) * 0.97; k.length = (f.length - 0.06) * 0.97; }],
  ['ORPHAN', 'part mounted in something that does not exist', (v) => { const c = v.components.find((x) => x.kind === 'battery'); c.mount = 'internal'; c.parent = 'ghost'; }],
  ['EXPOSED_PAYLOAD', 'payload with no fairing', (v) => {
    rmKind(v, (c) => c.group === 'payload' || c.group === 'fairing' || c.kind === 'fairing' || c.kind === 'nose_cone');
    v.components.push({ id: 'plx', kind: 'payload', name: 'Open payload', mount: 'stack', group: 'payload', mass: 80, length: 0.8, diameter: 0.6, maxQ: 1e9, maxQAlpha: 1e9, maxAccelG: 1e9, tMax: 1e5, tMin: 0 });
  }],
  ['DIAMETER_STEP', 'a tank far narrower than its neighbours', (v) => { const t = v.components.filter((c) => c.group === 'stage2' && c.kind === 'fuel_tank')[0]; t.diameter = 0.3; }],
  ['NO_GUIDANCE', 'no flight computer', (v) => rmKind(v, (c) => c.guidance)],
  ['NO_POWER', 'computer but no battery', (v) => rmKind(v, (c) => c.kind === 'battery' || c.kind === 'solar_panel')],
  ['VAC_ENGINE_SL', 'vacuum engine in the first stage', async (v, S) => { const r = await S.api.execute('MODIFY_STAGE', { stage: 'stage1', engine: 'eng-al100v' }); assert.ok(r.ok, r.message); }],
  ['STAGE_NO_ENGINE', 'a stage with fuel but no engine', (v) => rmKind(v, (c) => c.kind === 'engine' && c.group === 'stage2')],
];

const SNAP = {};
test('every broken design gets a fix that really removes the issue (rocket cases)', { timeout: 280000 }, async () => {
  const S = await session(); const v = S.api.project.vehicle; const snap = JSON.stringify(v);
  assert.deepEqual(issuesOf(v).filter((i) => i.severity !== 'info'), [], 'the base rocket must be clean');
  for (const [code, label, mutate] of BASE_CASES) {
    restore(v, snap);
    await mutate(v, S);
    const issue = issuesOf(v).find((i) => i.code === code);
    assert.ok(issue, `${label}: ${code} should be reported (got ${issuesOf(v).map((i) => i.code)})`);
    const fix = fixForIssue(v, issue);
    assert.ok(fix && fix.steps?.length, `${label}: ${code} has a fix`);
    assert.ok(fix.label && fix.label.length <= 60, `${label}: short label (${fix.label})`);
    const before = issuesOf(v).filter((i) => i.code === code).length;
    // one click may leave a sibling of the same code (e.g. two tanks missing): press again, as the UI would, but never more than 3 times
    let n = 0;
    for (; n < 3 && has(v, code); n++) {
      const f = fixForIssue(v, issuesOf(v).find((i) => i.code === code));
      assert.ok(f, `${label}: still fixable`);
      const r = await applyNeedFix(S.api, f); assert.ok(r.ok, `${label}: ${r.message}`);
    }
    assert.equal(n, 1, `${label}: one click is enough`);
    assert.ok(!has(v, code), `${label}: ${code} is gone after the fix (was ${before})`);
    SNAP[label] = n; if (process.env.AF_DEBUG) console.log('presses', n, label);
  }
});

test('LOW_TWR and MARGINAL_TWR: fix lifts the thrust-to-weight over the limit', { timeout: 120000 }, async () => {
  for (const [code, lo, hi, minAfter] of [['LOW_TWR', 0.5, 0.9, 1.0], ['MARGINAL_TWR', 1.03, 1.17, 1.2]]) {
    const S = await rocketWithTwr(lo, hi); const v = S.api.project.vehicle;
    const issue = issuesOf(v).find((i) => i.code === code); assert.ok(issue, `${code} reported`);
    const fix = fixForIssue(v, issue); assert.ok(fix, `${code} fix`);
    const r = await applyNeedFix(S.api, fix); assert.ok(r.ok, r.message);
    assert.ok(!has(v, code), `${code} gone`); assert.ok(analyzeVehicle(v).liftoffTWR >= minAfter);
  }
});

test('NO_POWER fix gives the computer a battery; fix works on the rocket in one step', async () => {
  const S = await session(); const v = S.api.project.vehicle;
  rmKind(v, (c) => c.kind === 'battery' || c.kind === 'solar_panel');
  const need = launchNeeds(S.api.project).find((n) => n.id === 'no-power'); assert.ok(need?.fix);
  assert.ok((await applyNeedFix(S.api, need.fix)).ok); assert.ok(!has(v, 'NO_POWER'));
});

test('lander and rover codes', { timeout: 60000 }, async () => {
  let S = new AiSession({ storage: new MemoryStorage() });
  assert.ok((await S.api.execute('CREATE_LANDER', { body: 'moon', payloadMass: 100 })).ok);
  let v = S.api.project.vehicle; rmKind(v, (c) => c.kind === 'landing_legs');
  let issue = issuesOf(v).find((i) => i.code === 'NO_LEGS'); assert.ok(issue);
  assert.ok((await applyNeedFix(S.api, fixForIssue(v, issue))).ok); assert.ok(!has(v, 'NO_LEGS'));
  // a lander with no engine
  rmKind(v, (c) => c.kind === 'engine');
  issue = issuesOf(v).find((i) => i.code === 'NO_ENGINE'); assert.ok(issue, 'lander without engine');
  const f = fixForIssue(v, issue); assert.ok(f, 'lander engine fix');
  const r = await applyNeedFix(S.api, f); assert.ok(r.ok, r.message); assert.ok(!has(v, 'NO_ENGINE'));
  // rover parts
  for (const [code, kind] of [['ROVER_NO_ROVER_CHASSIS', 'rover_chassis'], ['ROVER_NO_WHEEL', 'wheel'], ['ROVER_NO_MOTOR', 'motor'], ['ROVER_NO_BATTERY', 'battery']]) {
    S = new AiSession({ storage: new MemoryStorage() });
    assert.ok((await S.api.execute('CREATE_ROVER', {})).ok);
    v = S.api.project.vehicle; rmKind(v, (c) => c.kind === kind);
    issue = issuesOf(v).find((i) => i.code === code); assert.ok(issue, code);
    const rr = await applyNeedFix(S.api, fixForIssue(v, issue)); assert.ok(rr.ok, rr.message);
    assert.ok(!has(v, code), `${code} gone`);
  }
});

test('EMPTY vehicle: the fix builds a starter rocket', async () => {
  const S = new AiSession({ storage: new MemoryStorage() });
  assert.ok((await S.api.execute('CREATE_VEHICLE', { type: 'rocket', name: 'Empty' })).ok);
  let v = S.api.project.vehicle; v.components = []; v.stages = [];
  const issue = issuesOf(v).find((i) => i.code === 'EMPTY'); assert.ok(issue);
  const r = await applyNeedFix(S.api, fixForIssue(v, issue)); assert.ok(r.ok, r.message);
  v = S.api.project.vehicle; assert.ok(v.components.length > 3); assert.ok(!has(v, 'EMPTY'));
});

test('codes without a safe fix are explained, never silently ignored', () => {
  for (const code of ['ATMOSPHERIC_ENTRY', 'PANELS_STOWED', 'DISH_POINTING']) {
    assert.equal(fixForIssue({ components: [{}], stages: [] }, { code }), null);
    assert.ok(NO_FIX[code] && NO_FIX[code].length > 10, code);
  }
});

test('every code that validateVehicle can produce is covered by a fix or an explanation', () => {
  const src = fs.readFileSync(new URL('../src/vehicles/analysis.js', import.meta.url), 'utf8');
  const codes = new Set([...src.matchAll(/add\(\s*(?:[^,]+),\s*'([A-Z_]+)'/g)].map((m) => m[1]));
  for (const k of ['ROVER_NO_ROVER_CHASSIS', 'ROVER_NO_WHEEL', 'ROVER_NO_MOTOR', 'ROVER_NO_BATTERY']) codes.add(k);
  assert.ok(codes.size >= 22, `found ${codes.size} codes`);
  for (const c of codes) assert.ok(FIXABLE_CODES.includes(c) || NO_FIX[c], `${c} has neither a fix nor an explanation`);
});

test('needs: probe without power or radio, rocket stage without separation ring, missing fairing', { timeout: 60000 }, async () => {
  let S = new AiSession({ storage: new MemoryStorage() });
  assert.ok((await S.api.execute('CREATE_PROBE', { mass: 100, destination: 'moon' })).ok);
  let v = S.api.project.vehicle; rmKind(v, (c) => c.kind === 'battery' || c.kind === 'solar_panel' || c.kind === 'antenna');
  let ids = launchNeeds(S.api.project).map((n) => n.id);
  assert.ok(ids.includes('no-power-source') && ids.includes('no-antenna'), ids.join());
  for (const id of ['no-power-source', 'no-antenna']) { const n = launchNeeds(S.api.project).find((x) => x.id === id); assert.ok(n.fix, id); assert.ok((await applyNeedFix(S.api, n.fix)).ok); }
  ids = launchNeeds(S.api.project).map((n) => n.id); assert.ok(!ids.includes('no-power-source') && !ids.includes('no-antenna'), ids.join());
  S = await session(); v = S.api.project.vehicle;
  rmKind(v, (c) => c.group === 'stage1' && ['interstage', 'decoupler'].includes(c.kind));
  const n = launchNeeds(S.api.project).find((x) => x.id === 'stage-no-decoupler:stage1'); assert.ok(n?.fix, 'decoupler need');
  assert.ok((await applyNeedFix(S.api, n.fix)).ok);
  assert.ok(!launchNeeds(S.api.project).some((x) => x.id === 'stage-no-decoupler:stage1'));
});

test('issuesWithFixes pairs every shown issue with a button or a reason', async () => {
  const S = await session(); const v = S.api.project.vehicle;
  rmKind(v, (c) => c.group === 'stage1' && c.kind === 'oxidizer_tank');
  const list = issuesWithFixes(v); const nf = list.find((i) => i.code === 'NO_FEED');
  assert.match(nf.fix.label, /missing tank/i);
});
