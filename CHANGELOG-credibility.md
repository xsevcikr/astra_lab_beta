# Credibility page: real flights with error bars

New screen **Study → Credibility** ("Can I trust it?"), also reachable from the Validation screen.

## What it does
* **Error bars on both sides.** Every published number now has a 1-sigma uncertainty with a one-line reason (rounding, pre-flight nominal vs flown, family value, pages that disagree, flight-to-flight spread): `data/validation-uncertainty.js`. The simulator's error bar comes from flying each rocket 24 more times with dispersed thrust, Isp, propellant load, dry mass and air density (`src/core/credibility.js`).
* **A real verdict instead of a ±10 % band.** z = (simulator − real) / combined sigma. Inside 2 sigma: consistent; 2 to 3: tension; above 3: a model error the uncertainties cannot explain, with an estimate of its size.
* **Only predictions count.** Each row has a role: prediction, consistency check, calibrated (tuned to match), guidance target, set by the plan, build check, code verification. Only predictions go into the headline.
* **Failures up front.** Failed nominal flights, fragile flights (few dispersed runs succeed) and every inconsistent prediction are listed first, in red or amber.
* **Credibility scores** for the eight NASA-STD-7009A factors (simplified, self-assessed with fixed rules, not an official NASA assessment), each with its evidence and what would raise it.
* "Fly again" recomputes one rocket live with 8 dispersed flights.

## Results (2026-11-13, `documentation/CREDIBILITY.md`)
* 7 of 16 independent predictions are inside their error bars, 2 in tension, 7 inconsistent. The old band calls 70 of 76 rows a match.
* 6 of 9 nominal rocket flights succeed (Atlas V, Vega and PSLV fail; Atlas V and PSLV are in orbit but the mission does not end cleanly).
* Clear model errors: Saturn V S-II and S-IVB cutoff times (+5.5 %, +9.6 %), New Shepard top speed (+31 %), Curiosity touchdown (−10 %), Apollo entry-to-splashdown (−7 %), Apollo LOI burn (−1.8 %).
* Robustness is the weakest factor: fitted pitch tables and the end-of-mission logic break with small input changes, and every rocket flies its published maximum payload with no reserve.
* Fixed a stale note: the Apollo TEI row said the model plans the 59.9 h trip home; since 2.7 it plans 70 h.

## Re-run after physics or data changes
`node scripts/update-credibility.mjs` (about 5 minutes). Tests: `tests/credibility.test.js`, `tests/ui-credibility.mjs`.
