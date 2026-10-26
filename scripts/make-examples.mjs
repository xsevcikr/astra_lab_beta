// Regenerates the example files in /vehicles, /missions and /simulations with the real AI engineer and physics engine.
//   node scripts/make-examples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiSession } from '../ai/session.js';
import { Project } from '../src/core/project.js';
import { createNodeStorage } from '../src/core/storage.js';
import { playDemo } from '../src/demo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = (rel, obj) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1)); console.log('wrote', rel); };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function session(name) { return new AiSession({ project: new Project(name), storage: null }); }
const dump = (S, prefix) => {
  for (const v of Object.values(S.project.vehicles)) write(`vehicles/${prefix ? prefix + '-' : ''}${slug(v.name)}.vehicle.json`, { format: 'astra.vehicle/1', vehicle: v });
  for (const m of Object.values(S.project.missions)) write(`missions/${prefix ? prefix + '-' : ''}${slug(m.name)}.mission.json`, { format: 'astra.mission/1', mission: m });
};

// 1. launcher + probe (also the demo project: includes the failing variant as a recorded run)
const tmp = fs.mkdtempSync(path.join(root, 'build', 'ex-'));
const storage = await createNodeStorage(tmp);
const S = new AiSession({ project: new Project('Demo'), storage });
await playDemo({ ask: (t) => S.send(t), approve: () => S.approve() });
const failedRun = S.project.runs.find((r) => r.status === 'FAILURE');
const saved = await S.api.execute('SAVE_PROJECT', {});
const dir = S.project.dir;
dump(S, '');
if (failedRun) {
  const src = path.join(tmp, dir, 'simulations', failedRun.id), dst = path.join(root, 'simulations', 'example-underfuelled-launch');
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  console.log('wrote simulations/example-underfuelled-launch');
}
fs.rmSync(tmp, { recursive: true, force: true });

// 2. rover, lander
for (const [prompt, prefix] of [['Build me a rover for Mars', 'example'], ['Build me a lunar lander', 'example']]) {
  const T = await session(prefix); await T.send(prompt); await T.send('yes');
  if (T.project.vehicle) dump(T, prefix); else console.log('no vehicle for', prompt);
}
