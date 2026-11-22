// Physics regression check (2.9). Flies every validation rocket, the mission validation cases (orbits, J2 drift, Curiosity EDL,
// Apollo 11) and the Engineering Workbench scenarios, and compares every simulated number with the approved baseline in
// tests/regression/baseline.json. Any number that moves by more than its tolerance fails the check, so a physics change can never slip
// in unnoticed: either it is a bug, or the change is intended and the baseline is re-approved in the same pull request.
//
//   node scripts/regression-check.mjs              compare with the baseline (exit 1 on drift)
//   node scripts/regression-check.mjs --update     re-approve: write the current numbers as the new baseline
//   node scripts/regression-check.mjs --quick      skip the slow cases (Apollo 11, one-day J2 flights)
//   --report <file.json>  write the full comparison;  --summary <file.md>  write a Markdown table (CI: $GITHUB_STEP_SUMMARY)
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(root, 'tests', 'regression', 'baseline.json');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const quick = flag('--quick'), update = flag('--update');
// Relative tolerance: far below any physical change worth reporting, far above floating-point noise between Node builds.
const REL_TOL = 1e-4, ABS_TOL = 1e-9;
const SLOW = new Set(['mission.apollo11', 'mission.precession']);

async function collect() {
  const out = {}; const timing = {};
  const put = (group, key, v) => { if (v != null && Number.isFinite(v)) out[`${group}.${key}`] = +v; };
  const time = async (name, fn) => { const t0 = Date.now(); await fn(); timing[name] = (Date.now() - t0) / 1000; process.stderr.write(`  ${name}: ${timing[name].toFixed(1)} s\n`); };

  const { VALIDATION_VEHICLES, runValidationFlight } = await import('../src/core/validation.js');
  for (const V of VALIDATION_VEHICLES) {
    await time(`validation.${V.id}`, () => {
      const r = runValidationFlight(V.id);
      put(`validation.${V.id}`, 'reached', r.reached ? 1 : 0);
      for (const row of r.rows) put(`validation.${V.id}`, row.metric, row.sim);
      put(`validation.${V.id}`, 'orbitPeri', r.metrics.orbitPeri); put(`validation.${V.id}`, 'orbitApo', r.metrics.orbitApo);
    });
  }
  const { MISSION_CASES, runMissionCase } = await import('../src/core/mission-validation.js');
  for (const C of MISSION_CASES) {
    if (quick && SLOW.has(`mission.${C.id}`)) continue;
    await time(`mission.${C.id}`, async () => { const r = await runMissionCase(C.id, { sync: true }); for (const row of r.rows) put(`mission.${C.id}`, row.metric, row.sim); });
  }
  const { regressionOutputs } = await import('../src/engineering/vv/regression.js');
  await time('engineering', () => { for (const [k, v] of Object.entries(regressionOutputs())) put('engineering', k, v); });
  return { values: out, timing };
}

function compare(base, now) {
  const rows = [];
  for (const [k, b] of Object.entries(base)) {
    if (quick && [...SLOW].some((s) => k.startsWith(`${s}.`))) continue;
    const n = now[k];
    if (n === undefined) { rows.push({ key: k, base: b, now: null, status: 'missing' }); continue; }
    const diff = n - b, tol = Math.max(ABS_TOL, Math.abs(b) * REL_TOL);
    rows.push({ key: k, base: b, now: n, rel: b !== 0 ? diff / Math.abs(b) : diff, status: Math.abs(diff) <= tol ? (diff === 0 ? 'same' : 'within') : 'changed' });
  }
  for (const k of Object.keys(now)) if (!(k in base)) rows.push({ key: k, base: null, now: now[k], status: 'new' });
  return rows;
}

const fmt = (v) => (v == null ? '-' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : (+v.toPrecision(7)).toString());
function markdown(rows, timing) {
  const bad = rows.filter((r) => r.status === 'changed' || r.status === 'missing'), added = rows.filter((r) => r.status === 'new');
  const L = ['## Physics regression check', '',
    bad.length ? `**${bad.length} simulated value(s) moved beyond tolerance** (relative ${REL_TOL}). If the change is intended, run \`node scripts/regression-check.mjs --update\` and commit tests/regression/baseline.json with an explanation.` : `All ${rows.filter((r) => r.status === 'same' || r.status === 'within').length} simulated values match the approved baseline (relative tolerance ${REL_TOL}).`, ''];
  if (bad.length) { L.push('| Value | Baseline | Now | Change |', '|---|---|---|---|'); for (const r of bad) L.push(`| \`${r.key}\` | ${fmt(r.base)} | ${fmt(r.now)} | ${r.status === 'missing' ? 'no longer produced' : `${(100 * r.rel).toFixed(3)} %`} |`); L.push(''); }
  if (added.length) L.push(`${added.length} new value(s) not in the baseline yet: ${added.slice(0, 10).map((r) => `\`${r.key}\``).join(', ')}${added.length > 10 ? ' ...' : ''}.`, '');
  const within = rows.filter((r) => r.status === 'within');
  if (within.length) L.push(`${within.length} value(s) differ only by floating-point noise (largest ${(100 * Math.max(...within.map((r) => Math.abs(r.rel)))).toExponential(2)} %).`, '');
  L.push(`<details><summary>Run times</summary>\n\n${Object.entries(timing).map(([k, v]) => `- ${k}: ${v.toFixed(1)} s`).join('\n')}\n</details>`, '');
  return L.join('\n');
}

const { values, timing } = await collect();
if (update) {
  mkdirSync(path.dirname(BASELINE), { recursive: true });
  let prev = {}; try { prev = JSON.parse(readFileSync(BASELINE, 'utf8')).values ?? {}; } catch { /* first baseline */ }
  const merged = quick ? { ...prev, ...values } : values;
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(BASELINE, `${JSON.stringify({ approved: new Date().toISOString(), node: process.version, note: 'Re-approve with: node scripts/regression-check.mjs --update', values: sorted }, null, 1)}\n`);
  console.log(`Baseline written: ${Object.keys(sorted).length} values -> ${path.relative(root, BASELINE)}`);
  process.exit(0);
}
let base;
try { base = JSON.parse(readFileSync(BASELINE, 'utf8')).values; } catch { console.error(`No baseline at ${path.relative(root, BASELINE)}. Create it with --update.`); process.exit(1); }
const rows = compare(base, values);
const md = markdown(rows, timing);
console.log(md);
if (opt('--report')) writeFileSync(opt('--report'), JSON.stringify({ node: process.version, relTol: REL_TOL, rows, timing }, null, 1));
if (opt('--summary')) appendFileSync(opt('--summary'), `${md}\n`);
const bad = rows.filter((r) => r.status === 'changed' || r.status === 'missing').length;
process.exit(bad ? 1 : 0);
