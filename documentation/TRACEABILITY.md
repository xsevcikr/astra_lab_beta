# Requirements traceability

Mission requirements > **Traceability** (Engineer mode) shows, for the selected run:

* **Mission need** (MN-1), from the objective in the Planner, at the top of the tree.
* Every requirement of the checklist written as a "shall" statement, with its **subsystem**, its **verification method** (T = test by
  simulated flight, A = analysis from the design, I = inspection, D = demonstration, as in the NASA Systems Engineering Handbook) and
  where it came from (ASTRA LAB default or added by the user).
* **Allocation**: the parts of the flown vehicle each requirement depends on, from the part types (engines and tanks for delta-v, exposed
  rated structure for dynamic pressure, parts with a g rating for acceleration, thermal hardware, power, mobility...).
* **Evidence**: the measured value, its margin, and the telemetry channel and time it was taken from. Nothing is typed in: every status
  comes from the recorded run, as on the checklist.
* **Coverage**: verified / failed / not verified / waived, how many parts trace to at least one requirement, and the parts that trace to
  none (orphans).
* **Check all runs of this vehicle**: evaluates the same requirements on up to 25 recorded runs and adds a history column.
* **Change impact**: pick an earlier run; the screen lists the parts added, removed or changed (and which fields), mission and
  environment changes, and which requirements must be checked again and why.

Exchange: *Matrix (CSV)*, *Markdown* (for a design review) and *ReqIF* 1.2 (opens in IBM DOORS Next, Siemens Polarion, Jama Connect,
Capella and Eclipse ReqIF Studio). *Import requirements (CSV)* reads a spreadsheet with the columns `id` or `metric`, `op`, `limit`
(in the unit the app shows), `label`, `enabled`: a row with the id of a default requirement changes its limit, other rows become custom
requirements.

Code: `src/core/traceability.js`; tests: `tests/traceability.test.js`, `tests/ui-v29.mjs`.
