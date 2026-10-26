// Fuzz: change a ready-made rocket the way the Rocket Builder does, then compare the "Will it fly?" checks and the Launch check with a REAL
// simulation, and see whether "Fix it and fly again" (src/core/makeitfly.js) repairs the ones that fail.
//   "green but fails" = every light of "Will it fly?" is green, but a real (tuned) flight does not reach the goal.
//   before = the lights as they were in v1.6.0 (always judged against a 9,400 m/s orbit budget, only build mistakes)
//   after  = the lights now (judged against the active goal, plus thrust that is too strong / a weak top stage)
// Usage: N=14 SEED=3 TUNE=6 FIX=1 node scripts/fuzz-builder.mjs
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { TEMPLATES } from '../data/templates.js';
import { flyChecks, ORBIT_DV } from '../ui/lib/rocketbuilder.js';
import { readinessReview } from '../src/core/readiness.js';
import { makeItFly } from '../src/core/makeitfly.js';
import { vehicleSummary } from '../ai/toolapi.js';
import { rocketBuildPlan } from '../ai/design.js';
import { applyPlan } from '../ai/plan.js';
import { validateVehicle } from '../src/vehicles/analysis.js';
import { ENGINES } from '../data/components.js';

let seed = +(process.env.SEED ?? 7);
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const N = +(process.env.N ?? 12), TUNE = +(process.env.TUNE ?? 6), FIX = process.env.FIX !== '0';

// the lights of v1.6.0
function oldGreen(v) {
  const sum = vehicleSummary(v, v.meta?.body ?? 'earth');
  const errors = validateVehicle(v, { body: v.meta?.body ?? 'earth' }).filter((i) => i.severity === 'error');
  return sum.liftoffTWR >= 1.2 && Number.isFinite(sum.dvVacuum) && sum.dvVacuum >= ORBIT_DV && !errors.length;
}

const stats = { n: 0, fails: 0, oldGreen: 0, oldGreenFail: 0, newGreen: 0, newGreenFail: 0, fixTried: 0, fixed: 0, honest: 0 };
for (let i = 0; i < N; i++) {
  const S = new AiSession({ storage: new MemoryStorage() });
  const desc = [];
  const kind0 = pick(['template', 'template', 'auto']);
  try {
    if (kind0 === 'auto') {
      const m = pick([20, 50, 100, 300, 500, 1000]), a = pick([200, 400, 800]);
      desc.push(`auto ${m} kg @ ${a} km`);
      await applyPlan(S, rocketBuildPlan({ payloadMass: m, altitude: a * 1000, dvMargin: pick([1.0, 1.05, 1.2]) }));
    } else {
      const t = pick(TEMPLATES.filter((x) => ['sounding-rocket', 'small-launcher', 'medium-launcher'].includes(x.id)));
      await t.build({ project: S.project }); desc.push(t.id);
    }
    const v = S.project.vehicle;
    const st = pick((v.stages ?? []).map((s) => s.id));
    const kind = pick(['engine', 'count', 'fuel', 'payload', 'none']);
    const cur = v.components.find((c) => c.kind === 'engine' && c.group === st);
    if (kind === 'engine' && cur) { const opts = ENGINES.filter((e) => !e.solid && [...e.propellants].sort().join() === [...cur.propellants].sort().join()); const e = pick(opts); desc.push('engine ' + e.catalogId); await S.api.execute('MODIFY_STAGE', { stage: st, engine: e.catalogId }); }
    if (kind === 'count') { const c = 1 + Math.floor(rnd() * 12); desc.push('count ' + c); await S.api.execute('MODIFY_STAGE', { stage: st, engineCount: c }); }
    if (kind === 'fuel') { const f = 0.3 + rnd() * 1.5; desc.push('fuel x' + f.toFixed(2)); await S.api.execute('MODIFY_STAGE', { stage: st, propellantScale: f }); }
    if (kind === 'payload') { const kg = pick([10, 100, 500, 2000, 8000]); desc.push('payload ' + kg); await S.api.execute('ADD_PAYLOAD', { mass: kg }); }
  } catch (e) { desc.push('tool error ' + e.message); }
  let fc, rr, og;
  try { fc = flyChecks(S.project.vehicle, 'earth', S.project.mission); rr = readinessReview(S.project.vehicle, S.project.mission); og = oldGreen(S.project.vehicle); } catch (e) { console.log('check error', e.message); continue; }
  const canTune = S.project.mission?.guidance?.mode === 'ascent' && S.project.mission?.objective?.type === 'orbit';
  const r = await S.api.execute('RUN_SIMULATION', { name: 'fz' + i, tune: canTune, maxCandidates: TUNE });
  if (!r.ok) { console.log(JSON.stringify({ desc: desc.join(' | '), skipped: String(r.message).slice(0, 80) })); continue; }
  const ok = r.data.status === 'SUCCESS', ng = fc.items.every((x) => x.state === 'ok');
  stats.n++; if (!ok) stats.fails++;
  if (og) { stats.oldGreen++; if (!ok) stats.oldGreenFail++; }
  if (ng) { stats.newGreen++; if (!ok) stats.newGreenFail++; }
  let fix = null;
  if (!ok && FIX) {
    stats.fixTried++;
    const f = await makeItFly(S.api, { maxRounds: 4 });
    if (f.ok) stats.fixed++; else stats.honest++;
    fix = { ok: f.ok, rounds: f.rounds.length, summary: f.summary.slice(0, 110) };
  }
  console.log(JSON.stringify({ desc: desc.join(' | '), oldGreen: og, newLights: fc.items.map((x) => x.state[0]).join(''), twr: +fc.sum.liftoffTWR.toFixed(2), ready: rr.overall?.status, flight: `${r.data.status} ${String(r.data.reason).slice(0, 40)}`, fix }));
}
const pc = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : 'n/a');
console.log('\nflights', stats.n, '| failing', stats.fails);
console.log(`green but fails BEFORE (v1.6.0 lights): ${stats.oldGreenFail} of ${stats.oldGreen} green = ${pc(stats.oldGreenFail, stats.oldGreen)}`);
console.log(`green but fails AFTER  (new lights):    ${stats.newGreenFail} of ${stats.newGreen} green = ${pc(stats.newGreenFail, stats.newGreen)}`);
if (FIX) console.log(`Fix it and fly again: ${stats.fixed} of ${stats.fixTried} failing rockets now fly; ${stats.honest} ended with an honest reason`);
