// "Teach me about …": the offline engineer answers learning questions from the Aerospace Academy content and links to the lesson.
import { allLessons, COMPONENT_INFO } from '../data/academy/index.js';
import { KIND_LABELS } from '../data/components.js';
import { conceptFor } from './knowledge.js';
import { shortOf, cap } from './plain.js';
const twoSentences = (t, n = 22) => cap(String(t ?? '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 2).join(' '), n);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const CUE = /\b(teach me|teach|learn|lesson|academy|tutorial|what is|what are|what does|what do|explain|how does|how do|tell me about|why do|why does)\b/;
const NOT_ABOUT_RUN = /\b(fail|failed|happened|went wrong|last run|this run|my run|test it|fix it|compare|simulate|build me|design me)\b/;
const STOP = new Set('what does this that with from into your have make about rocket rockets space work works explain teach learn lesson tell mean means much many how why the and for are you can when which their there'.split(' '));

const stem = (w) => w.replace(/(ing|es|s)$/, '');
let index;
function build() {
  if (index) return index;
  const comps = Object.entries(COMPONENT_INFO).map(([kind, c]) => ({ kind, c, names: [...new Set([c.name, KIND_LABELS[kind], kind.replace(/_/g, ' ')].filter(Boolean).map(norm))] }));
  const lessons = allLessons().map((l) => ({ l, title: norm(l.title), tw: new Set(norm(l.title).split(' ').filter((w) => w.length > 3 && !STOP.has(w)).map(stem)), words: new Set(norm(l.tagline).split(' ').filter((w) => w.length > 3 && !STOP.has(w)).map(stem)) }));
  index = { comps, lessons }; return index;
}

/** @returns {{text:string, suggestions:string[], links:{label:string, screen:string, params:object}[]} | null} */
export function teachReply(text) {
  const t = norm(text);
  const explicit = /^(teach me|teach|tell me about|learn about|lesson|academy)\b/.test(t);
  if (!explicit && (!CUE.test(t) || NOT_ABOUT_RUN.test(t))) return null;
  if (!explicit && conceptFor(text)) return null; // the built-in concept notes answer those
  const { comps, lessons } = build();
  const padded = ` ${t} `;
  // component?
  let best = null;
  for (const e of comps) for (const n of e.names) {
    if (n.length < 4) continue;
    if ([n, `${n}s`, `${n}es`, n.replace(/y$/, 'ies')].some((v) => padded.includes(` ${v} `))) { if (!best || n.length > best.len) best = { e, len: n.length }; }
  }
  if (best) {
    const c = best.e.c;
    return {
      text: `**${c.name}** (${c.group})\n\n${c.whatItDoes}\n\n**How it works:** ${c.howItWorks[0]}\n\n**Why it matters:** ${c.whyItMatters}\n\n_Tip: ${c.tryIt}_`,
      short: shortOf(`**${c.name}**`.replace('  ', ' '), [twoSentences(c.whatItDoes), `Try it: ${cap(String(c.tryIt ?? '').replace(/^Try( it)?:?\s*/i, ''), 16)}`].filter((x) => !/Try it: $/.test(x)), 44),
      suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe.', ...(c.related ?? []).slice(0, 2).filter((r) => COMPONENT_INFO[r]).map((r) => `Teach me about the ${COMPONENT_INFO[r].name.toLowerCase()}`)],
      links: [{ label: `Open the lesson: ${c.name}`, screen: 'academy', params: { component: best.e.kind } }],
    };
  }
  // lesson?
  const q = t.split(' ').filter((w) => w.length > 3 && !STOP.has(w)).map(stem);
  let top = null, second = 0;
  for (const e of lessons) {
    let score = 0;
    if (t.includes(e.title)) score += 10;
    for (const w of q) { if (e.tw.has(w)) score += 2; else if (e.words.has(w)) score += 1; }
    if (!top || score > top.score) { second = top?.score ?? 0; top = { e, score }; } else if (score > second) second = score;
  }
  if (!top || top.score < 2) {
    if (!explicit) return null;
    return { short: shortOf('**I could not find that lesson.**', ['Open the Academy to browse all lessons.', 'Or ask: “Teach me about staging”.']), text: 'I could not find a lesson for that. Open the **Aerospace Academy** to browse all 11 levels, or ask about a specific topic such as “Teach me about staging” or “Teach me about the fuel tank”.', suggestions: ['Teach me about staging', 'Teach me about orbits', 'Teach me about the engine'], links: [{ label: 'Open the Academy', screen: 'academy', params: {} }] };
  }
  const l = top.e.l;
  const eq = l.equations?.[0];
  return {
    text: `**${l.title}** — Level ${l.level.n}: ${l.level.title}\n\n${l.definition}\n\n**Why it matters:** ${l.why}${eq ? `\n\n\`${eq.formula}\`  (${eq.name})` : ''}\n\n${l.explain[0]}`,
    suggestions: ['Build me a two-stage rocket carrying a 100 kg space probe.', 'Test it.'],
    short: shortOf(`**${l.title}**`, [twoSentences(l.definition), cap(`Why it matters: ${String(l.why).replace(/\s+/g, ' ')}`, 22)], 44),
    links: [{ label: 'Open the lesson', screen: 'academy', params: { lesson: l.id } }],
  };
}
