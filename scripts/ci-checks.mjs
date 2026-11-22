// Fast static checks run first in CI (2.9), so a broken file fails in seconds instead of after the long suites:
//  * every .js / .mjs / .cjs file parses (node --check);
//  * every JSON file in the app folders parses;
//  * no test is focused with .only (which would silently skip all the others);
//  * every tests/*.test.js is picked up by npm test, and every browser suite tests/ui-*.mjs is listed in scripts/run-ui-tests.mjs;
//  * the version in package.json matches the version the app shows (ui/screens/settings.js).
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'physics', 'mission', 'ai', 'ui', 'data', 'scripts', 'tests', 'vehicles', 'missions'];
const SKIP = new Set(['node_modules', 'build', 'dist', '.git', 'fixtures']);
const problems = [];
const walk = (d, out = []) => { for (const f of readdirSync(d)) { if (SKIP.has(f)) continue; const p = path.join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p, out); else out.push(p); } return out; };
const files = DIRS.flatMap((d) => { try { return walk(path.join(root, d)); } catch { return []; } });
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

let parsed = 0;
for (const f of files.filter((x) => /\.(m|c)?js$/.test(x))) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${rel(f)} does not parse:\n${(r.stderr || '').split('\n').slice(0, 6).join('\n')}`);
  parsed++;
}
let jsons = 0;
for (const f of files.filter((x) => x.endsWith('.json'))) { try { JSON.parse(readFileSync(f, 'utf8')); jsons++; } catch (e) { problems.push(`${rel(f)} is not valid JSON: ${e.message}`); } }

const testFiles = readdirSync(path.join(root, 'tests'));
for (const f of testFiles.filter((x) => /\.(test\.js|mjs)$/.test(x))) {
  const src = readFileSync(path.join(root, 'tests', f), 'utf8');
  if (/\b(test|it|describe)\.only\s*\(|\{\s*only\s*:\s*true\s*\}/.test(src)) problems.push(`tests/${f} focuses a test with .only: the other tests would be skipped.`);
}
const uiRunner = readFileSync(path.join(root, 'scripts', 'run-ui-tests.mjs'), 'utf8');
for (const f of testFiles.filter((x) => /^ui-.*\.mjs$/.test(x))) if (!uiRunner.includes(`'${f}'`)) problems.push(`tests/${f} is a browser suite but scripts/run-ui-tests.mjs does not run it.`);
const runner = readFileSync(path.join(root, 'scripts', 'run-tests.mjs'), 'utf8');
if (!/\.test\.js/.test(runner)) problems.push('scripts/run-tests.mjs no longer collects tests/*.test.js.');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const shown = /APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(path.join(root, 'ui', 'screens', 'settings.js'), 'utf8'))?.[1];
if (pkg !== shown) problems.push(`package.json says version ${pkg} but the app shows ${shown} (ui/screens/settings.js APP_VERSION).`);

if (problems.length) { console.error(`CI checks found ${problems.length} problem(s):\n\n${problems.join('\n\n')}`); process.exit(1); }
console.log(`CI checks passed: ${parsed} script files parse, ${jsons} JSON files parse, no focused tests, all suites wired, version ${pkg}.`);
