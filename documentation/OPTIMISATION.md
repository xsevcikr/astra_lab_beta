# Optimiser: trajectory and design-trade optimisation

Menu: **Study → Optimiser** (Beginner mode: *More tools → Make it better*). Code: `src/optimize/`, screen `ui/screens/optimize.js`.
Tests: `tests/optimize.test.js` (node) and `tests/ui-optimize.mjs` (browser).

## 1. Launch path (`src/optimize/ascent.js`)
Tunes the current rocket's ascent guidance by **flying it in the full simulator** (same physics as *Launch it*).

| Variable | Meaning | Range |
|---|---|---|
| `kickAngle` | pitch-over angle after the vertical rise | 0.5 to 10 deg |
| `schedule.hF` | altitude where the flight path reaches its final angle | 40 to 260 km |
| `schedule.n` | shape of the flight-path schedule (small = turns early) | 0.2 to 1.2 |
| `schedule.gammaEnd` | final flight-path angle | 0 to 10 deg |

- **Objective:** most propellant left in the last stage when the payload leaves it (shown also as a delta-v reserve).
- **Constraints:** the mission's orbit objective must be met. Max dynamic pressure is capped by default at 10 % above the
  mission's own path (a path that saves propellant by flying into thicker air is not "better"); a fixed cap or no cap can be
  chosen, plus an optional peak-acceleration cap.
- **Search:** bounded Nelder-Mead simplex started from the mission's current settings, so the result is never worse than
  the mission as it is. Failed flights are ranked by how far the periapsis fell short, so the search can climb out of a
  failing region.
- **Robustness check:** the best path is flown again with every setting nudged by ±2 % of its range. If a nudged flight
  misses the orbit the result is flagged as a knife edge, and a *safer path* halfway back to the mission's own settings is
  flown and offered if it still gains.
- **Save:** writes the settings into the active mission (one undo step).

Typical result: the *Small launcher* template keeps about 101 kg in its second stage with the stored path; the optimiser finds
8 to 18 kg more within the max-Q cap in 15 to 30 flights (about 1 s each).

## 2. Transfer burns (`src/optimize/transfer.js`)
- **Orbit to orbit:** circular → circular with an inclination change. Compares a separate plane change, the whole turn in
  either Hohmann burn, the **optimal split between both Hohmann burns**, and a **bi-elliptic transfer with optimised
  apoapsis and three-way plane-change split** (multi-start Nelder-Mead). Checks: LEO 300 km → GEO = 3893 m/s; bi-elliptic
  wins only well above the radius-ratio crossover; a bi-elliptic with apoapsis at the target orbit equals the Hohmann.
- **Planet to planet:** porkchop grid of Lambert transfers on the ephemeris (5-day cells), the best local minima refined by
  Nelder-Mead in (departure date, flight time). Minimise C3, departure burn or total delta-v. It flags an optimum on the
  edge of the date range (window just passed or still coming). Matches `findTransferWindows` to within 0.5 % in C3.

## 3. Staging (`src/optimize/staging.js`)
- **Optimal staging** (Lagrange multiplier closed form, Curtis §11.6): the delta-v split between N stages that gives the
  lightest rocket for a payload, from each stage's Isp and structural coefficient. Verified against a brute-force
  numerical optimum to 1e-5.
- **Your rocket against the optimum:** reads Isp, structure ratio and delta-v per stage from the current vehicle and shows
  the same total delta-v split optimally: gross mass for the same payload, payload at the same gross mass.
- **Staging trade:** 1 to 4 stages × kerosene, methane, hydrogen, kerosene + hydrogen upper stages, solid (typical Isp and
  structure values, not specific engines) plus your own engines; each optimally staged. Pareto set on gross mass, dry mass
  (stand-in for cost) and number of stages.

## Limitations
- The launch-path optimiser tunes the `ascent` guidance law only (missions with `pitch_program` or no orbit goal are refused
  with a reason). It is a local search: a different start can find a different optimum.
- Transfer burns are impulsive; finite-burn losses, waiting for a node crossing and lunar perturbations of very high
  bi-elliptic apoapses are not included (the page says so when it matters).
- Staging uses the ideal rocket equation with constant structure ratio; engines do not shrink with the stage and
  thrust-to-weight is not checked, so real gains are smaller. Check a changed design in the Test bench.
