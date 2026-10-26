// The Apollo 11-style Moon rocket (ASTRA LAB 1.9): the Saturn V stack and the whole mission in the REAL simulator.
// Nothing here trusts a prediction: the stored plan is re-planned and compared, then flown from liftoff to the splashdown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../physics/simulation.js';
import { validateVehicle } from '../src/vehicles/analysis.js';
import { buildApolloStack, stackFacts, APOLLO, APOLLO_GROUPS } from '../src/vehicles/apollo.js';
import { planApolloMission, apolloMissionFromPlan } from '../src/missions/apollo.js';
import { APOLLO_PLANS } from '../data/apollo-plans.js';
import { apolloMetrics, missionRows } from '../src/core/mission-validation.js';

const H = 3600;
let flown = null;
function fly() {
  if (flown) return flown;
  const v = buildApolloStack();
  const sim = new Simulation({ vehicle: v, mission: apolloMissionFromPlan(v, APOLLO_PLANS.default) });
  while (!sim.finished && sim.t < 14 * 86400) sim.run({ untilT: sim.t + 3600, budgetMs: 120000 });
  const at = (re) => sim.events.find((e) => re.test(e.message));
  flown = { sim, v, at };
  return flown;
}

test('stack: Saturn V-style, about 110 m tall, three stages, tower, CSM and a lunar module inside the adapter, no solar panels', () => {
  const v = buildApolloStack();
  const f = stackFacts(v);
  assert.ok(f.height > 100 && f.height < 120, `height ${f.height}`);
  assert.ok(f.mass > 2.6e6 && f.mass < 3.0e6, `mass ${f.mass}`);
  for (const g of ['stage1', 'stage2', 'stage3', 'sla', 'sm', 'cm', 'les', 'lmd', 'lma']) assert.ok(v.components.some((c) => c.group === g), `group ${g}`);
  assert.ok(!v.components.some((c) => c.kind === 'solar_panel'), 'Apollo ran on fuel cells and batteries');
  assert.ok(v.components.some((c) => c.kind === 'fuel_cell'));
  const lm = v.components.filter((c) => c.group === 'lmd' || c.group === 'lma');
  assert.ok(lm.every((c) => c.mount === 'internal' || c.exposed === 'stack' || c.mount === 'radial' || c.mount === 'stack'), 'the lunar module sits inside the adapter');
  assert.ok(APOLLO_GROUPS.stage1 && APOLLO_GROUPS.lmd);
  assert.ok(APOLLO.lm.descentProp > 5000);
  const issues = validateVehicle(v, { body: 'earth' }).filter((i) => i.severity === 'error' || i.level === 'error');
  assert.equal(issues.length, 0, JSON.stringify(issues.slice(0, 2)));
});

test('plan: the stored plan matches a fresh plan (re-run scripts/update-apollo-plans.mjs when this fails)', { timeout: 120000 }, () => {
  const p = planApolloMission(buildApolloStack()), s = APOLLO_PLANS.default;
  assert.ok(Math.abs(p.epoch - s.epoch) < 1 && Math.abs(p.burnStart - s.burnStart) < 1 && Math.abs(p.tofSeconds - s.tofSeconds) < 5, `fresh ${p.epoch}/${p.burnStart} vs stored ${s.epoch}/${s.burnStart}`);
});

test('the whole mission flies in the real simulator, with the Apollo 11 timeline and no failure on the way', { timeout: 600000 }, () => {
  const { sim, at } = fly();
  assert.equal(sim.result?.status, 'SUCCESS', sim.result?.message);
  assert.equal(sim.events.filter((e) => e.kind === 'FAILURE').length, 0, JSON.stringify(sim.events.filter((e) => e.kind === 'FAILURE').map((e) => e.message)));
  // ascent: stage 1 separation near T+2:40, stage 2 separation near T+9:00, orbit near T+12 min
  const sep1 = at(/Separated stage1/), sep2 = at(/Separated stage2/);
  assert.ok(sep1 && sep1.t > 140 && sep1.t < 190, `S-IC separation ${sep1?.t}`);
  assert.ok(sep2 && sep2.t > 450 && sep2.t < 600, `S-II separation ${sep2?.t}`);
  // stage 3 burns twice: orbit insertion and trans-lunar injection
  const tli = sim.events.find((e) => /Trans-lunar injection/.test(e.message) && e.kind === 'EVENT_DONE');
  assert.ok(tli && tli.t > 1.8 * H && tli.t < 3.2 * H, `TLI at ${tli?.t / H} h`);
  // landing about T+102 h; reserve in the descent stage; liftoff, docking, trans-Earth injection, entry interface
  const land = sim.events.find((e) => e.kind === 'LANDED');
  assert.ok(land && land.t > 95 * H && land.t < 110 * H, `landing ${land?.t / H} h`);
  assert.ok(/ 1\.\d+ m\/s vertical| 0\.\d+ m\/s vertical/.test(land.message), land.message);
  assert.ok(at(/Docked: command\/service module and lunar module/), 'docked again');
  assert.ok(at(/Trans-earth injection|Trans-Earth injection/i), 'trans-Earth injection');
  assert.ok(at(/Entry interface/), 'entry interface');
  // the way home: service module dropped, heat shield first, both parachute stages, splashdown at a survivable speed, crew pushed less than 15 g
  assert.ok(at(/Service module separation/), 'service module dropped');
  assert.ok(at(/Drogue parachutes open/) && at(/Main parachutes open/), 'both parachute stages');
  const splash = sim.events.filter((e) => e.kind === 'LANDED').at(-1);
  assert.ok(/^Splashdown/.test(splash.message) && splash.t > at(/Entry interface/).t + 600 && splash.t < at(/Entry interface/).t + 1200, splash.message);
  const vv = Number(/: ([\d.]+) m\/s vertical/.exec(splash.message)?.[1]); assert.ok(vv > 3 && vv < 12, `splashdown speed ${vv}`);
  assert.equal(sim.events.filter((e) => e.kind === 'FAILURE').length, 0);
});

test('fuel is kept per stage and per vehicle, with a real reserve in the lunar module descent stage at touchdown', { timeout: 600000 }, () => {
  const sim = new Simulation({ vehicle: buildApolloStack(), mission: apolloMissionFromPlan(buildApolloStack(), APOLLO_PLANS.default) });
  while (!sim.finished && !sim.events.some((e) => e.kind === 'LANDED')) sim.run({ untilT: sim.t + 1800, budgetMs: 120000 });
  const g = sim.fv.groupPropellant('lmd');
  const reserve = g.left / g.initial;
  assert.ok(reserve > 0.03 && reserve < 0.15, `descent reserve ${(reserve * 100).toFixed(1)}%`);
  assert.ok(sim.companion?.groups?.includes('sm'), 'the command/service module stays in lunar orbit while the lander is on the surface');
});

test('validation: the flown timeline and burn sizes match the Apollo 11 Mission Report within 10%', { timeout: 600000 }, () => {
  const { sim } = fly();
  const rows = missionRows('apollo11', apolloMetrics(sim));
  const bad = rows.filter((r) => r.kind === 'graded' && r.status !== 'pass');
  assert.equal(bad.length, 0, JSON.stringify(bad.map((r) => [r.id, r.sim, r.value, r.err])));
});
