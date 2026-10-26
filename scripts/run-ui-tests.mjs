// Runs every browser-level UI test in sequence (needs Playwright + Chromium). In CI (env CI set) a missing Playwright is an error,
// so a broken install can never turn the suites into silent skips.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.CI) { try { createRequire(import.meta.url).resolve('playwright'); } catch { console.error('Playwright is not installed: the UI suites cannot run in CI.'); process.exit(1); } }
let bad = 0;
for (const f of ['ui-engineering.mjs', 'ui-smoke.mjs', 'ui-simple-builder.mjs', 'ui-challenges.mjs', 'ui-needs.mjs', 'ui-flightdata.mjs', 'ui-shell.mjs', 'ui-consistency.mjs', 'ui-levels.mjs', 'ui-guides.mjs', 'ui-autofix.mjs', 'ui-layout.mjs', 'ui-teach.mjs', 'ui-pro.mjs', 'ui-v2.mjs', 'ui-v21.mjs']) { console.log(`\n=== ${f}`); const r = spawnSync(process.execPath, [path.join('tests', f)], { cwd: root, stdio: 'inherit' }); if (r.status) bad++; }
process.exit(bad ? 1 : 0);
