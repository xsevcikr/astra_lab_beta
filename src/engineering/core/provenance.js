// Every number ASTRA LAB shows carries a model label so the user knows how far to trust it.
export const MODEL = Object.freeze({
  PHYSICS: 'physics',             // first-principles equations integrated from the simulation state
  APPROXIMATION: 'approximation', // engineering correlation or reduced-order model with known error
  SIMPLIFICATION: 'simplification', // educational model that leaves out effects on purpose
  VISUAL: 'visual-only',          // rendering aid, never fed back into physics or reports
});

export const MODEL_NOTES = {
  [MODEL.PHYSICS]: 'Integrated from equations of motion or conservation laws.',
  [MODEL.APPROXIMATION]: 'Engineering correlation; expect errors of several percent or more.',
  [MODEL.SIMPLIFICATION]: 'Teaching model; leaves out effects listed in its note.',
  [MODEL.VISUAL]: 'Display only. Not used in any calculation.',
};

// Attach a provenance tag to a result object without changing its fields.
export function tagged(model, note, value) {
  if (!Object.values(MODEL).includes(model)) throw new Error(`unknown model label ${model}`);
  return Object.assign(value, { _model: { model, note } });
}

export const modelOf = (v) => (v && v._model) || null;
