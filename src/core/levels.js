// The four detail levels. They change PRESENTATION only (what is shown and how it is explained), never a simulation result.
export const LEVELS = ['beginner', 'student', 'engineer', 'expert'];
export const LEVEL_NAMES = { beginner: 'Beginner', student: 'Student', engineer: 'Engineer', expert: 'Expert' };
export const LEVEL_HINTS = {
  beginner: 'Plain words, analogies and big numbers.',
  student: 'Adds formulas with your own numbers.',
  engineer: 'Adds budgets, ratios, plots and sensitivity.',
  expert: 'Raw data, editable physics options, export.',
};
const LEGACY = { standard: 'student', advanced: 'expert' };
/** Any stored or typed value -> one of the four levels (old 'standard' -> student, old 'advanced' -> expert). */
export function normalizeLevel(m) { const x = String(m ?? '').toLowerCase(); return LEVELS.includes(x) ? x : LEGACY[x] ?? 'beginner'; }
export const levelRank = (m) => LEVELS.indexOf(normalizeLevel(m));
/** True when `mode` is at least `min` (e.g. atLeast(app.settings.mode, 'engineer')). */
export const atLeast = (mode, min) => levelRank(mode) >= levelRank(min);
