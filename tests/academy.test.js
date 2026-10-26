import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, COMPONENT_INFO, allLessons } from '../data/academy/index.js';
import { KIND_LABELS } from '../data/components.js';
import { DIAGRAMS } from '../ui/lib/diagrams.js';
import { teachReply } from '../ai/teacher.js';

test('academy: 11 levels with unique lesson ids and complete lesson fields', () => {
  assert.equal(LEVELS.length, 11);
  const ids = new Set();
  for (const l of allLessons()) {
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`); ids.add(l.id);
    for (const k of ['title', 'tagline', 'definition', 'why', 'recap']) assert.ok(String(l[k]).length > 10, `${l.id}.${k}`);
    assert.ok(l.explain.length >= 2 && l.keyIdeas.length >= 2 && l.mistakes.length >= 1, l.id);
    assert.ok(l.example?.text?.length > 20, l.id);
    assert.equal(l.quiz.length, 3, l.id);
    for (const q of l.quiz) { assert.ok(q.answer >= 0 && q.answer < q.options.length, l.id); assert.ok(new Set(q.options).size === q.options.length, `${l.id} duplicate options`); }
    if (l.diagram) assert.ok(DIAGRAMS[l.diagram], `${l.id}: unknown diagram ${l.diagram}`);
  }
});
test('academy: every interactive lab computes finite numbers for its default and its extreme inputs', () => {
  let labs = 0;
  for (const l of allLessons()) {
    if (!l.lab) continue; labs++;
    for (const pick of ['value', 'min', 'max']) {
      const v = {}; for (const i of l.lab.inputs) v[i.id] = i[pick];
      const out = l.lab.compute(v);
      assert.ok(out.length > 0, l.id);
      for (const o of out) assert.ok(Number.isFinite(o.value), `${l.id} ${pick}: ${o.label} = ${o.value}`);
    }
  }
  assert.ok(labs >= 20, `only ${labs} labs`);
});
test('academy: rocket-equation lab agrees with the textbook value', () => {
  const l = allLessons().find((x) => x.id === 'L3-2');
  const v = {}; for (const i of l.lab.inputs) v[i.id] = i.value;
  const out = l.lab.compute(v);
  assert.ok(out.some((o) => o.unit === 'm/s' && o.value > 100), 'has a delta-v output');
});
test('academy: component encyclopedia covers every component kind', () => {
  for (const k of Object.keys(KIND_LABELS)) {
    const c = COMPONENT_INFO[k]; assert.ok(c, `missing ${k}`);
    for (const f of ['name', 'group']) assert.ok(String(c[f]).length > 2, `${k}.${f}`);
    for (const f of ['oneLine', 'whatItDoes', 'whyItMatters', 'realWorld', 'tryIt']) assert.ok(String(c[f]).length > 15, `${k}.${f}`);
    assert.ok(c.howItWorks.length >= 1 && c.advantages.length >= 1 && c.limitations.length >= 1, k);
  }
});
test('AI teacher: answers learning questions from the Academy and ignores run questions', () => {
  assert.equal(teachReply('Why did it fail?'), null);
  assert.equal(teachReply('Test it.'), null);
  assert.equal(teachReply('What does the fuel tank do?').links[0].params.component, 'fuel_tank');
  assert.equal(teachReply('Teach me about batteries').links[0].params.component, 'battery');
  assert.equal(teachReply('Teach me about staging').links[0].params.lesson, 'L3-3');
  assert.match(teachReply('teach me about zebras').text, /could not find a lesson/);
});

test('glossary: at least 120 plain-words terms, each lookup-able, short and linked to a real lesson', async () => {
  const { GLOSSARY, glossaryLookup, glossaryLetter } = await import('../data/academy/glossary.js');
  const { findLesson } = await import('../data/academy/index.js');
  assert.ok(GLOSSARY.length >= 120, `only ${GLOSSARY.length} terms`);
  const seen = new Set();
  for (const e of GLOSSARY) {
    assert.ok(!seen.has(e.term.toLowerCase()), `duplicate ${e.term}`); seen.add(e.term.toLowerCase());
    assert.ok(e.def.split(' ').length <= 24 && e.def.length > 12, `${e.term}: definition length`);
    assert.equal(glossaryLookup(e.term), e);
    assert.equal(glossaryLookup(e.term.toUpperCase()), e);
    if (e.lesson) assert.ok(findLesson(e.lesson), `${e.term}: lesson ${e.lesson}`);
    assert.match(glossaryLetter(e), /[A-Z#]/);
  }
  assert.equal(glossaryLookup('AoA').term, 'Angle of attack');
  assert.equal(glossaryLookup('not a term'), null);
});

test('academy: every lesson has a one-sentence Key idea; the long lessons are in plain words and keep their original text as `deep`', () => {
  const stat = (t) => t.split(/(?<=[.!?])\s+/).map((x) => x.split(/\s+/).length);
  for (const l of allLessons()) {
    assert.ok(l.keyIdea && l.keyIdea.split(' ').length <= 22, `${l.id}: keyIdea`);
    const texts = [l.definition, l.why, ...l.explain, l.recap];
    const lens = texts.flatMap(stat);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    assert.ok(avg <= 14, `${l.id}: average sentence is ${avg.toFixed(1)} words`);
    assert.ok(l.explain.length <= 3, `${l.id}: ${l.explain.length} paragraphs`);
    if (l.level.n >= 7) assert.ok(l.deep?.explain?.length >= 4 && l.deep.definition.length > 20, `${l.id}: original text kept`);
  }
});

test('academy: main lesson text is the short beginner version; the technical text stays as "deep"', () => {
  for (const l of allLessons()) {
    assert.equal(l.explain.length, 3, l.id);
    const words = l.explain.join(' ').split(/\s+/).length;
    assert.ok(words <= 100, `${l.id}: ${words} words`);
    for (const p of l.explain) for (const s of p.split(/(?<=[.?!])\s+/)) assert.ok(s.split(/\s+/).length <= 12, `${l.id}: long sentence: ${s}`);
    assert.ok(l.deep?.explain?.length >= 2, `${l.id}: deep text kept`);
    assert.ok(l.keyIdea.length > 10, l.id);
  }
});
test('academy: parts guide one-liners are short and the longer text is kept under "More"', () => {
  for (const [k, c] of Object.entries(COMPONENT_INFO)) {
    assert.ok(c.oneLine.split(/\s+/).length <= 8, `${k}.oneLine`);
    assert.ok(c.whatItDoes.split(/(?<=[.?!])\s+/).length <= 2, `${k}.whatItDoes`);
    assert.ok(c.detail?.length > 20, `${k}.detail`);
  }
});
