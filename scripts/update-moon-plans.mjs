// Re-plan the two ready-made Moon rockets (flies each ascent in the real simulator, then searches the launch window) and rewrite data/moon-plans.js.
// Run this after changing the physics, the rocket numbers in src/vehicles/moonship.js or the planner. tests/moonrocket.test.js fails when the stored plans are out of date.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildMoonRocket } from '../src/vehicles/moonship.js';
import { planMoonMission } from '../src/missions/moon.js';
import { MOON_VARIANTS } from '../src/vehicles/moonship.js';

const out = {};
for (const [id, spec] of Object.entries(MOON_VARIANTS)) {
  const v = buildMoonRocket(spec);
  out[id] = planMoonMission(v);
  console.log(id, JSON.stringify(out[id]));
}
const text = `// Stored launch plans of the ready-made Moon rockets (data/templates.js). Written by scripts/update-moon-plans.mjs; do not edit by hand.
// A plan is the launch epoch and the burn start found by flying the ascent in the real simulator and searching the Earth-Moon launch window.
// tests/moonrocket.test.js re-plans both rockets and fails when these numbers have drifted, then flies the stored plan to a landing.
export const MOON_PLANS = ${JSON.stringify(out, null, 2)};
`;
writeFileSync(fileURLToPath(new URL('../data/moon-plans.js', import.meta.url)), text);
console.log('written data/moon-plans.js');
