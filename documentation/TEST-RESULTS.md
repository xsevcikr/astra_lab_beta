# Automated test results

Version 1.3.0. Recorded on 2026-09-30, Linux container, Node v22.22.2, headless Chromium (Playwright, SwiftShader software WebGL).

Commands: `npm test` (= `node scripts/run-tests.mjs`) and `npm run test:ui` (= `node tests/ui-smoke.mjs`).

## Summary

| Suite | Passed | Failed |
|---|---|---|
| Unit and integration tests (physics, vehicles, missions, failure detection, AI engineer, storage, reports, debris, Monte Carlo, designer drag rules, Electron main process with a mock Electron) | 71 | 0 |
| UI smoke test (real UI in headless Chromium, mandatory conversation flow, mouse editing in the designer, plus Beginner mode, Academy, designer view tools, scrolling) | 42 + 35 (simple builder, planner) + 19 (challenges, readiness review, flight ribbon) | 0 |

## What was NOT tested here

- The real Electron shell and the Windows installer. Electron and npm downloads are blocked in the build container, so the main process is tested only against a mock Electron (`tests/electron-main.test.js`). The launcher `START-ASTRA-LAB.bat` and `CREATE-DESKTOP-SHORTCUT.bat` are Windows batch files that could not be run here; the app itself was run from the extracted folder in a Chromium-based browser with the same flags the launcher uses.
- The optional online AI provider, tested only against mock HTTP servers.

## Unit and integration tests (71)

```
PASS 1 - NLU: quantities, intents and entities
PASS 2 - the 20 required tools exist with JSON schemas
PASS 3 - safety: unknown tools, bad arguments, path traversal and prototype pollution are refused without side effects
PASS 4 - safety: requests for commands, files, installs or secrets are not turned into actions
PASS 5 - MANDATORY: "Build me a two-stage rocket carrying a 100 kg space probe." → "Test it." → "Why did it fail?" → "Fix it."
PASS 6 - MANDATORY (failing variant): fail → diagnose from telemetry → propose fix → approve → re-simulate → compare shows the improvement
PASS 7 - "keep trying until it works" authorises a bounded automatic loop
PASS 8 - approve / edit / cancel / undo / redo / version history
PASS 9 - honesty: no run yet → no results are made up
PASS 10 - vehicles other than rockets: rover, lander with rover, probe, satellite; Mars lander is flagged as limited
PASS 11 - experiments, telemetry questions, concepts, save / load and export
PASS 12 - online AI (anthropic wire format): tools only, design steps become an approval proposal, key comes from getKey
PASS 13 - online AI (OpenAI-compatible format) and graceful fallback to the offline engineer
PASS 14 - no API key is hard-coded anywhere in the source tree
PASS 15 - Monte Carlo reliability study through the AI engineer: real simulations, honest statistics
PASS 16 - storage refuses path traversal and absolute paths
PASS 17 - project save / load round trip on disk, with runs, telemetry and version history
PASS 18 - undo / redo restore exact design states; bundle export / import
PASS 19 - recording is reproducible bit-for-bit; replay controls work between 0.1x and 100x
PASS 20 - reports: HTML, valid PDF, CSV
PASS 21 - experiment lab: parameter sweep runs real simulations and compares them
PASS 22 - the report lists where the spent stage and the fairing come down, and what stays in orbit
PASS 23 - debris in vacuum conserves orbital energy and closes its orbit after one period
PASS 24 - drag lowers a low orbit and the object eventually reenters and hits the ground
PASS 25 - a heavier object with the same area decays more slowly (ballistic coefficient)
PASS 26 - tumbling mean projected area is a quarter of the surface area
PASS 27 - a real two-stage launch records its jettisoned stages, which fall back to Earth
PASS 28 - editing a tank length through the handle changes propellant, mass and length consistently
PASS 29 - diameter handle respects the limits and keeps the propellant volume
PASS 30 - sliding a stack part past its neighbour swaps them, inside the same stage only
PASS 31 - capabilities: rovers have no handles, nose cone can be resized, engines only slide
PASS 32 - validation still runs after mouse edits (no silent corruption)
PASS 33 - main process starts, uses the data folder and opens the app:// page
PASS 34 - disk bridge: reads and writes inside the data folder
PASS 35 - disk bridge: path traversal, absolute paths and drive letters are rejected
PASS 36 - app:// protocol serves only the allow-listed folders and file types
PASS 37 - AI network bridge: https and localhost only
PASS 38 - secret store: encrypted file outside the projects folder, removable
PASS 39 - two-stage launcher puts a 100 kg probe into a 200 km orbit
PASS 40 - lunar powered descent lands softly within the leg rating
PASS 41 - an under-fuelled lander is detected as a failure with a cause
PASS 42 - lander deploys a rover which drives on its own
PASS 43 - rover traverse on Mars consumes energy and completes
PASS 44 - simulation is deterministic
PASS 45 - seeded generator is reproducible and roughly standard normal
PASS 46 - Wilson interval, percentiles and correlation match textbook values
PASS 47 - kind-wide parameter paths scale every matching component
PASS 48 - Monte Carlo on a real launcher: reproducible, and a large propellant shortfall is the driver of failures
PASS 49 - surface gravity of Earth, Moon and Mars equals GM/R^2
PASS 50 - simulated gravitational acceleration matches GM/r^2 on Earth, Moon and Mars
PASS 51 - free fall from rest follows the exact radial Kepler solution (airless Earth)
PASS 52 - constant thrust in gravity-free space: rocket equation dv = Isp g0 ln(m0/m) (Tsiolkovsky)
PASS 53 - propellant depletion: engine stops when the tanks are empty and mass equals dry mass
PASS 54 - drag: velocity of a falling body follows v = vt tanh(g t / vt) with terminal speed vt = sqrt(2 m g / (rho CdA))
PASS 55 - circular orbit: period, constant radius, energy and angular momentum conserved
PASS 56 - elliptical orbit: matches the analytic Kepler propagator, conserves energy and angular momentum, period = 2 pi sqrt(a^3/mu)
PASS 57 - orbital elements <-> state vectors and Hohmann transfer (textbook LEO -> GEO)
PASS 58 - atmosphere models: U.S. Standard Atmosphere 1976 and Mars reference values
PASS 59 - staging: separation conserves velocity (momentum), removes exactly the stage mass, and the upper stage keeps flying
PASS 60 - vehicle mass properties: mass and centre of gravity are the sums over components
PASS 61 - determinism: identical inputs give bit-identical results
PASS 62 - sphere-of-influence radii (Laplace) match published values
```

Totals: tests 62, pass 62, fail 0, skipped 0.

## UI smoke test (42)

```
PASS  application starts
PASS  screen "home" opens (empty project)
PASS  screen "designer" opens (empty project)
PASS  screen "planner" opens (empty project)
PASS  screen "simulation" opens (empty project)
PASS  screen "control" opens (empty project)
PASS  screen "telemetry" opens (empty project)
PASS  screen "replay" opens (empty project)
PASS  screen "analysis" opens (empty project)
PASS  screen "ai" opens (empty project)
PASS  screen "experiments" opens (empty project)
PASS  screen "projects" opens (empty project)
PASS  screen "settings" opens (empty project)
PASS  AI shows a proposal with Approve / Edit / Cancel
PASS  approved design exists
PASS  "Test it." recorded a real simulation
PASS  Run button records a second simulation
PASS  live simulation advances
PASS  stopping a live run records it
PASS  replay plays
PASS  replay scrubbing works
PASS  analysis shows a verdict
PASS  telemetry draws graphs
PASS  designer: length handle stretches the tank  2.74 -> 4.80 m
PASS  designer: one undo restores the drag edit
PASS  designer: dragging the part reorders it inside its stage  index 1 -> 2
PASS  project saved
PASS  no page errors
UI smoke test: 42 passed, 0 failed
```

## Version 1.4.0
- Unit tests: 100 / 100 pass (`node scripts/run-tests.mjs`).
- Browser tests (`node scripts/run-ui-tests.mjs`, headless Chromium with software GL): smoke 42, simple builder 36, challenges 19, needs 16, flight data 22, shell 19, guides 20, all pass.

## Version 1.5.0
- Unit tests: 181 / 181 pass.
- Browser tests (headless Chromium, software GL): smoke 42, simple builder 36, challenges 19, needs 16, flight data 22, shell 19, guides 20, autofix 10, consistency 10, levels 36, layout 480 screen layouts clean (14+6 screens x 4 window sizes x modes), teach 32, pro 39 - all pass.

## Version 1.6.0
- Unit tests: 183 / 183 pass. Browser tests all pass (ui-smoke 42, simple builder 36, challenges 19, teach 32, pro 39, layout clean, and the others).
- Graphics were checked only with software rendering in a container (about 0.5 s per frame there).
