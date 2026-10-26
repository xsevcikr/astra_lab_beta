// Fit a time-tagged pitch programme so that a validation vehicle reaches its published target orbit.
// This is how real launchers are flown (pre-computed pitch tables), but the numbers it produces are NOT published data:
// they are fitted by this script and are labelled "fitted" in the Validation page.
// Usage: node scripts/validation-fit.mjs <falcon-9|electron|saturn-v> [rounds]
import { VALIDATION_VEHICLES, runValidationFlight } from '../src/core/validation.js';

const id = process.argv[2];
const rounds = +(process.argv[3] ?? 6);
const V = VALIDATION_VEHICLES.find((x) => x.id === id);
if (!V) throw new Error('unknown vehicle ' + id);
const knots = V.pitchProgram.knots;               // times [s]
let vals = process.env.FROM_FLIGHT ? V.flight.pitch.map((r) => r[1]) : V.pitchProgram.values.slice(); // pitch angles [deg]; FROM_FLIGHT=1 refines the table in use
const free = knots.map((_, i) => i).filter((i) => i >= (V.pitchProgram.freeFrom ?? 2));
const score = (vv) => {
  const r = runValidationFlight(id, { pitchTable: knots.map((t, i) => [t, vv[i]]), quick: true, payloadKg: process.env.PAY ? +process.env.PAY : undefined });
  return r.fitError;
};
let best = score(vals), step = +(process.env.STEP ?? 6);
console.log('start', best.toFixed(1), JSON.stringify(vals));
for (let round = 0; round < rounds; round++) {
  let improved = false;
  for (const i of free) {
    for (const d of [step, -step]) {
      const t = vals.slice(); t[i] = Math.max(-20, Math.min(90, t[i] + d));
      const s = score(t);
      if (s < best - 1e-9) { best = s; vals = t; improved = true; console.log('round', round, 'knot', knots[i], '->', t[i], 'err', best.toFixed(1)); break; }
    }
  }
  if (!improved) step /= 2;
  if (best < 15) break;
}
console.log('FINAL', best.toFixed(2), JSON.stringify(knots.map((t, i) => [t, Math.round(vals[i] * 10) / 10])));
