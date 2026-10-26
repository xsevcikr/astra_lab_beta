// Headless demo (no window): the complete mandatory conversation with the AI engineer, on the real physics engine.
//   node scripts/run-demo.mjs [output-folder]
// Writes the project (JSON + recorded telemetry) and the PDF report of the first failing run into the output folder.
import path from 'node:path';
import fs from 'node:fs';
import { AiSession } from '../ai/session.js';
import { Project } from '../src/core/project.js';
import { createNodeStorage } from '../src/core/storage.js';
import { playDemo, DEMO_NAME } from '../src/demo.js';
import { buildReport, reportToPDF } from '../src/core/report.js';

const out = path.resolve(process.argv[2] ?? 'astra-demo-output');
fs.mkdirSync(out, { recursive: true });
const storage = await createNodeStorage(out);
const S = new AiSession({ project: new Project(DEMO_NAME), storage });
const show = (who, text) => console.log(`\n${who}: ${text.length > 1400 ? text.slice(0, 1400) + ' …' : text}`);
const t0 = Date.now();

await playDemo({
  ask: async (t) => { show('YOU', t); const r = await S.send(t); show('ENGINEER', r.text); return r; },
  approve: async () => { show('YOU', 'yes, apply it'); const r = await S.approve(); show('ENGINEER', r.text); return r; },
});
for (const step of ['Why did it fail?', 'Fix it.', 'yes, apply it', 'Test it.']) { show('YOU', step); const r = await S.send(step); show('ENGINEER', r.text); }

const runs = S.project.runs.map((r) => `${r.id} ${r.status} (${r.reason})`);
console.log('\nRecorded runs:\n  ' + runs.join('\n  '));
const saved = await S.api.execute('SAVE_PROJECT', {});
console.log('\n' + saved.message);
const failed = S.project.runs.find((r) => r.status === 'FAILURE');
if (failed) {
  const { record, telemetry } = await S.api.getRun(failed.id);
  const pdf = reportToPDF(buildReport(record, telemetry));
  fs.writeFileSync(path.join(out, 'failure-report.pdf'), pdf);
  console.log(`Report of the failing run written to ${path.join(out, 'failure-report.pdf')}`);
}
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)} s. Output folder: ${out}`);
