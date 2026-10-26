import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, normalizeLevel, atLeast, levelRank } from '../src/core/levels.js';
import { t, setLang, getLang, hasTranslation, LANGS } from '../src/core/i18n.js';
import { CS } from '../data/i18n-cs.js';
import { runSimulation } from '../src/core/runner.js';
import { runMetrics } from '../src/core/run-analysis.js';
import { buildRunRecord } from '../src/core/project.js';

test('levels: four levels in order, legacy values migrate', () => {
  assert.deepEqual(LEVELS, ['beginner', 'student', 'engineer', 'expert']);
  assert.equal(normalizeLevel('standard'), 'student');
  assert.equal(normalizeLevel('advanced'), 'expert');
  assert.equal(normalizeLevel('engineer'), 'engineer');
  assert.equal(normalizeLevel(undefined), 'beginner');
  assert.equal(normalizeLevel('nonsense'), 'beginner');
  assert.ok(atLeast('engineer', 'student') && atLeast('expert', 'engineer') && !atLeast('student', 'engineer'));
  assert.equal(levelRank('expert'), 3);
});

test('i18n: English fallback, Czech translation, placeholders', () => {
  setLang('en');
  assert.equal(t('nav.home.full', 'Home'), 'Home');
  assert.equal(t('does.not.exist', 'Fallback text'), 'Fallback text');
  setLang('cs');
  assert.equal(getLang(), 'cs');
  assert.equal(t('nav.home.full', 'Home'), 'Domů');
  assert.equal(t('does.not.exist', 'Fallback text'), 'Fallback text');       // untranslated strings fall back to English
  assert.equal(t('home.ndone', '{n} of 4 done', { n: 3 }), '3 ze 4 hotovo');
  assert.ok(hasTranslation('level.student'));
  setLang('xx'); assert.equal(getLang(), 'en');
  assert.deepEqual(LANGS.map((l) => l[0]), ['en', 'cs']);
});

test('i18n: the Czech dictionary covers the shell and never leaves a placeholder behind', () => {
  const need = ['home', 'academy', 'ai', 'designer', 'simulation', 'challenges', 'analysis', 'planner', 'control', 'telemetry', 'replay', 'experiments', 'projects', 'validation', 'settings'];
  for (const id of need) for (const k of ['plain', 'full']) assert.ok(CS[`nav.${id}.${k}`], `nav.${id}.${k}`);
  for (const id of ['first-steps', 'sound-barrier', 'strong-liftoff', 'reach-orbit', 'station-orbit', 'max-q', 'gentle-ride', 'lightweight', 'efficient', 'cool-nose', 'steady-flight', 'perfect-circle', 'speedy-orbit', 'heavy-lift', 'high-flyer', 'polar-pioneer']) assert.ok(CS[`chal.${id}`], `chal.${id}`);
  for (const [k, v] of Object.entries(CS)) { assert.equal(typeof v, 'string'); assert.ok(v.length > 0, k); }
  // every placeholder used in a translation is a real {name}
  for (const [k, v] of Object.entries(CS)) for (const m of v.matchAll(/\{(\w+)\}/g)) assert.ok(['n', 'm', 'r', 'u', 'name', 'alt'].includes(m[1]), `${k}: {${m[1]}}`);
});

// A rocket-equation vehicle: the level of detail is a UI setting that never enters the physics, so the same inputs give identical numbers.
import { engineStage } from './helpers.js';
test('the same flight gives identical metrics whatever the detail level is (the level is not a simulation input)', async () => {
  const v = engineStage({ dry: 100, prop: 400, thrust: 5000, isp: 300 });
  const mission = { name: 'Burn', objective: { type: 'none' }, initial: { type: 'state', r: [7e6, 0, 0], v: [0, 0, 0], body: 'void' }, maxTime: 60, guidance: { mode: 'inertial', params: { vector: [1, 0, 0] } }, events: [{ id: 'i', name: 'Ignite', condition: { type: 'time', value: 0 }, action: { type: 'IGNITE', group: 'main' } }] };
  const fingerprints = new Set();
  for (const level of LEVELS) {
    globalThis.__level = level;     // a UI-only value: nothing in the engine reads it
    try {
      const sim = await runSimulation({ vehicle: v, mission, environment: { body: 'void' }, settings: { accuracy: 'standard' } }, { maxWallMs: 60000 });
      const m = runMetrics(buildRunRecord(sim), sim.telemetry);
      fingerprints.add(['status', 'endTime', 'maxAlt', 'maxSpeed', 'dvIdeal', 'propellantUsed', 'finalMass', 'samples'].map((k) => `${k}=${m[k]}`).join('|'));
    } catch (e) { fingerprints.add(`error:${e.message}`); }
  }
  assert.equal(fingerprints.size, 1, [...fingerprints].join('\n'));
  assert.ok(![...fingerprints][0].startsWith('error:'), [...fingerprints][0]);
  assert.ok(/status=(SUCCESS|FAILURE)/.test([...fingerprints][0]), [...fingerprints][0]);
});
