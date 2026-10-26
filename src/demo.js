// Demo project: a real conversation with the AI engineer, played through the same code as the interactive chat.
//   1. "Build me a two-stage rocket carrying a 100 kg space probe."  -> proposal, approved
//   2. "Test it."                                                     -> a real simulation (usually SUCCESS)
//   3. "Reduce the second stage propellant by 50%."                    -> proposal (a deliberately under-fuelled variant), approved
//   4. "Test it."                                                     -> a real simulation that FAILS: failure detection, cause, evidence
// The project is left in the failed state so that the user can continue with "Why did it fail?" and "Fix it."
// Nothing is pre-recorded: every number comes from the physics engine when the demo is created.
export const DEMO_NAME = 'Demo - two-stage launcher and 100 kg probe';
export const DEMO_STEPS = [
  { say: 'Build me a two-stage rocket carrying a 100 kg space probe.', label: 'Designing the launcher' },
  { approve: true, label: 'Applying the design' },
  { say: 'Test it.', label: 'Flying the first simulation' },
  { say: 'Reduce the second stage propellant by 50%.', label: 'Creating an under-fuelled variant' },
  { approve: true, label: 'Applying the change' },
  { say: 'Test it.', label: 'Flying the under-fuelled variant (failure detection)' },
];

/** @param ask async (text) => reply   @param approve async () => reply */
export async function playDemo({ ask, approve, onStep = () => {} }) {
  const replies = [];
  for (let i = 0; i < DEMO_STEPS.length; i++) {
    const s = DEMO_STEPS[i]; onStep({ index: i, total: DEMO_STEPS.length, label: s.label });
    replies.push(s.approve ? await approve() : await ask(s.say));
  }
  return replies;
}
