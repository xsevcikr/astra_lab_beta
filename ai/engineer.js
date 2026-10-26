// The offline AI aerospace engineer. It needs no internet and no API key.
//
// It understands a defined set of engineering requests (ai/nlu.js), turns them into structured tool calls (ai/toolspec.js) and writes
// every reply from tool results only. It never states a simulation outcome that was not produced by the physics engine: numbers about
// a flight come from ANALYZE_RESULTS / READ_TELEMETRY / COMPARE_SIMULATIONS, numbers about a design come from the vehicle model
// (DESCRIBE_VEHICLE / plan preview) and are labelled as estimates until a simulation has been run.
import { detectIntent, norm, quantities, firstQuantity, vehicleTypes, stageCount, orbitAltitude, payloadMass, stageRef, bodyOf, parseSweep } from './nlu.js';
import { extractRequest, mergeRequest, interpretRequest, hasContent, understoodSentence } from './intent.js';
import { conceptFor } from './knowledge.js';
import { teachReply } from './teacher.js';
import { Plan } from './plan.js';
import { marginPlan, rocketBuildPlan, probeBuildPlan, roverBuildPlan, landerBuildPlan, spacecraftBuildPlan, planFix, pickRoot, marginIdeas, stagePropellant, stageNumbers, payloadMassOf } from './design.js';
import { listProjects } from '../src/core/project.js';
import { slug } from '../src/core/storage.js';
import { buildReport, reportToPDF, reportToHTML, metricsToCSV } from '../src/core/report.js';
import { CATALOG } from '../data/components.js';
import { plainRun, plainExplain, plainProposal, plainApplied, plainCompare, plainRunSummary, plainFailureShort, plainPlan, plainAppliedShort, plainCompareShort, plainConcept, shortOf, cap, HELP_CHIPS, HELP_SHORT } from './plain.js';
import { validateVehicle } from '../src/vehicles/analysis.js';

const fmt = (x, d = 1) => (Number.isFinite(x) ? Number(x).toFixed(d) : '–');
const km = (m, d = 0) => `${fmt(m / 1000, d)} km`;
const pct = (x, d = 0) => `${fmt(100 * x, d)}%`;
const list = (items) => items.map((s) => `- ${s}`).join('\n');

/** Human readable value of an evidence item {label, value, unit}. */
export function evidenceText(e) {
  const v = e.value; const u = e.unit ?? '';
  if (typeof v !== 'number') return `${e.label}: ${v}`;
  if (u === 'm' && Math.abs(v) >= 1000) return `${e.label}: ${fmt(v / 1000, 1)} km`;
  if (u === 'Pa') return `${e.label}: ${fmt(v / 1000, 1)} kPa`;
  if (u === 'W/m2') return `${e.label}: ${fmt(v / 1e6, 2)} MW/m²`;
  if (u === 'bit') return `${e.label}: ${fmt(v / 8e6, 2)} MB`;
  return `${e.label}: ${Math.abs(v) >= 1000 ? fmt(v, 0) : Math.abs(v) >= 10 ? fmt(v, 1) : fmt(v, 3)}${u ? ' ' + u : ''}`;
}

const HELP = `I am the ASTRA LAB engineer. I design vehicles, fly them in the real physics simulator, and explain what happened from the recorded data. Things you can ask:

- **Build**: "Build me a two-stage rocket carrying a 100 kg space probe", "a rover for the Moon", "a lander carrying a 150 kg rover", "a small satellite".
- **Test**: "Test it" flies the active vehicle on its mission (a real RK4 simulation, not an estimate).
- **Diagnose**: "Why did it fail?" reads the recorded telemetry and failure records.
- **Improve**: "Fix it" proposes a design change; you approve, edit or cancel it, then I re-fly it and compare with the earlier run. "Fix it and keep trying until it works" authorises up to three iterations.
- **Modify**: "Add 10% propellant to the second stage", "use 3 engines on the first stage", "make the payload 150 kg", "change the orbit to 400 km", "add a solar panel".
- **Study**: "Compare the last two runs", "Vary the second stage propellant from 80% to 120%" (parameter sweep), "What is the peak dynamic pressure?"
- **Learn**: "What is the rocket equation?", "Explain Max-Q".
- **Project**: "Save the project", "Load project <name>", "Undo", "Redo", "Show version history", "Export the report".

Every design change is shown to you first and only applied when you approve it (and can be undone).`;

export class OfflineEngineer {
  constructor(session) { this.S = session; }

  // ==================================================================================================================
  async respond(text) {
    const S = this.S; const P = S.project;
    const intent = detectIntent(text, { hasPending: !!S.pending });
    // "keep trying until it works" is a standing authorisation for a bounded number of fix iterations
    const auto = /\b(until it works|keep trying|keep improving|as many (times|iterations)|iterate until|automatically)\b/.test(norm(text));

    if (S.clarify) { const r = await this.answerClarify(text); if (r) return r; }
    if (!S.pending) { const tr = teachReply(text); if (tr) return tr; }
    if (S.pending) {
      if (intent === 'approve') return this.approve();
      if (intent === 'cancel') { const t = S.pending.plan.title; S.cancelPending(); return { text: `Cancelled. "${t}" was not applied and the design is unchanged.`, short: shortOf('**Cancelled.**', ['Nothing was changed.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe'] }; }
      if (intent === 'test') { // "test it" while a proposal waits: the user obviously wants that design flown
        const ap = await this.approve({ quiet: true });
        const t = await this.test(text);
        return { ...t, text: `${ap.text}\n\n${t.text}` };
      }
      if (['build', 'modify', 'unknown'].includes(intent) || /\b(instead|rather|change (it|that)|make it|more margin|less)\b/.test(norm(text))) {
        const ed = await this.editPending(text);
        if (ed) return ed;
      }
    }
    if (!S.pending && /^(yes|yep|yeah|ok|okay|sure|approve|approved|go ahead|apply( it)?|confirm)\b/.test(norm(text))) return { text: 'There is no design proposal waiting for approval right now. Tell me what you would like to build or change.', short: shortOf('**Nothing is waiting for a yes.**', ['Tell me what to build or change.']), suggestions: ['What can I do next?', 'help'] };
    const R = await this.route(intent, text, auto);
    if (S.pending && !R.plan && !R.keepsPending && !['approve', 'cancel'].includes(intent) && !/waiting for your approval/.test(R.text)) R.text += `\n\n_The proposal "${S.pending.plan.title}" is still waiting for your approval._`;
    return R;
  }

  async route(intent, text, auto) {
    switch (intent) {
      case 'build': return this.build(text);
      case 'test': return this.test(text);
      case 'explain': return this.explain(text);
      case 'fix': return this.fix(text, auto);
      case 'compare': return this.compare();
      case 'modify': return this.modify(text);
      case 'experiment': return this.experiment(text);
      case 'montecarlo': return this.monteCarlo(text);
      case 'undo': return this.undo();
      case 'redo': return this.redo();
      case 'versions': return this.versions();
      case 'save': return this.save(text);
      case 'load': return this.load(text);
      case 'export': return this.exportRun(text);
      case 'stop': return this.stop();
      case 'concept': return (/\b(peak|maximum|highest|was|our|my|last run|this run)\b/.test(norm(text)) && this.S.ctx.runOrder.length) ? this.info(text) : this.concept(text);
      case 'info': return this.info(text);
      case 'help': return { text: HELP, short: HELP_SHORT, suggestions: HELP_CHIPS, wide: true };
      case 'next': return this.next(text);
      case 'greeting': return { text: 'Hello. I am the ASTRA LAB engineer. Tell me what to build, for example "Build me a two-stage rocket carrying a 100 kg space probe", or type "help" to see what I can do.', short: shortOf('**Hi! Ready to build a rocket?**', ['Tell me what to make, or pick one below.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe', 'help'] };
      case 'approve': return { text: 'There is no design proposal waiting for approval.', short: shortOf('**Nothing is waiting for a yes.**', ['Tell me what to build or change.']) };
      case 'cancel': return { text: 'Nothing is pending, so there is nothing to cancel.', short: shortOf('**Nothing to cancel.**') };
      default: return this.unknown(text);
    }
  }

  unknown(text) {
    const c = conceptFor(text);
    if (c) return this.concept(text);
    return { text: `I did not understand that as an engineering request. I can build, test, diagnose, fix and compare vehicles, run parameter sweeps and explain the equations, but I will not guess. Try for example "Build me a two-stage rocket carrying a 100 kg space probe", "Test it", or "help" for the full list.\n\nIf you connect an online AI model in Settings, it can handle free-form requests, but it still works only through the same tools.`, short: shortOf('**I did not get that one.**', ['I can build, test, explain and fix rockets.', 'Tap one of these to start.']), suggestions: HELP_CHIPS, wide: true };
  }

  // ==================================================================================================================
  // BUILD
  // ==================================================================================================================
  /** Extract what the user asked for, merge it with an earlier request (answers, edits) and continue. */
  async build(text, base = null) {
    const req = mergeRequest(base?.req ?? {}, extractRequest(text));
    return this.buildFromRequest(req);
  }

  /** The one clarifying question (with answer chips). Nothing is built until it is answered. */
  askReply(q) {
    const S = this.S;
    const chips = q.chips;
    const text = [`**${q.question}**`, '', list(q.context), '', 'Tap an answer, or type your own.'].join('\n');
    return { text, short: shortOf(`**${q.question}**`, q.context.slice(0, 2)), question: { id: q.id, text: q.question, context: q.context, chips }, suggestions: chips };
  }

  async buildFromRequest(req) {
    const S = this.S;
    const dec = interpretRequest(req);
    if (dec.none) {
      S.clarify = null;
      return { text: 'What kind of vehicle? I can build a rocket (with a probe, satellite or rover on top), a probe, a rover, a lander, a satellite or a spacecraft.', short: shortOf('**What should I build?**', ['A rocket, rover, lander, probe or satellite.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe', 'Build me a rover for the Moon', 'Build me a lander for the Moon'] };
    }
    if (dec.ask) { S.clarify = { req, id: dec.ask.id }; return this.askReply(dec.ask); }
    S.clarify = null;
    const { kind, spec } = dec.build;
    let plan;
    if (kind === 'rocket') plan = rocketBuildPlan({ payloadMass: spec.payloadMass, payloadKind: spec.payloadKind, altitude: spec.altitude, dvMargin: spec.dvMargin ?? 1.05 });
    else if (kind === 'probe') plan = probeBuildPlan({ mass: spec.mass, name: 'Space probe', destination: spec.destination });
    else if (kind === 'rover') plan = roverBuildPlan({ mass: spec.mass, body: spec.body, distance: spec.distance });
    else if (kind === 'lander') plan = landerBuildPlan({ payloadMass: spec.payloadMass, body: spec.body, withRoverMass: spec.withRoverMass });
    else plan = spacecraftBuildPlan({ type: spec.type, dv: spec.dv, mass: spec.mass });
    plan.builder = { kind, spec: { ...spec }, req };
    const pend = await S.propose(plan, { then: 'test' });
    const pp = plainPlan(pend, 'build');
    const understood = { rows: dec.rows, limits: dec.limits, sentence: understoodSentence(dec.rows) };
    const head = [`**${understood.sentence}**`, ...dec.limits.map((l) => `Note: ${l}`)].join('\n');
    const bullets = [...dec.rows.slice(0, 3).map((r) => `${r.label}: ${r.value}${r.note ? ` *(${r.note}${r.tag === 'assumed' ? ': my guess' : ''})*` : r.tag === 'assumed' ? ' *(my guess)*' : ''}`), ...dec.limits.slice(0, 1).map((l) => `Note: ${l}`), pend.preview.ok ? 'Press **Approve** to build it, or tell me what to change.' : 'That did not work out. Tell me what to change.'];
    return { text: `${head}\n\n${this.describeProposal(pend, [], 'build')}`, plain: plainProposal(pend, 'build'), short: shortOf('**I understood:**', bullets, 46), understood, steps: pp.steps, suggestions: pend.preview.ok ? ['Yes, apply it', 'Cancel', ...dec.rows.filter((r) => r.edit && r.tag === 'assumed').map((r) => r.edit).slice(0, 2)] : ['Cancel'], plan: true };
  }

  /** A short reply to the last clarifying question: merge it with the saved request. Returns null when the message is about something else. */
  async answerClarify(text) {
    const S = this.S; const c = S.clarify; const t = norm(text);
    if (/^(cancel|nope|never ?mind|forget it|stop|no thanks?|no)\b/.test(t)) { S.clarify = null; if (S.pending) return null; return { text: 'OK. I did not build anything.', short: shortOf('**OK, nothing built.**'), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe', 'help'] }; }
    const patch = extractRequest(text);
    if (/^\d+(\.\d+)?$/.test(t) && c.id === 'too-heavy') patch.mass = Number(t);
    const fresh = /^(build|make|create|design|construct|i want|i need|give me|please build)\b/.test(t) && (patch.payloadType || patch.launcher != null);
    if (fresh || !hasContent(patch)) { S.clarify = null; return null; }
    return this.buildFromRequest(mergeRequest(c.req, patch));
  }

  describeProposal(pend, notes = [], mode = 'build') {
    const { plan, preview } = pend;
    const L = [];
    L.push(`**Proposal: ${plan.title}**`);
    if (!preview.ok) {
      const bad = preview.steps.find((s) => !s.ok);
      L.push(`This proposal cannot be applied as it stands: step ${bad?.tool} fails in the dry run (${bad?.message}). Nothing has been changed. Tell me how to adjust it or cancel.`);
    }
    L.push('', 'Steps (dry run on a copy of your project, nothing is changed yet):');
    L.push(list(preview.steps.map((s) => `${s.ok ? 'OK' : 'Failed'}: **${s.tool}** — ${s.message}${s.why ? ` _(${s.why})_` : ''}`)));
    const s = preview.summary;
    if (s) {
      const b = preview.before;
      L.push('', `Resulting design (computed from the vehicle model, **not** a simulation result): total mass ${fmt(s.totalMass, 0)} kg, dry mass ${fmt(s.dryMass, 0)} kg, propellant ${fmt(s.propellantMass, 0)} kg${s.payloadMass ? `, payload ${fmt(s.payloadMass, 0)} kg` : ''}; ${s.type === 'rocket' ? `liftoff thrust-to-weight ${fmt(s.liftoffTWR, 2)}, ` : ''}ideal vacuum Δv ${fmt(s.dvVacuum, 0)} m/s.`);
      if (b && b.name === s.name) L.push(`Before: total mass ${fmt(b.totalMass, 0)} kg, Δv ${fmt(b.dvVacuum, 0)} m/s${b.liftoffTWR ? `, T/W ${fmt(b.liftoffTWR, 2)}` : ''}.`);
      if (s.stages?.length > 1 && s.type === 'rocket') L.push('Per stage: ' + s.stages.map((st) => `${st.name}: ${fmt(st.propellant, 0)} kg propellant, Δv ${fmt(st.dvVac, 0)} m/s, burn ${fmt(st.burnTime, 0)} s, T/W at ignition ${fmt(st.twrStart, 2)}`).join(' · ') + '.');
    }
    if (preview.mission) L.push(`Mission: "${preview.mission.name}" (${preview.mission.objective?.type}, ${preview.mission.events} timeline events).`);
    for (const i of preview.issues ?? []) L.push(`Warning: ${i.message}`);
    if (plan.rationale) L.push('', `Why: ${plan.rationale}`);
    for (const n of notes) L.push('', `Note: ${n}`);
    L.push('', mode === 'fix' ? 'Approve to apply it and I will re-fly the vehicle and compare the result with the previous flight; you can also edit or cancel.' : 'Nothing has been changed yet. **Approve** to apply it (one undo step), **edit** it in words ("make the payload 200 kg", "orbit at 400 km", "more margin") or **cancel**. Then say "test it".');
    return L.join('\n');
  }

  async editPending(text) {
    const S = this.S; const p = S.pending;
    const b = p.plan.builder;
    if (b && ['rocket', 'probe', 'rover', 'lander', 'spacecraft', 'satellite'].includes(b.kind) && b.req) {
      if (!hasContent(extractRequest(text))) return null;
      const r = await this.build(text, { req: b.req });
      if (r.question) return r;
      return { ...r, text: `Updated the proposal.\n\n${r.text}` };
    }
    if (p.plan.kind === 'fix' && /\b(more|bigger|larger|extra|increase)\b/.test(norm(text))) {
      S.fixAttempts += 1; S.cancelPending();
      const r = await this.fix('fix it with more margin', false);
      return { ...r, text: `Made the fix more generous.\n\n${r.text}` };
    }
    return null;
  }

  // ==================================================================================================================
  // APPROVE
  // ==================================================================================================================
  async approve({ quiet = false } = {}) {
    const S = this.S;
    const applied = await S.applyPending();
    if (!applied.ok) return { text: `${applied.error}${applied.results ? '\n' + list(applied.results.map((r) => `${r.ok ? 'OK' : 'Failed'}: ${r.tool}: ${r.message}`)) : ''}`, short: shortOf('**I could not apply that.**', ['Nothing was changed.', 'Ask me to change the plan, or cancel.']), keepsPending: true };
    const L = [`Applied **${applied.plan.title}** as one undo step.`, list(applied.results.map((r) => `${r.tool}: ${r.message}`))];
    if (applied.plan.kind === 'fix') {
      S.fixAttempts += 1;
      const res = await this.test('re-test after fix', { after: true });
      return { ...res, short: res.short, text: `${L.join('\n')}\n\nNow I re-fly the modified vehicle in the real simulator and compare it with the flight before the change.\n\n${res.text}` };
    }
    if (quiet) return { text: L.join('\n'), plain: plainApplied(applied.plan.title), short: plainAppliedShort(applied.plan.title) };
    L.push('', 'Say "test it" to fly it in the simulator. Until then, the numbers above are design estimates, not results.');
    return { text: L.join('\n'), plain: plainApplied(applied.plan.title), short: plainAppliedShort(applied.plan.title), suggestions: ['Test it'] };
  }

  // ==================================================================================================================
  // TEST (real simulation)
  // ==================================================================================================================
  async ensureMission() {
    const S = this.S; const P = S.project; const v = P.vehicle;
    if (!v) return null;
    if (P.mission && (P.mission.vehicleName === v.name || !P.mission.vehicleName)) return P.mission;
    const kind = v.type === 'rocket' ? 'launch' : v.type === 'rover' ? 'rover' : v.type === 'lander' ? 'landing' : v.type === 'probe' ? 'probe_operations' : 'orbit_raise';
    const r = await S.tool('CREATE_MISSION', { kind });
    return r.ok ? P.mission : null;
  }

  async test(text, { after = false } = {}) {
    const S = this.S; const P = S.project;
    if (!P.vehicle) return { text: 'There is no vehicle yet, so there is nothing to test. Ask me to build one, for example "Build me a two-stage rocket carrying a 100 kg space probe".', short: shortOf('**You have no rocket to test yet.**', ['Let me build one first.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe'] };
    const m = await this.ensureMission();
    if (!m) return { text: 'I could not create a mission for this vehicle. Tell me what it should do (for example "launch to a 200 km orbit").' };
    const v = P.vehicle;
    const tune = v.type === 'rocket' && m.guidance?.mode === 'ascent' && m.initial?.type === 'pad' && m.objective?.type === 'orbit';
    const before = S.lastRunId;
    const r = await S.tool('RUN_SIMULATION', { tune });
    if (!r.ok) return { text: `The simulation did not start: ${r.message}` };
    S.lastRunId = r.data.runId;
    const a = await S.tool('ANALYZE_RESULTS', { run: r.data.runId });
    if (!a.ok) return { text: `The simulation ran but the analysis failed: ${a.message}` };
    const R = a.data;
    const run = { id: R.runId, status: R.status };
    const L = [];
    L.push(this.headline(R, m));
    if (r.data.tuned) L.push(`_Ascent guidance: I fly the standard pitch programme first and, only if it does not reach the orbit, try up to eleven alternative programmes (each one a full simulation). ${r.data.tuned.length === 1 ? 'The standard programme worked.' : `This test needed ${r.data.tuned.length} flights.`} Reported flight: horizontal at ${km(r.data.schedule.hF)} altitude, shape exponent ${r.data.schedule.n}._`);
    L.push('', 'Recorded results:', list(this.keyFacts(R)));
    if (R.failures.length) {
      L.push('', '**Detected problems** (confidence: CONFIRMED = measured directly, LIKELY = strong inference, POSSIBLE = one plausible explanation):', list(R.failures.map((f) => `[${f.confidence}] ${f.title} at T+${fmt(f.t, 0)} s${f.causedBy ? ' (a consequence of the earlier problem)' : ''}`)));
    }
    let cmp = null;
    if (after && S.baselineRunId && S.baselineRunId !== R.runId) cmp = await this.compareRuns(S.baselineRunId, R.runId, L);
    const ok = R.status === 'SUCCESS';
    const sug = ok ? ['Show the margins', 'Vary the payload mass', 'Export the report', 'Save the project'] : ['Why did it fail?', 'Fix it'];
    if (!ok) L.push('', 'Ask "Why did it fail?" for the diagnosis from the telemetry, or "Fix it" and I will propose a design change for you to approve.');
    else if (!after) { const ideas = marginIdeas({ metrics: R.metrics }, v); if (ideas.length) L.push('', 'Margins: ' + ideas.map((i) => i.text).join(' ')); }
    S.aiFix = null;
    const fails = R.failures.filter((f) => f.severity !== 'minor');
    let short = plainRunSummary(R, m, fails.length ? pickRoot(R.failures) : null);
    if (cmp) short = shortOf(short.split('\n')[0], [...short.split('\n').slice(1).map((x) => x.replace(/^- /, '')).slice(0, 2), plainCompare(cmp)]);
    return { text: L.join('\n'), plain: plainRun(R, m), short, run, compare: cmp, suggestions: sug, analysis: R };
  }

  headline(R, mission) {
    const res = R.status === 'SUCCESS' ? '**SUCCESS**' : '**FAILURE**';
    const m = R.metrics; const obj = (mission ?? this.missionOfRun(R.runId))?.objective ?? {};
    let extra = '';
    if (obj.type === 'orbit' && m.finalPeri != null) extra = ` Final orbit ${km(m.finalPeri)} × ${km(m.finalApo)} (target ${km(obj.altitude ?? 0)}).`;
    else if (m.touchdownVertical != null) extra = ` Touchdown at ${fmt(m.touchdownVertical, 2)} m/s vertical, ${fmt(m.touchdownHorizontal, 2)} m/s horizontal.`;
    else if (m.distanceDriven != null) extra = ` Distance driven ${fmt(m.distanceDriven, 0)} m.`;
    return `${res} — ${R.reason} (T+${fmt(m.endTime, 0)} s).${extra}`;
  }

  missionOfRun(id) { return this.S.ctx.runs.get(id)?.record?.mission ?? this.S.project.mission; }

  keyFacts(R) {
    const m = R.metrics; const out = [];
    if (m.maxQ > 200) out.push(`Peak dynamic pressure ${fmt(m.maxQ / 1000, 1)} kPa at T+${fmt(m.tMaxQ, 0)} s (Mach ${fmt(m.machAtMaxQ, 2)}).`);
    if (m.maxG != null) out.push(`Peak acceleration ${fmt(m.maxG, 2)} g.`);
    if (m.maxAlt > 1000 && this.missionOfRun(R.runId)?.initial?.type === 'pad') out.push(`Maximum altitude ${km(m.maxAlt)}.`);
    if (m.dvIdeal > 0 && this.missionOfRun(R.runId)?.initial?.type === 'pad') out.push(`Engines delivered ${fmt(m.dvIdeal, 0)} m/s (ideal); losses: gravity ${fmt(m.dvGravity, 0)}, drag ${fmt(m.dvDrag, 0)}, steering ${fmt(m.dvSteering, 0)} m/s.`);
    if (m.initialPropellant > 0) out.push(`Propellant used ${fmt(m.propellantUsed, 0)} of ${fmt(m.initialPropellant, 0)} kg.`);
    if (m.lastStageReserve != null) out.push(`Propellant left in the last stage when it was discarded: ${fmt(m.lastStageReserve, 0)} kg (${pct(m.lastStageReserveFrac, 1)} of its load).`);
    if (m.liftoffTWR != null) out.push(`Liftoff thrust-to-weight ${fmt(m.liftoffTWR, 2)}.`);
    if (m.maxSlip != null) out.push(`Peak wheel slip ${pct(m.maxSlip)}, steepest slope ${fmt(m.maxTerrainSlope, 1)}°.`);
    if (m.minBatteryFrac != null && m.minBatteryFrac < 0.99) out.push(`Battery minimum ${pct(m.minBatteryFrac)}.`);
    if (m.linkTime) out.push(`Ground link closed for ${fmt(m.linkTime, 0)} s.`);
    return out.slice(0, 9);
  }

  // ==================================================================================================================
  // EXPLAIN
  // ==================================================================================================================
  async explain() {
    const S = this.S;
    if (!S.lastRunId && !S.ctx.runOrder.length) return { text: 'There is no simulation run to explain yet. Say "Test it" first, then I can analyse what happened from the recorded telemetry.' , short: shortOf('**No flight to explain yet.**', ['Launch first, then ask me why.']), suggestions: ['Test it'] };
    const a = await S.tool('ANALYZE_RESULTS', { run: S.lastRunId ?? 'last' });
    if (!a.ok) return { text: a.message };
    const R = a.data; const L = [];
    const real = R.failures.filter((f) => f.severity !== 'minor');
    if (R.status === 'SUCCESS' && !real.length) {
      L.push(`It did not fail. ${this.headline(R)}`, '', 'What the recorded data shows:', list(R.findings.filter((f) => f.level !== 'bad').map((f) => f.text).slice(0, 8)));
      const ideas = marginIdeas({ metrics: R.metrics }, S.project.vehicle);
      if (ideas.length) L.push('', 'Where it was closest to failing:', list(ideas.map((i) => i.text)));
      else L.push('', 'No margin problem shows up in this run.');
      L.push('', 'To find out how robust it is, I can vary the payload mass or the propellant in a parameter sweep (each case is a real simulation), or raise the payload until it stops working.');
      return { text: L.join('\n'), plain: plainExplain(R, null, this.missionOfRun(R.runId)), short: plainFailureShort(R, null, this.missionOfRun(R.runId)), suggestions: ['Vary the payload mass from 100 kg to 400 kg', 'Show the margins'], analysis: R };
    }
    const root = pickRoot(R.failures);
    L.push(`${R.status === 'SUCCESS' ? '**The mission succeeded, but with problems.**' : '**The mission failed.**'} ${R.reason} (T+${fmt(R.metrics.endTime, 0)} s).`, '');
    L.push(`**Root cause — ${root.title} [${root.confidence}] at T+${fmt(root.t, 0)} s**`, root.cause);
    if (root.evidence?.length) L.push('', 'Evidence from the telemetry:', list(root.evidence.map(evidenceText)));
    if (root.contributing?.length) L.push('', 'Contributing factors:', list(root.contributing));
    const others = R.failures.filter((f) => f !== root && f.code !== root.code);
    if (others.length) L.push('', 'Other detected problems' + (others.some((f) => f.causedBy) ? ' (several are consequences of the root cause, not independent faults)' : '') + ':', list(others.map((f) => `[${f.confidence}] ${f.title} at T+${fmt(f.t, 0)} s${f.causedBy ? ` — consequence of "${root.title}"` : ''}: ${f.cause}`)));
    if (root.consequences) L.push('', `Consequence: ${root.consequences}`);
    if (root.solutions?.length) L.push('', 'Possible solutions:', list(root.solutions));
    if (S.project.settings.educationalMode && root.equation) L.push('', `Equation (${root.equation.name}): ${root.equation.formula}${root.equation.values ? ' → ' + root.equation.values : ''}`);
    L.push('', `Everything above is read from run "${R.runId}" (recorded telemetry and failure analysis), not estimated. Say "Fix it" and I will propose a design change for you to approve.`);
    return { text: L.join('\n'), plain: plainExplain(R, root, this.missionOfRun(R.runId)), short: plainFailureShort(R, root, this.missionOfRun(R.runId)), suggestions: ['Fix it', 'Compare the last two runs'], analysis: R };
  }

  // ==================================================================================================================
  // FIX
  // ==================================================================================================================
  async fix(text, auto = false) {
    const S = this.S; const P = S.project; const v = P.vehicle;
    if (!v) return { text: 'There is no vehicle to fix yet.', short: shortOf('**No rocket to fix yet.**', ['Build one first.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe'] };
    if (!S.lastRunId) return { text: 'I need a simulation result to know what to fix. Say "Test it" first.', short: shortOf('**I need a flight first.**', ['Launch it, then I can fix what went wrong.']), suggestions: ['Test it'] };
    let budget = auto ? 3 : 1;
    const out = [];
    let last = null;
    for (let i = 0; i < budget; i++) {
      const a = await S.tool('ANALYZE_RESULTS', { run: S.lastRunId });
      if (!a.ok) return { text: a.message };
      const R = a.data;
      if (R.status === 'SUCCESS' && !R.failures.some((f) => f.severity !== 'minor')) {
        out.push(i === 0 ? `Nothing failed in the last run, so there is nothing to fix. ${this.headline(R)}` : `The vehicle now works: ${this.headline(R)}`);
        if (i === 0) {
          const ideas = marginIdeas({ metrics: R.metrics }, v);
          if (ideas.length) out.push('Margins you might want to improve:\n' + list(ideas.map((x) => x.text)));
          const mp = ideas.some((x) => x.id === 'margin') ? marginPlan({ vehicle: v, mission: P.mission, body: v.meta?.body ?? 'earth', step: 0.05 + 0.03 * S.fixAttempts }) : null;
          if (mp) {
            const pend = await S.propose(mp, { then: 'resim' });
            const pf = plainPlan(pend, 'fix');
            return { text: `${out.join('\n\n')}\n\nSince you asked me to improve it, here is a proposal to build in more margin:\n\n${this.describeProposal(pend, [], 'fix')}`, plain: plainProposal(pend, 'fix'), short: pf.short, steps: pf.steps, suggestions: ['Yes, apply it', 'Cancel'], plan: true };
          }
        }
        last = { text: out.join('\n\n'), plain: plainRun(R, P.mission), short: shortOf('**Nothing to fix!**', ['Your last flight worked.', 'Want to make it stronger? Add more margin.']), suggestions: ['Vary the payload mass', 'Export the report'] };
        return last;
      }
      const attempt = S.fixAttempts;
      const fx = await planFix({ vehicle: v, mission: P.mission, analysis: { ...R, tunedCount: (S.ctx.runs.get(R.runId)?.record?.meta?.tunedCandidates ?? []).length }, probe: (n, args) => S.quiet(n, args), body: v.meta?.body ?? 'earth', attempt });
      if (!fx.plan) {
        const inv = fx.investigation?.length ? `\n\nI also investigated with real simulations: ${fx.investigation.join(' ')}` : '';
        out.push(`${fx.advisory}${inv}`);
        return { text: out.join('\n\n'), short: shortOf('**I do not have a safe fix yet.**', ['Ask “Why did it fail?” to see the main problem.']), suggestions: ['Why did it fail?'] };
      }
      const pend = await S.propose(fx.plan, { then: 'resim' });
      if (!auto) {
        const inv = fx.investigation?.length ? `I investigated with real simulations first: ${fx.investigation.join(' ')}\n\n` : '';
        const pf2 = plainPlan(pend, 'fix');
        return { text: `${inv}${this.describeProposal(pend, [], 'fix')}`, plain: plainProposal(pend, 'fix'), short: pf2.short, steps: pf2.steps, suggestions: ['Yes, apply it', 'Cancel', 'More margin'], plan: true };
      }
      // pre-authorised iteration: apply, re-fly, compare
      out.push(`**Iteration ${i + 1}** (applied automatically because you asked me to keep trying; each step is one undo step)\n${this.describeProposal(pend, [], 'fix').split('\n').slice(0, 14).join('\n')}`);
      const ap = await this.approve();
      out.push(ap.text);
      const lastRun = await S.tool('ANALYZE_RESULTS', { run: S.lastRunId });
      if (lastRun.ok && lastRun.data.status === 'SUCCESS') return { text: out.join('\n\n'), suggestions: ['Save the project', 'Export the report'] };
      last = ap;
    }
    out.push(`I stopped after ${budget} automatic iterations without reaching a working design. The last result is shown above; ask "Why did it fail?" for the diagnosis or tell me a direction.`);
    return { text: out.join('\n\n'), suggestions: ['Why did it fail?', 'Fix it'] };
  }

  // ==================================================================================================================
  // COMPARE
  // ==================================================================================================================
  async compare() {
    const S = this.S;
    if (S.ctx.runOrder.length < 2) return { text: 'I need two simulation runs to compare. So far there is ' + (S.ctx.runOrder.length ? 'one' : 'none') + '. Change the design and test again, then ask me to compare.', short: shortOf('**I need two flights to compare.**', [`You have ${S.ctx.runOrder.length ? 'one' : 'none'} so far.`, 'Change something, then test again.']), suggestions: ['Test it'] };
    const L = []; const ids = S.ctx.runOrder;
    const cmp = await this.compareRuns(ids[ids.length - 2], ids[ids.length - 1], L);
    return { text: L.join('\n'), plain: plainCompare(cmp), short: plainCompareShort(cmp) ?? shortOf('**I could not compare those.**'), compare: cmp, suggestions: ['Fix it', 'Save the project'] };
  }

  async compareRuns(aId, bId, L) {
    const S = this.S;
    const c = await S.tool('COMPARE_SIMULATIONS', { a: aId, b: bId });
    if (!c.ok) { L.push(`Comparison not possible: ${c.message}`); return null; }
    const d = c.data;
    const show = ['status', 'finalPeri', 'finalApo', 'endTime', 'initialMass', 'propellantUsed', 'lastStageReserve', 'dvIdeal', 'dvSteering', 'maxQ', 'maxG', 'touchdownVertical', 'distanceDriven'];
    const val = (r, x) => (r.key === 'status' ? x : x == null ? '–' : ['finalPeri', 'finalApo'].includes(r.key) ? km(x) : r.key === 'maxQ' ? `${fmt(x / 1000, 1)} kPa` : `${Math.abs(x) >= 100 ? fmt(x, 0) : fmt(x, 2)}${r.unit ? ' ' + r.unit : ''}`);
    const rows = d.rows.filter((r) => show.includes(r.key));
    L.push('', `**Comparison** (${d.statusA} → ${d.statusB}), both from recorded simulations:`, '| Metric | Before | After |', '|---|---|---|', ...rows.map((r) => `| ${r.label} | ${val(r, r.a)} | ${val(r, r.b)} |`));
    if (d.designChanges?.length) {
      const bigChange = new Set(d.designChanges.filter((x) => x.field === 'propellantMass' || x.field === 'count').map((x) => x.id));
      const ch = d.designChanges.filter((x) => !(x.change === 'modified' && bigChange.has(x.id) && ['mass', 'length', 'diameter'].includes(x.field)));
      L.push('', 'Design changes between the two runs:', list(ch.slice(0, 10).map((x) => x.change === 'modified' ? `${x.name}: ${x.field} ${fmt(x.from, 1)} → ${fmt(x.to, 1)}` : `${x.change} ${x.name}`)) + (ch.length > 10 ? `\n- … and ${ch.length - 10} more` : ''));
    }
    if (d.failuresFixed.length) L.push('', `Failures fixed: ${d.failuresFixed.join(', ')}.`);
    if (d.failuresRemaining.length) L.push(`Failures still present: ${d.failuresRemaining.join(', ')}.`);
    if (d.failuresIntroduced.length) L.push(`New failures: ${d.failuresIntroduced.join(', ')}.`);
    const verdict = d.statusA !== 'SUCCESS' && d.statusB === 'SUCCESS' ? '**The change fixed the mission.**' : d.statusA === d.statusB && d.statusB === 'SUCCESS' ? 'Both runs succeeded.' : d.statusB !== 'SUCCESS' ? '**The mission still fails.** The numbers above show whether the change moved it in the right direction; say "Fix it" for the next iteration.' : 'The new run is worse than the old one.';
    L.push('', verdict);
    return { a: aId, b: bId, statusA: d.statusA, statusB: d.statusB, rows: d.rows };
  }

  // ==================================================================================================================
  // MODIFY (natural-language edits)
  // ==================================================================================================================
  async modify(text) {
    const S = this.S; const P = S.project; const v = P.vehicle;
    const t = norm(text);
    if (!v) return { text: 'There is no vehicle to modify yet. Ask me to build one first.', short: shortOf('**No rocket to change yet.**', ['Build one first.']), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe'] };
    const calls = []; const notes = [];
    const ref = stageRef(text) ?? (P.recall(/(first|second|third|upper|lower) stage/.exec(t)?.[0] ?? '') ? { stage: P.recall(/(first|second|third|upper|lower) stage/.exec(t)[0]) } : null);
    const nums = stageNumbers(v);
    const stageId = ref ? (ref.stage === 'upper' ? `stage${Math.max(...nums, 1)}` : typeof ref.stage === 'number' ? `stage${ref.stage}` : String(ref.stage)) : null;
    const qs = quantities(text);
    const percent = /([+-]?\d+(?:\.\d+)?)\s*(%|percent|per cent)/.exec(t);
    const inc = /\b(increase|raise|add|more|extra|boost|bigger|larger|grow)\b/.test(t), dec = /\b(decrease|reduce|remove|less|cut|lower|smaller|shrink|trim|drop)\b/.test(t) && !/\bremove (the )?(engine|panel|antenna|battery|component)/.test(t);
    // propellant of a stage
    if (/\b(propellant|fuel|tank)/.test(t) && stageId && v.type === 'rocket') {
      const cur = stagePropellant(v, stageId);
      if (!cur) return { text: `I can't find propellant tanks in ${stageId}. Stages in this vehicle: ${v.stages.map((s) => `${s.id} (${s.name})`).join(', ')}.` };
      const kg = qs.find((x) => x.unit === 'kg' || x.unit === 't');
      if (percent && (inc || dec)) { const f = 1 + (dec ? -1 : 1) * Math.abs(Number(percent[1])) / 100; calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, propellantScale: f }, why: `Propellant ${inc ? '+' : '−'}${Math.abs(Number(percent[1]))}% (${fmt(cur, 0)} → ${fmt(cur * f, 0)} kg).` }); }
      else if (kg && /\b(to|set|=)\b/.test(t)) calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, propellantMass: kg.si }, why: `Propellant set to ${fmt(kg.si, 0)} kg (was ${fmt(cur, 0)} kg).` });
      else if (kg && (inc || dec)) { const nv = Math.max(1, cur + (dec ? -1 : 1) * kg.si); calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, propellantMass: nv }, why: `Propellant ${fmt(cur, 0)} → ${fmt(nv, 0)} kg.` }); }
      else if (/\bdouble\b/.test(t)) calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, propellantScale: 2 }, why: 'Propellant × 2.' });
      else if (/\bhalve|half\b/.test(t)) calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, propellantScale: 0.5 }, why: 'Propellant × 0.5.' });
    }
    // engines
    if (!calls.length && /\bengines?\b/.test(t) && stageId && v.type === 'rocket') {
      const m = /(\d+|one|two|three|four|five|six|seven|eight|nine|single|double|triple)\s*(?:x\s*)?engines?/.exec(t);
      const word = { one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
      if (m) calls.push({ tool: 'MODIFY_STAGE', args: { stage: stageId, engineCount: Number(m[1]) || word[m[1]] }, why: `${m[1]} engine(s) on ${stageId}.` });
    }
    // payload mass
    if (!calls.length && /\b(payload|probe|satellite)\b/.test(t) && v.type === 'rocket') {
      const kg = qs.find((x) => x.unit === 'kg' || x.unit === 't');
      if (kg) {
        const cur = payloadMassOf(v);
        const target = /\b(add|more|extra|increase)\b/.test(t) && !/\bto\b/.test(t) ? cur + kg.si : /\b(reduce|less|decrease|lighter)\b/.test(t) && !/\bto\b/.test(t) ? cur - kg.si : kg.si;
        calls.push({ tool: 'CREATE_PROBE', args: { name: 'Space probe', mass: Math.max(5, target), destination: 'mars' }, why: `A new ${fmt(target, 0)} kg probe (was ${fmt(cur, 0)} kg).` });
        calls.push({ tool: 'ADD_PAYLOAD', args: { vehicle: v.id, payloadVehicle: 'Space probe' }, why: 'Replace the payload in the fairing (the launcher itself is not re-sized; only a simulation shows whether it still works).' });
        notes.push('The launcher is **not** re-sized when the payload changes; the propellant stays as it is. Test it to see whether it still reaches orbit, or ask me for a new build with that payload.');
      }
    }
    // target orbit
    if (!calls.length && /\b(orbit|altitude|apoapsis)\b/.test(t)) {
      const alt = orbitAltitude(text);
      if (alt != null && P.mission) calls.push({ tool: 'MODIFY_MISSION', args: { altitude: alt }, why: `Target orbit altitude ${km(alt)}.` });
    }
    if (!calls.length && /\b(max(imum)? (time|duration))\b/.test(t)) { const q = qs.find((x) => ['s', 'min', 'h'].includes(x.unit)); if (q && P.mission) calls.push({ tool: 'MODIFY_MISSION', args: { maxTime: q.si }, why: `Maximum mission time ${fmt(q.si, 0)} s.` }); }
    // add / remove components by kind
    if (!calls.length && /\b(add|another|extra|install|attach)\b/.test(t)) {
      const kinds = [['solar', 'solar_panel'], ['panel', 'solar_panel'], ['battery', 'battery'], ['antenna', 'antenna'], ['dish', 'antenna'], ['heater', 'heater'], ['radiator', 'radiator'], ['reaction wheel', 'reaction_wheel'], ['instrument', 'instrument'], ['camera', 'instrument'], ['parachute', 'parachute'], ['legs', 'landing_legs']];
      const hit = kinds.find(([k]) => t.includes(k));
      if (hit) {
        let items = CATALOG.filter((c) => c.kind === hit[1]);
        const big = /\b(large|big|bigger|high[- ]gain|hga|4 ?m|2000)\b/.test(t);
        const item = (big ? items[items.length - 1] : items[0]) ?? null;
        if (item) calls.push({ tool: 'ADD_COMPONENT', args: { catalogId: item.catalogId, ...(v.components.some((c) => c.kind === 'payload' && c.group !== 'payload') ? {} : {}) }, why: `${item.name} from the catalog (${item.dataSource ?? 'estimated'}).` });
      }
    }
    if (!calls.length && /\b(remove|delete|take off|drop)\b/.test(t)) {
      const hit = v.components.find((c) => t.includes(String(c.name).toLowerCase()) || t.includes(String(c.kind).replace('_', ' ')));
      if (hit) calls.push({ tool: 'REMOVE_COMPONENT', args: { id: hit.id }, why: `Remove ${hit.name}.` });
    }
    if (!calls.length) return { short: shortOf('**Which part should I change?**', ['Try: “add 10% fuel to the second stage”.', 'Or: “make the payload 150 kg”.']), text: 'I could not turn that into a concrete change. Examples I understand: "add 10% propellant to the second stage", "set the first stage propellant to 9000 kg", "use 3 engines on the first stage", "make the payload 150 kg", "change the orbit to 400 km", "add a solar panel", "remove the heater". Which stage or part do you mean?' };
    const plan = new Plan({ title: 'Design change: ' + calls.map((c) => c.why).filter(Boolean)[0]?.replace(/\.$/, ''), kind: 'edit', calls, rationale: 'You asked for this change; nothing else is modified.' });
    const pend = await S.propose(plan, { then: null });
    const pe = plainPlan(pend, 'edit');
    return { text: this.describeProposal(pend, notes, 'edit'), short: pe.short, steps: pe.steps, suggestions: ['Yes, apply it', 'Cancel'], plan: true };
  }

  // ==================================================================================================================
  // MONTE CARLO (reliability study)
  // ==================================================================================================================
  async monteCarlo(text) {
    const S = this.S; const P = S.project;
    if (!P.vehicle || !P.mission) return { text: 'A reliability study needs a vehicle and a mission. Build one and test it first.' };
    const n = /\b(\d{1,3})\s*(times|runs|simulations|flights|samples|trials|cases)\b/.exec(norm(text));
    const runs = Math.max(5, Math.min(200, n ? +n[1] : 30));
    const r = await S.tool('RUN_MONTE_CARLO', { name: 'Monte Carlo', runs });
    if (!r.ok) return { text: `The reliability study could not run: ${r.message}` };
    const an = r.data.analysis;
    const L = [r.message, ''];
    L.push(`| Input (1 sigma) | Correlation with success | Correlation with ${an.metric} |`, '|---|---|---|');
    for (const s of an.sensitivity) L.push(`| ${s.factor} (${fmt(100 * s.sigma, 1)} %) | ${s.rSuccess == null ? 'n/a' : fmt(s.rSuccess, 2)} | ${s.rMetric == null ? 'n/a' : fmt(s.rMetric, 2)} |`);
    const pe = an.stats.finalPeri;
    if (pe && P.mission.objective?.type === 'orbit') L.push('', `Final periapsis: mean ${km(pe.mean)}, 5th to 95th percentile ${km(pe.p5)} to ${km(pe.p95)}.`);
    const codes = Object.entries(an.failureCodes).sort((a, b) => b[1] - a[1]);
    if (codes.length) L.push('', `Failure modes seen: ${codes.map(([c, k]) => `${c} in ${k} run${k > 1 ? 's' : ''}`).join(', ')}.`);
    L.push('', `All ${an.runs} runs are complete physics simulations with a fixed random seed, so the study is reproducible. The table can be exported as CSV from the Experiment Lab.`);
    return { text: L.join('\n'), suggestions: an.success < an.valid ? ['Why did it fail?', 'Fix it'] : ['Save the project'] };
  }

  // ==================================================================================================================
  // EXPERIMENT (parameter sweep)
  // ==================================================================================================================
  async experiment(text) {
    const S = this.S; const P = S.project; const v = P.vehicle;
    if (!v || !P.mission) return { text: 'A sweep needs a vehicle and a mission. Build one and test it first.' };
    const sw = parseSweep(text);
    if (!sw) return { text: 'Say what to vary and over which range, for example "Vary the payload mass from 100 kg to 400 kg", "Vary the second stage propellant from 80% to 120%" or "Vary the target orbit from 200 to 600 km".' };
    let param;
    if (sw.what === 'payload') {
      const bus = v.components.find((c) => c.group === 'payload' && c.kind === 'payload');
      if (!bus) return { text: 'This vehicle has no payload component to vary.' };
      const cur = bus.mass; const from = sw.from ?? cur * 0.5, to = sw.to ?? cur * 4;
      param = { path: `vehicle.components[${bus.id}].mass`, from: sw.from != null ? sw.from - (payloadMassOf(v) - cur) : from, to: sw.to != null ? sw.to - (payloadMassOf(v) - cur) : to, steps: sw.steps };
    } else if (sw.what === 'stage2prop' || sw.what === 'stage1prop') {
      const id = sw.what === 'stage2prop' ? `stage${Math.max(...stageNumbers(v), 2)}` : 'stage1';
      const cur = stagePropellant(v, id) || 1;
      const isPct = sw.unit === '%' || sw.unit === 'percent' || sw.from == null;
      param = { path: `vehicle.group[${id}].propellantScale`, from: sw.from == null ? 0.8 : isPct ? sw.from / 100 : sw.from / cur, to: sw.to == null ? 1.2 : isPct ? sw.to / 100 : sw.to / cur, steps: sw.steps };
    } else if (sw.what === 'altitude') {
      param = { path: 'mission.targetAltitude', from: (sw.from ?? 200) * 1000, to: (sw.to ?? 600) * 1000, steps: sw.steps };
    } else if (sw.what === 'pitch') {
      if (!P.mission.guidance?.params?.schedule) return { text: 'This mission has no pitch programme to vary.' };
      param = { path: 'mission.guidance.params.schedule.hF', from: (sw.from ?? 70) * 1000, to: (sw.to ?? 240) * 1000, steps: sw.steps };
    }
    const orbit = P.mission.objective?.type === 'orbit';
    const r = await S.tool('CREATE_EXPERIMENT', { name: `Sweep: ${sw.what}`, parameters: [param], objective: orbit ? { metric: 'propellantUsed', goal: 'min', requireSuccess: true } : undefined });
    if (!r.ok) return { text: `The sweep could not run: ${r.message}` };
    const d = r.data;
    const label = (p) => Object.entries(p).map(([k, x]) => (/mass|Mass/.test(k) ? `${fmt(x, 0)} kg` : /propellantScale/.test(k) ? `${fmt(100 * x, 0)}%` : /Altitude/.test(k) || /hF/.test(k) ? km(x) : fmt(x, 2))).join(', ');
    const L = [r.message, '', '| Value | Result | Final orbit / outcome |', '|---|---|---|', ...d.cases.map((c) => `| ${label(c.params)} | ${c.status} | ${c.metrics?.finalPeri != null && orbit ? `${km(c.metrics.finalPeri)} × ${km(c.metrics.finalApo)}` : c.reason ?? ''} |`)];
    const oks = d.cases.filter((c) => c.status === 'SUCCESS');
    if (oks.length && oks.length < d.cases.length) L.push('', `The design works for ${label(oks[0].params)}${oks.length > 1 ? ' to ' + label(oks[oks.length - 1].params) : ''} and fails outside that range (every row above is a full simulation).`);
    else if (!oks.length) L.push('', 'None of the cases succeeded.');
    else L.push('', 'All cases succeeded in the range tested.');
    L.push('The table is saved with the project and can be exported as CSV from the Experiment Lab.');
    return { text: L.join('\n'), suggestions: ['Fix it', 'Save the project'] };
  }

  // ==================================================================================================================
  // INFO / CONCEPTS
  // ==================================================================================================================
  async info(text) {
    const S = this.S; const t = norm(text);
    const chans = [[/max[- ]?q|dynamic pressure/, 'q', 'max', 'peak dynamic pressure', (x) => `${fmt(x / 1000, 2)} kPa`], [/g[- ]?load|acceleration|peak g\b|how many g/, 'gload', 'max', 'peak acceleration', (x) => `${fmt(x, 2)} g`], [/how high|altitude|apogee/, 'alt', 'max', 'maximum altitude', (x) => km(x, 1)], [/how fast|speed|velocity/, 'speed', 'max', 'maximum speed', (x) => `${fmt(x, 0)} m/s`], [/temperature|hot|heat/, 'tempLead', 'max', 'peak nose temperature', (x) => `${fmt(x, 0)} K (${fmt(x - 273.15, 0)} °C)`], [/apoapsis/, 'apo', 'final', 'final apoapsis', (x) => km(x, 1)], [/periapsis/, 'peri', 'final', 'final periapsis', (x) => km(x, 1)], [/propellant left|fuel left|remaining/, 'propMass', 'final', 'propellant remaining', (x) => `${fmt(x, 0)} kg`], [/thrust/, 'thrust', 'max', 'maximum thrust', (x) => `${fmt(x / 1000, 0)} kN`]];
    const hit = chans.find(([rx]) => rx.test(t));
    if (hit && S.ctx.runOrder.length) {
      const at = /\bat (?:t\+?|time )?(\d+(?:\.\d+)?)\s*s\b/.exec(t);
      const r = await S.tool('READ_TELEMETRY', { channels: [hit[1]], stat: at ? 'at' : hit[2], ...(at ? { at: Number(at[1]) } : {}) });
      if (!r.ok) return { text: r.message };
      const x = r.data.values[hit[1]];
      return { text: `${at ? `At T+${at[1]} s` : `The ${hit[3]}`} was **${hit[4](x.value)}**${x.t != null && !at ? ` (at T+${fmt(x.t, 0)} s)` : ''}. Read from the recorded telemetry of the last run.` };
    }
    if (hit && !S.ctx.runOrder.length) return { text: 'No simulation has been run yet, so there is no telemetry to read. Say "Test it" first.' };
    if (!S.project.vehicle) return { text: 'The project has no vehicle yet. Ask me to build one.' };
    const d = await S.tool('DESCRIBE_VEHICLE', {});
    if (!d.ok) return { text: d.message };
    const s = d.data.summary;
    const L = [`**${s.name}** (${s.type}): total mass ${fmt(s.totalMass, 0)} kg (dry ${fmt(s.dryMass, 0)} kg, propellant ${fmt(s.propellantMass, 0)} kg${s.payloadMass ? `, payload ${fmt(s.payloadMass, 0)} kg` : ''}); length ${fmt(s.length, 1)} m, diameter ${fmt(s.diameter, 2)} m; ideal vacuum Δv ${fmt(s.dvVacuum, 0)} m/s${s.type === 'rocket' ? `; liftoff thrust-to-weight ${fmt(s.liftoffTWR, 2)}` : ''}.`];
    if (s.stages.length > 1) L.push(list(s.stages.map((st) => `${st.name}: ${fmt(st.propellant, 0)} kg propellant, Δv ${fmt(st.dvVac, 0)} m/s, burn ${fmt(st.burnTime, 0)} s, T/W ${fmt(st.twrStart, 2)}`)));
    for (const i of d.data.issues) L.push(`Warning: ${i.message}`);
    L.push('_Design values come from the vehicle model; flight results only from a simulation._');
    return { text: L.join('\n') };
  }

  concept(text) {
    const c = conceptFor(text);
    if (!c) return { text: 'I have notes on: the rocket equation and Δv, Isp, thrust-to-weight, Max-Q, gravity/drag/steering losses, orbits, Hohmann transfers, staging, escape velocity, drag and Mach, link budgets and the RK4 integrator. Which one?' };
    return { text: `**${c.title}**\n\n\`${c.equation}\`\n\n${c.text}\n\n_This is general physics, not a result from your simulation._`, short: plainConcept(c), links: [{ label: 'Open the lesson', screen: 'academy', params: { lesson: c.lesson } }].filter((l) => l.params.lesson), suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe', 'What can I do next?'] };
  }

  // ==================================================================================================================
  // PROJECT
  // ==================================================================================================================
  undo() { const l = this.S.undo(); return { text: l ? `Undid: ${l}.` : 'Nothing to undo.' }; }
  redo() { const l = this.S.redo(); return { text: l ? `Redid: ${l}.` : 'Nothing to redo.' }; }
  versions() {
    const v = this.S.versions();
    return { text: 'Version history (newest last):\n' + list(v.slice(-12).map((e) => `#${e.n} ${e.label}${e.current ? ' ← current' : ''}`)) + '\nSay "undo" or "redo" to move through it.' };
  }
  async save(text) {
    const m = /(?:save|store)(?: the)?(?: project)?(?: as| called| named)?\s+["“]?([\w][\w .-]{1,50})["”]?$/i.exec(String(text).trim());
    const name = m && !/^(it|project|the project|my work|this)$/i.test(m[1].trim()) ? m[1].trim() : undefined;
    const r = await this.S.tool('SAVE_PROJECT', name ? { name } : {});
    return { text: r.ok ? r.message : `Could not save: ${r.message}` };
  }
  async load(text) {
    const S = this.S;
    if (!S.ctx.storage) return { text: 'No project storage is available in this session.' };
    const projects = await listProjects(S.ctx.storage);
    const t = norm(text);
    const hit = projects.find((p) => t.includes(p.name.toLowerCase()));
    if (!hit) return { text: projects.length ? 'Saved projects:\n' + list(projects.map((p) => `${p.name} (${p.vehicles} vehicles, ${p.runs} runs)`)) + '\nSay "load project <name>".' : 'There are no saved projects yet.' };
    const r = await S.tool('LOAD_PROJECT', { name: hit.name });
    return { text: r.message };
  }
  async exportRun() {
    const S = this.S;
    if (!S.ctx.runOrder.length) return { text: 'There is no simulation run to export yet. Say "Test it" first.' };
    let run;
    try { run = await S.api.getRun(S.lastRunId ?? 'last'); } catch (e) { return { text: e.message }; }
    const rep = buildReport(run.record, run.telemetry, { units: S.project.settings.units });
    const stor = S.ctx.storage;
    const dir = `projects/${slug(S.project.name)}/reports`;
    const files = [];
    if (stor) {
      await stor.writeBinary(`${dir}/${run.id}.pdf`, reportToPDF(rep)); files.push(`${dir}/${run.id}.pdf`);
      await stor.writeText(`${dir}/${run.id}.html`, reportToHTML(rep)); files.push(`${dir}/${run.id}.html`);
      await stor.writeText(`${dir}/${run.id}-telemetry.csv`, run.telemetry.toCSV()); files.push(`${dir}/${run.id}-telemetry.csv`);
      await stor.writeText(`${dir}/${run.id}-metrics.csv`, metricsToCSV(rep.metrics)); files.push(`${dir}/${run.id}-metrics.csv`);
    }
    return { text: stor ? `Exported the report of "${run.record.name}" (${rep.verdict.status}): ${files.join(', ')}. The Reports screen also has a download button for each.` : 'Report built, but no storage is available in this session to write the files. Use the Reports screen to download them.', report: rep };
  }
  async stop() { const r = await this.S.tool('STOP_SIMULATION', {}); return { text: r.message }; }
}

