// Aerospace Academy content: 11 levels of lessons and the component encyclopedia.
// Every lesson shows the short beginner text (data/academy/simple.js, plus data/academy/plain.js for levels 7-11); the original long text stays on each lesson as `deep` ("Go deeper").
import l1 from './levels-1.js';
import l2 from './levels-2.js';
import l3 from './levels-3.js';
import l4 from './levels-4.js';
import components from './components-info.js';
import { PLAIN, KEY_IDEA } from './plain.js';
import { SIMPLE } from './simple.js';

// pictures that fit the lesson better than the first ones (ui/lib/diagrams.js)
const DIAGRAM_FOR = { 'L2-1': 'weight-mass', 'L3-4': 'thrust-drag', 'L4-2': 'nozzle', 'L5-2': 'drag-maxq', 'L8-2': 'solar-distance', 'L8-3': 'signal-delay', 'L8-4': 'edl', 'L9-2': 'feedback', 'L9-3': 'reaction-wheel', 'L10-1': 'dv-budget', 'L10-4': 'edl', 'L11-2': 'backups' };
const DEEP_FIELDS = ['tagline', 'definition', 'why', 'explain', 'keyIdeas', 'mistakes', 'recap'];
function plainer(lesson) {
  const p = PLAIN[lesson.id];
  const out = { ...lesson, diagram: DIAGRAM_FOR[lesson.id] ?? lesson.diagram, keyIdea: KEY_IDEA[lesson.id] ?? lesson.keyIdeas?.[0] ?? lesson.recap };
  // the original technical text always stays as `deep`; the main text is the short beginner version (data/academy/simple.js)
  out.deep = Object.fromEntries(DEEP_FIELDS.map((f) => [f, lesson[f]]));
  if (p) for (const f of DEEP_FIELDS) if (p[f] != null) out[f] = p[f];
  if (SIMPLE[lesson.id]) out.explain = SIMPLE[lesson.id];
  return out;
}
export const LEVELS = [...l1, ...l2, ...l3, ...l4].map((L) => ({ ...L, lessons: L.lessons.map(plainer) })).sort((a, b) => a.n - b.n);
export const COMPONENT_INFO = components;
export const allLessons = () => LEVELS.flatMap((L) => L.lessons.map((l) => ({ ...l, level: L })));
export const findLesson = (id) => allLessons().find((l) => l.id === id);
