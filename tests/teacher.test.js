// Teacher mode: assignment files, proofs with hashes, student reports and the class table (all offline, no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AiSession } from '../ai/session.js';
import { MemoryStorage } from '../src/core/storage.js';
import { challengeById, setupChallenge, evaluate } from '../src/core/challenges.js';
import { sha256Hex, canonical, hashOf, createAssignment, parseAssignment, exportAssignment, makeProof, verifyProof, proofConsistent, buildReport, exportReport, parseReport, classTable, classCsv, reportCsv, daysLeft, INTEGRITY_NOTE } from '../src/core/teacher.js';

test('sha256 matches the reference implementation (empty, short, multi-block, unicode)', () => {
  for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Žluťoučký kůň ✓']) assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s).digest('hex'), JSON.stringify(s.slice(0, 20)));
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}'); assert.equal(hashOf({ x: 1, y: 2 }), hashOf({ y: 2, x: 1 }));
});

test('assignment: validation, export / import round trip, edits are noticed, unknown ids dropped', () => {
  assert.throws(() => createAssignment({ title: '', challengeIds: ['reach-orbit'] }), /title/);
  assert.throws(() => createAssignment({ title: 'x', challengeIds: [] }), /at least one/);
  assert.throws(() => createAssignment({ title: 'x', challengeIds: ['nope'] }), /Unknown/);
  assert.throws(() => createAssignment({ title: 'x', challengeIds: ['reach-orbit'], due: '31/12/2026' }), /due date/);
  const a = createAssignment({ title: 'Week 3: orbits <b>', challengeIds: ['reach-orbit', 'station-orbit', 'reach-orbit', 'cheap-orbit'], due: '2026-12-01', notes: 'Work in pairs.', teacher: 'Ms Novak' });
  assert.deepEqual(a.challenges, ['reach-orbit', 'station-orbit', 'cheap-orbit']); assert.ok(!a.title.includes('<'));
  const back = parseAssignment(exportAssignment(a)); assert.ok(back.ok && back.warnings.length === 0); assert.deepEqual(back.assignment.challenges, a.challenges); assert.equal(back.assignment.id, a.id);
  const edited = JSON.parse(exportAssignment(a)); edited.due = '2030-01-01'; assert.match(parseAssignment(JSON.stringify(edited)).warnings.join(' '), /changed/);
  const unk = JSON.parse(exportAssignment(a)); unk.challenges.push('from-the-future'); const p = parseAssignment(JSON.stringify(unk)); assert.ok(p.ok); assert.equal(p.assignment.challenges.length, 3); assert.ok(p.warnings.length);
  assert.equal(parseAssignment('not json').ok, false); assert.equal(parseAssignment('{"schema":"other"}').ok, false);
  assert.equal(daysLeft({ due: '2026-12-01' }, new Date('2026-11-29T10:00:00')), 3); assert.ok(daysLeft({ due: '2026-01-01' }, new Date('2026-11-29')) < 0); assert.equal(daysLeft({}), null);
});

test('real run proof -> student report -> class table; edits are detected, and the honest limit is stated', { timeout: 120000 }, async () => {
  const S = new AiSession({ storage: new MemoryStorage() }); await S.send('Build me a two-stage rocket carrying a 100 kg space probe.'); await S.send('yes');
  const ch = challengeById('reach-orbit'); assert.ok((await setupChallenge(S.api, ch)).ok);
  const r = await S.api.execute('RUN_SIMULATION', { name: 'x', tune: true }); const { record, telemetry } = await S.api.getRun(r.data.runId);
  const ev = evaluate(ch, record, telemetry); assert.ok(ev.passed);
  const proof = makeProof(ev, { runId: record.id, at: '2026-11-01T10:00:00Z' });
  assert.ok(verifyProof(proof) && proofConsistent(proof, 'reach-orbit')); assert.ok(proof.metrics.finalApo > 190000 && proof.metrics.status === 'SUCCESS');
  const a = createAssignment({ title: 'Orbits', challengeIds: ['reach-orbit', 'station-orbit'], due: '2026-12-01' });
  const rep = buildReport({ student: 'Eva', assignment: a, saved: { 'reach-orbit': { stars: ev.stars, attempts: 3, proof } }, now: new Date('2026-11-02') });
  assert.equal(rep.entries[1].stars, 0); assert.equal(rep.entries[0].attempts, 3);
  const text = exportReport(rep); const pr = parseReport(text); assert.ok(pr.ok && pr.intact);
  // second student claims 3 stars without a proof, third edited a number inside the proof
  const cheat1 = buildReport({ student: 'Tom', assignment: a, saved: { 'reach-orbit': { stars: 3, attempts: 1 } } });
  const tampered = JSON.parse(JSON.stringify(proof)); tampered.metrics.finalApo = proof.metrics.finalApo + 12345; assert.equal(verifyProof(tampered), false);
  const cheat2 = buildReport({ student: 'Ann', assignment: a, saved: { 'reach-orbit': { stars: ev.stars, attempts: 1, proof: tampered } } });
  const forged = JSON.parse(JSON.stringify(proof)); forged.stars = 3; const { hash, ...fb } = forged; forged.hash = hashOf(fb); assert.equal(proofConsistent(forged, 'reach-orbit'), ev.stars === 3, 'stars must agree with the goal list');
  const t = classTable([rep, cheat1, cheat2].map((x) => parseReport(exportReport(x)).report), a);
  assert.deepEqual(t.rows.map((x) => x.student), ['Ann', 'Eva', 'Tom']);
  const cell = (s) => t.rows.find((x) => x.student === s).cells['reach-orbit'];
  assert.equal(cell('Eva').checked, 'ok'); assert.equal(cell('Tom').checked, 'bad'); assert.equal(cell('Ann').checked, 'bad');
  assert.equal(t.rows.find((x) => x.student === 'Tom').flagged, 1); assert.equal(t.max, 6);
  const csv = classCsv(t); assert.match(csv.split('\n')[0], /^Student,Reach orbit \(200 km\) stars/); assert.equal(csv.trim().split('\n').length, 4);
  assert.match(reportCsv(rep), /Eva,Orbits,Reach orbit/);
  const edit = JSON.parse(text); edit.entries[0].stars = (edit.entries[0].stars + 1) % 4; assert.equal(parseReport(JSON.stringify(edit)).intact, false);
  // a newer report of the same student replaces the older one
  const newer = buildReport({ student: 'eva', assignment: a, saved: {}, now: new Date('2026-11-05') }); assert.equal(classTable([rep, newer], a).rows.length, 1);
  assert.match(INTEGRITY_NOTE, /not cheat-proof/);
});
