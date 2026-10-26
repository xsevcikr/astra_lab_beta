// "In plain words" one-line headlines for the Beginner mode of the AI helper. Every number comes from the data of the reply
// (recorded run metrics, the previewed design, the comparison), nothing is invented. Each headline has at most 25 words.
import { getBody } from '../physics/bodies.js';

const num = (x, d = 0) => (Number.isFinite(x) ? Number(x).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : null);
/** At most `n` words; cut at a sentence end when possible. */
export function cap(text, n = 25) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= n) return words.join(' ');
  const cut = words.slice(0, n).join(' ');
  const dot = cut.lastIndexOf('. ');
  return dot > 20 ? cut.slice(0, dot + 1) : `${cut.replace(/[,;:(\s]+$/, '')}…`;
}
const firstSentence = (t) => String(t ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0];
/** Average orbital speed of a (nearly) circular orbit, km/s, from the real final periapsis and apoapsis. */
function orbitSpeedKmS(bodyId, peri, apo) {
  try { const B = getBody(bodyId ?? 'earth'); return Math.sqrt(B.mu / (B.radius + (peri + apo) / 2)) / 1000; } catch { return null; }
}

/** Headline for a finished simulation. R: ANALYZE_RESULTS data {status, reason, metrics}; mission: its mission record. */
export function plainRun(R, mission) {
  if (!R) return null;
  const m = R.metrics ?? {}, obj = mission?.objective ?? {};
  if (R.status === 'SUCCESS') {
    if (obj.type === 'orbit' && Number.isFinite(m.finalPeri) && Number.isFinite(m.finalApo)) {
      const v = orbitSpeedKmS(obj.body, m.finalPeri, m.finalApo);
      return cap(`Your rocket reached orbit: ${num((m.finalPeri + m.finalApo) / 2000)} km up${v ? ` at ${num(v, 1)} km/s` : ''}.`);
    }
    if (m.touchdownVertical != null) return cap(`It landed softly, touching down at ${num(m.touchdownVertical, 1)} m/s.`);
    if (m.distanceDriven != null) return cap(`It worked! The rover drove ${num(m.distanceDriven)} m.`);
    return cap(`It worked! ${R.reason ?? ''}`);
  }
  const up = mission?.initial?.type === 'pad' && m.maxAlt > 1000 ? ` It climbed to ${num(m.maxAlt / 1000)} km.` : '';
  return cap(`It did not reach its goal.${up} ${R.reason ?? ''}`);
}

/** Headline for "Why did it fail?". root: the picked root-cause failure (or null when nothing failed). */
export function plainExplain(R, root, mission) {
  if (!R) return null;
  if (!root) return cap(`Nothing went wrong. ${plainRun(R, mission)}`);
  return cap(`The main problem: ${String(root.title).replace(/\.$/, '')}. ${firstSentence(root.cause)}`);
}

/** Headline for a design proposal (build, edit or fix). pend: {plan, preview}. */
export function plainProposal(pend, mode = 'build') {
  const s = pend?.preview?.summary, b = pend?.preview?.before, title = pend?.plan?.title ?? 'a new design';
  if (!pend?.preview?.ok) return 'This plan has a problem, so nothing can be applied yet.';
  if (!s) return cap(`My plan: ${title}. Nothing changes until you say yes.`);
  if (mode === 'fix') {
    const dv = Number.isFinite(s.dvVacuum) && b && Number.isFinite(b.dvVacuum) ? ` The speed budget goes from ${num(b.dvVacuum)} to ${num(s.dvVacuum)} m/s.` : '';
    return cap(`Fix idea: ${title}.${dv} Nothing changes until you say yes.`);
  }
  const t = Number.isFinite(s.totalMass) ? `It weighs ${num(s.totalMass / 1000, 1)} tonnes` : 'It is ready';
  const pl = s.payloadMass ? ` and carries ${num(s.payloadMass)} kg` : '';
  return cap(`My plan: ${s.type === 'rocket' ? 'a rocket' : `a ${s.type ?? 'vehicle'}`}. ${t}${pl}. Nothing changes until you say yes.`);
}

/** Headline after a plan was applied. */
export const plainApplied = (title) => cap(`Done: ${title}. Now say “Test it” to launch it.`);

/** Headline for a comparison of two runs (statuses are the real ones). */
export function plainCompare(cmp) {
  if (!cmp) return null;
  if (cmp.statusA !== 'SUCCESS' && cmp.statusB === 'SUCCESS') return 'The change worked: the mission failed before and now it succeeds.';
  if (cmp.statusA === 'SUCCESS' && cmp.statusB === 'SUCCESS') return 'Both flights worked. Check the table to see which was better.';
  if (cmp.statusB !== 'SUCCESS') return 'Still not working. The table shows which numbers moved.';
  return 'The new flight is worse than the old one.';
}

// =====================================================================================================================
// "short" replies: what a 15-year-old reads first. At most ~34 words: a headline with a status emoji, 2-4 key points in plain
// words (kid-friendly units, a comparison where it helps) and nothing else. The full technical answer stays in `text`.
// Every number comes from recorded results or from the vehicle model, nothing is invented.
// =====================================================================================================================
import { plainFailure } from '../src/core/studentreport.js';

export const wordCount = (t) => String(t ?? '').replace(/[*_`#>|-]/g, ' ').split(/\s+/).filter(Boolean).length;
/** Headline + bullet lines, dropping trailing bullets until at most `max` words. Lines starting with "1)" stay as they are. */
export function shortOf(head, bullets = [], max = 34) {
  const items = bullets.filter(Boolean);
  const make = () => [head, ...items.map((b) => (/^\d+\)/.test(b) ? b : `- ${b}`))].join('\n');
  while (items.length > 1 && wordCount(make()) > max) items.pop();
  return make();
}
/** Safety net for replies without a hand-written `short`: the first one or two sentences of the text, without markdown. */
export function autoShort(text, max = 45) {
  const plain = String(text ?? '').replace(/^#+\s*/gm, '').replace(/\|[^\n]*\|/g, ' ').replace(/[*_`]/g, '').split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!plain.length) return '';
  const first = plain[0].replace(/^[-•]\s*/, '');
  const sentences = first.split(/(?<=[.!?])\s+/);
  return cap(sentences.slice(0, 2).join(' '), max);
}

const kmh = (ms) => `${num(ms * 3.6)} km/h`;
const SOUND = 343; // m/s, speed of sound at sea level
function speedText(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const ratio = ms / SOUND;
  return `${kmh(ms)}${ratio >= 2 ? ` (about ${num(ratio)}× the speed of sound)` : ''}`;
}
function altText(m) {
  if (!Number.isFinite(m)) return null;
  const km = m / 1000;
  const cmp = km >= 100 ? ' (space starts at 100 km)' : km >= 9 ? ' (higher than airliners fly)' : '';
  return `${num(km, km < 10 ? 1 : 0)} km${cmp}`;
}

/** What to do about each kind of failure, in plain words (used by "Why did it fail?"). */
const TRY = {
  INSUFFICIENT_DELTA_V: 'Give it more fuel or a stronger top stage.', INCORRECT_ORBIT: 'Change the climb path or add a little fuel.', UPPER_STAGE_TWR: 'Add an engine to the top stage.',
  PROPELLANT_DEPLETION: 'Add more fuel to the stage that ran dry.', MAX_Q_EXCEEDED: 'Make the rocket stronger or climb more gently.', EXCESSIVE_ACCELERATION: 'Use a bigger stage or fewer engines.',
  STRUCTURAL_OVERLOAD: 'Make the rocket stronger or climb more gently.', OVERTEMPERATURE: 'Add a radiator.', UNDERTEMPERATURE: 'Add a heater.',
  LOSS_OF_CONTROL: 'Change the climb path.', POWER_FAILURE: 'Add a bigger battery or solar panel.', COMM_FAILURE: 'Add a bigger antenna.',
  ROVER_ROLLOVER: 'Make the rover wider.', ROVER_IMMOBILISED: 'Use bigger wheels or a stronger motor.',
};

/** Test result: SUCCESS / FAILURE headline, highest point, top speed, orbit, what went well or wrong, next action. */
export function plainRunSummary(R, mission, root = null) {
  if (!R) return null;
  const m = R.metrics ?? {}, obj = mission?.objective ?? {}, ok = R.status === 'SUCCESS';
  const pad = mission?.initial?.type === 'pad';
  const goal = obj.type === 'orbit' ? 'orbit' : m.touchdownVertical != null || obj.type === 'land' ? 'landing' : m.distanceDriven != null ? 'drive' : 'goal';
  const head = ok ? `**SUCCESS!** ${goal === 'orbit' ? 'Your rocket reached orbit.' : goal === 'landing' ? 'It landed safely.' : goal === 'drive' ? 'The rover made it.' : 'The mission worked.'}`
    : `**FAILURE.** ${goal === 'orbit' ? 'It did not reach orbit.' : goal === 'landing' ? 'The landing failed.' : goal === 'drive' ? 'The rover did not make it.' : 'The mission did not work.'}`;
  const B = [];
  if (pad && m.maxAlt > 1000) B.push(`Highest point: ${altText(m.maxAlt)}`);
  if (m.maxSpeed > 0 && pad) B.push(`Top speed: ${speedText(m.maxSpeed)}`);
  if (obj.type === 'orbit' && Number.isFinite(m.finalPeri) && Number.isFinite(m.finalApo)) B.push(`Orbit: ${num(m.finalPeri / 1000)} to ${num(m.finalApo / 1000)} km up`);
  if (m.touchdownVertical != null) B.push(`Touchdown speed: ${num(m.touchdownVertical, 1)} m/s (${m.touchdownVertical < 3 ? 'a gentle landing' : 'a hard landing'})`);
  if (m.distanceDriven != null) B.push(`Distance driven: ${num(m.distanceDriven)} m`);
  if (ok) {
    if (m.lastStageReserveFrac != null && m.lastStageReserveFrac > 0) B.push(`Went well: ${num(100 * m.lastStageReserveFrac)}% of the last fuel was still left`);
    else B.push('Went well: everything stayed inside its safe limits');
  } else {
    const f = root ?? (R.failures ?? []).find((x) => x.severity !== 'minor') ?? R.failures?.[0];
    B.push(`Went wrong: ${f ? plainFailure(f) : cap(R.reason, 14)}`);
  }
  return shortOf(head, B.slice(0, 4));
}

/** "Why did it fail?": What happened / Why it happened / What to try, one sentence each. */
export function plainFailureShort(R, root, mission) {
  if (!R) return null;
  if (!root) return shortOf(`**Nothing went wrong.** ${plainRunSummary(R, mission).split('\n')[0].replace(/^\*\*SUCCESS!\*\* /, '')}`, ['Want to push it further? Try a heavier payload.']);
  const happened = cap(R.reason || root.title, 16);
  return shortOf('**Here is what I found**', [`**What happened:** ${happened}`, `**Why:** ${plainFailure(root)}`, `**What to try:** ${TRY[root.code] ?? 'Press “Fix it” and I will suggest a change.'}`]);
}

/** Friendly name for one plan step (no tool names, no JSON). */
function friendlyStep(c, pend, stageN) {
  const a = c.args ?? {};
  const stageNo = (id) => { const n = /(\d+)/.exec(String(id ?? ''))?.[1]; return n ? `Stage ${n}` : 'The stage'; };
  switch (c.tool) {
    case 'CREATE_PROBE': return `add a ${num(a.mass)} kg probe`;
    case 'CREATE_ROVER': return `make a ${num(a.mass)} kg rover`;
    case 'CREATE_LANDER': return a.carryRover ? 'make a lander that carries a rover' : 'make a lander';
    case 'CREATE_VEHICLE': return a.type === 'rocket' ? `make a ${['', 'one', 'two', 'three'][stageN] ?? stageN}-stage rocket` : `make a ${a.type ?? 'spacecraft'}`;
    case 'CREATE_STAGE': return null; // folded into the rocket step
    case 'ADD_PAYLOAD': return null; // folded into the probe step
    case 'CREATE_MISSION': {
      const alt = a.altitude ?? pend?.preview?.mission?.objective?.altitude;
      if (a.kind === 'launch') return `set the goal to ${num((alt ?? 200000) / 1000)} km orbit`;
      if (a.kind === 'rover') return `set the goal: drive ${num(a.distance ?? 200)} m on the ${a.body === 'mars' ? 'Mars' : 'Moon'}`;
      if (a.kind === 'landing') return `set the goal: land on the ${a.body === 'mars' ? 'Mars' : 'Moon'}`;
      if (a.kind === 'probe_operations') return 'set the goal: run the probe in orbit';
      if (a.kind === 'orbit_raise') return 'set the goal: go to a higher orbit';
      return 'set the goal for the mission';
    }
    case 'MODIFY_STAGE': {
      const bits = [];
      if (a.propellantScale) bits.push(a.propellantScale >= 1 ? `add ${num((a.propellantScale - 1) * 100)}% fuel` : `remove ${num((1 - a.propellantScale) * 100)}% fuel`);
      if (a.propellantMass) bits.push(`set the fuel to ${num(a.propellantMass)} kg`);
      if (a.engineCount) bits.push(`use ${a.engineCount} engine${a.engineCount > 1 ? 's' : ''}`);
      return `${stageNo(a.stage)}: ${bits.join(' and ') || 'change it'}`;
    }
    case 'MODIFY_MISSION': return a.altitude ? `set the goal to ${num(a.altitude / 1000)} km orbit` : a.schedule ? 'use a better climb path' : 'change the mission goal';
    default: return cap(firstSentence(c.why) || String(c.tool).replace(/_/g, ' ').toLowerCase(), 12).replace(/\.$/, '');
  }
}
/** Friendly step list of a plan: ['make a two-stage rocket', 'add a 100 kg probe', 'set the goal to 200 km orbit']. */
export function planSteps(pend) {
  const calls = pend?.plan?.calls ?? [];
  const stageN = calls.filter((c) => c.tool === 'CREATE_STAGE').length;
  const out = [];
  for (const c of calls) { const s = friendlyStep(c, pend, stageN); if (s && !out.includes(s)) out.push(s); }
  return out;
}

/** Build / edit / fix proposal: "I will: 1) … 2) …" and one key number. No tool names, no JSON. */
export function plainPlan(pend, mode = 'build') {
  if (!pend?.preview?.ok) return { short: '**This plan has a problem.** Nothing was changed. Tell me what to adjust, or cancel.', steps: [] };
  const steps = planSteps(pend);
  const s = pend.preview.summary, b = pend.preview.before;
  const head = mode === 'fix' ? '**Here is my fix idea.** Nothing changes until you say yes.' : mode === 'edit' ? '**Here is the change.** Nothing changes until you say yes.' : '**Here is my plan.** Nothing changes until you say yes.';
  const lines = [`**I will:**`, ...steps.slice(0, 4).map((x, i) => `${i + 1}) ${x}`)];
  if (steps.length > 4) lines.push(`…and ${steps.length - 4} more`);
  const B = [];
  if (s && Number.isFinite(s.totalMass)) {
    if (mode === 'fix' && b && Number.isFinite(b.totalMass) && Math.abs(b.totalMass - s.totalMass) > 1) B.push(`Weight: ${num(b.totalMass / 1000, 1)} to ${num(s.totalMass / 1000, 1)} tonnes`);
    else B.push(`It will weigh about ${num(s.totalMass / 1000, 1)} tonnes`);
  }
  return { short: shortOf(head, [...lines, ...B], 44), steps };
}

/** Plan applied. */
export const plainAppliedShort = (title) => shortOf(`**Done!** ${cap(title, 10).replace(/\.$/, '')}.`, ['Next step: launch it with “Test it”.']);

const CMP = { finalPeri: ['Lowest point of the orbit', (x) => `${num(x / 1000)} km`], finalApo: ['Highest point of the orbit', (x) => `${num(x / 1000)} km`], initialMass: ['Weight', (x) => `${num(x / 1000, 1)} tonnes`], propellantUsed: ['Fuel used', (x) => `${num(x)} kg`], maxG: ['Biggest squeeze', (x) => `${num(x, 1)} g`], touchdownVertical: ['Landing speed', (x) => `${num(x, 1)} m/s`], distanceDriven: ['Distance driven', (x) => `${num(x)} m`], dvIdeal: ['Speed the engines made', (x) => `${num(x)} m/s`] };
/** Compare: winner sentence and the 3 numbers that changed most (rows come from COMPARE_SIMULATIONS). */
export function plainCompareShort(cmp) {
  if (!cmp) return null;
  const head = plainCompare(cmp);
  const rows = (cmp.rows ?? []).filter((r) => CMP[r.key] && Number.isFinite(r.a) && Number.isFinite(r.b));
  const changed = rows.filter((r) => r.a !== r.b).sort((x, y) => Math.abs(y.b - y.a) / (Math.abs(y.a) + 1e-9) - Math.abs(x.b - x.a) / (Math.abs(x.a) + 1e-9));
  const B = changed.slice(0, 3).map((r) => `${CMP[r.key][0]}: ${CMP[r.key][1](r.a)} to ${CMP[r.key][1](r.b)}`);
  return shortOf(head, B.length ? B : ['The key numbers did not change.']);
}

/** Two sentences of definition + a real-life example for the built-in concept notes. */
const EXAMPLES = {
  'rocket-equation': 'Example: to go 2 times faster, a rocket needs far more than 2 times the fuel.', isp: 'Example: a high-Isp engine is like a car that drives far on one tank.',
  twr: 'Example: a rocket that weighs 10 tonnes needs more than 10 tonnes of push to leave the ground.', maxq: 'Example: it is like putting your hand out of a fast car. The push is strongest at high speed in thick air.',
  'gravity-loss': 'Example: climbing straight up for a long time wastes push fighting gravity.', orbit: 'Example: the space station falls around Earth every 90 minutes and never lands.',
  hohmann: 'Example: two short engine burns take a satellite from a low orbit to a high one.', staging: 'Example: dropping empty tanks is like a runner dropping a heavy backpack.',
  escape: 'Example: to leave Earth for good you need about 40,000 km/h.', drag: 'Example: a rocket pushes through air like a swimmer through water.',
  link: 'Example: a bigger antenna hears a weaker signal from farther away.', integrator: 'Example: the simulator moves the rocket forward in tiny time steps.',
};
export function plainConcept(c) {
  if (!c) return null;
  const sentences = String(c.text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  const title = String(c.title).replace(/^Delta-v and the Tsiolkovsky rocket equation$/, 'Delta-v (how much speed change a rocket can make)');
  return shortOf(`**${title}**`, [cap(sentences, 22), EXAMPLES[c.id]].filter(Boolean), 44);
}

/** Help: the short list of things to ask (chips). */
export const HELP_CHIPS = ['Build me a two-stage rocket carrying a 100 kg space probe', 'Test it', 'Why did it fail?', 'What is delta-v?', 'What can I do next?'];
export const HELP_SHORT = shortOf('**I can help with 5 things:**', ['**Build** a rocket, rover or lander', '**Test** it in the real simulator', '**Explain** why it failed', '**Fix** it for you', '**Teach** you rocket science'], 30);
