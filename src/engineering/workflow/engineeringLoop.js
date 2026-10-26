// The integrated engineering loop: requirements -> design -> calculate -> analyze -> simulate -> measure ->
// verify -> identify failures -> diagnose -> improve -> run again. Each step records what it did and the
// evidence, so the user (or the AI director) can follow the reasoning. Automatic redesign suggestions are
// shown as explicit, versioned changes, never applied silently.
import { LUNAR_REQUIREMENTS, verifyAll, changeImpact } from '../requirements/requirements.js';
import { defaultLunarArchitecture, runLunarMission, translunar, transearth } from './lunarMission.js';
import { performance } from '../vehicle/model.js';
import { designReview } from '../review/designReview.js';
import { vehicleReliability } from '../reliability/reliability.js';
import { runMonteCarlo } from '../analysis/montecarlo.js';
import { lunarMissionModel } from '../analysis/models.js';
import { riskDashboard } from '../risk/risk.js';
import { VersionStore } from '../vehicle/versions.js';

// Map a weak requirement to the design change that addresses it (diagnosis rules, editable).
export const REMEDIES = {
  'PR-1': { vehicle: 'launcher', path: 'stages.2.propMass', factor: 1.05, why: 'More third-stage propellant raises TLI margin.' },
  'PR-2': { vehicle: 'csm', path: 'stages.0.propMass', factor: 1.06, why: 'More service-module propellant raises the post-TEI reserve.' },
  'PR-3': { vehicle: 'lm', path: 'stages.0.propMass', factor: 1.06, why: 'More descent propellant buys hover and redesignation time.' },
  'GN-1': { vehicle: 'lm', path: 'stages.0.propMass', factor: 1.04, why: 'Hard landings came from running short of terminal-descent propellant.' },
  'TH-1': { vehicle: 'csm', path: 'payload.mass', factor: 1.02, why: 'A thicker heat shield adds ablator (mass).' },
  'RV-1': { vehicle: 'lm', path: 'stages.1.propMass', factor: 1.05, why: 'More ascent propellant leaves more for rendezvous.' },
};

export function designDeltaV(arch) {
  const tl = translunar(arch.parkingAlt, arch.lunarOrbitAlt), te = transearth(arch.lunarOrbitAlt);
  return [
    { phase: 'Launch to parking orbit', dv: 9300, note: 'typical including gravity and drag losses (ascent simulation gives the actual value)' },
    { phase: 'Trans-lunar injection', dv: tl.tli }, { phase: 'Lunar orbit insertion', dv: tl.loi }, { phase: 'Descent orbit insertion', dv: 21.5 },
    { phase: 'Powered descent', dv: 2050, note: 'Apollo-class budget; descent simulation gives the actual value' }, { phase: 'Lunar ascent', dv: 1850 },
    { phase: 'Trans-Earth injection', dv: te.tei },
  ];
}

export function runEngineeringLoop({ arch = defaultLunarArchitecture(), mcRuns = 20, maxIterations = 2, requirements = LUNAR_REQUIREMENTS, onStep } = {}) {
  const versions = new VersionStore();
  const log = [];
  const step = (name, detail) => { const e = { step: name, ...detail }; log.push(e); onStep?.(e); return e; };
  step('Define requirements', { count: requirements.length, ids: requirements.map((r) => r.id) });
  for (const k of ['launcher', 'csm', 'lm']) versions.commit(arch[k], 'Initial design');
  const iterations = [];
  for (let it = 0; it < maxIterations; it++) {
    step('Design', { iteration: it + 1, versions: ['launcher', 'csm', 'lm'].map((k) => `${arch[k].name} v${versions.latest(arch[k].id).version}`) });
    const calc = { launcher: performance(arch.launcher), csm: performance(arch.csm), lm: performance(arch.lm), dvBudget: designDeltaV(arch) };
    step('Calculate', { idealDv: { launcher: calc.launcher.totalDv, csm: calc.csm.totalDv, lm: calc.lm.totalDv }, dvBudget: calc.dvBudget });
    const review = { launcher: designReview(arch.launcher), csm: designReview(arch.csm, { body: 'moon' }), lm: designReview(arch.lm, { body: 'moon' }) };
    const reliability = vehicleReliability(arch.lm, { missionHours: 80 }).missionReliability * vehicleReliability(arch.csm, { missionHours: 200 }).missionReliability * vehicleReliability(arch.launcher, { missionHours: 3 }).missionReliability;
    step('Analyze', { findings: Object.fromEntries(Object.entries(review).map(([k, r]) => [k, r.findings.length])), predictedReliability: reliability });
    const mission = runLunarMission(JSON.parse(JSON.stringify(arch)));
    step('Simulate', { success: mission.success, failedPhase: mission.failedPhase, phases: mission.phases.map((p) => `${p.name}: ${p.success ? 'PASS' : 'FAIL'}`) });
    step('Measure', { metrics: mission.metrics });
    const frozen = JSON.parse(JSON.stringify(arch));
    const mc = mcRuns > 0 ? runMonteCarlo(lunarMissionModel(() => JSON.parse(JSON.stringify(frozen))), { runs: mcRuns, keepRuns: false }) : null;
    const ver = verifyAll(requirements, mission.metrics, mc);
    step('Verify', { counts: ver.counts, rows: ver.rows.map((r) => ({ id: r.id, status: r.result.status, value: r.result.value, margin: r.result.margin })) });
    const weak = ver.rows.filter((r) => ['FAIL', 'MARGIN'].includes(r.result.status));
    const mcModes = mc ? Object.entries(mc.failureModes).sort((a, b) => b[1] - a[1]) : [];
    step('Identify failures', { weakRequirements: weak.map((r) => `${r.id} ${r.result.status}`), monteCarloFailureModes: mcModes });
    const risk = riskDashboard(mission.metrics, { mc });
    iterations.push({ iteration: it + 1, mission, mc, verification: ver, risk, review });
    const fixes = weak.map((r) => ({ req: r.id, remedy: REMEDIES[r.id] })).filter((x) => x.remedy);
    if (mcModes.length && mcModes[0][0] === 'Powered descent and landing' && !fixes.some((f) => f.remedy.vehicle === 'lm')) fixes.push({ req: 'MC: landing failures', remedy: REMEDIES['GN-1'] });
    step('Diagnose', { causes: fixes.map((f) => `${f.req}: ${f.remedy.why}`), unresolved: weak.filter((r) => !REMEDIES[r.id]).map((r) => r.id) });
    if (!fixes.length) { step('Done', { reason: weak.length ? 'Remaining issues need engineering judgement (no automatic remedy).' : 'All requirements pass with margin.' }); break; }
    const changes = [];
    for (const f of fixes) {
      const v = arch[f.remedy.vehicle]; const keys = f.remedy.path.split('.'); let o = v; for (const k of keys.slice(0, -1)) o = o[k];
      const before = o[keys[keys.length - 1]]; o[keys[keys.length - 1]] = Math.round(before * f.remedy.factor);
      changes.push({ vehicle: v.name, path: f.remedy.path, from: before, to: o[keys[keys.length - 1]], because: f.req });
    }
    const impact = ['launcher', 'csm', 'lm'].map((k) => { const prev = versions.latest(arch[k].id); const e = versions.commit(arch[k], `Iteration ${it + 2}: ${changes.filter((c) => c.vehicle === arch[k].name).map((c) => c.path).join(', ') || 'no change'}`); return { vehicle: arch[k].name, version: e.version, retest: e === prev ? [] : changeImpact(prev.vehicle, e.vehicle, requirements).retest.map((r) => r.id) }; });
    step('Improve design', { changes, impact });
  }
  return { log, iterations, versions, arch };
}
