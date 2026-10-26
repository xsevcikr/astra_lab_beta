// Validation against real missions (2.0): orbit maths vs NASA fact sheets and Curiosity's landing vs NASA's EDL timeline.
// The Apollo 11 timeline is checked in tests/apollo.test.js on the one full flight that file already makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMissionCase, MISSION_CASES } from '../src/core/mission-validation.js';

test('every published mission value has a source and a unit', () => {
  for (const C of MISSION_CASES) for (const r of C.rows) { assert.ok(r.url?.startsWith('https://'), `${C.id}/${r.id} url`); assert.ok(r.source && r.unit != null, `${C.id}/${r.id}`); }
});

test('orbit maths matches published orbit periods, escape speeds and transfers', async () => {
  const r = await runMissionCase('orbits');
  assert.equal(r.summary.fail, 0, JSON.stringify(r.rows.filter((x) => x.status === 'fail').map((x) => [x.id, x.err])));
  assert.equal(r.summary.pass, r.summary.total);
});

test('Curiosity: lands softly, parachute opens within 10% of the real time; touchdown error is reported honestly', async () => {
  const r = await runMissionCase('msl');
  assert.ok(r.metrics.success, r.metrics.text);
  const chute = r.rows.find((x) => x.id === 'mslChuteT');
  assert.equal(chute.status, 'pass', `chute ${chute.sim} s`);
  const td = r.rows.find((x) => x.id === 'mslTouch');
  assert.ok(Math.abs(td.err) < 0.15, `touchdown ${td.sim} s vs ${td.value} s`); // documented: the simulator does not fly the sideways divert
});
