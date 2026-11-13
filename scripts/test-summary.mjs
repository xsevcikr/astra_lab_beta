// Turns the JUnit and LCOV files written by the Node test runner into a short Markdown summary for the CI job page (2.9).
//   node scripts/test-summary.mjs test-results/junit.xml test-results/lcov.info >> "$GITHUB_STEP_SUMMARY"
import { readFileSync, existsSync } from 'node:fs';
const [junit, lcov] = process.argv.slice(2);
const L = ['## Unit, physics and mission tests', ''];
if (junit && existsSync(junit)) {
  const x = readFileSync(junit, 'utf8');
  const cases = [...x.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)];
  const failed = cases.filter((m) => /<failure\b/.test(m[3] ?? '')), skipped = cases.filter((m) => /<skipped\b/.test(m[3] ?? ''));
  const attr = (s, k) => (new RegExp(`${k}="([^"]*)"`).exec(s)?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  L.push(`${cases.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped (${cases.length} tests).`, '');
  if (failed.length) { L.push('Failed:', ''); for (const m of failed.slice(0, 30)) L.push(`- ${attr(m[1], 'name')} (${attr(m[1], 'file').split(/[\\/]/).pop() || attr(m[1], 'classname')})`); L.push(''); }
  const slow = cases.map((m) => [attr(m[1], 'name'), +attr(m[1], 'time')]).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (slow.length) L.push(`<details><summary>Slowest tests</summary>\n\n${slow.map(([n, t]) => `- ${t.toFixed(1)} s: ${n}`).join('\n')}\n</details>`, '');
} else L.push('No JUnit report was written.', '');
if (lcov && existsSync(lcov)) {
  const per = {}; let file = null, lf = 0, lh = 0;
  for (const ln of readFileSync(lcov, 'utf8').split('\n')) {
    // LF and LH may come in either order inside a record
    if (ln.startsWith('SF:')) { file = ln.slice(3).replace(/\\/g, '/').replace(/^.*?\/(src|physics|mission|ai|data)\//, '$1/'); per[file] = { lf: 0, lh: 0 }; }
    else if (ln.startsWith('LF:') && per[file]) { const n = +ln.slice(3); lf += n; per[file].lf = n; }
    else if (ln.startsWith('LH:') && per[file]) { const n = +ln.slice(3); lh += n; per[file].lh = n; }
  }
  const top = {}; for (const [f, v] of Object.entries(per)) { const k = f.split('/')[0]; (top[k] ??= { lf: 0, lh: 0 }); top[k].lf += v.lf; top[k].lh += v.lh; }
  L.push(`Line coverage of the code the tests load: **${lf ? ((100 * lh) / lf).toFixed(1) : '0'} %** (${lh} of ${lf} lines).`, '', '| Folder | Lines covered |', '|---|---|');
  for (const [k, v] of Object.entries(top).sort()) L.push(`| ${k} | ${v.lf ? ((100 * v.lh) / v.lf).toFixed(1) : '-'} % |`);
  L.push('');
}
console.log(L.join('\n'));
