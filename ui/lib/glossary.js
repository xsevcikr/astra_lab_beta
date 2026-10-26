// Glossary: plain-words explanations (15-year-old level, <= 18 words) of the jargon that Beginner screens still have to show.
// gloss('TWR') returns a small inline element: dotted underline, tooltip (title) and a click popover with a "Learn more" link to the lesson.
import { h } from './dom.js';
import { GLOSSARY as ACADEMY_GLOSSARY, glossaryLookup } from '../../data/academy/glossary.js';

let appRef = null;
/** Called once from main.js so the popover can open Academy lessons. */
export function setGlossaryApp(app) { appRef = app; startAutoDecorate(); }

// term, simple explanation, lesson id in the Academy (optional), other spellings (optional)
export const GLOSSARY = [
  { term: 'delta-v', simple: 'How much a rocket can change its speed. It is the fuel budget of a mission.', lessonId: 'L3-2', aka: ['dv', 'Δv', 'delta v'] },
  { term: 'thrust', simple: 'The push of the engines. The rocket goes up because the engines push it up.', lessonId: 'L3-1' },
  { term: 'TWR', simple: 'Thrust divided by weight. Above 1 the rocket can lift off. Below 1 it stays on the ground.', lessonId: 'L3-4', aka: ['thrust-to-weight', 'thrust/weight', 'thrust to weight', 'thrust-to-weight ratio', 'T/W'] },
  { term: 'Isp', simple: 'How efficiently an engine uses fuel. Higher Isp means more speed from the same fuel.', lessonId: 'L4-1', aka: ['specific impulse'] },
  { term: 'Max-Q', simple: 'The moment in the climb when the air pushes hardest on the rocket.', lessonId: 'L5-2', aka: ['max q', 'maxq'] },
  { term: 'dynamic pressure', simple: 'How hard the moving air pushes on the rocket. It grows with speed and thick air.', lessonId: 'L5-2', aka: ['q'] },
  { term: 'apogee', simple: 'The highest point of an orbit. The craft is slowest there.', lessonId: 'L7-2', aka: ['apoapsis', 'apo'] },
  { term: 'perigee', simple: 'The lowest point of an orbit. The craft is fastest there.', lessonId: 'L7-2', aka: ['periapsis', 'peri'] },
  { term: 'orbit', simple: 'Falling around a planet without ever hitting it, because you are moving sideways fast enough.', lessonId: 'L7-1' },
  { term: 'payload', simple: 'The thing the rocket carries, like a satellite or a space probe.', lessonId: 'L1-4' },
  { term: 'fairing', simple: 'The nose cover that protects the payload while the rocket flies through air.', lessonId: 'L1-4' },
  { term: 'stage', simple: 'One section of a rocket with its own engines and fuel. It drops off when empty.', lessonId: 'L3-3', aka: ['stages'] },
  { term: 'staging', simple: 'Dropping an empty stage so the rest of the rocket is lighter and goes faster.', lessonId: 'L3-3' },
  { term: 'propellant', simple: 'The fuel and oxidizer that a rocket burns to make thrust.', lessonId: 'L4-1', aka: ['fuel'] },
  { term: 'oxidizer', simple: 'The part of the propellant that lets fuel burn. Space has no air, so rockets carry their own.', lessonId: 'L4-1' },
  { term: 'LOX', simple: 'Liquid oxygen. Super cold oxygen that rockets use as oxidizer.', lessonId: 'L4-1', aka: ['liquid oxygen'] },
  { term: 'RP-1', simple: 'A kind of kerosene, like jet fuel, made for rockets.', lessonId: 'L4-1', aka: ['kerosene', 'kerolox'] },
  { term: 'gimbal', simple: 'Swivelling an engine a little to steer the rocket.', lessonId: 'L9-3', aka: ['gimbaling'] },
  { term: 'TVC', simple: 'Thrust vector control: steering the rocket by pointing its engine push in another direction.', lessonId: 'L9-3', aka: ['thrust vector control'] },
  { term: 'telemetry', simple: 'Measurements the rocket sends back while it flies: height, speed, fuel and more.', lessonId: 'L9-1' },
  { term: 'attitude', simple: 'Which way the rocket is pointing in space.', lessonId: 'L6-4' },
  { term: 'pitch', simple: 'Tilting the nose up or down, like a plane climbing.', lessonId: 'L6-4' },
  { term: 'yaw', simple: 'Turning the nose left or right.', lessonId: 'L6-4' },
  { term: 'roll', simple: 'Spinning around the long axis of the rocket, like a corkscrew.', lessonId: 'L6-4' },
  { term: 'g-force', simple: 'How heavy you feel. 1 g is normal weight. 3 g feels three times heavier.', lessonId: 'L2-1', aka: ['g', 'g-load', 'gload'] },
  { term: 'drag', simple: 'Air rubbing against the rocket and slowing it down.', lessonId: 'L5-2' },
  { term: 'gravity turn', simple: 'Letting gravity slowly bend the climb from straight up to sideways. It saves fuel.', lessonId: 'L6-2' },
  { term: 'pitch program', simple: 'The plan for how the rocket tilts over from straight up to sideways.', lessonId: 'L6-2', aka: ['pitch programme'] },
  { term: 'MECO', simple: 'Main engine cut-off. The moment the first-stage engines switch off.', lessonId: 'L3-3' },
  { term: 'SECO', simple: 'Second engine cut-off. The moment the upper-stage engine switches off.', lessonId: 'L3-3' },
  { term: 'mass ratio', simple: 'Full rocket weight divided by empty rocket weight. Bigger means more speed.', lessonId: 'L3-3' },
  { term: 'rocket equation', simple: 'The formula that links fuel, rocket weight and the speed the rocket can reach.', lessonId: 'L3-2' },
  { term: 'escape velocity', simple: 'The speed needed to leave a planet for good and never fall back.', lessonId: 'L7-4' },
  { term: 'Hohmann transfer', simple: 'The fuel-saving way to move from one circular orbit to another using two burns.', lessonId: 'L7-3' },
  { term: 'circularize', simple: 'Burning the engine at the top of the climb so the orbit becomes a round circle.', lessonId: 'L7-3', aka: ['circularise', 'circularization'] },
  { term: 'eccentricity', simple: 'How squashed an orbit is. 0 is a perfect circle.', lessonId: 'L7-2' },
  { term: 'inclination', simple: 'How tilted an orbit is compared with the equator.', lessonId: 'L7-4' },
  { term: 'LEO', simple: 'Low Earth orbit: a few hundred kilometres up, where the space station flies.', lessonId: 'L7-1', aka: ['low earth orbit'] },
  { term: 'GEO', simple: 'Geostationary orbit: so high that a satellite stays above the same spot on Earth.', lessonId: 'L7-4', aka: ['geostationary'] },
  { term: 'Mach', simple: 'Speed compared with the speed of sound. Mach 2 is twice as fast as sound.', lessonId: 'L5-4' },
  { term: 'supersonic', simple: 'Faster than the speed of sound.', lessonId: 'L5-4' },
  { term: 're-entry', simple: 'Coming back into the air from space. The air gets very hot because of the speed.', lessonId: 'L8-4', aka: ['reentry'] },
  { term: 'heat shield', simple: 'A layer that protects a spacecraft from the heat of re-entry.', lessonId: 'L5-4' },
  { term: 'nozzle', simple: 'The bell at the back of an engine. It shapes the hot gas so it pushes harder.', lessonId: 'L4-2' },
  { term: 'turbopump', simple: 'A fast pump that pushes fuel into the engine.', lessonId: 'L4-3' },
  { term: 'solid rocket', simple: 'A rocket whose fuel is a solid block. Simple and strong, but you cannot switch it off.', lessonId: 'L4-3' },
  { term: 'liquid rocket', simple: 'A rocket that burns liquid fuel from tanks. You can throttle it and restart it.', lessonId: 'L4-3' },
  { term: 'ion engine', simple: 'An engine with a very gentle push that runs for months. Super efficient.', lessonId: 'L4-4', aka: ['ion thruster'] },
  { term: 'vacuum', simple: 'Empty space with no air.', lessonId: 'L1-2' },
  { term: 'atmosphere', simple: 'The layer of air around a planet. It gets thinner the higher you go.', lessonId: 'L1-2' },
  { term: 'air pressure', simple: 'How hard the air pushes. It drops quickly as you climb.', lessonId: 'L5-1' },
  { term: 'gravity', simple: 'The pull of a planet. It pulls everything down towards its centre.', lessonId: 'L2-1' },
  { term: 'mass', simple: 'How much stuff something is made of, measured in kilograms.', lessonId: 'L2-1' },
  { term: 'weight', simple: 'How hard gravity pulls on something.', lessonId: 'L2-1' },
  { term: 'velocity', simple: 'Speed together with direction.', lessonId: 'L2-3', aka: ['speed'] },
  { term: 'acceleration', simple: 'How fast your speed changes. Pushing harder gives more acceleration.', lessonId: 'L2-3' },
  { term: 'momentum', simple: 'How hard something is to stop: its mass times its speed.', lessonId: 'L2-3' },
  { term: 'kinetic energy', simple: 'The energy of movement. Faster and heavier means more.', lessonId: 'L2-4' },
  { term: "Newton's third law", simple: 'Every push has an equal push back. The rocket pushes gas down, the gas pushes the rocket up.', lessonId: 'L2-2' },
  { term: 'avionics', simple: 'The electronics and computers of a rocket or spacecraft.', lessonId: 'L1-4' },
  { term: 'guidance', simple: 'The computer brain that decides where to steer.', lessonId: 'L9-1' },
  { term: 'navigation', simple: 'Working out where the vehicle is and how fast it moves.', lessonId: 'L9-1' },
  { term: 'GNC', simple: 'Guidance, navigation and control: knowing where you are, deciding where to go and steering there.', lessonId: 'L9-1' },
  { term: 'sensor', simple: 'A device that measures something, like speed, height or direction.', lessonId: 'L9-1' },
  { term: 'PID', simple: 'A simple steering rule that keeps correcting a small error until it is gone.', lessonId: 'L9-2' },
  { term: 'reaction wheel', simple: 'A spinning wheel inside a spacecraft. Changing its spin turns the craft without fuel.', lessonId: 'L9-3' },
  { term: 'angle of attack', simple: 'The angle between the rocket nose and the air flowing past it.', lessonId: 'L6-4', aka: ['aoa'] },
  { term: 'stability', simple: 'How well a rocket keeps pointing the right way instead of tumbling.', lessonId: 'L5-3' },
  { term: 'fins', simple: 'Small wings at the bottom of a rocket that keep it flying straight.', lessonId: 'L5-3', aka: ['fin'] },
  { term: 'center of mass', simple: 'The balance point of the rocket.', lessonId: 'L5-3', aka: ['centre of mass'] },
  { term: 'solar panel', simple: 'A panel that turns sunlight into electricity.', lessonId: 'L8-2', aka: ['solar panels'] },
  { term: 'battery', simple: 'Stores electricity for when the Sun is not shining.', lessonId: 'L8-2' },
  { term: 'antenna', simple: 'Sends and receives radio signals, so the craft can talk to Earth.', lessonId: 'L8-3' },
  { term: 'signal delay', simple: 'Radio waves need time to travel. Far from Earth, messages arrive minutes late.', lessonId: 'L8-3' },
  { term: 'rover', simple: 'A robot car that drives on the Moon or Mars.', lessonId: 'L8-4' },
  { term: 'lander', simple: 'A spacecraft built to touch down softly on the Moon or a planet.', lessonId: 'L8-4' },
  { term: 'probe', simple: 'A robot spacecraft with instruments that explores space.', lessonId: 'L1-4' },
  { term: 'mission', simple: 'The plan of a flight: where to go and what to do there.', lessonId: 'L10-1' },
  { term: 'launch window', simple: 'The best time to launch so the rocket can reach its target.', lessonId: 'L10-1' },
  { term: 'mass budget', simple: 'A list of how heavy every part may be, so the total stays within the limit.', lessonId: 'L10-2' },
  { term: 'margin', simple: 'Extra safety room. More than you need, just in case.', lessonId: 'L10-2' },
  { term: 'redundancy', simple: 'A backup part, so one failure does not end the mission.', lessonId: 'L11-2' },
  { term: 'Monte Carlo', simple: 'Flying the same mission many times with small random changes to see how often it works.', lessonId: 'L11-3' },
  { term: 'safety factor', simple: 'How much stronger a part is built than it needs to be.', lessonId: 'L11-3' },
  { term: 'trajectory', simple: 'The path the rocket follows through the sky.', lessonId: 'L6-1' },
  { term: 'ascent', simple: 'The climb from the launch pad up to orbit.', lessonId: 'L6-1' },
  { term: 'burn', simple: 'Switching an engine on for a while to change speed.', lessonId: 'L7-3' },
  { term: 'coast', simple: 'Flying with the engines off. Nothing pushes, only gravity pulls.', lessonId: 'L6-1' },
  { term: 'liftoff', simple: 'The moment the rocket leaves the ground.', lessonId: 'L3-4', aka: ['lift-off'] },
  { term: 'suborbital', simple: 'Goes up into space but falls back down. It does not go fast enough to orbit.', lessonId: 'L7-1' },
  { term: 'tank', simple: 'A container that holds the fuel or the oxidizer.', lessonId: 'L4-1' },
  { term: 'engine', simple: 'The part that burns propellant and makes the push.', lessonId: 'L3-1' },
  { term: 'go/no-go', simple: 'The final check before launch. Every team says GO or NO-GO.', lessonId: 'L10-3', aka: ['go / no-go', 'go or no-go'] },
  { term: 'structure', simple: 'The frame and skin of the rocket that hold everything together.', lessonId: 'L8-1', aka: ['structures'] },
  { term: 'propulsion', simple: 'Everything that makes the rocket move: engines, tanks and pipes.', lessonId: 'L3-1' },
];

const INDEX = new Map();
for (const g of GLOSSARY) { INDEX.set(norm(g.term), g); for (const a of g.aka ?? []) INDEX.set(norm(a), g); }
function norm(s) { return String(s ?? '').toLowerCase().replace(/[\s_]+/g, ' ').trim(); }

/** Find a glossary entry by term or alias; null when unknown. */
export function findTerm(term) {
  const own = INDEX.get(norm(term)); if (own) return own;
  const g = glossaryLookup(term);   // the longer Academy glossary (data/academy/glossary.js) fills the gaps
  return g ? { term: g.term, simple: g.def, lessonId: g.lesson ?? null, aka: g.aka } : null;
}

const STOP = new Set(['q', 'g', 'dv', 'alpha', 'peri', 'apo', 'fuel', 'height', 'orientation', 'pump', 'structure', 'structures', 'engine', 'tank', 'weight', 'stage', 'stages']);
let MATCHER = null;
function matcher() {
  if (MATCHER) return MATCHER;
  const map = new Map();
  for (const e of ACADEMY_GLOSSARY) for (const w of [e.term, ...e.aka]) map.set(norm(w), e.term);
  for (const e of GLOSSARY) for (const w of [e.term, ...(e.aka ?? [])]) if (!map.has(norm(w))) map.set(norm(w), e.term);
  const words = [...map.keys()].filter((w) => w.length >= 3 && !STOP.has(w)).sort((a, b) => b.length - a.length);
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  MATCHER = { map, re: new RegExp(`(^|[^\\p{L}\\p{N}-])(${words.map(esc).join('|')})(?![\\p{L}\\p{N}-])`, 'giu') };
  return MATCHER;
}
/**
 * Turn plain text into an array of strings and tap-a-word glossary spans. Each term is marked once per call
 * (pass the same `seen` Set for the whole page to mark every term once per lesson).
 */
export function annotate(text, seen = new Set(), max = 6) {
  const { map, re } = matcher(); const s = String(text ?? ''); const out = []; let last = 0, n = 0;
  re.lastIndex = 0;
  for (let m; (m = re.exec(s)); ) {
    const word = m[2], key = map.get(norm(word)); const start = m.index + m[1].length;
    if (!key || seen.has(key) || n >= max) continue;
    seen.add(key); n++;
    if (start > last) out.push(s.slice(last, start));
    out.push(gloss(key, word)); last = start + word.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.length ? out : [s];
}

let pop = null, popFor = null;
function closePop() { pop?.remove(); pop = null; popFor = null; }
function openPop(entry, anchor) {
  if (popFor === anchor) return closePop();
  closePop();
  popFor = anchor;
  pop = h('div', { class: 'gloss-pop', role: 'dialog', 'aria-label': entry.term },
    h('b', null, entry.term), h('p', null, entry.simple),
    entry.lessonId && appRef ? h('button', { class: 'btn small primary gloss-learn', onclick: () => { closePop(); appRef.navigate('academy', { lesson: entry.lessonId }); } }, 'Learn more') : null);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
  const top = r.bottom + ph + 12 > window.innerHeight ? Math.max(8, r.top - ph - 8) : r.bottom + 6;
  pop.style.left = `${left}px`; pop.style.top = `${top}px`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest?.('.gloss')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
}

/** Inline jargon word with a plain-words explanation: hover shows a tooltip, click opens a small popover with a link to the lesson. */
export function gloss(term, label) {
  const entry = findTerm(term);
  const text = label ?? term;
  if (!entry) return h('span', null, text);
  const el = h('span', { class: 'gloss', tabindex: '0', role: 'button', 'data-term': entry.term, title: entry.simple, onclick: (e) => { e.stopPropagation(); e.preventDefault(); openPop(entry, el); } }, text);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(entry, el); } });
  return el;
}

// ---------------------------------------------------------------------------------------------------------------- decorateTerms
const SKIP = 'input,textarea,select,option,code,pre,kbd,samp,script,style,button,a,svg,canvas,noscript,h1,[contenteditable],[data-no-gloss],.gloss,.mono,.gloss-pop,.num,.stat-v';
const DEFAULT_MAX = 12;
/**
 * Decorate known jargon words inside `root` (lesson text, AI replies, challenge text, labels) with the dotted glossary tooltip (same element as gloss()).
 * - Safe: only walks text nodes; skips inputs, code, buttons, links, headings, numbers/mono text and anything inside a `.gloss` or `[data-no-gloss]`.
 * - Idempotent: terms already decorated under `root` are not marked again, and an unchanged root is skipped in O(1) (checked by its text length).
 * - Cheap: each term is marked at most once per root, at most `max` terms per root, and text nodes without letters are ignored.
 * Returns the number of terms newly decorated.
 */
export function decorateTerms(root, { max = DEFAULT_MAX } = {}) {
  if (!root || root.nodeType !== 1 || typeof document === 'undefined') return 0;
  const stamp = root.textContent.length;
  if (root.__glossStamp === stamp) return 0;
  const { map, re } = matcher();
  const seen = new Set(); for (const el of root.querySelectorAll('.gloss[data-term]')) seen.add(el.dataset.term);
  let added = 0;
  const walker = document.createTreeWalker(root, 4, { acceptNode: (n) => (n.nodeValue.length < 3 || !/\p{L}{3}/u.test(n.nodeValue) || n.parentElement?.closest(SKIP) ? 2 : 1) });
  const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    if (seen.size >= max) break;
    const text = node.nodeValue; const parts = []; let last = 0;
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) {
      const word = m[2], key = map.get(norm(word)); const start = m.index + m[1].length;
      if (!key || seen.has(key) || seen.size >= max) continue;
      seen.add(key); added++;
      if (start > last) parts.push(text.slice(last, start));
      parts.push(gloss(key, word)); last = start + word.length;
    }
    if (!parts.length) continue;
    if (last < text.length) parts.push(text.slice(last));
    node.replaceWith(...parts.map((p) => (typeof p === 'string' ? document.createTextNode(p) : p)));
  }
  root.__glossStamp = root.textContent.length;       // decorating does not change the text
  return added;
}

let observer = null;
/** Keep AI replies and any container marked data-gloss decorated, also while they stream in or re-render (debounced). */
function startAutoDecorate() {
  if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  const pending = new Set(); let timer = 0;
  const flush = () => { timer = 0; for (const el of pending) { try { if (el.isConnected) decorateTerms(el); } catch { /* never break the page for a tooltip */ } } pending.clear(); };
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.type === 'characterData' ? m.target.parentElement : m.target;
      const box = t?.closest?.('.msg.assistant, [data-gloss]');
      if (box) pending.add(box);
      for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('.msg.assistant, [data-gloss]')) pending.add(n); else n.querySelectorAll?.('.msg.assistant, [data-gloss]').forEach((x) => pending.add(x)); }
    }
    if (pending.size && !timer) timer = setTimeout(flush, 120);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
