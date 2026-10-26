// Teacher mode without a server: a teacher makes an ASSIGNMENT FILE from the challenge library, a student imports it, flies the challenges,
// and exports a PROGRESS REPORT file (stars, attempts and the measured flight numbers as proof). The teacher imports all reports into a class table.
//
// Integrity, honestly: every proof carries a SHA-256 hash of the run metrics. It catches typing errors and casual edits of a number, but it is NOT
// cheat-proof: the file is plain JSON, so anyone who knows the format can change a number and recompute the hash. Real protection would need a server.
import { ALL_CHALLENGES, challengeById } from './challenges.js';

export const ASSIGNMENT_SCHEMA = 'astra.assignment/1';
export const REPORT_SCHEMA = 'astra.report/1';
export const INTEGRITY_NOTE = 'The hash only shows that the numbers were not changed by accident. It is not cheat-proof: anyone can edit a JSON file and recompute it.';

// ---------------------------------------------------------------------------------------------------------------- hashing (synchronous SHA-256)
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
/** SHA-256 of a string (UTF-8), as lowercase hex. Synchronous, so it works in every context (file://, Electron, Node). */
export function sha256Hex(str) {
  const msg = new TextEncoder().encode(String(str)); const len = msg.length;
  const total = (((len + 9 + 63) >> 6) << 6); const buf = new Uint8Array(total); buf.set(msg); buf[len] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 8, Math.floor((len * 8) / 0x100000000)); dv.setUint32(total - 4, (len * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}
/** JSON with sorted keys, so the same data always gives the same hash. */
export function canonical(x) {
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`;
  return JSON.stringify(Number.isFinite(x) || typeof x !== 'number' ? x : null);
}
export const hashOf = (obj) => sha256Hex(canonical(obj));

// ---------------------------------------------------------------------------------------------------------------- assignments
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);

/** Make an assignment. Throws Error with a plain message when the input is not valid. */
export function createAssignment({ title, challengeIds, due = null, notes = '', teacher = '', now = new Date() }) {
  const t = clean(title, 80); if (!t) throw new Error('Give the assignment a title.');
  const ids = [...new Set(challengeIds ?? [])];
  if (!ids.length) throw new Error('Pick at least one challenge.');
  const bad = ids.find((id) => !challengeById(id)); if (bad) throw new Error(`Unknown challenge "${bad}".`);
  if (due && (!ISO_DAY.test(due) || Number.isNaN(Date.parse(due)))) throw new Error('The due date must look like 2026-12-31.');
  const body = { schema: ASSIGNMENT_SCHEMA, title: t, challenges: ids, due: due || null, notes: clean(notes, 600), teacher: clean(teacher, 60), created: now.toISOString() };
  return { ...body, id: hashOf(body).slice(0, 12), check: hashOf(body) };
}
export const exportAssignment = (a) => JSON.stringify(a, null, 2);

/** Read an assignment file. Returns {ok, assignment, warnings} or {ok:false, error}. Unknown challenge ids are dropped with a warning. */
export function parseAssignment(text) {
  let j; try { j = JSON.parse(text); } catch { return { ok: false, error: 'This is not a valid assignment file (it is not JSON).' }; }
  if (j?.schema !== ASSIGNMENT_SCHEMA) return { ok: false, error: 'This file is not an ASTRA LAB assignment.' };
  const warnings = [];
  const known = (j.challenges ?? []).filter((id) => challengeById(id));
  if (known.length !== (j.challenges ?? []).length) warnings.push('Some challenges in this file do not exist in your version of ASTRA LAB and were skipped.');
  if (!known.length) return { ok: false, error: 'This assignment has no challenge that your version knows.' };
  const { id, check, ...body } = j;
  if (check !== hashOf({ schema: body.schema, title: body.title, challenges: body.challenges, due: body.due, notes: body.notes, teacher: body.teacher, created: body.created })) warnings.push('The file was changed after the teacher made it.');
  const a = { schema: ASSIGNMENT_SCHEMA, id: clean(id, 40) || hashOf(body).slice(0, 12), title: clean(j.title, 80) || 'Assignment', challenges: known, due: j.due && ISO_DAY.test(j.due) ? j.due : null, notes: clean(j.notes, 600), teacher: clean(j.teacher, 60), created: j.created ?? null, check };
  return { ok: true, assignment: a, warnings };
}
/** Days until the due date (negative when late), or null. */
export function daysLeft(a, now = new Date()) { if (!a?.due) return null; return Math.ceil((Date.parse(`${a.due}T23:59:59`) - now.getTime()) / 86400000); }

// ---------------------------------------------------------------------------------------------------------------- proofs and reports
const PROOF_KEYS = ['status', 'endTime', 'maxAlt', 'finalApo', 'finalPeri', 'finalIncl', 'finalEcc', 'initialMass', 'finalMass', 'maxG', 'maxQ', 'maxMach', 'liftoffTWR', 'lastStageReserveFrac', 'touchdownVertical', 'touchdownHorizontal', 'dvIdeal', 'dvGravity', 'dvDrag', 'dvSteering', 'maxTempNose', 'maxAoA', 'dvVacuum', 'payloadKg', 'required'];
const r4 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toPrecision(6)) : x);
/** The measured numbers behind a result, with a hash of them. `ev` is the result of evaluate() / evaluateDesign(). */
export function makeProof(ev, { runId = null, at = new Date().toISOString(), payloadKg = null } = {}) {
  const m = { ...(ev.metrics ?? {}) }; if (payloadKg != null && Number.isFinite(payloadKg)) m.payloadKg = payloadKg;
  const metrics = {}; for (const k of PROOF_KEYS) if (m[k] !== undefined && m[k] !== null && !(typeof m[k] === 'number' && !Number.isFinite(m[k]))) metrics[k] = r4(m[k]);
  const goals = (ev.goals ?? []).map((g) => ({ id: g.id, ok: !!g.ok, value: String(g.value ?? '') }));
  const body = { runId, at, stars: ev.stars ?? 0, metrics, goals };
  return { ...body, hash: hashOf(body) };
}
export function verifyProof(p) {
  if (!p || typeof p !== 'object' || !p.hash) return false;
  const { hash, ...body } = p; try { return hashOf(body) === hash; } catch { return false; }
}
/** Does the proof agree with itself? Stars must equal what the goal list says (tier rule), not just the hash. */
export function proofConsistent(p, challengeId) {
  if (!verifyProof(p)) return false;
  const ch = challengeById(challengeId); if (!ch) return false;
  let stars = 0;
  for (const tier of [1, 2, 3]) { const ids = ch.goals.filter((g) => g.tier === tier).map((g) => g.id); const ok = ids.length && ids.every((id) => p.goals.find((g) => g.id === id)?.ok); if (ok) stars = tier; else break; }
  return stars === p.stars;
}

/** Build the student's report for an assignment. `saved` = app.settings.challenges ({id: {stars, attempts, proof}}). */
export function buildReport({ student, assignment, saved = {}, now = new Date() }) {
  const entries = assignment.challenges.map((id) => { const s = saved[id] ?? {}; const ch = challengeById(id); return { challengeId: id, title: ch?.title ?? id, stars: s.stars ?? 0, attempts: s.attempts ?? 0, proof: s.stars > 0 ? s.proof ?? null : null }; });
  const body = { schema: REPORT_SCHEMA, student: clean(student, 60) || 'Student', assignment: { id: assignment.id, title: assignment.title, due: assignment.due ?? null }, created: now.toISOString(), entries };
  return { ...body, hash: hashOf(body) };
}
export const exportReport = (r) => JSON.stringify(r, null, 2);
export function parseReport(text) {
  let j; try { j = JSON.parse(text); } catch { return { ok: false, error: 'This is not a valid report file (it is not JSON).' }; }
  if (j?.schema !== REPORT_SCHEMA || !Array.isArray(j.entries)) return { ok: false, error: 'This file is not an ASTRA LAB student report.' };
  const { hash, ...body } = j;
  return { ok: true, report: j, intact: hash === hashOf(body) };
}

// ---------------------------------------------------------------------------------------------------------------- class table
/**
 * Combine reports (one per student) into a class table. A student appearing twice keeps the newest report.
 * `checked` per cell: 'ok' = proof hash and star rule agree, 'none' = no stars to prove, 'bad' = stars claimed but the proof is missing or inconsistent.
 */
export function classTable(reports, assignment = null) {
  const newest = new Map();
  for (const r of reports) { const k = r.student.toLowerCase(); if (!newest.has(k) || r.created > newest.get(k).created) newest.set(k, r); }
  const list = [...newest.values()].sort((a, b) => a.student.localeCompare(b.student));
  const ids = assignment?.challenges ?? [...new Set(list.flatMap((r) => r.entries.map((e) => e.challengeId)))];
  const columns = ids.map((id) => ({ id, title: challengeById(id)?.title ?? id, max: 3 }));
  const rows = list.map((r) => {
    const cells = {}; let total = 0, bad = 0;
    for (const id of ids) {
      const e = r.entries.find((x) => x.challengeId === id);
      if (!e) { cells[id] = { stars: 0, attempts: 0, checked: 'none' }; continue; }
      const stars = Math.max(0, Math.min(3, e.stars | 0));
      const checked = !stars ? 'none' : e.proof && proofConsistent(e.proof, id) && e.proof.stars === stars ? 'ok' : 'bad';
      if (checked === 'bad') bad++;
      cells[id] = { stars, attempts: e.attempts | 0, checked, at: e.proof?.at ?? null, metrics: e.proof?.metrics ?? null }; total += stars;
    }
    return { student: r.student, created: r.created, cells, total, max: ids.length * 3, flagged: bad, assignmentId: r.assignment?.id ?? null };
  });
  return { columns, rows, classAverage: rows.length ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0, max: ids.length * 3 };
}
const csvCell = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function classCsv(table) {
  const head = ['Student', ...table.columns.flatMap((c) => [`${c.title} stars`, `${c.title} attempts`, `${c.title} proof`]), 'Total stars', 'Max stars'];
  const lines = [head, ...table.rows.map((r) => [r.student, ...table.columns.flatMap((c) => [r.cells[c.id].stars, r.cells[c.id].attempts, r.cells[c.id].checked]), r.total, r.max])];
  return `${lines.map((l) => l.map(csvCell).join(',')).join('\n')}\n`;
}
export function reportCsv(report) {
  const lines = [['Student', 'Assignment', 'Challenge', 'Stars', 'Attempts', 'Proof hash'], ...report.entries.map((e) => [report.student, report.assignment.title, e.title, e.stars, e.attempts, e.proof?.hash?.slice(0, 16) ?? ''])];
  return `${lines.map((l) => l.map(csvCell).join(',')).join('\n')}\n`;
}
export const challengeChoices = () => ALL_CHALLENGES.map((c) => ({ id: c.id, title: c.title, difficulty: c.difficulty }));
