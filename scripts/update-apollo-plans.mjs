// Re-plan the ready-made Apollo-style Moon rocket (flies the real Saturn V ascent in the simulator, then searches the launch window with
// patched-conic maths) and rewrite data/apollo-plans.js. Run after changing the physics, src/vehicles/apollo.js or the planner.
// tests/apollo.test.js fails when the stored plan is out of date.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApolloStack } from '../src/vehicles/apollo.js';
import { planApolloMission } from '../src/missions/apollo.js';

const plan = planApolloMission(buildApolloStack());
console.log(JSON.stringify(plan));
const text = `// Stored launch plan of the ready-made Apollo-style Moon rocket (data/templates.js). Written by scripts/update-apollo-plans.mjs; do not edit by hand.
// A plan is the launch epoch and the burn start found by flying the Saturn V ascent in the real simulator and searching the Earth-Moon launch window.
// tests/apollo.test.js re-plans the rocket and fails when these numbers have drifted, then flies the stored plan.
export const APOLLO_PLANS = { default: ${JSON.stringify(plan, null, 2)} };
`;
writeFileSync(fileURLToPath(new URL('../data/apollo-plans.js', import.meta.url)), text);
console.log('written data/apollo-plans.js');
